// Prevent additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex as StdMutex, OnceLock,
};
use std::time::Instant;
use tauri::Manager;
use tokio::sync::Mutex;

mod project_storage;
mod history_storage;
mod scrapbook_storage;
mod notes_storage;
mod secret_storage;
pub mod settings_manager;
pub mod updater;
mod soapui_importer;
mod workspace_export;
#[cfg(test)]
mod e2e_unified_explorer;

// Rust backend modules (APInox)
pub mod utils;
pub mod http;
pub mod soap;
pub mod parsers;
pub mod testing;
pub mod workflow;

// Proxy/mock/cert modules (from APIprox integration)
pub mod performance;
pub mod proxy_models;
pub mod proxy;
pub mod mock;
pub mod replacer;
pub mod breakpoint;
pub mod filewatcher;
pub mod certificates;
pub mod storage;
pub mod commands;

#[cfg(target_os = "macos")]
use tauri_plugin_decorum::WebviewWindowExt;

#[cfg(windows)]
use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR};
#[cfg(windows)]
use windows::Win32::Foundation::HWND;

static LOG_FILE_PATH: StdMutex<Option<String>> = StdMutex::new(None);
static STARTUP_TIMER: OnceLock<Instant> = OnceLock::new();
static STARTUP_REPORTED: AtomicBool = AtomicBool::new(false);

fn report_startup_timing() {
    if STARTUP_REPORTED.swap(true, Ordering::Relaxed) {
        return;
    }

    if let Some(started_at) = STARTUP_TIMER.get() {
        let elapsed_ms = started_at.elapsed().as_millis();
        println!("[startup] main window ready in {} ms", elapsed_ms);
        log::info!("[startup] Main window ready in {} ms", elapsed_ms);
    }
}

/// Shared state for all proxy/mock/cert services (APIprox integration).
#[derive(Clone)]
pub struct ProxyAppState {
    pub proxy: proxy::state::SharedProxyState,
    pub mock: mock::state::SharedMockState,
    pub replacer: replacer::service::SharedReplacerService,
    pub breakpoint: breakpoint::service::SharedBreakpointService,
    pub filewatcher: filewatcher::service::SharedFileWatcherService,
    pub storage: Arc<storage::rules::RulesStorage>,
    pub cert_manager: Arc<certificates::manager::CertManager>,
}

pub struct LazyProxyAppState {
    inner: Mutex<Option<ProxyAppState>>,
}

impl LazyProxyAppState {
    fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }
}

pub async fn ensure_proxy_state(
    state: tauri::State<'_, LazyProxyAppState>,
    app: &tauri::AppHandle,
) -> Result<ProxyAppState, String> {
    let mut guard = state.inner.lock().await;

    if let Some(existing) = guard.as_ref() {
        return Ok(existing.clone());
    }

    let started_at = Instant::now();
    log::info!("[Proxy] Lazy initialization starting");

    let initialized = build_proxy_state(app).await?;

    *guard = Some(initialized.clone());

    let elapsed_ms = started_at.elapsed().as_millis();
    println!("[startup] proxy state initialized in {} ms", elapsed_ms);
    log::info!("[Proxy] Lazy initialization completed in {} ms", elapsed_ms);

    Ok(initialized)
}

#[cfg(desktop)]
#[tauri::command]
fn close_splashscreen(app: tauri::AppHandle) {
    if let Some(splash) = app.get_webview_window("splashscreen") {
        splash.close().ok();
        log::info!("Splashscreen closed");
    }
    if let Some(main) = app.get_webview_window("main") {
        main.show().ok();
        main.set_focus().ok();
        log::info!("Main window shown");
    }

    report_startup_timing();
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    log::info!("Quit command received, exiting...");
    app.exit(0);
}

#[tauri::command]
fn set_border_color(window: tauri::Window, color: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        
        // Parse hex color string (e.g., "#1e1e1e" or "1e1e1e")
        let color_str = color.trim_start_matches('#');
        let rgb = u32::from_str_radix(color_str, 16)
            .map_err(|e| format!("Invalid color format: {}", e))?;
        
        // Convert RGB to BGR (Windows uses BGR format)
        let r = (rgb >> 16) & 0xFF;
        let g = (rgb >> 8) & 0xFF;
        let b = rgb & 0xFF;
        let bgr = (b << 16) | (g << 8) | r;
        
        if let Ok(handle) = window.window_handle() {
            if let RawWindowHandle::Win32(win32_handle) = handle.as_ref() {
                let hwnd = HWND(win32_handle.hwnd.get() as _);
                
                unsafe {
                    DwmSetWindowAttribute(
                        hwnd,
                        DWMWA_BORDER_COLOR,
                        &bgr as *const _ as *const _,
                        std::mem::size_of::<u32>() as u32,
                    ).map_err(|e| format!("Failed to set border color: {:?}", e))?;
                }
                
                log::info!("Updated window border color to: {}", color);
                return Ok(());
            }
        }
    }
    
    #[cfg(not(windows))]
    {
        let _ = (window, color);
    }
    
    Ok(())
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_platform_os() -> String {
    #[cfg(target_os = "macos")]
    return "macos".to_string();
    
    #[cfg(target_os = "windows")]
    return "windows".to_string();
    
    #[cfg(target_os = "linux")]
    return "linux".to_string();

    #[cfg(target_os = "android")]
    return "android".to_string();

    #[cfg(target_os = "ios")]
    return "ios".to_string();

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux", target_os = "android", target_os = "ios")))]
    return "unknown".to_string();
}

#[tauri::command]
fn get_config_dir() -> Option<String> {
    utils::resolve_config_dir().ok().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn get_debug_info() -> serde_json::Value {
    let config_dir = utils::resolve_config_dir().ok().map(|p| p.to_string_lossy().to_string());
    let log_path = LOG_FILE_PATH.lock().ok().and_then(|p| p.clone());

    let platform = {
        #[cfg(target_os = "macos")]
        { "macos" }
        #[cfg(target_os = "windows")]
        { "windows" }
        #[cfg(target_os = "linux")]
        { "linux" }
        #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
        { "unknown" }
    };

    let arch = std::env::consts::ARCH;

    serde_json::json!({
        "mode": "Tauri",
        "version": env!("CARGO_PKG_VERSION"),
        "platform": platform,
        "arch": arch,
        "configDir": config_dir,
        "logPath": log_path,
        "debug": cfg!(debug_assertions),
    })
}

#[tauri::command]
fn get_tauri_logs(lines: Option<usize>) -> Result<Vec<String>, String> {
    let log_path = LOG_FILE_PATH.lock()
        .ok()
        .and_then(|path| path.clone())
        .ok_or_else(|| "Log file path not available".to_string())?;
    
    let content = std::fs::read_to_string(&log_path)
        .map_err(|e| format!("Failed to read log file: {}", e))?;
    
    let all_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
    
    let result = if let Some(count) = lines {
        all_lines.iter().rev().take(count).rev().cloned().collect()
    } else {
        all_lines
    };
    
    Ok(result)
}

/// Apply custom window styling on Windows
#[cfg(windows)]
fn apply_window_styling(window: &tauri::WebviewWindow) {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    
    if let Ok(handle) = window.window_handle() {
        if let RawWindowHandle::Win32(win32_handle) = handle.as_ref() {
            let hwnd = HWND(win32_handle.hwnd.get() as _);
            
            // Set initial border color to dark theme
            // The frontend will update this based on actual theme
            let color: u32 = 0x001e1e1e; // Dark theme default
            
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_BORDER_COLOR,
                    &color as *const _ as *const _,
                    std::mem::size_of::<u32>() as u32,
                );
            }
            
            log::info!("Applied initial window border styling (theme will update it)");
        }
    }
}

/// Initialise file logging and store the log path for diagnostics.
fn init_logging(app: &mut tauri::App) -> tauri::Result<()> {
    let log_dir = app.path().app_log_dir().unwrap_or_else(|_| {
        app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir())
    });
    std::fs::create_dir_all(&log_dir).ok();

    let log_file = log_dir.join("apinox.log");
    if let Ok(mut guard) = LOG_FILE_PATH.lock() {
        *guard = Some(log_file.to_string_lossy().to_string());
    }

    app.handle().plugin(
        tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Debug)
            .targets([
                tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: Some("apinox.log".to_string()) }
                ),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Webview),
            ])
            .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
            .max_file_size(5_000_000)
            .build(),
    )?;

    // Initialize decorum plugin on desktop only (mobile doesn't support it)
    #[cfg(desktop)]
    app.handle().plugin(tauri_plugin_decorum::init())?;

    log::info!("APInox starting (version: {})", env!("CARGO_PKG_VERSION"));
    log::info!("Debug mode: {}", cfg!(debug_assertions));
    if let Ok(guard) = LOG_FILE_PATH.lock() {
        if let Some(ref path) = *guard {
            log::info!("Logs will be written to: {}", path);
        }
    }

    // On Android, set APINOX_CONFIG_DIR to the sandboxed app data dir.
    #[cfg(target_os = "android")]
    {
        if let Ok(data_dir) = app.path().app_data_dir() {
            let config_dir = data_dir.join("apinox");
            std::env::set_var("APINOX_CONFIG_DIR", config_dir.to_string_lossy().as_ref());
            log::info!("Android: APINOX_CONFIG_DIR set to {:?}", config_dir);
        }
    }

    Ok(())
}

/// Configure the main/splashscreen windows (sizing, decorations, platform styling).
fn init_window(app: &mut tauri::App) {
    // Size and centre the splashscreen to half the primary monitor dimensions.
    #[cfg(desktop)]
    if let Some(splash) = app.get_webview_window("splashscreen") {
        // Check config for splashscreenEnabled (default: false)
        let splashscreen_enabled = settings_manager::load_config_internal()
            .ok()
            .and_then(|c| c.ui)
            .and_then(|u| u.splashscreen_enabled)
            .unwrap_or(false);
        
        if !splashscreen_enabled {
            log::info!("Splash screen disabled by config, skipping");
            return;
        }
        
        if let Ok(Some(monitor)) = splash.primary_monitor() {
            let scale = monitor.scale_factor();
            let phys = monitor.size();
            let logical_w = (phys.width as f64 / scale / 2.0) as u32;
            let logical_h = (phys.height as f64 / scale / 2.0) as u32;
            if let Err(e) = splash.set_size(tauri::LogicalSize::new(logical_w, logical_h)) {
                log::warn!("Failed to resize splashscreen: {:?}", e);
            }
            if let Err(e) = splash.center() {
                log::warn!("Failed to center splashscreen: {:?}", e);
            }
            log::info!("Splashscreen sized to {}x{} logical px (monitor: {}x{} physical, scale: {})",
                logical_w, logical_h, phys.width, phys.height, scale);
            let _ = splash.show();
        } else {
            let _ = splash.center();
            let _ = splash.show();
        }
    }

    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        if let Err(e) = window.set_min_size(Some(tauri::LogicalSize::new(800.0_f64, 600.0_f64))) {
            log::warn!("Failed to set minimum window size: {:?}", e);
        }
    }

    // Windows: remove native titlebar and apply border colour.
    #[cfg(windows)]
    {
        if let Some(window) = app.get_webview_window("main") {
            if let Err(e) = window.set_decorations(false) {
                log::error!("Failed to remove Windows decorations: {:?}", e);
            }
            apply_window_styling(&window);
        }
    }

    // Linux: set taskbar icon and remove native titlebar.
    #[cfg(target_os = "linux")]
    {
        if let Some(window) = app.get_webview_window("main") {
            let icon_bytes = include_bytes!("../icons/128x128.png");
            if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                if let Err(e) = window.set_icon(icon) {
                    log::error!("Failed to set window icon: {:?}", e);
                }
            }
            if let Err(e) = window.set_decorations(false) {
                log::error!("Failed to remove Linux decorations: {:?}", e);
            }
        }
    }

    // macOS: apply decorum overlay titlebar with traffic lights inset.
    #[cfg(target_os = "macos")]
    {
        if let Some(window) = app.get_webview_window("main") {
            log::info!("Applying decorum plugin for macOS traffic lights");
            match window.create_overlay_titlebar() {
                Ok(_) => {
                    log::info!("Successfully created overlay titlebar");
                    if let Err(e) = window.set_traffic_lights_inset(12.0, 16.0) {
                        log::error!("Failed to set traffic lights inset: {:?}", e);
                    }
                }
                Err(e) => log::error!("Failed to create overlay titlebar: {:?}", e),
            }
        } else {
            log::error!("Failed to get main window for decorum setup");
        }
    }
}

/// Initialise and register proxy/mock/cert Tauri state.
async fn build_proxy_state(app: &tauri::AppHandle) -> Result<ProxyAppState, String> {
    let config_dir = dirs_next::home_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join(".apinox");
    std::fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config dir: {}", e))?;

    let proxy_storage = Arc::new(storage::rules::RulesStorage::new(config_dir.clone()));

    let replacer_svc = replacer::service::new_shared();
    {
        let mut svc = replacer_svc.lock().await;
        for rule in proxy_storage.load_replace_rules() {
            svc.add_rule(rule);
        }
    }

    let breakpoint_svc = breakpoint::service::new_shared();
    {
        let mut svc = breakpoint_svc.lock().await;
        svc.set_rules(proxy_storage.load_breakpoint_rules());
    }

    let filewatcher_svc = filewatcher::service::new_shared();
    {
        let mut svc = filewatcher_svc.lock().await;
        for watch in proxy_storage.load_file_watches() {
            svc.add_watch(watch);
        }
    }

    let mock_state = mock::state::new_shared();
    {
        let mut state = mock_state.lock().await;
        state.config.rules = proxy_storage.load_mock_rules();
    }

    let cert_manager = Arc::new(certificates::manager::CertManager::new(config_dir));
    if !cert_manager.info().exists {
        if let Err(e) = cert_manager.generate() {
            log::warn!("[Setup] Failed to generate CA certificate: {}", e);
        }
    }

    // Re-spawn file watchers for persisted watches.
    {
        let watches = filewatcher_svc.lock().await.get_watches();
        for watch in watches {
            commands::filewatcher_server::spawn_watcher(
                watch,
                filewatcher_svc.clone(),
                app.clone(),
            );
        }
    }

    let state = ProxyAppState {
        proxy: proxy::state::new_shared(),
        mock: mock_state,
        replacer: replacer_svc,
        breakpoint: breakpoint_svc,
        filewatcher: filewatcher_svc,
        storage: proxy_storage,
        cert_manager,
    };

    log::info!("[Proxy] Proxy/mock/cert services initialised");
    Ok(state)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    STARTUP_TIMER.get_or_init(Instant::now);
    STARTUP_REPORTED.store(false, Ordering::Relaxed);

    // Prevent the outbound reqwest client (used for proxy forwarding) from
    // looping back through the proxy port when system proxy is set.
    std::env::set_var("NO_PROXY", "*");
    std::env::set_var("no_proxy", "*");

    // On Linux, WebKitGTK's DMA-BUF renderer can produce "Error 71 (Protocol error)"
    // on some Wayland compositors (KDE Plasma, etc.). Disabling it avoids the crash
    // while keeping Wayland support for everything else.
    #[cfg(target_os = "linux")]
    if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            #[cfg(desktop)]
            close_splashscreen,
            quit_app,
            set_border_color,
            get_app_version,
            get_platform_os,
            get_config_dir,
            get_debug_info,
            get_tauri_logs,
            project_storage::save_project,
            project_storage::load_project,
            project_storage::list_projects,
            project_storage::list_unified_projects,
            project_storage::list_unified_projects_skeleton,
            project_storage::load_unified_project_detail,
            project_storage::migrate_legacy_projects,
            project_storage::save_imported_project_as_unified,
            project_storage::delete_project,
            history_storage::get_history,
            history_storage::add_history_entry,
            history_storage::clear_history,
            history_storage::delete_history_entry,
            history_storage::toggle_star_history,
            history_storage::get_starred_history,
            history_storage::clear_history_older_than,
            history_storage::update_history_config,
            history_storage::get_history_config,
            scrapbook_storage::get_scrapbook,
            scrapbook_storage::add_scrapbook_request,
            scrapbook_storage::update_scrapbook_request,
            scrapbook_storage::delete_scrapbook_request,
            notes_storage::load_notes_index,
            notes_storage::load_note_content,
            notes_storage::load_note_bytes,
            notes_storage::save_note,
            notes_storage::save_note_bytes,
            notes_storage::delete_note,
            notes_storage::rename_note,
            notes_storage::upsert_note_index,
            notes_storage::add_recent_note_path,
            notes_storage::sniff_file_type,
            notes_storage::get_notes_dir_path,
            secret_storage::store_secret,
            secret_storage::get_secret,
            secret_storage::delete_secret,
            secret_storage::resolve_secret_value,
            secret_storage::is_secret_ref,
            secret_storage::list_secret_keys,
            settings_manager::get_settings,
            settings_manager::get_raw_settings,
            settings_manager::save_raw_settings,
            settings_manager::save_settings,
            settings_manager::update_ui_settings,
            settings_manager::update_active_environment,
            settings_manager::update_open_projects,
            settings_manager::update_workflows,
            settings_manager::get_config_dir_path,
            settings_manager::get_config_file_path,
            settings_manager::get_resolved_environment,
            settings_manager::get_global_variables,
            project_storage::save_unified_project,
            http::commands::execute_http_request,
            http::commands::execute_rest_request,
            http::commands::cancel_rest_request,
            parsers::commands::parse_openapi_spec,
            parsers::wsdl_commands::parse_wsdl,
            parsers::wsdl_commands::refresh_wsdl,
            parsers::wsdl_commands::apply_wsdl_sync,
            parsers::unified_explorer_commands::parse_wsdl_as_project,
            parsers::unified_explorer_commands::cancel_unified_load,
            parsers::unified_explorer_commands::parse_spec_as_project,
            parsers::unified_explorer_commands::refresh_unified_project,
            parsers::unified_explorer_commands::refresh_project_wsdl,
            parsers::unified_explorer_commands::delete_unified_project,
            parsers::unified_explorer_commands::delete_unified_operation,
            parsers::unified_explorer_commands::delete_unified_request,
            parsers::unified_explorer_commands::new_unified_request,
            parsers::unified_explorer_commands::rename_unified_project,
            parsers::unified_explorer_commands::rename_unified_operation,
            parsers::unified_explorer_commands::rename_unified_request,
            soap::commands::build_soap_envelope,
            soap::commands::execute_soap_request,
            soap::commands::cancel_request,
            soap::commands::cancel_all_requests,
            soap::cert_commands::generate_certificate,
            soap::cert_commands::save_certificate,
            soap::cert_commands::list_certificates,
            soap::cert_commands::load_certificate,
            testing::commands::run_test_case,
            testing::commands::run_test_suite,
            testing::commands::get_test_run_updates,
            performance::commands::run_performance_suite,
            performance::commands::get_performance_run_updates,
            performance::commands::abort_performance_suite,
            workflow::commands::run_workflow,
            workflow::commands::get_workflows,
            workflow::commands::save_workflow,
            workflow::commands::delete_workflow,
            workspace_export::export_workspace,
            workspace_export::import_workspace,
            workspace_export::export_unified_project,
            project_storage::close_project,
            updater::check_for_updates,
            updater::download_update,
            updater::launch_installer,
            updater::open_url_in_browser,
            // ── Proxy / mock / cert (APIprox integration) ──────────────────
            commands::proxy_server::start_proxy,
            commands::proxy_server::stop_proxy,
            commands::proxy_server::get_proxy_status,
            commands::mock_server::start_mock,
            commands::mock_server::stop_mock,
            commands::mock_server::get_mock_status,
            commands::mock_server::get_mock_rules,
            commands::mock_server::add_mock_rule,
            commands::mock_server::update_mock_rule,
            commands::mock_server::delete_mock_rule,
            commands::mock_server::set_mock_record_mode,
            commands::mock_server::save_mock_rules,
            commands::mock_server::export_mock_collection,
            commands::mock_server::import_mock_collection,
            commands::replacer_server::get_replace_rules,
            commands::replacer_server::get_replacer_rule_errors,
            commands::replacer_server::add_replace_rule,
            commands::replacer_server::update_replace_rule,
            commands::replacer_server::delete_replace_rule,
            commands::breakpoint_server::get_breakpoint_rules,
            commands::breakpoint_server::set_breakpoint_rules,
            commands::breakpoint_server::add_breakpoint_rule,
            commands::breakpoint_server::update_breakpoint_rule,
            commands::breakpoint_server::delete_breakpoint_rule,
            commands::breakpoint_server::get_paused_traffic,
            commands::breakpoint_server::continue_breakpoint,
            commands::breakpoint_server::drop_breakpoint,
            commands::filewatcher_server::get_file_watches,
            commands::filewatcher_server::add_file_watch,
            commands::filewatcher_server::update_file_watch,
            commands::filewatcher_server::delete_file_watch,
            commands::filewatcher_server::get_soap_pairs,
            commands::filewatcher_server::get_watcher_events,
            commands::filewatcher_server::clear_watcher_events,
            commands::certificates_server::get_ca_certificate_info,
            commands::certificates_server::generate_ca_certificate,
            commands::certificates_server::trust_ca_certificate,
            commands::certificates_server::untrust_ca_certificate,
            commands::sniffer_server::get_system_proxy_status,
            commands::sniffer_server::set_system_proxy,
            commands::sniffer_server::clear_system_proxy,
        ])
        .setup(|app| {
            init_logging(app)?;
            init_window(app);
            app.manage(LazyProxyAppState::new());
            Ok(())
        })
        .on_window_event(|_window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Clear the OS system proxy when the app exits.
                commands::sniffer_server::clear_on_exit();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
