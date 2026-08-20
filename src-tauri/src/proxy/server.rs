use std::collections::HashMap;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::{Context, Result};
use bytes::Bytes;
use chrono::Utc;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use rustls::ServerConfig;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;
use uuid::Uuid;

use crate::breakpoint::service::SharedBreakpointService;
use crate::certificates::manager::CertManager;
use crate::certificates::sni_resolver::SniResolver;
use crate::mock::server::find_matching_rule;
use crate::mock::state::SharedMockState;
use crate::proxy_models::{PausedTraffic, ProxyConfig, TrafficEvent};
use crate::utils::{emit_traffic_event, match_pattern, read_body, CONTENT_TYPE_PLAIN};
use crate::replacer::service::SharedReplacerService;
use once_cell::sync::Lazy;

static PROXY_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("Failed to build proxy HTTP client")
});

/// Run the forward proxy server. Loops forever; cancel by aborting the spawned task.
pub async fn run_proxy(
    config: ProxyConfig,
    replacer: SharedReplacerService,
    app: AppHandle,
    cert_manager: Arc<CertManager>,
    mock_state: SharedMockState,
    breakpoints: SharedBreakpointService,
) -> Result<()> {
    let addr: SocketAddr = format!("0.0.0.0:{}", config.port).parse()?;
    let listener = TcpListener::bind(addr)
        .await
        .with_context(|| format!("Failed to bind proxy to port {}", config.port))?;

    log::info!("[Proxy] Listening on port {}", config.port);

    // Build TLS acceptor for HTTPS MITM — signed certs are generated on demand per domain.
    let resolver = Arc::new(SniResolver { cert_manager });
    let server_cfg = ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_protocol_versions(rustls::ALL_VERSIONS)
    .context("Failed to configure TLS protocol versions")?
    .with_no_client_auth()
    .with_cert_resolver(resolver);
    let tls_acceptor = TlsAcceptor::from(Arc::new(server_cfg));

    let config = Arc::new(config);

    loop {
        let (stream, _peer) = match listener.accept().await {
            Ok(v) => v,
            Err(e) => {
                log::error!("[Proxy] Accept error: {}", e);
                continue;
            }
        };

        let io = TokioIo::new(stream);
        let config = config.clone();
        let replacer = replacer.clone();
        let app = app.clone();
        let tls_acceptor = tls_acceptor.clone();
        let mock_state = mock_state.clone();
        let breakpoints = breakpoints.clone();

        let handle = tokio::spawn(async move {
            let svc = service_fn(move |req: Request<Incoming>| {
                let config = config.clone();
                let replacer = replacer.clone();
                let app = app.clone();
                let tls_acceptor = tls_acceptor.clone();
                let mock_state = mock_state.clone();
                let breakpoints = breakpoints.clone();
                async move {
                    Ok::<_, Infallible>(
                        handle_request(req, config, replacer, app, tls_acceptor, mock_state, breakpoints).await,
                    )
                }
            });

            if let Err(e) = hyper::server::conn::http1::Builder::new()
                .preserve_header_case(true)
                .title_case_headers(true)
                .serve_connection(io, svc)
                .with_upgrades()
                .await
            {
                log::debug!("[Proxy] Connection closed: {:?}", e);
            }
        });
        tokio::spawn(async move {
            if let Err(e) = handle.await {
                log::error!("[Proxy] Accept-loop background task panicked: {:?}", e);
            }
        });
    }
}

async fn handle_request(
    req: Request<Incoming>,
    config: Arc<ProxyConfig>,
    replacer: SharedReplacerService,
    app: AppHandle,
    tls_acceptor: TlsAcceptor,
    mock_state: SharedMockState,
    breakpoints: SharedBreakpointService,
) -> Response<Full<Bytes>> {
    if req.method() == Method::CONNECT {
        handle_connect(req, config, replacer, app, tls_acceptor, mock_state, breakpoints).await
    } else {
        handle_http(req, config, replacer, app, mock_state, breakpoints).await
    }
}

/// HTTPS CONNECT with TLS MITM.
///
/// 1. Acknowledge the CONNECT with `200 Connection Established`.
/// 2. Wrap the upgraded client stream with our TLS acceptor (SNI resolver provides a signed cert).
/// 3. Serve the inner HTTP/1.1 connection — decrypted requests flow through the same `handle_http`
///    pipeline (replace rules, traffic events, mock matching) as plain HTTP.
async fn handle_connect(
    req: Request<Incoming>,
    config: Arc<ProxyConfig>,
    replacer: SharedReplacerService,
    app: AppHandle,
    tls_acceptor: TlsAcceptor,
    mock_state: SharedMockState,
    breakpoints: SharedBreakpointService,
) -> Response<Full<Bytes>> {
    let host = match req.uri().authority().map(|a| a.to_string()) {
        Some(h) => h,
        None => {
            log::warn!("[Proxy] CONNECT missing host");
            return error_response(StatusCode::BAD_REQUEST, "CONNECT missing host");
        }
    };

    let hostname = host.split(':').next().unwrap_or(&host).to_string();

    let connect_handle = tokio::spawn(async move {
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                let client_io = TokioIo::new(upgraded);
                match tls_acceptor.accept(client_io).await {
                    Ok(tls_stream) => {
                        let inner_io = TokioIo::new(tls_stream);
                        let svc = service_fn(move |inner_req: Request<Incoming>| {
                            let config = config.clone();
                            let replacer = replacer.clone();
                            let app = app.clone();
                            let hostname = hostname.clone();
                            let mock_state = mock_state.clone();
                            let breakpoints = breakpoints.clone();
                            async move {
                                let req = rewrite_to_https(inner_req, &hostname);
                                Ok::<_, Infallible>(
                                    handle_http(req, config, replacer, app, mock_state, breakpoints).await,
                                )
                            }
                        });

                        if let Err(e) = hyper::server::conn::http1::Builder::new()
                            .preserve_header_case(true)
                            .title_case_headers(true)
                            .serve_connection(inner_io, svc)
                            .await
                        {
                            log::debug!("[Proxy] MITM inner connection closed ({}): {:?}", host, e);
                        }
                    }
                    Err(e) => {
                        log::warn!(
                            "[Proxy] TLS handshake failed for {} (is the CA trusted?): {}",
                            host,
                            e
                        );
                    }
                }
            }
            Err(e) => log::warn!("[Proxy] Upgrade error: {}", e),
        }
    });
    tokio::spawn(async move {
        if let Err(e) = connect_handle.await {
            log::error!("[Proxy] MITM CONNECT tunnel background task panicked: {:?}", e);
        }
    });

    Response::builder()
        .status(StatusCode::OK)
        .body(Full::new(Bytes::new()))
        .unwrap()
}

/// Rewrite a relative-URI HTTP/1.1 request (from a MITM'd CONNECT tunnel) into an
/// absolute HTTPS URL so `handle_http` can forward it to the real upstream.
fn rewrite_to_https(
    req: Request<Incoming>,
    hostname: &str,
) -> Request<Incoming> {
    let pq = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/");
    let absolute = format!("https://{}{}", hostname, pq);

    let (mut parts, body) = req.into_parts();
    if let Ok(uri) = absolute.parse() {
        parts.uri = uri;
    }
    Request::from_parts(parts, body)
}

/// Forward an HTTP request, applying replace rules and emitting a traffic event.
async fn handle_http(
    req: Request<Incoming>,
    config: Arc<ProxyConfig>,
    replacer: SharedReplacerService,
    app: AppHandle,
    mock_state: SharedMockState,
    breakpoints: SharedBreakpointService,
) -> Response<Full<Bytes>> {
    let start = std::time::Instant::now();
    let event_id = Uuid::new_v4().to_string();
    let method = req.method().to_string();
    let forward_url = resolve_url(&req, &config);

    log::debug!("[Proxy] {} {} (mode={})", method, forward_url, config.mode);

    let req_headers: HashMap<String, String> = req
        .headers()
        .iter()
        .filter_map(|(k, v)| v.to_str().ok().map(|v| (k.to_string(), v.to_string())))
        .collect();

    // Read full request body (spooled to disk if exceeding configured limit)
    let body_bytes = match read_body(req.into_body(), config.max_body_bytes).await {
        Ok(b) => b.into_bytes().await.unwrap_or_default(),
        Err(e) => {
            log::warn!("[Proxy] Failed to read request body: {}", e);
            return error_response(StatusCode::BAD_GATEWAY, "Failed to read request body");
        }
    };
    let raw_req_body = String::from_utf8_lossy(&body_bytes).into_owned();
    log::debug!("[Proxy] Request body: {} bytes", raw_req_body.len());

    // Apply replace rules to request body
    let req_body = {
        let svc = replacer.lock().await;
        svc.apply_request(&raw_req_body)
    };

    // Check mock rules when mode includes mock matching ("both" or "mock").
    let mode = config.mode.as_str();
    if mode == "both" || mode == "mock" {
        let (rules, _, _) = {
            let ms = mock_state.lock().await;
            (ms.config.rules.clone(), ms.config.passthrough_enabled, ms.config.target_url.clone())
        };
        log::debug!("[Proxy] Checking {} mock rules for {}", rules.len(), forward_url);
        if let Some(rule) = find_matching_rule(&rules, &method, &forward_url, &req_headers, &req_body) {
            log::info!("[Proxy] Mock rule '{}' matched {}", rule.name, forward_url);

            if let Some(delay) = rule.delay_ms {
                if delay > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
                }
            }

            // Increment hit count
            {
                let mut ms = mock_state.lock().await;
                if let Some(r) = ms.config.rules.iter_mut().find(|r| r.id == rule.id) {
                    r.hit_count += 1;
                }
            }

            let status = rule.status_code;
            let content_type = rule.content_type.clone().unwrap_or_else(|| CONTENT_TYPE_PLAIN.to_string());
            let resp_body = rule.response_body.clone();
            let mut resp_headers: HashMap<String, String> = rule.response_headers.clone().unwrap_or_default();
            resp_headers.entry("content-type".to_string()).or_insert(content_type);

            let duration_ms = start.elapsed().as_millis() as u64;
            let now = Utc::now();
            emit_traffic_event(&app, &TrafficEvent {
                id: event_id,
                timestamp: now.timestamp_millis(),
                timestamp_label: now.to_rfc3339(),
                method,
                url: forward_url,
                request_headers: req_headers,
                request_body: req_body,
                status: Some(status),
                response_headers: Some(resp_headers.clone()),
                response_body: Some(resp_body.clone()),
                duration_ms: Some(duration_ms),
                matched_rule: Some(rule.name.clone()),
                passthrough: Some(false),
                source: "proxy-mock".to_string(),
            }, "Proxy");

            let mut hb = Response::builder().status(status);
            for (k, v) in &resp_headers {
                hb = hb.header(k.as_str(), v.as_str());
            }
            let body_bytes = Bytes::from(resp_body);
            hb = hb.header("content-length", body_bytes.len());
            return hb.body(Full::new(body_bytes))
                .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "Build error"));
        }
        log::debug!("[Proxy] No mock rule matched — forwarding");
    }

    // ── Breakpoint: request phase ──────────────────────────────────────────
    let req_body = {
        let rx_opt = {
            let mut svc = breakpoints.lock().await;
            let matched = svc.rules.iter().find(|r| {
                r.enabled && (r.target == "request" || r.target == "both")
                    && breakpoint_matches(r, &method, &forward_url, &req_headers, &req_body, None)
            }).cloned();
            if let Some(rule) = matched {
                log::info!("[Proxy] Breakpoint '{}' pausing request to {}", rule.name, forward_url);
                let info = PausedTraffic {
                    id: Uuid::new_v4().to_string(),
                    timestamp: Utc::now().timestamp_millis(),
                    pause_type: "request".to_string(),
                    method: method.clone(),
                    url: forward_url.clone(),
                    request_headers: req_headers.clone(),
                    request_body: req_body.clone(),
                    status_code: None,
                    response_headers: None,
                    response_body: None,
                    matched_rule: rule.name.clone(),
                };
                let rx = svc.pause(info);
                emit_paused_queue(&app, &svc);
                Some(rx)
            } else {
                None
            }
        };
        if let Some(rx) = rx_opt {
            match rx.await {
                Ok(res) if res.action == "drop" => {
                    return error_response(StatusCode::BAD_GATEWAY, "Dropped by breakpoint");
                }
                Ok(res) => res.modified_body.unwrap_or(req_body),
                Err(_) => req_body,
            }
        } else {
            req_body
        }
    };

    // Build and send the forwarded request
    let client = &*PROXY_CLIENT;

    let req_method = match reqwest::Method::from_bytes(method.as_bytes()) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("[Proxy] Invalid HTTP method {}: {}", method, e);
            return error_response(StatusCode::BAD_REQUEST, "Invalid HTTP method");
        }
    };

    let mut rb = client.request(req_method, &forward_url);

    // Strip hop-by-hop and proxy-specific headers. The proxy has already fully
    // buffered the body, so the original Transfer-Encoding and Content-Length
    // are no longer valid for the outbound request. reqwest will set the correct
    // Content-Length from the actual body bytes. Forwarding Transfer-Encoding:chunked
    // alongside a fixed body causes WCF services to enter an ambiguous read path
    // (they create a buffered copy of the message, then the dispatcher reads the original
    // → "This message cannot support the operation because it has been copied").
    const HOP_BY_HOP: &[&str] = &[
        "host",
        "connection",
        "keep-alive",
        "proxy-connection",
        "proxy-authorization",
        "proxy-authenticate",
        "te",
        "trailers",
        "transfer-encoding",
        "upgrade",
        "content-length",   // let reqwest calculate from actual body
        "expect",           // 100-continue is meaningless after body is buffered
    ];

    for (k, v) in &req_headers {
        let lk = k.to_lowercase();
        if !HOP_BY_HOP.contains(&lk.as_str()) {
            rb = rb.header(k.as_str(), v.as_str());
        }
    }

    if !req_body.is_empty() {
        rb = rb.body(req_body.clone());
    }

    let (status, resp_headers, resp_body) = match rb.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            // Strip response hop-by-hop headers immediately. This must happen before
            // the breakpoint path so that:
            //  1. PausedTraffic shown in the UI never contains Transfer-Encoding: chunked
            //     (avoids users accidentally forwarding it via "Continue with Changes")
            //  2. The traffic log records the headers the client actually sees
            //  3. The final hyper response builder receives already-clean headers
            // content-length is also stripped here and re-added correctly below from
            // the actual buffered body byte count.
            let resp_headers: HashMap<String, String> = resp
                .headers()
                .iter()
                .filter_map(|(k, v)| {
                    let lk = k.as_str().to_lowercase();
                    if matches!(
                        lk.as_str(),
                        "transfer-encoding"
                            | "content-length"
                            | "connection"
                            | "keep-alive"
                            | "te"
                            | "trailers"
                            | "upgrade"
                    ) {
                        None
                    } else {
                        v.to_str().ok().map(|v| (k.to_string(), v.to_string()))
                    }
                })
                .collect();
            let body_bytes = resp.bytes().await.unwrap_or_default();
            let body_str = String::from_utf8_lossy(&body_bytes).into_owned();
            log::debug!("[Proxy] Response {}: {} bytes", status, body_str.len());
            let body_out = {
                let svc = replacer.lock().await;
                svc.apply_response(&body_str)
            };
            (status, resp_headers, body_out)
        }
        Err(e) => {
            let msg = format!("Proxy forward error: {}", e);
            log::warn!("[Proxy] {}", msg);
            (502, HashMap::new(), msg)
        }
    };

    // ── Breakpoint: response phase ─────────────────────────────────────────
    let (status, resp_headers, resp_body) = {
        let rx_opt = {
            let mut svc = breakpoints.lock().await;
            let matched = svc.rules.iter().find(|r| {
                r.enabled && (r.target == "response" || r.target == "both")
                    && breakpoint_matches(r, &method, &forward_url, &req_headers, &resp_body, Some(status))
            }).cloned();
            if let Some(rule) = matched {
                log::info!("[Proxy] Breakpoint '{}' pausing response from {}", rule.name, forward_url);
                let info = PausedTraffic {
                    id: Uuid::new_v4().to_string(),
                    timestamp: Utc::now().timestamp_millis(),
                    pause_type: "response".to_string(),
                    method: method.clone(),
                    url: forward_url.clone(),
                    request_headers: req_headers.clone(),
                    request_body: req_body.clone(),
                    status_code: Some(status),
                    response_headers: Some(resp_headers.clone()),
                    response_body: Some(resp_body.clone()),
                    matched_rule: rule.name.clone(),
                };
                let rx = svc.pause(info);
                emit_paused_queue(&app, &svc);
                Some(rx)
            } else {
                None
            }
        };
        if let Some(rx) = rx_opt {
            match rx.await {
                Ok(res) if res.action == "drop" => {
                    return error_response(StatusCode::BAD_GATEWAY, "Dropped by breakpoint");
                }
                Ok(res) => (
                    res.modified_status_code.unwrap_or(status),
                    res.modified_headers.unwrap_or(resp_headers),
                    res.modified_body.unwrap_or(resp_body),
                ),
                Err(_) => (status, resp_headers, resp_body),
            }
        } else {
            (status, resp_headers, resp_body)
        }
    };

    let duration_ms = start.elapsed().as_millis() as u64;
    let now = Utc::now();

    emit_traffic_event(
        &app,
        &TrafficEvent {
            id: event_id,
            timestamp: now.timestamp_millis(),
            timestamp_label: now.to_rfc3339(),
            method,
            url: forward_url,
            request_headers: req_headers,
            request_body: req_body,
            status: Some(status),
            response_headers: Some(resp_headers.clone()),
            response_body: Some(resp_body.clone()),
            duration_ms: Some(duration_ms),
            matched_rule: None,
            passthrough: Some(true),
            source: "proxy".to_string(),
        },
        "Proxy",
    );

    // Build hyper response. resp_headers was already stripped of hop-by-hop headers
    // at collection time. The loop below is a safety net in case modified_headers
    // from a breakpoint "Continue with Changes" still carries any of them.
    let mut hb = Response::builder().status(status);
    for (k, v) in &resp_headers {
        let lk = k.to_lowercase();
        if lk != "transfer-encoding" && lk != "content-length" && lk != "connection"
            && lk != "keep-alive" && lk != "te" && lk != "trailers" && lk != "upgrade"
        {
            hb = hb.header(k.as_str(), v.as_str());
        }
    }
    let body_bytes = Bytes::from(resp_body);
    hb = hb.header("content-length", body_bytes.len());

    hb.body(Full::new(body_bytes)).unwrap_or_else(|e| {
        log::error!("[Proxy] Failed to build response: {}", e);
        error_response(StatusCode::INTERNAL_SERVER_ERROR, "Response build error")
    })
}

/// Resolve the URL to forward to.
/// If target_url is set, prepend it (keeping path+query). Otherwise use the absolute URI.
fn resolve_url(req: &Request<Incoming>, config: &ProxyConfig) -> String {
    if !config.target_url.is_empty() {
        let base = config.target_url.trim_end_matches('/');
        let pq = req
            .uri()
            .path_and_query()
            .map(|pq| pq.as_str())
            .unwrap_or("/");
        format!("{}{}", base, pq)
    } else {
        req.uri().to_string()
    }
}

fn error_response(status: StatusCode, msg: &str) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .header("content-type", CONTENT_TYPE_PLAIN)
        .body(Full::new(Bytes::from(msg.to_string())))
        .unwrap()
}

fn emit_paused_queue(app: &AppHandle, svc: &crate::breakpoint::service::BreakpointService) {
    let queue = svc.get_paused_traffic();
    if let Err(e) = app.emit("breakpoint-paused", &queue) {
        log::warn!("[Proxy] Failed to emit breakpoint-paused: {}", e);
    }
}

/// Returns true if the breakpoint rule matches this request/response.
fn breakpoint_matches(
    rule: &crate::proxy_models::BreakpointRule,
    method: &str,
    url: &str,
    headers: &HashMap<String, String>,
    body: &str,
    status_code: Option<u16>,
) -> bool {
    if rule.conditions.is_empty() {
        return true; // no conditions = match all
    }
    rule.conditions.iter().all(|cond| {
        let pattern = &cond.pattern;
        match cond.r#type.as_str() {
            "url" => match_pattern(url, pattern, cond.is_regex),
            "method" => method.eq_ignore_ascii_case(pattern),
            "statusCode" => status_code.map(|s| s.to_string() == *pattern).unwrap_or(false),
            "contains" => body.contains(pattern.as_str()),
            "header" => {
                let name = cond.header_name.as_deref().unwrap_or("").to_lowercase();
                headers.iter().any(|(k, v)| k.to_lowercase() == name && v.contains(pattern.as_str()))
            }
            _ => false,
        }
    })
}
