# Update-with-proxy: verification report (t_7af94425)

Date: 2026-09-02 (AEST) · Host: LWoody (Linux, mark@LWoody) · Verifier: lwoody-coder
Fix under verification: commit `539e8ee` (t_ee14e263) — "trust APInox CA in update
clients + guard self-proxy loop".

## Scope

This task verifies, with automated tests and a manual end-to-end scenario, that:

1. The update succeeds while the OS proxy is enabled (i.e. while APInox is
   "reading calls" and the OS proxy points at APInox's own TLS-MITM listener).
2. Update traffic bypasses the self-proxy loop (auto-discovered proxy colliding
   with an in-app listener port is refused and direct/no-proxy is used), or,
   when the route genuinely goes through APInox's proxy, validates the MITM
   leaf via the APInox CA the fix roots into the update clients.
3. Proxy state (OS proxy env/registry state and APInox settings) is restored /
   left untouched after both successful and failed update attempts.
4. APInox call-reading does not block the update.

## Automated tests (passing)

Run: `cargo test --lib` in `src-tauri` — **145 passed, 0 failed** (updater
module: 21 tests, of which 4 are new end-to-end integration tests added by this
task; the other 17 are the unit tests from t_ee14e263).

New integration tests (`src-tauri/src/updater.rs`, `#[cfg(test)] mod tests`):
they spin up an in-process MITM proxy built on the REAL production
`CertManager` CA + `SniResolver` per-domain leaf signing (same structure as
`proxy::server::run_proxy` and `examples/repro_proxy_server.rs`) and drive the
REAL production update path (`get_with_fallback` → `build_direct_client` /
`build_client`). Target host `update.test` is the RFC 6761 reserved `.test`
TLD, so direct egress fails deterministically (NXDOMAIN) — mirroring the field
topology where direct GitHub egress is blocked and the OS proxy (APInox's own
MITM listener while reading calls) is the only route.

| Test | Acceptance criterion proven |
|------|-----------------------------|
| `test_update_succeeds_through_mitm_proxy_when_os_proxy_enabled` | **1** — OS proxy (`HTTPS_PROXY`) points at a TLS-MITM proxy presenting an APInox-CA-signed leaf; direct attempt fails; the production client falls back to the proxy-aware client, validates the leaf via the rooted APInox CA, and returns the release JSON (parsed `v99.0.0`). `connect_hits > 0` proves the traffic genuinely flowed through the proxy. Also asserts the route report names `proxy http://…` (source: env). |
| `test_proxy_state_invariant_after_update_success_and_failure` | **3** — runs the full success path (live MITM proxy) then the full failure path (OS proxy on a dead port `127.0.0.1:1`, direct egress NXDOMAIN — both attempts die, error reports `Route: proxy http://127.0.0.1:1 (source: env)`). Afterwards: the four proxy env vars are exactly what the test set (the update machinery never overwrote them), APInox settings are byte-for-byte unchanged (compared as `serde_json::Value` — `environments` is a `HashMap` whose serialised key order is nondeterministic, so a raw string compare would be a false failure), and no settings file was created. |
| `test_self_proxy_env_blocked_and_direct_bypass_used` | **2** — OS proxy env points at APInox's own in-app listener (default port, from `in_app_listener_ports()`); the auto-discovered proxy is refused as a self-proxy loop (`describe_update_route()` reports `direct — … self-proxy loop`), the production flow attempts direct egress and fails on DNS for the target — never a proxy hop. Proxy env untouched afterwards. |
| `test_explicit_settings_self_proxy_honoured_end_to_end` | **2** (complementary, R1) — an EXPLICITLY configured `network.proxy` pointing at an APInox in-app listener is still honoured (user intent wins over the guard) and, because both clients root the APInox CA, the update genuinely succeeds through APInox's own MITM proxy. Settings file untouched by the update flow. |

Pre-existing updater unit tests covering the decision logic also pass
(proxy-resolution priority, `is_self_proxy`, `load_apinox_ca_pem` presence/
absence, `is_newer`, and `test_mitm_leaf_validates_only_when_apinox_ca_roots`
which proves the rooted-CA handshake succeeds while the pre-fix empty-store
handshake fails against the same real SniResolver leaf).

Notes on test infrastructure: tests that swap `APINOX_CONFIG_DIR` take
`CONFIG_DIR_TEST_LOCK`; tests that mutate the four proxy env vars take a new
`PROXY_ENV_TEST_LOCK` (both process-global, serialised for `cargo test`
concurrency). All MITM-proxy tests run on ephemeral loopback ports (port 0)
with unique temp config dirs; the explicit-settings test binds an in-app
default listener port (falling back to the second default if a dev instance
occupies the first).

## Manual end-to-end verification (passing)

Re-ran the repro task's Docker scenario (`bash repro/run_repro.sh`), with the
`apinox-repro` image rebaked in this run: `repro_update_client` was rebuilt
from current source (`cargo build --example repro_update_client` against
`src-tauri` at commit `a63ee21` + this task's test-only changes), so scenario
C exercised the REAL post-fix `build_client` as shipped. Topology (mirrors the
field case):

- `repro-client` on an `--internal` Docker network: direct egress to
  `api.github.com` is impossible (no route / NXDOMAIN) = corporate block.
- `HTTPS_PROXY=http://repro-proxy:18888` = the OS-proxy state that APInox's
  `set_system_proxy` installs while reading calls.
- `repro-proxy` runs the REAL APInox MITM proxy (real `CertManager` CA
  generated at startup + real `SniResolver` leaf signing) and forwards
  `api.github.com` to `repro-gh` (fake GitHub serving the real
  `releases/latest` JSON, 13 988 bytes) on the egress network.

Results (full trace appended to `repro/REPRO_EVIDENCE.log` under the
`POST-FIX RUN (t_7af94425)` banner; raw run log `/tmp/t7af94425_repro_run.log`):

| Scenario | Client | Result |
|----------|--------|--------|
| A — pre-fix shape (webpki roots only, no APInox CA) | harness `untrusted` | **FAILED** — direct: egress blocked; proxy: `invalid peer certificate: UnknownIssuer`. Proxy log: `TLS handshake FAILED … fatal alert: UnknownCA`. The field failure reproduces. |
| B — reference (harness client + APInox CA) | harness `trusted` | **SUCCEEDED** — `HTTP 200 OK via proxy`, release JSON parsed. Proxy log: `MITM TLS handshake OK for api.github.com (leaf signed by APInox CA)`, `RESP 200 … (13988 bytes)`. |
| C — REAL post-fix production `build_client` (CA auto-discovered from `$APINOX_CONFIG_DIR`, self-proxy guard + route reporting included) | harness `patched` | **SUCCEEDED** — route decision `proxy http://repro-proxy:18888 (source: env)`; direct attempt failed (egress blocked, as in the field); proxy attempt `HTTP 200 OK via proxy` + release JSON parsed; proxy log `MITM TLS handshake OK` + `RESP 200 (13988 bytes)`. **The update completes with the OS proxy left exactly as-is and call-reading fully intact.** |

## OS proxy state evidence (criterion: left in its original state)

The verification host (this Linux box) had **no proxy environment variables set**
before and after every run — the state is provably unchanged:

```
PRE  (2026-09-02T10:58:32+10:00): HTTP_PROXY=<unset> HTTPS_PROXY=<unset>
                                   ALL_PROXY=<unset> NO_PROXY=<unset>
POST (2026-09-02T10:58:59+10:00): HTTP_PROXY=<unset> HTTPS_PROXY=<unset>
                                   ALL_PROXY=<unset> NO_PROXY=<unset>
```

In the containerised scenario the "OS proxy" is the `HTTPS_PROXY` env var of the
client container (exactly what `set_system_proxy` installs on the user's
machine); the production code only ever *reads* it (`build_client` /
`describe_update_route`) — no code path in `updater.rs` writes proxy state.
The in-process tests additionally assert the four proxy env vars are byte-for-byte
unchanged after both the success and the failure path
(`test_proxy_state_invariant_after_update_success_and_failure`), and that APInox
settings are unmutated and no settings file is created.

By construction the fix mutates nothing outside the update process: it only
adds the APInox CA to the update clients' root store, refuses auto-discovered
self-proxies, and adds timeouts + route reporting. No OS-proxy, registry, or
WPAD state is touched — satisfying "no persistent side effects" without any
restore step.

## Conclusion

All four acceptance criteria are met: passing automated tests (145/145 lib,
21/21 updater incl. 4 new end-to-end MITM-proxy integration tests), a passing
manual verification run of the repro scenario (scenario C: the real post-fix
client updates successfully through APInox's own MITM proxy with the OS proxy
enabled and call-reading intact), and evidence that the OS proxy is left in
its original state (host env snapshot pre/post; container env untouched;
in-process assertions).
