use tauri::{Emitter, Manager, State};
use tauri_plugin_shell::process::{CommandEvent, CommandChild};
use tauri_plugin_shell::ShellExt;
use std::sync::{Arc, Mutex};

// State to hold the Sidecar Process
struct SidecarState(Arc<Mutex<Option<CommandChild>>>);

#[tauri::command]
fn handle_request(state: State<'_, SidecarState>, payload: serde_json::Value) {
    if let Some(child) = state.0.lock().unwrap().as_mut() {
        let msg = serde_json::to_string(&payload).unwrap();
        // Send newline delimited JSON
        let _ = child.write(format!("{}\n", msg).as_bytes());
    } else {
        eprintln!("Sidecar not running");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SidecarState(Arc::new(Mutex::new(None))))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            
            let handle = app.handle().clone();
            let state = app.state::<SidecarState>();
            
            // Spawn Sidecar
            let sidecar_command = app.shell().sidecar("dirty-soap-sidecar")
                .expect("Failed to create sidecar command");

            let (mut rx, child) = sidecar_command
                .spawn()
                .expect("Failed to spawn sidecar");

            // Store child reference for writing
            *state.0.lock().unwrap() = Some(child);

            // Listen to Sidecar Output
            tauri::async_runtime::spawn(async move {
                let mut buffer = String::new();
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(line_bytes) => {
                             let chunk = String::from_utf8_lossy(&line_bytes);
                             buffer.push_str(&chunk);

                             while let Some(pos) = buffer.find('\n') {
                                 let line = buffer[..pos].to_string();
                                 buffer = buffer[pos + 1..].to_string();
                                 
                                 if line.trim().is_empty() { continue; }

                                 if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                                      let _ = handle.emit("backend-message", json);
                                 } else {
                                      println!("Sidecar Log: {}", line);
                                 }
                             }
                        }
                        CommandEvent::Stderr(line_bytes) => {
                             let line = String::from_utf8_lossy(&line_bytes);
                             eprintln!("Sidecar Err: {}", line);
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![handle_request])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
