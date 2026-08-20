# APInox Codebase Fix Plan

## Fix 1: CRITICAL — No body size limit in proxy and mock servers

**Files to modify:**
- `src-tauri/src/proxy_models.rs` — add `max_body_bytes: Option<u64>` to `ProxyConfig`
- `src-tauri/src/proxy/server.rs:340-380` — wrap `req.collect().await` with a capped-stream reader that spools to a tempfile if the limit is exceeded
- `src-tauri/src/mock/server.rs:79-86` — same capped-stream + spool-to-disk pattern for `req.collect().await`
- `src-tauri/src/commands/proxy_server.rs:41-47` — populate the new config field
- `src-tauri/webview/src/` — (optional UI follow-up) settings panel toggle + numeric input

**Approach:**
1. Add `max_body_bytes: Option<u64>` to `ProxyConfig` with a default of `None` (unlimited) to avoid breaking existing setups.
2. In `proxy/server.rs` and `mock/server.rs`, replace `req.collect().await` with a helper that reads from a `tokio::io::BufReader` wrapping the request body:
   - Read bytes into an in-memory buffer up to the configured limit.
   - If the limit is hit, open a temp file (in a known temp dir, e.g. `/tmp/apinox-spool/`) via `tokio::fs::File` and stream the remaining body to disk.
   - Return a `SpooledBody { prefix: Bytes, overflow_file: Option<PathBuf> }` enum that callers read via a unified `AsyncRead` impl.
3. On the UI side, expose the setting in the proxy/mock configuration panel.

**Estimated effort:** M (4–6 hours)
**Dependencies:** None
**Risk:** Medium — touching the hot request path; needs careful integration testing with large uploads.

---

## Fix 2: BUG — Variable substitution ordering

**File to modify:** `src-tauri/src/utils/template.rs`

**Approach:**
Replace the `for (key, value) in variables` loop (which iterates `HashMap` in arbitrary order) with:
```rust
let mut sorted_keys: Vec<&String> = variables.keys().collect();
sorted_keys.sort_by(|a, b| b.len().cmp(&a.len())); // longest first
for key in sorted_keys {
    let value = &variables[key];
    // ... existing replacement logic ...
}
```
This ensures `fooBar` is substituted before `foo`, preventing partial matches.

**Estimated effort:** S (30 min)
**Dependencies:** None
**Risk:** Low — fully self-contained, easy to add a unit test.

---

## Fix 3: BUG — Missing bounds check in performance run updates

**File to modify:** `src-tauri/src/performance/commands.rs:385`

**Approach:**
Copy the pattern from `testing/commands.rs:401-402`:
```rust
let safe_index = from_index.min(data.updates.len());
let updates = data.updates[safe_index..].to_vec();
let next_index = safe_index + updates.len();
```
Also add the same cleanup that testing has (see Fix 10).

**Estimated effort:** S (15 min)
**Dependencies:** Fix 10 (combined cleanup)
**Risk:** Low — straightforward defensive programming.

---

## Fix 4: MAJOR — Silently dropped panics from tokio::spawn

**Files to modify:**
- `src-tauri/src/proxy/server.rs:75` and `:144` — accept loop + MITM tunnel
- `src-tauri/src/testing/commands.rs:109` and `:278` — test case runner + test suite runner

**Already handled:** `commands/proxy_server.rs:55` and `commands/mock_server.rs:40` store `abort_handle` but still drop the `JoinHandle`; fix the same way.

**Approach:**
Option A (recommended): spawn a lightweight monitor task that awaits each `JoinHandle` and logs errors:
```rust
let handle = tokio::spawn(async move { /* original work */ });
tokio::spawn(async move {
    if let Err(e) = handle.await {
        log::error!("[module] Background task panicked: {:?}", e);
    }
});
```
Option B: for the proxy accept loop (server.rs:75) and MITM tunnel (server.rs:144), use `tokio::task::JoinSet` which collects join results.
The abort handles already stored in `proxy_server.rs` and `mock_server.rs` should also be matched with a monitor task.

**Estimated effort:** M (3–4 hours)
**Dependencies:** None
**Risk:** Low — purely additive logging/monitoring.

---

## Fix 5: SECURITY — Shell injection in macOS updater

**File to modify:** `src-tauri/src/updater.rs:619-646`

**Approach:**
Replace the `format!()` bash script with direct process execution using `std::process::Command`:
```rust
let mut child = std::process::Command::new("sh")
    .arg("-c")
    .arg(&script)  // still uses shell interpolation
    .spawn()?;
```
Better approach: avoid shell entirely by executing individual commands:
```rust
std::thread::sleep(Duration::from_secs(2));
std::fs::remove_dir_all(&app_bundle_str)?;
std::fs::rename(&temp_app_str, &app_bundle_str)?;
std::process::Command::new("open").arg(&app_bundle_str).spawn()?;
```
Wrap in a detached child process that survives parent exit (use `process::Command` with `std::process::Stdio::null()` for stdin/out/err, no shell at all).

**Estimated effort:** S (1 hour)
**Dependencies:** None
**Risk:** Medium — macOS app update flow; must test on macOS that the detached process works.

---

## Fix 6: SECURITY — Plaintext AES key storage

**File to modify:** `src-tauri/src/secret_storage.rs:40-96`

**Approach:**
Add a prominent `#![warn(...)]` level comment at the top of `get_or_create_key()`:
```rust
/// SECURITY: The AES-256 encryption key is stored as hex at ~/.apinox/.key (chmod 600).
/// This is NOT a secure hardware-backed key. An attacker with filesystem access can read it.
/// FUTURE: Integrate with OS keychain via `tauri-plugin-keystore` or `keyring` crate for
/// hardware-backed storage where available.
```
Optionally, add conditional compilation for Linux (`secret-service` crate via dbus), macOS (`security` keychain via `security-framework`), and Windows (DPAPI via `windows-rs`). But the minimum viable fix is the warning comment.

**Estimated effort:** S (1 hour) for comment; L (2–3 days) for full OS keychain integration
**Dependencies:** None
**Risk:** Low for comment-only; Medium for keychain integration (platform-specific bugs).

---

## Fix 7: SECURITY — Permanent TLS certificate bypass in SOAP client

**Files to modify:**
- `src-tauri/src/soap/client.rs:64` — make `danger_accept_invalid_certs` conditional
- `src-tauri/src/soap/client.rs` — add parameter to `with_proxy()` and struct
- `src-tauri/webview/src/components/RequestEditor.tsx` — expose UI toggle

**Approach:**
1. Change `SoapClient::with_proxy` to accept an `allow_invalid_certs: bool` parameter.
2. When `true`, keep the current behavior. When `false`, remove `.danger_accept_invalid_certs(true)`.
3. Wire the toggle through the `SoapRequest` struct and `execute_request` Tauri command.
4. Add a checkbox in the request editor UI (near proxy settings) labeled "Accept invalid TLS certificates" that defaults to `false` except when proxy MITM is active.

**Estimated effort:** M (3–4 hours)
**Dependencies:** None
**Risk:** Low — opt-in flag, backward compatible.

---

## Fix 8: ARCH — ReplacerService uses `std::sync::Mutex` in async context

**Files to modify:**
- `src-tauri/src/replacer/service.rs:3,13` — change `std::sync::Mutex` to `tokio::sync::Mutex`
- `src-tauri/src/proxy/server.rs` — all call sites (lines ~249, ~450) that do `replacer.lock().unwrap()` must become `replacer.lock().await`
- Any other file that calls `.lock().unwrap()` on a `SharedReplacerService`

**Approach:**
1. In `replacer/service.rs`, replace `use std::sync::Mutex` with `use tokio::sync::Mutex`.
2. Audit all call sites with: `rg "replacer.*lock\(\)\.unwrap\(\)" src-tauri/src/`
3. Update each call site to `.lock().await` (the `await` unwraps internally since `tokio::sync::Mutex::lock()` is infallible).
4. If any call site is in a non-async context, wrap in `tokio::task::block_in_place` + `block_on`.

**Estimated effort:** M (2–3 hours)
**Dependencies:** None
**Risk:** Medium — touching all proxy request paths; must verify no deadlocks across `.await` points.

---

## Fix 9: PERF — Recreate reqwest::Client per request

**Files to modify:**
- `src-tauri/src/http/client.rs:38-128` — introduce a shared client cache
- `src-tauri/src/proxy/server.rs:359-368` — reuse a module-level client

**Approach:**
1. **`http/client.rs`**: Add a `Lazy<Mutex<HashMap<ClientKey, Client>>>` that caches clients keyed by `(timeout, follow_redirects, verify_ssl, proxy_url)`. On each request, look up or create once and cache. Use interior mutability with `Arc<Mutex<...>>`.
   - Alternative: if the number of distinct configurations is small (which it is — typically just "default" vs "with proxy"), pre-create two clients.
2. **`proxy/server.rs`**: Replace the per-request `Client::builder()` with a `Lazy<Client>` or `OnceCell<Client>` at the module level.

**Estimated effort:** M (3–4 hours)
**Dependencies:** None
**Risk:** Low — performance improvement, no behavioral change. Validate that reused clients handle connection pooling correctly for multiple target hosts.

---

## Fix 10: BUG — Perf run store memory leak

**File to modify:** `src-tauri/src/performance/commands.rs` — `get_performance_run_updates()`

**Approach:**
Add the same cleanup logic as `testing/commands.rs:413-416`:
```rust
let store = PERF_RUN_STORE.lock().unwrap();
if let Some(data) = store.get(&run_id) {
    let safe_index = from_index.min(data.updates.len());
    let updates = data.updates[safe_index..].to_vec();
    let next_index = safe_index + updates.len();
    let done = data.done;
    let error = data.error.clone();
    drop(data); // or keep guard, then:
    if done && next_index >= store.get(&run_id).map(|d| d.updates.len()).unwrap_or(0) {
        store.remove(&run_id);
    }
} ...
```
Better: lock once, get what you need, then remove:
```rust
let mut store = PERF_RUN_STORE.lock().unwrap();
if let Some(data) = store.get(&run_id) {
    let safe_index = from_index.min(data.updates.len());
    let updates: Vec<serde_json::Value> = data.updates[safe_index..].to_vec();
    let next_index = safe_index + updates.len();
    let done = data.done;
    let error = data.error.clone();
    if done && next_index >= data.updates.len() {
        store.remove(&run_id);
    }
    // return response...
}
```

**Estimated effort:** S (20 min)
**Dependencies:** Fix 3 (same function)
**Risk:** Low — same pattern already proven in testing module.

---

## Fix 11: BUG — Concurrent variable extraction not visible across chunks

**File to modify:** `src-tauri/src/performance/commands.rs:291-297`

**Approach:**
The problem: inside the `for chunk in requests.chunks(concurrency)` loop, each chunk clones `variables` into `chunk_vars` at chunk start. Tasks within the chunk see the same snapshot, but extracted variables from chunk N are only merged back via `variables.entry(...).or_insert_with(...)` after chunk N finishes. Chunk N+1 gets a fresh clone with the updated `variables`, which is correct for sequential chunks. However, tasks _within_ chunk N that run concurrently may miss each other's extracted variables.

The fix: after each individual task join inside a chunk, merge extracted variables back into `variables` immediately (not just after the chunk). But this requires restructuring — the current code merges after all handles joined:
```rust
for handle in handles {
    match handle.await {
        Ok(result) => {
            if let Some(ref extracted) = result.extracted_values {
                for (k, v) in extracted {
                    variables.entry(k.clone()).or_insert_with(|| v.clone());
                }
            }
            if !is_warmup { all_results.push(result); }
        }
        ...
    }
}
```
This is already correct per-task. The issue is a design limitation: concurrent tasks within the same chunk cannot see each other's extracted variables because they cloned before spawning. If cross-task visibility is desired, use `Arc<tokio::sync::RwLock<HashMap>>` passed to each task instead of a cloned snapshot.

**Recommended fix:** Replace `chunk_vars` clone with `Arc<tokio::sync::RwLock<HashMap<String, String>>>`:
1. Before the chunk loop, wrap `variables` in `Arc<tokio::sync::RwLock<...>>`.
2. Pass `Arc::clone(&vars_arc)` to each task instead of `chunk_vars.clone()`.
3. Tasks read via `vars_arc.read().await` and write via `vars_arc.write().await`.
4. After all handles join, read from `vars_arc` to get final state.

**Estimated effort:** M (3–4 hours)
**Dependencies:** None
**Risk:** Medium — changes concurrency model for variable sharing; needs thorough testing with multi-variable scenarios.

---

## Fix 12: ERROR — HTTP client swallows error type information

**File to modify:** `src-tauri/src/http/client.rs:88-103`

**Approach:**
The `execute` method converts all `anyhow::Error`s into `error: Some(e.to_string())`. The frontend can't distinguish between:
- DNS resolution failure (retryable)
- Connection refused (retryable on different endpoint)
- TLS certificate error (user needs to configure)
- Timeout (retry with longer timeout)
- HTTP 4xx/5xx (valid response, not a transport error)

Add an `error_kind` field to `HttpResponse`:
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum HttpErrorKind {
    Dns,
    ConnectionRefused,
    Tls,
    Timeout,
    InvalidUrl,
    Other,
}

pub struct HttpResponse {
    // ... existing fields ...
    pub error_kind: Option<HttpErrorKind>,
}
```
In `execute_internal`, map errors to the appropriate kind by downcasting `reqwest::Error`:
```rust
if e.is_timeout()       => HttpErrorKind::Timeout,
if e.is_connect()       => HttpErrorKind::ConnectionRefused,
if e.is_request() && 
   e.source().is::<std::io::Error>() 
   && source.kind() == NotFound => HttpErrorKind::Dns,
...
```

**Estimated effort:** M (2–3 hours)
**Dependencies:** None
**Risk:** Low — additive field, frontend can ignore it initially.

---

## Fix 13: ERROR — Invalid regex silently ignored in ReplacerService

**File to modify:** `src-tauri/src/replacer/service.rs:119`

**Approach:**
The `apply_rule` function returns the original text unchanged on regex compile failure. There's no way for the UI to know the rule is broken.
1. Add a `regex_errors: HashMap<String, String>` field to `ReplacerService`.
2. When a regex rule fails to compile, store the error message keyed by rule ID.
3. Expose a `get_rule_errors() -> Vec<(String, String)>` method that returns all compile errors.
4. In `add_rule` and `update_rule`, clear old errors for that rule ID.
5. Expose a Tauri command `get_replacer_rule_errors` that the frontend polls on rule save.
6. In the UI, show an inline error indicator (red border + tooltip) on rules with broken regexes.

**Estimated effort:** M (3–4 hours)
**Dependencies:** Fix 8 (Mutex change touches same type)
**Risk:** Low — additive diagnostic data.

---

## Fix 14: STUB — `cancel_request` is a no-op

**File to modify:** `src-tauri/src/soap/commands.rs:293`

**Approach:**
Option A (implement): Use a `static CANCEL_TOKENS: Lazy<Mutex<HashMap<String, CancellationToken>>>` map. When `execute_request` starts, generate a request ID, store a token, pass it to the HTTP layer. `cancel_request(request_id)` sets the token, which the HTTP client checks before each await point. `reqwest` supports `with_timeout` but not cancellation natively; use `tokio::select!` between the reqwest future and `token.cancelled()`.
- `src-tauri/src/http/client.rs` — accept an optional `CancellationToken` parameter.

Option B (remove stub and frontend call): simpler but removes future functionality. The frontend already handles UI cancellation, so this stub is misleading. Recommend implementing.

**Estimated effort:** M (4–5 hours) for implementation; S (30 min) for removal
**Dependencies:** Fix 12 (error differentiation helps cancellation UX)
**Risk:** Medium for implementation (cancellation is subtle); Low for removal.

---

## Fix 15: STUB — `start_coordinator` is a placeholder

**Files to modify:**
- `src-tauri/src/performance/commands.rs:125` — the `start_coordinator` function
- `src-tauri/webview/src/utils/bridge.ts:942-947` — frontend routing

**Approach:**
Recommend removal. The coordinator feature belongs in the sister project APIprox (see AGENTS.md: "SISTER PROJECT: APIprox - HTTP/HTTPS proxy & CLI tools (distributed testing, coordinator/worker)"). APInox is a Tauri desktop app, not a distributed test coordinator.
1. Remove `start_coordinator` function from `src-tauri/src/performance/commands.rs`.
2. Remove `stop_coordinator` and `get_coordinator_status` as well (check if they're also stubs).
3. Remove the command registrations from `src-tauri/src/lib.rs`.
4. Remove the bridge routing in `src-tauri/webview/src/utils/bridge.ts` and any UI that triggers these commands.
5. If the UI has coordinator-related panels, stub them out with a "Coming in APIprox" message.

**Estimated effort:** M (2–3 hours) for full removal
**Dependencies:** None
**Risk:** Low — stubs with no real functionality; check no other code references them.

---

## Summary: Effort & Dependency Order

| # | Fix | Effort | Priority | Depends On |
|---|-----|--------|----------|------------|
| 2 | Variable substitution ordering | S | Bug | — |
| 3 | Bounds check in perf updates | S | Bug | — |
| 10 | Perf run store memory leak | S | Bug | #3 (same fn) |
| 5 | Shell injection in updater | S | Security | — |
| 6 | Plaintext key warning | S | Security | — |
| 15 | Remove coordinator stubs | M | Stub | — |
| 1 | Body size limit | M | Critical | — |
| 4 | Dropped panic handling | M | Major | — |
| 7 | Configurable TLS bypass | M | Security | — |
| 9 | Reuse reqwest client | M | Perf | — |
| 12 | Error differentiation | M | Error | — |
| 11 | Concurrent variables | M | Bug | — |
| 14 | Cancel request (implement) | M | Stub | #12 |
| 13 | Regex error reporting | M | Error | #8 |
| 8 | Async Mutex for replacer | M | Arch | — |

**Recommended execution order** (warm up with quick wins, then tackle architectural changes):
1. #2 → #3+#10 → #5 → #6 (4 S items, ~2h total)
2. #4 → #9 (2 M items, ~6h) — monitoring and perf basics
3. #8 → #13 (arch change then dependent feature, ~6h)
4. #1 (critical, medium risk, ~5h)
5. #7 → #12 → #11 → #14 (4 M items, ~14h)
6. #15 last (cross-cutting removal, ~3h)

**Total estimated effort:** ~35 hours (about 1 work week)
