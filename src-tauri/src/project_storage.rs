use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;
use crate::utils::resolve_config_dir;

/// Returns the ~/.apinox/projects/ directory, creating it if needed.
pub fn projects_dir() -> Result<PathBuf, String> {
    let dir = resolve_config_dir()?.join("projects");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create projects directory: {}", e))?;
    Ok(dir)
}

/// Project metadata stored in properties.json
#[derive(Debug, Serialize, Deserialize)]
struct ProjectProperties {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    format: String,
}

// ---------------------------------------------------------------------------
// Typed storage structs – compile-time validation for saved JSON files.
// Deeply nested / schema-variant fields remain as serde_json::Value to avoid
// over-modelling the WSDL-derived trees.
// ---------------------------------------------------------------------------

/// Data written to interfaces/{name}/interface.json
#[derive(Debug, Serialize, Deserialize)]
struct InterfaceMeta {
    name: String,
    #[serde(rename = "type")]
    type_: String,
    #[serde(skip_serializing_if = "Option::is_none", rename = "bindingName")]
    binding_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "soapVersion")]
    soap_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    definition: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "displayName")]
    display_name: Option<String>,
}

/// Data written to interfaces/{name}/{op}/operation.json
#[derive(Debug, Serialize, Deserialize)]
struct OperationMeta {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    action: Option<String>,
    #[serde(default, skip_serializing_if = "JsonValue::is_null")]
    input: JsonValue,
    #[serde(skip_serializing_if = "Option::is_none", rename = "targetNamespace")]
    target_namespace: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "originalEndpoint")]
    original_endpoint: Option<String>,
    #[serde(default, skip_serializing_if = "JsonValue::is_null", rename = "fullSchema")]
    full_schema: JsonValue,
    #[serde(skip_serializing_if = "Option::is_none", rename = "displayName")]
    display_name: Option<String>,
    /// Required by ServiceOperation on load; persisted so save → load → execute round-trips.
    /// Always serialized (even null) so legacy files missing the field stay loadable:
    /// load paths re-serialize through OperationMeta, and a dropped key would break
    /// ServiceOperation deserialization downstream.
    #[serde(default)]
    output: JsonValue,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "portName")]
    port_name: Option<String>,
}

/// Data written to interfaces/{name}/{op}/{req}.json (request metadata)
#[derive(Debug, Serialize, Deserialize)]
struct RequestMeta {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "contentType")]
    content_type: Option<String>,
    #[serde(default, skip_serializing_if = "JsonValue::is_null")]
    headers: JsonValue,
    #[serde(default, skip_serializing_if = "JsonValue::is_null")]
    assertions: JsonValue,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "requestType")]
    request_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", rename = "bodyType")]
    body_type: Option<String>,
    #[serde(default, skip_serializing_if = "JsonValue::is_null", rename = "restConfig")]
    rest_config: JsonValue,
    #[serde(default, skip_serializing_if = "JsonValue::is_null", rename = "graphqlConfig")]
    graphql_config: JsonValue,
    #[serde(default, skip_serializing_if = "JsonValue::is_null")]
    extractors: JsonValue,
    #[serde(default, skip_serializing_if = "JsonValue::is_null", rename = "wsSecurity")]
    ws_security: JsonValue,
    #[serde(default, skip_serializing_if = "JsonValue::is_null")]
    attachments: JsonValue,
}

/// Data written to tests/{suite}/suite.json
#[derive(Debug, Serialize, Deserialize)]
struct TestSuiteMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    name: String,
}

/// Data written to tests/{suite}/{case}/case.json
#[derive(Debug, Serialize, Deserialize)]
struct TestCaseMeta {
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    name: String,
}

/// Sanitize a name for use as a folder/file name
fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

/// Remove any subdirectories under `parent` whose names are not in `keep`.
fn cleanup_orphan_dirs(parent: &Path, keep: &std::collections::HashSet<String>) {
    if let Ok(entries) = fs::read_dir(parent) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    if !keep.contains(name) {
                        let _ = fs::remove_dir_all(path);
                    }
                }
            }
        }
    }
}

/// Collect the sanitized names of all items in a JSON array that have the given key.
fn sanitized_names(array: &[serde_json::Value], key: &str) -> std::collections::HashSet<String> {
    array
        .iter()
        .filter_map(|v| v[key].as_str())
        .map(sanitize_name)
        .collect()
}

/// Write `data` as pretty-printed JSON to `path`.
fn write_json(path: &Path, data: &serde_json::Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize {}: {}", path.display(), e))?;
    fs::write(path, json)
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))
}

fn resolve_unified_project_dir(dir_path: &str, project_name: Option<&str>) -> Result<PathBuf, String> {
    let path = PathBuf::from(dir_path);
    if path.is_absolute() {
        return Ok(path);
    }

    let name = project_name.unwrap_or(dir_path);
    Ok(projects_dir()?.join(sanitize_name(name)))
}

/// Save a project to disk.
///
/// The save location is always `~/.apinox/projects/{sanitized_name}/`.
/// Returns the absolute path to the project directory.
#[tauri::command]
pub async fn save_project(project: serde_json::Value) -> Result<String, String> {
    let name = project["name"]
        .as_str()
        .ok_or("Missing project name")?;
    let dir = projects_dir()?.join(sanitize_name(name));
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Phase B (t_86c34d38): once a dir is in the unified format, the unified
    // store (save_unified_project) is the canonical writer of properties.json +
    // tests/ (the TESTS view edits suites through it). The legacy ProjectContext
    // auto-loads migrated (unified-format) projects into its in-memory list and
    // auto-saves them; letting the legacy save rewrite properties.json would
    // demote the project from `APInox-unified-v1` back to `APInox-v1` (so the
    // unified store stops listing it), and rewriting tests/ would clobber
    // suites the unified store just wrote. So for unified dirs: skip
    // properties + tests, but STILL write the nested `interfaces/` (PROXY
    // "Add to APInox Project" adds requests into the nested model even on
    // migrated projects) and `folders/` (PROXY folder-destination writes) —
    // both co-exist with the unified flat-op layout in the same dir. Fully
    // moving PROXY writes onto the unified model is a separate follow-up
    // (the bulk/SoapUI/PROXY unified-model re-point).
    if is_unified_format_path(&dir) {
        save_interfaces(&dir, &project)?;
        save_folders(&dir, &project)?;
        return Ok(dir.to_string_lossy().to_string());
    }

    save_properties(&dir, &project)?;
    save_interfaces(&dir, &project)?;
    save_test_suites(&dir, &project)?;
    save_folders(&dir, &project)?;

    Ok(dir.to_string_lossy().to_string())
}

/// Write properties.json for a project.
fn save_properties(dir: &Path, project: &serde_json::Value) -> Result<(), String> {
    let props = ProjectProperties {
        name: project["name"]
            .as_str()
            .ok_or("Missing project name")?
            .to_string(),
        description: project["description"].as_str().map(|s| s.to_string()),
        id: project["id"].as_str().map(|s| s.to_string()),
        format: "APInox-v1".to_string(),
    };
    let props_val = serde_json::to_value(&props)
        .map_err(|e| format!("Failed to build properties value: {}", e))?;
    write_json(&dir.join("properties.json"), &props_val)
}

/// Save all interfaces, cleaning up orphaned directories.
fn save_interfaces(dir: &Path, project: &serde_json::Value) -> Result<(), String> {
    let interfaces_dir = dir.join("interfaces");
    fs::create_dir_all(&interfaces_dir)
        .map_err(|e| format!("Failed to create interfaces directory: {}", e))?;

    let interfaces = project["interfaces"]
        .as_array()
        .ok_or("Missing or invalid interfaces array")?;

    cleanup_orphan_dirs(&interfaces_dir, &sanitized_names(interfaces, "name"));

    for iface in interfaces {
        save_interface(iface, &interfaces_dir)?;
    }
    Ok(())
}

/// Save all test suites, cleaning up orphaned directories.
///
/// Shared by BOTH the legacy store (`save_project`) and the unified store
/// (`save_unified_project`) — the `tests/` subdir layout is identical. The
/// guard that prevents the legacy auto-save from clobbering a unified project's
/// suites lives in `save_project` (which no-ops for unified dirs), NOT here:
/// `save_unified_project` must be able to write suites through this path.
fn save_test_suites(dir: &Path, project: &serde_json::Value) -> Result<(), String> {
    let tests_dir = dir.join("tests");
    fs::create_dir_all(&tests_dir)
        .map_err(|e| format!("Failed to create tests directory: {}", e))?;

    if let Some(test_suites) = project["testSuites"].as_array() {
        cleanup_orphan_dirs(&tests_dir, &sanitized_names(test_suites, "name"));
        for suite in test_suites {
            save_test_suite(suite, &tests_dir)?;
        }
    }
    Ok(())
}

/// Save all folders, replacing any previously written folder files.
/// Shared by both the legacy and unified stores (identical `folders/` layout);
/// the unified-dir guard is in `save_project` (see save_test_suites).
fn save_folders(dir: &Path, project: &serde_json::Value) -> Result<(), String> {
    let folders_dir = dir.join("folders");
    fs::create_dir_all(&folders_dir)
        .map_err(|e| format!("Failed to create folders directory: {}", e))?;

    // Replace all folder files on every save.
    if let Ok(entries) = fs::read_dir(&folders_dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                let _ = fs::remove_file(entry.path());
            }
        }
    }

    if let Some(folders) = project["folders"].as_array() {
        for (i, folder) in folders.iter().enumerate() {
            let path = folders_dir.join(format!("{:03}_folder.json", i + 1));
            write_json(&path, folder)?;
        }
    }
    Ok(())
}

/// List all projects saved in ~/.apinox/projects/.
/// Returns a sorted list of absolute directory paths.
#[tauri::command]
pub async fn list_projects() -> Result<Vec<String>, String> {
    let dir = projects_dir()?;
    let mut paths = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("properties.json").exists() {
                // Phase B (t_86c34d38): the legacy and unified formats co-locate
                // in the same projects dir. We intentionally do NOT filter
                // unified-format dirs out here: migration is non-destructive
                // (it keeps the nested `interfaces/` tree), so a migrated
                // project is still a valid legacy project and must stay visible
                // to the PROXY / WORKFLOWS features that read the nested model.
                paths.push(path.to_string_lossy().to_string());
            }
        }
    }

    paths.sort();
    Ok(paths)
}

/// Save an interface to its directory
fn save_interface(iface: &JsonValue, interfaces_dir: &Path) -> Result<(), String> {
    let name = iface["name"]
        .as_str()
        .ok_or("Missing interface name")?;
    let safe_name = sanitize_name(name);
    let iface_dir = interfaces_dir.join(&safe_name);

    fs::create_dir_all(&iface_dir)
        .map_err(|e| format!("Failed to create interface directory: {}", e))?;

    let meta = InterfaceMeta {
        name: name.to_string(),
        type_: iface["type"].as_str().unwrap_or("soap").to_string(),
        binding_name: iface["bindingName"].as_str().map(|s| s.to_string()),
        soap_version: iface["soapVersion"].as_str().map(|s| s.to_string()),
        definition: iface["definition"].as_str().map(|s| s.to_string()),
        display_name: iface["displayName"].as_str().map(|s| s.to_string()),
    };
    let meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize interface meta: {}", e))?;
    write_json(&iface_dir.join("interface.json"), &meta_val)?;

    let operations = iface["operations"]
        .as_array()
        .ok_or("Missing or invalid operations array")?;

    cleanup_orphan_dirs(&iface_dir, &sanitized_names(operations, "name"));

    for op in operations {
        save_operation(op, &iface_dir)?;
    }

    Ok(())
}

/// Save an operation to its directory
fn save_operation(op: &JsonValue, iface_dir: &Path) -> Result<(), String> {
    let name = op["name"].as_str().ok_or("Missing operation name")?;
    let safe_name = sanitize_name(name);
    let op_dir = iface_dir.join(&safe_name);

    fs::create_dir_all(&op_dir)
        .map_err(|e| format!("Failed to create operation directory: {}", e))?;

    let meta = OperationMeta {
        name: name.to_string(),
        action: op["action"].as_str().map(|s| s.to_string()),
        input: op["input"].clone(),
        target_namespace: op["targetNamespace"].as_str().map(|s| s.to_string()),
        original_endpoint: op["originalEndpoint"].as_str().map(|s| s.to_string()),
        full_schema: op["fullSchema"].clone(),
        display_name: op["displayName"].as_str().map(|s| s.to_string()),
        output: op["output"].clone(),
        description: op["description"].as_str().map(|s| s.to_string()),
        port_name: op["portName"].as_str().map(|s| s.to_string()),
    };
    let meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize operation meta: {}", e))?;
    write_json(&op_dir.join("operation.json"), &meta_val)?;

    let requests = op["requests"]
        .as_array()
        .ok_or("Missing or invalid requests array")?;

    // Cleanup orphaned request files (xml + json pairs by stem)
    let current_request_names = sanitized_names(requests, "name");
    if let Ok(entries) = fs::read_dir(&op_dir) {
        let mut existing_bases = std::collections::HashSet::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename != "operation.json" {
                        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                            if ext == "xml" || ext == "json" {
                                if let Some(base) = path.file_stem().and_then(|s| s.to_str()) {
                                    existing_bases.insert(base.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        for base in existing_bases {
            if !current_request_names.contains(&base) {
                let _ = fs::remove_file(op_dir.join(format!("{}.xml", base)));
                let _ = fs::remove_file(op_dir.join(format!("{}.json", base)));
            }
        }
    }

    for req in requests {
        save_request(req, &op_dir)?;
    }

    Ok(())
}

/// Save a request (body + metadata)
fn save_request(req: &JsonValue, op_dir: &Path) -> Result<(), String> {
    let name = req["name"].as_str().ok_or("Missing request name")?;
    let safe_name = sanitize_name(name);

    let body = req["request"].as_str().unwrap_or("");
    fs::write(op_dir.join(format!("{}.xml", safe_name)), body)
        .map_err(|e| format!("Failed to write request body: {}", e))?;

    let meta = RequestMeta {
        name: name.to_string(),
        endpoint: req["endpoint"].as_str().map(|s| s.to_string()),
        method: req["method"].as_str().map(|s| s.to_string()),
        content_type: req["contentType"].as_str().map(|s| s.to_string()),
        headers: req["headers"].clone(),
        assertions: req["assertions"].clone(),
        id: req["id"].as_str().map(|s| s.to_string()),
        request_type: req["requestType"].as_str().map(|s| s.to_string()),
        body_type: req["bodyType"].as_str().map(|s| s.to_string()),
        rest_config: req["restConfig"].clone(),
        graphql_config: req["graphqlConfig"].clone(),
        extractors: req["extractors"].clone(),
        ws_security: req["wsSecurity"].clone(),
        attachments: req["attachments"].clone(),
    };
    let meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize request meta: {}", e))?;
    write_json(&op_dir.join(format!("{}.json", safe_name)), &meta_val)
}

/// Save a test suite to its directory
fn save_test_suite(suite: &JsonValue, tests_dir: &Path) -> Result<(), String> {
    let name = suite["name"].as_str().ok_or("Missing test suite name")?;
    let safe_name = sanitize_name(name);
    let suite_dir = tests_dir.join(&safe_name);

    fs::create_dir_all(&suite_dir)
        .map_err(|e| format!("Failed to create test suite directory: {}", e))?;

    let meta = TestSuiteMeta {
        id: suite["id"].as_str().map(|s| s.to_string()),
        name: name.to_string(),
    };
    let meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize test suite meta: {}", e))?;
    write_json(&suite_dir.join("suite.json"), &meta_val)?;

    if let Some(test_cases) = suite["testCases"].as_array() {
        cleanup_orphan_dirs(&suite_dir, &sanitized_names(test_cases, "name"));
        for tc in test_cases {
            save_test_case(tc, &suite_dir)?;
        }
    }

    Ok(())
}

/// Save a test case to its directory
fn save_test_case(tc: &JsonValue, suite_dir: &Path) -> Result<(), String> {
    let name = tc["name"].as_str().ok_or("Missing test case name")?;
    let safe_name = sanitize_name(name);
    let case_dir = suite_dir.join(&safe_name);

    fs::create_dir_all(&case_dir)
        .map_err(|e| format!("Failed to create test case directory: {}", e))?;

    let meta = TestCaseMeta {
        id: tc["id"].as_str().map(|s| s.to_string()),
        name: name.to_string(),
    };
    let meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize test case meta: {}", e))?;
    write_json(&case_dir.join("case.json"), &meta_val)?;

    // Remove all existing step files before rewriting them in order.
    if let Ok(entries) = fs::read_dir(&case_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename != "case.json" && filename.ends_with(".json") {
                        let _ = fs::remove_file(path);
                    }
                }
            }
        }
    }

    if let Some(steps) = tc["steps"].as_array() {
        for (i, step) in steps.iter().enumerate() {
            let step_name = step["name"].as_str().unwrap_or("step");
            let path = case_dir.join(format!("{:02}_{}.json", i + 1, sanitize_name(step_name)));
            write_json(&path, step)?;
        }
    }

    Ok(())
}

/// Load a project from disk
#[tauri::command]
pub async fn load_project(dir_path: String) -> Result<serde_json::Value, String> {
    load_project_internal(&dir_path).await
}

/// Internal function to load a project (callable from other modules)
pub(crate) async fn load_project_internal(dir_path: &str) -> Result<serde_json::Value, String> {
    let dir = PathBuf::from(dir_path);
    
    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Project directory does not exist: {}", dir_path));
    }
    
    // Load properties.json
    let props_path = dir.join("properties.json");
    let props_json = fs::read_to_string(&props_path)
        .map_err(|e| format!("Failed to read properties.json: {}", e))?;
    let props: ProjectProperties = serde_json::from_str(&props_json)
        .map_err(|e| format!("Failed to parse properties.json: {}", e))?;
    
    // Load interfaces
    let interfaces_dir = dir.join("interfaces");
    let mut interfaces = Vec::new();
    
    if interfaces_dir.exists() {
        if let Ok(entries) = fs::read_dir(&interfaces_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Ok(iface) = load_interface(&entry.path()) {
                        interfaces.push(iface);
                    }
                }
            }
        }
    }
    
    // Load test suites
    let tests_dir = dir.join("tests");
    let mut test_suites = Vec::new();
    
    if tests_dir.exists() {
        if let Ok(entries) = fs::read_dir(&tests_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Ok(suite) = load_test_suite(&entry.path()) {
                        test_suites.push(suite);
                    }
                }
            }
        }
    }
    
    // Load folders
    let folders_dir = dir.join("folders");
    let mut folders = Vec::new();
    
    if folders_dir.exists() {
        if let Ok(entries) = fs::read_dir(&folders_dir) {
            let mut folder_files: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
                .collect();
            
            folder_files.sort_by_key(|e| e.file_name());
            
            for entry in folder_files {
                if let Ok(folder_json) = fs::read_to_string(entry.path()) {
                    if let Ok(folder) = serde_json::from_str::<serde_json::Value>(&folder_json) {
                        folders.push(folder);
                    }
                }
            }
        }
    }
    
    // Build project object
    let project = serde_json::json!({
        "name": props.name,
        "description": props.description,
        "id": props.id,
        "interfaces": interfaces,
        "testSuites": test_suites,
        "folders": folders,
    });
    
    Ok(project)
}

/// Load an interface from its directory
fn load_interface(iface_dir: &Path) -> Result<JsonValue, String> {
    let meta_path = iface_dir.join("interface.json");
    let meta_json = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Failed to read interface.json: {}", e))?;
    let meta: InterfaceMeta = serde_json::from_str(&meta_json)
        .map_err(|e| format!("Failed to parse interface.json: {}", e))?;

    let mut meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize interface meta: {}", e))?;

    // Load operations
    let mut operations = Vec::new();

    if let Ok(entries) = fs::read_dir(iface_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(op) = load_operation(&path) {
                    operations.push(op);
                }
            }
        }
    }

    meta_val["operations"] = JsonValue::Array(operations);

    Ok(meta_val)
}

/// Load an operation from its directory
fn load_operation(op_dir: &Path) -> Result<JsonValue, String> {
    let meta_path = op_dir.join("operation.json");
    let meta_json = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Failed to read operation.json: {}", e))?;
    let meta: OperationMeta = serde_json::from_str(&meta_json)
        .map_err(|e| format!("Failed to parse operation.json: {}", e))?;

    let mut meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize operation meta: {}", e))?;

    // Load requests
    let mut requests = Vec::new();
    let mut request_bases = std::collections::HashSet::new();

    if let Ok(entries) = fs::read_dir(op_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() && path.extension().and_then(|e| e.to_str()) == Some("json") {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename != "operation.json" {
                        if let Some(base) = path.file_stem().and_then(|s| s.to_str()) {
                            request_bases.insert(base.to_string());
                        }
                    }
                }
            }
        }
    }

    for base in request_bases {
        if let Ok(req) = load_request(op_dir, &base) {
            requests.push(req);
        }
    }

    meta_val["requests"] = JsonValue::Array(requests);

    Ok(meta_val)
}

/// Load a request (body + metadata)
fn load_request(op_dir: &Path, base_name: &str) -> Result<JsonValue, String> {
    let meta_path = op_dir.join(format!("{}.json", base_name));
    let body_path = op_dir.join(format!("{}.xml", base_name));

    let meta_json = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Failed to read request metadata: {}", e))?;
    let meta: RequestMeta = serde_json::from_str(&meta_json)
        .map_err(|e| format!("Failed to parse request metadata: {}", e))?;

    let mut meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize request meta: {}", e))?;

    let body = fs::read_to_string(&body_path).unwrap_or_default();
    meta_val["request"] = JsonValue::String(body);

    Ok(meta_val)
}

/// Load a test suite from its directory
fn load_test_suite(suite_dir: &Path) -> Result<JsonValue, String> {
    let meta_path = suite_dir.join("suite.json");
    let meta_json = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Failed to read suite.json: {}", e))?;
    let meta: TestSuiteMeta = serde_json::from_str(&meta_json)
        .map_err(|e| format!("Failed to parse suite.json: {}", e))?;

    let mut meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize suite meta: {}", e))?;

    // Load test cases
    let mut test_cases = Vec::new();

    if let Ok(entries) = fs::read_dir(suite_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(tc) = load_test_case(&path) {
                    test_cases.push(tc);
                }
            }
        }
    }

    meta_val["testCases"] = JsonValue::Array(test_cases);

    Ok(meta_val)
}

/// Load a test case from its directory
fn load_test_case(case_dir: &Path) -> Result<JsonValue, String> {
    let meta_path = case_dir.join("case.json");
    let meta_json = fs::read_to_string(&meta_path)
        .map_err(|e| format!("Failed to read case.json: {}", e))?;
    let meta: TestCaseMeta = serde_json::from_str(&meta_json)
        .map_err(|e| format!("Failed to parse case.json: {}", e))?;

    let mut meta_val = serde_json::to_value(&meta)
        .map_err(|e| format!("Failed to serialize case meta: {}", e))?;

    // Load steps (ordered by filename)
    let mut steps = Vec::new();

    if let Ok(entries) = fs::read_dir(case_dir) {
        let mut step_files: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let path = e.path();
                path.is_file()
                    && path.extension().and_then(|s| s.to_str()) == Some("json")
                    && path.file_name().and_then(|f| f.to_str()) != Some("case.json")
            })
            .collect();

        step_files.sort_by_key(|e| e.file_name());

        for entry in step_files {
            if let Ok(step_json) = fs::read_to_string(entry.path()) {
                if let Ok(step) = serde_json::from_str::<JsonValue>(&step_json) {
                    steps.push(step);
                }
            }
        }
    }

    meta_val["steps"] = JsonValue::Array(steps);

    Ok(meta_val)
}

/// Delete a project by name
#[tauri::command]
pub fn delete_project(params: serde_json::Value) -> Result<(), String> {
    let project_name = params.get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing project name".to_string())?;
    
    let projects_base = projects_dir().map_err(|e| format!("Failed to get projects dir: {}", e))?;
    // Sanitize name for use as directory name
    let sanitized: String = project_name.chars().map(|c| match c {
        '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
        _ => c,
    }).collect();
    let dir = projects_base.join(&sanitized);
    
    if !dir.exists() {
        return Err(format!("Project directory does not exist: {}", sanitized));
    }
    
    fs::remove_dir_all(&dir)
        .map_err(|e| format!("Failed to delete project: {}", e))?;
    
    log::info!("Deleted project: {}", project_name);
    
    Ok(())
}

/// Close a project
///
/// This command doesn't need to do anything on the backend since we don't maintain
/// project "open" state in Rust. The frontend handles clearing selection/state.
/// This command exists for consistency and to avoid "not implemented" errors.
#[tauri::command]
pub async fn close_project(_project_id: String) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "success": true }))
}

// ============================================================================
// Phase B (t_86c34d38): legacy → unified project migration
// ============================================================================
//
// Legacy `APInox-v1` project directories and unified `APInox-unified-v1`
// directories COLOCATE in the same `~/.apinox/projects/` dir (the unified
// store was never given its own `unified-projects/` directory). The migration
// therefore converts legacy dirs IN PLACE: nested `interfaces[]` → flat
// `operations[]` dirs, `properties.json` format bump, `tests/` + `folders/`
// subdirs preserved (unified projects now carry suites/folders too).
//
// NON-DESTRUCTIVE: the legacy nested `interfaces/` tree is KEPT. The unified
// flat-op layout is additive, so a migrated project is simultaneously a valid
// unified AND a valid legacy project. PROXY (AddToProjectDialog) and WORKFLOWS
// (WorkflowEditor) still read the nested legacy model; deleting `interfaces/`
// would regress them the moment a legacy project auto-migrates.
//
// Idempotent: dirs already in unified format are skipped.

/// Convert a legacy NESTED project (with `interfaces[].operations[]`) into the
/// flat UNIFIED project shape (`operations[]`), as an in-memory `Value`.
///
/// This is the canonical nested→unified transform. It is shared by:
///   * the on-disk legacy→unified migration ([`migrate_legacy_project_dir`]), and
///   * the import write paths (Bulk Import / SoapUI import,
///     [`save_imported_project_as_unified`]),
/// so there is exactly one place that flattens the nested model and no
/// divergent copies of the logic.
///
/// The per-operation field shape (OperationMeta) is identical between the
/// legacy and unified on-disk formats, so `save_unified_operation` can write
/// the flattened operations verbatim. Operations with colliding names (from
/// different interfaces) get an `"(Interface)"` suffix to stay unique on disk.
pub(crate) fn nested_project_to_unified(legacy: &serde_json::Value) -> Result<serde_json::Value, String> {
    let name = legacy["name"]
        .as_str()
        .ok_or_else(|| "Legacy project has no name".to_string())?;

    // Flatten nested interfaces[].operations[] into a single flat operations[].
    let mut operations: Vec<JsonValue> = Vec::new();
    let mut used_names: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut first_iface: Option<JsonValue> = None;
    let mut any_wsdl = false;

    // Deterministic order: the legacy on-disk layout stores interfaces as an
    // unordered directory, so sort by name before flattening (operation order
    // and the primary sourceUrl must not depend on fs::read_dir order).
    let mut interfaces: Vec<JsonValue> = legacy["interfaces"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    interfaces.sort_by(|a, b| {
        a["name"].as_str().unwrap_or("").cmp(b["name"].as_str().unwrap_or(""))
    });

    for iface in interfaces {
        if first_iface.is_none() {
            first_iface = Some(iface.clone());
        }
        if iface.get("definition").and_then(|d| d.as_str()).map(|d| !d.is_empty()).unwrap_or(false) {
            any_wsdl = true;
        }
        let iface_name = iface["name"].as_str().unwrap_or("");
        if let Some(ops) = iface["operations"].as_array() {
            for op in ops {
                let op_name = op["name"].as_str().ok_or("operation missing name")?;
                let mut unique_name = op_name.to_string();
                if !used_names.insert(sanitize_name(&unique_name)) {
                    unique_name = format!("{} ({})", op_name, iface_name);
                    if !used_names.insert(sanitize_name(&unique_name)) {
                        // Last resort: keep them distinct regardless of sanitization.
                        unique_name = format!("{} #{}", unique_name, operations.len());
                        used_names.insert(sanitize_name(&unique_name));
                    }
                }
                let mut op_clone = op.clone();
                op_clone["name"] = JsonValue::String(unique_name);
                operations.push(op_clone);
            }
        }
    }

    let iface = first_iface.unwrap_or(JsonValue::Null);
    // sourceUrl comes from the FIRST interface (the primary WSDL definition),
    // matching the legacy "one interface = the project's WSDL" semantics.
    let source_url = iface.get("definition")
        .and_then(|d| d.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    Ok(serde_json::json!({
        "name": name,
        "description": legacy["description"],
        "id": legacy["id"],
        "source": if any_wsdl { "wsdl" } else { "manual" },
        "sourceUrl": source_url,
        "parsedAt": chrono::Utc::now().to_rfc3339(),
        "soapVersion": iface.get("soapVersion"),
        "bindingName": iface.get("bindingName"),
        "operations": operations,
        // Suites and folders keep their exact on-disk layout — carried over so
        // migration loses no test data or user folders.
        "testSuites": legacy.get("testSuites").cloned().unwrap_or(JsonValue::Array(vec![])),
        "folders": legacy.get("folders").cloned().unwrap_or(JsonValue::Array(vec![])),
    }))
}

/// Migrate one legacy project dir to the unified layout, in place.
/// Returns true if a migration happened, false if the dir was already unified.
pub(crate) async fn migrate_legacy_project_dir(dir: &Path) -> Result<bool, String> {
    if is_unified_format_path(dir) {
        return Ok(false);
    }

    // Full legacy project value (interfaces[], testSuites[], folders[]).
    let legacy = load_project_internal(&dir.to_string_lossy()).await?;
    let name = legacy["name"]
        .as_str()
        .ok_or_else(|| format!("Legacy project in {} has no name", dir.display()))?;

    let unified = nested_project_to_unified(&legacy)?;

    // Write the unified layout (properties.json + flat operation dirs + tests/ + folders/).
    save_unified_project(dir.to_string_lossy().into(), unified)?;

    // NON-DESTRUCTIVE: keep the legacy `interfaces/` tree. The unified and
    // legacy formats co-locate in the same dir and PROXY (AddToProjectDialog /
    // "Add to APInox Project") + WORKFLOWS (WorkflowEditor request-picker)
    // still read the NESTED legacy model. Deleting `interfaces/` here would
    // silently regress those features once every legacy project auto-migrates.
    // The unified flat-op layout is purely additive (save_unified_project also
    // protects `interfaces/` from its orphan cleanup), so a migrated project is
    // simultaneously a valid unified AND a valid legacy project.
    //
    // `save_unified_project` rewrites tests/ + folders/ from `unified` (which
    // carried the exact legacy values), so those stay byte-for-byte coherent
    // with the legacy model — no data loss on either side.

    log::info!("Migrated legacy project '{}' to unified format (legacy interfaces/ preserved)", name);
    Ok(true)
}

/// Migrate all legacy project dirs in the projects dir, in place (idempotent).
/// Returns the names of the projects that were migrated.
#[tauri::command]
pub async fn migrate_legacy_projects() -> Result<Vec<String>, String> {
    let base = projects_dir()?;
    let mut migrated: Vec<String> = Vec::new();

    if let Ok(entries) = fs::read_dir(&base) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() || !path.join("properties.json").exists() {
                continue;
            }
            if is_unified_format_path(&path) {
                continue;
            }
            match migrate_legacy_project_dir(&path).await {
                Ok(true) => {
                    if let Some(n) = path.file_name().and_then(|f| f.to_str()) {
                        migrated.push(n.to_string());
                    }
                }
                Ok(false) => {}
                Err(e) => {
                    log::warn!("Migration of {} failed (left as-is): {}", path.display(), e);
                }
            }
        }
    }

    Ok(migrated)
}

// ============================================================================
// t_b2eae8b0: import write paths (Bulk Import / SoapUI) → unified store
// ============================================================================
//
// Before this, the two import flows (Bulk Import `onImportComplete` and the
// SoapUI `loadProject` `.xml` branch) wrote the LEGACY nested model
// (`save_project` → `interfaces/`), relying on the non-destructive
// legacy→unified migration (above) to surface them in the unified store.
// This command re-points those write paths at the canonical UNIFIED store
// directly: it flattens the nested project (reusing
// [`nested_project_to_unified`]) and persists it via `save_unified_project`.

/// Persist an imported NESTED project (Bulk Import / SoapUI) directly into the
/// canonical UNIFIED store (`APInox-unified-v1` + flat operations layout), so
/// the import lands in the canonical store without relying on the
/// legacy-format fallback.
///
/// The nested→flat transform reuses the canonical migration logic
/// ([`nested_project_to_unified`]).
///
/// Non-destructive + idempotent guarantees:
///   * A same-named NON-UNIFIED (legacy) dir is never clobbered — the import
///     is written to a suffixed, unique name so both co-exist.
///   * An existing UNIFIED project dir of the same name is MERGED: operations
///     already on disk (by name) are kept, and only new operations are added
///     (re-importing the same WSDL/SoapUI file is a no-op). The existing
///     project's test suites and folders are preserved, so a re-import never
///     drops test data or user folders.
///
/// Returns the unified project as persisted on disk (the merged result).
#[tauri::command]
pub async fn save_imported_project_as_unified(project: serde_json::Value) -> Result<serde_json::Value, String> {
    let base = projects_dir()?;
    let name = project["name"]
        .as_str()
        .ok_or("Missing project name")?
        .to_string();
    let mut dir = base.join(sanitize_name(&name));

    // Never clobber a same-named non-unified (legacy) dir: write the import
    // under a suffixed, unique name so both co-exist.
    if dir.exists() && !is_unified_format_path(&dir) {
        let mut i = 2usize;
        let mut candidate_name = format!("{} ({})", name, i);
        loop {
            let candidate_dir = base.join(sanitize_name(&candidate_name));
            if !candidate_dir.exists() {
                dir = candidate_dir;
                break;
            }
            i += 1;
            candidate_name = format!("{} ({})", name, i);
        }
        let mut renamed = project;
        renamed["name"] = serde_json::Value::String(candidate_name.clone());
        let unified = nested_project_to_unified(&renamed)?;
        save_unified_project(dir.to_string_lossy().into(), unified)?;
        // Additive nested write (fresh dir) so PROXY / WORKFLOWS — which still
        // read the nested legacy model — can see the imported operations too,
        // mirroring the non-destructive migration that keeps interfaces/.
        save_nested_interfaces_if_absent(&dir, &renamed)?;
        log::info!(
            "save_imported_project_as_unified: '{}' renamed to '{}' to avoid clobbering a non-unified dir",
            name,
            candidate_name
        );
        return Ok(load_unified_project(dir.to_string_lossy().into())?);
    }

    let unified = nested_project_to_unified(&project)?;

    // Merge policy for an existing unified dir: keep the operations already
    // on disk (existing wins) and append only the operations the import brings
    // in that don't exist yet. This keeps re-imports idempotent and never
    // clobbers user edits.
    let existing = if is_unified_format_path(&dir) {
        load_unified_project(dir.to_string_lossy().into()).ok()
    } else {
        None
    };

    let final_project = match existing {
        Some(existing) => {
            let mut merged_ops: Vec<JsonValue> = existing
                .get("operations")
                .and_then(|o| o.as_array())
                .cloned()
                .unwrap_or_default();
            let existing_names: std::collections::HashSet<String> = merged_ops
                .iter()
                .filter_map(|o| o["name"].as_str())
                .map(sanitize_name)
                .collect();
            let incoming = unified
                .get("operations")
                .and_then(|o| o.as_array())
                .cloned()
                .unwrap_or_default();
            for op in incoming {
                let op_name = op["name"].as_str().unwrap_or("");
                if !existing_names.contains(&sanitize_name(op_name)) {
                    merged_ops.push(op);
                }
            }
            // Carry over the existing project's suites/folders so a re-import
            // into an existing project never drops test data or folders.
            serde_json::json!({
                "name": existing["name"],
                "description": existing.get("description").cloned(),
                "id": existing.get("id").cloned(),
                "source": existing.get("source").cloned().unwrap_or_else(|| unified["source"].clone()),
                "sourceUrl": existing.get("sourceUrl").cloned().or_else(|| unified.get("sourceUrl").cloned()),
                "parsedAt": existing.get("parsedAt").cloned().unwrap_or_else(|| unified["parsedAt"].clone()),
                "lastRefreshedAt": existing.get("lastRefreshedAt").cloned(),
                "soapVersion": existing.get("soapVersion").cloned().or_else(|| unified.get("soapVersion").cloned()),
                "bindingName": existing.get("bindingName").cloned().or_else(|| unified.get("bindingName").cloned()),
                // User-set via the unified explorer (content-type override,
                // display-only rename) — preserve across a re-import.
                "contentType": existing.get("contentType").cloned(),
                "displayName": existing.get("displayName").cloned(),
                "operations": merged_ops,
                "testSuites": existing.get("testSuites").cloned().unwrap_or(JsonValue::Array(vec![])),
                "folders": existing.get("folders").cloned().unwrap_or(JsonValue::Array(vec![])),
            })
        }
        None => unified,
    };

    save_unified_project(dir.to_string_lossy().into(), final_project.clone())?;
    // Additive nested write so PROXY / WORKFLOWS — which still read the nested
    // legacy model (out of scope to decouple; see t_86c34d38) — can see the
    // imported operations, mirroring the non-destructive migration that keeps
    // the interfaces/ tree. Only writes when absent, so a merge into an
    // existing project never clobbers interfaces PROXY has already added.
    save_nested_interfaces_if_absent(&dir, &project)?;
    log::info!("save_imported_project_as_unified: persisted '{}' to {}", final_project["name"].as_str().unwrap_or(&name), dir.display());
    Ok(load_unified_project(dir.to_string_lossy().into())?)
}

/// Write the nested legacy `interfaces/` tree for `project` under `dir`, ONLY
/// if the tree does not already exist (additive).
///
/// This keeps an imported project visible to the legacy-model features (PROXY
/// "Add to APInox Project" and WORKFLOWS request-picker), which read the
/// nested `interfaces[]` — the same non-destructive guarantee the legacy→
/// unified migration provides (it keeps `interfaces/` so those features keep
/// working on migrated projects). Guarding on absence means a re-import (merge)
/// into an existing project never overwrites interfaces PROXY has since added.
fn save_nested_interfaces_if_absent(dir: &Path, project: &serde_json::Value) -> Result<(), String> {
    let interfaces_dir = dir.join("interfaces");
    if interfaces_dir.exists() {
        return Ok(());
    }
    let interfaces = project["interfaces"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if interfaces.is_empty() {
        return Ok(());
    }
    save_interfaces(dir, project)
}

// ============================================================================
// Unified Project Storage (WSDL service = top-level project)
// ============================================================================

/// Unified project properties for properties.json
#[derive(Debug, Serialize, Deserialize)]
struct UnifiedProperties {
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    parsed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    last_refreshed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    /// SOAP version ("1.1" or "1.2") — preserved across save/load/refresh
    #[serde(skip_serializing_if = "Option::is_none")]
    soap_version: Option<String>,
    /// WSDL binding name — preserved across save/load/refresh
    #[serde(skip_serializing_if = "Option::is_none")]
    binding_name: Option<String>,
    /// Optional interface-level Content-Type override (see SOAP_INTERFACE_CONTENT_TYPE_SPEC).
    /// `None`/empty = no override, requests fall through to the SOAP-version default.
    #[serde(skip_serializing_if = "Option::is_none")]
    content_type: Option<String>,
    /// R-10 (F-17): display-only rename override. `None` = show the stable
    /// `name` (the UI falls back to it). Persisted additively — old
    /// `properties.json` files without the field load as `None`.
    #[serde(rename = "displayName", default, skip_serializing_if = "Option::is_none")]
    display_name: Option<String>,
}

/// Save a unified project (flat layout: no interfaces/ wrapper)
/// Disk layout:
///   ProjectDir/
///   ├── properties.json
///   ├── Operation1/
///   │   ├── operation.json
///   │   ├── sample.xml
///   │   └── sample.json
///   └── Operation2/
///       ├── operation.json
///       ├── custom.xml
///       └── custom.json
#[tauri::command]
pub fn save_unified_project(dir_path: String, project: serde_json::Value) -> Result<(), String> {
    let dir = resolve_unified_project_dir(&dir_path, project["name"].as_str())?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create project directory: {}", e))?;

    // Write properties.json with unified fields
    let props = UnifiedProperties {
        name: project["name"].as_str()
            .ok_or("Missing project name")?
            .to_string(),
        description: project["description"].as_str().map(|s| s.to_string()),
        source: project["source"].as_str().map(|s| s.to_string()),
        source_url: project["sourceUrl"].as_str().map(|s| s.to_string()),
        parsed_at: project["parsedAt"].as_str().map(|s| s.to_string()),
        last_refreshed_at: project["lastRefreshedAt"].as_str().map(|s| s.to_string()),
        id: project["id"].as_str().map(|s| s.to_string()),
        format: Some("APInox-unified-v1".to_string()),
        soap_version: project["soapVersion"].as_str().map(|s| s.to_string()),
        binding_name: project["bindingName"].as_str().map(|s| s.to_string()),
        content_type: project["contentType"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string()),
        // R-10 (F-17): display-only rename override (additive; absent on old files).
        display_name: project["displayName"]
            .as_str()
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string()),
    };
    let props_val = serde_json::to_value(&props)
        .map_err(|e| format!("Failed to build properties value: {}", e))?;
    write_json(&dir.join("properties.json"), &props_val)?;

    // Save operations directly under project dir (no interfaces/ wrapper)
    let operations = project["operations"]
        .as_array()
        .ok_or("Missing or invalid operations array")?;

    let op_names = sanitized_names(operations, "name");
    // Phase B (t_86c34d38): `tests/` and `folders/` hold the project's test
    // suites and user folders (shared with the legacy layout) — protect them
    // from the operation-dir cleanup. `interfaces/` is the LEGACY nested tree:
    // the unified and legacy formats co-locate in the same dir and PROXY /
    // WORKFLOWS still read the nested model, so a unified save must not delete
    // it (making the migration non-destructive is what keeps those features
    // working — see migrate_legacy_project_dir).
    let mut keep: std::collections::HashSet<String> = op_names;
    keep.insert("tests".to_string());
    keep.insert("folders".to_string());
    keep.insert("interfaces".to_string());
    cleanup_orphan_dirs(&dir, &keep);

    for op in operations {
        save_unified_operation(op, &dir)?;
    }

    // Persist test suites and folders alongside the operations (same `tests/` /
    // `folders/` layout as the legacy store, so a migrated project round-trips).
    if let Some(test_suites) = project.get("testSuites").and_then(|v| v.as_array()) {
        save_test_suites(&dir, &project)?;
        let _ = test_suites;
    }
    if let Some(folders) = project.get("folders").and_then(|v| v.as_array()) {
        save_folders(&dir, &project)?;
        let _ = folders;
    }

    Ok(())
}

/// Save a single operation under the unified project
fn save_unified_operation(op: &serde_json::Value, project_dir: &Path) -> Result<(), String> {
    let name = op["name"].as_str().ok_or("Missing operation name")?;
    let safe_name = sanitize_name(name);
    let op_dir = project_dir.join(&safe_name);

    fs::create_dir_all(&op_dir)
        .map_err(|e| format!("Failed to create operation directory: {}", e))?;

    write_json(&op_dir.join("operation.json"), &serde_json::json!({
        "name": name,
        "action": op["action"],
        "input": op["input"],
        "targetNamespace": op["targetNamespace"],
        "originalEndpoint": op["originalEndpoint"],
        "fullSchema": op["fullSchema"],
        "displayName": op["displayName"],
        // Required by ServiceOperation on load — persist so save → load → execute round-trips.
        "output": op.get("output").cloned().unwrap_or(serde_json::Value::Null),
        "description": op["description"],
        "portName": op["portName"],
    }))?;

    let requests = op["requests"]
        .as_array()
        .ok_or("Missing or invalid requests array")?;

    // Cleanup orphaned request files
    let current_request_names = sanitized_names(requests, "name");
    if let Ok(entries) = fs::read_dir(&op_dir) {
        let mut existing_bases = std::collections::HashSet::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if filename != "operation.json" {
                        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                            if ext == "xml" || ext == "json" {
                                if let Some(base) = path.file_stem().and_then(|s| s.to_str()) {
                                    existing_bases.insert(base.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
        for base in existing_bases {
            if !current_request_names.contains(&base) {
                let _ = fs::remove_file(op_dir.join(format!("{}.xml", base)));
                let _ = fs::remove_file(op_dir.join(format!("{}.json", base)));
            }
        }
    }

    for req in requests {
        save_unified_request(req, &op_dir)?;
    }

    Ok(())
}

/// Save a single request (body + metadata) for unified project
fn save_unified_request(req: &serde_json::Value, op_dir: &Path) -> Result<(), String> {
    let name = req["name"].as_str().ok_or("Missing request name")?;
    let safe_name = sanitize_name(name);

    let body = req["request"].as_str().unwrap_or("");
    fs::write(op_dir.join(format!("{}.xml", safe_name)), body)
        .map_err(|e| format!("Failed to write request body: {}", e))?;

    write_json(&op_dir.join(format!("{}.json", safe_name)), &serde_json::json!({
        "name": name,
        "endpoint": req["endpoint"],
        "method": req["method"],
        "contentType": req["contentType"],
        "headers": req["headers"],
        "assertions": req["assertions"],
        "id": req["id"],
        "requestType": req["requestType"],
        "bodyType": req["bodyType"],
        "restConfig": req["restConfig"],
        "graphqlConfig": req["graphqlConfig"],
        "extractors": req["extractors"],
        "wsSecurity": req["wsSecurity"],
        "attachments": req["attachments"],
        "lastResponse": req["lastResponse"],
        // R-10 (F-17): display-only rename override (additive; absent on old files).
        "displayName": req["displayName"],
    }))?;

    Ok(())
}

/// Load a unified project from disk
#[tauri::command]
pub fn load_unified_project(dir_path: String) -> Result<serde_json::Value, String> {
    let dir = resolve_unified_project_dir(&dir_path, None)?;

    if !dir.exists() || !dir.is_dir() {
        return Err(format!("Project directory does not exist: {}", dir.display()));
    }

    // Load properties.json
    let props_path = dir.join("properties.json");
    let props_json = fs::read_to_string(&props_path)
        .map_err(|e| format!("Failed to read properties.json: {}", e))?;
    let props: UnifiedProperties = serde_json::from_str(&props_json)
        .map_err(|e| format!("Failed to parse properties.json: {}", e))?;

    // Load operations directly under project dir (tests/ and folders/ subdirs are
    // skipped naturally — they carry suite.json / case.json / _folder.json, not operation.json).
    let mut operations = Vec::new();
    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(op) = load_unified_operation(&path) {
                    operations.push(op);
                }
            }
        }
    }

    // Phase B (t_86c34d38): unified projects now also carry test suites and
    // user folders (relocated from the legacy ApinoxProject). They live in the
    // same `tests/` / `folders/` subdirs as the legacy layout.
    let test_suites = load_test_suites_from_dir(&dir);
    let folders = load_folders_from_dir(&dir);

    Ok(serde_json::json!({
        "name": props.name,
        "description": props.description,
        "source": props.source.unwrap_or("manual".to_string()),
        "sourceUrl": props.source_url,
        "parsedAt": props.parsed_at,
        "lastRefreshedAt": props.last_refreshed_at,
        "id": props.id,
        "soapVersion": props.soap_version,
        "bindingName": props.binding_name,
        "contentType": props.content_type,
        // R-10 (F-17): display-only rename override (null when unset).
        "displayName": props.display_name,
        "operations": operations,
        "testSuites": test_suites,
        "folders": folders,
    }))
}

/// Load all test suites from a project dir's `tests/` subdir (Phase B, t_86c34d38).
/// Shared by the unified and legacy loaders so the on-disk layout stays identical.
fn load_test_suites_from_dir(dir: &Path) -> Vec<JsonValue> {
    let tests_dir = dir.join("tests");
    let mut test_suites = Vec::new();
    if tests_dir.exists() {
        if let Ok(entries) = fs::read_dir(&tests_dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Ok(suite) = load_test_suite(&entry.path()) {
                        test_suites.push(suite);
                    }
                }
            }
        }
    }
    test_suites
}

/// Load all folders from a project dir's `folders/` subdir (Phase B, t_86c34d38).
/// Files are named `001_folder.json`, `002_folder.json`, … and read in order.
fn load_folders_from_dir(dir: &Path) -> Vec<JsonValue> {
    let folders_dir = dir.join("folders");
    let mut folders = Vec::new();
    if folders_dir.exists() {
        if let Ok(entries) = fs::read_dir(&folders_dir) {
            let mut folder_files: Vec<_> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().extension().and_then(|s| s.to_str()) == Some("json"))
                .collect();
            folder_files.sort_by_key(|e| e.file_name());
            for entry in folder_files {
                if let Ok(folder_json) = fs::read_to_string(entry.path()) {
                    if let Ok(folder) = serde_json::from_str::<serde_json::Value>(&folder_json) {
                        folders.push(folder);
                    }
                }
            }
        }
    }
    folders
}

/// Load a single operation from a unified project
fn load_unified_operation(op_dir: &Path) -> Result<serde_json::Value, String> {
    let op_path = op_dir.join("operation.json");
    let op_json = fs::read_to_string(&op_path)
        .map_err(|e| format!("Failed to read operation.json: {}", e))?;

    // Load requests
    let mut requests = Vec::new();
    if let Ok(entries) = fs::read_dir(op_dir) {
        let mut request_bases = std::collections::HashSet::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|f| f.to_str()) {
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        if ext == "json" && filename != "operation.json" {
                            if let Some(base) = path.file_stem().and_then(|s| s.to_str()) {
                                request_bases.insert(base.to_string());
                            }
                        }
                    }
                }
            }
        }

        for base in request_bases {
            let meta_path = op_dir.join(format!("{}.json", base));
            let body_path = op_dir.join(format!("{}.xml", base));
            if meta_path.exists() {
                let meta_json = fs::read_to_string(&meta_path)
                    .map_err(|e| format!("Failed to read request metadata: {}", e))?;
                let body = if body_path.exists() {
                    fs::read_to_string(&body_path).ok()
                } else {
                    None
                };
                let mut meta: serde_json::Value = serde_json::from_str(&meta_json)
                    .map_err(|e| format!("Failed to parse request metadata: {}", e))?;
                if let Some(ref b) = body {
                    log::info!(
                        "Loading request '{}': body_path={}, body exists={}, body_len={}",
                        base,
                        body_path.display(),
                        body_path.exists(),
                        b.len()
                    );
                    meta["request"] = serde_json::Value::String(b.clone());
                } else {
                    log::warn!("Loading request '{}': body_path={} does not exist", base, body_path.display());
                }
                requests.push(meta);
            }
        }
    }

    let op_data: serde_json::Value = serde_json::from_str(&op_json)
        .map_err(|e| format!("Failed to parse operation.json: {}", e))?;
    let name = op_data["name"].as_str().ok_or("Missing operation name")?;

    Ok(serde_json::json!({
        "name": name,
        "action": op_data["action"],
        "input": op_data["input"],
        "targetNamespace": op_data["targetNamespace"],
        "originalEndpoint": op_data["originalEndpoint"],
        "fullSchema": op_data["fullSchema"],
        "displayName": op_data["displayName"],
        // Legacy files saved before output was persisted lack it; fall back to null so
        // ServiceOperation deserialization (required field) still succeeds.
        "output": op_data.get("output").cloned().unwrap_or(serde_json::Value::Null),
        "description": op_data["description"],
        "portName": op_data["portName"],
        "requests": requests,
    }))
}

/// List all unified projects in ~/.apinox/projects/
#[tauri::command]
pub fn list_unified_projects() -> Result<Vec<serde_json::Value>, String> {
    let dir = projects_dir()?;
    let mut projects = Vec::new();

    if let Ok(entries) = fs::read_dir(&dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && path.join("properties.json").exists() {
                // Phase B (t_86c34d38): legacy `APInox-v1` project directories
                // colocate with unified ones in the same `projects/` dir (they
                // also carry a properties.json). Only list unified-format
                // projects — before this filter, legacy dirs leaked into the
                // unified list as empty-operation husks.
                if !is_unified_format_path(&path) {
                    continue;
                }
                if let Ok(project) = load_unified_project(path.to_string_lossy().into()) {
                    projects.push(project);
                }
            }
        }
    }
    projects.sort_by(|a, b| {
        a["name"].as_str().cmp(&b["name"].as_str())
    });
    Ok(projects)
}

/// True if `dir/properties.json` declares the unified project format.
fn is_unified_format_path(dir: &Path) -> bool {
    let props_path = dir.join("properties.json");
    match fs::read_to_string(&props_path) {
        Ok(json) => serde_json::from_str::<serde_json::Value>(&json)
            .map(|v| v.get("format").and_then(|f| f.as_str()) == Some("APInox-unified-v1"))
            .unwrap_or(false),
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsers::wsdl::types::ServiceOperation;

    #[test]
    fn resolve_unified_project_dir_maps_relative_names_to_projects_dir() {
        let resolved = resolve_unified_project_dir("CountryInfoServiceSoap", Some("CountryInfoServiceSoap"))
            .expect("should resolve project dir");

        assert!(resolved.ends_with("CountryInfoServiceSoap"));
        assert!(resolved.is_absolute());
    }

    #[test]
    fn save_load_unified_project_round_trips_content_type_soap_version_binding_name() {
        let dir = std::env::temp_dir().join(format!("apinox-unified-ct-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp dir");

        let project = serde_json::json!({
            "name": "CtTestService",
            "description": "ct test",
            "source": "wsdl",
            "sourceUrl": "http://example.com/test.wsdl",
            "parsedAt": "2024-01-01T00:00:00+00:00",
            "id": "ct-test-id",
            "soapVersion": "1.2",
            "bindingName": "CtTestSoap12",
            "contentType": "application/soap+xml",
            "operations": serde_json::json!([
                {
                    "name": "TestOp",
                    "action": null,
                    "input": null,
                    "targetNamespace": null,
                    "originalEndpoint": "http://example.com/svc",
                    "fullSchema": null,
                    "displayName": null,
                    "requests": serde_json::json!([
                        {
                            "name": "sample_TestOp",
                            "endpoint": "http://example.com/svc",
                            "method": "POST",
                            "contentType": "application/soap+xml; charset=utf-8",
                            "request": "<soap:Envelope></soap:Envelope>"
                        }
                    ])
                }
            ]),
        });

        save_unified_project(dir.to_string_lossy().to_string(), project).expect("save should succeed");

        // properties.json must carry the snake_case keys
        let props_path = dir.join("properties.json");
        let props_str = std::fs::read_to_string(&props_path).expect("properties.json written");
        let props: serde_json::Value = serde_json::from_str(&props_str).unwrap();
        assert_eq!(props["soap_version"], "1.2");
        assert_eq!(props["binding_name"], "CtTestSoap12");
        assert_eq!(props["content_type"], "application/soap+xml");

        let loaded = load_unified_project(dir.to_string_lossy().to_string()).expect("load should succeed");
        assert_eq!(loaded["soapVersion"], "1.2");
        assert_eq!(loaded["bindingName"], "CtTestSoap12");
        assert_eq!(loaded["contentType"], "application/soap+xml");
        assert_eq!(loaded["sourceUrl"], "http://example.com/test.wsdl");
        assert_eq!(loaded["operations"][0]["name"], "TestOp");

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn save_unified_project_empty_content_type_is_not_persisted() {
        let dir = std::env::temp_dir().join(format!("apinox-unified-ct-empty-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("create temp dir");

        let project = serde_json::json!({
            "name": "CtEmptyService",
            "source": "wsdl",
            "soapVersion": "1.1",
            "contentType": "",
            "operations": serde_json::json!([
                {
                    "name": "OpA",
                    "requests": serde_json::json!([]),
                }
            ]),
        });

        save_unified_project(dir.to_string_lossy().to_string(), project).expect("save should succeed");

        let props_path = dir.join("properties.json");
        let props: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&props_path).expect("properties.json written")).unwrap();
        assert!(props.get("content_type").map(|v| v.is_null()).unwrap_or(true),
            "empty contentType must not be persisted as a value");

        let loaded = load_unified_project(dir.to_string_lossy().to_string()).expect("load should succeed");
        assert!(loaded["contentType"].is_null());

        std::fs::remove_dir_all(&dir).ok();
    }

    /// H2: operation metadata (output/description/portName) must survive
    /// save → load in the folder (interfaces) format, and the loaded value
    /// must still deserialize into ServiceOperation (required `output` field).
    #[test]
    fn folder_operation_save_load_round_trips_output_description_portname() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let op = serde_json::json!({
            "name": "GetUser",
            "action": "http://example.com/GetUser",
            "input": { "name": "GetUserRequest" },
            "targetNamespace": "http://example.com",
            "originalEndpoint": "http://example.com/service",
            "fullSchema": null,
            "displayName": "Get User",
            "output": { "name": "GetUserResponse" },
            "description": "Returns a user",
            "portName": "GetUserPort",
            "requests": []
        });

        save_operation(&op, tmp.path()).expect("save_operation");
        let loaded = load_operation(&tmp.path().join("GetUser")).expect("load_operation");

        assert_eq!(loaded["output"], serde_json::json!({ "name": "GetUserResponse" }));
        assert_eq!(loaded["description"], "Returns a user");
        assert_eq!(loaded["portName"], "GetUserPort");
        assert_eq!(loaded["displayName"], "Get User");
        assert_eq!(loaded["originalEndpoint"], "http://example.com/service");

        // The normal user flow: load project → run → ServiceOperation deserialization.
        let service_op: ServiceOperation =
            serde_json::from_value(loaded).expect("loaded op must deserialize");
        assert_eq!(service_op.name, "GetUser");
        assert_eq!(service_op.output, serde_json::json!({ "name": "GetUserResponse" }));
        assert_eq!(service_op.port_name.as_deref(), Some("GetUserPort"));
        assert_eq!(service_op.original_endpoint.as_deref(), Some("http://example.com/service"));
    }

    /// H2: legacy operation.json files saved before `output` was persisted
    /// must still load and deserialize (fallback to null).
    #[test]
    fn folder_operation_load_without_output_field_still_deserializes() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let op_dir = tmp.path().join("LegacyOp");
        fs::create_dir_all(&op_dir).expect("mkdir");
        fs::write(
            op_dir.join("operation.json"),
            r#"{
                "name": "LegacyOp",
                "input": null,
                "targetNamespace": "http://example.com",
                "fullSchema": null
            }"#,
        )
        .expect("write legacy operation.json");

        let loaded = load_operation(&op_dir).expect("load_operation");
        assert!(loaded["output"].is_null());

        let service_op: ServiceOperation =
            serde_json::from_value(loaded).expect("legacy op must deserialize");
        assert_eq!(service_op.name, "LegacyOp");
    }

    /// H2: the unified save path must persist output/description/portName,
    /// and a unified load of that directory must yield a deserializable op.
    #[test]
    fn unified_operation_save_load_round_trips_output() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let dir = tmp.path().join("TestUnified");
        fs::create_dir_all(&dir).expect("mkdir");
        // properties.json is required by load_unified_project
        fs::write(
            dir.join("properties.json"),
            r#"{"name": "TestUnified", "format": "APInox-unified-v1"}"#,
        )
        .expect("write properties.json");

        let op = serde_json::json!({
            "name": "GetCountry",
            "action": "http://example.com/GetCountry",
            "input": { "name": "GetCountryRequest" },
            "targetNamespace": "http://example.com",
            "originalEndpoint": "http://example.com/country",
            "fullSchema": null,
            "displayName": "Get Country",
            "output": { "name": "GetCountryResponse" },
            "description": "Country info",
            "portName": "CountryPort",
            "requests": []
        });
        save_unified_operation(&op, &dir).expect("save_unified_operation");

        let on_disk: serde_json::Value =
            serde_json::from_str(&fs::read_to_string(dir.join("GetCountry").join("operation.json")).expect("read operation.json"))
                .expect("parse operation.json");
        assert_eq!(on_disk["output"], serde_json::json!({ "name": "GetCountryResponse" }));
        assert_eq!(on_disk["description"], "Country info");
        assert_eq!(on_disk["portName"], "CountryPort");

        // Full unified load (absolute dir path passes through resolve as-is)
        let project = load_unified_project(dir.to_string_lossy().into())
            .expect("load_unified_project");
        let loaded_op = &project["operations"][0];
        let service_op: ServiceOperation =
            serde_json::from_value(loaded_op.clone()).expect("loaded unified op must deserialize");
        assert_eq!(service_op.name, "GetCountry");
        assert_eq!(service_op.output, serde_json::json!({ "name": "GetCountryResponse" }));
        assert_eq!(service_op.description.as_deref(), Some("Country info"));
        assert_eq!(service_op.port_name.as_deref(), Some("CountryPort"));
    }

    // ------------------------------------------------------------------
    // Phase B (t_86c34d38): legacy → unified migration tests
    // ------------------------------------------------------------------

    /// A realistic legacy `ApinoxProject` value: one WSDL interface with two
    /// operations (one of them colliding by name with a second interface),
    /// one test suite with a request step, and one user folder.
    fn sample_legacy_project() -> serde_json::Value {
        serde_json::json!({
            "name": "LegacySvc",
            "description": "a legacy soap service",
            "id": "legacy-1",
            "interfaces": [
                {
                    "name": "S1",
                    "type": "soap",
                    "bindingName": "S1Soap",
                    "soapVersion": "1.2",
                    "definition": "http://example.com/s1.wsdl",
                    "operations": [
                        {
                            "name": "Ping",
                            "action": "http://example.com/Ping",
                            "input": null,
                            "targetNamespace": "http://example.com",
                            "originalEndpoint": "http://example.com/s1",
                            "fullSchema": null,
                            "output": null,
                            "requests": [
                                {
                                    "name": "ping_1",
                                    "endpoint": "http://example.com/s1",
                                    "method": "POST",
                                    "request": "<a/>",
                                    "id": "req-ping"
                                }
                            ]
                        }
                    ]
                },
                {
                    "name": "S2",
                    "type": "soap",
                    "bindingName": "S2Soap",
                    "soapVersion": "1.1",
                    "definition": "http://example.com/s2.wsdl",
                    "operations": [
                        {
                            "name": "Ping",
                            "action": "http://example.com/Ping2",
                            "input": null,
                            "targetNamespace": "http://example.com",
                            "originalEndpoint": "http://example.com/s2",
                            "fullSchema": null,
                            "output": null,
                            "requests": []
                        }
                    ]
                }
            ],
            "testSuites": [
                {
                    "id": "suite-1",
                    "name": "MySuite",
                    "testCases": [
                        {
                            "id": "tc-1",
                            "name": "Case1",
                            "steps": [
                                {
                                    "id": "step-1",
                                    "name": "step one",
                                    "type": "request",
                                    "config": { "requestId": "req-ping" }
                                }
                            ]
                        }
                    ]
                }
            ],
            "folders": [
                {
                    "id": "folder-1",
                    "name": "Misc",
                    "requests": [
                        { "name": "manual_req", "id": "req-m", "request": "<m/>", "endpoint": "http://example.com" }
                    ]
                }
            ]
        })
    }

    /// Write a legacy project to disk exactly the way the legacy store does.
    fn write_legacy_project(base: &Path, name: &str, project: &serde_json::Value) -> PathBuf {
        let dir = base.join(name);
        fs::create_dir_all(&dir).expect("mkdir legacy project");
        // properties.json in legacy format
        write_json(&dir.join("properties.json"), &serde_json::json!({
            "name": name,
            "description": project["description"],
            "id": project["id"],
            "format": "APInox-v1",
        })).expect("write legacy properties");
        // interfaces/ tree
        let interfaces_dir = dir.join("interfaces");
        for (i, iface) in project["interfaces"].as_array().unwrap().iter().enumerate() {
            let iface_dir = interfaces_dir.join(format!("I{}", i));
            fs::create_dir_all(&iface_dir).unwrap();
            write_json(&iface_dir.join("interface.json"), &serde_json::json!({
                "name": iface["name"],
                "type": iface["type"],
                "bindingName": iface.get("bindingName").cloned(),
                "soapVersion": iface.get("soapVersion").cloned(),
                "definition": iface.get("definition").cloned(),
                "displayName": serde_json::Value::Null,
            })).unwrap();
            for (j, op) in iface["operations"].as_array().unwrap().iter().enumerate() {
                let op_dir = iface_dir.join(format!("O{}", j));
                fs::create_dir_all(&op_dir).unwrap();
                write_json(&op_dir.join("operation.json"), &serde_json::json!({
                    "name": op["name"],
                    "action": op.get("action").cloned(),
                    "input": op.get("input").cloned().unwrap_or(serde_json::Value::Null),
                    "targetNamespace": op.get("targetNamespace").cloned(),
                    "originalEndpoint": op.get("originalEndpoint").cloned(),
                    "fullSchema": op.get("fullSchema").cloned().unwrap_or(serde_json::Value::Null),
                    "displayName": serde_json::Value::Null,
                    "output": op.get("output").cloned().unwrap_or(serde_json::Value::Null),
                    "description": serde_json::Value::Null,
                    "portName": serde_json::Value::Null,
                })).unwrap();
                for (k, req) in op["requests"].as_array().unwrap().iter().enumerate() {
                    let req_name = format!("R{}", k);
                    fs::write(op_dir.join(format!("{}.xml", req_name)), req["request"].as_str().unwrap_or("")).unwrap();
                    write_json(&op_dir.join(format!("{}.json", req_name)), &serde_json::json!({
                        "name": req["name"],
                        "endpoint": req.get("endpoint").cloned(),
                        "method": req.get("method").cloned(),
                        "contentType": serde_json::Value::Null,
                        "headers": serde_json::Value::Null,
                        "assertions": serde_json::Value::Null,
                        "id": req.get("id").cloned(),
                        "requestType": serde_json::Value::Null,
                        "bodyType": serde_json::Value::Null,
                        "restConfig": serde_json::Value::Null,
                        "graphqlConfig": serde_json::Value::Null,
                        "extractors": serde_json::Value::Null,
                        "wsSecurity": serde_json::Value::Null,
                        "attachments": serde_json::Value::Null,
                    })).unwrap();
                }
            }
        }
        // tests/ + folders/ subdirs (same layout the migration must preserve)
        if let Some(suites) = project["testSuites"].as_array() {
            if !suites.is_empty() {
                save_test_suites(&dir, project).expect("save legacy suites");
            }
        }
        if let Some(folders) = project["folders"].as_array() {
            if !folders.is_empty() {
                save_folders(&dir, project).expect("save legacy folders");
            }
        }
        dir
    }

    #[tokio::test]
    async fn migrate_legacy_project_converts_to_unified_and_preserves_data() {
        use crate::utils::config::CONFIG_DIR_TEST_LOCK;
        let _guard = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        let legacy = sample_legacy_project();
        // Point project storage at the temp dir so list_unified_projects() and
        // the migration see the same on-disk projects dir.
        let base = tmp.path().join("projects");
        std::env::set_var("APINOX_CONFIG_DIR", tmp.path());
        let dir = write_legacy_project(&base, "LegacySvc", &legacy);

        // Precondition: it is a legacy-format project (not listed as unified).
        assert!(!is_unified_format_path(&dir));
        let listed = list_unified_projects().expect("list unified");
        assert!(
            listed.iter().all(|p| p["name"] != "LegacySvc"),
            "legacy project must not leak into the unified list pre-migration"
        );

        // Migrate the single dir.
        assert!(migrate_legacy_project_dir(&dir).await.expect("migrate"));

        // Postcondition: now unified, and loads back with flat operations.
        assert!(is_unified_format_path(&dir));
        // NON-DESTRUCTIVE: the legacy interfaces/ tree is preserved so PROXY /
        // WORKFLOWS (which read the nested legacy model) keep working.
        assert!(dir.join("interfaces").exists(), "legacy interfaces tree must be preserved");
        // Flat operation dirs exist at the top level (additive unified layout).
        assert!(dir.join("Ping").join("operation.json").exists(), "op dir created");

        let loaded = load_unified_project(dir.to_string_lossy().into()).expect("load unified");
        assert_eq!(loaded["name"], "LegacySvc");
        assert_eq!(loaded["source"], "wsdl");
        assert_eq!(loaded["sourceUrl"], "http://example.com/s1.wsdl");
        // Two interfaces × their ops → 2 flat operations; colliding name suffixed.
        let ops: Vec<&serde_json::Value> = loaded["operations"].as_array().unwrap().iter().collect();
        assert_eq!(ops.len(), 2, "both operations flattened");
        let names: Vec<String> = ops.iter().map(|o| o["name"].as_str().unwrap().to_string()).collect();
        assert!(names.iter().any(|n| n == "Ping"), "first Ping kept verbatim: {:?}", names);
        assert!(names.iter().any(|n| n == "Ping (S2)"), "colliding Ping suffixed: {:?}", names);
        // The first operation's request body round-tripped.
        let ping_op = ops.iter().find(|o| o["name"] == "Ping").unwrap();
        assert_eq!(ping_op["requests"][0]["name"], "ping_1");
        assert_eq!(ping_op["requests"][0]["request"], "<a/>");

        // Test suites preserved with their step.
        assert_eq!(loaded["testSuites"].as_array().unwrap().len(), 1);
        assert_eq!(loaded["testSuites"][0]["name"], "MySuite");
        assert_eq!(loaded["testSuites"][0]["testCases"][0]["steps"][0]["config"]["requestId"], "req-ping");

        // Folders preserved with their request.
        assert_eq!(loaded["folders"].as_array().unwrap().len(), 1);
        assert_eq!(loaded["folders"][0]["name"], "Misc");
        assert_eq!(loaded["folders"][0]["requests"][0]["name"], "manual_req");

        // It now shows up in the unified list.
        let listed = list_unified_projects().expect("list unified post-migration");
        assert!(listed.iter().any(|p| p["name"] == "LegacySvc"), "migrated project listed as unified");

        std::env::remove_var("APINOX_CONFIG_DIR");
    }

    #[tokio::test]
    async fn migrate_is_idempotent() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let legacy = sample_legacy_project();
        let dir = write_legacy_project(tmp.path(), "IdemSvc", &legacy);

        assert!(migrate_legacy_project_dir(&dir).await.expect("first migration"));
        // Second run is a no-op (already unified).
        assert!(!migrate_legacy_project_dir(&dir).await.expect("second migration"));

        // Data still intact after the no-op.
        let loaded = load_unified_project(dir.to_string_lossy().into()).expect("load");
        assert_eq!(loaded["operations"].as_array().unwrap().len(), 2);
        assert_eq!(loaded["testSuites"].as_array().unwrap().len(), 1);
        assert_eq!(loaded["folders"].as_array().unwrap().len(), 1);
    }

    #[tokio::test]
    async fn save_project_is_noop_for_unified_format_dirs() {
        // Phase B (t_86c34d38): the legacy ProjectContext auto-loads migrated
        // (unified-format) projects and auto-saves them. Once a dir is unified,
        // the unified store is its canonical writer, so a legacy save must be a
        // no-op — otherwise it would (a) demote properties.json from
        // `APInox-unified-v1` back to `APInox-v1` and (b) clobber tests/ +
        // folders/ that the unified store (TESTS view) owns.
        use crate::utils::config::CONFIG_DIR_TEST_LOCK;
        let _guard = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        let base = tmp.path().join("projects");
        std::env::set_var("APINOX_CONFIG_DIR", tmp.path());

        // Create a unified-format project dir at base/SaveGuard with a suite.
        let unified = serde_json::json!({
            "name": "SaveGuard",
            "source": "manual",
            "parsedAt": "2024-01-01T00:00:00+00:00",
            "operations": [],
            "testSuites": [ { "name": "G", "id": "sg", "testCases": [] } ]
        });
        save_unified_project(base.join("SaveGuard").to_string_lossy().into(), unified)
            .expect("save unified");
        assert!(is_unified_format_path(&base.join("SaveGuard")));

        // Simulate the legacy ProjectContext auto-save writing a STALE legacy
        // object (empty interfaces, NO testSuites) for the same project name.
        let stale_legacy = serde_json::json!({
            "name": "SaveGuard",
            "id": "sg",
            "interfaces": []
        });
        save_project(stale_legacy).await.expect("legacy save (expected no-op)");

        // properties.json must still be unified (not demoted to APInox-v1).
        let props_str = std::fs::read_to_string(base.join("SaveGuard").join("properties.json"))
            .expect("properties.json present");
        let props: serde_json::Value = serde_json::from_str(&props_str).expect("parse props");
        assert_eq!(
            props["format"], "APInox-unified-v1",
            "legacy save must not demote a unified dir back to APInox-v1"
        );

        // The unified store's test suite must be intact (not clobbered by the
        // stale legacy object, which had no suites).
        let loaded = load_unified_project(base.join("SaveGuard").to_string_lossy().into())
            .expect("load unified");
        assert_eq!(
            loaded["testSuites"].as_array().unwrap().len(), 1,
            "tests/ must not be clobbered by a legacy save"
        );

        // The legacy nested model (PROXY "Add to APInox Project") must STILL be
        // writable into a unified dir: save_project writes interfaces/ + folders/
        // even for unified dirs (it only skips properties.json + tests/).
        let proxy_write = serde_json::json!({
            "name": "SaveGuard",
            "id": "sg",
            "interfaces": [
                {
                    "name": "ProxyIface",
                    "type": "wsdl",
                    "definition": "http://example.com/p.wsdl",
                    "soapVersion": "1.1",
                    "operations": [
                        {
                            "name": "ProxyOp",
                            "action": "http://example.com/ProxyOp",
                            "input": null,
                            "output": null,
                            "targetNamespace": "http://example.com",
                            "originalEndpoint": "http://example.com/ProxyOp",
                            "requests": [
                                {
                                    "name": "proxy_req",
                                    "endpoint": "http://example.com/ProxyOp",
                                    "request": "<proxy/>",
                                    "id": "proxy-req-1"
                                }
                            ]
                        }
                    ]
                }
            ],
            "folders": [
                { "id": "f1", "name": "ProxyFolder", "requests": [
                    { "id": "f-req-1", "name": "folder_req", "request": "<f/>", "endpoint": "http://x" }
                ] }
            ]
        });
        save_project(proxy_write.clone()).await.expect("proxy save");

        // The nested interface tree must be readable back through the legacy
        // loader (this is exactly what PROXY/WORKFLOWS read).
        let legacy_loaded = load_project(base.join("SaveGuard").to_string_lossy().into())
            .await.expect("load legacy");
        let ifaces = legacy_loaded["interfaces"].as_array().unwrap();
        assert_eq!(ifaces.len(), 1, "legacy interfaces/ must be writable on unified dirs");
        assert_eq!(ifaces[0]["name"], "ProxyIface");
        assert_eq!(ifaces[0]["operations"][0]["name"], "ProxyOp");
        let legacy_folders = legacy_loaded["folders"].as_array().unwrap();
        assert_eq!(legacy_folders.len(), 1, "legacy folders/ must be writable on unified dirs");
        assert_eq!(legacy_folders[0]["name"], "ProxyFolder");

        // And the unified format must STILL be intact after the legacy save
        // (not demoted, unified ops untouched).
        let props_str2 = std::fs::read_to_string(base.join("SaveGuard").join("properties.json"))
            .expect("properties.json still present");
        let props2: serde_json::Value = serde_json::from_str(&props_str2).expect("parse props2");
        assert_eq!(props2["format"], "APInox-unified-v1", "still unified after proxy save");

        std::env::remove_var("APINOX_CONFIG_DIR");
    }

    #[test]
    fn list_unified_projects_excludes_legacy_format_dirs() {
        // A legacy dir colocating in the projects dir must not surface as a
        // (broken, empty-operations) unified project.
        use crate::utils::config::CONFIG_DIR_TEST_LOCK;
        let _guard = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        let base = tmp.path().join("projects");
        std::env::set_var("APINOX_CONFIG_DIR", tmp.path());
        let legacy = sample_legacy_project();
        let _dir = write_legacy_project(&base, "OnlyLegacy", &legacy);

        let listed = list_unified_projects().expect("list unified");
        assert!(
            listed.iter().all(|p| p["name"] != "OnlyLegacy"),
            "legacy dir must be excluded from the unified list"
        );
        std::env::remove_var("APINOX_CONFIG_DIR");
    }

    // ------------------------------------------------------------------
    // t_b2eae8b0: import write paths → unified store
    // ------------------------------------------------------------------

    /// A nested legacy `ApinoxProject` as the import flows produce it
    /// (SoapUI / Bulk Import shape): one WSDL interface, operations with
    /// request copies.
    fn sample_imported_project(name: &str) -> serde_json::Value {
        serde_json::json!({
            "id": "import-1",
            "name": name,
            "interfaces": [
                {
                    "name": "SvcPort",
                    "type": "wsdl",
                    "bindingName": "SvcPortSoap",
                    "soapVersion": "1.1",
                    "definition": "http://example.com/svc.wsdl",
                    "operations": [
                        {
                            "name": "DoWork",
                            "action": "http://example.com/DoWork",
                            "input": null,
                            "targetNamespace": "http://example.com",
                            "originalEndpoint": "http://example.com/svc",
                            "fullSchema": null,
                            "output": null,
                            "requests": [
                                {
                                    "name": "DoWork sample",
                                    "endpoint": "http://example.com/svc",
                                    "method": "POST",
                                    "request": "<doWork/>",
                                    "id": "imp-req-1"
                                }
                            ]
                        }
                    ]
                }
            ],
            "testSuites": [],
            "folders": []
        })
    }

    /// Direct unit test of the extracted canonical transform (shared by the
    /// migration and the import write path): flatten + collision suffixing +
    /// primary sourceUrl.
    #[test]
    fn nested_project_to_unified_flattens_and_dedupes_ops() {
        let unified = nested_project_to_unified(&sample_legacy_project()).expect("transform");
        assert_eq!(unified["name"], "LegacySvc");
        assert_eq!(unified["source"], "wsdl");
        // sourceUrl = the FIRST (sorted) interface's definition.
        assert_eq!(unified["sourceUrl"], "http://example.com/s1.wsdl");
        // Two interfaces each contribute their op; the colliding "Ping" from
        // the second interface is suffixed with its interface name.
        let ops = unified["operations"].as_array().unwrap();
        assert_eq!(ops.len(), 2);
        let names: Vec<String> = ops.iter().map(|o| o["name"].as_str().unwrap().to_string()).collect();
        assert!(names.iter().any(|n| n == "Ping"), "first Ping verbatim: {:?}", names);
        assert!(names.iter().any(|n| n == "Ping (S2)"), "colliding Ping suffixed: {:?}", names);
        // Request bodies survive the transform.
        let ping = ops.iter().find(|o| o["name"] == "Ping").unwrap();
        assert_eq!(ping["requests"][0]["request"], "<a/>");
    }

    /// New import → a fresh unified-format dir with flat operations, listed by
    /// `list_unified_projects` (the canonical store).
    #[tokio::test]
    async fn import_new_project_lands_in_unified_store() {
        use crate::utils::config::CONFIG_DIR_TEST_LOCK;
        let _guard = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        let base = tmp.path().join("projects");
        std::env::set_var("APINOX_CONFIG_DIR", tmp.path());

        let imported = save_imported_project_as_unified(sample_imported_project("ImportedSvc"))
            .await
            .expect("import new");

        // Canonical unified store: listed, unified format, flat ops.
        let listed = list_unified_projects().expect("list unified");
        assert!(listed.iter().any(|p| p["name"] == "ImportedSvc"), "imported project must be unified-listed");
        let dir = base.join("ImportedSvc");
        assert!(is_unified_format_path(&dir), "imported dir must be APInox-unified-v1");
        let props: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(dir.join("properties.json")).expect("props"),
        )
        .expect("parse props");
        assert_eq!(props["format"], "APInox-unified-v1");

        // Flat layout: the operation dir sits at the top level (the canonical
        // unified writer). The nested interfaces/ tree is ALSO written
        // additively so PROXY/WORKFLOWS (nested-model readers) keep working.
        assert!(dir.join("DoWork").join("operation.json").exists(), "flat op dir created");
        assert!(dir.join("interfaces").exists(), "additive nested interfaces/ written for PROXY/WORKFLOWS");
        // The nested model is readable back through the legacy loader (what
        // PROXY "Add to APInox Project" / WORKFLOWS request-picker read).
        let legacy_loaded = load_project(dir.to_string_lossy().into()).await.expect("load legacy");
        assert_eq!(legacy_loaded["interfaces"].as_array().unwrap().len(), 1, "nested iface readable");
        assert_eq!(legacy_loaded["interfaces"][0]["operations"][0]["name"], "DoWork");

        // The returned value round-trips through the unified loader.
        assert_eq!(imported["name"], "ImportedSvc");
        assert_eq!(imported["source"], "wsdl");
        assert_eq!(imported["operations"].as_array().unwrap().len(), 1);
        assert_eq!(imported["operations"][0]["name"], "DoWork");
        assert_eq!(imported["operations"][0]["requests"][0]["request"], "<doWork/>");

        std::env::remove_var("APINOX_CONFIG_DIR");
    }

    /// Re-importing the same source is idempotent: no duplicate operations,
    /// and the existing project's test suites are preserved.
    #[tokio::test]
    async fn import_is_idempotent_and_preserves_existing_data() {
        use crate::utils::config::CONFIG_DIR_TEST_LOCK;
        let _guard = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        let base = tmp.path().join("projects");
        std::env::set_var("APINOX_CONFIG_DIR", tmp.path());

        // First import creates the project (one op).
        save_imported_project_as_unified(sample_imported_project("ReimportSvc"))
            .await
            .expect("first import");

        // The user adds a test suite to the imported project (via the
        // unified store, the canonical writer for migrated projects).
        let dir = base.join("ReimportSvc");
        let with_suite = {
            let loaded = load_unified_project(dir.to_string_lossy().into()).expect("load");
            let mut p = loaded;
            p["testSuites"] = serde_json::json!([
                { "id": "s-1", "name": "UserSuite", "testCases": [] }
            ]);
            p
        };
        save_unified_project(dir.to_string_lossy().into(), with_suite).expect("save suite");

        // Re-import the SAME source: must merge (not duplicate ops) and
        // keep the suite.
        let reimported = save_imported_project_as_unified(sample_imported_project("ReimportSvc"))
            .await
            .expect("re-import");
        assert_eq!(reimported["operations"].as_array().unwrap().len(), 1, "re-import must not duplicate ops");
        assert_eq!(reimported["operations"][0]["name"], "DoWork");
        let suites = reimported["testSuites"].as_array().unwrap();
        assert_eq!(suites.len(), 1, "re-import must preserve the user's suite");
        assert_eq!(suites[0]["name"], "UserSuite");

        std::env::remove_var("APINOX_CONFIG_DIR");
    }

    /// Importing a source that introduces a NEW operation into an existing
    /// unified project appends it, leaves the existing op (and its request)
    /// untouched, and preserves suites/folders.
    #[tokio::test]
    async fn import_merges_new_operations_into_existing_project() {
        use crate::utils::config::CONFIG_DIR_TEST_LOCK;
        let _guard = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        std::env::set_var("APINOX_CONFIG_DIR", tmp.path());

        save_imported_project_as_unified(sample_imported_project("MergeSvc"))
            .await
            .expect("seed");

        // An import of a second interface (a different op, same project
        // name) must merge in alongside the existing op.
        let second = serde_json::json!({
            "id": "import-2",
            "name": "MergeSvc",
            "interfaces": [
                {
                    "name": "SvcPort",
                    "type": "wsdl",
                    "bindingName": "SvcPortSoap",
                    "soapVersion": "1.1",
                    "definition": "http://example.com/svc.wsdl",
                    "operations": [
                        {
                            "name": "OtherOp",
                            "action": "http://example.com/OtherOp",
                            "input": null,
                            "targetNamespace": "http://example.com",
                            "originalEndpoint": "http://example.com/svc",
                            "fullSchema": null,
                            "output": null,
                            "requests": [ { "name": "other sample", "endpoint": "http://example.com/svc", "request": "<other/>" } ]
                        }
                    ]
                }
            ],
            "testSuites": [],
            "folders": []
        });
        let merged = save_imported_project_as_unified(second).await.expect("merge import");
        let names: Vec<String> = merged["operations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o["name"].as_str().unwrap().to_string())
            .collect();
        assert!(names.iter().any(|n| n == "DoWork"), "existing op kept: {:?}", names);
        assert!(names.iter().any(|n| n == "OtherOp"), "new op merged: {:?}", names);
        assert_eq!(merged["operations"].as_array().unwrap().len(), 2);

        std::env::remove_var("APINOX_CONFIG_DIR");
    }

    /// A same-named NON-unified (legacy) dir is never clobbered: the import is
    /// written under a suffixed name and the legacy dir stays intact.
    #[tokio::test]
    async fn import_renames_when_legacy_dir_name_collides() {
        use crate::utils::config::CONFIG_DIR_TEST_LOCK;
        let _guard = CONFIG_DIR_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        let base = tmp.path().join("projects");
        std::env::set_var("APINOX_CONFIG_DIR", tmp.path());

        // Pre-existing legacy-format dir with the same name.
        let legacy = sample_legacy_project();
        let legacy_dir = write_legacy_project(&base, "LegacySvc", &legacy);
        let legacy_props_before = std::fs::read_to_string(legacy_dir.join("properties.json")).expect("read legacy props");

        // Import a project named "LegacySvc" — must not clobber the legacy dir.
        let imported = save_imported_project_as_unified(sample_imported_project("LegacySvc"))
            .await
            .expect("import with collision");

        // The legacy dir is byte-identical (untouched) and still legacy format.
        let legacy_props_after = std::fs::read_to_string(legacy_dir.join("properties.json")).expect("re-read legacy props");
        assert_eq!(legacy_props_before, legacy_props_after, "legacy dir must be untouched");
        assert!(!is_unified_format_path(&legacy_dir), "legacy dir must stay legacy");

        // The import landed under a suffixed name, in unified format.
        assert_ne!(imported["name"].as_str().unwrap(), "LegacySvc");
        let imported_dir = base.join(
            imported["name"].as_str().unwrap().replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_"),
        );
        assert!(is_unified_format_path(&imported_dir), "imported (suffixed) dir must be unified");
        assert_eq!(imported["operations"].as_array().unwrap().len(), 1);

        std::env::remove_var("APINOX_CONFIG_DIR");
    }
}
