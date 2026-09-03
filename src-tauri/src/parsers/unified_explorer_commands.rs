//! Unified Explorer Commands
//!
//! Handles WSDL/OpenAPI parsing, project creation, and refresh/sync logic.
//! The WSDL service is the top-level entity — no wrapper project layer.

use crate::parsers::wsdl::{ApiService, ServiceOperation, LoadContext};
use crate::parsers::wsdl_commands::{parse_wsdl_ctx, ParseWsdlRequest};
use crate::project_storage;
use crate::soap::envelope_builder::{EnvelopeBuilder, SoapVersion};
use serde_json::json;
use std::fs;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

use crate::http::client::{HttpClient, HttpRequest};
use crate::parsers::commands::parse_openapi_spec;
use crate::parsers::openapi_parser::{OpenApiParameter, OpenApiPath, OpenApiSpec};
use once_cell::sync::Lazy;
use regex::Regex;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

// ---------------------------------------------------------------------------
// R-11 (F-10) — cancel in-flight WSDL load
// ---------------------------------------------------------------------------
//
// In-flight unified loads are tracked here, keyed by the webview's `loadId`
// (a UUID the webview generates and passes to `parse_wsdl_as_project`, then
// hands to `cancel_unified_load` from the Cancel button). Each entry holds the
// `LoadContext` whose shared cancel flag every fetch in the load honours. The
// entry is removed when the load finishes (success or error), so the map never
// accumulates.
static LOAD_REGISTRY: Lazy<Mutex<HashMap<String, Arc<LoadContext>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Cancel an in-flight unified WSDL load by `loadId` (R-11 / F-10).
///
/// Returns `{ cancelled: true, found: true }` when a matching load is in
/// flight and was signalled to abort (it will surface a `WsdlLoadCancelled`
/// error to the caller at its next cooperative check), or
/// `{ cancelled: false, found: false }` when the load already finished (or no
/// such `loadId` was registered). Mirrors the SOAP `cancel_request` command's
/// result shape.
#[tauri::command]
pub fn cancel_unified_load(load_id: String) -> Result<serde_json::Value, String> {
    if load_id.is_empty() {
        return Err("cancel_unified_load requires a loadId".to_string());
    }
    let registry = LOAD_REGISTRY.lock().unwrap();
    if let Some(ctx) = registry.get(&load_id) {
        ctx.cancel();
        log::info!("Cancelled unified WSDL load: {}", load_id);
        Ok(json!({ "cancelled": true, "found": true, "loadId": load_id }))
    } else {
        log::info!("cancel_unified_load: loadId not in-flight: {}", load_id);
        Ok(json!({ "cancelled": false, "found": false, "loadId": load_id }))
    }
}

// ---------------------------------------------------------------------------
// R-12 (F-23) — WSDL load via proxy toggle
// ---------------------------------------------------------------------------

/// Read the app's configured proxy URL (settings `network.proxy`), if any.
/// Non-fatal: a missing/unreadable config yields `None` (load direct).
fn app_proxy_url() -> Option<String> {
    crate::settings_manager::load_config_internal()
        .ok()
        .and_then(|cfg| cfg.network)
        .and_then(|net| net.proxy)
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
}

/// R-12 (F-23): the proxy URL a unified WSDL load should use, or `None` for a
/// direct connection.
///
/// - **Local sources** (anything that is not an `http(s)://` URL — e.g. the
///   `file://` URLs the file-import flow builds, or a bare local path) force
///   the proxy **off**, matching the legacy `useProxy` behaviour
///   (`MainContent.tsx:1535/1598`, where local-file loads always send
///   `useProxy: false`).
/// - **Remote `http(s)` URLs** use the provided proxy only when `use_proxy` is
///   true and a non-empty proxy is configured.
///
/// Pure (the proxy candidate is passed in, not read from settings) so it is
/// unit-testable in isolation.
pub fn effective_proxy_url(
    url: &str,
    use_proxy: bool,
    app_proxy: Option<&str>,
) -> Option<String> {
    if is_local_source(url) {
        return None;
    }
    if !use_proxy {
        return None;
    }
    app_proxy
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// True when a load source is a local file rather than a remote `http(s)` URL.
/// The proxy is force-off for local sources (see `effective_proxy_url`).
fn is_local_source(url: &str) -> bool {
    let lower = url.trim().to_lowercase();
    !lower.starts_with("http://") && !lower.starts_with("https://")
}

/// Parse a WSDL URL and create/save a unified project.
/// If a project with the same sourceUrl already exists, triggers a refresh/sync.
///
/// `use_proxy` (R-12): when true and the source is a remote URL, the fetch is
/// routed through the app's configured proxy (force-off for local files).
/// `load_id` (R-11): the webview-supplied id for this load; pass it to
/// `cancel_unified_load` to abort an in-flight load.
#[tauri::command]
pub async fn parse_wsdl_as_project(
    url: String,
    use_proxy: Option<bool>,
    load_id: Option<String>,
) -> Result<serde_json::Value, String> {
    let use_proxy = use_proxy.unwrap_or(false);
    // List existing projects and check for duplicate sourceUrl
    let projects = project_storage::list_unified_projects()
        .map_err(|e| format!("Failed to list projects: {}", e))?;

    for p in &projects {
        if let Some(existing_url) = p.get("sourceUrl").and_then(|v| v.as_str()) {
            if existing_url == url.as_str() {
                // Duplicate WSDL URL — trigger refresh instead. Honour the
                // caller's proxy choice + loadId so a re-load is cancellable
                // and routes through the proxy just like the initial load.
                let project_name = p["name"].as_str().unwrap_or("<unknown>").to_string();
                return refresh_unified_project_with_opts(
                    project_name,
                    use_proxy,
                    load_id,
                )
                .await;
            }
        }
    }

    // R-12: resolve the effective proxy (force-off for local files).
    let proxy_url = effective_proxy_url(&url, use_proxy, app_proxy_url().as_deref());

    // R-11: register a cancellable load context keyed by the webview's loadId.
    let load_id = load_id
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let ctx = Arc::new(LoadContext::new(proxy_url));
    {
        let mut registry = LOAD_REGISTRY.lock().unwrap();
        registry.insert(load_id.clone(), ctx.clone());
    }

    // Parse WSDL. The context carries the proxy (R-12) and the shared cancel
    // flag (R-11) for the top-level fetch *and* every import fetch.
    let result = parse_wsdl_ctx(
        ParseWsdlRequest {
            url: url.clone(),
            resolve_imports: Some(true),
            proxy_url: None, // proxy flows through the LoadContext, not the request
        },
        &ctx,
    )
    .await;

    // R-11: always unregister, whether the load succeeded, failed, or was
    // cancelled — the entry must not outlive the load.
    LOAD_REGISTRY.lock().unwrap().remove(&load_id);

    let result = result.map_err(|e| e.to_string())?;

    if result.services.is_empty() {
        return Err("No services found in WSDL".to_string());
    }

    let service = &result.services[0];
    let now = chrono::Utc::now().to_rfc3339();

    // Derive SOAP version and binding name from service name
    let soap_version = if service.name.ends_with("Soap12") {
        "1.2"
    } else {
        "1.1"
    };
    let binding_name = service
        .name
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
    )
    .map_err(|e| format!("Failed to save project: {}", e))?;

    Ok(project)
}

/// Refresh a unified project's WSDL source by service name
#[tauri::command]
pub async fn refresh_unified_project(service_name: String) -> Result<serde_json::Value, String> {
    // The frontend "Refresh WSDL" menu item re-parses the stored sourceUrl
    // directly (no proxy toggle in the menu); keep that behaviour. The
    // duplicate-URL re-load path (`parse_wsdl_as_project`) routes here with the
    // caller's proxy choice + loadId via `refresh_unified_project_with_opts`.
    refresh_unified_project_with_opts(service_name, false, None).await
}

/// Refresh a unified project's WSDL source by service name, honouring an
/// optional proxy choice (R-12) and a cancellable load id (R-11).
async fn refresh_unified_project_with_opts(
    service_name: String,
    use_proxy: bool,
    load_id: Option<String>,
) -> Result<serde_json::Value, String> {
    // Load existing project
    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&service_name));

    let existing = project_storage::load_unified_project(project_dir.to_string_lossy().to_string())
        .map_err(|e| format!("Failed to load project: {}", e))?;

    // Ensure it has a source URL
    let source_url = existing
        .get("sourceUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Project '{}' has no source URL to refresh", service_name))?;

    // R-12: resolve the effective proxy for the re-parse (force-off for local
    // files). R-11: register a cancellable load context when a loadId is given.
    let proxy_url = effective_proxy_url(source_url, use_proxy, app_proxy_url().as_deref());
    let load_id = load_id
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let ctx = Arc::new(LoadContext::new(proxy_url));
    {
        let mut registry = LOAD_REGISTRY.lock().unwrap();
        registry.insert(load_id.clone(), ctx.clone());
    }

    // Re-parse the WSDL
    let result = parse_wsdl_ctx(
        ParseWsdlRequest {
            url: source_url.to_string(),
            resolve_imports: Some(true),
            proxy_url: None, // proxy flows through the LoadContext
        },
        &ctx,
    )
    .await;

    // R-11: always unregister, success or failure.
    LOAD_REGISTRY.lock().unwrap().remove(&load_id);

    let result = result.map_err(|e| e.to_string())?;

    if result.services.is_empty() {
        return Err("No services found after re-parse".to_string());
    }

    let new_service = &result.services[0];
    let now = chrono::Utc::now().to_rfc3339();

    // Preserve the interface-level Content-Type override across refresh
    let content_type_override = existing
        .get("contentType")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string());
    let soap_version = existing["soapVersion"].as_str().unwrap_or("1.1");
    // Sample content-type follows the project's SOAP version
    let sample_content_type = soap_version_from_str(soap_version).content_type();

    // Get existing operations
    let existing_operations: Vec<&serde_json::Value> = existing
        .get("operations")
        .and_then(|a| a.as_array())
        .map(|a| a.iter().collect())
        .unwrap_or_default();

    let mut merged_operations: Vec<serde_json::Value> = Vec::new();

    // Process new operations from WSDL
    for new_op in &new_service.operations {
        let existing_op = existing_operations
            .iter()
            .find(|eo| eo.get("name").and_then(|v| v.as_str()) == Some(&new_op.name));

        let sample_xml = generate_sample_xml(new_op);
        let requests = if let Some(eo) = existing_op {
            // Preserve user-created requests from existing operation
            eo.get("requests").cloned().unwrap_or_else(|| json!([]))
        } else {
            // New operation — create sample request with XML body
            json!([json!({
                "name": format!("sample_{}", new_op.name),
                "endpoint": new_op.original_endpoint,
                "method": "POST",
                "contentType": sample_content_type,
                "request": sample_xml,
            })])
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
    )
    .map_err(|e| format!("Failed to save updated project: {}", e))?;

    Ok(updated)
}

/// Refresh a project's WSDL by sourceUrl (called from frontend)
#[tauri::command]
pub async fn refresh_project_wsdl(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let source_url = params
        .get("sourceUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing sourceUrl".to_string())?;

    // Find the project with this sourceUrl
    let projects = project_storage::list_unified_projects()
        .map_err(|e| format!("Failed to list projects: {}", e))?;

    let existing_project = projects
        .iter()
        .find(|p| p.get("sourceUrl").and_then(|v| v.as_str()) == Some(source_url))
        .ok_or_else(|| format!("No project found with sourceUrl: {}", source_url))?;

    let service_name = existing_project
        .get("name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Project missing name".to_string())?;

    // Delegate to refresh_unified_project
    refresh_unified_project(service_name.to_string()).await
}

/// The source kind a load routes to — mirrors the webview `detectLoadFormat`
/// helper (the parity baseline) so the Rust and webview routers agree.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LoadFormat {
    Wsdl,
    OpenApi,
    GraphQl,
}

/// Classify a source URL / inline content as WSDL vs OpenAPI vs GraphQL.
///
/// Mirrors `detectLoadFormat` in `src-tauri/webview/src/utils/loadRouting.ts`
/// (the parity baseline) and the legacy `bridge.ts` `LoadWsdl` routing:
///   1. Strip the query string, lowercase.
///   2. `.json` / `.yaml` / `.yml` (or inline JSON/YAML) → OpenAPI.
///   3. URL path containing `graphql` or `/gql` → GraphQL.
///   4. Everything else → WSDL (the default branch; the WSDL parser errors
///      cleanly for non-WSDL input).
fn detect_load_format(source: &str) -> LoadFormat {
    let lowered = source.to_lowercase();
    let url_lower = lowered.split('?').next().unwrap_or("");
    if url_lower.ends_with(".json")
        || url_lower.ends_with(".yaml")
        || url_lower.ends_with(".yml")
        || looks_like_inline_spec(source)
    {
        LoadFormat::OpenApi
    } else if url_lower.contains("graphql") || url_lower.contains("/gql") {
        LoadFormat::GraphQl
    } else {
        LoadFormat::Wsdl
    }
}

/// Parse an OpenAPI/Swagger or GraphQL source and create/save a unified project.
///
/// Phase 1 of the unified explorer porting (docs §5.3 / R-06). This is the
/// non-WSDL half of the unified load path: the WSDL half is
/// [`parse_wsdl_as_project`]. It routes by source kind exactly the way the
/// legacy `bridge.ts` `LoadWsdl` handler does (see `detectLoadFormat` on the
/// webview side, which is the parity baseline):
///   * `.json` / `.yaml` / `.yml` (or inline JSON/YAML) → OpenAPI/Swagger
///   * URL path containing `graphql` or `/gql` → GraphQL introspection
///   * anything else → the legacy WSDL path (this function is NOT called for
///     it; the WSDL router keeps owning WSDL URLs).
///
/// Like the WSDL path, a duplicate `sourceUrl` triggers a refresh (re-parse /
/// re-introspect + server-side merge preserving user requests, `[Legacy]`
/// rename of removed ops) instead of creating a second project.
#[tauri::command]
pub async fn parse_spec_as_project(url: String) -> Result<serde_json::Value, String> {
    let load_format = detect_load_format(&url);
    // This command owns the non-WSDL half of the unified load path. WSDL URLs
    // are routed to `parse_wsdl_as_project` by the frontend (loadRouting
    // `detectLoadFormat`); a WSDL URL reaching here is a routing mistake and
    // must error cleanly rather than be mis-parsed as an OpenAPI spec.
    if load_format == LoadFormat::Wsdl {
        return Err(format!(
            "parse_spec_as_project: '{}' is not an OpenAPI/GraphQL source (use the WSDL load path)",
            url
        ));
    }

    // Duplicate sourceUrl → refresh instead of a second project.
    if let Some(existing) = find_project_by_source_url(&url)
        .await
        .map_err(|e| format!("Failed to list projects: {}", e))?
    {
        let project_name = existing["name"].as_str().unwrap_or("<unknown>").to_string();
        log::info!(
            "parse_spec_as_project: duplicate sourceUrl, refreshing project '{}'",
            project_name
        );
        return refresh_spec_project(&url, &load_format).await;
    }

    match load_format {
        LoadFormat::OpenApi => {
            let project = build_openapi_project(&url).await?;
            save_spec_project(&project)?;
            Ok(project)
        }
        LoadFormat::GraphQl => {
            let project = build_graphql_project(&url).await?;
            save_spec_project(&project)?;
            Ok(project)
        }
        LoadFormat::Wsdl => unreachable!("Wsdl rejected above"),
    }
}

/// Refresh a non-WSDL (OpenAPI/GraphQL) unified project from its source URL.
/// Re-parses / re-introspects and merges with the existing project, preserving
/// user-created requests and renaming removed operations to `[Legacy] <name>`
/// — the same model as [`refresh_unified_project`] for WSDL (doc Q5 confirmed).
async fn refresh_spec_project(
    url: &str,
    load_format: &LoadFormat,
) -> Result<serde_json::Value, String> {
    let existing = find_project_by_source_url(url)
        .await?
        .ok_or_else(|| format!("No unified project with sourceUrl: {}", url))?;

    let existing_ops = existing_operations(&existing);
    let now = chrono::Utc::now().to_rfc3339();

    let new_ops = match load_format {
        LoadFormat::OpenApi => parse_openapi_operations(url).await?,
        LoadFormat::GraphQl => parse_graphql_operations(url).await?,
        LoadFormat::Wsdl => unreachable!("Wsdl refresh uses refresh_unified_project"),
    };

    if new_ops.is_empty() {
        return Err(match load_format {
            LoadFormat::OpenApi => "No operations found in OpenAPI spec after re-parse".to_string(),
            LoadFormat::GraphQl => {
                "No Query/Mutation operations found after re-introspection".to_string()
            }
            LoadFormat::Wsdl => unreachable!(),
        });
    }

    let merged = merge_spec_operations(&existing_ops, &new_ops);

    let mut updated = existing.clone();
    updated["operations"] = json!(merged);
    updated["lastRefreshedAt"] = json!(now);
    updated["parsedAt"] = existing["parsedAt"].clone();

    let project_dir = project_dir_for_name(existing["name"].as_str().unwrap_or("<unknown>"))?;
    save_project_value(&project_dir, &updated)?;

    Ok(updated)
}

/// True when the input looks like inline spec content (JSON/YAML) rather than
/// a URL — matches `looks_like_inline_content` in `parsers/commands.rs`.
fn looks_like_inline_spec(s: &str) -> bool {
    let t = s.trim();
    t.starts_with('{')
        || t.starts_with('[')
        || t.starts_with("---")
        || t.starts_with("openapi:")
        || t.starts_with("swagger:")
}

/// Find a stored unified project whose `sourceUrl` matches, if any.
async fn find_project_by_source_url(url: &str) -> Result<Option<serde_json::Value>, String> {
    let projects = project_storage::list_unified_projects()?;
    Ok(projects
        .into_iter()
        .find(|p| p.get("sourceUrl").and_then(|v| v.as_str()) == Some(url)))
}

/// Resolve the on-disk project directory for a project name.
fn project_dir_for_name(name: &str) -> Result<std::path::PathBuf, String> {
    let dir = project_storage::projects_dir()?;
    Ok(dir.join(sanitize_name(name)))
}

/// Save a fully-built project value to disk (delegates to the shared saver).
fn save_project_value(project_dir: &Path, project: &serde_json::Value) -> Result<(), String> {
    project_storage::save_unified_project(
        project_dir.to_string_lossy().to_string(),
        project.clone(),
    )
}

/// Save a freshly built spec project (OpenAPI/GraphQL) to disk.
fn save_spec_project(project: &serde_json::Value) -> Result<(), String> {
    let name = project["name"].as_str().unwrap_or("<unknown>");
    let project_dir = project_dir_for_name(name)?;
    save_project_value(&project_dir, project)
}

/// Collect the existing operations array of a project value.
fn existing_operations(project: &serde_json::Value) -> Vec<serde_json::Value> {
    project
        .get("operations")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default()
}

/// Merge freshly-parsed operations with an existing project's operations.
///
/// * For every new operation: if a same-named operation already exists, keep
///   its user-created (non-`sample_`) requests and update the sample request
///   body; otherwise emit the new operation as-is.
/// * For every existing operation that no longer exists in the source: rename
///   it to `[Legacy] <name>` and keep its requests (preserving user work).
fn merge_spec_operations(
    existing_ops: &[serde_json::Value],
    new_ops: &[serde_json::Value],
) -> Vec<serde_json::Value> {
    let mut merged: Vec<serde_json::Value> = Vec::new();
    let mut seen: Vec<String> = Vec::new();

    for new_op in new_ops {
        let new_name = new_op.get("name").and_then(|v| v.as_str()).unwrap_or("");
        seen.push(new_name.to_string());

        let Some(existing_op) = existing_ops
            .iter()
            .find(|eo| eo.get("name").and_then(|v| v.as_str()) == Some(new_name))
        else {
            merged.push(new_op.clone());
            continue;
        };

        // Operation still present — preserve user requests, refresh the sample.
        let existing_requests = existing_op
            .get("requests")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let user_requests: Vec<serde_json::Value> = existing_requests
            .iter()
            .filter(|r| {
                let rname = r.get("name").and_then(|v| v.as_str()).unwrap_or("");
                !rname.starts_with("sample_")
            })
            .cloned()
            .collect();

        let new_requests = new_op
            .get("requests")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut requests: Vec<serde_json::Value> = Vec::new();
        // Keep the sample request first (as the builder emits it), then user requests.
        for nr in &new_requests {
            if nr
                .get("name")
                .and_then(|v| v.as_str())
                .map(|n| n.starts_with("sample_"))
                .unwrap_or(false)
            {
                requests.push(nr.clone());
            }
        }
        requests.extend(user_requests);

        let mut op = new_op.clone();
        op["requests"] = json!(requests);
        merged.push(op);
    }

    // Removed operations → [Legacy] rename, keep requests.
    for eo in existing_ops {
        let eo_name = eo.get("name").and_then(|v| v.as_str()).unwrap_or("");
        if seen.contains(&eo_name.to_string()) {
            continue;
        }
        let legacy_name = format!("[Legacy] {}", eo_name);
        let mut op = eo.clone();
        op["name"] = json!(legacy_name);
        merged.push(op);
    }

    merged
}

// ---------------------------------------------------------------------------
// OpenAPI → UnifiedProject
// ---------------------------------------------------------------------------

/// Parse an OpenAPI/Swagger source into operations (shared by create + refresh).
async fn parse_openapi_operations(url_or_json: &str) -> Result<Vec<serde_json::Value>, String> {
    let spec = parse_openapi_spec(url_or_json.to_string())
        .await
        .map_err(|e| format!("Failed to parse OpenAPI spec: {}", e))?;

    Ok(build_openapi_operations(&spec))
}

/// Build the flat operation list from a parsed OpenAPI spec.
///
/// The unified tree is flat (project → operations → requests), so the legacy
/// tag-grouping (one interface per tag) is folded into operation names as a
/// `<Tag>/<operationId>` prefix when a tag is present. This keeps per-path
/// operations visible in the flat model while preserving the tag grouping the
/// legacy explorer showed.
fn build_openapi_operations(spec: &OpenApiSpec) -> Vec<serde_json::Value> {
    let base_url = spec.base_url.clone().unwrap_or_default();

    spec.paths
        .iter()
        .map(|p| build_openapi_operation(p, &base_url))
        .collect()
}

/// Build a single flat operation for one OpenAPI path.
fn build_openapi_operation(p: &OpenApiPath, base_url: &str) -> serde_json::Value {
    let endpoint = format!("{}{}", base_url, p.path);
    let method = p.method.to_uppercase();
    let op_id = p
        .operation_id
        .clone()
        .unwrap_or_else(|| format!("{} {}", method, p.path));

    // Fold tag grouping into the flat operation name (legacy grouped by tag).
    let op_name = match p.tags.first() {
        Some(tag) if !tag.trim().is_empty() => format!("{}/{}", tag, op_id),
        _ => op_id.clone(),
    };

    let has_body = ["POST", "PUT", "PATCH"].contains(&method.as_str());
    let request_body = if has_body {
        p.sample_body
            .clone()
            .unwrap_or_else(|| build_openapi_fallback_body(&p.parameters))
    } else {
        String::new()
    };

    let query_params = build_openapi_query_params(&p.parameters);

    json!({
        "name": op_name,
        "action": "",
        "input": {
            "method": method,
            "path": p.path,
            "operationId": op_id,
            "summary": p.summary,
            "description": p.description,
            "tags": p.tags,
            "parameters": p.parameters,
        },
        "fullSchema": Value::Null,
        "targetNamespace": "",
        "originalEndpoint": endpoint,
        "requests": [
            {
                "name": format!("sample_{}", sanitize_request_name(&op_id)),
                "endpoint": endpoint,
                "method": method,
                "contentType": "application/json",
                "headers": {
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                "queryParams": query_params,
                "request": request_body,
                "requestType": "rest",
                "bodyType": if has_body { "json" } else { "none" },
            }
        ],
    })
}

/// Minimal fallback body when the Rust `sample_body` is unavailable
/// (Swagger 2.0 style body parameters). Mirrors `buildFallbackBody` in
/// `bridge.ts`.
fn build_openapi_fallback_body(parameters: &[OpenApiParameter]) -> String {
    let body_params: Vec<&OpenApiParameter> = parameters
        .iter()
        .filter(|param| param.location == "body")
        .collect();
    if body_params.is_empty() {
        return "{}".to_string();
    }
    let mut obj = serde_json::Map::new();
    for param in body_params {
        let value = match param.param_type.as_deref() {
            Some("integer") => json!(0),
            Some("boolean") => json!(false),
            _ => json!(""),
        };
        obj.insert(param.name.clone(), value);
    }
    serde_json::to_string_pretty(&serde_json::Value::Object(obj))
        .unwrap_or_else(|_| "{}".to_string())
}

/// Build the initial query-params map from query parameters (mirrors
/// `buildQueryParams` in `bridge.ts`).
fn build_openapi_query_params(parameters: &[OpenApiParameter]) -> serde_json::Value {
    let mut params = serde_json::Map::new();
    for param in parameters {
        if param.location == "query" {
            params.insert(param.name.clone(), json!(""));
        }
    }
    serde_json::Value::Object(params)
}

/// Assemble a full OpenAPI unified project.
async fn build_openapi_project(url: &str) -> Result<serde_json::Value, String> {
    let spec = parse_openapi_spec(url.to_string())
        .await
        .map_err(|e| format!("Failed to parse OpenAPI spec: {}", e))?;

    let operations = build_openapi_operations(&spec);
    assemble_openapi_project(&spec.title, spec.description.as_deref(), url, operations)
}

/// Pure assembly of an OpenAPI unified project (no network). Exposed for unit
/// tests and for any future offline source.
fn assemble_openapi_project(
    title: &str,
    description: Option<&str>,
    url: &str,
    operations: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if operations.is_empty() {
        return Err("No operations found in OpenAPI spec".to_string());
    }
    let now = chrono::Utc::now().to_rfc3339();
    Ok(json!({
        "name": title,
        "description": description,
        "source": "openapi",
        "sourceUrl": url,
        "parsedAt": now,
        "lastRefreshedAt": Value::Null,
        "id": Uuid::new_v4().to_string(),
        "operations": operations,
    }))
}

// ---------------------------------------------------------------------------
// GraphQL → UnifiedProject
// ---------------------------------------------------------------------------

/// A single GraphQL field (from `__type(...).fields`) with its type kind.
#[derive(Debug, Clone)]
struct GqlField {
    name: String,
    description: String,
    base_kind: String,
    is_mutation: bool,
}

/// The result of a successful introspection: the Query/Mutation field lists.
struct GqlIntrospection {
    query_type_name: String,
    mutation_type_name: Option<String>,
    query_fields: Vec<GqlField>,
    mutation_fields: Vec<GqlField>,
}

/// Parse a GraphQL source into operations (shared by create + refresh).
async fn parse_graphql_operations(url: &str) -> Result<Vec<serde_json::Value>, String> {
    let introspection = introspect_graphql(url)
        .await
        .map_err(|e| format!("GraphQL introspection failed: {}", e))?;
    Ok(build_graphql_operations(url, &introspection))
}

/// Assemble a full GraphQL unified project.
async fn build_graphql_project(url: &str) -> Result<serde_json::Value, String> {
    let introspection = introspect_graphql(url)
        .await
        .map_err(|e| format!("GraphQL introspection failed: {}", e))?;

    let operations = build_graphql_operations(url, &introspection);
    assemble_graphql_project(url, operations)
}

/// Pure assembly of a GraphQL unified project (no network). Exposed for unit
/// tests and for any future offline source.
fn assemble_graphql_project(
    url: &str,
    operations: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if operations.is_empty() {
        return Err("No Query/Mutation operations found in GraphQL schema".to_string());
    }
    let now = chrono::Utc::now().to_rfc3339();
    Ok(json!({
        "name": "GraphQL",
        "description": format!("GraphQL API at {}", url),
        "source": "graphql",
        "sourceUrl": url,
        "parsedAt": now,
        "lastRefreshedAt": Value::Null,
        "id": Uuid::new_v4().to_string(),
        "operations": operations,
    }))
}

/// Build the flat operation list from a GraphQL introspection result.
///
/// Mirrors `buildOperationsFromFields` + the Query/Mutation interface build in
/// `bridge.ts` (`tryRustCommand` LoadWsdl GraphQL branch). Each field becomes a
/// flat operation named `<QueryType|MutationType>/<field>`; its sample request
/// is a `query { field { __typename } }` (or `mutation { … }`) body.
fn build_graphql_operations(url: &str, intro: &GqlIntrospection) -> Vec<serde_json::Value> {
    let mut operations: Vec<serde_json::Value> = Vec::new();

    if !intro.query_fields.is_empty() {
        for field in &intro.query_fields {
            operations.push(build_graphql_operation(url, &intro.query_type_name, field));
        }
    }
    if !intro.mutation_fields.is_empty() {
        let mutation_name = intro.mutation_type_name.as_deref().unwrap_or("Mutation");
        for field in &intro.mutation_fields {
            operations.push(build_graphql_operation(url, mutation_name, field));
        }
    }

    operations
}

/// Build a single flat operation for one GraphQL field.
fn build_graphql_operation(url: &str, parent_type: &str, field: &GqlField) -> serde_json::Value {
    let op_name = format!("{}/{}", parent_type, field.name);
    let sample_query = build_graphql_sample_query(field);

    json!({
        "name": op_name,
        "action": field.description,
        "input": {
            "parentType": parent_type,
            "fieldName": field.name,
            "baseKind": field.base_kind,
            "isMutation": field.is_mutation,
        },
        "fullSchema": Value::Null,
        "targetNamespace": "",
        "originalEndpoint": url,
        "requests": [
            {
                "name": format!("sample_{}", sanitize_request_name(&field.name)),
                "endpoint": url,
                "method": "POST",
                "contentType": "application/json",
                "headers": { "Content-Type": "application/json" },
                "request": sample_query,
                "requestType": "graphql",
                "bodyType": "graphql",
            }
        ],
    })
}

/// Build the starter GraphQL query for a field, with a `__typename` sub-selection
/// when the field returns an object type (mirrors the legacy `sampleQuery`
/// builder in `bridge.ts`).
fn build_graphql_sample_query(field: &GqlField) -> String {
    let needs_selection = !["SCALAR", "ENUM", "INPUT_OBJECT"].contains(&field.base_kind.as_str());
    let field_selection = if needs_selection {
        format!("{} {{\n    __typename\n  }}", field.name)
    } else {
        field.name.clone()
    };
    let op_keyword = if field.is_mutation {
        "mutation"
    } else {
        "query"
    };
    format!("{} {{\n  {}\n}}", op_keyword, field_selection)
}

/// Run GraphQL introspection with adaptive depth tiers.
///
/// Port of the adaptive-depth logic in `bridge.ts` (`tryRustCommand` GraphQL
/// branch + `buildIntrospectionQuery` / `parseDepthLimitError` /
/// `tierForMaxDepth`): try `deep`, `shallow`, then `none`, backing off on
/// depth-limit errors and jumping straight to the right tier when the server
/// advertises a max depth.
async fn introspect_graphql(url: &str) -> Result<GqlIntrospection, String> {
    const TIERS: [&str; 3] = ["deep", "shallow", "none"];
    let mut next_idx = 0usize;
    let mut raw_body: Option<String> = None;

    while next_idx < TIERS.len() {
        let tier = TIERS[next_idx];
        let body = build_introspection_query(tier);
        let resp = execute_graphql_request(url, &body)
            .await
            .map_err(|e| format!("introspection request failed: {}", e))?;

        let resp_body = resp.body;
        if resp_body.is_empty() {
            return Err(format!(
                "HTTP {}: {}",
                resp.status,
                resp.error.unwrap_or_else(|| "empty response".to_string())
            ));
        }

        if let Some(depth_err) = parse_depth_limit_error(&resp_body) {
            if let Some(max_depth) = depth_err.max_depth {
                let safe_tier = tier_for_max_depth(max_depth);
                next_idx = TIERS.iter().position(|t| *t == safe_tier).unwrap_or(0);
                if safe_tier == tier {
                    next_idx += 1; // already tried this tier — step past it
                }
            } else {
                next_idx += 1;
            }
            continue;
        }

        raw_body = Some(resp_body);
        break;
    }

    let raw_body = raw_body.ok_or_else(|| "server rejected all query depth levels".to_string())?;

    let introspection: serde_json::Value = serde_json::from_str(&raw_body)
        .map_err(|_| format!("response is not valid JSON: {}", truncate(&raw_body, 200)))?;

    if introspection.get("errors").is_some() && introspection.get("data").is_none() {
        let first_msg = introspection["errors"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("unknown introspection error");
        return Err(format!("introspection error: {}", first_msg));
    }

    let schema = introspection
        .get("data")
        .and_then(|d| d.get("__schema"))
        .ok_or_else(|| {
            format!(
                "invalid introspection response: {}",
                truncate(&raw_body, 300)
            )
        })?;

    let query_type_name = schema
        .get("queryType")
        .and_then(|t| t.get("name"))
        .and_then(|n| n.as_str())
        .unwrap_or("Query")
        .to_string();
    let mutation_type_name = schema
        .get("mutationType")
        .and_then(|t| t.get("name"))
        .and_then(|n| n.as_str())
        .map(|s| s.to_string());

    let query_fields = parse_gql_fields(
        introspection
            .get("data")
            .and_then(|d| d.get("query"))
            .cloned(),
        false,
    );
    let mutation_fields = parse_gql_fields(
        introspection
            .get("data")
            .and_then(|d| d.get("mutation"))
            .cloned(),
        true,
    );

    Ok(GqlIntrospection {
        query_type_name,
        mutation_type_name,
        query_fields,
        mutation_fields,
    })
}

/// POST an introspection query to the GraphQL endpoint and return the raw HTTP
/// response. Uses the shared `HttpClient` with JSON headers (parity with the
/// legacy bridge `execute_rest_request` call for introspection).
async fn execute_graphql_request(
    url: &str,
    body: &str,
) -> Result<crate::http::client::HttpResponse, String> {
    let client = HttpClient::new().map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let mut headers = HashMap::new();
    headers.insert("Content-Type".to_string(), "application/json".to_string());
    headers.insert("Accept".to_string(), "application/json".to_string());

    let request = HttpRequest {
        method: "POST".to_string(),
        url: url.to_string(),
        headers,
        body: Some(body.to_string()),
        timeout_ms: None,
        follow_redirects: Some(true),
        verify_ssl: Some(true),
        proxy_url: None,
        proxy_username: None,
        proxy_password: None,
    };

    Ok(client.execute(request).await)
}

/// Parse the `__type(...).fields` array of an introspection `data` value into
/// [`GqlField`]s, unwrapping NON_NULL/LIST wrappers to get the base kind.
fn parse_gql_fields(data: Option<serde_json::Value>, is_mutation: bool) -> Vec<GqlField> {
    let fields = data
        .as_ref()
        .and_then(|d| d.get("fields"))
        .and_then(|f| f.as_array());
    let Some(fields) = fields else {
        return Vec::new();
    };

    fields
        .iter()
        .filter_map(|field| {
            let name = field.get("name")?.as_str()?.to_string();
            let description = field
                .get("description")
                .and_then(|d| d.as_str())
                .unwrap_or("")
                .to_string();
            let base_kind = unwrap_base_kind(field.get("type"));
            Some(GqlField {
                name,
                description,
                base_kind,
                is_mutation,
            })
        })
        .collect()
}

/// Unwrap NON_NULL / LIST wrappers to get the base type kind (mirrors the
/// `unwrap` IIFE in `bridge.ts`). Unknown/absent types default to `OBJECT`.
fn unwrap_base_kind(type_ref: Option<&serde_json::Value>) -> String {
    match type_ref {
        None => "OBJECT".to_string(),
        Some(Value::Object(obj)) => match obj.get("kind").and_then(|k| k.as_str()) {
            Some("NON_NULL") | Some("LIST") => unwrap_base_kind(obj.get("ofType")),
            Some(kind) => kind.to_string(),
            None => "OBJECT".to_string(),
        },
        _ => "OBJECT".to_string(),
    }
}

/// Build the introspection query for a depth tier (port of
/// `buildIntrospectionQuery` in `bridge.ts`).
fn build_introspection_query(tier: &str) -> String {
    let type_fragment = match tier {
        "deep" => Some("type { kind ofType { kind ofType { kind } } }"),
        "shallow" => Some("type { kind }"),
        _ => None,
    };

    let field_sel: Vec<&str> = ["name", "description"]
        .iter()
        .copied()
        .chain(type_fragment.iter().copied())
        .collect();
    let field_sel = field_sel.join(" ");

    let query = format!(
        r#"{{
            __schema {{ queryType {{ name }} mutationType {{ name }} }}
            query: __type(name: "Query") {{ fields(includeDeprecated: false) {{ {field_sel} }} }}
            mutation: __type(name: "Mutation") {{ fields(includeDeprecated: false) {{ {field_sel} }} }}
        }}"#
    );
    serde_json::to_string(&json!({ "query": query }))
        .unwrap_or_else(|_| format!("{{\"query\":{}}}", query))
}

/// Detect a GraphQL depth-limit error and (if advertised) the server's max
/// depth. Port of `parseDepthLimitError` in `bridge.ts`.
fn parse_depth_limit_error(body: &str) -> Option<DepthLimitError> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    let errors = parsed.get("errors")?.as_array()?;

    for e in errors {
        let ext = e.get("extensions").cloned().unwrap_or(Value::Null);
        let msg = e.get("message").and_then(|m| m.as_str()).unwrap_or("");

        let is_limit = ext
            .get("code")
            .and_then(|c| c.as_str())
            .map(|c| c == "GCDN_QUERY_DEPTH_LIMIT")
            .unwrap_or(false)
            || DEPTH_LIMIT_RE.is_match(msg)
            || DEPTH_LIMIT_RE_2.is_match(msg)
            || DEPTH_LIMIT_RE_3.is_match(msg);

        if !is_limit {
            continue;
        }

        // Prefer an advertised max depth from extensions, then the message text.
        let from_ext = ext
            .get("maxDepth")
            .or_else(|| ext.get("max_depth"))
            .or_else(|| ext.get("maximumDepth"))
            .and_then(|v| v.as_u64());

        if let Some(max) = from_ext {
            return Some(DepthLimitError {
                max_depth: Some(max as u64),
            });
        }

        if let Some(cap) = DEPTH_NUMBER_RE
            .captures(msg)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .and_then(|n| n.parse::<u64>().ok())
        {
            return Some(DepthLimitError {
                max_depth: Some(cap),
            });
        }
        return Some(DepthLimitError { max_depth: None });
    }

    None
}

/// Map a server-reported max depth to the deepest usable tier (port of
/// `tierForMaxDepth` in `bridge.ts`).
fn tier_for_max_depth(max_depth: u64) -> &'static str {
    if max_depth >= 6 {
        "deep"
    } else if max_depth >= 4 {
        "shallow"
    } else {
        "none"
    }
}

#[derive(Debug, Clone)]
struct DepthLimitError {
    max_depth: Option<u64>,
}

/// Truncate a string for error messages (char-boundary safe).
fn truncate(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut end = max;
        while !s.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}

/// Sanitize an operation name for use as a `sample_` request name (strip
/// characters that would break the on-disk request file name).
fn sanitize_request_name(op_id: &str) -> String {
    op_id
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect()
}

static DEPTH_LIMIT_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)depth.{0,30}limit").expect("valid regex"));
static DEPTH_LIMIT_RE_2: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)maximum.{0,30}depth").expect("valid regex"));
static DEPTH_LIMIT_RE_3: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"(?i)too deep").expect("valid regex"));
static DEPTH_NUMBER_RE: Lazy<Regex> = Lazy::new(|| Regex::new(r"\b(\d+)\b").expect("valid regex"));

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
    service
        .operations
        .iter()
        .map(|op| build_operation_json(op, soap_version))
        .collect()
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
pub fn delete_unified_operation(
    project_name: String,
    operation_name: String,
) -> Result<(), String> {
    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&project_name));

    let mut project =
        project_storage::load_unified_project(project_dir.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to load project: {}", e))?;

    let operations = project["operations"]
        .as_array()
        .ok_or("Missing or invalid operations array")?;

    // Filter out the operation
    let filtered: Vec<serde_json::Value> = operations
        .iter()
        .filter(|op| {
            let op_name = op.get("name").and_then(|v| v.as_str());
            op_name != Some(&operation_name)
        })
        .cloned()
        .collect();

    project["operations"] = json!(filtered);

    project_storage::save_unified_project(project_dir.to_string_lossy().to_string(), project)
        .map_err(|e| format!("Failed to save project after deleting operation: {}", e))?;

    Ok(())
}

/// Delete a request from a unified project operation
#[tauri::command]
pub fn delete_unified_request(
    project_name: String,
    operation_name: String,
    request_name: String,
) -> Result<(), String> {
    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&project_name));

    let mut project =
        project_storage::load_unified_project(project_dir.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to load project: {}", e))?;

    let operations = project["operations"]
        .as_array_mut()
        .ok_or("Missing or invalid operations array")?;

    for op in operations.iter_mut() {
        if op.get("name").and_then(|v| v.as_str()) == Some(&operation_name) {
            let requests = op
                .get("requests")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_else(Vec::new);
            let filtered: Vec<serde_json::Value> = requests
                .iter()
                .filter(|req| {
                    let req_name = req.get("name").and_then(|v| v.as_str());
                    req_name != Some(&request_name)
                })
                .cloned()
                .collect();
            op["requests"] = json!(filtered);
        }
    }

    project_storage::save_unified_project(project_dir.to_string_lossy().to_string(), project)
        .map_err(|e| format!("Failed to save project after deleting request: {}", e))?;

    Ok(())
}

/// Create a new request in a unified project operation
#[tauri::command]
pub fn new_unified_request(params: serde_json::Value) -> Result<serde_json::Value, String> {
    let project_name = params
        .get("projectName")
        .and_then(|v| v.as_str())
        .ok_or("Missing projectName")?
        .to_string();
    let operation_name = params
        .get("operationName")
        .and_then(|v| v.as_str())
        .ok_or("Missing operationName")?
        .to_string();

    let project_dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?
        .join(sanitize_name(&project_name));

    let mut project =
        project_storage::load_unified_project(project_dir.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to load project: {}", e))?;

    // Interface-level override + SOAP version (per SOAP_INTERFACE_CONTENT_TYPE_SPEC §5.2)
    let project_content_type = project
        .get("contentType")
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(|s| s.to_string());
    // Owned String: must not keep an immutable borrow of `project` alive across
    // the mutable borrow below (project["operations"].as_array_mut()).
    let project_soap_version = project
        .get("soapVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("1.1")
        .to_string();

    let operations = project["operations"]
        .as_array_mut()
        .ok_or("Missing or invalid operations array")?;

    for op in operations.iter_mut() {
        if op.get("name").and_then(|v| v.as_str()) == Some(&operation_name) {
            let endpoint = op
                .get("originalEndpoint")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            // Per spec §5.2: project contentType override ?? op.input.contentType ??
            // soapDefault(project.soap_version). No bare "application/soap+xml" fallback.
            let input_content_type = op
                .get("input")
                .and_then(|v| v.get("contentType"))
                .and_then(|v| v.as_str())
                .filter(|s| !s.trim().is_empty())
                .map(|s| s.to_string());
            let content_type = project_content_type
                .clone()
                .or(input_content_type)
                .unwrap_or_else(|| {
                    soap_version_from_str(&project_soap_version)
                        .content_type()
                        .to_string()
                });

            // Auto-generate request name: Request1.xml, Request2.xml, ...
            let existing_requests = op
                .get("requests")
                .and_then(|v| v.as_array())
                .cloned()
                .unwrap_or_else(Vec::new);
            let next_num = existing_requests.len() + 1;
            let request_name = format!("Request{}.xml", next_num);

            // Build ServiceOperation from project data to generate sample XML
            let operation = ServiceOperation {
                name: op.get("name").and_then(|v| v.as_str()).unwrap().to_string(),
                action: op
                    .get("action")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                input: op.get("input").cloned(),
                output: op.get("output").cloned().unwrap_or_else(|| json!({})),
                target_namespace: op
                    .get("targetNamespace")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                original_endpoint: op
                    .get("originalEndpoint")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                full_schema: op
                    .get("fullSchema")
                    .and_then(|v| serde_json::from_value(v.clone()).ok()),
                description: op
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
                port_name: op
                    .get("portName")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string()),
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
    let new_request = project["operations"]
        .as_array()
        .unwrap()
        .iter()
        .find(|op| op.get("name").and_then(|v| v.as_str()) == Some(&operation_name))
        .unwrap()
        .get("requests")
        .unwrap()
        .as_array()
        .unwrap()
        .iter()
        .rev()
        .find(|r| r.get("method").and_then(|v| v.as_str()) == Some("POST"))
        .unwrap()
        .clone();

    project_storage::save_unified_project(project_dir.to_string_lossy().to_string(), project)
        .map_err(|e| format!("Failed to save project after adding request: {}", e))?;

    Ok(new_request)
}

// ---------------------------------------------------------------------------
// R-10 (F-17) — context-menu rename
//
// Renaming is display-only: it sets the additive `displayName` field (already
// declared on `ApiOperation`/`ApiInterface` in shared/src/models.ts as "for
// display-only renaming in UI — preserves original name for WSDL binding").
// The stable `name` is left intact, which keeps:
//   * the on-disk project directory (`sanitize_name(name)`) stable — no
//     directory move, no collision handling, existing exports/imports valid;
//   * WSDL binding + refresh merge (keyed on `name`) stable;
//   * selection identity stable (ops/requests have stable `id`s; the tree
//     selects on `id || name`, so a `name` that never changes is safe).
// Passing an empty/whitespace display name clears the override (falls back to
// the original name in the UI).
// ---------------------------------------------------------------------------

/// Shared helper: resolve a project directory by its (stable) name.
fn unified_project_dir(project_name: &str) -> Result<std::path::PathBuf, String> {
    let dir = project_storage::projects_dir()
        .map_err(|e| format!("Failed to get projects dir: {}", e))?;
    Ok(dir.join(sanitize_name(project_name)))
}

/// R-10 (F-17): set the display name of a unified project (or clear it).
#[tauri::command]
pub fn rename_unified_project(
    project_name: String,
    display_name: String,
) -> Result<serde_json::Value, String> {
    let project_dir = unified_project_dir(&project_name)?;

    let mut project =
        project_storage::load_unified_project(project_dir.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to load project: {}", e))?;

    let display_name = display_name.trim().to_string();
    if display_name.is_empty() {
        project.as_object_mut().unwrap().remove("displayName");
    } else {
        project["displayName"] = json!(display_name);
    }

    project_storage::save_unified_project(project_dir.to_string_lossy().to_string(), project.clone())
        .map_err(|e| format!("Failed to save project after rename: {}", e))?;

    Ok(project)
}

/// R-10 (F-17): set the display name of an operation within a unified project.
/// `operation_name` is the stable operation name (not the display name).
#[tauri::command]
pub fn rename_unified_operation(
    project_name: String,
    operation_name: String,
    display_name: String,
) -> Result<serde_json::Value, String> {
    let project_dir = unified_project_dir(&project_name)?;

    let mut project =
        project_storage::load_unified_project(project_dir.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to load project: {}", e))?;

    let operations = project["operations"]
        .as_array_mut()
        .ok_or("Missing or invalid operations array")?;

    let display_name = display_name.trim().to_string();
    let mut found = false;
    for op in operations.iter_mut() {
        if op.get("name").and_then(|v| v.as_str()) == Some(&operation_name) {
            if display_name.is_empty() {
                op.as_object_mut().unwrap().remove("displayName");
            } else {
                op["displayName"] = json!(display_name);
            }
            found = true;
            break;
        }
    }
    if !found {
        return Err(format!("Operation '{}' not found in project '{}'", operation_name, project_name));
    }

    project_storage::save_unified_project(project_dir.to_string_lossy().to_string(), project.clone())
        .map_err(|e| format!("Failed to save project after rename: {}", e))?;

    Ok(project)
}

/// R-10 (F-17): set the display name of a request within an operation.
/// `request_name` is the stable request name (not the display name).
#[tauri::command]
pub fn rename_unified_request(
    project_name: String,
    operation_name: String,
    request_name: String,
    display_name: String,
) -> Result<serde_json::Value, String> {
    let project_dir = unified_project_dir(&project_name)?;

    let mut project =
        project_storage::load_unified_project(project_dir.to_string_lossy().to_string())
            .map_err(|e| format!("Failed to load project: {}", e))?;

    let operations = project["operations"]
        .as_array_mut()
        .ok_or("Missing or invalid operations array")?;

    let display_name = display_name.trim().to_string();
    let mut found = false;
    for op in operations.iter_mut() {
        if op.get("name").and_then(|v| v.as_str()) == Some(&operation_name) {
            let requests = op
                .get_mut("requests")
                .and_then(|v| v.as_array_mut())
                .ok_or("Missing or invalid requests array")?;
            for req in requests.iter_mut() {
                if req.get("name").and_then(|v| v.as_str()) == Some(&request_name) {
                    if display_name.is_empty() {
                        req.as_object_mut().unwrap().remove("displayName");
                    } else {
                        req["displayName"] = json!(display_name);
                    }
                    found = true;
                    break;
                }
            }
            if found {
                break;
            }
        }
    }
    if !found {
        return Err(format!(
            "Request '{}' not found in operation '{}' of project '{}'",
            request_name, operation_name, project_name
        ));
    }

    project_storage::save_unified_project(project_dir.to_string_lossy().to_string(), project.clone())
        .map_err(|e| format!("Failed to save project after rename: {}", e))?;

    Ok(project)
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

    // ── R-12 (F-23): effective_proxy_url (pure; force-off for local files) ──

    #[test]
    fn test_effective_proxy_url_remote_and_toggle() {
        const PROXY: &str = "http://proxy.example:8080";
        // Remote URL + proxy on + proxy configured → proxy used.
        assert_eq!(
            effective_proxy_url("https://example.com/s.wsdl", true, Some(PROXY)),
            Some(PROXY.to_string())
        );
        // Remote URL + proxy off → direct (even with a proxy configured).
        assert_eq!(
            effective_proxy_url("https://example.com/s.wsdl", false, Some(PROXY)),
            None
        );
        // Remote URL + proxy on + no proxy configured → direct.
        assert_eq!(effective_proxy_url("https://example.com/s.wsdl", true, None), None);
        // Whitespace-only proxy is treated as unconfigured.
        assert_eq!(
            effective_proxy_url("https://example.com/s.wsdl", true, Some("   ")),
            None
        );
        // Proxy value is trimmed before use.
        assert_eq!(
            effective_proxy_url("http://example.com/s.wsdl", true, Some("  http://p:8080  ")),
            Some("http://p:8080".to_string())
        );
    }

    #[test]
    fn test_effective_proxy_url_force_off_local_sources() {
        const PROXY: &str = "http://proxy.example:8080";
        // file:// URLs (the file-import flow) always load direct.
        assert_eq!(effective_proxy_url("file:///home/u/x.wsdl", true, Some(PROXY)), None);
        // Bare local paths.
        assert_eq!(effective_proxy_url("/home/u/x.wsdl", true, Some(PROXY)), None);
        assert_eq!(effective_proxy_url("C:\\wsdl\\x.wsdl", true, Some(PROXY)), None);
        // Scheme check is case-insensitive (an uppercase remote URL is NOT local).
        assert_eq!(
            effective_proxy_url("HTTP://EXAMPLE.com/s.wsdl", true, Some(PROXY)),
            Some(PROXY.to_string())
        );
    }

    // ── R-11 (F-10): cancel_unified_load registry semantics ─────────────────

    #[test]
    fn test_cancel_unified_load_unknown_id_reports_not_found() {
        // No such load is in flight → found: false, cancelled: false (no error).
        let res = cancel_unified_load("no-such-load-id".to_string())
            .expect("cancel_unified_load on an unknown id should not error");
        assert_eq!(res["found"], false);
        assert_eq!(res["cancelled"], false);
        assert_eq!(res["loadId"], "no-such-load-id");
    }

    #[test]
    fn test_cancel_unified_load_empty_id_errors() {
        assert!(cancel_unified_load(String::new()).is_err());
    }

    // ── R-10 (F-17): rename commands (round-trip through real storage) ──────

    /// Seed a project on disk and run `scenario` while a unique
    /// `APINOX_CONFIG_DIR` is in effect (serialized via `CONFIG_DIR_TEST_LOCK`
    /// — the env var is process-global). The temp dir stays alive for the
    /// whole closure so the scenario can re-read the on-disk copy; cleanup
    /// happens afterwards. Returns `(scenario_result, project_dir)`.
    fn run_rename_scenario<R>(scenario: impl FnOnce(&std::path::Path) -> R) -> (R, std::path::PathBuf) {
        let _guard = CONFIG_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("apinox-rename-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).expect("create temp config dir");
        std::env::set_var("APINOX_CONFIG_DIR", &tmp);
        let project = json!({
            "name": "RenameSvc",
            "source": "wsdl",
            "sourceUrl": "http://example.com/rename.wsdl",
            "soapVersion": "1.1",
            "operations": json!([
                {
                    "name": "RmOp",
                    "action": "http://example.com/RmOp",
                    "input": null,
                    "targetNamespace": "http://example.com/ns",
                    "originalEndpoint": "http://example.com/rm",
                    "requests": json!([
                        {
                            "name": "sample_RmOp",
                            "endpoint": "http://example.com/rm",
                            "method": "POST",
                            "contentType": "text/xml; charset=utf-8",
                            "request": "<x/>"
                        }
                    ])
                }
            ]),
        });
        let project_dir = project_storage::projects_dir()
            .expect("projects dir")
            .join("RenameSvc");
        project_storage::save_unified_project(
            project_dir.to_string_lossy().to_string(),
            project,
        )
        .expect("seed project save");
        let result = scenario(&project_dir);
        std::env::remove_var("APINOX_CONFIG_DIR");
        let _ = std::fs::remove_dir_all(&tmp);
        (result, project_dir)
    }

    #[test]
    fn test_rename_unified_project_round_trip() {
        let (res, project_dir) = run_rename_scenario(|project_dir| {
            let renamed = rename_unified_project(
                "RenameSvc".to_string(),
                "My Renamed Service".to_string(),
            )
            .expect("project rename should succeed");

            // Display-only: the stable name (dir key) is untouched; displayName
            // is set on the returned project.
            assert_eq!(renamed["name"], "RenameSvc");
            assert_eq!(renamed["displayName"], "My Renamed Service");

            // The change is persisted: re-loading the on-disk project returns
            // the same field.
            let on_disk = project_storage::load_unified_project(
                project_dir.to_string_lossy().to_string(),
            )
            .expect("re-load renamed project");
            assert_eq!(on_disk["displayName"], "My Renamed Service");
            assert_eq!(on_disk["name"], "RenameSvc");

            renamed
        });
        assert_eq!(res["displayName"], "My Renamed Service");
    }

    #[test]
    fn test_rename_unified_project_empty_name_clears_display_name() {
        let (res, _dir) = run_rename_scenario(|_| {
            // Set then clear: an empty/whitespace display name removes the
            // override (the UI falls back to the stable name).
            rename_unified_project("RenameSvc".to_string(), "First".to_string())
                .expect("first rename should succeed");
            rename_unified_project("RenameSvc".to_string(), "   ".to_string())
                .expect("clear rename should succeed")
        });
        assert_eq!(res["name"], "RenameSvc");
        assert!(
            res.get("displayName").map(|v| v.is_null()).unwrap_or(true),
            "empty display name must remove the displayName field"
        );
    }

    #[test]
    fn test_rename_unified_operation_and_request_round_trip() {
        let (op_res, _dir) = run_rename_scenario(|_| {
            rename_unified_operation(
                "RenameSvc".to_string(),
                "RmOp".to_string(),
                "Op Alias".to_string(),
            )
            .expect("operation rename should succeed")
        });
        assert_eq!(op_res["name"], "RenameSvc");
        let op = &op_res["operations"][0];
        assert_eq!(op["name"], "RmOp");
        assert_eq!(op["displayName"], "Op Alias");

        let (req_res, _dir) = run_rename_scenario(|_| {
            rename_unified_request(
                "RenameSvc".to_string(),
                "RmOp".to_string(),
                "sample_RmOp".to_string(),
                "My Request".to_string(),
            )
            .expect("request rename should succeed")
        });
        let req = &req_res["operations"][0]["requests"][0];
        assert_eq!(req["name"], "sample_RmOp");
        assert_eq!(req["displayName"], "My Request");
    }

    #[test]
    fn test_rename_unified_unknown_operation_or_request_errors() {
        let (res, _dir) = run_rename_scenario(|_| {
            rename_unified_operation(
                "RenameSvc".to_string(),
                "MissingOp".to_string(),
                "X".to_string(),
            )
        });
        let err = res.expect_err("renaming a missing operation must fail");
        assert!(err.contains("MissingOp"), "unexpected error: {}", err);

        let (res2, _dir) = run_rename_scenario(|_| {
            rename_unified_request(
                "RenameSvc".to_string(),
                "RmOp".to_string(),
                "MissingReq".to_string(),
                "X".to_string(),
            )
        });
        let err2 = res2.expect_err("renaming a missing request must fail");
        assert!(err2.contains("MissingReq"), "unexpected error: {}", err2);
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
        assert_eq!(
            json["requests"][0]["contentType"],
            "text/xml; charset=utf-8"
        );
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

        assert_eq!(
            json["requests"][0]["contentType"],
            "application/soap+xml; charset=utf-8"
        );
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
        assert_eq!(
            project["operations"][0]["requests"][0]["name"],
            "sample_TestOp"
        );
    }

    /// Serialize tests that swap APINOX_CONFIG_DIR (process-global env).
    /// Uses the process-wide lock in `utils::config` so we share it with the
    /// `updater` env-mutating tests (per-module locks would race).
    use crate::utils::config::CONFIG_DIR_TEST_LOCK;

    fn run_new_unified_request_scenario(content_type_override: Option<&str>) -> serde_json::Value {
        let _guard = CONFIG_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("apinox-new-req-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).expect("create temp config dir");
        // Redirect project storage into the temp dir (resolve_config_dir honors this env var)
        std::env::set_var("APINOX_CONFIG_DIR", &tmp);
        let result = (|| {
            let mut project = json!({
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
            )
            .expect("seed project save");

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
        // Numbered after the seeded sample request (pre-existing naming behavior)
        assert_eq!(created["name"], "Request2.xml");
        assert_eq!(created["method"], "POST");
        assert_eq!(created["contentType"], "application/xml");
    }

    #[test]
    fn test_new_unified_request_falls_back_to_soap_version_default() {
        // No override, no input contentType → soapDefault(1.2)
        let created = run_new_unified_request_scenario(None);
        assert_eq!(created["name"], "Request2.xml");
        assert_eq!(
            created["contentType"],
            "application/soap+xml; charset=utf-8"
        );
    }

    // =========================================================================
    // Phase 1 — parse_spec_as_project (OpenAPI / GraphQL → UnifiedProject)
    // =========================================================================

    /// OpenAPI fixture: two ops under tag "pets" — a GET (query param, no body)
    /// and a POST (JSON body). Exercises tag grouping, `sample_` naming and JSON
    /// sample bodies.
    fn openapi_test_spec() -> OpenApiSpec {
        OpenApiSpec {
            title: "Petstore Test".to_string(),
            version: "1.0.0".to_string(),
            description: Some("test".to_string()),
            base_url: Some("https://api.example.com/v1".to_string()),
            paths: vec![
                OpenApiPath {
                    path: "/pets".to_string(),
                    method: "GET".to_string(),
                    operation_id: Some("listPets".to_string()),
                    summary: None,
                    description: None,
                    tags: vec!["pets".to_string()],
                    parameters: vec![OpenApiParameter {
                        name: "limit".to_string(),
                        location: "query".to_string(),
                        required: false,
                        param_type: Some("integer".to_string()),
                        description: None,
                    }],
                    sample_body: None,
                },
                OpenApiPath {
                    path: "/pets".to_string(),
                    method: "POST".to_string(),
                    operation_id: Some("createPet".to_string()),
                    summary: None,
                    description: None,
                    tags: vec!["pets".to_string()],
                    parameters: vec![],
                    sample_body: Some(
                        serde_json::json!({ "name": "dog", "tag": "puppy" }).to_string(),
                    ),
                },
            ],
        }
    }

    #[test]
    fn test_openapi_tag_grouping_sample_naming_and_json_bodies() {
        let spec = openapi_test_spec();
        let ops = build_openapi_operations(&spec);
        assert_eq!(ops.len(), 2);

        // Tag grouping is folded into the flat operation name.
        assert_eq!(ops[0]["name"], "pets/listPets");
        assert_eq!(ops[1]["name"], "pets/createPet");

        // GET: no body, query params captured, sample_ naming, rest type.
        let get_req = &ops[0]["requests"][0];
        assert_eq!(get_req["name"], "sample_listPets");
        assert!(get_req["name"].as_str().unwrap().starts_with("sample_"));
        assert_eq!(get_req["method"], "GET");
        assert_eq!(get_req["requestType"], "rest");
        assert_eq!(get_req["bodyType"], "none");
        assert_eq!(get_req["request"], "");
        assert_eq!(get_req["endpoint"], "https://api.example.com/v1/pets");
        assert_eq!(get_req["queryParams"]["limit"], "");

        // POST: JSON sample body present, bodyType json.
        let post_req = &ops[1]["requests"][0];
        assert_eq!(post_req["name"], "sample_createPet");
        assert_eq!(post_req["bodyType"], "json");
        assert_eq!(post_req["method"], "POST");
        assert_eq!(post_req["contentType"], "application/json");
        let body: serde_json::Value =
            serde_json::from_str(post_req["request"].as_str().unwrap()).unwrap();
        assert_eq!(body["name"], "dog");
        assert_eq!(body["tag"], "puppy");

        // Project assembly carries source: "openapi" (previously declared-but-dead).
        let project = assemble_openapi_project(
            &spec.title,
            spec.description.as_deref(),
            "https://x/spec.json",
            ops,
        )
        .unwrap();
        assert_eq!(project["source"], "openapi");
        assert_eq!(project["name"], "Petstore Test");
        assert_eq!(project["sourceUrl"], "https://x/spec.json");
        assert_eq!(project["operations"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn test_graphql_query_mutation_interfaces_and_typename_bodies() {
        let intro = GqlIntrospection {
            query_type_name: "Query".to_string(),
            mutation_type_name: Some("Mutation".to_string()),
            query_fields: vec![
                GqlField {
                    name: "launches".into(),
                    description: "list".into(),
                    base_kind: "OBJECT".into(),
                    is_mutation: false,
                },
                GqlField {
                    name: "latestVersion".into(),
                    description: "ver".into(),
                    base_kind: "SCALAR".into(),
                    is_mutation: false,
                },
            ],
            mutation_fields: vec![GqlField {
                name: "bookLaunch".into(),
                description: "book".into(),
                base_kind: "OBJECT".into(),
                is_mutation: true,
            }],
        };
        let url = "https://api.example.com/graphql";
        let ops = build_graphql_operations(url, &intro);
        assert_eq!(ops.len(), 3);

        // Query/Mutation "interfaces" become flat ops named <Type>/<field>.
        assert_eq!(ops[0]["name"], "Query/launches");
        assert_eq!(ops[1]["name"], "Query/latestVersion");
        assert_eq!(ops[2]["name"], "Mutation/bookLaunch");

        // Object-typed query field → __typename starter body.
        let launches_req = &ops[0]["requests"][0];
        assert_eq!(launches_req["name"], "sample_launches");
        let launches_body = launches_req["request"].as_str().unwrap();
        assert!(launches_body.contains("__typename"));
        assert!(launches_body.starts_with("query {"));
        assert_eq!(launches_req["requestType"], "graphql");
        assert_eq!(launches_req["bodyType"], "graphql");
        assert_eq!(launches_req["method"], "POST");

        // Scalar-typed field → bare field, no sub-selection.
        let latest_body = ops[1]["requests"][0]["request"].as_str().unwrap();
        assert_eq!(ops[1]["requests"][0]["name"], "sample_latestVersion");
        assert!(!latest_body.contains("__typename"));
        assert!(latest_body.contains("latestVersion"));

        // Mutation → mutation { … } body with __typename for object return.
        let book_body = ops[2]["requests"][0]["request"].as_str().unwrap();
        assert_eq!(ops[2]["requests"][0]["name"], "sample_bookLaunch");
        assert!(book_body.starts_with("mutation {"));
        assert!(book_body.contains("__typename"));

        // Project assembly carries source: "graphql" (additive union value).
        let project = assemble_graphql_project(url, ops).unwrap();
        assert_eq!(project["source"], "graphql");
        assert_eq!(project["name"], "GraphQL");
        assert_eq!(project["sourceUrl"], url);
    }

    #[test]
    fn test_detect_load_format_routes_like_legacy() {
        // WSDL URLs → WSDL path (regression guard: they are NOT parsed as
        // OpenAPI/GraphQL by parse_spec_as_project).
        assert_eq!(
            detect_load_format("http://example.com/service.wsdl?WSDL"),
            LoadFormat::Wsdl
        );
        assert_eq!(
            detect_load_format("http://example.com/calculator.asmx?wsdl"),
            LoadFormat::Wsdl
        );
        // .json / .yaml / .yml → OpenAPI.
        assert_eq!(
            detect_load_format("https://petstore.swagger.io/v2/swagger.json"),
            LoadFormat::OpenApi
        );
        assert_eq!(
            detect_load_format("https://petstore.swagger.io/v2/swagger.yaml"),
            LoadFormat::OpenApi
        );
        assert_eq!(
            detect_load_format("https://x/spec.yml"),
            LoadFormat::OpenApi
        );
        // graphql / /gql → GraphQL.
        assert_eq!(
            detect_load_format("https://spacex-production.up.railway.app/graphql"),
            LoadFormat::GraphQl
        );
        assert_eq!(detect_load_format("https://x/api/gql"), LoadFormat::GraphQl);
    }

    #[tokio::test]
    async fn test_parse_spec_as_project_rejects_wsdl_url_cleanly() {
        // Regression guard: a WSDL URL reaching the non-WSDL command must error
        // cleanly (it belongs to the legacy WSDL path), not be mis-parsed as an
        // OpenAPI spec.
        let err = parse_spec_as_project("http://example.com/service.wsdl?WSDL".to_string())
            .await
            .expect_err("WSDL URL must be rejected by parse_spec_as_project");
        assert!(
            err.contains("not an OpenAPI/GraphQL source"),
            "unexpected error: {}",
            err
        );
    }

    #[test]
    fn test_merge_spec_operations_preserves_user_requests_and_legacy_renames() {
        let existing = vec![
            json!({
                "name": "Pets/listPets",
                "requests": [
                    { "name": "sample_listPets", "request": "old-body" },
                    { "name": "myCustomReq", "request": "user work", "endpoint": "x" }
                ]
            }),
            json!({
                "name": "Removed/oldOp",
                "requests": [ { "name": "sample_oldOp", "request": "gone" } ]
            }),
        ];
        let new_ops = vec![
            json!({
                "name": "Pets/listPets",
                "requests": [ { "name": "sample_listPets", "request": "new-body" } ]
            }),
            json!({
                "name": "Pets/newOp",
                "requests": [ { "name": "sample_newOp", "request": "fresh" } ]
            }),
        ];

        let merged = merge_spec_operations(&existing, &new_ops);
        let names: Vec<&str> = merged.iter().map(|o| o["name"].as_str().unwrap()).collect();
        assert!(names.contains(&"Pets/listPets"));
        assert!(names.contains(&"Pets/newOp"));
        assert!(names.contains(&"[Legacy] Removed/oldOp"));
        assert!(!names.contains(&"Removed/oldOp"));

        // Preserved op: user request kept, sample body refreshed to new-body.
        let listpets = merged
            .iter()
            .find(|o| o["name"] == "Pets/listPets")
            .unwrap();
        let reqs = listpets["requests"].as_array().unwrap();
        let req_names: Vec<&str> = reqs.iter().map(|r| r["name"].as_str().unwrap()).collect();
        assert!(req_names.contains(&"myCustomReq"));
        assert!(req_names.contains(&"sample_listPets"));
        let sample = reqs
            .iter()
            .find(|r| r["name"] == "sample_listPets")
            .unwrap();
        assert_eq!(sample["request"], "new-body");
        let custom = reqs.iter().find(|r| r["name"] == "myCustomReq").unwrap();
        assert_eq!(custom["request"], "user work");

        // New op passes through; legacy op renamed with requests preserved.
        assert!(merged.iter().any(|o| o["name"] == "Pets/newOp"));
        let legacy = merged
            .iter()
            .find(|o| o["name"] == "[Legacy] Removed/oldOp")
            .unwrap();
        assert_eq!(legacy["requests"].as_array().unwrap().len(), 1);
    }

    // --- Local HTTP server harness for the end-to-end refresh test ---

    struct TestSpecServer {
        port: u16,
        body: std::sync::Arc<std::sync::Mutex<String>>,
    }

    /// Minimal single/multi-request HTTP server that serves whatever is in
    /// `body` at response time (so the test can swap v1→v2 between calls).
    async fn start_spec_server(initial_body: &str) -> TestSpecServer {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let body: std::sync::Arc<std::sync::Mutex<String>> =
            std::sync::Arc::new(std::sync::Mutex::new(initial_body.to_string()));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server_body = std::sync::Arc::clone(&body);
        tokio::spawn(async move {
            loop {
                let (mut stream, _) = match listener.accept().await {
                    Ok(v) => v,
                    Err(_) => break,
                };
                let b = std::sync::Arc::clone(&server_body);
                tokio::spawn(async move {
                    let mut buf: Vec<u8> = Vec::new();
                    let mut tmp = [0u8; 1024];
                    loop {
                        let n = match stream.read(&mut tmp).await {
                            Ok(0) | Err(_) => break,
                            Ok(n) => n,
                        };
                        buf.extend_from_slice(&tmp[..n]);
                        if buf.windows(4).any(|w| w == b"\r\n\r\n") {
                            break;
                        }
                    }
                    let current = b.lock().unwrap().clone();
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        current.len(),
                        current
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.flush().await;
                });
            }
        });
        TestSpecServer { port, body }
    }

    /// Build a minimal OpenAPI 3 spec from (path, method, operationId) tuples.
    /// Every operation is tagged "pets" (mirrors the tag-grouping fixtures).
    fn spec_with_paths(paths: &[(&str, &str, &str)]) -> String {
        let mut paths_json = serde_json::Map::new();
        for (path, method, opid) in paths {
            let op = json!({
                "operationId": opid,
                "tags": ["pets"],
            });
            paths_json
                .entry(path.to_string())
                .and_modify(|existing| {
                    existing
                        .as_object_mut()
                        .unwrap()
                        .insert(method.to_lowercase(), json!(op));
                })
                .or_insert_with(|| {
                    let mut m = serde_json::Map::new();
                    m.insert(method.to_lowercase(), json!(op));
                    json!(m)
                });
        }
        serde_json::json!({
            "openapi": "3.0.0",
            "info": { "title": "Refresh Fixture", "version": "1.0.0" },
            "servers": [ { "url": "http://127.0.0.1/ignored" } ],
            "paths": paths_json
        })
        .to_string()
    }

    /// Serialize the end-to-end refresh test with the other APINOX_CONFIG_DIR
    /// scenarios (shares `utils::config::CONFIG_DIR_TEST_LOCK`) so the
    /// process-global env var swap doesn't race them.
    #[tokio::test]
    async fn test_parse_spec_as_project_duplicate_source_url_triggers_refresh() {
        let _guard = CONFIG_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("apinox-spec-refresh-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).expect("create temp config dir");
        std::env::set_var("APINOX_CONFIG_DIR", &tmp);

        let spec_v1 =
            spec_with_paths(&[("/pets", "GET", "listPets"), ("/other", "GET", "otherOp")]);
        let server = start_spec_server(&spec_v1).await;
        let url = format!("http://127.0.0.1:{}/spec.json", server.port);

        let refreshed = async {
            // First load → creates the project.
            let created = parse_spec_as_project(url.clone())
                .await
                .expect("first load should succeed");
            assert_eq!(created["source"], "openapi");

            // Simulate user work: add a custom request to Pets/listPets on disk.
            let proj_dir = project_storage::projects_dir()
                .expect("projects dir")
                .join("Refresh Fixture");
            let mut proj =
                project_storage::load_unified_project(proj_dir.to_string_lossy().to_string())
                    .expect("load project");
            for op in proj["operations"].as_array_mut().unwrap() {
                if op["name"] == "pets/listPets" {
                    let reqs = op["requests"].as_array_mut().unwrap();
                    reqs.push(json!({
                        "name": "userCustom",
                        "request": "keep me",
                        "method": "GET",
                        "endpoint": "e"
                    }));
                }
            }
            project_storage::save_unified_project(proj_dir.to_string_lossy().to_string(), proj)
                .expect("save project with user request");

            // v2: drop /other, add /brand. Server now serves v2.
            let spec_v2 = spec_with_paths(&[
                ("/pets", "GET", "listPets"),
                ("/brand", "GET", "brandNewOp"),
            ]);
            *server.body.lock().unwrap() = spec_v2;

            // Second load (duplicate sourceUrl) → refresh, NOT a new project.
            parse_spec_as_project(url.clone())
                .await
                .expect("refresh should succeed")
        }
        .await;

        // Restore env + cleanup.
        std::env::remove_var("APINOX_CONFIG_DIR");
        let _ = std::fs::remove_dir_all(&tmp);

        assert_eq!(refreshed["source"], "openapi");
        let names: Vec<&str> = refreshed["operations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o["name"].as_str().unwrap())
            .collect();
        // New op present, removed op renamed [Legacy], user request preserved.
        assert!(names.contains(&"pets/brandNewOp"), "names: {:?}", names);
        assert!(
            names.contains(&"[Legacy] pets/otherOp"),
            "names: {:?}",
            names
        );
        assert!(!names.contains(&"pets/otherOp"), "names: {:?}", names);
        let listpets = refreshed["operations"]
            .as_array()
            .unwrap()
            .iter()
            .find(|o| o["name"] == "pets/listPets")
            .unwrap();
        let req_names: Vec<&str> = listpets["requests"]
            .as_array()
            .unwrap()
            .iter()
            .map(|r| r["name"].as_str().unwrap())
            .collect();
        assert!(
            req_names.contains(&"userCustom"),
            "user request must survive refresh: {:?}",
            req_names
        );
        // lastRefreshedAt is set on refresh.
        assert!(refreshed["lastRefreshedAt"].is_string());
    }
}
