# Root-cause analysis: APInox update fails while "reading calls" is on

Task: kanban **t_b6c2aed3** (reproduce + diagnose). Downstream: **t_ee14e263**
(implement proxy bypass), **t_7af94425** (verify), **t_ba021ed2** (root task).

## Symptom (as reported)

When APInox is performing an application update and (a) the OS system proxy is
on and (b) APInox is "reading calls" (sniffer/proxy running), the update check
and/or download fails.

## Root cause (confirmed by controlled reproduction)

**The update client's TLS trust store cannot validate the TLS-MITM leaf that
APInox's own proxy presents, because the client uses `rustls` + bundled
webpki-roots and never consults the OS trust store — where the APInox CA is
installed.**

Chain of events:

1. "Reading calls" calls `set_system_proxy(port)`
   (`src-tauri/src/commands/sniffer_server.rs:56,172,333`) which points the OS
   system proxy at **APInox's own listener** `127.0.0.1:{port}` (macOS:
   `networksetup -setwebproxy/-setsecurewebproxy`; Windows: registry
   `ProxyServer=127.0.0.1:{port}` + `ProxyEnable=1`).
2. `updater.rs::get_with_fallback` (`src-tauri/src/updater.rs:315`) first tries
   a direct no-proxy client (`build_direct_client`, `:283`, `.no_proxy()`).
   On a corporate network where direct egress to `api.github.com` is blocked,
   that attempt fails and the code falls back to the proxy-aware client.
3. `build_client` (`updater.rs:215`) resolves the proxy in priority order:
   APInox settings `network.proxy` → Windows registry manual proxy → WPAD →
   `HTTPS_PROXY/HTTP_PROXY/ALL_PROXY` env. Because the OS proxy points at
   APInox itself (step 1), **the fallback client is routed through APInox's
   own TLS-MITM proxy** (`src-tauri/src/proxy/server.rs`).
4. The MITM proxy TLS-terminates the connection, generates a leaf cert for
   `api.github.com` signed by the APInox Root CA (`sni_resolver.rs` /
   `certificates/manager.rs`) and re-encrypts to the client.
5. The client's TLS stack is `reqwest` with `default-features = false` and
   `features = ["json","cookies","gzip","rustls-tls","charset","http2","stream"]`
   (`src-tauri/Cargo.toml:43`). `rustls-tls` = **rustls + bundled
   webpki-roots (Mozilla CA set) only**. Confirmed in `Cargo.lock`: 0×
   `native-tls`/`schannel`/`security-framework`, 1× `rustls`, 1×
   `webpki-roots`. **The OS trust store is never consulted** — so installing
   the APInox CA into it (which the "trust certificate" flow does) has no
   effect on the updater client.
6. Handshake fails: the client sends a fatal `unknown CA` alert (webpki-roots
   does not include the APInox CA). Update check/download fails with
   `client error (Connect) | invalid peer certificate: UnknownIssuer`.

Note: `run()` sets `NO_PROXY=*` process-wide (`lib.rs:506-509`) so the proxy's
own forwarding client doesn't loop back. That does **not** help here: the
updater's fallback client sets the proxy *explicitly* via `Proxy::all(...)`,
and an explicit proxy ignores `NO_PROXY`. (Only `auto_sys_proxy` clients would
honor it.)

## Controlled reproduction (real code, real CA, real MITM)

Harness lives in-repo: `src-tauri/examples/repro_proxy_server.rs` (drives the
production proxy code paths: real `CertManager` CA generation + real
`SniResolver` per-SNI leaf signing, mirroring `proxy::server::run_proxy`) and
`src-tauri/examples/repro_update_client.rs` (drives the **production**
`apinox_lib::updater::build_client` / `build_direct_client` and replays the
exact `get_with_fallback` sequence: direct first, then proxy-aware via
`$HTTPS_PROXY`).

Environment (Docker, reproducible):
- `repro-gh`  — fake GitHub on an egress network: self-signed
  `api.github.com` serving the real latest-release JSON fixture.
- `repro-proxy` — APInox proxy (this image) on the egress network, `:18888`.
- `repro-client` — on an `--internal` network (direct egress to the fake
  GitHub impossible — simulates corporate block); `HTTPS_PROXY` set to the
  APInox proxy (simulates "reading calls" having set the OS proxy).

Full orchestration + evidence: `repro/` (run_repro.sh, run_control.sh,
corp_proxy.py, fake_github.py, Dockerfile, REPRO_EVIDENCE.log).

Results (`REPRO_EVIDENCE.log`):

- **Scenario A** (production root store = webpki, APInox CA *not* in client):
  - client: direct fails (egress blocked) → proxy fallback fails
    `... invalid peer certificate: UnknownIssuer` → **update check FAILED**
  - proxy log: `CONNECT api.github.com:443` →
    `TLS handshake FAILED ... received fatal alert: UnknownCA`
  - ⇒ exact match of the reported symptom.
- **Scenario B** (same topology, APInox Root CA trusted by the client):
  - client: proxy fallback → `HTTP 200 OK via proxy`, real release JSON
    parsed → **update check SUCCEEDED**
  - proxy log: `MITM TLS handshake OK ... (leaf signed by APInox CA)`,
    `FWD GET ...`, `RESP 200 ... (13988 bytes)`
  - ⇒ proves the failure is *purely* the missing trust anchor, and that
    trusting the APInox CA in the client fixes it while "reading calls"
    stays fully functional.

## Affected update paths

All updater HTTP goes through `get_with_fallback` → `build_client`:

| Path | Site | Affected |
|---|---|---|
| Update **check** (`GET https://api.github.com/repos/slapperjoe/apinox/releases/latest`) | `check_for_updates` → `get_with_fallback(GITHUB_API_URL)`, `updater.rs:357` | Yes — fails before any download |
| Installer **download** (`GET <browser_download_url>`, github.com / objects.githubusercontent.com) | `download_update` → `get_with_fallback`, `updater.rs:454` | Yes — same MITM leaf, same UnknownIssuer |
| "Open release page in browser" (`open_url_in_browser`) | `updater.rs` (OS handler) | No — OS browser trusts the OS store where the APInox CA is installed |

Failure is silent-ish: the user sees "update check failed" with a generic
connection error; nothing mentions the proxy or the CA.

## Why the sibling design note's top candidate was incomplete

`t_b88db32a` flagged the self-referential loop (OS proxy → APInox's own
listener) as the top candidate and recommended rejecting proxies colliding
with in-app listener ports. That is a **real secondary hazard** (a loop
hang), but it is not the failure observed in the field: the reproduction shows
the connection *does* reach APInox's proxy (CONNECT is logged, the proxy
responds with 200 to CONNECT), and it dies at **TLS trust validation**,
because the updater client's webpki-roots-only store rejects the APInox-MITM
leaf. A loop guard alone would not fix Scenario A. Both should be addressed
for robustness (risk R1 in the design note).

## Fixes to implement (for t_ee14e263) — ranked

1. **Give the update clients a CA that trusts the APInox MITM** (fixes the
   observed failure, keeps "reading calls" working):
   - In `build_client`/`build_direct_client`, when a proxy will be used and
     the APInox CA exists (`certificates::manager` — `~/.apinox/...` or the
     configured cert dir), add its PEM to the TLS client via
     `reqwest`'s `use_rustls_tls` + custom `RootCertStore` (webpki roots +
     APInox CA) or `danger_configure` with a rustls config that roots it.
     Simplest faithful model: build the client with
     `reqwest::ConfigBuilder::add_root_certificate(apinox_ca_cert)` on top of
     `use_rustls_tls()`.
   - Scope: update clients only (they're built per-call in updater.rs).
2. **Guard against the self-proxy loop** (secondary): in `build_client`, if
   the resolved proxy host:port equals APInox's own proxy/sniffer listener
   address (from `LazyProxyAppState` / config), do not route the updater
   through it — instead prefer a no-proxy client (or skip the proxy for
   `api.github.com` / `github.com` / `objects.githubusercontent.com`). Key on
   the actual in-app listener port, not blanket 127.0.0.1 (design-note R1).
3. **Surface the real error**: include which route was used (direct vs which
   proxy) and the TLS error in the user-visible update failure, so
   "reading calls is on + corporate proxy" is diagnosable. (Design-note R.)
4. Optional hardening: connect/read timeouts on both clients (design note),
   and installer sha256 verification from the release (design-note R6).

Constraints from the task body: no persistent side effects on system proxy
settings — all of the above are client-side in-process changes; #1/#2 never
mutate OS proxy state. Logging for bypass activation/failure: covered by #3.

## Verification plan for t_7af94425

Re-run `repro/run_repro.sh` after the fix, in a **third** client mode that
uses the patched `build_client` (it now adds the APInox CA): Scenario A's
topology must now produce `HTTP 200 OK via proxy` + parsed release JSON
without disabling the proxy or clearing the OS proxy. The untrusted mode
should still fail (negative control), and direct-egress scenarios must be
unchanged.
