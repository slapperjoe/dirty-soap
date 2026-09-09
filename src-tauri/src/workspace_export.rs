use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use chrono::Utc;

#[derive(Debug, Serialize, Deserialize)]
struct Workspace {
    version: String,
    name: String,
    #[serde(rename = "exportedAt")]
    exported_at: String,
    projects: Vec<serde_json::Value>,
}

/// Export workspace to file (JSON or compressed .apinox format)
/// 
/// This command receives an array of projects and a target file path.
/// If the path ends with .apinox, it writes compressed (gzip) JSON.
/// Otherwise, it writes plain JSON.
#[tauri::command]
pub async fn export_workspace(
    projects: Vec<serde_json::Value>,
    file_path: String,
) -> Result<ExportResult, String> {
    log::info!("export_workspace: Exporting {} project(s) to {}", projects.len(), file_path);
    
    // Extract project names for logging
    let project_names: Vec<String> = projects.iter()
        .filter_map(|p| p["name"].as_str())
        .map(|s| s.to_string())
        .collect();
    
    log::info!("export_workspace: Projects = {:?}", project_names);
    
    // Create workspace structure
    let path = Path::new(&file_path);
    let name = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("workspace")
        .to_string();
    
    let workspace = Workspace {
        version: "1.0".to_string(),
        name,
        exported_at: Utc::now().to_rfc3339(),
        projects: projects.iter().map(|p| {
            let mut project = p.clone();
            // Remove fileName if present (it's project-specific)
            if let Some(obj) = project.as_object_mut() {
                obj.remove("fileName");
            }
            project
        }).collect(),
    };
    
    // Serialize to JSON
    let json_content = serde_json::to_string_pretty(&workspace)
        .map_err(|e| format!("Failed to serialize workspace: {}", e))?;
    
    log::info!("export_workspace: JSON size = {} bytes", json_content.len());
    
    // Check if .apinox extension (compressed format)
    if file_path.ends_with(".apinox") {
        // Write compressed
        use flate2::write::GzEncoder;
        use flate2::Compression;
        
        let file = fs::File::create(&file_path)
            .map_err(|e| format!("Failed to create file: {}", e))?;
        
        let mut encoder = GzEncoder::new(file, Compression::default());
        encoder.write_all(json_content.as_bytes())
            .map_err(|e| format!("Failed to write compressed data: {}", e))?;
        encoder.finish()
            .map_err(|e| format!("Failed to finalize compression: {}", e))?;
        
        log::info!("export_workspace: Wrote compressed workspace to {}", file_path);
    } else {
        // Write plain JSON
        fs::write(&file_path, json_content)
            .map_err(|e| format!("Failed to write file: {}", e))?;
        
        log::info!("export_workspace: Wrote JSON workspace to {}", file_path);
    }
    
    Ok(ExportResult {
        exported: true,
        project_count: projects.len(),
        file_path,
    })
}

#[derive(Debug, Serialize)]
pub struct ExportResult {
    pub exported: bool,
    pub project_count: usize,
    pub file_path: String,
}

/// Import workspace from file (.apinox, .json, or legacy XML)
/// 
/// This command receives a file path and returns the projects contained in the workspace.
/// Supports:
/// - .apinox: Compressed gzip JSON format
/// - .json: Plain JSON format
/// - Directory: Single project folder (loads as one project)
#[tauri::command]
pub async fn import_workspace(
    file_path: String,
) -> Result<ImportResult, String> {
    log::info!("import_workspace: Importing from {}", file_path);
    
    let path = Path::new(&file_path);
    
    // Check if it's a directory or a file
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read path: {}", e))?;
    
    if metadata.is_dir() {
        // It's a project folder - load as single project
        log::info!("import_workspace: Detected directory, loading as single project");
        
        // Use the existing load_project command
        let project = crate::project_storage::load_project_internal(&file_path)
            .await
            .map_err(|e| format!("Failed to load project: {}", e))?;
        
        return Ok(ImportResult {
            imported: true,
            projects: vec![project],
            project_count: 1,
        });
    }
    
    // It's a file - determine format by extension
    let extension = path.extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    
    log::info!("import_workspace: File extension = {}", extension);
    
    match extension.as_str() {
        "apinox" => {
            // Compressed APInox workspace format
            log::info!("import_workspace: Decompressing .apinox file");
            
            let compressed = fs::read(path)
                .map_err(|e| format!("Failed to read file: {}", e))?;
            
            use flate2::read::GzDecoder;
            let mut decoder = GzDecoder::new(&compressed[..]);
            let mut json_content = String::new();
            decoder.read_to_string(&mut json_content)
                .map_err(|e| format!("Failed to decompress file: {}", e))?;
            
            let workspace: Workspace = serde_json::from_str(&json_content)
                .map_err(|e| format!("Failed to parse JSON: {}", e))?;
            
            log::info!("import_workspace: Imported .apinox workspace: {} ({} projects)", 
                workspace.name, workspace.projects.len());
            
            let project_count = workspace.projects.len();
            
            Ok(ImportResult {
                imported: true,
                projects: workspace.projects,
                project_count,
            })
        },
        "json" => {
            // Plain JSON workspace format
            log::info!("import_workspace: Reading plain JSON file");
            
            let json_content = fs::read_to_string(path)
                .map_err(|e| format!("Failed to read file: {}", e))?;
            
            let workspace: Workspace = serde_json::from_str(&json_content)
                .map_err(|e| format!("Failed to parse JSON: {}", e))?;
            
            log::info!("import_workspace: Imported JSON workspace: {} ({} projects)", 
                workspace.name, workspace.projects.len());
            
            let project_count = workspace.projects.len();
            
            Ok(ImportResult {
                imported: true,
                projects: workspace.projects,
                project_count,
            })
        },
        "xml" => {
            // SoapUI workspace or project XML
            log::info!("import_workspace: Delegating .xml to SoapUI importer");
            let projects = crate::soapui_importer::import_soapui_xml(&file_path).await?;
            let project_count = projects.len();
            Ok(ImportResult {
                imported: true,
                projects,
                project_count,
            })
        },
        _ => {
            // Unsupported format
            Err(format!(
                "Unsupported workspace format: .{}. Supported formats: .apinox, .json, .xml (SoapUI).",
                extension
            ))
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: bool,
    pub projects: Vec<serde_json::Value>,
    pub project_count: usize,
}

/// Export a single unified project to file.
/// Looks up the project by name, wraps it in a workspace envelope,
/// and writes it to the target path (.apinox = compressed, .json = plain).
#[tauri::command]
pub async fn export_unified_project(
    project_name: String,
    file_path: String,
) -> Result<ExportResult, String> {
    log::info!("export_unified_project: Exporting '{}' to {}", project_name, file_path);

    let projects = crate::project_storage::list_unified_projects().await?;
    let project = projects
        .into_iter()
        .find(|p| p["name"].as_str() == Some(&project_name))
        .ok_or_else(|| format!("Unified project '{}' not found", project_name))?;

    let path = Path::new(&file_path);
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&project_name)
        .to_string();

    let workspace = Workspace {
        version: "1.0".to_string(),
        name,
        exported_at: Utc::now().to_rfc3339(),
        projects: vec![project],
    };

    let json_content =
        serde_json::to_string_pretty(&workspace).map_err(|e| format!("Failed to serialize: {}", e))?;

    if file_path.ends_with(".apinox") {
        use flate2::write::GzEncoder;
        use flate2::Compression;
        let file = fs::File::create(&file_path)
            .map_err(|e| format!("Failed to create file: {}", e))?;
        let mut encoder = GzEncoder::new(file, Compression::default());
        encoder
            .write_all(json_content.as_bytes())
            .map_err(|e| format!("Failed to write compressed data: {}", e))?;
        encoder
            .finish()
            .map_err(|e| format!("Failed to finalize compression: {}", e))?;
    } else {
        fs::write(&file_path, json_content)
            .map_err(|e| format!("Failed to write file: {}", e))?;
    }

    log::info!("export_unified_project: Wrote '{}' to {}", project_name, file_path);

    Ok(ExportResult {
        exported: true,
        project_count: 1,
        file_path,
    })
}
