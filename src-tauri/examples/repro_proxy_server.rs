//! Controlled-reproduction proxy server for the "update fails with OS proxy on"
//! bug (kanban t_b6c2aed3).
//!
//! This harness mirrors `crate::proxy::server::run_proxy` (the production MITM
//! forward proxy that APInox starts when it is "reading calls") but replaces the
//! Tauri `AppHandle` traffic-event emission with file logging, so it can run
//! headless. Everything security-relevant is the REAL production code:
//!
//!   - `CertManager::generate()`            — real APInox Root CA generation
//!   - `SniResolver` / `sign_for_domain()`  — real per-domain leaf signing
//!   - hyper HTTP/1 + rustls `TlsAcceptor`  — same CONNECT/TLS-MITM structure
//!   - reqwest `danger_accept_invalid_certs` — same upstream forwarding client
//!
//! Env:
//!   REPRO_PROXY_PORT  (default 18888)  — port to bind (0.0.0.0)
//!   REPRO_CA_DIR      (required)       — dir where the real CA is generated
//!   REPRO_LOG         (required)       — file for traffic/proxy logs
//!
//! The generated CA cert is written to $REPRO_CA_DIR/ca.cer by the real
//! `CertManager::generate()` and can be shared with the client harness to test
//! the "CA trusted" variant.

use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;

use bytes::Bytes;
use http_body_util::Full;
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper::{Method, Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use once_cell::sync::Lazy;
use rustls::ServerConfig;
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;

use apinox_lib::certificates::manager::CertManager;
use apinox_lib::certificates::sni_resolver::SniResolver;

/// Same shape as the production `PROXY_CLIENT` in proxy/server.rs.
static PROXY_CLIENT: Lazy<reqwest::Client> = Lazy::new(|| {
    reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .expect("Failed to build proxy HTTP client")
});

fn log_line(msg: &str) {
    use std::io::Write;
    if let Ok(mut f) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(std::env::var("REPRO_LOG").unwrap_or_default())
    {
        let _ = writeln!(f, "{}", msg);
    }
    eprintln!("[proxy] {}", msg);
}

#[tokio::main]
async fn main() {
    let port: u16 = std::env::var("REPRO_PROXY_PORT")
        .unwrap_or_else(|_| "18888".into())
        .parse()
        .expect("REPRO_PROXY_PORT must be a number");
    let ca_dir = std::env::var("REPRO_CA_DIR").expect("REPRO_CA_DIR required");

    // ── Real APInox CA generation ──────────────────────────────────────────
    let cert_manager = Arc::new(CertManager::new(std::path::PathBuf::from(&ca_dir)));
    let info = cert_manager.generate().expect("failed to generate APInox CA");
    log_line(&format!(
        "CA generated: subject={} fingerprint={}",
        info.subject.unwrap_or_default(),
        info.fingerprint.unwrap_or_default()
    ));

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();
    let listener = TcpListener::bind(addr).await.expect("bind failed");
    log_line(&format!("Listening on {}", addr));

    // ── Real SNI resolver + rustls acceptor (same as run_proxy) ────────────
    let resolver = Arc::new(SniResolver { cert_manager: cert_manager.clone() });
    let server_cfg = ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_protocol_versions(rustls::ALL_VERSIONS)
    .unwrap()
    .with_no_client_auth()
    .with_cert_resolver(resolver);
    let tls_acceptor = TlsAcceptor::from(Arc::new(server_cfg));

    loop {
        let (stream, peer) = match listener.accept().await {
            Ok(v) => v,
            Err(e) => {
                log_line(&format!("accept error: {}", e));
                continue;
            }
        };
        let peer_str = peer.to_string();
        let io = TokioIo::new(stream);
        let tls_acceptor = tls_acceptor.clone();

        tokio::spawn(async move {
            let svc = service_fn(move |req: Request<Incoming>| {
                let tls_acceptor = tls_acceptor.clone();
                async move { Ok::<_, Infallible>(handle_request(req, tls_acceptor).await) }
            });

            if let Err(e) = hyper::server::conn::http1::Builder::new()
                .preserve_header_case(true)
                .title_case_headers(true)
                .serve_connection(io, svc)
                .with_upgrades()
                .await
            {
                log_line(&format!("connection {} closed: {:?}", peer_str, e));
            }
        });
    }
}

async fn handle_request(
    req: Request<Incoming>,
    tls_acceptor: TlsAcceptor,
) -> Response<Full<Bytes>> {
    if req.method() == Method::CONNECT {
        handle_connect(req, tls_acceptor).await
    } else {
        handle_http(req).await
    }
}

/// CONNECT + TLS MITM — mirrors `handle_connect` in proxy/server.rs
/// (minus mock/breakpoint/replacer, which are no-ops with empty rule sets).
async fn handle_connect(
    req: Request<Incoming>,
    tls_acceptor: TlsAcceptor,
) -> Response<Full<Bytes>> {
    let host = match req.uri().authority().map(|a| a.to_string()) {
        Some(h) => h,
        None => {
            log_line("CONNECT missing host");
            return error_response(StatusCode::BAD_REQUEST, "CONNECT missing host");
        }
    };
    log_line(&format!("CONNECT {}", host));
    let hostname = host.split(':').next().unwrap_or(&host).to_string();
    let host_log = host.clone();

    tokio::spawn(async move {
        match hyper::upgrade::on(req).await {
            Ok(upgraded) => {
                let client_io = TokioIo::new(upgraded);
                match tls_acceptor.accept(client_io).await {
                    Ok(tls_stream) => {
                        log_line(&format!(
                            "MITM TLS handshake OK for {} (leaf signed by APInox CA)",
                            hostname
                        ));
                        let inner_io = TokioIo::new(tls_stream);
                        let svc = service_fn(move |inner_req: Request<Incoming>| {
                            // Closure is Fn; `hostname` is cloned out per request
                            // (same pattern as production handle_connect).
                            let hostname = hostname.clone();
                            async move {
                                let req = rewrite_to_https(inner_req, &hostname);
                                Ok::<_, Infallible>(handle_http(req).await)
                            }
                        });
                        if let Err(e) = hyper::server::conn::http1::Builder::new()
                            .preserve_header_case(true)
                            .title_case_headers(true)
                            .serve_connection(inner_io, svc)
                            .with_upgrades()
                            .await
                        {
                            log_line(&format!(
                                "MITM inner connection closed ({}): {:?}",
                                host_log, e
                            ));
                        }
                    }
                    Err(e) => {
                        log_line(&format!(
                            "TLS handshake FAILED for {} (client rejected APInox CA?): {}",
                            host_log, e
                        ));
                    }
                }
            }
            Err(e) => log_line(&format!("upgrade error: {}", e)),
        }
    });

    Response::builder()
        .status(StatusCode::OK)
        .body(Full::new(Bytes::new()))
        .unwrap()
}

fn rewrite_to_https(req: Request<Incoming>, hostname: &str) -> Request<Incoming> {
    let pq = req
        .uri()
        .path_and_query()
        .map(|pq| pq.as_str())
        .unwrap_or("/")
        .to_string();
    let absolute = format!("https://{}{}", hostname, pq);
    let (mut parts, body) = req.into_parts();
    if let Ok(uri) = absolute.parse() {
        parts.uri = uri;
    }
    Request::from_parts(parts, body)
}

/// Forward an (absolute-URI) HTTP request upstream, mirroring `handle_http`
/// in proxy/server.rs with the replace/breakpoint/mock stages reduced to
/// no-ops (no rules configured).
async fn handle_http(req: Request<Incoming>) -> Response<Full<Bytes>> {
    let start = std::time::Instant::now();
    let method = req.method().to_string();
    let url = req.uri().to_string();
    log_line(&format!("FWD {} {}", method, url));

    // Buffer the request body — same spooled reader as production.
    let body_bytes = match apinox_lib::utils::read_body(req.into_body(), None).await {
        Ok(b) => b.into_bytes().await.unwrap_or_default(),
        Err(e) => {
            log_line(&format!("read request body failed: {}", e));
            return error_response(StatusCode::BAD_GATEWAY, "Failed to read request body");
        }
    };
    let req_headers: Vec<(String, String)> = Vec::new(); // headers already stripped by into_body; not needed for GETs in this repro

    let client = &*PROXY_CLIENT;
    let req_method = match reqwest::Method::from_bytes(method.as_bytes()) {
        Ok(m) => m,
        Err(e) => {
            log_line(&format!("invalid method {}: {}", method, e));
            return error_response(StatusCode::BAD_REQUEST, "Invalid HTTP method");
        }
    };

    let mut rb = client.request(req_method, &url);
    for (k, v) in &req_headers {
        let lk = k.to_lowercase();
        if !matches!(
            lk.as_str(),
            "host" | "connection" | "keep-alive" | "proxy-connection"
                | "proxy-authorization" | "proxy-authenticate" | "te" | "trailers"
                | "transfer-encoding" | "upgrade" | "content-length" | "expect"
        ) {
            rb = rb.header(k.as_str(), v.as_str());
        }
    }
    if !body_bytes.is_empty() {
        rb = rb.body(body_bytes);
    }

    let (status, resp_headers, resp_body) = match rb.send().await {
        Ok(resp) => {
            let status = resp.status().as_u16();
            let resp_headers = resp
                .headers()
                .iter()
                .filter_map(|(k, v)| {
                    let lk = k.as_str().to_lowercase();
                    if matches!(
                        lk.as_str(),
                        "transfer-encoding" | "content-length" | "connection"
                            | "keep-alive" | "te" | "trailers" | "upgrade"
                    ) {
                        None
                    } else {
                        v.to_str().ok().map(|v| (k.as_str().to_string(), v.to_string()))
                    }
                })
                .collect::<Vec<_>>();
            let body_bytes = resp.bytes().await.unwrap_or_default();
            let body_str = String::from_utf8_lossy(&body_bytes).into_owned();
            log_line(&format!(
                "RESP {} {} ({} bytes) in {}ms",
                status,
                url,
                body_str.len(),
                start.elapsed().as_millis()
            ));
            (status, resp_headers, body_str)
        }
        Err(e) => {
            let msg = format!("Proxy forward error: {}", e);
            log_line(&format!("FWD ERR {} {}: {}", method, url, e));
            (502, Vec::new(), msg)
        }
    };

    let mut hb = Response::builder()
        .status(StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY));
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

    hb.body(Full::new(body_bytes))
        .unwrap_or_else(|_| error_response(StatusCode::INTERNAL_SERVER_ERROR, "Response build error"))
}

fn error_response(status: StatusCode, msg: &str) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain")
        .body(Full::new(Bytes::from(msg.to_string())))
        .unwrap()
}
