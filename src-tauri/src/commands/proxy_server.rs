use serde::Serialize;
use tauri::{AppHandle, State};

use crate::proxy_models::ProxyConfig;
use crate::proxy::server::run_proxy;
use crate::{ensure_proxy_state, LazyProxyAppState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyStatus {
    pub running: bool,
    pub port: Option<u16>,
    pub mode: String,
    pub target_url: String,
}

#[tauri::command]
pub async fn start_proxy(
    port: u16,
    mode: String,
    target_url: String,
    max_body_bytes: Option<u64>,
    state: State<'_, LazyProxyAppState>,
    app: AppHandle,
) -> Result<(), String> {
    let state = ensure_proxy_state(state, &app).await?;
    let mut ps = state.proxy.lock().await;

    if ps.running {
        return Err("Proxy is already running".to_string());
    }

    // Block startup if the CA cert has not been generated yet — the MITM TLS acceptor
    // needs it and there's no sensible fallback.
    if !state.cert_manager.info().exists {
        return Err(
            "CA certificate not found. Please generate it in Settings before starting the proxy."
                .to_string(),
        );
    }

    let config = ProxyConfig {
        enabled: true,
        port,
        target_url,
        mode,
        max_body_bytes,
    };
    ps.config = config.clone();

    let replacer = state.replacer.clone();
    let cert_manager = state.cert_manager.clone();
    let mock_state = state.mock.clone();
    let breakpoints = state.breakpoint.clone();

    // Spawn the server task and keep an abort handle
    let handle = tokio::spawn(async move {
        if let Err(e) = run_proxy(config, replacer, app, cert_manager, mock_state, breakpoints).await {
            log::error!("[Proxy] Server error: {}", e);
        }
    });

    ps.task = Some(handle.abort_handle());
    tokio::spawn(async move {
        if let Err(e) = handle.await {
            log::error!("[Proxy] Proxy server background task panicked: {:?}", e);
        }
    });
    ps.running = true;

    log::info!("[Proxy] Started on port {}", ps.config.port);
    Ok(())
}


#[tauri::command]
pub async fn stop_proxy(state: State<'_, LazyProxyAppState>, app: AppHandle) -> Result<(), String> {
    let state = ensure_proxy_state(state, &app).await?;
    let mut ps = state.proxy.lock().await;

    if let Some(handle) = ps.task.take() {
        handle.abort();
    }
    ps.running = false;

    log::info!("[Proxy] Stopped");
    Ok(())
}

#[tauri::command]
pub async fn get_proxy_status(state: State<'_, LazyProxyAppState>, app: AppHandle) -> Result<ProxyStatus, String> {
    let state = ensure_proxy_state(state, &app).await?;
    let ps = state.proxy.lock().await;
    Ok(ProxyStatus {
        running: ps.running,
        port: if ps.running { Some(ps.config.port) } else { None },
        mode: ps.config.mode.clone(),
        target_url: ps.config.target_url.clone(),
    })
}
