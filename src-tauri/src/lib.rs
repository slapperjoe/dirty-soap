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
static STARTUP_ERROR: Mutex<Option<String>> = Mutex::new(None);
static LOG_FILE_PATH: Mutex<Option<String>> = Mutex::new(None);

/// Recursively copy a directory
fn copy_dir_recursive(src: &PathBuf, dst: &PathBuf) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        
        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

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

#[tauri::command]
fn get_sidecar_diagnostics() -> serde_json::Value {
    serde_json::json!({
        "port": SIDECAR_PORT.load(Ordering::Relaxed),
        "ready": SIDECAR_PORT.load(Ordering::Relaxed) > 0,
        "configDir": CONFIG_DIR.lock().ok().and_then(|dir| dir.clone()),
        "processRunning": SIDECAR_PROCESS.lock()
            .ok()
            .and_then(|guard| guard.as_ref().map(|_| true))
            .unwrap_or(false),
        "binaryInfo": get_sidecar_binary_info(),
        "startupError": STARTUP_ERROR.lock().ok().and_then(|err| err.clone()),
        "logFilePath": LOG_FILE_PATH.lock().ok().and_then(|path| path.clone())
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

fn get_sidecar_binary_info() -> serde_json::Value {
    // Since we're using a standalone binary with embedded Node.js v18.5.0,
    // we no longer need to check for Node.js installation
    serde_json::json!({
        "type": "standalone",
        "embeddedNodeVersion": "v18.5.0",
        "description": "Standalone binary with embedded Node.js runtime"
    })
}

/// Spawn the Node.js sidecar process
fn spawn_sidecar(app_handle: &tauri::AppHandle) -> Result<(), String> {
    log::info!("========== SIDECAR STARTUP ==========");
    
    // Clear any previous startup error
    if let Ok(mut guard) = STARTUP_ERROR.lock() {
        *guard = None;
    }
    
    // Get path to sidecar
    // In development, cwd is src-tauri, so we need to go up one level
    // In production, we'd use a bundled binary

    let exe_path = std::env::current_exe()
        .map_err(|e| {
            let err = format!("Failed to get current exe path: {}", e);
            log::error!("{}", err);
            if let Ok(mut guard) = STARTUP_ERROR.lock() {
                *guard = Some(err.clone());
            }
            err
        })?;
    log::info!("Executable path: {:?}", exe_path);

    let exe_dir = exe_path
        .parent()
        .map(|p| p.to_path_buf())
        .or_else(|| app_handle.path().executable_dir().ok())
        .ok_or_else(|| {
            let err = "Failed to resolve executable dir".to_string();
            log::error!("{}", err);
            if let Ok(mut guard) = STARTUP_ERROR.lock() {
                *guard = Some(err.clone());
            }
            err
        })?;
    log::info!("Executable directory: {:?}", exe_dir);
    
    // On macOS, resources are in ../Resources, not the MacOS directory
    #[cfg(target_os = "macos")]
    let resource_dir = exe_dir.parent()
        .and_then(|p| Some(p.join("Resources")))
        .filter(|p| p.exists());
    #[cfg(not(target_os = "macos"))]
    let resource_dir: Option<PathBuf> = None;
    
    if let Some(ref res_dir) = resource_dir {
        log::info!("macOS Resources directory: {:?}", res_dir);
    }
    
    // Prioritize stable, user-specific directory to survive reinstalls
    let user_config_dir = app_handle
        .path()
        .app_config_dir()
        .or_else(|_| app_handle.path().app_data_dir())
        .map_err(|err| format!("Failed to resolve user config dir: {}", err))?;
    
    log::info!("User config directory (stable): {:?}", user_config_dir);
    
    // Check for legacy exe-relative config directory (migration)
    let legacy_dir = exe_dir.join(".apinox-config");
    log::info!("Checking for legacy config directory: {:?}", legacy_dir);
    
    let config_dir = match fs::create_dir_all(&user_config_dir) {
        Ok(_) => {
            log::info!("Successfully created/verified user config directory");
            
            // Migrate data from legacy location if it exists and user dir is empty
            if legacy_dir.exists() {
                let legacy_config = legacy_dir.join("config.jsonc");
                let user_config = user_config_dir.join("config.jsonc");
                
                if legacy_config.exists() && !user_config.exists() {
                    log::info!("Migrating config from legacy location...");
                    if let Err(e) = fs::copy(&legacy_config, &user_config) {
                        log::warn!("Failed to migrate config.jsonc: {}", e);
                    } else {
                        log::info!("✓ Migrated config.jsonc successfully");
                    }
                }
                
                // Migrate autosave.xml if it exists
                let legacy_autosave = legacy_dir.join("autosave.xml");
                let user_autosave = user_config_dir.join("autosave.xml");
                
                if legacy_autosave.exists() && !user_autosave.exists() {
                    log::info!("Migrating autosave from legacy location...");
                    if let Err(e) = fs::copy(&legacy_autosave, &user_autosave) {
                        log::warn!("Failed to migrate autosave.xml: {}", e);
                    } else {
                        log::info!("✓ Migrated autosave.xml successfully");
                    }
                }
                
                // Migrate scripts directory if it exists
                let legacy_scripts = legacy_dir.join("scripts");
                let user_scripts = user_config_dir.join("scripts");
                
                if legacy_scripts.exists() && !user_scripts.exists() {
                    log::info!("Migrating scripts directory...");
                    if let Err(e) = copy_dir_recursive(&legacy_scripts, &user_scripts) {
                        log::warn!("Failed to migrate scripts directory: {}", e);
                    } else {
                        log::info!("✓ Migrated scripts directory successfully");
                    }
                }
            }
            
            user_config_dir
        },
        Err(e) => {
            log::warn!("Failed to create user config dir: {}. Falling back to exe-relative dir.", e);
            let fallback = exe_dir.join(".apinox-config");
            log::info!("Fallback config directory: {:?}", fallback);
            fs::create_dir_all(&fallback)
                .map_err(|err| format!("Failed to create fallback config dir: {}", err))?;
            log::info!("Successfully created fallback config directory");
            fallback
        }
    };

    if let Ok(mut guard) = CONFIG_DIR.lock() {
        *guard = Some(config_dir.to_string_lossy().to_string());
    }

    // Only search from exe_dir - current_dir is unreliable when launched from MSI installer
    let current_dir = std::env::current_dir().unwrap_or_else(|_| exe_dir.clone());
    log::info!("Current working directory: {:?}", current_dir);
    if current_dir != exe_dir {
        log::warn!("CWD differs from exe dir (likely launched from installer). Using exe dir only.");
    }

    let exe_dir_clone = exe_dir.clone();
    
    // Build search candidates - on macOS, prioritize Resources directory
    let mut sidecar_candidates = Vec::new();
    #[cfg(target_os = "macos")]
    {
        if let Some(ref res_dir) = resource_dir {
            sidecar_candidates.push(res_dir.clone());
        }
    }
    sidecar_candidates.push(exe_dir.clone());
    
    log::info!("Searching for sidecar in {} locations", sidecar_candidates.len());

    let find_sidecar_script = |start: &PathBuf| -> Option<(PathBuf, PathBuf, bool)> {
        let mut cursor = start.clone();
        for depth in 0..6 {
            // Check for standalone binary first (production - no Node.js required)
            #[cfg(windows)]
            let binary_name = "sidecar.exe";
            #[cfg(not(windows))]
            let binary_name = "sidecar";
            
            // Check 1: Direct binary in current directory (Tauri bundle - externalBin places it here)
            let direct_binary = cursor.join(binary_name);
            log::info!("  [Depth {}] Checking direct binary: {:?}", depth, direct_binary);
            if direct_binary.exists() {
                log::info!("  ✓ Found direct sidecar binary (Tauri bundle) at: {:?}", direct_binary);
                return Some((direct_binary, cursor, true)); // true = standalone binary
            }
            
            // Check 2: Binary in sidecar-bundle subdirectory (pre-Tauri build)
            let bundled_binary = cursor.join("sidecar-bundle").join(binary_name);
            log::info!("  [Depth {}] Checking bundled binary: {:?}", depth, bundled_binary);
            if bundled_binary.exists() {
                log::info!("  ✓ Found bundled sidecar binary at: {:?}", bundled_binary);
                return Some((bundled_binary, cursor, true)); // true = standalone binary
            }
            
            // Check 3: Bundled JS (production - requires Node.js)
            let bundled = cursor.join("sidecar-bundle").join("bundle.js");
            log::info!("  [Depth {}] Checking bundled JS: {:?}", depth, bundled);
            if bundled.exists() {
                log::info!("  ✓ Found bundled sidecar JS at: {:?}", bundled);
                return Some((bundled, cursor, false)); // false = requires Node.js
            }
            
            // Fallback to unbundled sidecar (development)
            let dev_bundle = cursor.join("sidecar").join("bundle.js");
            log::info!("  [Depth {}] Checking dev bundle: {:?}", depth, dev_bundle);
            if dev_bundle.exists() {
                log::info!("  ✓ Found dev bundle sidecar at: {:?}", dev_bundle);
                return Some((dev_bundle, cursor, false));
            }
            
            // Fallback to fully unbundled (development without bundle)
            let candidate = cursor
                .join("sidecar")
                .join("dist")
                .join("sidecar")
                .join("src")
                .join("index.js");
            log::info!("  [Depth {}] Checking unbundled: {:?}", depth, candidate);
            if candidate.exists() {
                log::info!("  ✓ Found unbundled sidecar at: {:?}", candidate);
                return Some((candidate, cursor, false));
            }
            if let Some(parent) = cursor.parent() {
                cursor = parent.to_path_buf();
            } else {
                log::info!("  ✗ Reached filesystem root, stopping search");
                break;
            }
        }
        None
    };

    let mut sidecar_script: Option<PathBuf> = None;
    let mut project_root: Option<PathBuf> = None;
    let mut is_standalone_binary = false;
    for (idx, start) in sidecar_candidates.iter().enumerate() {
        log::info!("Search path {}: {:?}", idx + 1, start);
        if let Some((script, root, is_binary)) = find_sidecar_script(start) {
            sidecar_script = Some(script);
            project_root = Some(root);
            is_standalone_binary = is_binary;
            break;
        }
    }

    let sidecar_script = sidecar_script.ok_or_else(|| {
        log::error!("Sidecar script not found in any search paths!");
        log::error!("Searched locations:");
        for (idx, start) in sidecar_candidates.iter().enumerate() {
            log::error!("  {}: {:?}/sidecar-bundle/sidecar (binary) or bundle.js (JS)", idx + 1, start);
        }
        "Sidecar not found. Run 'npm run prepare:sidecar:binary' or 'npm run prepare:sidecar' first.".to_string()
    })?;
    let project_root = project_root.ok_or_else(|| "Failed to resolve project root".to_string())?;

    let config_dir_str = config_dir.to_string_lossy().to_string();
    log::info!("Sidecar script: {:?}", sidecar_script);
    log::info!("Project root: {:?}", project_root);
    log::info!("Config directory: {}", config_dir_str);
    log::info!("Sidecar type: {}", if is_standalone_binary { "Standalone binary (Node.js embedded)" } else { "JavaScript (requires Node.js)" });

    // Write config dir to a file that sidecar can read
    let config_dir_file = exe_dir_clone.join(".apinox-sidecar-config");
    log::info!("Writing config file to: {:?}", config_dir_file);
    if let Err(e) = fs::write(&config_dir_file, &config_dir_str) {
        log::warn!("Failed to write sidecar config file: {}", e);
    } else {
        log::info!("Successfully wrote sidecar config file");
    }

    // Build sidecar command based on type
    let mut command = if is_standalone_binary {
        // Standalone binary - no Node.js needed!
        log::info!("Building sidecar command for standalone binary...");
        Command::new(&sidecar_script)
    } else {
        // JavaScript file - requires Node.js
        log::info!("Checking for Node.js availability...");
        
        let mut node_cmd = None;
    
    // Common Node.js installation locations on macOS/Linux
    #[cfg(not(windows))]
    let common_locations = vec![
        "/opt/homebrew/bin/node",      // Homebrew (Apple Silicon)
        "/usr/local/bin/node",          // Homebrew (Intel) / manual install
        "/usr/bin/node",                // System package manager
        "/opt/local/bin/node",          // MacPorts
    ];
    
    #[cfg(windows)]
    let common_locations = vec![
        "C:\\Program Files\\nodejs\\node.exe",
        "C:\\Program Files (x86)\\nodejs\\node.exe",
    ];
    
    // First, try common locations
    #[cfg(not(windows))]
    let node_filename = "node";
    #[cfg(windows)]
    let node_filename = "node.exe";
    
    log::info!("Checking {} common installation locations...", common_locations.len());
    for location in &common_locations {
        let node_path = PathBuf::from(location);
        if node_path.exists() && node_path.is_file() {
            if let Ok(output) = Command::new(&node_path).arg("--version").output() {
                if output.status.success() {
                    let version = String::from_utf8_lossy(&output.stdout);
                    log::info!("✓ Found Node.js at: {:?} ({})", node_path, version.trim());
                    node_cmd = Some(node_path.to_string_lossy().to_string());
                    break;
                }
            }
        }
    }
    
    // If not found in common locations, search PATH
    if node_cmd.is_none() {
        #[cfg(windows)]
        let path_separator = ';';
        #[cfg(not(windows))]
        let path_separator = ':';
        
        if let Ok(path_var) = std::env::var("PATH") {
            let paths: Vec<&str> = path_var.split(path_separator).collect();
            log::info!("Searching {} PATH entries for {}...", paths.len(), node_filename);
            
            for path_entry in paths {
                if path_entry.is_empty() {
                    continue;
                }
                
                let node_path = PathBuf::from(path_entry).join(node_filename);
                if node_path.exists() {
                    // Try to execute it
                    if let Ok(output) = Command::new(&node_path).arg("--version").output() {
                        if output.status.success() {
                            let version = String::from_utf8_lossy(&output.stdout);
                            log::info!("✓ Found Node.js at: {:?} ({})", node_path, version.trim());
                            node_cmd = Some(node_path.to_string_lossy().to_string());
                            break;
                        }
                    }
                }
            }
        }
    }
    
    let node_command = match node_cmd {
        Some(cmd) => cmd,
        None => {
            log::error!("Node.js not found in PATH or common locations");
            log::error!("PATH: {:?}", std::env::var("PATH").ok());
            log::error!("Checked locations: {:?}", common_locations);
            log::error!("Please ensure Node.js is installed and in your system PATH.");
            log::error!("After installation, you may need to restart your computer for PATH changes to take effect.");
            let err = "Node.js not found in PATH. Please install Node.js and restart your computer.".to_string();
            if let Ok(mut guard) = STARTUP_ERROR.lock() {
                *guard = Some(err.clone());
            }
            return Err(err);
        }
    };

        log::info!("Building sidecar command for JavaScript runtime...");
        Command::new(&node_command)
    };
    
    // Configure command arguments and environment
    command
        .current_dir(&project_root)
        .env("APINOX_CONFIG_DIR", &config_dir_str)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());  // Changed to piped to capture stderr
    
    // For JavaScript runtime, pass the script path and arguments
    if !is_standalone_binary {
        // Arguments order: node <script.js> --config-dir <path>
        command
            .arg(sidecar_script.to_string_lossy().to_string())
            .arg("--config-dir")
            .arg(&config_dir_str);
    } else {
        // For standalone binary, pass flags directly
        command
            .arg("--config-dir")
            .arg(&config_dir_str);
    }

    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW
        command.creation_flags(0x08000000);
        log::info!("Applied Windows CREATE_NO_WINDOW flag");
    }

    log::info!("Spawning sidecar process...");
    let mut child = command
        .spawn()
        .map_err(|e| {
            log::error!("Failed to spawn sidecar process: {}", e);
            let err = format!("Failed to spawn sidecar: {}. Check if Node.js is installed and sidecar is built.", e);
            if let Ok(mut guard) = STARTUP_ERROR.lock() {
                *guard = Some(err.clone());
            }
            err
        })?;
    
    log::info!("Sidecar process spawned successfully (PID: {})", child.id());

    // Read stdout to get the port
    let stdout = child.stdout.take().ok_or_else(|| {
        log::error!("Failed to capture sidecar stdout");
        "Failed to get stdout".to_string()
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        log::error!("Failed to capture sidecar stderr");
        "Failed to get stderr".to_string()
    })?;
    
    let reader = BufReader::new(stdout);
    let err_reader = BufReader::new(stderr);

    log::info!("Starting stdout monitoring thread...");
    // Spawn thread to read sidecar output
    thread::spawn(move || {
        for line in reader.lines() {
            if let Ok(line) = line {
                log::info!("[Sidecar] {}", line);

                // Parse port from "SIDECAR_PORT:<port>"
                if line.starts_with("SIDECAR_PORT:") {
                    if let Some(port_str) = line.strip_prefix("SIDECAR_PORT:") {
                        if let Ok(port) = port_str.trim().parse::<u16>() {
                            log::info!("✓ Sidecar port detected: {}", port);
                            SIDECAR_PORT.store(port, Ordering::Relaxed);
                        } else {
                            log::error!("Failed to parse sidecar port from: {}", port_str);
                        }
                    }
                }
            }
        }
        log::warn!("Sidecar stdout stream ended");
    });

    // Spawn thread to read sidecar stderr
    log::info!("Starting stderr monitoring thread...");
    thread::spawn(move || {
        for line in err_reader.lines() {
            if let Ok(line) = line {
                log::error!("[Sidecar STDERR] {}", line);
            }
        }
        log::warn!("Sidecar stderr stream ended");
    });

    log::info!("========== SIDECAR STARTUP COMPLETE ==========");

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
        .invoke_handler(tauri::generate_handler![get_sidecar_port, is_sidecar_ready, get_config_dir, get_sidecar_diagnostics, get_tauri_logs])
        .setup(|app| {
            // Initialize logging for both debug and production
            // This helps diagnose issues on user machines
            let log_level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Info  // Keep info level in production for diagnostics
            };
            
            // Configure logging to file for production diagnostics
            let log_dir = app.path().app_log_dir().unwrap_or_else(|_| {
                app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir())
            });
            
            std::fs::create_dir_all(&log_dir).ok();
            
            let log_file = log_dir.join("apinox.log");
            
            // Store log file path for diagnostics
            if let Ok(mut guard) = LOG_FILE_PATH.lock() {
                *guard = Some(log_file.to_string_lossy().to_string());
            }
            
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log_level)
                    .targets([
                        tauri_plugin_log::Target::new(
                            tauri_plugin_log::TargetKind::LogDir { file_name: Some("apinox.log".to_string()) }
                        ),
                        // Disable stdout in production to avoid double logging
                        tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                    ])
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepAll)
                    .max_file_size(5_000_000) // 5 MB
                    .build(),
            )?;

            log::info!("APInox starting (version: {})", env!("CARGO_PKG_VERSION"));
            log::info!("Debug mode: {}", cfg!(debug_assertions));
            if let Ok(guard) = LOG_FILE_PATH.lock() {
                if let Some(ref path) = *guard {
                    log::info!("Logs will be written to: {}", path);
                }
            }

            // Launch sidecar
            let handle = app.handle().clone();
            thread::spawn(move || {
                if let Err(e) = spawn_sidecar(&handle) {
                    log::error!("========== SIDECAR STARTUP FAILED ==========");
                    log::error!("Error: {}", e);
                    log::error!("==========================================");
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
