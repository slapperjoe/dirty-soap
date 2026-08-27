use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use crate::http::client::{CancelToken, HttpClient, HttpRequest};
use crate::performance::types::{PerformanceRequest, PerformanceResult};
use crate::utils::{substitute_variables, CONTENT_TYPE_XML};

/// Execute a single performance request and return a `PerformanceResult`.
/// M1: an optional cancel token lets abort_performance_suite interrupt an
/// in-flight request (raced against both the request send and body read).
pub async fn execute_request(
    req: &PerformanceRequest,
    iteration: u32,
    variables: &HashMap<String, String>,
    cancel_token: Option<Arc<CancelToken>>,
) -> PerformanceResult {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let endpoint = substitute_variables(&req.endpoint, variables);
    let body = substitute_variables(&req.request_body, variables);

    let start = Instant::now();
    let mut status: u16 = 0;
    let mut success = false;
    let mut error: Option<String> = None;
    let mut response_body = String::new();
    let mut extracted_values: HashMap<String, String> = HashMap::new();

    match HttpClient::new() {
        Ok(client) => {
            let mut headers = req.headers.clone();
            if let Some(ref action) = req.soap_action {
                headers
                    .entry("SOAPAction".to_string())
                    .or_insert_with(|| format!("\"{}\"", action));
                headers
                    .entry("Content-Type".to_string())
                    .or_insert_with(|| CONTENT_TYPE_XML.to_string());
            }

            let http_req = HttpRequest {
                method: req.method.clone(),
                url: endpoint.clone(),
                headers,
                body: if body.is_empty() { None } else { Some(body) },
                timeout_ms: Some(30_000),
                follow_redirects: Some(true),
                verify_ssl: Some(false),
                proxy_url: None,
                proxy_username: None,
                proxy_password: None,
            };

            let resp = client.execute_with_cancel(http_req, cancel_token).await;
            status = resp.status;
            success = resp.status >= 200 && resp.status < 300;
            if let Some(e) = resp.error {
                if !success {
                    error = Some(e);
                }
            }
            response_body = resp.body;
        }
        Err(e) => {
            error = Some(format!("Failed to create HTTP client: {}", e));
        }
    }

    let duration = start.elapsed().as_secs_f64() * 1000.0;

    for extractor in &req.extractors {
        if extractor.extractor_type.to_lowercase() == "xpath" {
            if let Some(value) = extract_xpath(&response_body, &extractor.path) {
                extracted_values.insert(extractor.variable.clone(), value);
            }
        }
    }

    let sla_breached = req.sla_threshold.map(|t| duration > t).unwrap_or(false);

    PerformanceResult {
        request_id: req.id.clone(),
        request_name: req.name.clone(),
        interface_name: None,
        operation_name: None,
        iteration,
        duration,
        status,
        success,
        sla_breached,
        error,
        extracted_values: if extracted_values.is_empty() {
            None
        } else {
            Some(extracted_values)
        },
        timestamp,
    }
}

/// Extract a value from XML using the last element name in an XPath-like path.
fn extract_xpath(xml: &str, path: &str) -> Option<String> {
    let element = path.split('/').rfind(|s| !s.is_empty())?;
    let element = element.split(':').next_back().unwrap_or(element);

    let open_tag = format!("<{}", element);
    let close_tag = format!("</{}>", element);

    let start = xml.find(&open_tag)?;
    let content_start = xml[start..].find('>')? + start + 1;
    let end = xml[content_start..].find(&close_tag)? + content_start;

    Some(xml[content_start..end].trim().to_string())
}
