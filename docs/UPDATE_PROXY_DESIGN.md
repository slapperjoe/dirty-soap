# APInox update path & OS-proxy handling — design note

Scope: how the in-app updater reaches GitHub (update check, download, install),
how it discovers/uses proxies, why it fails on some proxied machines, and the
recommended fix. Written for the follow-up task "Implement proxy bypass for
apinox update" and for repro/verification.

## 1. Update flow (all custom code — no `tauri-plugin-updater`)

| Stage | Tauri command (registered in `src-tauri/src/lib.rs:620-623`) | Location |
|---|---|---|
| Check | `check_for_updates` | `src-tauri/src/updater.rs:349` |
| Download | `download_update` | `src-tauri/src/updater.rs:443` |
| Install/relaunch | `launch_installer` | `src-tauri/src/updater.rs:517` |
| Browser fallback | `open_url_in_browser` | `src-tauri/src/updater.rs:650` |

Frontend: `src-tauri/webview/src/components/modals/settings/UpdatesTab.tsx`
(auto-check on mount, "Check now", "Download update"/"Download & install",
"Run installer"/"Install & relaunch", "Open in browser" fallback) and
`src-tauri/webview/src/components/MainContent.tsx:544` (auto check on start,
badge only).

- **Check**: GET `https://api.github.com/repos/slapperjoe/apinox/releases/latest`
  (`GITHUB_API_URL`, updater.rs:14), compare `tag_name` vs `CARGO_PKG_VERSION`
  via `is_newer` (updater.rs:60). On win/mac resolve the asset
  (`*_x64-setup.exe` / `.dmg`) `browser_download_url`. 404 = "no releases yet",
  not an error.
- **Download**: stream the installer to `std::env::temp_dir()/apinox-update.{exe,dmg}`,
  emit `update-download-progress` `{percent}` events, return the local path.
- **Verification: NONE.** No checksum, no signature, no minisign/ed25519.
  rustls `webpki-roots` (Mozilla bundle) verifies the transport TLS, but the
  payload integrity check is absent. (Separate hardening opportunity — flag it,
  don't conflate with the proxy fix.)
- **Install**: Windows spawns the NSIS exe then `app.exit(0)`. macOS mounts the
  DMG (`hdiutil`), stages the `.app` to temp, strips `com.apple.quarantine`,
  spawns a detached `sh -c 'sleep 2; rm -rf "$1"; mv "$2" "$1"; open "$1"'`
  helper, then exits. Linux: not supported in-app — user opens the browser.

## 2. HTTP client configuration for update traffic

Both `check_for_updates` and `download_update` go through
`get_with_fallback(url)` (updater.rs:308):

1. **Try direct first**: `build_direct_client()` (updater.rs:276) —
   `Client::builder().user_agent(APInox/<ver>).no_proxy().build()`.
   `ClientBuilder::no_proxy()` (reqwest 0.12.28, async_impl/client.rs:1427)
   clears the proxy list AND sets `auto_sys_proxy = false` → this client never
   uses a proxy, regardless of OS settings or env vars.
2. **Fallback**: only when the direct attempt fails at the network level OR
   returns a non-success status other than 404, retry with
   `build_client()` (updater.rs:211), which picks, in priority order:
   1. APInox settings proxy — `load_config_internal().network.proxy`
      (`~/.apinox/config.jsonc`, settings_manager.rs:49; default empty)
      applied via `Proxy::all(url)`;
   2. (Windows) manual system proxy from the registry —
      `read_windows_system_proxy()` (updater.rs:82) reads
      `HKCU\…\Internet Settings` then `HKLM\…\Policies\…` then
      `HKLM\…\Internet Settings` (`ProxyEnable`/`ProxyServer`);
   3. (Windows) WPAD/PAC via a hidden PowerShell subprocess calling
      `[System.Net.WebRequest]::GetSystemWebProxy().GetProxy("https://github.com")`
      — `resolve_wpad_proxy()` (updater.rs:146), result cached for the process
      lifetime in a `OnceCell` (cached against the literal string
      `"https://github.com"`, so it is target-independent);
   4. env vars `HTTPS_PROXY` / `HTTP_PROXY` / `ALL_PROXY`
      (explicit `std::env::var` chain, updater.rs:253).
   The first source that yields a non-empty value wins; `NO_PROXY` is not
   consulted (see below).

Key env interaction: `run()` (lib.rs:506-509) sets `NO_PROXY=*` and
`no_proxy=*` process-wide so APInox's own proxy-forwarding client
(`proxy::server::PROXY_CLIENT`, proxy/server.rs:30 — built with no proxy
config, but built after the env vars are set) doesn't loop back through the
OS proxy. **Effect:** the env-var fallback in `build_client()` is effectively
dead code — with `NO_PROXY=*` set, even the explicit-proxy client bypasses
the proxy for every host. The proxy-aware client is only genuinely proxy-aware
for sources 1–3 (APInox settings / Windows registry / WPAD).

## 3. Why updates fail on proxied machines ("OS proxy on + apinox reading calls")

Ranked by likelihood; the repro task (sibling card) will confirm which one:

1. **Self-referential proxy.** APInox's own forward proxy binds `0.0.0.0:8888`
   (default, proxy_models.rs:49; user-configurable). When the user points the
   OS proxy at APInox (to let other traffic be inspected), every OS-proxy
   lookup in the updater's fallback path — registry `ProxyServer`,
   `GetSystemWebProxy()` — resolves to `127.0.0.1:8888`. The direct attempt
   is blocked by the egress firewall (the usual reason the machine has a
   proxy), so the fallback sends `CONNECT github.com:443` to APInox's own
   proxy, which forwards it to the *same* egress that already blocked direct
   → failure. Worse, APInox's proxy then sees its own update traffic in the
   traffic feed, and `danger_accept_invalid_certs(true)` (proxy/server.rs:32)
   lets its MITM re-sign GitHub's cert with APInox's own CA — so even a
   "successful" proxy-routed update would silently skip GitHub's real cert
   chain. The `NO_PROXY=*` env trick does not save this path because the
   explicit `Proxy::all()` matchers don't consult `NO_PROXY` (reqwest 0.12:
   env `NO_PROXY` is only honoured on the auto `system()` matcher).
2. **Proxy that refuses/blocks CONNECT to GitHub** — captive/SSL-inspection
   proxies that 407 (auth) or 403 (blocklist) GitHub, or that MITM with a CA
   the webpki-roots store doesn't trust (the updater client has
   `danger_accept_invalid_certs` NOT set — unlike the proxy forwarder — so a
   corporate MITM cert fails verification).
3. **WPAD/PAC mis-detection** (Windows): the PowerShell `.get_or_init` cache
   resolves once per process and is target-independent, so a PAC that returns
   a proxy for `github.com` but not for `api.github.com` (or vice versa)
   poisons every later update call until the app restarts.
4. Minor: the direct-first design means users whose egress *requires* a proxy
   always pay the cost of one failed direct attempt (connect timeout can be
   long — the updater client sets **no timeouts at all**, see Risks).

## 4. Options evaluated

| Option | Verdict |
|---|---|
| Temporarily disable the OS proxy while updating | Rejected. Requires registry/`netsh`/`scutil` writes with reliable restore on failure/crash/kill — unacceptable side effects on user state, race-prone, and it breaks APInox's own proxy while it's running (it reads OS proxy state live). |
| `NO_PROXY` env for update hosts | Rejected as-is. The updater clients set explicit proxies; reqwest 0.12 only honours `NO_PROXY` on the auto system matcher, not on explicit `Proxy::all` matchers. Setting env vars would also perturb the forwarding proxy client. (The existing global `NO_PROXY=*` in `run()` is a loopback guard, not a feature we can lean on.) |
| Direct dial for the update endpoint | **Already implemented** (direct-first in `get_with_fallback`) and it's the right primary — GitHub needs no proxy in the common case. Keep it; add the missing guards below. |
| Scoped proxy bypass / hardening of the proxy path | **Recommended** — keep direct-first, make the proxy fallback safe and useful. |

## 5. Recommended approach (scoped, no OS state mutation)

All changes in `src-tauri/src/updater.rs` (the implementer card), plus tests
(the verification card):

1. **Never route update traffic through APInox's own listener.**
   When choosing the fallback proxy (sources 1–3), reject any proxy URL whose
   host is `localhost`/`127.0.0.1`/`::1`/`0.0.0.0` or whose port matches a
   running in-app listener (proxy `config.port` default 8888, mock default
   9001, and sibling server ports; read via `LazyProxyAppState`
   (`ensure_proxy_state`, lib.rs:90) or the static config defaults). On
   detection: `log::warn!`, emit a clear `check_error`/download error
   ("update traffic cannot go through APInox's own proxy"), and stop — do not
   loop through ourselves.
2. **Harden `build_client()` fallback selection:**
   - Add a **per-request timeout** (e.g. `.timeout(120s)` / connect 15s on
     both clients) so a dead proxy or blocked direct egress can't hang the
     UI indefinitely; on download, keep streaming (use connect timeout +
     read timeout instead of total timeout).
   - Respect `NO_PROXY`/`no_proxy` *list* entries the user actually set
     (before our `*` guard overwrote them is impossible — instead: skip
     source-4 entirely and document that APInox's settings proxy is the
     supported way to proxy updates), or explicitly: source 4 already reads
     `HTTPS_PROXY`/`HTTP_PROXY`/`ALL_PROXY` — keep it, but apply
     `NoProxy::from_env()`-derived exclusions when building the explicit
     proxy via `Proxy::no_proxy(...)` so user `NO_PROXY=github.com` finally
     works (reqwest 0.12.28 supports `Proxy::no_proxy(Option<NoProxy>)`,
     proxy.rs:361 — note `NoProxy::from_env()` reads `*` in this process, so
     parse the user's value from the pre-existing env *before* `run()`
     overwrites it, or capture it at first use before the overwrite; simplest:
     stop the blanket `NO_PROXY=*` in `run()` and instead set
     `no_proxy` only for the forwarding client via
     `Proxy::custom`/`Proxy::no_proxy` — see risk R4).
   - On the WPAD fallback, cache per-target (key by URL host) instead of
     once-per-process, or invalidate on PAC change is out of scope — at least
     log the cached proxy at warn level so it's diagnosable.
3. **Surface which path was used.** The `check_error` string (shown in
   UpdatesTab) should carry the final route: "direct", "proxy
   `http://…`", or the skip reason — this is the logging the implementer
   card asks for (activation/deactivation/failure of the bypass).
4. **UI hint (optional, small):** when a failure mentions proxy/self-proxy,
   suggest checking APInox settings → network proxy, or using "Open in
   browser" (already present in UpdatesTab.tsx:241-250).

Deliberately **not** doing: writing the registry/WPAD, calling `netsh`,
`scutil --proxy`, or uninstalling APInox's proxy listener. Zero changes to OS
state → the "OS proxy left in its original state" acceptance criterion holds
by construction.

## 6. Affected files / functions

- `src-tauri/src/updater.rs`
  - `build_client()` (:211) — self-proxy rejection, timeouts, `NO_PROXY` list handling
  - `build_direct_client()` (:276) — add connect/read timeouts
  - `get_with_fallback()` (:308) — route reporting in errors, self-proxy short-circuit
  - `read_windows_system_proxy()` (:82) — return the source (HKCU/HKLM-policy) for logging
  - `resolve_wpad_proxy()` (:146) — per-target cache key, warn-level logging
  - `check_for_updates` (:349) / `download_update` (:443) — thread route info into results/errors
- `src-tauri/src/lib.rs:506-509` — `NO_PROXY=*` guard (revisit per R4)
- `src-tauri/src/proxy/server.rs:30` — `PROXY_CLIENT` construction if we move the loopback guard out of env vars
- `src-tauri/src/proxy_models.rs:49` / `proxy/state.rs` — in-app listener ports for the self-proxy guard
- `src-tauri/webview/src/components/modals/settings/UpdatesTab.tsx` — optional error-surfacing tweak
- Tests: `src-tauri/src/updater.rs` (new `#[cfg(test)]` module) + `src-tauri/tests/` for command-level tests (the verification card owns these)

## 7. Risks

- **R1 — Legit localhost proxies.** The self-proxy guard must key on the
  in-app listener ports (8888/9001 + configured ports), not blindly on
  `127.0.0.1` — a user may run Squid/Clash on `127.0.0.1:3128` and want it
  used for updates (that's exactly what APInox settings proxy is for). If
  `network.proxy` (source 1) is explicitly set to a loopback address, honour
  it; only reject *auto-discovered* proxies that collide with our own ports.
- **R2 — Corporate environments that require a proxy.** Direct-first still
  fails first (now bounded by the connect timeout, R3) and then falls back to
  the proxy — behaviour unchanged, just faster. If the corporate proxy MITMs
  with a non-webpki CA, the fallback still fails TLS; the only real fix is
  letting users point APInox settings proxy + trust the CA — out of scope,
  note in error message.
- **R3 — Timeout choices.** Too short breaks slow satellite/cellular links
  (the installer can be >100 MB). Use a generous connect timeout (15s) and a
  read/idle timeout rather than a total one for downloads.
- **R4 — `NO_PROXY=*` in `run()`.** It's process-wide and also feeds
  `NoProxy::from_env()` semantics if we ever rely on them. Replacing it with
  a per-client `Proxy::no_proxy`/custom matcher is cleaner but touches the
  forwarding proxy client — do it in a separate, well-tested step; until then
  capture any user-set proxy env before the overwrite (or accept that env
  proxies are effectively unusable in-process — document it).
- **R5 — OnceCell WPAD cache** (updater.rs:152): a stale cached proxy
  outlives proxy-config changes until app restart. Per-target caching helps;
  full invalidation is a nice-to-have.
- **R6 — No integrity verification** of the downloaded installer (no
  sha256/signature). Pre-existing; the proxy change doesn't make it worse,
  but a MITM-capable proxy (including APInox's own, if guard R1 is bypassed)
  could swap the binary. Recommend a follow-up: publish a sha256 in the
  GitHub release (e.g. in `body` or as an asset) and verify before
  `launch_installer`.
- **R7 — macOS install helper** uses `rm -rf`/`mv` in a detached shell
  (updater.rs:627). Unrelated to proxying, but the update path's blast
  radius is a bundle replacement — keep installer verification (R6) in mind
  before any automation there.

## 8. Open questions for the repro card

1. On the failing machine: is the OS proxy pointing at APInox's own port
   (self-loop, cause 1) or at an external/corporate proxy (causes 2/3)?
   Check `[Updater]` debug logs — they name exactly which source was chosen.
2. What is the exact error string from `check_for_updates` / `download_update`
   (TLS vs connect-refused vs 403/407 from proxy)?
3. Windows or macOS? (WPAD path is Windows-only.)

## 9. Implementation (t_ee14e263 — what actually shipped)

All changes in `src-tauri/src/updater.rs` (scoped to update traffic; no OS
state touched, no changes to the SOAP client or the proxy-forwarding client),
plus a new `#[cfg(test)]` module in the same file and an extended repro
harness.

### 9.1 Rooting the APInox CA in the update clients (the primary fix)

- `load_apinox_ca_pem()` — reads `<config_dir>/ca.cer` via the canonical
  `utils::config::resolve_config_dir()` (honours `APINOX_CONFIG_DIR`, then
  `$HOME/.apinox`). Returns `None` when the CA was never generated → the
  update clients fall back to webpki-roots only, exactly like before.
- `apply_apinox_ca_trust(builder)` — switches the builder to
  `use_rustls_tls()` and calls `add_root_certificate()` for each cert in the
  CA PEM bundle (`reqwest::Certificate::from_pem_bundle`, so a CA + any
  intermediates in the bundle all root). Logs `info` when the CA is trusted,
  `warn` if the PEM is found but unparseable (falls back to webpki), `debug`
  if no CA exists.
- Applied to **both** `build_client()` (proxy-aware fallback) and
  `build_direct_client()` (direct-first) — so both the explicit-proxy route
  and a *transparent* MITM on a direct dial validate against the APInox CA.
- The root cause from t_b6c2aed3 is closed this way: when the OS proxy points
  at APInox's own MITM listener, the leaf the proxy presents for
  `api.github.com` is signed by the APInox CA, which is now in the update
  clients' `RootCertStore` next to the webpki roots → the TLS handshake
  succeeds and the release JSON parses. No OS-proxy mutation, no proxy
  disabling → zero side effects on other APInox traffic or the OS.

### 9.2 Self-proxy guard (secondary, from design §5.1)

- `parse_proxy_target(url)` — extracts `(host, port)` from an
  `http(s)://` or `socks5://`/`socks5h://` proxy URL (handles an explicit
  `http://` prefix, strips IPv6 brackets).
- `in_app_listener_ports()` — APInox's own listener ports:
  `proxy_models::ProxyConfig::default().port` (8888) and
  `MockConfig::default().port` (9001).
- `proxy_host_is_loopback_like(host)` — `localhost` / `127.0.0.0/8` /
  `::1` / `0.0.0.0`.
- `is_self_proxy(url)` — true only when host is loopback-like **and** the
  port matches an in-app listener (R1: a Squid/Clash on `127.0.0.1:3128`
  still works; the guard keys on in-app ports, not blanket loopback).
- `resolve_update_proxy(...)` — pure decision function, driven in priority
  order: APInox settings `network.proxy` (explicit, always honoured — even a
  self-proxy, with a `warn` log, per R1) → Windows registry → WPAD → env.
  Any **auto-discovered** source (registry/WPAD/env) that is a self-proxy is
  refused with a `warn` log and recorded in
  `UpdateProxyDecision.self_proxy_blocked`; resolution then continues to the
  next source, and `build_client()` builds a `no_proxy()` client when nothing
  usable remains (explicitly, so reqwest's env auto-detection can't pick the
  refused proxy back up).
- `describe_update_route()` — human-readable "direct" / "proxy `http://…`
  (source: …)" / "direct — <block reason>" string, embedded in every
  user-visible update error (`get_with_fallback`'s `map_err`) and in
  `unavailable_result` reasons — this is the activation/deactivation/failure
  logging the task asks for.

### 9.3 Timeouts (design §5.2)

`UPDATE_CONNECT_TIMEOUT = 15s` and `UPDATE_READ_TIMEOUT = 60s` on **both**
update clients. Connect timeout bounds the failed direct attempt; the read
timeout (not a total timeout) keeps large installer downloads streaming on
slow links (R3).

### 9.4 Tests (in `updater.rs` `#[cfg(test)]`)

- `parse_proxy_target`: http/https/socks5/socks5h, IPv6 brackets, garbage
  (no scheme, missing port, empty).
- `is_self_proxy`: loopback + in-app port (8888/9001) ⇒ true; loopback on an
  unrelated port (3128) ⇒ false (R1); non-loopback host on a colliding port
  ⇒ false; unparseable ⇒ false.
- `resolve_update_proxy`: explicit settings proxy wins (even self-proxy);
  registry/WPAD/env self-proxies are refused and the next source is tried;
  all-self-proxy input yields `proxy: None` + `self_proxy_blocked: Some(…)`;
  blank/whitespace candidates are skipped.
- `is_newer`: semver comparison incl. v-prefix and equal versions.
- CA discovery: `load_apinox_ca_pem()` returns the PEM when
  `APINOX_CONFIG_DIR` points at a dir containing `ca.cer`, and `None` when
  the dir/cert is absent (RAII env guard, same pattern as the
  `unified_explorer_commands` tests — run serially via the guard's
  set/restore).
- TLS end-to-end (production code paths): a real APInox CA is generated in a
  temp config dir via `CertManager::generate()`, a listener presents a leaf
  minted by `SniResolver` (exactly what the MITM proxy presents), and
  `apply_apinox_ca_trust()` on a rustls client makes the handshake succeed
  while a webpki-only client fails — the unit-level mirror of repro scenario
  C.
- Result: `cargo test --lib` — **141 passed, 0 failed** (17 of them the new
  updater tests; the two pre-existing `soap::client` test compile errors from
  the M5 `truncated` field were repaired as a minimal unblock).

### 9.5 Repro harness — end-to-end proof (repro/)

- `src-tauri/examples/repro_update_client.rs` gained a **`patched`** mode:
  it drives the REAL post-fix production factory
  `apinox_lib::updater::build_client()` (CA discovery via
  `APINOX_CONFIG_DIR` + the self-proxy-guarded `resolve_update_proxy`), and
  prints the route decision. `untrusted` now models the *pre-fix* production
  shape (webpki-roots only, timeouts added) and `trusted` remains the
  reference (harness-built client with the CA rooted manually).
- `repro/run_repro.sh` runs **Scenario C** after A and B in the identical
  topology (internal client with no egress, `HTTPS_PROXY` = the APInox MITM
  proxy, real CA generated at runtime): for `patched` the container's
  `APINOX_CONFIG_DIR` is pointed at the shared CA dir so the fixed client
  discovers the CA, while A/B keep it at `/nonexistent` to stay faithful to
  the pre-fix shape.
- Expected (and verified) outcome: **A fails** (`UnknownIssuer` on the MITM
  leaf), **B succeeds** (harness + CA), **C succeeds** — the real production
  client, through APInox's own MITM proxy, with the OS proxy state left
  intact (acceptance: update succeeds while APInox is "reading calls", no
  permanent side effects). Raw log: `repro/REPRO_EVIDENCE.log` (the post-fix
  run is appended there under a "POST-FIX RUN (t_ee14e263)" banner).
