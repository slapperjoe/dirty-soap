//! Self-update mechanism for APInox.
//!
//! Checks GitHub Releases for newer versions, downloads the platform-appropriate
//! installer (Windows NSIS `.exe`, macOS `.dmg`), and applies it without leaving
//! the app.  On macOS the app mounts the DMG, copies the new bundle to a staging
//! path, then launches a small shell script that swaps the bundles after the app
//! has exited and re-opens it.

use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use crate::settings_manager::load_config_internal;

const GITHUB_API_URL: &str =
    "https://api.github.com/repos/slapperjoe/apinox/releases/latest";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

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

// ── Shared reqwest client factory ──────────────────────────────────────────

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

/// Builds an HTTP client that honours (in priority order):
///   1. The proxy configured in APInox settings (`network.proxy`)
///   2. The Windows manual system proxy (HKCU + HKLM registry)
///   3. WPAD / PAC file via .NET's GetSystemWebProxy() (PowerShell shim)
///   4. Environment variables `HTTPS_PROXY` / `HTTP_PROXY` (explicit check)
fn build_client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent(format!("APInox/{}", APP_VERSION));

    // 1. APInox configured proxy takes highest priority.
    let apinox_proxy = load_config_internal()
        .ok()
        .and_then(|c| c.network)
        .and_then(|n| n.proxy)
        .filter(|p| !p.is_empty());

    if let Some(proxy_url) = apinox_proxy {
        log::debug!("[Updater] Using APInox configured proxy: {}", proxy_url);
        match reqwest::Proxy::all(&proxy_url) {
            Ok(proxy) => { builder = builder.proxy(proxy); }
            Err(e) => { log::warn!("[Updater] Invalid APInox proxy URL '{}': {}", proxy_url, e); }
        }
    } else {
        // 2. Windows system proxy (HKCU and HKLM registry - covers manual and Group Policy).
        #[cfg(target_os = "windows")]
        let sys_proxy = read_windows_system_proxy();
        #[cfg(not(target_os = "windows"))]
        let sys_proxy: Option<String> = None;

        if let Some(proxy_url) = sys_proxy {
            log::debug!("[Updater] Using Windows system proxy: {}", proxy_url);
            match reqwest::Proxy::all(&proxy_url) {
                Ok(proxy) => { builder = builder.proxy(proxy); }
                Err(e) => { log::warn!("[Updater] Invalid system proxy URL '{}': {}", proxy_url, e); }
            }
        } else {
            // 3. WPAD / PAC — ask .NET for the effective proxy.
            #[cfg(target_os = "windows")]
            if let Some(wpad_proxy) = resolve_wpad_proxy("https://github.com") {
                log::debug!("[Updater] Using WPAD/PAC proxy: {}", wpad_proxy);
                match reqwest::Proxy::all(&wpad_proxy) {
                    Ok(proxy) => { builder = builder.proxy(proxy); }
                    Err(e) => { log::warn!("[Updater] Invalid WPAD proxy URL '{}': {}", wpad_proxy, e); }
                }
            }

            // 4. Explicit environment variable fallback (HTTPS_PROXY, HTTP_PROXY, ALL_PROXY).
            let env_proxy = std::env::var("HTTPS_PROXY")
                .or_else(|_| std::env::var("HTTP_PROXY"))
                .or_else(|_| std::env::var("ALL_PROXY"))
                .ok();
            if let Some(env_url) = env_proxy {
                if !env_url.is_empty() {
                    log::debug!("[Updater] Using environment proxy: {}", env_url);
                    match reqwest::Proxy::all(&env_url) {
                        Ok(proxy) => { builder = builder.proxy(proxy); }
                        Err(e) => { log::warn!("[Updater] Invalid env proxy URL '{}': {}", env_url, e); }
                    }
                }
            }
        }
    }

    builder.build().map_err(|e| format!("Failed to build HTTP client: {}", e))
}

/// Builds an HTTP client that bypasses all proxies.
///
/// Used as the first attempt for update checks so WPAD/PAC mis-detection
/// does not block environments where direct egress to GitHub works.
fn build_direct_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("APInox/{}", APP_VERSION))
        .no_proxy()
        .build()
        .map_err(|e| format!("Failed to build direct HTTP client: {}", e))
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

/// Makes a GET request, trying a direct (no-proxy) connection first.
///
/// Falls back to the proxy-aware client when the direct attempt:
/// - fails at the network level (connection refused, timeout, …), OR
/// - returns a non-success HTTP status other than 404.
///
/// 404 is passed through without a retry because it has a specific meaning in
/// the update-check context (no releases published yet), and a proxy will not
/// change the answer.
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
        "[Updater] Direct request to {} failed ({}), retrying via proxy-aware client",
        url,
        direct_reason
    );

    build_client()?
        .get(url)
        .send()
        .await
        .map_err(|proxy_err| {
            format!(
                "Direct request failed ({}) and proxy-aware request also failed ({})",
                direct_reason, proxy_err
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
        .map_err(|e| format!("Failed to open URL: {}", e))
}
