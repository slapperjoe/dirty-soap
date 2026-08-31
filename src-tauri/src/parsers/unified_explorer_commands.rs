//! Unified Explorer Commands
//!
//! Handles WSDL/OpenAPI parsing, project creation, and refresh/sync logic.
//! The WSDL service is the top-level entity — no wrapper project layer.

use crate::parsers::wsdl_commands::{parse_wsdl, ParseWsdlRequest};
use crate::parsers::wsdl::{ApiService, ServiceOperation};
use crate::project_storage;
use crate::soap::envelope_builder::{EnvelopeBuilder, SoapVersion};
use serde_json::json;
use std::fs;
use uuid::Uuid;

/// Parse a WSDL URL and create/save a unified project.
/// If a project with the same sourceUrl already exists, triggers a refresh/sync.
#[tauri::command]
pub async fn parse_wsdl_as_project(url: String) -> Result<serde_json::Value, String> {
    // List existing projects and check for duplicate sourceUrl
    let projects = project_storage::list_unified_projects()
        .map_err(|e| format!("Failed to list projects: {}", e))?;

    for p in &projects {
        if let Some(existing_url) = p.get("sourceUrl").and_then(|v| v.as_str()) {
            if existing_url == url.as_str() {
                // Duplicate WSDL URL — trigger refresh instead
                let project_name = p["name"].as_str().unwrap_or("<unknown>").to_string();
                return refresh_unified_project(project_name).await;
            }
        }
    }

    // Parse WSDL
    let result = parse_wsdl(ParseWsdlRequest {
        url: url.clone(),
        resolve_imports: Some(true),
    }).await.map_err(|e| e.to_string())?;

    if result.services.is_empty() {
        return Err("No services found in WSDL".to_string());
    }

    let service = &result.services[0];
    let now = chrono::Utc::now().to_rfc3339();

    // Derive SOAP version and binding name from service name
    let soap_version = if service.name.ends_with("Soap12") { "1.2" } else { "1.1" };
    let binding_name = service.name
        .strip_suffix("Soap12")
        .or_else(|| service.name.strip_suffix("Soap"))
        .unwrap_or(&service.name)
        .to_string();

    // Build operations array from parsed service (sample content-type follows soap_version)
    let operations = build_operations_json(service, soap_version);

    let project = json!({
        "name": service.name,
        "description": serde_json::Value::Null,
        "source": "wsdl",
        "sourceUrl": url,
        "parsedAt": now,
        "lastRefreshedAt": serde_json::Value::Null,
        "id": Uuid::new_v4().to_string(),
        "soapVersion": soap_version,
        "bindingName": binding_name,
        "operations": operations,
    });

    // Auto-save to disk
    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&service.name));
    project_storage::save_unified_project(
        project_dir.to_string_lossy().to_string(),
        project.clone(),
    ).map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Refresh a unified project's WSDL source by service name
#[tauri::command]
pub async fn refresh_unified_project(service_name: String) -> Result<serde_json::Value, String> {
    // Load existing project
    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&service_name));

    let existing = project_storage::load_unified_project(
        project_dir.to_string_lossy().to_string(),
    ).map_err(|e| format!("Failed to load project: {}", e))?;

    // Ensure it has a source URL
    let source_url = existing.get("sourceUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Project '{}' has no source URL to refresh", service_name))?;

    // Re-parse the WSDL
    let result = parse_wsdl(ParseWsdlRequest {
        url: source_url.to_string(),
        resolve_imports: Some(true),
    }).await.map_err(|e| e.to_string())?;

    if result.services.is_empty() {
        return Err("No services found after re-parse".to_string());
    }

    let new_service = &result.services[0];
    let now = chrono::Utc::now().to_rfc3339();

    // Preserve the interface-level Content-Type override across refresh
    let content_type_override = existing.get("contentType")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string());
    let soap_version = existing["soapVersion"].as_str().unwrap_or("1.1");
    // Sample content-type follows the project's SOAP version
    let sample_content_type = soap_version_from_str(soap_version).content_type();

    // Get existing operations
    let existing_operations: Vec<&serde_json::Value> = existing.get("operations")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().collect())
        .unwrap_or_default();

    let mut merged_operations: Vec<serde_json::Value> = Vec::new();

    // Process new operations from WSDL
    for new_op in &new_service.operations {
        let existing_op = existing_operations.iter().find(|eo| {
            eo.get("name").and_then(|v| v.as_str()) == Some(&new_op.name)
        });

        let sample_xml = generate_sample_xml(new_op);
        let requests = if let Some(eo) = existing_op {
            // Preserve user-created requests from existing operation
            eo.get("requests").cloned().unwrap_or_else(|| json!([]))
        } else {
            // New operation — create sample request with XML body
            json!([
                json!({
                    "name": format!("sample_{}", new_op.name),
                    "endpoint": new_op.original_endpoint,
                    "method": "POST",
                    "contentType": sample_content_type,
                    "request": sample_xml,
                })
            ])
        };

        merged_operations.push(json!({
            "name": new_op.name,
            "action": new_op.action,
            "input": new_op.input.as_ref().map(|v| json!(v)).unwrap_or(json!(null)),
            "targetNamespace": new_op.target_namespace,
            "originalEndpoint": new_op.original_endpoint,
            "requests": requests,
        }));
    }

    // Handle operations that were removed from WSDL — keep user requests as legacy
    for eo in &existing_operations {
        let eo_name = eo.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let still_exists = new_service.operations.iter().any(|nop| nop.name == eo_name);
        if !still_exists {
            let legacy_name = format!("[Legacy] {}", eo_name);
            let requests = eo.get("requests").cloned().unwrap_or(json!([]));
            merged_operations.push(json!({
                "name": legacy_name,
                "action": eo.get("action"),
                "input": eo.get("input"),
                "targetNamespace": eo.get("targetNamespace"),
                "originalEndpoint": eo.get("originalEndpoint"),
                "requests": requests,
            }));
        }
    }

    // Build updated project
    let mut updated = json!({
        "name": existing["name"],
        "description": existing["description"],
        "source": existing["source"],
        "sourceUrl": existing["sourceUrl"],
        "parsedAt": existing["parsedAt"],
        "lastRefreshedAt": now,
        "id": existing["id"],
        "soapVersion": existing["soapVersion"].as_str().unwrap_or("1.1"),
        "bindingName": existing["bindingName"].as_str().unwrap_or(""),
        "operations": merged_operations,
    });
    // Re-attach the interface-level Content-Type override if it was set
    if let Some(ct) = content_type_override {
        updated["contentType"] = json!(ct);
    }

    // Save updated project
    project_storage::save_unified_project(
        project_dir.to_string_lossy().to_string(),
        updated.clone(),
    ).map_err(|e| format!("Failed to save updated project: {}", e))?;

    Ok(updated)
}

/// Refresh a project's WSDL by sourceUrl (called from frontend)
#[tauri::command]
pub async fn refresh_project_wsdl(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let source_url = params.get("sourceUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing sourceUrl".to_string())?;

    // Find the project with this sourceUrl
    let projects = project_storage::list_unified_projects()
        .map_err(|e| format!("Failed to list projects: {}", e))?;

    let existing_project = projects.iter().find(|p| {
        p.get("sourceUrl").and_then(|v| v.as_str()) == Some(source_url)
    }).ok_or_else(|| format!("No project found with sourceUrl: {}", source_url))?;

    let service_name = existing_project.get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Project missing name".to_string())?;

    // Delegate to refresh_unified_project
    refresh_unified_project(service_name.to_string()).await
}

/// Resolve the SOAP version from a version string ("1.1" or "1.2").
/// Unknown/missing values default to SOAP 1.1 (mirrors `soapDefault` in shared/soapUtils.ts).
fn soap_version_from_str(version: &str) -> SoapVersion {
    if version.trim() == "1.2" {
        SoapVersion::Soap12
    } else {
        SoapVersion::Soap11
    }
}

/// Convert an ApiService to a JSON array of operations
/// for the given SOAP version (sample request content-type follows it).
fn build_operations_json(service: &ApiService, soap_version: &str) -> Vec<serde_json::Value> {
    service.operations.iter().map(|op| build_operation_json(op, soap_version)).collect()
}

/// Convert a ServiceOperation to JSON
fn build_operation_json(op: &ServiceOperation, soap_version: &str) -> serde_json::Value {
    // Generate sample XML body using EnvelopeBuilder
    let sample_xml = generate_sample_xml(op);
    // Sample requests inherit the SOAP-version default; the interface-level
    // override (project contentType) is resolved at display/execution time
    // (see SOAP_INTERFACE_CONTENT_TYPE_SPEC.md §4).
    let content_type = soap_version_from_str(soap_version).content_type();

    json!({
        "name": op.name,
        "action": op.action,
        "input": op.input.as_ref().map(|v| json!(v)).unwrap_or(json!(null)),
        "targetNamespace": op.target_namespace,
        "originalEndpoint": op.original_endpoint,
        "fullSchema": op.full_schema.as_ref().map(|s| serde_json::to_value(s).unwrap_or(json!(null))).unwrap_or(json!(null)),
        "requests": json!([
            json!({
                "name": format!("sample_{}", op.name),
                "endpoint": op.original_endpoint,
                "method": "POST",
                "contentType": content_type,
                "request": sample_xml,
            })
        ]),
    })
}

/// Generate a sample SOAP envelope XML from a ServiceOperation
fn generate_sample_xml(op: &ServiceOperation) -> String {
    // Need both full_schema and target_namespace to build envelope
    let schema = match &op.full_schema {
        Some(s) => s,
        None => return String::new(),
    };
    let target_ns = match &op.target_namespace {
        Some(ns) => ns,
        None => return String::new(),
    };

    let operation = ServiceOperation {
        name: op.name.clone(),
        action: op.action.clone(),
        input: op.input.clone(),
        output: op.output.clone(),
        target_namespace: Some(target_ns.clone()),
        original_endpoint: op.original_endpoint.clone(),
        full_schema: Some(schema.clone()),
        description: op.description.clone(),
        port_name: op.port_name.clone(),
    };

    let builder = EnvelopeBuilder::new(SoapVersion::Soap11, operation);
    builder.build().unwrap_or_default()
}

/// Delete a unified project entirely (removes the project directory from disk)
#[tauri::command]
pub fn delete_unified_project(name: String) -> Result<(), String> {
    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&name));

    if !project_dir.exists() {
        return Err(format!("Project directory '{}' does not exist", name));
    }

    fs::remove_dir_all(&project_dir)
        .map_err(|e| format!("Failed to delete project '{}': {}", name, e))?;

    Ok(())
}

/// Delete an operation from a unified project
#[tauri::command]
pub fn delete_unified_operation(project_name: String, operation_name: String) -> Result<(), String> {
    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&project_name));

    let mut project = project_storage::load_unified_project(
        project_dir.to_string_lossy().to_string(),
    ).map_err(|e| format!("Failed to load project: {}", e))?;

    let operations = project["operations"]
        .as_array()
        .ok_or("Missing or invalid operations array")?;

    // Filter out the operation
    let filtered: Vec<serde_json::Value> = operations.iter()
        .filter(|op| {
            let op_name = op.get("name").and_then(|v| v.as_str());
            op_name != Some(&operation_name)
        })
        .cloned()
        .collect();

    project["operations"] = json!(filtered);

    project_storage::save_unified_project(
        project_dir.to_string_lossy().to_string(),
        project,
    ).map_err(|e| format!("Failed to save project after deleting operation: {}", e))?;

    Ok(())
}

/// Delete a request from a unified project operation
#[tauri::command]
pub fn delete_unified_request(project_name: String, operation_name: String, request_name: String) -> Result<(), String> {
    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&project_name));

    let mut project = project_storage::load_unified_project(
        project_dir.to_string_lossy().to_string(),
    ).map_err(|e| format!("Failed to load project: {}", e))?;

    let operations = project["operations"]
        .as_array_mut()
        .ok_or("Missing or invalid operations array")?;

    for op in operations.iter_mut() {
        if op.get("name").and_then(|v| v.as_str()) == Some(&operation_name) {
            let requests = op.get("requests").and_then(|v| v.as_array()).cloned().unwrap_or_else(Vec::new);
            let filtered: Vec<serde_json::Value> = requests.iter()
                .filter(|req| {
                    let req_name = req.get("name").and_then(|v| v.as_str());
                    req_name != Some(&request_name)
                })
                .cloned()
                .collect();
            op["requests"] = json!(filtered);
        }
    }

    project_storage::save_unified_project(
        project_dir.to_string_lossy().to_string(),
        project,
    ).map_err(|e| format!("Failed to save project after deleting request: {}", e))?;

    Ok(())
}

/// Create a new request in a unified project operation
#[tauri::command]
pub fn new_unified_request(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let project_name = params.get("projectName")
        .and_then(|v| v.as_str())
        .ok_or("Missing projectName")?.to_string();
    let operation_name = params.get("operationName")
        .and_then(|v| v.as_str())
        .ok_or("Missing operationName")?.to_string();

    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&project_name));

    let mut project = project_storage::load_unified_project(
        project_dir.to_string_lossy().to_string(),
    ).map_err(|e| format!("Failed to load project: {}", e))?;

    // Interface-level override + SOAP version (per SOAP_INTERFACE_CONTENT_TYPE_SPEC §5.2)
    let project_content_type = project.get("contentType")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string());
    let project_soap_version = project.get("soapVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("1.1");

    let operations = project["operations"]
        .as_array_mut()
        .ok_or("Missing or invalid operations array")?;

    for op in operations.iter_mut() {
        if op.get("name").and_then(|v| v.as_str()) == Some(&operation_name) {
            let endpoint = op.get("originalEndpoint").and_then(|v| v.as_str()).map(|s| s.to_string());
            // Per spec §5.2: project contentType override ?? op.input.contentType ??
            // soapDefault(project.soap_version). No bare "application/soap+xml" fallback.
            let input_content_type = op.get("input")
                .and_then(|v| v.get("contentType"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string());
            let content_type = project_content_type.clone()
                .or(input_content_type)
                .unwrap_or_else(|| soap_version_from_str(project_soap_version).content_type().to_string());

            // Auto-generate request name: Request1.xml, Request2.xml, ...
            let existing_requests = op.get("requests").and_then(|v| v.as_array()).cloned().unwrap_or_else(Vec::new);
            let next_num = existing_requests.len() + 1;
            let request_name = format!("Request{}.xml", next_num);

            // Build ServiceOperation from project data to generate sample XML
            let operation = ServiceOperation {
                name: op.get("name").and_then(|v| v.as_str()).unwrap().to_string(),
                action: op.get("action").and_then(|v| v.as_str()).map(|s| s.to_string()),
                input: op.get("input").cloned(),
                output: op.get("output").cloned().unwrap_or_else(|| json!({})),
                target_namespace: op.get("targetNamespace").and_then(|v| v.as_str()).map(|s| s.to_string()),
                original_endpoint: op.get("originalEndpoint").and_then(|v| v.as_str()).map(|s| s.to_string()),
                full_schema: op.get("fullSchema").and_then(|v| {
                    serde_json::from_value(v.clone()).ok()
                }),
                description: op.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                port_name: op.get("portName").and_then(|v| v.as_str()).map(|s| s.to_string()),
            };
            let sample_xml = generate_sample_xml(&operation);

            let new_request = json!({
                "name": request_name,
                "request": sample_xml,
                "endpoint": endpoint,
                "method": "POST",
                "contentType": content_type,
            });

            let mut updated_requests = existing_requests;
            updated_requests.push(new_request);
            op["requests"] = json!(updated_requests);
        }
    }

    // Find the new request before saving
    let new_request = project["operations"].as_array()
        .unwrap().iter().find(|op| op.get("name").and_then(|v| v.as_str()) == Some(&operation_name))
        .unwrap().get("requests").unwrap().as_array().unwrap()
        .iter().rev().find(|r| r.get("method").and_then(|v| v.as_str()) == Some("POST"))
        .unwrap().clone();

    project_storage::save_unified_project(
        project_dir.to_string_lossy().to_string(),
        project,
    ).map_err(|e| format!("Failed to save project after adding request: {}", e))?;

    Ok(new_request)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_name_clean() {
        assert_eq!(sanitize_name("AccountService"), "AccountService");
        assert_eq!(sanitize_name("My Service"), "My Service");
    }

    #[test]
    fn test_sanitize_name_special_chars() {
        assert_eq!(sanitize_name("a/b"), "a_b");
        assert_eq!(sanitize_name("a\\b"), "a_b");
        assert_eq!(sanitize_name("a:b"), "a_b");
        assert_eq!(sanitize_name("a*b"), "a_b");
    }

    #[test]
    fn test_build_operation_json_structure() {
        let op = ServiceOperation {
            name: "GetBalance".to_string(),
            input: None,
            output: serde_json::Value::Null,
            description: None,
            target_namespace: Some("http://example.com".to_string()),
            port_name: None,
            original_endpoint: Some("http://example.com/service".to_string()),
            full_schema: None,
            action: Some("http://example.com/GetBalance".to_string()),
        };

        let json = build_operation_json(&op, "1.1");

        assert_eq!(json["name"], "GetBalance");
        assert_eq!(json["action"], "http://example.com/GetBalance");
        assert!(json["input"].is_null());
        assert_eq!(json["targetNamespace"], "http://example.com");
        assert_eq!(json["originalEndpoint"], "http://example.com/service");
        assert!(json["requests"].is_array());
        assert_eq!(json["requests"].as_array().unwrap().len(), 1);
        assert_eq!(json["requests"][0]["name"], "sample_GetBalance");
        assert_eq!(json["requests"][0]["method"], "POST");
        // Sample content-type follows the project's SOAP version (spec §5.1)
        assert_eq!(json["requests"][0]["contentType"], "text/xml; charset=utf-8");
    }

    #[test]
    fn test_build_operation_json_soap12_content_type() {
        let op = ServiceOperation {
            name: "GetBalance12".to_string(),
            input: None,
            output: serde_json::Value::Null,
            description: None,
            target_namespace: Some("http://example.com".to_string()),
            port_name: None,
            original_endpoint: Some("http://example.com/service".to_string()),
            full_schema: None,
            action: None,
        };

        let json = build_operation_json(&op, "1.2");

        assert_eq!(json["requests"][0]["contentType"], "application/soap+xml; charset=utf-8");
    }

    #[test]
    fn test_build_operations_json() {
        let op1 = ServiceOperation {
            name: "Op1".to_string(),
            input: None,
            output: serde_json::Value::Null,
            description: None,
            target_namespace: Some("http://ns".to_string()),
            port_name: None,
            original_endpoint: Some("http://example.com/service".to_string()),
            full_schema: None,
            action: Some("http://example.com/Op1".to_string()),
        };
        let op2 = ServiceOperation {
            name: "Op2".to_string(),
            input: None,
            output: serde_json::Value::Null,
            description: None,
            target_namespace: Some("http://ns".to_string()),
            port_name: None,
            original_endpoint: Some("http://example.com/service".to_string()),
            full_schema: None,
            action: Some("http://example.com/Op2".to_string()),
        };
        let service = ApiService {
            name: "TestService".to_string(),
            ports: Vec::new(),
            operations: vec![op1, op2],
            target_namespace: Some("http://ns".to_string()),
        };

        let ops_json = build_operations_json(&service, "1.1");
        assert_eq!(ops_json.len(), 2);
        assert_eq!(ops_json[0]["name"], "Op1");
        assert_eq!(ops_json[1]["name"], "Op2");
    }

    #[tokio::test]
    async fn test_parse_wsdl_as_project_structure() {
        // Test the JSON structure returned by parse_wsdl_as_project
        // Note: this is a structural test — not a live WSDL parse
        let project = json!({
            "name": "TestService",
            "source": "wsdl",
            "sourceUrl": "http://example.com/test.wsdl",
            "parsedAt": "2024-01-01T00:00:00+00:00",
            "id": "test-id",
            "operations": json!([
                json!({
                    "name": "TestOp",
                    "requests": json!([
                        json!({
                            "name": "sample_TestOp",
                            "endpoint": "http://example.com/test",
                            "method": "POST",
                            "contentType": "text/xml",
                        })
                    ]),
                })
            ]),
        });

        assert_eq!(project["name"], "TestService");
        assert_eq!(project["source"], "wsdl");
        assert_eq!(project["sourceUrl"], "http://example.com/test.wsdl");
        assert_eq!(project["operations"][0]["name"], "TestOp");
        assert_eq!(project["operations"][0]["requests"][0]["name"], "sample_TestOp");
    }

    /// Serialize tests that swap APINOX_CONFIG_DIR (process-global env).
    static NEW_REQUEST_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn run_new_unified_request_scenario(content_type_override: Option<&str>) -> serde_json::Value {
        let _guard = NEW_REQUEST_TEST_LOCK.lock().unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("apinox-new-req-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).expect("create temp config dir");
        // Redirect project storage into the temp dir (resolve_config_dir honors this env var)
        std::env::set_var("APINOX_CONFIG_DIR", &tmp);
        let result = (|| {
            let project = json!({
                "name": "E2eCtService",
                "source": "wsdl",
                "sourceUrl": "http://example.com/e2e.wsdl",
                "soapVersion": "1.2",
                "operations": json!([
                    {
                        "name": "E2eOp",
                        "action": "http://example.com/E2eOp",
                        "input": null,
                        "targetNamespace": "http://example.com/ns",
                        "originalEndpoint": "http://example.com/e2e",
                        "requests": json!([
                            {
                                "name": "sample_E2eOp",
                                "endpoint": "http://example.com/e2e",
                                "method": "POST",
                                "contentType": "application/soap+xml; charset=utf-8",
                                "request": "<x/>"
                            }
                        ])
                    }
                ]),
            });
            if let Some(ct) = content_type_override {
                project["contentType"] = json!(ct);
            }
            let project_dir = project_storage::projects_dir()
                .expect("projects dir")
                .join("E2eCtService");
            project_storage::save_unified_project(
                project_dir.to_string_lossy().to_string(),
                project,
            ).expect("seed project save");

            let params = json!({
                "projectName": "E2eCtService",
                "operationName": "E2eOp",
            });
            new_unified_request(params).expect("new_unified_request should succeed")
        })();

        // Restore env + cleanup
        std::env::remove_var("APINOX_CONFIG_DIR");
        let _ = std::fs::remove_dir_all(&tmp);
        result
    }

    #[test]
    fn test_new_unified_request_inherits_project_content_type_override() {
        // Project override wins over input and SOAP-version default (spec §5.2)
        let created = run_new_unified_request_scenario(Some("application/xml"));
        assert_eq!(created["name"], "Request1.xml");
        assert_eq!(created["method"], "POST");
        assert_eq!(created["contentType"], "application/xml");
    }

    #[test]
    fn test_new_unified_request_falls_back_to_soap_version_default() {
        // No override, no input contentType → soapDefault(1.2)
        let created = run_new_unified_request_scenario(None);
        assert_eq!(created["name"], "Request1.xml");
        assert_eq!(created["contentType"], "application/soap+xml; charset=utf-8");
    }
}
