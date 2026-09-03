// HTTP commands for Tauri
// Exposes HTTP client functionality to the frontend

use super::client::{CancelToken, HttpClient, HttpRequest, HttpResponse};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

/// R-11 (F-11) — in-flight REST/GraphQL requests keyed by client-supplied
/// `requestId`, each holding the `CancelToken` the command registered. Mirrors
/// the SOAP `CANCEL_TOKENS` registry (`soap/commands.rs`) so the unified view
/// can cancel a running non-SOAP request the same way it cancels a SOAP one
/// (one `requestId` per execution; `cancel_rest_request` flips the token, which
/// `HttpClient::execute_internal` races against both the send and the body
/// read). SOAP requests use the separate `cancel_request` command and never
/// appear here, so the two registries cannot collide.
static REST_CANCEL_TOKENS: Lazy<Mutex<HashMap<String, Arc<CancelToken>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

#[tauri::command]
#[allow(clippy::too_many_arguments)] // All parameters map 1:1 to HttpRequest fields
pub async fn execute_http_request(
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
    follow_redirects: Option<bool>,
    verify_ssl: Option<bool>,
    proxy_url: Option<String>,
    proxy_username: Option<String>,
    proxy_password: Option<String>,
) -> Result<HttpResponse, String> {
    log::info!("Executing HTTP request: {} {}", method, url);

    // Log request headers
    if !headers.is_empty() {
        log::debug!("Request headers:");
        for (k, v) in &headers {
            log::debug!("  {}: {}", k, v);
        }
    }

    // Log request body
    if let Some(ref b) = body {
        log::debug!("Request body:\n{}", b);
    }

    let client = HttpClient::new()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request = HttpRequest {
        method,
        url,
        headers,
        body,
        timeout_ms,
        follow_redirects,
        verify_ssl,
        proxy_url,
        proxy_username,
        proxy_password,
    };

    let response = client.execute(request).await;

    // Log response
    log::info!("Response: {} {}", response.status, response.status_text);
    if !response.headers.is_empty() {
        log::debug!("Response headers:");
        for (k, v) in &response.headers {
            log::debug!("  {}: {}", k, v);
        }
    }
    if !response.body.is_empty() {
        log::debug!("Response body:\n{}", response.body);
    }
    if let Some(ref err) = response.error {
        log::warn!("Response error: {}", err);
    }

    Ok(response)
}

#[tauri::command]
pub async fn execute_rest_request(
    method: String,
    url: String,
    headers: HashMap<String, String>,
    body: Option<String>,
    // R-11 (F-11): client-supplied id for this execution so the UI can cancel
    // exactly this in-flight request via `cancel_rest_request`. When omitted,
    // a UUID is generated (the request is then not individually cancellable
    // by the UI, matching the SOAP path's fallback).
    request_id: Option<String>,
) -> Result<HttpResponse, String> {
    log::info!("Executing REST request: {} {}", method, url);

    // R-11: register a cancel token for the duration of the request (mirrors
    // the SOAP `execute_soap_request` registration in `soap/commands.rs`).
    let request_id = request_id
        .filter(|id| !id.is_empty())
        .map(|id| id.to_string())
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let cancel_token = {
        let token = Arc::new(CancelToken::new());
        REST_CANCEL_TOKENS.lock().unwrap().insert(request_id.clone(), token.clone());
        token
    };

    let client = HttpClient::new()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let request = HttpRequest {
        method,
        url,
        headers,
        body,
        timeout_ms: None,
        follow_redirects: Some(true),
        verify_ssl: Some(true),
        proxy_url: None,
        proxy_username: None,
        proxy_password: None,
    };

    let response = client.execute_with_cancel(request, Some(cancel_token)).await;

    // R-11: unregister regardless of success/cancel — the entry must not
    // outlive the request.
    REST_CANCEL_TOKENS.lock().unwrap().remove(&request_id);

    Ok(response)
}

/// R-11 (F-11): cancel an in-flight REST/GraphQL request by `requestId`.
///
/// Result shape mirrors the SOAP `cancel_request` command:
/// `{ success, cancelled, found, requestId }`. A matching in-flight request has
/// its `CancelToken` flipped (it rejects at the next `tokio::select!` point —
/// the send or the body read); a finished/unknown id reports `found: false`
/// without error.
#[tauri::command]
pub fn cancel_rest_request(request_id: Option<String>) -> Result<serde_json::Value, String> {
    let id = request_id
        .filter(|id| !id.is_empty())
        .ok_or("cancel_rest_request requires a request_id")?;

    let tokens = REST_CANCEL_TOKENS.lock().unwrap();
    if let Some(token) = tokens.get(&id) {
        token.cancel();
        log::info!("Cancelled REST/GraphQL request: {}", id);
        Ok(serde_json::json!({ "success": true, "cancelled": true, "found": true, "requestId": id }))
    } else {
        log::info!("cancel_rest_request: id not found (not in-flight): {}", id);
        Ok(serde_json::json!({ "success": true, "cancelled": false, "found": false, "requestId": id }))
    }
}
