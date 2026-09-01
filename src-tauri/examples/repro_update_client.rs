//! Controlled-reproduction updater client for the "update fails with OS proxy on"
//! bug (kanban t_b6c2aed3) and its fix (kanban t_ee14e263).
//!
//! This harness drives the REAL production updater HTTP-client construction from
//! `apinox_lib::updater` (`build_direct_client` and `build_client`) and replays
//! the exact `get_with_fallback` sequence used by `check_for_updates` /
//! `download_update`:
//!
//!     1. Try a direct (no-proxy) connection first.
//!     2. If that fails, retry through the proxy-aware client (which, on this
//!        host, picks up the OS proxy from $HTTPS_PROXY — set by APInox's
//!        set_system_proxy when it is "reading calls").
//!
//! Three modes:
//!
//!   untrusted  — the proxy-aware client uses the default rustls root store
//!                (webpki-roots), exactly like the PRE-FIX production client.
//!                It does NOT trust the APInox Root CA, so the MITM'd TLS
//!                handshake must fail. (Scenario A — the field failure.)
//!   trusted    — the proxy-aware client additionally roots the APInox CA
//!                (models "the user trusted APInox's CA", the reference fix
//!                from the original repro). The MITM becomes transparent and
//!                the update check should succeed. (Scenario B.)
//!   patched    — uses the REAL post-fix production factory
//!                `apinox_lib::updater::build_client()`, which roots the
//!                APInox CA discovered in `$APINOX_CONFIG_DIR`/ca.cer (set by
//!                run_repro.sh to the shared CA dir) and resolves the proxy
//!                with the new self-proxy guard. No other difference from
//!                `untrusted` — so a success here proves the production fix.
//!                (Scenario C.)
//!
//! Env:
//!   REPRO_GITHUB   (default "github-repro") — upstream fake-GitHub hostname
//!   REPRO_PROXY    (default "http://apinox-proxy:18888") — APInox MITM proxy
//!   REPRO_CA_PEM   (required for `trusted`) — path to the generated APInox CA
//!   APINOX_CONFIG_DIR (used by `patched`) — dir containing the APInox CA
//!                (`ca.cer`); the fixed build_client() roots it from here.
//!
//! The "URL" is https://<REPRO_GITHUB>/repos/slapperjoe/apinox/releases/latest,
//! mirroring GITHUB_API_URL in updater.rs (same path, fake host).

const GITHUB_PATH: &str = "/repos/slapperjoe/apinox/releases/latest";

use std::error::Error as _;

fn target_url(host: &str) -> String {
    format!("https://{host}{GITHUB_PATH}")
}

/// Mirrors `updater::get_with_fallback`: direct first, then proxy-aware.
/// `proxy_client` is the proxy-aware client (webpki by default, or rooted-CA).
/// Returns (direct_outcome, proxy_outcome, final_body_if_success).
fn err_chain(e: &reqwest::Error) -> String {
    let mut out = e.to_string();
    let mut src = e.source();
    while let Some(s) = src {
        out.push_str(" | ");
        out.push_str(&s.to_string());
        src = s.source();
    }
    out
}

async fn get_with_fallback(
    url: &str,
    direct: &reqwest::Client,
    proxy_client: &reqwest::Client,
) -> (String, String, Option<String>) {
    let direct_result = direct.get(url).send().await;

    let needs_fallback = match &direct_result {
        Ok(resp) => {
            let st = resp.status();
            !st.is_success() && st != reqwest::StatusCode::NOT_FOUND
        }
        Err(_) => true,
    };

    if !needs_fallback {
        let direct_outcome = match &direct_result {
            Ok(resp) => format!("HTTP {}", resp.status()),
            Err(e) => e.to_string(),
        };
        return (
            direct_outcome,
            "not attempted (direct succeeded)".into(),
            Some("direct succeeded".into()),
        );
    }

    let direct_reason = match &direct_result {
        Ok(resp) => format!("HTTP {}", resp.status()),
        Err(e) => e.to_string(),
    };
    eprintln!("[updater] direct request to {url} failed ({direct_reason}); retrying via proxy");

    match proxy_client.get(url).send().await {
        Ok(resp) => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            if status.is_success() {
                (direct_reason, format!("HTTP {status} via proxy"), Some(body))
            } else {
                (
                    direct_reason,
                    format!("HTTP {status} via proxy (non-success)"),
                    None,
                )
            }
        }
        Err(proxy_err) => {
            let msg = format!(
                "Direct request failed ({direct_reason}) and proxy-aware request also failed ({})",
                err_chain(&proxy_err)
            );
            (direct_reason, msg, None)
        }
    }
}

/// PRE-FIX shape of the proxy-aware client: rustls + webpki-roots only, no
/// APInox CA, proxy from REPRO_PROXY (== $HTTPS_PROXY in the container).
/// Models the production client from before t_ee14e263.
fn build_prefix_proxy_client(proxy: &str) -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("APInox/harness".to_string())
        .use_rustls_tls()
        .proxy(reqwest::Proxy::all(proxy).expect("parse proxy"))
        .connect_timeout(std::time::Duration::from_secs(15))
        .read_timeout(std::time::Duration::from_secs(60))
        .build()
        .expect("build pre-fix client")
}

#[tokio::main]
async fn main() {
    let mode = std::env::args().nth(1).unwrap_or_else(|| "untrusted".into());
    let gh_host = std::env::var("REPRO_GITHUB").unwrap_or_else(|_| "github-repro".into());
    let proxy = std::env::var("REPRO_PROXY").unwrap_or_else(|_| "http://apinox-proxy:18888".into());
    let url = target_url(&gh_host);

    eprintln!("[harness] mode={mode} proxy={proxy} url={url}");
    eprintln!(
        "[harness] HTTPS_PROXY env = {}",
        std::env::var("HTTPS_PROXY").unwrap_or_else(|_| "<unset>".into())
    );
    eprintln!(
        "[harness] APINOX_CONFIG_DIR env = {}",
        std::env::var("APINOX_CONFIG_DIR").unwrap_or_else(|_| "<unset>".into())
    );

    // ── Real production client construction from apinox_lib::updater ────────
    let direct_client = apinox_lib::updater::build_direct_client().expect("build_direct_client");

    let proxy_client: reqwest::Client = match mode.as_str() {
        "patched" => {
            // THE FIX: the real post-fix production factory. It roots the
            // APInox CA discovered in $APINOX_CONFIG_DIR/ca.cer (run_repro.sh
            // points it at the shared CA dir) and resolves the proxy through
            // the new self-proxy-guarded decision logic (env source here).
            apinox_lib::updater::build_client().expect("build_client (patched production)")
        }
        "trusted" => {
            // Model "the user trusted the APInox Root CA": add it to the root
            // store on top of webpki roots. `add_root_certificate` is
            // provider-agnostic in reqwest (works with the same use_rustls_tls()
            // base production build_client uses) and is exactly the API a
            // "trust the APInox CA" fix would call. The MITM path only ever
            // connects to the proxy (CONNECT + leaf from APInox CA), so a CA
            // root is sufficient to make the leaf validate.
            let ca_pem =
                std::env::var("REPRO_CA_PEM").expect("REPRO_CA_PEM required for trusted mode");
            let ca_pem_bytes = std::fs::read(&ca_pem).expect("read CA pem");
            let cert = reqwest::Certificate::from_pem(&ca_pem_bytes)
                .expect("parse CA pem");

            // Same construction as production build_client(): rustls + webpki roots,
            // plus the APInox CA, routed through the SAME proxy as the untrusted run
            // (REPRO_PROXY, i.e. $HTTPS_PROXY) — so the only difference between
            // scenarios A and B is whether the APInox Root CA is trusted.
            reqwest::Client::builder()
                .user_agent("APInox/harness".to_string())
                .use_rustls_tls()
                .add_root_certificate(cert)
                .proxy(reqwest::Proxy::all(&proxy).expect("parse proxy"))
                .connect_timeout(std::time::Duration::from_secs(15))
                .read_timeout(std::time::Duration::from_secs(60))
                .build()
                .expect("build rooted client")
        }
        _ => {
            // untrusted: pre-fix production shape — webpki-roots only, no APInox
            // CA. The only difference vs `patched` is CA discovery.
            build_prefix_proxy_client(&proxy)
        }
    };

    if mode == "patched" {
        // Surface the production route decision (same inputs as build_client):
        // on this container the env var is the only source, and the proxy is
        // non-loopback, so the self-proxy guard must NOT refuse it.
        let env_proxy = std::env::var("HTTPS_PROXY")
            .or_else(|_| std::env::var("HTTP_PROXY"))
            .or_else(|_| std::env::var("ALL_PROXY"))
            .ok();
        let decision = apinox_lib::updater::resolve_update_proxy(
            None, // no APInox settings proxy in the container
            None, // not Windows
            None, // no WPAD
            env_proxy,
        );
        match (&decision.proxy, &decision.self_proxy_blocked) {
            (Some(p), _) => {
                eprintln!("[harness] route decision: proxy {p} (source: {})", decision.source);
            }
            (None, Some(b)) => eprintln!("[harness] route decision: direct — {b}"),
            (None, None) => eprintln!("[harness] route decision: direct"),
        }
    }

    let (direct_outcome, proxy_outcome, body) =
        get_with_fallback(&url, &direct_client, &proxy_client).await;

    println!("==== RESULT (mode={mode}) ====");
    println!("direct : {direct_outcome}");
    println!("proxy  : {proxy_outcome}");
    match &body {
        Some(b) => {
            let trimmed: String = b.chars().take(400).collect();
            println!("body   : {trimmed}");
            let ok = body_contains_update(b);
            println!(
                "update check: {}",
                if ok { "SUCCEEDED (parsed release JSON)" } else { "FAILED" }
            );
        }
        None => {
            println!("body   : <none>");
            println!("update check: FAILED");
        }
    }
}

fn body_contains_update(body: &str) -> bool {
    body.contains("tag_name") && body.contains("browser_download_url")
}
