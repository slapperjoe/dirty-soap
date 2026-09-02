//! Self-update mechanism for APInox.
//!
//! Checks GitHub Releases for newer versions, downloads the platform-appropriate
//! installer (Windows NSIS `.exe`, macOS `.dmg`), and applies it without leaving
//! the app.  On macOS the app mounts the DMG, copies the new bundle to a staging
//! path, then launches a small shell script that swaps the bundles after the app
//! has exited and re-opens it.

use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use crate::settings_manager::load_config_internal;
use crate::utils::resolve_config_dir;

const GITHUB_API_URL: &str =
    "https://api.github.com/repos/slapperjoe/apinox/releases/latest";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

// Timeouts for update traffic so a dead proxy or a blocked/filtered direct
// egress can never hang the UI indefinitely (previously: no timeouts at all).
/// Connect-phase timeout for both update clients (check + download).
const UPDATE_CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
/// Per-read timeout. Resets on every successful read, so it catches stalled
/// connections without capping the *total* duration of a large installer
/// download (the payload can be >100 MB on slow links).
const UPDATE_READ_TIMEOUT: Duration = Duration::from_secs(60);

// ── Serializable result returned to the frontend ───────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    /// Human-readable reason why the update check could not complete.
    pub check_error: Option<String>,
    /// Platform-appropriate installer download URL:
    /// - Windows: NSIS `.exe` URL, or `None` when no matching asset was found.
    /// - macOS: `.dmg` URL, or `None` when no matching asset was found.
    /// - Other platforms: always `None` (use `release_url` for browser download).
    pub download_url: Option<String>,
    /// HTML URL of the release page — used for browser-open on non-Windows.
    pub release_url: String,
    /// Trimmed release body (first 2 000 chars).
    pub release_notes: String,
}

// ── Internal GitHub API shapes ─────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    assets: Vec<GitHubAsset>,
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

// ── Version comparison helper ──────────────────────────────────────────────

/// Returns `true` when `latest` is strictly newer than `current`.
/// Strips a leading `v`, then compares `[major, minor, patch]` numerically.
fn is_newer(latest: &str, current: &str) -> bool {
    let parse = |v: &str| -> [u64; 3] {
        let s = v.trim_start_matches('v');
        let parts: Vec<u64> = s
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect();
        [
            parts.first().copied().unwrap_or(0),
            parts.get(1).copied().unwrap_or(0),
            parts.get(2).copied().unwrap_or(0),
        ]
    };
    parse(latest) > parse(current)
}

// ── Proxy-aware update client support ───────────────────────────────────────
//
// When APInox is "reading calls" its TLS-MITM proxy is the machine's proxy
// (set_system_proxy points the OS proxy at 127.0.0.1:<apinox-port>), and on
// corporate networks direct egress to GitHub is usually the *blocked* path —
// so update traffic legitimately has to flow through APInox's own proxy.
//
// The updater clients are built with rustls + bundled webpki roots only; they
// never consult the OS trust store. APInox's own CA is therefore not trusted
// by them, and the MITM leaf the proxy presents for api.github.com fails with
// `UnknownIssuer` — update check and installer download both fail even though
// the user has "installed the APInox CA" in their browser/OS.
//
// The fix (scoped to update traffic only, client-side only — no OS proxy or
// cert-store mutation, zero side effects):
//   1. Root the APInox CA in the update clients' rustls root store via
//      `add_root_certificate` (mirrors what soap::client does for request
//      traffic). webpki roots stay in place, so non-MITM paths are unaffected.
//   2. Detect when a *auto-discovered* proxy (system registry, WPAD/PAC, or
//      env var) collides with an in-app listener — the self-proxy loop — and
//      refuse to route through ourselves. An *explicitly configured*
//      `network.proxy` is still honoured (user intent wins).
//   3. Bound every attempt with connect/read timeouts and report which route
//      was used (and why it failed) in the user-visible error.

/// Parses a proxy URL (`http://host:port`) into its host and port components.
fn parse_proxy_target(url: &str) -> Option<(&str, u16)> {
    let rest = url
        .trim()
        .strip_prefix("socks5://")
        .or_else(|| url.trim().strip_prefix("socks5h://"))
        .or_else(|| url.trim().strip_prefix("https://"))
        .or_else(|| url.trim().strip_prefix("http://"))
        .unwrap_or(url.trim());
    // Drop any path component (e.g. "http://proxy:3128/" from PAC scripts)
    // so only the host[:port] authority is parsed.
    let authority = rest.split('/').next().unwrap_or("");
    let (host, port_part) = authority.rsplit_once(':')?;
    let port = port_part.parse().ok()?;
    // Normalise IPv6 hosts ("[::1]" → "::1") so the loopback check below works.
    let host = host.trim_start_matches('[').trim_end_matches(']');
    Some((host, port))
}

/// True when a proxy URL points at a loopback/wildcard address that is a
/// candidate for one of APInox's own listeners.
///
/// Keying on loopback *addresses* (not on the port alone) keeps a legit
/// `127.0.0.1:3128` Squid/Clash working: only its *port* is then checked
/// against the in-app listener ports below.
#[allow(dead_code)] // used on all platforms; host check is informational
fn proxy_host_is_loopback_like(host: &str) -> bool {
    matches!(host, "localhost" | "127.0.0.1" | "::1" | "0.0.0.0")
}

/// In-app listener ports that update traffic must never be routed *through*.
///
/// The forward proxy and the mock server are the two listeners that MITM or
/// terminate traffic; the defaults match `proxy_models` (`8888` / `9001`).
#[allow(dead_code)] // used on all platforms; mock port is read where it exists
pub fn in_app_listener_ports() -> Vec<u16> {
    vec![
        crate::proxy_models::ProxyConfig::default().port,
        crate::proxy_models::MockConfig::default().port,
    ]
}

/// True when `proxy_url` is an auto-discovered proxy that collides with an
/// APInox in-app listener (the "self-proxy loop" — e.g. the OS proxy pointing
/// at APInox's own proxy while it reads calls, *and* the port matching).
#[allow(dead_code)] // used by tests and the self-proxy guard
pub fn is_self_proxy(proxy_url: &str) -> bool {
    match parse_proxy_target(proxy_url) {
        Some((host, port)) => {
            proxy_host_is_loopback_like(host) && in_app_listener_ports().contains(&port)
        }
        None => false,
    }
}

/// Loads the APInox Root CA PEM from the config dir.
///
/// Returns `None` when the CA has never been generated (user has never run
/// the proxy) or when it cannot be read — in both cases the update clients
/// fall back to webpki-roots only, exactly like before the fix.
#[allow(dead_code)] // used by both client factories and tests
pub fn load_apinox_ca_pem() -> Option<Vec<u8>> {
    let config_dir = resolve_config_dir().ok()?;
    let path = config_dir.join("ca.cer");
    if !path.is_file() {
        return None;
    }
    Some(std::fs::read(&path).ok()?)
}

/// Applies the fix to an update-client builder (scoped to update traffic):
/// switch to rustls (the client's TLS backend) and root the APInox CA next
/// to the webpki roots, so a leaf signed by APInox's own CA — as presented
/// by its MITM proxy — validates.
#[allow(dead_code)] // used by build_client/build_direct_client and tests
pub fn apply_apinox_ca_trust(
    builder: reqwest::ClientBuilder,
) -> reqwest::ClientBuilder {
    let mut builder = builder.use_rustls_tls();
    match load_apinox_ca_pem() {
        Some(pem) => match reqwest::Certificate::from_pem_bundle(&pem) {
            Ok(certs) => {
                log::info!(
                    "[Updater] Trusting APInox Root CA for update traffic ({} cert(s) from PEM bundle)",
                    certs.len()
                );
                for cert in certs {
                    builder = builder.add_root_certificate(cert);
                }
            }
            Err(e) => log::warn!(
                "[Updater] APInox CA PEM found but failed to parse ({}); update clients fall back to webpki roots only",
                e
            ),
        },
        None => {
            log::debug!("[Updater] No APInox CA in config dir — update clients use webpki roots only");
        }
    }
    builder
}

/// The proxy URL chosen for the proxy-aware update client, or `None` for a
/// direct connection. `proxy_url` is `Some` when the source is an APInox
/// user setting (explicitly configured, always honoured, reported to the UI).
pub struct UpdateProxyDecision {
    /// Proxy URL to route through, or `None` = connect directly.
    pub proxy: Option<String>,
    /// Where the decision came from: "apinox-settings", "system-registry",
    /// "wpad-pac", "env", or "none".
    pub source: String,
    /// Set when an auto-discovered proxy was refused because it collides
    /// with an in-app listener (self-proxy loop).
    pub self_proxy_blocked: Option<String>,
}

/// Resolves the proxy for update traffic in priority order:
///   1. APInox settings `network.proxy` — explicit user intent, always honoured
///      (even if it *is* an in-app listener port — R1: honour explicit config)
///   2. (Windows) system registry manual proxy
///   3. (Windows) WPAD/PAC via .NET
///   4. env `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`
///
/// Auto-discovered sources (2–4) are refused when they collide with an
/// in-app listener port: that is the self-proxy loop (update traffic would
/// go through APInox's own proxy while APInox is the one updating).
///
/// `#[doc(hidden)] pub` so `examples/repro_update_client.rs` can drive the
/// exact production decision logic in a controlled reproduction.
#[doc(hidden)]
pub fn resolve_update_proxy(
    proxy_url: Option<String>,
    sys_proxy: Option<String>,
    wpad_proxy: Option<String>,
    env_proxy: Option<String>,
) -> UpdateProxyDecision {
    // 1. Explicit APInox settings proxy wins unconditionally.
    if let Some(p) = proxy_url.filter(|p| !p.trim().is_empty()) {
        if is_self_proxy(&p) {
            log::warn!(
                "[Updater] APInox settings proxy '{p}' points at an APInox in-app listener; \
                 update traffic will loop through APInox itself. Honouring the setting, \
                 but updates will only succeed while APInox's own CA is trusted."
            );
        }
        return UpdateProxyDecision {
            proxy: Some(p),
            source: "apinox-settings".to_string(),
            self_proxy_blocked: None,
        };
    }

    let mut decision = UpdateProxyDecision {
        proxy: None,
        source: "none".to_string(),
        self_proxy_blocked: None,
    };

    for (candidate, source) in [
        (sys_proxy.as_deref(), "system-registry"),
        (wpad_proxy.as_deref(), "wpad-pac"),
        (env_proxy.as_deref(), "env"),
    ] {
        let Some(c) = candidate.filter(|c| !c.trim().is_empty()) else {
            continue;
        };

        if is_self_proxy(c) {
            log::warn!(
                "[Updater] Refusing to route update traffic through APInox's own listener \
                 ({source} proxy '{c}' collides with an in-app listener port). \
                 Update clients will connect directly instead."
            );
            decision.self_proxy_blocked =
                Some(format!("{source} proxy '{c}' is an APInox in-app listener (self-proxy loop)"));
            // Keep looking: a later source may yield a usable external proxy.
            continue;
        }

        decision.proxy = Some(c.to_string());
        decision.source = source.to_string();
        break;
    }

    decision
}

/// Builds an HTTP client that honours (in priority order):
///   1. The proxy configured in APInox settings (`network.proxy`)
///   2. The Windows manual system proxy (HKCU + HKLM registry)
///   3. WPAD / PAC file via .NET's GetSystemWebProxy() (PowerShell shim)
///   4. Environment variables `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY` (explicit check)
///
/// Update clients additionally root the APInox CA (see module docs) and carry
/// connect/read timeouts.
///
/// `#[doc(hidden)] pub` so `examples/repro_update_client.rs` can drive the
/// exact production client construction in a controlled reproduction.
#[doc(hidden)]
pub fn build_client() -> Result<reqwest::Client, String> {
    // 1. APInox configured proxy takes highest priority (explicit, never refused).
    let apinox_proxy = load_config_internal()
        .ok()
        .and_then(|c| c.network)
        .and_then(|n| n.proxy)
        .filter(|p| !p.is_empty());

    // 2. Windows system proxy (HKCU and HKLM registry - covers manual and Group Policy).
    #[cfg(target_os = "windows")]
    let sys_proxy = read_windows_system_proxy();
    #[cfg(not(target_os = "windows"))]
    let sys_proxy: Option<String> = None;

    // 3. WPAD / PAC — ask .NET for the effective proxy.
    #[cfg(target_os = "windows")]
    let wpad_proxy = resolve_wpad_proxy("https://github.com");
    #[cfg(not(target_os = "windows"))]
    let wpad_proxy: Option<String> = None;

    // 4. Explicit environment variable fallback (HTTPS_PROXY, HTTP_PROXY, ALL_PROXY).
    let env_proxy = std::env::var("HTTPS_PROXY")
        .or_else(|_| std::env::var("HTTP_PROXY"))
        .or_else(|_| std::env::var("ALL_PROXY"))
        .ok();

    let decision = resolve_update_proxy(apinox_proxy, sys_proxy, wpad_proxy, env_proxy);

    let mut builder = reqwest::Client::builder().user_agent(format!("APInox/{APP_VERSION}"));
    builder = apply_apinox_ca_trust(builder);
    builder = builder
        .connect_timeout(UPDATE_CONNECT_TIMEOUT)
        .read_timeout(UPDATE_READ_TIMEOUT);

    if let Some(proxy_url) = &decision.proxy {
        log::debug!("[Updater] Routing update traffic via proxy (source: {}): {proxy_url}", decision.source);
        match reqwest::Proxy::all(proxy_url) {
            Ok(proxy) => { builder = builder.proxy(proxy); }
            Err(e) => {
                log::warn!("[Updater] Invalid proxy URL '{proxy_url}': {e}; update clients will connect directly");
            }
        }
    } else {
        // IMPORTANT: reqwest auto-detects proxy env vars (HTTPS_PROXY, …) unless
        // the builder is told not to. After the self-proxy guard refused an
        // auto-discovered proxy we must *not* let reqwest quietly pick it up
        // again from the environment — that would defeat the guard.
        builder = builder.no_proxy();
        log::debug!("(source: {}); update clients will connect directly", decision.source);
    }

    builder.build().map_err(|e| format!("Failed to build HTTP client: {e}"))
}

/// Builds an HTTP client that bypasses all proxies.
///
/// Used as the first attempt for update checks so WPAD/PAC mis-detection
/// does not block environments where direct egress to GitHub works.
/// Also roots the APInox CA so a *direct* dial behind a transparent MITM
/// that uses APInox's CA still validates.
///
/// `#[doc(hidden)] pub` for the controlled reproduction example.
#[doc(hidden)]
pub fn build_direct_client() -> Result<reqwest::Client, String> {
    let builder = reqwest::Client::builder().user_agent(format!("APInox/{APP_VERSION}"));
    let builder = apply_apinox_ca_trust(builder);
    builder
        .no_proxy()
        .connect_timeout(UPDATE_CONNECT_TIMEOUT)
        .read_timeout(UPDATE_READ_TIMEOUT)
        .build()
        .map_err(|e| format!("Failed to build direct HTTP client: {e}"))
}

/// Reads the Windows system proxy from the Internet Settings registry key.
/// Returns `Some("http://host:port")` when a *manual* proxy is enabled, `None` otherwise.
/// Checks both HKCU (user) and HKLM (machine/Group Policy) registry hives.
#[cfg(target_os = "windows")]
fn read_windows_system_proxy() -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    // Try HKCU first (user-level manual proxy).
    if let Ok(hkcu) = RegKey::predef(HKEY_CURRENT_USER).open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings") {
        if let Ok(enabled) = hkcu.get_value::<u32, &str>("ProxyEnable") {
            if enabled == 1 {
                if let Ok(server) = hkcu.get_value::<String, &str>("ProxyServer") {
                    if !server.is_empty() {
                        if !server.contains("://") {
                            return Some(format!("http://{}", server));
                        }
                        return Some(server);
                    }
                }
            }
        }
    }

    // Fallback: try HKLM (Group Policy machine-level proxy).
    if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(r"Software\Policies\Microsoft\Windows\CurrentVersion\Internet Settings") {
        if let Ok(enabled) = hklm.get_value::<u32, &str>("ProxyEnable") {
            if enabled == 1 {
                if let Ok(server) = hklm.get_value::<String, &str>("ProxyServer") {
                    if !server.is_empty() {
                        if !server.contains("://") {
                            return Some(format!("http://{}", server));
                        }
                        return Some(server);
                    }
                }
            }
        }
    }

    // Also try the standard HKLM Internet Settings path (sometimes used by enterprise tools).
    if let Ok(hklm) = RegKey::predef(HKEY_LOCAL_MACHINE).open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings") {
        if let Ok(enabled) = hklm.get_value::<u32, &str>("ProxyEnable") {
            if enabled == 1 {
                if let Ok(server) = hklm.get_value::<String, &str>("ProxyServer") {
                    if !server.is_empty() {
                        if !server.contains("://") {
                            return Some(format!("http://{}", server));
                        }
                        return Some(server);
                    }
                }
            }
        }
    }

    None
}

/// Asks .NET (via a PowerShell subprocess) for the effective proxy for a given URL.
/// This handles WPAD auto-detect, PAC files, and Group Policy — the same path
/// that Edge and IE use.  Returns the proxy URL string, or `None` if direct or
/// if the lookup fails.
///
/// Result is cached for the lifetime of the process — the lookup only ever
/// runs once regardless of how many update checks the user triggers.
/// The PowerShell window is hidden via CREATE_NO_WINDOW.
#[cfg(target_os = "windows")]
fn resolve_wpad_proxy(target_url: &str) -> Option<String> {
    use once_cell::sync::OnceCell;
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    // Cache: only probe once per process lifetime.
    static CACHED: OnceCell<Option<String>> = OnceCell::new();
    return CACHED
        .get_or_init(|| wpad_probe(target_url))
        .clone();

    fn wpad_probe(target_url: &str) -> Option<String> {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;

        // Use a more robust PowerShell script that handles null returns and edge cases.
        // GetSystemWebProxy() can return null if .NET cannot initialize the proxy,
        // so we handle that gracefully.
        let script = format!(
            r#"
                try {{
                    $proxy = [System.Net.WebRequest]::GetSystemWebProxy();
                    if ($proxy -ne $null) {{
                        $uri = $proxy.GetProxy('{}');
                        if ($uri -ne $null) {{
                            $result = $uri.AbsoluteUri;
                            if ($result -ne '{}' -and $result.Trim() -ne '') {{
                                Write-Host $result;
                            }}
                        }}
                    }}
                }} catch {{
                    # .NET not available or proxy lookup failed
                }}
            "#,
            target_url, target_url
        );

        let output = Command::new("powershell")
            .args(["-NonInteractive", "-NoProfile", "-Command", &script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;

        if !output.status.success() {
            log::debug!("[Updater] PowerShell proxy lookup failed: {}", String::from_utf8_lossy(&output.stderr));
            return None;
        }

        let proxy = String::from_utf8_lossy(&output.stdout).trim().to_string();

        // .NET returns the original URL unchanged when no proxy is needed (direct).
        if proxy.is_empty() || proxy == target_url {
            return None;
        }

        log::debug!("[Updater] WPAD resolved proxy for {}: {}", target_url, proxy);
        Some(proxy)
    }
}

fn unavailable_result(reason: String) -> UpdateCheckResult {
    log::warn!("[Updater] Update check unavailable: {}", reason);
    UpdateCheckResult {
        current_version: APP_VERSION.to_string(),
        latest_version: APP_VERSION.to_string(),
        has_update: false,
        check_error: Some(reason),
        download_url: None,
        release_url: String::new(),
        release_notes: String::new(),
    }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/// Human-readable description of the route the proxy-aware client resolves to —
/// surfaced in user-visible update errors so the user (and we) can tell whether
/// update traffic goes "direct", via "proxy `http://…`" (and which source
/// picked it), or why an auto-discovered proxy was blocked.
#[allow(dead_code)] // used on all platforms; tests on non-Windows too
fn describe_update_route() -> String {
    let apinox_proxy = load_config_internal()
        .ok()
        .and_then(|c| c.network)
        .and_then(|n| n.proxy)
        .filter(|p| !p.is_empty());

    #[cfg(target_os = "windows")]
    let sys_proxy = read_windows_system_proxy();
    #[cfg(not(target_os = "windows"))]
    let sys_proxy: Option<String> = None;

    #[cfg(target_os = "windows")]
    let wpad_proxy = resolve_wpad_proxy("https://github.com");
    #[cfg(not(target_os = "windows"))]
    let wpad_proxy: Option<String> = None;

    let env_proxy = std::env::var("HTTPS_PROXY")
        .or_else(|_| std::env::var("HTTP_PROXY"))
        .or_else(|_| std::env::var("ALL_PROXY"))
        .ok();

    let decision = resolve_update_proxy(apinox_proxy, sys_proxy, wpad_proxy, env_proxy);
    match (&decision.proxy, &decision.self_proxy_blocked) {
        (Some(p), _) => format!("proxy {p} (source: {})", decision.source),
        (None, Some(blocked)) => format!("direct — {blocked}"),
        (None, None) => "direct".to_string(),
    }
}

/// Makes a GET request, trying a direct (no-proxy) connection first.
///
/// Falls back to the proxy-aware client when the direct attempt:
/// - fails at the network level (connection refused, timeout, …), OR
/// - returns a non-success HTTP status other than 404.
///
/// 404 is passed through without a retry because it has a specific meaning in
/// the update-check context (no releases published yet), and a proxy will not
/// change the answer.
///
/// Both clients root the APInox CA (so a MITM'd proxy route validates) and
/// carry connect/read timeouts. Every error returned from here reports which
/// route was used — "direct", "proxy `…` (source: …)", or the self-proxy
/// block reason.
async fn get_with_fallback(url: &str) -> Result<reqwest::Response, String> {
    let direct_client = build_direct_client()?;
    let direct_result = direct_client.get(url).send().await;

    let needs_fallback = match &direct_result {
        Ok(resp) => {
            !resp.status().is_success() && resp.status() != reqwest::StatusCode::NOT_FOUND
        }
        Err(_) => true,
    };

    if !needs_fallback {
        return direct_result.map_err(|e| e.to_string());
    }

    let direct_reason = match &direct_result {
        Ok(resp) => format!("HTTP {}", resp.status()),
        Err(e) => e.to_string(),
    };
    log::warn!(
        "[Updater] Direct request to {url} failed ({direct_reason}), retrying via proxy-aware client"
    );

    build_client()?
        .get(url)
        .send()
        .await
        .map_err(|proxy_err| {
            let route = describe_update_route();
            format!(
                "Direct request failed ({direct_reason}) and the proxy-aware request also failed ({proxy_err}). Route: {route}."
            )
        })
}

// ── Tauri commands ─────────────────────────────────────────────────────────

/// Calls the GitHub Releases API to determine whether a newer version exists.
#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateCheckResult, String> {
    let response = match get_with_fallback(GITHUB_API_URL).await {
        Ok(r) => r,
        Err(e) => return Ok(unavailable_result(e)),
    };

    let status = response.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        // No releases published yet — treat as "up to date"
        log::info!("[Updater] No releases found on GitHub (404) — skipping update check");
        return Ok(UpdateCheckResult {
            current_version: APP_VERSION.to_string(),
            latest_version: APP_VERSION.to_string(),
            has_update: false,
            check_error: None,
            download_url: None,
            release_url: String::new(),
            release_notes: String::new(),
        });
    }
    if !status.is_success() {
        return Ok(unavailable_result(format!(
            "GitHub API returned status {}",
            status
        )));
    }

    let release: GitHubRelease = match response.json().await {
        Ok(release) => release,
        Err(error) => {
            return Ok(unavailable_result(format!(
                "Failed to parse GitHub response: {}",
                error
            )));
        }
    };

    let latest_version = release.tag_name.trim_start_matches('v').to_string();
    let current_version = APP_VERSION.to_string();
    let has_update = is_newer(&latest_version, &current_version);

    // Only resolve a download URL when there is actually an update to grab.
    let download_url = if has_update {
        #[cfg(target_os = "windows")]
        let url = release.assets.iter()
            .find(|a| a.name.ends_with("_x64-setup.exe"))
            .map(|a| a.browser_download_url.clone());
        #[cfg(target_os = "macos")]
        let url = release.assets.iter()
            .find(|a| a.name.ends_with(".dmg"))
            .map(|a| a.browser_download_url.clone());
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        let url: Option<String> = None;
        url
    } else {
        None
    };

    let release_notes: String = release
        .body
        .unwrap_or_default()
        .trim()
        .chars()
        .take(2000)
        .collect();

    log::info!(
        "[Updater] Current: {} | Latest: {} | Update available: {}",
        current_version,
        latest_version,
        has_update
    );

    Ok(UpdateCheckResult {
        current_version,
        latest_version,
        has_update,
        check_error: None,
        download_url,
        release_url: release.html_url,
        release_notes,
    })
}

/// Downloads the installer at `download_url` to the system temp directory.
///
/// Emits `update-download-progress` events with payload `{ "percent": u32 }`
/// while streaming the download.  Returns the local file path on completion.
///
/// Tries a direct connection first; if that fails at the network or HTTP level
/// (e.g. a corporate proxy intercepts and blocks the request) the download is
/// retried via the proxy-aware client.
#[tauri::command]
#[allow(clippy::manual_checked_ops)] // total_bytes > 0 guard prevents division by zero
pub async fn download_update(
    app: tauri::AppHandle,
    download_url: String,
) -> Result<String, String> {
    let response = get_with_fallback(&download_url).await?;

    if !response.status().is_success() {
        return Err(format!(
            "Download server returned status {}",
            response.status()
        ));
    }

    let total_bytes = response.content_length().unwrap_or(0);
    #[cfg(target_os = "macos")]
    let dest_path = std::env::temp_dir().join("apinox-update.dmg");
    #[cfg(not(target_os = "macos"))]
    let dest_path = std::env::temp_dir().join("apinox-update.exe");

    let mut file = tokio::fs::File::create(&dest_path)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut last_percent: u32 = 0;
    let mut response = response;

    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("Download error: {}", e))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed to write chunk: {}", e))?;

        downloaded += chunk.len() as u64;

        if total_bytes > 0 {
            let percent = (downloaded * 100 / total_bytes) as u32;
            if percent != last_percent {
                last_percent = percent;
                app.emit(
                    "update-download-progress",
                    serde_json::json!({ "percent": percent }),
                )
                .ok();
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    let path_str = dest_path
        .to_str()
        .ok_or_else(|| "Invalid temp path".to_string())?
        .to_string();

    log::info!("[Updater] Download complete: {}", path_str);
    Ok(path_str)
}

/// Applies the downloaded installer and relaunches APInox.
///
/// - **Windows**: spawns the NSIS `.exe` installer and exits so it can replace
///   the running binary.
/// - **macOS**: mounts the `.dmg`, copies the new `.app` to a temp staging path,
///   strips the quarantine attribute, detaches the DMG, writes a small shell
///   script that swaps the bundles after the app has quit, launches it detached,
///   then exits.
/// - **Other platforms**: returns an error; use the browser link instead.
#[tauri::command]
pub async fn launch_installer(
    app: tauri::AppHandle,
    installer_path: String,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&installer_path)
            .spawn()
            .map_err(|e| format!("Failed to launch installer: {}", e))?;
        log::info!("[Updater] Installer launched: {}", installer_path);
        app.exit(0);
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        // Locate the running .app bundle: exe is at APInox.app/Contents/MacOS/APInox.
        let exe_path = std::env::current_exe()
            .map_err(|e| format!("Failed to locate running executable: {}", e))?;
        let app_bundle = exe_path
            .parent()                        // …/Contents/MacOS
            .and_then(|p| p.parent())        // …/Contents
            .and_then(|p| p.parent())        // …/APInox.app
            .ok_or_else(|| "Could not determine app bundle path from executable path".to_string())?
            .to_path_buf();

        let mount_point = std::env::temp_dir().join("apinox-dmg-mount");
        let temp_app    = std::env::temp_dir().join("APInox-update.app");

        // Strip quarantine from the DMG before hdiutil touches it.
        std::process::Command::new("xattr")
            .args(["-dr", "com.apple.quarantine", &installer_path])
            .output()
            .ok();

        // Detach any stale mount left from a previous update attempt.
        if mount_point.exists() {
            std::process::Command::new("hdiutil")
                .args(["detach", mount_point.to_str().unwrap_or(""), "-force"])
                .output()
                .ok();
        }

        // Mount the DMG silently (no Finder window).
        let mount_out = std::process::Command::new("hdiutil")
            .args([
                "attach", &installer_path,
                "-mountpoint", mount_point.to_str().unwrap_or(""),
                "-nobrowse",
                "-noverify",
            ])
            .output()
            .map_err(|e| format!("Failed to run hdiutil: {}", e))?;

        if !mount_out.status.success() {
            return Err(format!(
                "hdiutil attach failed: {}",
                String::from_utf8_lossy(&mount_out.stderr).trim()
            ));
        }

        // Find the .app bundle inside the mounted volume.
        let app_in_dmg = std::fs::read_dir(&mount_point)
            .map_err(|e| format!("Failed to read mounted DMG at {}: {}", mount_point.display(), e))?
            .filter_map(|e| e.ok())
            .find(|e| e.file_name().to_string_lossy().ends_with(".app"))
            .map(|e| e.path())
            .ok_or_else(|| "No .app bundle found in DMG".to_string())?;

        // Remove any stale staging copy.
        if temp_app.exists() {
            std::fs::remove_dir_all(&temp_app).ok();
        }

        // Copy the .app out of the DMG to a temp staging path.
        let cp_out = std::process::Command::new("cp")
            .args(["-r",
                app_in_dmg.to_str().unwrap_or(""),
                temp_app.to_str().unwrap_or(""),
            ])
            .output()
            .map_err(|e| format!("Failed to copy app bundle: {}", e))?;

        // Detach now — we have everything we need.
        std::process::Command::new("hdiutil")
            .args(["detach", mount_point.to_str().unwrap_or(""), "-force"])
            .output()
            .ok();

        if !cp_out.status.success() {
            return Err(format!(
                "Failed to copy app bundle from DMG: {}",
                String::from_utf8_lossy(&cp_out.stderr).trim()
            ));
        }

        // Strip quarantine from the staged .app so Gatekeeper won't block it.
        std::process::Command::new("xattr")
            .args(["-dr", "com.apple.quarantine", temp_app.to_str().unwrap_or("")])
            .output()
            .ok();

        // Spawn a helper that swaps bundles after the app exits.
        // Paths are passed as positional arguments ($1/$2) to avoid
        // shell injection — no interpolation into the script body.
        // Fix: replaced format!()-built shell script with safe Command arg passing.
        let app_bundle_str = app_bundle.to_string_lossy();
        let temp_app_str   = temp_app.to_string_lossy();
        std::process::Command::new("sh")
            .arg("-c")
            .arg("sleep 2; rm -rf \"$1\"; mv \"$2\" \"$1\"; open \"$1\"")
            .arg("sh")
            .arg(app_bundle_str.as_ref())
            .arg(temp_app_str.as_ref())
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn()
            .map_err(|e| format!("Failed to launch update script: {}", e))?;
        app.exit(0);
        return Ok(());
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (app, installer_path);
        Err("In-app installer launch is not supported on this platform — use the browser link instead".to_string())
    }
}

/// Opens a URL in the system default browser.
/// Used on non-Windows platforms to direct users to the GitHub release page.
#[tauri::command]
pub fn open_url_in_browser(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {e}"))
}

// ── Tests ───────────────────────────────────────────────────────────────────
//
// Tests that mutate the process-global `APINOX_CONFIG_DIR` env var (see
// `utils::resolve_config_dir`) must take `CONFIG_DIR_TEST_LOCK` — the same
// pattern `parsers::unified_explorer_commands` uses — because `cargo test`
// runs tests concurrently in one process.
// Tests that mutate proxy env vars (`HTTPS_PROXY` / `HTTP_PROXY` /
// `ALL_PROXY` / `NO_PROXY`, which `build_client` reads) must take
// `PROXY_ENV_TEST_LOCK` for the same reason.

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Serialize tests that swap `APINOX_CONFIG_DIR` (process-global env).
    static CONFIG_DIR_TEST_LOCK: Mutex<()> = Mutex::new(());

    /// Serialize tests that mutate proxy env vars (process-global).
    static PROXY_ENV_TEST_LOCK: Mutex<()> = Mutex::new(());

    /// RAII guard: points `APINOX_CONFIG_DIR` at `dir` and restores the
    /// previous value on drop, even on panic.
    struct ConfigDirGuard {
        prev: Option<String>,
    }

    impl ConfigDirGuard {
        fn set(dir: &std::path::Path) -> Self {
            let prev = std::env::var("APINOX_CONFIG_DIR").ok();
            std::env::set_var("APINOX_CONFIG_DIR", dir);
            Self { prev }
        }
    }

    impl Drop for ConfigDirGuard {
        fn drop(&mut self) {
            match &self.prev {
                Some(v) => std::env::set_var("APINOX_CONFIG_DIR", v),
                None => std::env::remove_var("APINOX_CONFIG_DIR"),
            }
        }
    }

    // ── is_newer ────────────────────────────────────────────────────────────

    #[test]
    fn test_is_newer_basic() {
        assert!(is_newer("2.0.0", "1.9.9"));
        assert!(is_newer("1.10.0", "1.9.9")); // numeric, not lexicographic
        assert!(is_newer("1.0.1", "1.0.0"));
        assert!(is_newer("v2.0.0", "1.9.9")); // v-prefix stripped on both sides
        assert!(!is_newer("v2.0.0", "v2.0.0")); // equal ⇒ not newer
        assert!(!is_newer("1.9.9", "2.0.0"));
        assert!(!is_newer("1.0.0", "1.0.0"));
        assert!(!is_newer("1.0.0", "1.0.1"));
        assert!(!is_newer("v1.0.0", "1.0.0"));
    }

    #[test]
    fn test_is_newer_malformed_segments_default_to_zero() {
        // "1.0-beta" → [1, 0, 0]; partial parses must not panic or misorder.
        assert!(is_newer("1.0", "0.9"));
        assert!(!is_newer("1.0", "1.0"));
        assert!(is_newer("2", "1.5.3"));
    }

    // ── parse_proxy_target / self-proxy detection ───────────────────────────

    #[test]
    fn test_parse_proxy_target_prefixes() {
        assert_eq!(parse_proxy_target("http://127.0.0.1:8888"), Some(("127.0.0.1", 8888)));
        assert_eq!(parse_proxy_target("https://proxy.corp:3128"), Some(("proxy.corp", 3128)));
        assert_eq!(parse_proxy_target("socks5://10.1.2.3:1080"), Some(("10.1.2.3", 1080)));
        assert_eq!(parse_proxy_target("socks5h://[::1]:1080"), Some(("::1", 1080)));
        assert_eq!(parse_proxy_target("127.0.0.1:8888"), Some(("127.0.0.1", 8888)));
        assert_eq!(parse_proxy_target("http://localhost:8888/"), Some(("localhost", 8888)));
    }

    #[test]
    fn test_parse_proxy_target_rejects_garbage() {
        assert_eq!(parse_proxy_target("not-a-url"), None);
        assert_eq!(parse_proxy_target("http://no-port-here"), None);
        assert_eq!(parse_proxy_target("http://127.0.0.1:notaport"), None);
        assert_eq!(parse_proxy_target(""), None);
    }

    #[test]
    fn test_is_self_proxy_flags_inapp_listeners_only() {
        // In-app listeners (loopback host + default listener port) → self.
        assert!(is_self_proxy("http://127.0.0.1:8888"));
        assert!(is_self_proxy("http://127.0.0.1:9001"));
        assert!(is_self_proxy("http://localhost:8888"));
        assert!(is_self_proxy("http://[::1]:8888".trim_start_matches('[')));
        assert!(is_self_proxy("socks5://127.0.0.1:9001"));

        // Legit local proxies on other ports must NOT be flagged.
        assert!(!is_self_proxy("http://127.0.0.1:3128"));
        // External proxies on a colliding port are not our listeners either.
        assert!(!is_self_proxy("http://10.0.0.5:8888"));
        // IPv6 loopback, bracketed (standard proxy-URL form).
        assert!(is_self_proxy("http://[::1]:8888"));
    }

    #[test]
    fn test_in_app_listener_ports_contains_defaults() {
        let ports = in_app_listener_ports();
        assert!(ports.contains(&crate::proxy_models::ProxyConfig::default().port));
        assert!(ports.contains(&crate::proxy_models::MockConfig::default().port));
    }

    // ── resolve_update_proxy ────────────────────────────────────────────────

    #[test]
    fn test_resolve_explicit_settings_proxy_always_honoured() {
        // R1: explicit user intent wins — even when it IS an in-app listener.
        let d = resolve_update_proxy(
            Some("http://127.0.0.1:8888".into()),
            Some("http://127.0.0.1:9999".into()),
            None,
            None,
        );
        assert_eq!(d.proxy.as_deref(), Some("http://127.0.0.1:8888"));
        assert_eq!(d.source, "apinox-settings");
        assert!(d.self_proxy_blocked.is_none(), "explicit self-proxy is honoured, not blocked");
    }

    #[test]
    fn test_resolve_explicit_proxy_beats_env() {
        let d = resolve_update_proxy(
            Some("http://proxy.corp:3128".into()),
            None,
            None,
            Some("http://127.0.0.1:1080".into()),
        );
        assert_eq!(d.proxy.as_deref(), Some("http://proxy.corp:3128"));
        assert_eq!(d.source, "apinox-settings");
    }

    #[test]
    fn test_resolve_blocks_auto_discovered_self_proxy() {
        // The field scenario: OS proxy = APInox's own listener while it reads calls.
        let d = resolve_update_proxy(None, Some("http://127.0.0.1:8888".into()), None, None);
        assert!(d.proxy.is_none(), "must not route through our own listener");
        assert!(d
            .self_proxy_blocked
            .as_deref()
            .is_some_and(|m| m.contains("127.0.0.1:8888") && m.contains("system-registry")));
    }

    #[test]
    fn test_resolve_blocked_self_proxy_falls_through_to_next_source() {
        // Self-proxy from the system registry is refused, but a later env source
        // that is NOT self-proxy is still usable.
        let d = resolve_update_proxy(
            None,
            Some("http://127.0.0.1:8888".into()),
            None,
            Some("http://corp-proxy:3128".into()),
        );
        assert_eq!(d.proxy.as_deref(), Some("http://corp-proxy:3128"));
        assert_eq!(d.source, "env");
        assert!(d.self_proxy_blocked.is_some());
    }

    #[test]
    fn test_resolve_priority_sys_wpad_env() {
        assert_eq!(
            resolve_update_proxy(
                None,
                Some("http://a:1".into()),
                Some("http://b:2".into()),
                Some("http://c:3".into())
            )
            .source,
            "system-registry"
        );
        assert_eq!(
            resolve_update_proxy(None, None, Some("http://b:2".into()), Some("http://c:3".into()))
                .source,
            "wpad-pac"
        );
        assert_eq!(
            resolve_update_proxy(None, None, None, Some("http://c:3".into())).source,
            "env"
        );
    }

    #[test]
    fn test_resolve_no_sources_means_direct() {
        let d = resolve_update_proxy(None, None, None, None);
        assert!(d.proxy.is_none());
        assert_eq!(d.source, "none");
        assert!(d.self_proxy_blocked.is_none());
    }

    #[test]
    fn test_resolve_empty_strings_are_ignored() {
        let d = resolve_update_proxy(Some("".into()), Some("   ".into()), None, Some("".into()));
        assert!(d.proxy.is_none());
        assert_eq!(d.source, "none");
    }

    // ── CA discovery ────────────────────────────────────────────────────────

    #[test]
    fn test_load_apinox_ca_pem_absent_and_present() {
        let _lock = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("apinox-upd-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();

        // No ca.cer yet (user never ran the proxy) → None, clients fall back.
        let g = ConfigDirGuard::set(&tmp);
        assert!(load_apinox_ca_pem().is_none());
        drop(g);

        // CA present (production layout: config dir / ca.cer) → Some(bytes).
        let ca_pem = b"-----BEGIN CERTIFICATE-----\nMIIBfake\n-----END CERTIFICATE-----\n";
        std::fs::write(tmp.join("ca.cer"), ca_pem).unwrap();
        let g = ConfigDirGuard::set(&tmp);
        assert_eq!(load_apinox_ca_pem().as_deref(), Some(ca_pem.as_slice()));
        drop(g);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[test]
    fn test_load_apinox_ca_pem_missing_config_dir_is_none() {
        let _lock = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let g = ConfigDirGuard::set(&std::env::temp_dir().join("apinox-upd-nonexistent"));
        assert!(load_apinox_ca_pem().is_none());
        drop(g);
    }

    // ── Client construction ─────────────────────────────────────────────────

    #[test]
    fn test_build_clients_with_and_without_ca() {
        let _lock = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("apinox-upd-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();

        // Without a CA (fresh install): both clients still build — webpki fallback.
        let g = ConfigDirGuard::set(&tmp);
        build_direct_client().expect("direct client builds without a CA");
        build_client().expect("proxy-aware client builds without a CA");
        drop(g);

        // With a CA: construction must not fail on the CA parse path.
        let mgr = crate::certificates::manager::CertManager::new(tmp.clone());
        mgr.generate().expect("generate test CA");
        let g = ConfigDirGuard::set(&tmp);
        build_direct_client().expect("direct client builds with a CA");
        build_client().expect("proxy-aware client builds with a CA");
        drop(g);

        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// End-to-end proof of the fix at the TLS layer, using production code paths:
    ///
    ///   - `CertManager::generate()` mints the APInox Root CA in a temp config dir
    ///   - `SniResolver` (the real proxy resolver) signs a leaf for
    ///     `api.github.com` with that CA — exactly what the MITM proxy presents
    ///   - a rustls client whose root store is built from `load_apinox_ca_pem()`
    ///     (the discovery path the fix wires into `build_direct_client`) completes
    ///     the handshake → the MITM is transparent
    ///   - the same handshake with an empty root store (the pre-fix client:
    ///     webpki roots only, no APInox CA) MUST fail
    ///   - then the rooted handshake succeeds again (same listener, same CA) —
    ///     the CA, not anything else, is the differentiator
    #[tokio::test]
    async fn test_mitm_leaf_validates_only_when_apinox_ca_roots() {
        use rustls::{ClientConfig, RootCertStore, ServerConfig};
        use std::io::Cursor;
        use std::sync::Arc;
        use tokio::net::{TcpListener, TcpStream};
        use tokio_rustls::{TlsAcceptor, TlsConnector};

        let _lock = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("apinox-upd-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();

        let mgr = Arc::new(crate::certificates::manager::CertManager::new(tmp.clone()));
        mgr.generate().expect("generate test CA");
        let g = ConfigDirGuard::set(&tmp);

        // Discovery must find exactly the CA the server is about to sign with.
        let discovered = load_apinox_ca_pem().expect("CA discovered from config dir");
        assert_eq!(discovered, std::fs::read(mgr.cert_path()).unwrap());

        // ── Server side: the real SNI resolver, real per-domain leaf ─────────
        let resolver = Arc::new(crate::certificates::sni_resolver::SniResolver {
            cert_manager: mgr.clone(),
        });
        let server_cfg = ServerConfig::builder_with_provider(Arc::new(
            rustls::crypto::ring::default_provider(),
        ))
        .with_protocol_versions(rustls::ALL_VERSIONS)
        .unwrap()
        .with_no_client_auth()
        .with_cert_resolver(resolver);
        let acceptor = TlsAcceptor::from(Arc::new(server_cfg));

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let server_task = tokio::spawn(async move {
            let mut listener = listener;
            loop {
                let (stream, _) = listener.accept().await.unwrap();
                // Handshake failures are swallowed: a failed client aborts the
                // connection before the server finishes, which is expected here.
                let _ = acceptor.accept(stream).await;
            }
        });

        // One TLS handshake against the shared listener, trusting only `roots`.
        async fn handshake(
            addr: &std::net::SocketAddr,
            roots: &rustls::RootCertStore,
        ) -> Result<(), std::io::Error> {
            let cfg = ClientConfig::builder_with_provider(Arc::new(
                rustls::crypto::ring::default_provider(),
            ))
            .with_protocol_versions(rustls::ALL_VERSIONS)
            .unwrap()
            .with_root_certificates(roots.clone())
            .with_no_client_auth();
            let connector = TlsConnector::from(Arc::new(cfg));
            let server_name = rustls::pki_types::ServerName::try_from("api.github.com")
                .unwrap()
                .to_owned();
            let tcp = TcpStream::connect(addr).await.unwrap();
            connector.connect(server_name, tcp).await.map(|_| ())
        }

        // ── Client A: root store = APInox CA (what the fix installs) ─────────
        let mut rooted = RootCertStore::empty();
        let ca_certs: Vec<_> = rustls_pemfile::certs(&mut Cursor::new(&discovered))
            .collect::<Result<_, _>>()
            .unwrap();
        for c in &ca_certs {
            rooted.add(c.clone()).unwrap();
        }
        handshake(&addr, &rooted)
            .await
            .expect("rooted client must validate the MITM leaf signed by the APInox CA");

        // ── Client B: empty root store (pre-fix: webpki only ⇒ no APInox CA) ─
        handshake(&addr, &RootCertStore::empty())
            .await
            .expect_err(
                "without the APInox CA the MITM leaf must FAIL (this was the production bug)",
            );

        // ── Client A again: same listener, same CA — CA is the differentiator ─
        handshake(&addr, &rooted)
            .await
            .expect("rooted client must validate again after the unrooted failure");

        server_task.abort();
        drop(g);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    // ── In-process MITM proxy (end-to-end integration tests) ───────────────
    //
    // Mirrors `examples/repro_proxy_server.rs` (the controlled-reproduction
    // harness): the REAL `CertManager` CA generation, the REAL `SniResolver`
    // per-domain leaf signing, and the same hyper HTTP/1 + rustls
    // `TlsAcceptor` CONNECT/TLS-MITM structure as `proxy::server::run_proxy` —
    // but the upstream "GitHub" is replaced by a fixed 200 JSON fixture, and
    // everything runs in-process on loopback, so the production update
    // clients can be driven end-to-end with zero egress.
    //
    // Target host `update.test` is deliberately the RFC 6761 reserved
    // `.test` TLD: it never resolves, so the direct (no-proxy) attempt in
    // `get_with_fallback` fails deterministically — mirroring the field
    // topology where direct egress to GitHub is blocked and the OS proxy
    // (APInox's own MITM proxy while "reading calls") is the only route.

    /// A GitHub Releases API response stand-in served by `TestProxy`.
    /// `assets` is included so the fixture also parses on Windows/macOS,
    /// where `GitHubRelease` requires the field.
    const GH_FIXTURE: &[u8] = br#"{
        "tag_name": "v99.0.0",
        "html_url": "https://update.test/release/1",
        "body": "Test release notes for the in-process update-proxy integration tests.",
        "assets": []
    }"#;

    /// In-process MITM proxy (real CA + real SNI leaf signing).
    struct TestProxy {
        addr: std::net::SocketAddr,
        connect_hits: Arc<AtomicUsize>,
        handle: tokio::task::JoinHandle<()>,
    }

    impl TestProxy {
        /// Generates the APInox Root CA in `ca_dir` (the production
        /// `CertManager::generate`) and starts serving CONNECT/TLS-MITM on
        /// `127.0.0.1:port`. Every tunneled (or plain-HTTP) request gets
        /// `GH_FIXTURE` back.
        async fn start(port: u16, ca_dir: &std::path::Path) -> std::io::Result<Self> {
            let mgr = Arc::new(crate::certificates::manager::CertManager::new(ca_dir.to_path_buf()));
            mgr
                .generate()
                .map_err(|e| std::io::Error::other(format!("CA generation failed: {e}")))?;

            let resolver = Arc::new(crate::certificates::sni_resolver::SniResolver {
                cert_manager: mgr,
            });
            let server_cfg = rustls::ServerConfig::builder_with_provider(Arc::new(
                rustls::crypto::ring::default_provider(),
            ))
            .with_protocol_versions(rustls::ALL_VERSIONS)
            .expect("rustls protocol versions")
            .with_no_client_auth()
            .with_cert_resolver(resolver);
            let acceptor = tokio_rustls::TlsAcceptor::from(Arc::new(server_cfg));

            let listener = TcpListener::bind(("127.0.0.1", port)).await?;
            let addr = listener.local_addr()?;
            let connect_hits = Arc::new(AtomicUsize::new(0));
            let hits_for_listener = connect_hits.clone();

            let handle = tokio::spawn(async move {
                let mut listener = listener;
                loop {
                    let (stream, _peer) = match listener.accept().await {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
                    let io = TokioIo::new(stream);
                    let acceptor = acceptor.clone();
                    let hits = hits_for_listener.clone();
                    tokio::spawn(async move {
                        let svc = service_fn(move |req: Request<Incoming>| {
                            let acceptor = acceptor.clone();
                            let hits = hits.clone();
                            async move {
                                Ok::<_, Infallible>(test_proxy_handle(req, acceptor, hits).await)
                            }
                        });
                        let _ = hyper::server::conn::http1::Builder::new()
                            .preserve_header_case(true)
                            .title_case_headers(true)
                            .serve_connection(io, svc)
                            .with_upgrades()
                            .await;
                    });
                }
            });

            Ok(Self { addr, connect_hits, handle })
        }

        fn connect_hits(&self) -> usize {
            self.connect_hits.load(Ordering::Relaxed)
        }
    }

    impl Drop for TestProxy {
        fn drop(&mut self) {
            self.handle.abort(); // also drops the listener it owns
        }
    }

    async fn test_proxy_handle(
        req: Request<Incoming>,
        acceptor: tokio_rustls::TlsAcceptor,
        hits: Arc<AtomicUsize>,
    ) -> Response<Full<Bytes>> {
        if req.method() == Method::CONNECT {
            hits.fetch_add(1, Ordering::Relaxed);
            tokio::spawn(async move {
                let upgraded = match hyper::upgrade::on(req).await {
                    Ok(u) => u,
                    Err(_) => return,
                };
                let stream = match acceptor.accept(TokioIo::new(upgraded)).await {
                    Ok(s) => s,
                    Err(_) => return,
                };
                let io = TokioIo::new(stream);
                let svc = service_fn(|_req: Request<Incoming>| async {
                    Ok::<_, Infallible>(test_proxy_fixture_response())
                });
                let _ = hyper::server::conn::http1::Builder::new()
                    .preserve_header_case(true)
                    .title_case_headers(true)
                    .serve_connection(io, svc)
                    .with_upgrades()
                    .await;
            });
            Response::builder()
                .status(StatusCode::OK)
                .body(Full::new(Bytes::new()))
                .unwrap()
        } else {
            test_proxy_fixture_response()
        }
    }

    fn test_proxy_fixture_response() -> Response<Full<Bytes>> {
        Response::builder()
            .status(StatusCode::OK)
            .header("content-type", "application/json")
            .header("content-length", GH_FIXTURE.len())
            .body(Full::new(Bytes::from_static(GH_FIXTURE)))
            .unwrap()
    }

    /// RAII guard: pins the four proxy env vars to exactly `vars`
    /// (None = unset) and restores the previous values on drop, so
    /// `build_client()` sees precisely what the test configures.
    const PROXY_ENV_VARS: [&str; 4] = ["HTTPS_PROXY", "HTTP_PROXY", "ALL_PROXY", "NO_PROXY"];

    struct ProxyEnvGuard {
        prev: [Option<String>; 4],
    }

    impl ProxyEnvGuard {
        fn set(vars: [Option<&str>; 4]) -> Self {
            let prev: [Option<String>; 4] = PROXY_ENV_VARS
                .iter()
                .map(|v| std::env::var(v).ok())
                .collect::<Vec<_>>()
                .try_into()
                .unwrap();
            for (v, val) in PROXY_ENV_VARS.iter().zip(vars.iter()) {
                match val {
                    Some(s) => std::env::set_var(v, s),
                    None => std::env::remove_var(v),
                }
            }
            Self { prev }
        }
    }

    impl Drop for ProxyEnvGuard {
        fn drop(&mut self) {
            for (v, val) in PROXY_ENV_VARS.iter().zip(self.prev.iter()) {
                match val {
                    Some(s) => std::env::set_var(v, s),
                    None => std::env::remove_var(v),
                }
            }
        }
    }

    /// Convenience: assert the four proxy env vars equal `expected`
    /// (None = unset) — the "OS proxy state intact" check.
    fn assert_proxy_env(expected: [Option<&str>; 4]) {
        for (v, want) in PROXY_ENV_VARS.iter().zip(expected.iter()) {
            let got = std::env::var(v).ok();
            let ok = match want {
                Some(w) => got.as_deref() == Some(*w),
                None => got.is_none(),
            };
            assert!(
                ok,
                "proxy env state changed: {v} expected {:?}, found {:?}",
                want,
                got
            );
        }
    }

    // ── Integration: update traffic end-to-end through the MITM proxy ──────

    /// Acceptance: "update succeeds with OS proxy enabled" / "APInox
    /// call-reading does not block the update".
    ///
    /// Field topology in one process: the OS proxy (here: `HTTPS_PROXY`,
    /// which `set_system_proxy` installs while APInox reads calls) points at
    /// a TLS-MITM proxy presenting a leaf signed by the APInox CA; direct
    /// egress to the target is dead (NXDOMAIN). The production
    /// `get_with_fallback` must fail over from the direct client to the
    /// proxy-aware client, validate the MITM leaf via the rooted APInox CA
    /// (the fix), and return the release JSON.
    #[tokio::test]
    async fn test_update_succeeds_through_mitm_proxy_when_os_proxy_enabled() {
        let _cfg_lock = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let _env_lock = PROXY_ENV_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());

        let tmp = std::env::temp_dir().join(format!("apinox-upd-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        let proxy = TestProxy::start(0, &tmp)
            .await
            .expect("in-process MITM proxy starts");
        let proxy_url = format!("http://{}", proxy.addr);
        let g = ConfigDirGuard::set(&tmp);
        let genv = ProxyEnvGuard::set([Some(proxy_url.as_str()), None, None, None]);

        // The proxy-aware client routes through the OS proxy it discovered.
        let route = describe_update_route();
        assert!(route.contains(&format!("proxy {proxy_url}")), "route: {route}");
        assert!(route.contains("source: env"), "route: {route}");

        // Production update path: direct first (fails — update.test never
        // resolves), then the proxy client validates the MITM leaf via the
        // APInox CA the fix roots into both clients.
        let resp = get_with_fallback("https://update.test/releases/latest")
            .await
            .expect("update check must succeed through the APInox MITM proxy once the APInox CA is trusted");
        assert_eq!(resp.status(), reqwest::StatusCode::OK);
        let release: GitHubRelease = resp.json().await.expect("fixture parses as a GitHub release");
        assert_eq!(release.tag_name, "v99.0.0");
        assert!(
            is_newer(&release.tag_name, APP_VERSION),
            "v99.0.0 must register as an update over {APP_VERSION}"
        );
        assert!(
            proxy.connect_hits() > 0,
            "update traffic must have flowed through the proxy (CONNECT hits: {})",
            proxy.connect_hits()
        );

        // The update flow is read-only with respect to proxy state: the OS
        // proxy is exactly what it was before, and no other proxy var was
        // introduced.
        assert_proxy_env([Some(proxy_url.as_str()), None, None, None]);

        drop(genv);
        drop(g);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Acceptance: "proxy state is restored after success AND failure".
    ///
    /// Runs the full success path (live MITM proxy) and then the full
    /// failure path (OS proxy on a dead port, direct egress NXDOMAIN — both
    /// attempts die), and asserts afterwards that the OS proxy state (env)
    /// and the APInox settings are byte-for-byte what they were before: the
    /// update machinery never mutates proxy or settings state.
    #[tokio::test]
    async fn test_proxy_state_invariant_after_update_success_and_failure() {
        let _cfg_lock = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let _env_lock = PROXY_ENV_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());

        let tmp = std::env::temp_dir().join(format!("apinox-upd-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        let proxy = TestProxy::start(0, &tmp)
            .await
            .expect("in-process MITM proxy starts");
        let g = ConfigDirGuard::set(&tmp);
        // The update flow must never create a settings file.
        assert!(!tmp.join("config.jsonc").exists(), "precondition: no settings file yet");

        // Settings snapshot before any update activity (temp dir ⇒ defaults).
        let pre_config = load_config_internal()
            .map(|c| serde_json::to_string(&c).expect("config serializes"))
            .unwrap_or_default();

        // Phase 1 — success: OS proxy enabled, live MITM proxy, CA trusted.
        let proxy_url = format!("http://{}", proxy.addr);
        let genv = ProxyEnvGuard::set([Some(proxy_url.as_str()), None, None, None]);
        let resp = get_with_fallback("https://update.test/releases/latest")
            .await
            .expect("success path through the proxy");
        assert_eq!(resp.status(), reqwest::StatusCode::OK);
        let _body = resp.text().await.expect("response body readable");
        assert_proxy_env([Some(proxy_url.as_str()), None, None, None]);

        // Phase 2 — failure: OS proxy points at a dead port (connect refused);
        // direct egress is NXDOMAIN. Both attempts must fail, and the error
        // must report the route it used.
        let genv = ProxyEnvGuard::set([Some("http://127.0.0.1:1"), None, None, None]);
        let err = get_with_fallback("https://update.test/releases/latest")
            .await
            .expect_err("both routes must fail in this topology");
        assert!(
            err.contains("Route: proxy http://127.0.0.1:1 (source: env)"),
            "failure must report the route used: {err}"
        );

        // After success AND failure: OS proxy state and settings are exactly
        // as they were. (The guard still holds phase 2's value — proving the
        // production code never overwrote it.)
        assert_proxy_env([Some("http://127.0.0.1:1"), None, None, None]);
        let post_config = load_config_internal()
            .map(|c| serde_json::to_string(&c).expect("config serializes"))
            .unwrap_or_default();
        assert_eq!(pre_config, post_config, "update traffic must not mutate settings");
        assert!(!tmp.join("config.jsonc").exists(), "update flow must not create a settings file");

        drop(genv);
        drop(g);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// Acceptance: "NO_PROXY or direct bypass is used for update traffic" —
    /// the self-proxy guard at the client level.
    ///
    /// While APInox reads calls, the OS proxy can point at APInox's own
    /// listener (an in-app default port). Auto-discovered, that is the
    /// self-proxy loop: `build_client` must refuse it and connect DIRECTLY
    /// (reqwest `no_proxy()` — which also disables env-var auto-detection),
    /// instead of looping update traffic through itself. The failure then
    /// reports "direct — … (self-proxy loop)" and is a DNS failure for the
    /// target (a direct dial was made), not a proxy hop.
    #[tokio::test]
    async fn test_self_proxy_env_blocked_and_direct_bypass_used() {
        let _cfg_lock = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let _env_lock = PROXY_ENV_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());

        let tmp = std::env::temp_dir().join(format!("apinox-upd-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();
        // CA present, like a user who has run the proxy (field state).
        let mgr = crate::certificates::manager::CertManager::new(tmp.clone());
        mgr.generate().expect("generate test CA");
        let g = ConfigDirGuard::set(&tmp);

        // OS proxy = APInox's own forward-proxy listener (default port).
        let self_proxy_url = format!("http://127.0.0.1:{}", in_app_listener_ports()[0]);
        let genv = ProxyEnvGuard::set([Some(self_proxy_url.as_str()), None, None, None]);

        // Decision: the auto-discovered self-proxy is refused.
        let route = describe_update_route();
        assert!(route.starts_with("direct —"), "route: {route}");
        assert!(route.contains("self-proxy loop"), "route: {route}");
        assert!(route.contains(&self_proxy_url), "route: {route}");

        // The production flow still attempts direct egress and fails on DNS
        // for the target — proving it never took the (self) proxy path.
        let err = get_with_fallback("https://update.test/releases/latest")
            .await
            .expect_err("direct egress is blocked in this topology");
        assert!(err.contains("Route: direct —"), "error: {err}");
        assert!(err.contains("self-proxy loop"), "error: {err}");
        assert!(
            err.contains("dns"),
            "direct dial must have been attempted (DNS failure), not a proxy hop: {err}"
        );

        // Proxy state untouched.
        assert_proxy_env([Some(self_proxy_url.as_str()), None, None, None]);

        drop(genv);
        drop(g);
        let _ = std::fs::remove_dir_all(&tmp);
    }

    /// R1 at the end-to-end level: an EXPLICITLY configured `network.proxy`
    /// pointing at an APInox in-app listener is still honoured (user intent
    /// wins over the self-proxy guard) — and because the clients root the
    /// APInox CA, the update genuinely succeeds through APInox's own proxy.
    #[tokio::test]
    async fn test_explicit_settings_self_proxy_honoured_end_to_end() {
        let _cfg_lock = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let _env_lock = PROXY_ENV_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());

        let tmp = std::env::temp_dir().join(format!("apinox-upd-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).unwrap();

        // `is_self_proxy` only flags in-app DEFAULT listener ports, so the
        // test proxy must listen on one of them; fall back to the second
        // default if a dev instance occupies the first.
        let port = in_app_listener_ports()
            .iter()
            .copied()
            .find(|p| std::net::TcpListener::bind(("127.0.0.1", *p)).is_ok())
            .expect("an in-app default listener port is bindable in this environment");
        let proxy = TestProxy::start(port, &tmp)
            .await
            .expect("in-process MITM proxy starts on the in-app default port");
        let g = ConfigDirGuard::set(&tmp);

        // Explicit setting (no env proxy at all).
        std::fs::write(
            tmp.join("config.jsonc"),
            format!(
                "{{\n  \"version\": 1,\n  \"network\": {{\n    \"proxy\": \"http://127.0.0.1:{port}\"\n  }}\n}}\n"
            ),
        )
        .unwrap();
        let genv = ProxyEnvGuard::set([None, None, None, None]);

        // Explicit settings proxy wins and is NOT blocked, even though it is
        // APInox's own listener.
        let route = describe_update_route();
        assert!(route.contains("source: apinox-settings"), "route: {route}");
        assert!(route.contains(&format!("proxy http://127.0.0.1:{port}")), "route: {route}");

        // Direct attempt dies (NXDOMAIN); the proxy client honours the
        // explicit setting and succeeds through APInox's own MITM proxy
        // thanks to the rooted CA.
        let resp = get_with_fallback("https://update.test/releases/latest")
            .await
            .expect("explicit self-proxy + trusted APInox CA must let the update succeed through APInox's own proxy");
        assert_eq!(resp.status(), reqwest::StatusCode::OK);
        let release: GitHubRelease = resp.json().await.expect("fixture parses as a GitHub release");
        assert_eq!(release.tag_name, "v99.0.0");
        assert!(proxy.connect_hits() > 0, "explicit proxy route must have been used");

        // Settings untouched by the update flow (it only reads them).
        let after = std::fs::read_to_string(tmp.join("config.jsonc")).unwrap();
        assert!(after.contains(&format!("\"proxy\": \"http://127.0.0.1:{port}\"")));

        drop(genv);
        drop(g);
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
