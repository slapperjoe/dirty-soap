use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;

use anyhow::{Context, Result};
use bytes::Bytes;
use chrono::Utc;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use tauri::AppHandle;
use tokio::net::TcpListener;
use uuid::Uuid;

use crate::mock::state::SharedMockState;
use crate::proxy_models::{MockMatchCondition, MockRule, TrafficEvent};
use crate::utils::{emit_traffic_event, match_pattern, read_body, XPathEvaluator, CONTENT_TYPE_XML, CONTENT_TYPE_PLAIN};

/// Run the mock HTTP server. Loops forever; cancel via AbortHandle.
pub async fn run_mock(state: SharedMockState, app: AppHandle) -> Result<()> {
    let port = state.lock().await.config.port;
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse()?;
    let listener = TcpListener::bind(addr)
        .await
        .with_context(|| format!("Failed to bind mock server to port {}", port))?;

    log::info!("[Mock] Listening on port {}", port);

    loop {
        let (stream, _peer) = match listener.accept().await {
            Ok(v) => v,
            Err(e) => {
                log::error!("[Mock] Accept error: {}", e);
                continue;
            }
        };

        let io = TokioIo::new(stream);
        let state = state.clone();
        let app = app.clone();

        tokio::spawn(async move {
            let svc = service_fn(move |req: Request<Incoming>| {
                let state = state.clone();
                let app = app.clone();
                async move { Ok::<_, Infallible>(handle_mock_request(req, state, app).await) }
            });

            if let Err(e) = hyper::server::conn::http1::Builder::new()
                .preserve_header_case(true)
                .title_case_headers(true)
                .serve_connection(io, svc)
                .await
            {
                log::debug!("[Mock] Connection closed: {:?}", e);
            }
        });
    }
}

async fn handle_mock_request(
    req: Request<Incoming>,
    state: SharedMockState,
    app: AppHandle,
) -> Response<Full<Bytes>> {
    let start = std::time::Instant::now();
    let event_id = Uuid::new_v4().to_string();
    let method = req.method().to_string();
    let url = req.uri().to_string();

    let req_headers: HashMap<String, String> = req
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
        .collect();

    let max_body_bytes = {
        let s = state.lock().await;
        s.config.max_body_bytes
    };

    let body_bytes = match read_body(req.into_body(), max_body_bytes).await {
        Ok(b) => b.into_bytes().await.unwrap_or_default(),
        Err(e) => {
            log::warn!("[Mock] Failed to read body: {}", e);
            return plain_response(StatusCode::BAD_GATEWAY, "Failed to read request body");
        }
    };
    let raw_body_bytes = body_bytes;
    let req_body = String::from_utf8_lossy(&raw_body_bytes).into_owned();

    // Snapshot config under lock, then release before any async I/O
    let (rules, passthrough_enabled, target_url, record_mode) = {
        let s = state.lock().await;
        (
            s.config.rules.clone(),
            s.config.passthrough_enabled,
            s.config.target_url.clone(),
            s.config.record_mode,
        )
    };

    // Find first matching rule
    let matched = find_matching_rule(&rules, &method, &url, &req_headers, &req_body);

    if let Some(rule) = matched {
        // Optional delay
        if let Some(delay) = rule.delay_ms {
            if delay > 0 {
                tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
            }
        }

        // Increment hit count in shared state
        {
            let mut s = state.lock().await;
            if let Some(r) = s.config.rules.iter_mut().find(|r| r.id == rule.id) {
                r.hit_count += 1;
            }
        }

        let status = rule.status_code;
        let content_type = rule
            .content_type
            .clone()
            .unwrap_or_else(|| CONTENT_TYPE_XML.to_string());
        let resp_body = rule.response_body.clone();

        let mut resp_headers: HashMap<String, String> = rule
            .response_headers
            .clone()
            .unwrap_or_default();
        resp_headers
            .entry("content-type".to_string())
            .or_insert(content_type);

        let duration_ms = start.elapsed().as_millis() as u64;
        let now = Utc::now();
        emit_traffic_event(
            &app,
            &TrafficEvent {
                id: event_id,
                timestamp: now.timestamp_millis(),
                timestamp_label: now.to_rfc3339(),
                method,
                url,
                request_headers: req_headers,
                request_body: req_body,
                status: Some(status),
                response_headers: Some(resp_headers.clone()),
                response_body: Some(resp_body.clone()),
                duration_ms: Some(duration_ms),
                matched_rule: Some(rule.name.clone()),
                passthrough: Some(false),
                source: "mock".to_string(),
            },
            "Mock",
        );

        let mut hb = Response::builder().status(status);
        for (k, v) in &resp_headers {
            hb = hb.header(k.as_str(), v.as_str());
        }
        let body_bytes = Bytes::from(resp_body);
        hb = hb.header("content-length", body_bytes.len());
        return hb
            .body(Full::new(body_bytes))
            .unwrap_or_else(|_| plain_response(StatusCode::INTERNAL_SERVER_ERROR, "Build error"));
    }

    // No rule matched
    if passthrough_enabled && !target_url.is_empty() {
        return passthrough(method, url, req_headers, req_body, &target_url, event_id, start, &app, record_mode, state).await;
    }

    plain_response(StatusCode::NOT_FOUND, "No matching mock rule")
}

/// Forward an unmatched request to the target URL.
#[allow(clippy::too_many_arguments)]
async fn passthrough(
    method: String,
    url: String,
    req_headers: HashMap<String, String>,
    req_body: String,
    target_url: &str,
    event_id: String,
    start: std::time::Instant,
    app: &AppHandle,
    record_mode: bool,
    state: SharedMockState,
) -> Response<Full<Bytes>> {
    let pq = url.trim_start_matches(|c| c != '/');
    let forward_url = format!("{}{}", target_url.trim_end_matches('/'), pq);

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .build()
        .unwrap();

    let req_method = match reqwest::Method::from_bytes(method.as_bytes()) {
        Ok(m) => m,
        Err(_) => return plain_response(StatusCode::BAD_REQUEST, "Invalid method"),
    };

    let mut rb = client.request(req_method, &forward_url);
    for (k, v) in &req_headers {
        let lk = k.to_lowercase();
        if lk != "host" && lk != "content-length" {
            rb = rb.header(k.as_str(), v.as_str());
        }
    }
    if !req_body.is_empty() {
        rb = rb.body(req_body.clone());
    }

    let (status, resp_headers, resp_body) = match rb.send().await {
        Ok(resp) => {
            let s = resp.status().as_u16();
            let h: HashMap<String, String> = resp
                .headers()
                .iter()
                .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
                .collect();
            let b = resp.bytes().await.unwrap_or_default();
            (s, h, String::from_utf8_lossy(&b).into_owned())
        }
        Err(e) => (502, HashMap::new(), format!("Passthrough error: {}", e)),
    };

    if record_mode {
        record_response(state, &method, &url, status, &resp_headers, &resp_body).await;
    }

    let duration_ms = start.elapsed().as_millis() as u64;
    let now = Utc::now();
    emit_traffic_event(
        app,
        &TrafficEvent {
            id: event_id,
            timestamp: now.timestamp_millis(),
            timestamp_label: now.to_rfc3339(),
            method,
            url,
            request_headers: req_headers,
            request_body: req_body,
            status: Some(status),
            response_headers: Some(resp_headers.clone()),
            response_body: Some(resp_body.clone()),
            duration_ms: Some(duration_ms),
            matched_rule: None,
            passthrough: Some(true),
            source: "mock".to_string(),
        },
        "Mock",
    );

    let mut hb = Response::builder().status(status);
    for (k, v) in &resp_headers {
        let lk = k.to_lowercase();
        if lk != "transfer-encoding" && lk != "content-length" && lk != "connection" {
            hb = hb.header(k.as_str(), v.as_str());
        }
    }
    let body_bytes = Bytes::from(resp_body);
    hb = hb.header("content-length", body_bytes.len());
    hb.body(Full::new(body_bytes))
        .unwrap_or_else(|_| plain_response(StatusCode::INTERNAL_SERVER_ERROR, "Build error"))
}

/// Record a passthrough response as a new (disabled) mock rule.
async fn record_response(
    state: SharedMockState,
    method: &str,
    url: &str,
    status: u16,
    resp_headers: &HashMap<String, String>,
    resp_body: &str,
) {
    use crate::proxy_models::MockMatchCondition;

    let content_type = resp_headers
        .get("content-type")
        .cloned()
        .unwrap_or_else(|| "text/xml".to_string());

    let rule = MockRule {
        id: format!("recorded-{}", Uuid::new_v4()),
        name: format!("{} {} (Recorded)", method, url),
        enabled: false,
        conditions: vec![MockMatchCondition {
            r#type: "url".to_string(),
            pattern: url.to_string(),
            is_regex: false,
            header_name: None,
        }],
        status_code: status,
        response_body: resp_body.to_string(),
        content_type: Some(content_type),
        response_headers: Some(
            resp_headers
                .iter()
                .filter(|(k, _)| {
                    let lk = k.to_lowercase();
                    lk != "content-length" && lk != "transfer-encoding" && lk != "connection"
                })
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
        ),
        delay_ms: None,
        hit_count: 0,
        tags: Vec::new(),
        recorded_at: Some(Utc::now().timestamp_millis()),
        recorded_from: Some(url.to_string()),
    };

    let mut s = state.lock().await;
    s.config.rules.push(rule);
}

// ---------------------------------------------------------------------------
// Rule matching
// ---------------------------------------------------------------------------

pub fn find_matching_rule<'a>(
    rules: &'a [MockRule],
    method: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
) -> Option<&'a MockRule> {
    rules
        .iter()
        .filter(|r| r.enabled)
        .find(|r| all_conditions_match(&r.conditions, method, url, headers, body))
}

fn all_conditions_match(
    conditions: &[MockMatchCondition],
    method: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
) -> bool {
    if conditions.is_empty() {
        return false;
    }
    conditions
        .iter()
        .all(|c| condition_matches(c, method, url, headers, body))
}

fn condition_matches(
    cond: &MockMatchCondition,
    _method: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
) -> bool {
    match cond.r#type.as_str() {
        "url" => match_pattern(url, &cond.pattern, cond.is_regex),

        "operation" | "soapAction" => {
            let action = headers
                .get("soapaction")
                .or_else(|| headers.get("SOAPAction"))
                .map(|s| s.trim_matches('"'))
                .unwrap_or("");
            match_pattern(action, &cond.pattern, cond.is_regex)
        }

        "header" => {
            if let Some(name) = &cond.header_name {
                let val = headers.get(name.to_lowercase().as_str()).map(|s| s.as_str()).unwrap_or("");
                match_pattern(val, &cond.pattern, cond.is_regex)
            } else {
                false
            }
        }

        "contains" => match_pattern(body, &cond.pattern, cond.is_regex),

        "xpath" => XPathEvaluator::evaluate(body, &cond.pattern).is_some(),

        "templateName" => {
            // Match <Property Name="TemplateName">value</Property>
            let escaped = regex::escape(&cond.pattern);
            let pat = format!(
                r#"<Property[^>]*Name="TemplateName"[^>]*>\s*{}\s*</Property>"#,
                escaped
            );
            regex::Regex::new(&pat)
                .map(|re| re.is_match(body))
                .unwrap_or(false)
        }

        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn plain_response(status: StatusCode, msg: &str) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .header("content-type", CONTENT_TYPE_PLAIN)
        .body(Full::new(Bytes::from(msg.to_string())))
        .unwrap()
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proxy_models::{MockMatchCondition, MockRule};

    fn make_rule(conditions: Vec<MockMatchCondition>) -> MockRule {
        MockRule {
            id: "test-rule".to_string(),
            name: "Test Rule".to_string(),
            enabled: true,
            conditions,
            status_code: 200,
            response_body: "<Response/>".to_string(),
            content_type: None,
            response_headers: None,
            delay_ms: None,
            hit_count: 0,
            recorded_at: None,
            recorded_from: None,
            tags: vec![],
        }
    }

    fn cond(r#type: &str, pattern: &str, is_regex: bool) -> MockMatchCondition {
        MockMatchCondition {
            r#type: r#type.to_string(),
            pattern: pattern.to_string(),
            is_regex,
            header_name: None,
        }
    }

    fn header_cond(header_name: &str, pattern: &str) -> MockMatchCondition {
        MockMatchCondition {
            r#type: "header".to_string(),
            pattern: pattern.to_string(),
            is_regex: false,
            header_name: Some(header_name.to_string()),
        }
    }

    fn no_headers() -> HashMap<String, String> { HashMap::new() }

    // --- URL matching ---

    #[test]
    fn url_contains_matches() {
        let rule = make_rule(vec![cond("url", "/api/users", false)]);
        assert!(find_matching_rule(&[rule], "GET", "http://host/api/users/123", &no_headers(), "").is_some());
    }

    #[test]
    fn url_contains_no_match() {
        let rule = make_rule(vec![cond("url", "/api/orders", false)]);
        assert!(find_matching_rule(&[rule], "GET", "http://host/api/users/123", &no_headers(), "").is_none());
    }

    #[test]
    fn url_regex_matches() {
        let rule = make_rule(vec![cond("url", r"/api/users/\d+", true)]);
        assert!(find_matching_rule(&[rule], "GET", "/api/users/42", &no_headers(), "").is_some());
    }

    #[test]
    fn url_regex_no_match() {
        let rule = make_rule(vec![cond("url", r"/api/users/\d+", true)]);
        assert!(find_matching_rule(&[rule], "GET", "/api/users/abc", &no_headers(), "").is_none());
    }

    // --- Disabled rules are skipped ---

    #[test]
    fn disabled_rule_not_matched() {
        let mut rule = make_rule(vec![cond("url", "/api", false)]);
        rule.enabled = false;
        assert!(find_matching_rule(&[rule], "GET", "/api/anything", &no_headers(), "").is_none());
    }

    // --- AND logic: all conditions must match ---

    #[test]
    fn and_logic_both_match() {
        let rule = make_rule(vec![
            cond("url", "/api/users", false),
            cond("contains", "GetUser", false),
        ]);
        assert!(find_matching_rule(&[rule], "POST", "/api/users", &no_headers(), "<GetUser/>").is_some());
    }

    #[test]
    fn and_logic_one_fails() {
        let rule = make_rule(vec![
            cond("url", "/api/users", false),
            cond("contains", "GetOrder", false),
        ]);
        assert!(find_matching_rule(&[rule], "POST", "/api/users", &no_headers(), "<GetUser/>").is_none());
    }

    // --- Empty conditions never match ---

    #[test]
    fn empty_conditions_no_match() {
        let rule = make_rule(vec![]);
        assert!(find_matching_rule(&[rule], "GET", "/anything", &no_headers(), "").is_none());
    }

    // --- Header matching ---

    #[test]
    fn header_match() {
        let rule = make_rule(vec![header_cond("content-type", "text/xml")]);
        let mut headers = HashMap::new();
        headers.insert("content-type".to_string(), "text/xml; charset=utf-8".to_string());
        assert!(find_matching_rule(&[rule], "POST", "/api", &headers, "").is_some());
    }

    #[test]
    fn header_missing_no_match() {
        let rule = make_rule(vec![header_cond("x-custom", "expected")]);
        assert!(find_matching_rule(&[rule], "POST", "/api", &no_headers(), "").is_none());
    }

    // --- SOAPAction matching ---

    #[test]
    fn soap_action_match() {
        let rule = make_rule(vec![cond("soapAction", "urn:GetUser", false)]);
        let mut headers = HashMap::new();
        headers.insert("soapaction".to_string(), "\"urn:GetUser\"".to_string());
        assert!(find_matching_rule(&[rule], "POST", "/ws", &headers, "").is_some());
    }

    // --- Body contains matching ---

    #[test]
    fn contains_match() {
        let rule = make_rule(vec![cond("contains", "<GetUser>", false)]);
        let body = "<soap:Body><GetUser><id>1</id></GetUser></soap:Body>";
        assert!(find_matching_rule(&[rule], "POST", "/ws", &no_headers(), body).is_some());
    }

    // --- XPath matching ---

    #[test]
    fn xpath_match() {
        let rule = make_rule(vec![cond("xpath", "//GetUser", false)]);
        let body = r#"<?xml version="1.0"?><Envelope><Body><GetUser><id>1</id></GetUser></Body></Envelope>"#;
        assert!(find_matching_rule(&[rule], "POST", "/ws", &no_headers(), body).is_some());
    }

    #[test]
    fn xpath_no_match() {
        let rule = make_rule(vec![cond("xpath", "//GetOrder", false)]);
        let body = r#"<?xml version="1.0"?><Envelope><Body><GetUser><id>1</id></GetUser></Body></Envelope>"#;
        assert!(find_matching_rule(&[rule], "POST", "/ws", &no_headers(), body).is_none());
    }

    #[test]
    fn xpath_invalid_xml_no_match() {
        let rule = make_rule(vec![cond("xpath", "//GetUser", false)]);
        assert!(find_matching_rule(&[rule], "POST", "/ws", &no_headers(), "not xml at all").is_none());
    }

    // --- First matching rule wins ---

    #[test]
    fn first_matching_rule_wins() {
        let rule1 = make_rule(vec![cond("url", "/api", false)]);
        let mut rule2 = make_rule(vec![cond("url", "/api", false)]);
        rule2.id = "rule2".to_string();
        rule2.name = "Second Rule".to_string();
        let rules = [rule1, rule2];
        let matched = find_matching_rule(&rules, "GET", "/api/x", &no_headers(), "").unwrap();
        assert_eq!(matched.id, "test-rule");
    }
}
