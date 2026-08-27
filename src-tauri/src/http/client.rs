use anyhow::{Context, Result};
use reqwest::{Client, Method, Proxy};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::error::Error as _;
use std::time::{Duration, Instant};
use once_cell::sync::Lazy;
use tokio::sync::Notify;

type ClientKey = (u64, bool, bool, String, Option<String>, Option<String>);

static CLIENT_CACHE: Lazy<Mutex<HashMap<ClientKey, Client>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// A lightweight cancellation token backed by `tokio::sync::Notify`.
/// Create one with `CancelToken::new()`, pass an `Arc<CancelToken>` to
/// `HttpClient::execute_with_cancel`, and call `.cancel()` to abort an
/// in-flight request.
#[derive(Debug, Clone)]
pub struct CancelToken {
    notify: Arc<Notify>,
}

impl CancelToken {
    pub fn new() -> Self {
        Self {
            notify: Arc::new(Notify::new()),
        }
    }

    pub fn cancel(&self) {
        self.notify.notify_waiters();
    }

    pub async fn wait(&self) {
        self.notify.notified().await;
    }
}

impl Default for CancelToken {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum HttpErrorKind {
    Dns,
    ConnectionRefused,
    Tls,
    Timeout,
    InvalidUrl,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
    pub follow_redirects: Option<bool>,
    pub verify_ssl: Option<bool>,
    pub proxy_url: Option<String>,
    pub proxy_username: Option<String>,
    pub proxy_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub success: bool,
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub time_taken_ms: u64,
    pub error: Option<String>,
    pub error_kind: Option<HttpErrorKind>,
}

pub struct HttpClient {
    client: Client,
}

impl HttpClient {
    /// Create a new HTTP client with default settings
    pub fn new() -> Result<Self> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .context("Failed to create HTTP client")?;
        
        Ok(Self { client })
    }

    /// Create a custom HTTP client with specific settings
    pub fn with_settings(
        timeout_ms: Option<u64>,
        follow_redirects: bool,
        verify_ssl: bool,
        proxy_url: Option<String>,
        proxy_username: Option<String>,
        proxy_password: Option<String>,
    ) -> Result<Self> {
        let mut builder = Client::builder()
            .danger_accept_invalid_certs(!verify_ssl);

        if let Some(timeout) = timeout_ms {
            builder = builder.timeout(Duration::from_millis(timeout));
        }

        if follow_redirects {
            builder = builder.redirect(reqwest::redirect::Policy::limited(10));
        } else {
            builder = builder.redirect(reqwest::redirect::Policy::none());
        }

        // Configure proxy if provided
        if let Some(proxy_url_str) = proxy_url {
            let mut proxy = Proxy::all(&proxy_url_str)
                .context("Failed to configure proxy")?;
            
            if let (Some(username), Some(password)) = (proxy_username, proxy_password) {
                proxy = proxy.basic_auth(&username, &password);
            }
            
            builder = builder.proxy(proxy);
        }

        let client = builder.build()
            .context("Failed to create HTTP client")?;
        
        Ok(Self { client })
    }

    /// Execute an HTTP request
    pub async fn execute(&self, request: HttpRequest) -> HttpResponse {
        self.execute_with_cancel(request, None).await
    }

    /// Execute an HTTP request with an optional cancellation token.
    pub async fn execute_with_cancel(
        &self,
        request: HttpRequest,
        cancel_token: Option<Arc<CancelToken>>,
    ) -> HttpResponse {
        let start = Instant::now();

        match self.execute_internal(request, cancel_token).await {
            Ok(response) => response,
            Err(e) => {
                let kind = classify_reqwest_error(&e);
                HttpResponse {
                    success: false,
                    status: 0,
                    status_text: "Error".to_string(),
                    headers: HashMap::new(),
                    body: String::new(),
                    time_taken_ms: start.elapsed().as_millis() as u64,
                    error: Some(e.to_string()),
                    error_kind: Some(kind),
                }
            }
        }
    }

    async fn execute_internal(
        &self,
        request: HttpRequest,
        cancel_token: Option<Arc<CancelToken>>,
    ) -> Result<HttpResponse> {
        let start = Instant::now();
        
        // Parse HTTP method
        let method = Method::from_bytes(request.method.as_bytes())
            .context("Invalid HTTP method")?;

        let timeout_ms = request.timeout_ms.unwrap_or(30_000);
        let follow_redirects = request.follow_redirects.unwrap_or(true);
        let verify_ssl = request.verify_ssl.unwrap_or(true);
        let proxy_url = request.proxy_url.clone().unwrap_or_default();

        // M3: include proxy credentials in the cache key — two requests that
        // share a proxy URL but use different credentials must not share a
        // reqwest Client (the first request's basic-auth would win).
        let key: ClientKey = (
            timeout_ms,
            follow_redirects,
            verify_ssl,
            proxy_url.clone(),
            request.proxy_username.clone(),
            request.proxy_password.clone(),
        );

        let client = {
            let mut cache = CLIENT_CACHE.lock().unwrap();
            if let Some(c) = cache.get(&key) {
                c.clone()
            } else {
                let c = build_reqwest_client(
                    timeout_ms,
                    follow_redirects,
                    verify_ssl,
                    proxy_url.clone(),
                    request.proxy_username.clone(),
                    request.proxy_password.clone(),
                )?;
                cache.insert(key, c.clone());
                c
            }
        };

        // Build request
        let mut req_builder = client.request(method, &request.url);

        // Add headers
        for (key, value) in &request.headers {
            req_builder = req_builder.header(key, value);
        }

        // Add body if present
        if let Some(body) = &request.body {
            req_builder = req_builder.body(body.clone());
        }

        // Execute request with optional cancellation
        let response = if let Some(ref token) = cancel_token {
            tokio::select! {
                res = req_builder.send() => res.context("Failed to send HTTP request")?,
                _ = token.wait() => {
                    return Err(anyhow::anyhow!("Request cancelled"));
                }
            }
        } else {
            req_builder.send().await.context("Failed to send HTTP request")?
        };

        let status = response.status();
        let status_code = status.as_u16();
        let status_text = status.canonical_reason().unwrap_or("Unknown").to_string();

        // Extract headers
        let mut headers = HashMap::new();
        for (key, value) in response.headers() {
            if let Ok(value_str) = value.to_str() {
                headers.insert(key.to_string(), value_str.to_string());
            }
        }

        // Read body — M4: also race the cancel token against the body read,
        // not just the request send. A huge/slow response body should be
        // aborted promptly on cancel.
        let body_text = if let Some(ref token) = cancel_token {
            tokio::select! {
                res = response.text() => res.context("Failed to read response body")?,
                _ = token.wait() => {
                    return Err(anyhow::anyhow!("Request cancelled"));
                }
            }
        } else {
            response.text().await.context("Failed to read response body")?
        };

        let time_taken_ms = start.elapsed().as_millis() as u64;

        Ok(HttpResponse {
            success: status.is_success(),
            status: status_code,
            status_text,
            headers,
            body: body_text,
            time_taken_ms,
            error: None,
            error_kind: None,
        })
    }

    /// Convenience method for GET request
    pub async fn get(&self, url: &str, headers: HashMap<String, String>) -> HttpResponse {
        self.execute(HttpRequest {
            method: "GET".to_string(),
            url: url.to_string(),
            headers,
            body: None,
            timeout_ms: None,
            follow_redirects: None,
            verify_ssl: None,
            proxy_url: None,
            proxy_username: None,
            proxy_password: None,
        }).await
    }

    /// Convenience method for POST request
    pub async fn post(
        &self,
        url: &str,
        headers: HashMap<String, String>,
        body: String,
    ) -> HttpResponse {
        self.execute(HttpRequest {
            method: "POST".to_string(),
            url: url.to_string(),
            headers,
            body: Some(body),
            timeout_ms: None,
            follow_redirects: None,
            verify_ssl: None,
            proxy_url: None,
            proxy_username: None,
            proxy_password: None,
        }).await
    }

    /// Convenience method for PUT request
    pub async fn put(
        &self,
        url: &str,
        headers: HashMap<String, String>,
        body: String,
    ) -> HttpResponse {
        self.execute(HttpRequest {
            method: "PUT".to_string(),
            url: url.to_string(),
            headers,
            body: Some(body),
            timeout_ms: None,
            follow_redirects: None,
            verify_ssl: None,
            proxy_url: None,
            proxy_username: None,
            proxy_password: None,
        }).await
    }

    /// Convenience method for DELETE request
    pub async fn delete(&self, url: &str, headers: HashMap<String, String>) -> HttpResponse {
        self.execute(HttpRequest {
            method: "DELETE".to_string(),
            url: url.to_string(),
            headers,
            body: None,
            timeout_ms: None,
            follow_redirects: None,
            verify_ssl: None,
            proxy_url: None,
            proxy_username: None,
            proxy_password: None,
        }).await
    }

    /// Convenience method for PATCH request
    pub async fn patch(
        &self,
        url: &str,
        headers: HashMap<String, String>,
        body: String,
    ) -> HttpResponse {
        self.execute(HttpRequest {
            method: "PATCH".to_string(),
            url: url.to_string(),
            headers,
            body: Some(body),
            timeout_ms: None,
            follow_redirects: None,
            verify_ssl: None,
            proxy_url: None,
            proxy_username: None,
            proxy_password: None,
        }).await
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new().expect("Failed to create default HTTP client")
    }
}

fn build_reqwest_client(
    timeout_ms: u64,
    follow_redirects: bool,
    verify_ssl: bool,
    proxy_url: String,
    proxy_username: Option<String>,
    proxy_password: Option<String>,
) -> Result<Client> {
    let mut builder = Client::builder()
        .danger_accept_invalid_certs(!verify_ssl);

    builder = builder.timeout(Duration::from_millis(timeout_ms));

    if follow_redirects {
        builder = builder.redirect(reqwest::redirect::Policy::limited(10));
    } else {
        builder = builder.redirect(reqwest::redirect::Policy::none());
    }

    if !proxy_url.is_empty() {
        let mut proxy = Proxy::all(&proxy_url)
            .context("Failed to configure proxy")?;
        if let (Some(username), Some(password)) = (proxy_username, proxy_password) {
            proxy = proxy.basic_auth(&username, &password);
        }
        builder = builder.proxy(proxy);
    }

    builder.build().context("Failed to create HTTP client")
}

fn classify_reqwest_error(e: &anyhow::Error) -> HttpErrorKind {
    // Walk the chain of source errors looking for reqwest::Error.
    let mut current: Option<&dyn std::error::Error> = Some(e.as_ref());
    while let Some(err) = current {
        if let Some(req_err) = err.downcast_ref::<reqwest::Error>() {
            if req_err.is_timeout() {
                return HttpErrorKind::Timeout;
            }
            if req_err.is_connect() {
                let io_kind = 'scan: {
                    let mut current: Option<&(dyn std::error::Error + 'static)> = req_err.source();
                    while let Some(err) = current {
                        if let Some(io_err) = err.downcast_ref::<std::io::Error>() {
                            break 'scan Some(io_err.kind());
                        }
                        current = err.source();
                    }
                    None
                };
                if let Some(kind) = io_kind {
                    if kind == std::io::ErrorKind::NotFound {
                        return HttpErrorKind::Dns;
                    }
                    if kind == std::io::ErrorKind::ConnectionRefused
                        || kind == std::io::ErrorKind::ConnectionReset
                    {
                        return HttpErrorKind::ConnectionRefused;
                    }
                }
                let err_str = req_err.to_string().to_lowercase();
                if err_str.contains("certificate")
                    || err_str.contains("tls")
                    || err_str.contains("ssl")
                    || err_str.contains("handshake")
                {
                    return HttpErrorKind::Tls;
                }
                return HttpErrorKind::ConnectionRefused;
            }
            if req_err.is_builder() {
                return HttpErrorKind::InvalidUrl;
            }
            break;
        }
        // Also check for hyper errors which may contain TLS info.
        if let Some(io_err) = err.downcast_ref::<std::io::Error>() {
            if io_err.kind() == std::io::ErrorKind::NotFound {
                return HttpErrorKind::Dns;
            }
        }
        current = err.source();
    }
    HttpErrorKind::Other
}
