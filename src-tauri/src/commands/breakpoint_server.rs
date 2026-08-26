use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use crate::proxy_models::{BreakpointResolution, BreakpointRule, PausedTraffic};
use crate::{ensure_proxy_state, LazyProxyAppState};

#[tauri::command]
pub async fn get_breakpoint_rules(state: State<'_, LazyProxyAppState>, app: AppHandle) -> Result<Vec<BreakpointRule>, String> {
    let state = ensure_proxy_state(state, &app).await?;
    let rules = state.breakpoint.lock().await.get_rules();
    Ok(rules)
}

#[tauri::command]
pub async fn set_breakpoint_rules(
    rules: Vec<BreakpointRule>,
    state: State<'_, LazyProxyAppState>,
    app: AppHandle,
) -> Result<(), String> {
    let state = ensure_proxy_state(state, &app).await?;
    state.breakpoint.lock().await.set_rules(rules.clone());
    state.storage.save_breakpoint_rules(&rules).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_breakpoint_rule(
    rule: BreakpointRule,
    state: State<'_, LazyProxyAppState>,
    app: AppHandle,
) -> Result<BreakpointRule, String> {
    let state = ensure_proxy_state(state, &app).await?;
    let rule = if rule.id.is_empty() {
        BreakpointRule { id: Uuid::new_v4().to_string(), ..rule }
    } else {
        rule
    };
    let mut svc = state.breakpoint.lock().await;
    svc.add_rule(rule.clone());
    let rules = svc.get_rules();
    drop(svc);
    state.storage.save_breakpoint_rules(&rules).map_err(|e| e.to_string())?;
    Ok(rule)
}

#[tauri::command]
pub async fn update_breakpoint_rule(
    id: String,
    rule: BreakpointRule,
    state: State<'_, LazyProxyAppState>,
    app: AppHandle,
) -> Result<BreakpointRule, String> {
    let state = ensure_proxy_state(state, &app).await?;
    let mut svc = state.breakpoint.lock().await;
    let mut rules = svc.get_rules();
    let replaced = rules
        .iter_mut()
        .find(|r| r.id == id)
        .map(|r| {
            *r = BreakpointRule {
                id: r.id.clone(),
                ..rule
            };
            r.clone()
        });
    match replaced {
        Some(updated) => {
            svc.set_rules(rules.clone());
            drop(svc);
            state.storage.save_breakpoint_rules(&rules).map_err(|e| e.to_string())?;
            Ok(updated)
        }
        None => Err(format!("Breakpoint rule '{}' not found", id)),
    }
}

#[tauri::command]
pub async fn delete_breakpoint_rule(
    id: String,
    state: State<'_, LazyProxyAppState>,
    app: AppHandle,
) -> Result<(), String> {
    let state = ensure_proxy_state(state, &app).await?;
    let mut svc = state.breakpoint.lock().await;
    let mut rules = svc.get_rules();
    let before = rules.len();
    rules.retain(|r| r.id != id);
    if rules.len() == before {
        return Err(format!("Breakpoint rule '{}' not found", id));
    }
    svc.set_rules(rules.clone());
    drop(svc);
    state.storage.save_breakpoint_rules(&rules).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_paused_traffic(state: State<'_, LazyProxyAppState>, app: AppHandle) -> Result<Vec<PausedTraffic>, String> {
    let state = ensure_proxy_state(state, &app).await?;
    let paused = state.breakpoint.lock().await.get_paused_traffic();
    Ok(paused)
}

#[tauri::command]
pub async fn continue_breakpoint(
    id: String,
    modified_headers: Option<std::collections::HashMap<String, String>>,
    modified_body: Option<String>,
    modified_status_code: Option<u16>,
    state: State<'_, LazyProxyAppState>,
    app: AppHandle,
) -> Result<(), String> {
    let state = ensure_proxy_state(state, &app).await?;
    let resolution = BreakpointResolution {
        action: "continue".to_string(),
        modified_headers,
        modified_body,
        modified_status_code,
    };
    let resumed = state.breakpoint.lock().await.resume(&id, resolution);
    if resumed {
        // Notify webview of updated paused list
        let paused = state.breakpoint.lock().await.get_paused_traffic();
        let _ = app.emit("breakpoint-paused", &paused);
        Ok(())
    } else {
        Err(format!("Paused traffic '{}' not found", id))
    }
}

#[tauri::command]
pub async fn drop_breakpoint(
    id: String,
    state: State<'_, LazyProxyAppState>,
    app: AppHandle,
) -> Result<(), String> {
    let state = ensure_proxy_state(state, &app).await?;
    let dropped = state.breakpoint.lock().await.drop_traffic(&id);
    if dropped {
        let paused = state.breakpoint.lock().await.get_paused_traffic();
        let _ = app.emit("breakpoint-paused", &paused);
        Ok(())
    } else {
        Err(format!("Paused traffic '{}' not found", id))
    }
}
