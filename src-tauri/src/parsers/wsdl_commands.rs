/// Tauri Commands for WSDL Parsing
/// 
/// Frontend-facing commands for WSDL operations
use anyhow::Result;
use serde::{Deserialize, Serialize};
use crate::parsers::wsdl::{WsdlParser, ApiService, LoadContext};
use crate::project_storage;

#[derive(Debug, Serialize, Deserialize)]
pub struct ParseWsdlRequest {
    pub url: String,
    pub resolve_imports: Option<bool>,
    /// R-12 (F-23): optional proxy URL (`http://host:port`) for fetching the
    /// top-level WSDL document. `None` (the default, and what the legacy
    /// `LoadWsdl` bridge path sends) keeps direct connections. The unified
    /// explorer's "Use proxy" toggle supplies the app's proxy so environments
    /// that only reach WSDLs via a proxy can still load them.
    #[serde(default)]
    pub proxy_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ParseWsdlResponse {
    pub services: Vec<ApiService>,
    pub target_namespace: Option<String>,
    pub imports_count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RefreshWsdlRequest {
    pub url: String,
    pub existing_interface: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct RefreshWsdlResponse {
    pub services: Vec<ApiService>,
    pub changes: WsdlChanges,
}

#[derive(Debug, Serialize)]
pub struct WsdlChanges {
    pub added_operations: Vec<String>,
    pub removed_operations: Vec<String>,
    pub modified_operations: Vec<String>,
    pub has_changes: bool,
}

/// Parse a WSDL file from a URL
#[tauri::command]
pub async fn parse_wsdl(request: ParseWsdlRequest) -> Result<ParseWsdlResponse, String> {
    // R-12: the legacy `LoadWsdl` bridge path passes no `useProxy`, so it loads
    // direct. R-11 cancel applies to the unified path (`parse_wsdl_as_project`),
    // which builds its own `LoadContext`; here we use a fresh (uncancelled) one.
    let ctx = LoadContext::new(request.proxy_url.clone());
    parse_wsdl_ctx(request, &ctx).await
}

/// Core WSDL parse, driven by a [`LoadContext`] (R-11 cancel + R-12 proxy).
///
/// The top-level document and every import fetch share the context's proxy and
/// cancel flag, so a single cancel aborts the whole load at the next
/// cooperative check (see `ImportResolver::fetch_document`).
pub async fn parse_wsdl_ctx(
    request: ParseWsdlRequest,
    ctx: &LoadContext,
) -> Result<ParseWsdlResponse, String> {
    log::info!("Parsing WSDL: {}", request.url);

    let resolve_imports = request.resolve_imports.unwrap_or(true);

    // First, fetch the WSDL XML from the URL. R-12: route through the app's
    // proxy when the caller opted in (`proxy_url` set); `None` = direct.
    // R-11: the resolver shares the context's cancel flag.
    log::info!("Creating import resolver...");
    let mut resolver = ctx.resolver()
        .map_err(|e| format!("Failed to create import resolver: {}", e))?;

    log::info!("Fetching WSDL from URL...");
    let wsdl_xml = resolver.fetch_document(&request.url, None)
        .await
        .map_err(|e| format!("Failed to fetch WSDL from URL: {}", e))?;

    log::info!("Fetched WSDL ({} bytes)", wsdl_xml.len());

    // Parse WSDL
    log::info!("Starting parse (resolve_imports={})", resolve_imports);
    let services = if resolve_imports {
        WsdlParser::parse_with_imports_ctx(&request.url, &wsdl_xml, 20, ctx)
            .await
            .map_err(|e| {
                log::error!("Parse error: {}", e);
                format!("Failed to parse WSDL with imports: {}", e)
            })?
    } else {
        WsdlParser::parse(&wsdl_xml)
            .map_err(|e| {
                log::error!("Parse error: {}", e);
                format!("Failed to parse WSDL: {}", e)
            })?
    };

    log::info!("Successfully parsed WSDL: {} services found", services.len());

    // Extract target namespace from first service
    let target_namespace = services.first().and_then(|s| s.target_namespace.clone());

    Ok(ParseWsdlResponse {
        services,
        target_namespace,
        imports_count: 0, // TODO: Track actual import count
    })
}

/// Refresh WSDL and detect changes
#[tauri::command]
pub async fn refresh_wsdl(request: RefreshWsdlRequest) -> Result<RefreshWsdlResponse, String> {
    log::info!("Refreshing WSDL: {}", request.url);
    
    // Re-parse the WSDL
    let parse_result = parse_wsdl(ParseWsdlRequest {
        url: request.url.clone(),
        resolve_imports: Some(true),
        proxy_url: None,
    }).await?;
    
    // Extract existing operation names from interface
    let existing_ops: Vec<String> = if let Some(operations) = request.existing_interface.get("operations") {
        if let Some(ops_array) = operations.as_array() {
            ops_array.iter()
                .filter_map(|op| op.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
                .collect()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };
    
    // Extract new operation names
    let new_ops: Vec<String> = parse_result.services.iter()
        .flat_map(|service| &service.operations)
        .map(|op| op.name.clone())
        .collect();
    
    // Detect changes
    let mut added_operations = Vec::new();
    let mut removed_operations = Vec::new();
    
    // Find added operations
    for op in &new_ops {
        if !existing_ops.contains(op) {
            added_operations.push(op.clone());
        }
    }
    
    // Find removed operations
    for op in &existing_ops {
        if !new_ops.contains(op) {
            removed_operations.push(op.clone());
        }
    }
    
    let has_changes = !added_operations.is_empty() || !removed_operations.is_empty();
    
    log::info!("WSDL refresh complete: {} added, {} removed", 
        added_operations.len(), 
        removed_operations.len()
    );
    
    Ok(RefreshWsdlResponse {
        services: parse_result.services,
        changes: WsdlChanges {
            added_operations,
            removed_operations,
            modified_operations: Vec::new(), // TODO: Detect schema/parameter changes
            has_changes,
        },
    })
}

#[derive(Debug, Deserialize)]
pub struct ApplyWsdlSyncRequest {
    pub project_id: String,
    pub diff: WsdlDiffData,
}

#[derive(Debug, Deserialize)]
pub struct WsdlDiffData {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "interfaceId")]
    pub interface_id: String,
    #[serde(rename = "interfaceName")]
    pub interface_name: String,
    #[serde(rename = "newWsdlUrl")]
    pub new_wsdl_url: String,
    #[serde(rename = "addedOperations")]
    pub added_operations: Vec<serde_json::Value>,
    #[serde(rename = "removedOperations")]
    pub removed_operations: Vec<serde_json::Value>,
}

/// Apply WSDL synchronization changes to a project
/// 
/// Adds new operations and removes deleted operations from an interface.
#[tauri::command]
pub async fn apply_wsdl_sync(
    project_id: String,
    diff: WsdlDiffData,
    dir_path: String,
) -> Result<serde_json::Value, String> {
    log::info!("Applying WSDL sync for project {} interface {}", 
        project_id, diff.interface_id);
    
    // Load the project
    let mut project = project_storage::load_project_internal(&dir_path).await?;
    
    // Find the interface
    let interfaces = project["interfaces"]
        .as_array_mut()
        .ok_or("Missing or invalid interfaces array")?;
    
    let interface = interfaces.iter_mut()
        .find(|iface| {
            iface.get("id")
                .and_then(|id| id.as_str())
                .map(|id| id == diff.interface_id)
                .unwrap_or(false)
        })
        .ok_or_else(|| format!("Interface not found: {}", diff.interface_id))?;
    
    // Get operations array
    let operations = interface["operations"]
        .as_array_mut()
        .ok_or("Missing or invalid operations array")?;
    
    // Remove deleted operations (and their requests)
    let removed_names: Vec<String> = diff.removed_operations.iter()
        .filter_map(|op| op.get("name").and_then(|n| n.as_str()).map(|s| s.to_string()))
        .collect();
    
    operations.retain(|op| {
        let op_name = op.get("name").and_then(|n| n.as_str()).unwrap_or("");
        !removed_names.contains(&op_name.to_string())
    });
    
    log::info!("Removed {} operations", removed_names.len());
    
    // Add new operations
    for new_op in &diff.added_operations {
        operations.push(new_op.clone());
    }
    
    log::info!("Added {} operations", diff.added_operations.len());
    
    // Update interface definition URL if it changed
    interface["definition"] = serde_json::Value::String(diff.new_wsdl_url.clone());
    
    // Clone interface before saving (to avoid borrow checker issues)
    let updated_interface = interface.clone();
    
    // Save the updated project
    project_storage::save_project(project.clone()).await?;
    
    log::info!("WSDL sync applied successfully");
    
    Ok(serde_json::json!({
        "success": true,
        "interface": updated_interface,
        "message": format!("Added {} operations, removed {} operations", 
            diff.added_operations.len(), 
            removed_names.len())
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_parse_wsdl_command_structure() {
        let request = ParseWsdlRequest {
            url: "http://example.com/service.wsdl".to_string(),
            resolve_imports: Some(true),
            proxy_url: None,
        };
        
        // Just verify structure compiles
        assert_eq!(request.url, "http://example.com/service.wsdl");
    }
}
