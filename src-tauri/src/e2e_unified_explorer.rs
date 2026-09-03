//! Phase 7 (t_eee123bc) — doc §8 manual E2E, automated (headless).
//!
//! This module is the automated equivalent of the doc §8 "manual E2E script"
//! for the branch DoD gate (docs/UNIFIED_EXPLORER_PARITY_DECISION.md §8):
//!
//!   fresh app → load one project per type (SOAP WSDL / OpenAPI REST /
//!   GraphQL) — i.e. one of the six sample cards per type — → run one
//!   operation per type → create a quick request → (simulate an) app restart
//!   → verify the quick request persisted in `scrapbook.json`.
//!
//! It mirrors the repo's update-proxy E2E pattern (docs/UPDATE_PROXY_VERIFICATION.md)
//! and the existing `start_spec_server` harness in `unified_explorer_commands`:
//! it drives the REAL production commands (`parse_wsdl_as_project`,
//! `parse_spec_as_project`, `execute_soap_request`, `execute_rest_request`,
//! and the scrapbook CRUD) against a single mock HTTP server on an ephemeral
//! loopback port, inside a fresh temp `APINOX_CONFIG_DIR` (the "fresh app"
//! precondition). No network egress is required: the six sample APIs are stood
//! in by local routes, so the flow is fully deterministic.
//!
//! **History note.** The webview's history write (`add_history_entry`) takes a
//! `tauri::AppHandle` (a real Wry runtime) that cannot be constructed
//! headlessly, so this Rust test does not drive it. The unified path's call to
//! the *same* global history store with the correct fields — plus the
//! `HistoryUpdate` event — is proven by the webview vitest
//! (`unified_explorer_execute.test.tsx`, `unified_explorer_phase4.test.tsx`),
//! and `history_storage.rs` is byte-identical to the doc baseline (the same
//! store the legacy History view reads). Together those establish the §7
//! criterion "every execution writes a history entry visible in the History
//! view"; this test covers the load/execute/persistence half end-to-end.
//!
//! This module is compiled only under `cargo test` (`#[cfg(test)]`); it is not
//! part of the shipped binary.

#[cfg(test)]
mod e2e {
    use crate::http::commands::execute_rest_request;
    use crate::parsers::unified_explorer_commands::{
        parse_spec_as_project, parse_wsdl_as_project,
    };
    use crate::scrapbook_storage::{
        add_scrapbook_request, delete_scrapbook_request, get_scrapbook,
        update_scrapbook_request,
    };
    use crate::soap::commands::{execute_soap_request, ExecuteSoapRequest};
    use crate::utils::config::CONFIG_DIR_TEST_LOCK;
    use serde_json::json;
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicU16, Ordering};
    use std::sync::Arc;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use uuid::Uuid;

    /// Route handler: `(method, path, body) -> (content_type, response_body)`.
    type RouteFn = Arc<dyn Fn(&str, &str, &str) -> (String, String) + Send + Sync>;

    /// A raw loopback HTTP/1.1 server (no framework) that routes each request
    /// through a caller-supplied closure. Stands in for the six sample APIs
    /// (WSDL/SOAP, OpenAPI, GraphQL, REST) with no network egress. The bound
    /// port is published into `port_out` before any request can arrive, so the
    /// route closure can build absolute URLs (the WSDL's `soap:address` and the
    /// OpenAPI `servers[0].url`) that point back at this same mock.
    async fn start_route_server(port_out: Arc<AtomicU16>, route: RouteFn) -> u16 {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        port_out.store(port, Ordering::Release);

        tokio::spawn(async move {
            loop {
                let (mut stream, _) = match listener.accept().await {
                    Ok(v) => v,
                    Err(_) => break,
                };
                let route = Arc::clone(&route);
                tokio::spawn(async move {
                    let mut buf: Vec<u8> = Vec::new();
                    let mut tmp = [0u8; 8192];
                    // Read until the end of the headers.
                    let head_end = loop {
                        let n = match stream.read(&mut tmp).await {
                            Ok(0) | Err(_) => break None,
                            Ok(n) => n,
                        };
                        buf.extend_from_slice(&tmp[..n]);
                        if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                            break Some(p);
                        }
                        if buf.len() > 8_000_000 {
                            break None;
                        }
                    };
                    let head_end = match head_end {
                        Some(p) => p,
                        None => return,
                    };
                    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
                    let first_line = head.lines().next().unwrap_or("");
                    let mut it = first_line.split_whitespace();
                    let method = it.next().unwrap_or("GET").to_string();
                    let target = it.next().unwrap_or("/").to_string();
                    let path = target.splitn(2, '?').next().unwrap_or("/").to_string();
                    let content_length = head
                        .lines()
                        .find_map(|l| {
                            let (k, v) = l.split_once(':')?;
                            if k.trim().eq_ignore_ascii_case("content-length") {
                                v.trim().parse::<usize>().ok()
                            } else {
                                None
                            }
                        })
                        .unwrap_or(0);
                    // Read the body fully (it may arrive in later segments).
                    let need = head_end + 4 + content_length;
                    while buf.len() < need {
                        let n = match stream.read(&mut tmp).await {
                            Ok(0) | Err(_) => break,
                            Ok(n) => n,
                        };
                        if n == 0 {
                            break;
                        }
                        buf.extend_from_slice(&tmp[..n]);
                    }
                    let body = if content_length > 0 {
                        let end = need.min(buf.len());
                        String::from_utf8_lossy(&buf[head_end + 4..end]).to_string()
                    } else {
                        String::new()
                    };

                    let (ct, resp_body) = route(&method, &path, &body);
                    let response = format!(
                        "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                        ct,
                        resp_body.len(),
                        resp_body
                    );
                    let _ = stream.write_all(response.as_bytes()).await;
                    let _ = stream.flush().await;
                });
            }
        });
        port
    }

    /// A well-formed SOAP 1.1 response envelope (what the mock "service"
    /// returns for a Country-Info `GetCurrencyRate` call).
    fn soap_envelope_response() -> String {
        r#"<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetCurrencyRateResponse xmlns="http://www.oorsprong.org/websamples.countryinfo">
      <GetCurrencyRateResult>1.2345</GetCurrencyRateResult>
    </GetCurrencyRateResponse>
  </soap:Body>
</soap:Envelope>"#
            .to_string()
    }

    /// Minimal OpenAPI 3 spec (Petstore shaped) with a GET + POST on `/pets`,
    /// tagged `pets` so the unified op names become `pets/listPets` /
    /// `pets/addPet` (doc §5.3 tag-grouping). `servers[0].url` is the caller's
    /// mock base so the sample requests' endpoints hit the mock.
    fn petstore_spec(base: &str) -> String {
        json!({
            "openapi": "3.0.0",
            "info": { "title": "Petstore", "version": "1.0.0" },
            "servers": [ { "url": base } ],
            "paths": {
                "/pets": {
                    "get":  { "operationId": "listPets", "tags": ["pets"] },
                    "post": { "operationId": "addPet",   "tags": ["pets"] }
                }
            }
        })
        .to_string()
    }

    /// GraphQL introspection response: a `Query` (launches [object],
    /// latestVersion [scalar]) and a `Mutation` (bookLaunch [object]).
    /// Object-typed fields get a `__typename` starter query; the scalar field
    /// does not.
    fn graphql_introspection_response() -> String {
        json!({
            "data": {
                "__schema": {
                    "queryType": { "name": "Query" },
                    "mutationType": { "name": "Mutation" }
                },
                "query": {
                    "fields": [
                        { "name": "launches", "description": "list",
                          "type": { "kind": "OBJECT" } },
                        { "name": "latestVersion", "description": "ver",
                          "type": { "kind": "SCALAR" } }
                    ]
                },
                "mutation": {
                    "fields": [
                        { "name": "bookLaunch", "description": "book",
                          "type": { "kind": "OBJECT" } }
                    ]
                }
            }
        })
        .to_string()
    }

    /// A plain (non-introspection) GraphQL data response for a `launches`
    /// query.
    fn graphql_data_response() -> String {
        json!({ "data": { "launches": [ { "__typename": "Launch", "id": 1 } ] } })
            .to_string()
    }

    /// The full doc §8 manual E2E, automated. Drives the real production
    /// commands through: fresh app → load one project per type → execute one
    /// operation per type → quick-request persistence across a simulated
    /// restart. Entirely on loopback.
    #[tokio::test]
    async fn test_e2e_unified_explorer_full_flow() {
        let _guard = CONFIG_DIR_TEST_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = std::env::temp_dir().join(format!("apinox-e2e-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&tmp).expect("create temp config dir");
        std::env::set_var("APINOX_CONFIG_DIR", &tmp);

        // The real, self-contained Country-Info WSDL fixture (no imports).
        // Served from the mock so the parse is loopback-only; the execute
        // endpoint is overridden to the mock's SOAP path (the fixture's own
        // <soap:address> is the live oorsprong URL and must NOT be hit).
        let wsdl_fixture = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/wsdl-downloads/CountryInfoService_wso.wsdl"
        ))
        .expect("read the CountryInfo WSDL fixture");
        let wsdl = wsdl_fixture.clone();

        // One mock server for every route; publishes its port before serving.
        let port_holder = Arc::new(AtomicU16::new(0));
        let ph = Arc::clone(&port_holder);
        let route: RouteFn = Arc::new(move |method, path, body| {
            let port = ph.load(Ordering::Acquire);
            let base = format!("http://127.0.0.1:{}", port);
            if path == "/CountryInfoService.wso" && method == "GET" {
                ("text/xml".to_string(), wsdl.clone())
            } else if path == "/soap/CountryInfo" && method == "POST" {
                ("text/xml".to_string(), soap_envelope_response())
            } else if path == "/petstore/spec.json" && method == "GET" {
                ("application/json".to_string(), petstore_spec(&base))
            } else if path == "/pets" && method == "GET" {
                (
                    "application/json".to_string(),
                    r#"{"ok":true,"pets":[{"id":1,"name":"Rex"}]}"#.to_string(),
                )
            } else if path == "/pets" && method == "POST" {
                (
                    "application/json".to_string(),
                    r#"{"ok":true,"created":"rex"}"#.to_string(),
                )
            } else if path == "/graphql" && method == "POST" {
                if body.contains("__schema") {
                    ("application/json".to_string(), graphql_introspection_response())
                } else {
                    ("application/json".to_string(), graphql_data_response())
                }
            } else {
                ("application/json".to_string(), r#"{"error":"not found"}"#.to_string())
            }
        });
        let port = start_route_server(Arc::clone(&port_holder), route).await;
        let base = format!("http://127.0.0.1:{}", port);

        // ── Fresh app precondition ──────────────────────────────────────────
        assert!(
            get_scrapbook().await.unwrap().is_empty(),
            "a fresh app must start with an empty scrapbook"
        );

        // ── Sample card #3: Country Info (SOAP WSDL) ────────────────────────
        let load_id = Uuid::new_v4().to_string();
        let wsdl_url = format!("{}/CountryInfoService.wso", base);
        let wsdl_project = parse_wsdl_as_project(wsdl_url, Some(false), Some(load_id))
            .await
            .expect("WSDL load should succeed");
        assert_eq!(wsdl_project["source"], "wsdl");
        assert!(
            wsdl_project["operations"].as_array().unwrap().len() >= 1,
            "the Country-Info WSDL should yield ≥1 operation"
        );

        // Pick an operation whose sample request carries a real SOAP envelope
        // (non-empty `request` ⇒ the parser built `full_schema`).
        let ops = wsdl_project["operations"].as_array().unwrap();
        let op = ops
            .iter()
            .find(|o| {
                o["requests"]
                    .as_array()
                    .unwrap()
                    .first()
                    .map(|r| r["request"].as_str().unwrap_or("").len() > 0)
                    .unwrap_or(false)
            })
            .expect("at least one operation should have a real sample envelope");
        let req = &op["requests"][0];
        let raw_xml = req["request"].as_str().unwrap().to_string();
        let soap_action_endpoint = format!("{}/soap/CountryInfo", base);

        // Execute the one SOAP operation (R-02 `rawXml` path). The operation
        // object is built exactly the way `executeOperation.ts` builds it (real
        // resolved owner fields; `output`/`description`/`portName` stubbed).
        let soap_req: ExecuteSoapRequest = serde_json::from_value(json!({
            "operation": {
                "name": op["name"],
                "action": op["action"],
                "input": op["input"],
                "output": {},
                "targetNamespace": op["targetNamespace"],
                "originalEndpoint": soap_action_endpoint.clone(),
                "fullSchema": op["fullSchema"],
                "description": null,
                "portName": null
            },
            "soapVersion": "1.1",
            "endpoint": soap_action_endpoint,
            "rawXml": raw_xml
        }))
        .expect("ExecuteSoapRequest deserializes from the parsed operation");
        let soap_resp = execute_soap_request(soap_req)
            .await
            .expect("SOAP execute should not error");
        assert!(soap_resp.success, "SOAP execute should succeed");
        assert_eq!(soap_resp.status_code, 200);
        assert!(
            soap_resp.raw_xml.contains("Envelope"),
            "SOAP response should be a well-formed envelope: {}",
            soap_resp.raw_xml
        );
        assert!(
            soap_resp.raw_xml.contains("GetCurrencyRateResult"),
            "SOAP response should carry the mock result: {}",
            soap_resp.raw_xml
        );

        // ── Sample card #1: Swagger Petstore (OpenAPI / REST) ───────────────
        let openapi_url = format!("{}/petstore/spec.json", base);
        let openapi_project = parse_spec_as_project(openapi_url)
            .await
            .expect("OpenAPI load should succeed");
        assert_eq!(openapi_project["source"], "openapi");
        let op_names: Vec<&str> = openapi_project["operations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o["name"].as_str().unwrap())
            .collect();
        assert!(op_names.contains(&"pets/listPets"), "ops: {:?}", op_names);
        assert!(op_names.contains(&"pets/addPet"), "ops: {:?}", op_names);

        let listpets = openapi_project["operations"]
            .as_array()
            .unwrap()
            .iter()
            .find(|o| o["name"] == "pets/listPets")
            .unwrap();
        let rp = &listpets["requests"][0];
        assert_eq!(rp["requestType"], "rest");
        let rest_endpoint = rp["endpoint"].as_str().unwrap().to_string();
        // The sample request's endpoint must be derived from the spec's
        // servers[0].url (base) + path — i.e. it points at the mock.
        assert_eq!(rest_endpoint, format!("{}/pets", base));

        let headers: HashMap<String, String> = HashMap::from([
            ("Content-Type".to_string(), "application/json".to_string()),
            ("Accept".to_string(), "application/json".to_string()),
        ]);
        // A REST GET executes and returns the mock response (doc §7: "Petstore
        // GET … execute from the unified view and return the response").
        let rest_get = execute_rest_request(
            "GET".to_string(),
            rest_endpoint.clone(),
            headers.clone(),
            None,
            Some(Uuid::new_v4().to_string()),
        )
        .await
        .expect("REST GET should not error");
        assert!(rest_get.success, "REST GET should succeed");
        assert_eq!(rest_get.status, 200);
        assert!(rest_get.body.contains("Rex"), "body: {}", rest_get.body);
        // A REST POST with a JSON body also executes (doc §7).
        let rest_post = execute_rest_request(
            "POST".to_string(),
            rest_endpoint,
            headers.clone(),
            Some(r#"{"name":"rex"}"#.to_string()),
            Some(Uuid::new_v4().to_string()),
        )
        .await
        .expect("REST POST should not error");
        assert!(rest_post.success, "REST POST should succeed");
        assert!(
            rest_post.body.contains("created"),
            "body: {}",
            rest_post.body
        );

        // ── Sample card #5: SpaceX (GraphQL) ────────────────────────────────
        let gql_url = format!("{}/graphql", base);
        let gql_project = parse_spec_as_project(gql_url.clone())
            .await
            .expect("GraphQL load should succeed");
        assert_eq!(gql_project["source"], "graphql");
        let gql_op_names: Vec<&str> = gql_project["operations"]
            .as_array()
            .unwrap()
            .iter()
            .map(|o| o["name"].as_str().unwrap())
            .collect();
        assert!(
            gql_op_names.contains(&"Query/launches"),
            "ops: {:?}",
            gql_op_names
        );
        assert!(
            gql_op_names.contains(&"Mutation/bookLaunch"),
            "ops: {:?}",
            gql_op_names
        );
        let launches = gql_project["operations"]
            .as_array()
            .unwrap()
            .iter()
            .find(|o| o["name"] == "Query/launches")
            .unwrap();
        let gr = &launches["requests"][0];
        assert_eq!(gr["requestType"], "graphql");
        let raw_query = gr["request"].as_str().unwrap().to_string();
        // Object-typed query field → `__typename` starter (doc §5.3).
        assert!(raw_query.contains("__typename"), "query: {}", raw_query);
        // Execute it the way the webview does: wrap the raw query as
        // {"query": …} (legacy bridge / buildRestGraphQlInvokeArgs rule).
        let wrapped = json!({ "query": raw_query }).to_string();
        let gql_resp = execute_rest_request(
            "POST".to_string(),
            gql_url.clone(),
            headers.clone(),
            Some(wrapped),
            Some(Uuid::new_v4().to_string()),
        )
        .await
        .expect("GraphQL execute should not error");
        assert!(gql_resp.success, "GraphQL execute should succeed");
        assert_eq!(gql_resp.status, 200);
        assert!(
            gql_resp.body.contains("__typename"),
            "body: {}",
            gql_resp.body
        );

        // ── Quick request: create → update → restart → persisted ───────────
        // (doc §8: "create a quick request → restart the app → verify the
        // quick request persisted in scrapbook.json".)
        let added = add_scrapbook_request(json!({
            "id": "qr-1",
            "name": "Quick GetCurrencyRate",
            "request": raw_xml.clone(),
            "requestType": "soap",
            "method": "POST",
            "bodyType": "xml",
            "endpoint": soap_action_endpoint.clone(),
            "headers": { "Content-Type": "text/xml" }
        }))
        .await
        .expect("add_scrapbook_request should not error");
        assert_eq!(added.len(), 1);
        assert!(added[0]["createdAt"].is_string(), "add stamps createdAt");
        assert!(added[0]["lastModified"].is_string(), "add stamps lastModified");

        let updated = update_scrapbook_request(
            "qr-1".to_string(),
            json!({ "name": "Quick QR v2" }),
        )
        .await
        .expect("update_scrapbook_request should not error");
        let u = updated.iter().find(|r| r["id"] == "qr-1").unwrap();
        assert_eq!(u["name"], "Quick QR v2");

        // "Restart the app" = a fresh read of the store.
        let reloaded = get_scrapbook().await.expect("get_scrapbook should not error");
        assert_eq!(reloaded.len(), 1, "the quick request must survive restart");
        assert_eq!(reloaded[0]["name"], "Quick QR v2");
        // And the on-disk `scrapbook.json` carries it (schema preserved).
        let on_disk =
            std::fs::read_to_string(tmp.join("scrapbook.json")).expect("read scrapbook.json");
        assert!(
            on_disk.contains("Quick QR v2"),
            "scrapbook.json must contain the persisted quick request"
        );

        // Cleanup: delete (verifies delete + that the store empties again).
        let deleted = delete_scrapbook_request("qr-1".to_string())
            .await
            .expect("delete_scrapbook_request should not error");
        assert!(deleted.is_empty());

        // Restore env + cleanup the temp dir.
        std::env::remove_var("APINOX_CONFIG_DIR");
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
