use std::fs;
use std::path::PathBuf;

/// Scrapbook state — stores requests as raw JSON to preserve all frontend fields
#[derive(Debug, serde::Serialize, serde::Deserialize, Default)]
struct ScrapbookState {
    requests: Vec<serde_json::Value>,
}

/// Get path to scrapbook.json file
fn get_scrapbook_path() -> Result<PathBuf, String> {
    let config_dir = std::env::var("APINOX_CONFIG_DIR")
        .ok()
        .and_then(|dir| if dir.trim().is_empty() { None } else { Some(PathBuf::from(dir)) })
        .or_else(|| {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .ok()?;
            Some(PathBuf::from(home).join(".apinox"))
        })
        .ok_or("Could not determine config directory")?;

    // Ensure directory exists
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    Ok(config_dir.join("scrapbook.json"))
}

/// Load scrapbook from disk
fn load_scrapbook(scrapbook_path: &PathBuf) -> ScrapbookState {
    if !scrapbook_path.exists() {
        return ScrapbookState::default();
    }

    match fs::read_to_string(scrapbook_path) {
        Ok(content) => match serde_json::from_str(&content) {
            Ok(data) => data,
            Err(e) => {
                log::error!("Failed to parse scrapbook file: {}. Starting with empty scrapbook.", e);
                ScrapbookState::default()
            }
        },
        Err(e) => {
            log::error!("Failed to read scrapbook file: {}. Starting with empty scrapbook.", e);
            ScrapbookState::default()
        }
    }
}

/// Save scrapbook to disk
fn save_scrapbook(scrapbook_path: &PathBuf, data: &ScrapbookState) -> Result<(), String> {
    let content = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize scrapbook: {}", e))?;
    
    fs::write(scrapbook_path, content)
        .map_err(|e| format!("Failed to write scrapbook file: {}", e))?;
    
    log::info!("Saved scrapbook with {} request(s)", data.requests.len());
    Ok(())
}

/// Get all scrapbook requests
#[tauri::command]
pub async fn get_scrapbook() -> Result<Vec<serde_json::Value>, String> {
    let scrapbook_path = get_scrapbook_path()?;
    let data = load_scrapbook(&scrapbook_path);
    Ok(data.requests)
}

/// Add a new request to scrapbook
#[tauri::command]
pub async fn add_scrapbook_request(request: serde_json::Value) -> Result<Vec<serde_json::Value>, String> {
    let scrapbook_path = get_scrapbook_path()?;
    let mut data = load_scrapbook(&scrapbook_path);

    let mut req = request;
    let now = chrono::Utc::now().to_rfc3339();
    if req.get("createdAt").is_none() {
        req["createdAt"] = serde_json::Value::String(now.clone());
    }
    req["lastModified"] = serde_json::Value::String(now);

    data.requests.push(req);
    save_scrapbook(&scrapbook_path, &data)?;
    Ok(data.requests)
}

/// Update an existing scrapbook request (merges fields)
#[tauri::command]
pub async fn update_scrapbook_request(
    id: String,
    updates: serde_json::Value,
) -> Result<Vec<serde_json::Value>, String> {
    let scrapbook_path = get_scrapbook_path()?;
    let mut data = load_scrapbook(&scrapbook_path);

    let req = data.requests.iter_mut()
        .find(|r| r.get("id").and_then(|v| v.as_str()) == Some(&id))
        .ok_or_else(|| format!("Request with id {} not found", id))?;

    if let (serde_json::Value::Object(req_map), serde_json::Value::Object(updates_map)) = (req, &updates) {
        for (k, v) in updates_map {
            req_map.insert(k.clone(), v.clone());
        }
        req_map.insert("lastModified".to_string(), serde_json::Value::String(chrono::Utc::now().to_rfc3339()));
    }

    save_scrapbook(&scrapbook_path, &data)?;
    Ok(data.requests)
}

/// Delete a scrapbook request
#[tauri::command]
pub async fn delete_scrapbook_request(id: String) -> Result<Vec<serde_json::Value>, String> {
    let scrapbook_path = get_scrapbook_path()?;
    let mut data = load_scrapbook(&scrapbook_path);

    data.requests.retain(|r| r.get("id").and_then(|v| v.as_str()) != Some(&id));
    save_scrapbook(&scrapbook_path, &data)?;
    Ok(data.requests)
}

// ============================================================================
// Tests — scrapbook.json schema round-trip (frozen schema; existing scrapbooks
// must load unchanged).
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::config::CONFIG_DIR_TEST_LOCK;
    use serde_json::json;
    use uuid::Uuid;

    /// A realistic scrapbook.json fixture: ≥3 requests including one REST
    /// request, with the full field set the frontend persists (schema FROZEN —
    /// this is the shape existing users' files carry; round-trip must preserve
    /// every field byte-for-byte through serde_json::Value passthrough).
    fn fixture_scrapbook() -> serde_json::Value {
        json!({
            "requests": [
                {
                    "id": "scrap-1",
                    "name": "GetCurrencyRate",
                    "request": "<GetCurrencyRate xmlns=\"http://www.oorsprong.org/websamples.countryinfo\">\n  <sCCode>US</sCCode>\n</GetCurrencyRate>",
                    "requestType": "soap",
                    "method": "POST",
                    "bodyType": "xml",
                    "contentType": "text/xml",
                    "headers": { "Content-Type": "text/xml" },
                    "endpoint": "http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso",
                    "createdAt": "2026-01-02T10:00:00.000Z",
                    "lastModified": "2026-01-03T11:30:00.000Z"
                },
                {
                    "id": "scrap-2",
                    "name": "ListDogs",
                    "request": "{\"limit\": 5}",
                    "requestType": "rest",
                    "method": "GET",
                    "bodyType": "json",
                    "contentType": "application/json",
                    "headers": { "Accept": "application/json" },
                    "endpoint": "https://dogapi.example.com/v1/dogs",
                    "queryParams": { "limit": "5", "format": "json" },
                    "restConfig": { "authType": "none" },
                    "createdAt": "2026-02-01T08:15:00.000Z",
                    "lastModified": "2026-02-02T09:00:00.000Z"
                },
                {
                    "id": "scrap-3",
                    "name": "SpaceshipQuery",
                    "request": "query { launches { id name } }",
                    "requestType": "graphql",
                    "method": "POST",
                    "bodyType": "graphql",
                    "contentType": "application/json",
                    "headers": { "Content-Type": "application/json" },
                    "endpoint": "https://spacex.example.com/graphql",
                    "createdAt": "2026-03-05T14:00:00.000Z",
                    "lastModified": "2026-03-06T15:45:30.123Z"
                },
                {
                    "id": "scrap-4",
                    "name": "Calculator Add",
                    "request": "<Add xmlns=\"http://tempuri.org/\">\n  <intA>1</intA>\n  <intB>2</intB>\n</Add>",
                    "requestType": "soap",
                    "method": "POST",
                    "bodyType": "xml",
                    "contentType": "application/soap+xml",
                    "headers": { "Content-Type": "application/soap+xml" },
                    "endpoint": "http://www.dneonline.com/calculator.asmx",
                    "createdAt": "2026-04-10T12:00:00.000Z",
                    "lastModified": "2026-04-11T13:00:00.000Z"
                }
            ]
        })
    }

    /// Test helper: hold the process-wide config-dir lock, redirect
    /// APINOX_CONFIG_DIR to a fresh temp dir, write `scrapbook.json` with the
    /// given content (or none). The guard must be held until the end of the
    /// test.
    struct ScrapbookTestEnv {
        _guard: std::sync::MutexGuard<'static, ()>,
        dir: std::path::PathBuf,
    }

    impl ScrapbookTestEnv {
        fn new(dir_name: &str, initial_content: Option<&str>) -> Self {
            // Shared process-wide lock (same as unified_explorer_commands /
            // updater tests) — APINOX_CONFIG_DIR is process-global.
            let _guard = CONFIG_DIR_TEST_LOCK
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            let dir = std::env::temp_dir().join(format!(
                "apinox-scrapbook-test-{}-{}",
                dir_name,
                Uuid::new_v4()
            ));
            std::fs::create_dir_all(&dir).expect("create temp config dir");
            std::env::set_var("APINOX_CONFIG_DIR", &dir);
            if let Some(content) = initial_content {
                std::fs::write(dir.join("scrapbook.json"), content)
                    .expect("write scrapbook fixture");
            }
            Self { _guard, dir }
        }

        fn scrapbook_path(&self) -> std::path::PathBuf {
            self.dir.join("scrapbook.json")
        }
    }

    /// Schema round-trip: a fixture of ≥3 requests (incl. one REST) written to
    /// disk is loaded back UNCHANGED — every field and value preserved
    /// (frozen-schema guarantee; raw JSON passthrough).
    #[tokio::test]
    async fn test_scrapbook_schema_round_trip_fixture_loads_unchanged() {
        let fixture = fixture_scrapbook();
        let env =
            ScrapbookTestEnv::new("roundtrip", Some(&serde_json::to_string(&fixture).unwrap()));

        let requests = get_scrapbook()
            .await
            .expect("get_scrapbook should not error");
        assert_eq!(requests.len(), 4, "fixture has 4 requests");

        // Deep-equal: the loaded requests must be identical to the fixture —
        // no field dropped, renamed, or re-ordered (schema is frozen).
        let expected: Vec<serde_json::Value> = fixture["requests"]
            .as_array()
            .unwrap()
            .iter()
            .cloned()
            .collect();
        assert_eq!(
            requests, expected,
            "round-tripped requests must equal the fixture"
        );

        // Spot-check the REST request specifically (the acceptance fixture
        // requirement: ≥3 requests incl. one REST).
        let rest = requests
            .iter()
            .find(|r| r["requestType"] == "rest")
            .expect("REST request present");
        assert_eq!(rest["id"], "scrap-2");
        assert_eq!(rest["method"], "GET");
        assert_eq!(rest["queryParams"]["limit"], "5");
        assert_eq!(rest["restConfig"]["authType"], "none");
        assert_eq!(rest["endpoint"], "https://dogapi.example.com/v1/dogs");

        // The on-disk file is also unchanged (get_scrapbook is read-only).
        let on_disk = serde_json::from_str::<serde_json::Value>(
            &std::fs::read_to_string(env.scrapbook_path()).unwrap(),
        )
        .unwrap();
        assert_eq!(
            on_disk, fixture,
            "scrapbook.json file must be untouched by a load"
        );
    }

    /// CRUD round-trip: add / update / delete each re-persist the file in the
    /// same schema, preserving all other entries and their fields.
    #[tokio::test]
    async fn test_scrapbook_add_update_delete_preserve_schema() {
        let fixture = fixture_scrapbook();
        let env = ScrapbookTestEnv::new("crud", Some(&serde_json::to_string(&fixture).unwrap()));

        // ADD — appends a new entry; existing entries untouched.
        let new_entry = json!({
            "id": "scrap-5",
            "name": "New Quick Request",
            "request": "<New/>",
            "requestType": "soap",
            "method": "POST",
            "bodyType": "xml",
            "endpoint": "http://example.com/new",
        });
        let after_add = add_scrapbook_request(new_entry.clone()).await.expect("add");
        assert_eq!(after_add.len(), 5);
        let added = after_add
            .iter()
            .find(|r| r["id"] == "scrap-5")
            .expect("added entry present");
        assert!(added["createdAt"].is_string(), "add stamps createdAt");
        assert!(added["lastModified"].is_string(), "add stamps lastModified");
        // Pre-existing entries keep their original timestamps (untouched).
        let first = after_add.iter().find(|r| r["id"] == "scrap-1").unwrap();
        assert_eq!(first["lastModified"], "2026-01-03T11:30:00.000Z");

        // UPDATE — merges fields into the REST entry; other fields/entries kept.
        let after_update = update_scrapbook_request(
            "scrap-2".to_string(),
            json!({ "endpoint": "https://dogapi.example.com/v2/dogs", "name": "ListDogs v2" }),
        )
        .await
        .expect("update");
        assert_eq!(after_update.len(), 5);
        let updated = after_update.iter().find(|r| r["id"] == "scrap-2").unwrap();
        assert_eq!(updated["endpoint"], "https://dogapi.example.com/v2/dogs");
        assert_eq!(updated["name"], "ListDogs v2");
        assert_eq!(
            updated["queryParams"]["limit"], "5",
            "unlisted fields preserved"
        );
        assert_eq!(updated["requestType"], "rest");
        assert!(
            updated["lastModified"].is_string(),
            "update stamps lastModified"
        );

        // DELETE — removes only the target; the rest round-trips unchanged.
        let after_delete = delete_scrapbook_request("scrap-3".to_string())
            .await
            .expect("delete");
        assert_eq!(after_delete.len(), 4);
        assert!(after_delete.iter().all(|r| r["id"] != "scrap-3"));

        // Final file re-loads clean and matches the in-memory state exactly
        // (survives restart; schema unchanged).
        let reloaded = get_scrapbook().await.expect("reload");
        assert_eq!(
            reloaded, after_delete,
            "reloaded scrapbook must equal post-CRUD state"
        );
        let reloaded_json = serde_json::from_str::<serde_json::Value>(
            &std::fs::read_to_string(env.scrapbook_path()).unwrap(),
        )
        .unwrap();
        let reloaded_requests: Vec<serde_json::Value> = reloaded_json["requests"]
            .as_array()
            .unwrap()
            .iter()
            .cloned()
            .collect();
        assert_eq!(reloaded_requests, reloaded);
    }

    /// Missing scrapbook.json → empty state, no error (acceptance criterion:
    /// corrupt/missing → empty state, no crash).
    #[tokio::test]
    async fn test_missing_scrapbook_returns_empty() {
        let env = ScrapbookTestEnv::new("missing", None);
        assert!(!env.scrapbook_path().exists());
        let requests = get_scrapbook().await.expect("get_scrapbook must not error");
        assert!(requests.is_empty());
    }

    /// Corrupt scrapbook.json → empty state, no error, and the corrupt file is
    /// left in place (not clobbered on read).
    #[tokio::test]
    async fn test_corrupt_scrapbook_returns_empty() {
        let env = ScrapbookTestEnv::new("corrupt", Some("{ this is not valid json ]"));
        let requests = get_scrapbook().await.expect("get_scrapbook must not error");
        assert!(requests.is_empty());
        // Read path never writes the file back.
        let still_corrupt = std::fs::read_to_string(env.scrapbook_path()).unwrap();
        assert_eq!(still_corrupt, "{ this is not valid json ]");
    }
}
