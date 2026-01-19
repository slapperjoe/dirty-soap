use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::Mutex;
use std::thread;
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

// Global sidecar state
static SIDECAR_PORT: AtomicU16 = AtomicU16::new(0);
static SIDECAR_PROCESS: Mutex<Option<Child>> = Mutex::new(None);
static CONFIG_DIR: Mutex<Option<String>> = Mutex::new(None);

#[tauri::command]
fn get_sidecar_port() -> u16 {
    SIDECAR_PORT.load(Ordering::Relaxed)
}

#[tauri::command]
fn is_sidecar_ready() -> bool {
    SIDECAR_PORT.load(Ordering::Relaxed) > 0
}

#[tauri::command]
fn get_config_dir() -> Option<String> {
    CONFIG_DIR.lock().ok().and_then(|dir| dir.clone())
}

/// Spawn the Node.js sidecar process
fn spawn_sidecar(app_handle: &tauri::AppHandle) -> Result<(), String> {
    // Get path to sidecar
    // In development, cwd is src-tauri, so we need to go up one level
    // In production, we'd use a bundled binary

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(|p| p.to_path_buf()))
        .or_else(|| app_handle.path().executable_dir().ok())
        .ok_or_else(|| "Failed to resolve executable dir".to_string())?;
    let preferred_dir = exe_dir.join(".apinox-config");

    let config_dir = match fs::create_dir_all(&preferred_dir) {
        Ok(_) => preferred_dir,
        Err(e) => {
            log::warn!("Failed to create .apinox-config next to exe: {}. Falling back to app config dir.", e);
            let fallback = app_handle
                .path()
                .app_config_dir()
                .or_else(|_| app_handle.path().app_data_dir())
                .map_err(|err| format!("Failed to resolve fallback config dir: {}", err))?;
            fs::create_dir_all(&fallback)
                .map_err(|err| format!("Failed to create fallback config dir: {}", err))?;
            fallback
        }
    };

    if let Ok(mut guard) = CONFIG_DIR.lock() {
        *guard = Some(config_dir.to_string_lossy().to_string());
    }

    let current_dir =
        std::env::current_dir().map_err(|e| format!("Failed to get current dir: {}", e))?;

    let exe_dir_clone = exe_dir.clone();
    let sidecar_candidates = [current_dir, exe_dir];

    let find_sidecar_script = |start: &PathBuf| -> Option<(PathBuf, PathBuf)> {
        let mut cursor = start.clone();
        for _ in 0..6 {
            let candidate = cursor
                .join("sidecar")
                .join("dist")
                .join("sidecar")
                .join("src")
                .join("index.js");
            if candidate.exists() {
                return Some((candidate, cursor));
            }
            if let Some(parent) = cursor.parent() {
                cursor = parent.to_path_buf();
            } else {
                break;
            }
        }
        None
    };

    let mut sidecar_script: Option<PathBuf> = None;
    let mut project_root: Option<PathBuf> = None;
    for start in sidecar_candidates.iter() {
        if let Some((script, root)) = find_sidecar_script(start) {
            sidecar_script = Some(script);
            project_root = Some(root);
            break;
        }
    }

    let sidecar_script = sidecar_script.ok_or_else(|| {
        "Sidecar not found. Run 'npm run build:sidecar' first.".to_string()
    })?;
    let project_root = project_root.ok_or_else(|| "Failed to resolve project root".to_string())?;

    let config_dir_str = config_dir.to_string_lossy().to_string();
    log::info!("Starting sidecar: node {:?}", sidecar_script);
    log::info!("Config dir: {}", config_dir_str);

    // Write config dir to a file that sidecar can read
    let config_dir_file = exe_dir_clone.join(".apinox-sidecar-config");
    if let Err(e) = fs::write(&config_dir_file, &config_dir_str) {
        log::warn!("Failed to write sidecar config file: {}", e);
    }

    let mut command = Command::new("node");
    command
        .arg(&sidecar_script)
        .arg("--config-dir")
        .arg(&config_dir_str)
        .current_dir(&project_root)
        .env("APINOX_CONFIG_DIR", &config_dir_str)
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit());

    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW
        command.creation_flags(0x08000000);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar: {}", e))?;

    // Read stdout to get the port
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let reader = BufReader::new(stdout);

    // Spawn thread to read sidecar output
    thread::spawn(move || {
        for line in reader.lines() {
            if let Ok(line) = line {
                log::info!("[Sidecar] {}", line);

                // Parse port from "SIDECAR_PORT:<port>"
                if line.starts_with("SIDECAR_PORT:") {
                    if let Some(port_str) = line.strip_prefix("SIDECAR_PORT:") {
                        if let Ok(port) = port_str.trim().parse::<u16>() {
                            log::info!("Sidecar running on port {}", port);
                            SIDECAR_PORT.store(port, Ordering::Relaxed);
                        }
                    }
                }
            }
        }
    });

    // Store process handle for cleanup
    if let Ok(mut guard) = SIDECAR_PROCESS.lock() {
        *guard = Some(child);
    }

    Ok(())
}

/// Stop the sidecar process
fn stop_sidecar() {
    if let Ok(mut guard) = SIDECAR_PROCESS.lock() {
        if let Some(ref mut child) = *guard {
            log::info!("Stopping sidecar...");
            let _ = child.kill();
        }
        *guard = None;
    }
    SIDECAR_PORT.store(0, Ordering::Relaxed);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![get_sidecar_port, is_sidecar_ready, get_config_dir])
        .setup(|app| {
            // Initialize logging in debug mode
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Launch sidecar
            let handle = app.handle().clone();
            thread::spawn(move || {
                if let Err(e) = spawn_sidecar(&handle) {
                    log::error!("Failed to start sidecar: {}", e);
                }
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            // Clean up sidecar when window closes
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    stop_sidecar();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
