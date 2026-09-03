# Unified Explorer — Phase 7 Verification Report (final Definition-of-Done gate)

- **Task:** `t_eee123bc` (branch `feat/unified-explorer-porting`, baseline commit `45d1fc9`, HEAD before this phase: `4d5e50a`)
- **Date:** 2026-09-03
- **Environment:** mark@LWoody, headless (no display → the doc §8 "manual E2E script" is executed as the deterministic in-process E2E below, mirroring the repo's update-proxy E2E pattern)
- **Authority:** `docs/UNIFIED_EXPLORER_PARITY_DECISION.md` (§7 acceptance, §8 test coverage, §12 branch checklist, §13 context)

## Verdict

**PASS** — all functional acceptance criteria, hard constraints, and the §8 test-coverage floor are met and verified with real tool output. One documentation sub-item (§7 Global / §12 "AGENTS.md updated with the unified explorer as the primary explorer surface") is **open and non-functional**: the write to `AGENTS.md` is blocked by the agent protected-file guard (approval prompt times out in this headless run). The exact text to apply is staged in §9.3 below.

Two REQUIRED gaps were **found and fixed during this gate** (they would have broken Phase 6's legacy retirement — the legacy view was the only place the sample cards and file drag-drop existed):

1. **Sample API cards did not render in the unified view (F-03 / R-07).** Phase 0 landed the data contract (`utils/sampleApiCards.ts` + contract test); Phase 3 landed load-routing + file filters; but the render component + click pre-fill were never built. Fixed: the six cards now render in the unified `EmptyState` (grouped OpenAPI/SOAP/GraphQL), each with `data-sample-url` = exact §5.2 URL, and a click pre-fills the URL input. Verified by a new 4-test component suite.
2. **File drag-drop was missing from the unified view.** Only the legacy `ApiExplorerMain.tsx:46–55` had a drop zone. Fixed: the unified load bar is now a drop zone (OS file → `file://` path → `detectLoadFormat` routing; Tauri exposes `file.path`). Verified by a new drop test.

---

## 1. Test suites (real runs, this phase)

| Suite | Command | Result |
|---|---|---|
| Webview (incl. bridge parity M20) | `src-tauri/webview && npx vitest run` | **30 files / 233 tests passed, 0 failed** |
| Rust (src-tauri lib) | `src-tauri && cargo test` | **165 passed / 0 failed** (lib); 0 in bin; 2 ignored (pre-existing) |
| TypeScript | `npx tsc --noEmit` (webview) | **7 errors — all pre-existing** (identical set to the Phase 5 baseline; none in files touched this phase) |

Notes:

- Webview baseline at phase start was 229 (Phase 5 handoff: 215 + 14). This phase adds **+4** (new `unified_sample_cards.test.tsx`: 6-card render, click pre-fill, hidden-on-selection, drag-drop load).
- Rust baseline was 164. This phase adds **+1** (the §8 E2E, below).
- Root `npm test` still crashes on Node 26 (tinyrainbow/vitest, pre-existing, unrelated to this branch) — per established convention the webview vitest + `cargo test` are the gates; both are green above.
- `cargo fmt --check` is **not** a gate (pre-existing rustfmt-DIRTY baseline); only this phase's authored files were kept fmt-clean (`cargo test` compiles them; `e2e_unified_explorer.rs` is fmt-clean).

## 2. §8 manual/E2E script — executed headless

Doc §8's manual script: *"fresh app → each sample card → run one operation per type → verify History → create a quick request → restart app → verify persistence"* (mirroring the repo's update-proxy E2E pattern).

Implemented and **passed** as `src-tauri/src/e2e_unified_explorer.rs :: test_e2e_unified_explorer_full_flow` — an in-process E2E that drives the **real production commands** against a local loopback mock server in a fresh `APINOX_CONFIG_DIR`:

1. **Fresh app state**: isolated temp config dir; no projects, empty scrapbook.
2. **Sample card #3 (SOAP, Country-Info-shaped WSDL)** served from the mock → `parse_wsdl_as_project` → project `source:"wsdl"`, SOAP operations with generated sample envelopes; **executed** via `execute_soap_request` against the mock SOAP endpoint → 200, SOAP envelope response parsed.
3. **Sample cards #1/#2 (OpenAPI, Petstore-shaped JSON + YAML)** → `parse_spec_as_project` → project `source:"openapi"`, tag-grouped operations, `sample_`-named requests, JSON bodies; **GET executed** (200, JSON body) and **POST with JSON body executed** (201, created) via `execute_rest_request`.
4. **Sample cards #5/#6 (GraphQL, introspection-shaped)** → `parse_spec_as_project` → project `source:"graphql"`, `Query/…` + `Mutation/…` operations, `__typename` starter query; **query executed** with the exact webview payload-wrapping rule (`{"query": …}`) → 200.
5. **Quick request persistence** (the "create → restart → verify persistence" step): `add_scrapbook_request` (stamps `createdAt`/`lastModified`) → `update_scrapbook_request` → fresh reload of the store ("restart") asserts the updated entry survives **and** the on-disk `scrapbook.json` contains it → `delete_scrapbook_request` empties the store.

Evidence: `cargo test --lib e2e_unified_explorer` → `1 passed; 0 failed`.

**History verification** (the script's "verify History" step) is covered at both layers: the unified execute path calls `add_history_entry` with the correct fields — asserted in `utils/unifiedExecute.test.ts` and `unified_explorer_phase4.test.tsx` (mocked `add_history_entry` payload assertions, incl. the SOAP path per R-08) — and `history_storage.rs` is **byte-unchanged since the doc baseline** (the unified path writes to the same global `history.json` store; §10.4/Q6 by construction). The in-process E2E exercises the same commands the app would invoke.

**Sample URLs live-check** (all six §5.2 cards reachable, this run):

```
200  https://petstore.swagger.io/v2/swagger.json
200  https://petstore.swagger.io/v2/swagger.yaml
200  http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL
200  http://www.dneonline.com/calculator.asmx?wsdl
200  https://spacex-production.up.railway.app/graphql
200  https://rickandmortyapi.com/graphql
```

## 3. §7 acceptance criteria — line by line

**Global**

- [x] Every REQUIRED item (§4) implemented and verified — F-01/F-02 (quick requests), F-03 (sample cards — **fixed this gate**), F-04/F-05 (load routing), F-06/F-07 (REST/GraphQL execution).
- [x] `npm test` (webview + bridge parity) and `cargo test` pass — 233/233 and 165/0 (§1).
- [x] Legacy EXPLORER view still fully functional until Phase 6 — `ApiExplorerMain.tsx`, `ApiExplorerSidebar.tsx`, `bridge.ts` are **byte-unchanged** vs baseline `45d1fc9` (`git diff --numstat` = 0).
- [x] No `scrapbook.json` schema change; existing scrapbooks load unchanged — `scrapbook_storage.rs` diff vs baseline is **+279/−0 (tests only)**; the §7 fixture requirement is met by `test_scrapbook_schema_round_trip_fixture_loads_unchanged` (fixture ≥3 requests incl. one REST, `src/scrapbook_storage.rs:150/250`).
- [x] `UnifiedProject` additive-only — `shared/src/models.ts` diff vs baseline: `source` union gains `'graphql'`; `displayName?` added to project & request. No removals/renames. Storage uses `default` + `skip_serializing_if` for back-compat.
- [x] `data/helpContent.tsx` "Sample APIs" section updated (now describes the unified view: load = project, 6 cards in unified empty state, pre-fill + routing).
- [ ] **`AGENTS.md` updated** — OPEN (see §9.3; blocked by protected-file guard, text staged).

**Quick requests (phase 2)**

- [x] Section visible in unified sidebar; create/select/delete; empty + loading states — `contexts/__tests__/scrapbookContext.test.tsx`, `components/sidebar/__tests__/scrapbookPanel.test.tsx`, `components/explorer/__tests__/unified_scrapbook_sidebar.test.tsx`.
- [x] Selecting a quick request opens it editable with Run; response renders — `unified_explorer_phase4.test.tsx` (quick-request execution through the unified dispatcher).
- [x] Edit/save persists to `scrapbook.json` incl. across restart — E2E step 5 (§2) + `unifiedScrapbookCapture.test.ts`.
- [x] Auto-capture per Q4(c) — `UnifiedExplorerView.handleAfterExecute → captureExecution` (update keyed by endpoint+operation, else append); `unifiedScrapbookCapture.test.ts`.
- [x] Every unified SOAP execution writes a history entry (R-08) — `add_history_entry` payload asserted in the execute tests (SOAP path included).
- [x] Corrupt/missing `scrapbook.json` → empty state, no crash — `test_missing_scrapbook_returns_empty`, `test_corrupt_scrapbook_returns_empty` (`src/scrapbook_storage.rs:376/386`).

**Sample APIs (phase 3)**

- [x] All 6 cards in the unified empty state, exact §5.2 URLs; click pre-fills the URL input — **fixed this gate**; `components/explorer/__tests__/unified_sample_cards.test.tsx` asserts all 6 exact labels + URLs in the DOM and pre-fill on click (the render test the §5.2 contract test explicitly requested).
- [x] Each sample loads the right operation types — E2E: WSDL → SOAP ops; Petstore (JSON + YAML) → REST ops; GraphQL introspection → `Query/` + `Mutation/` ops.
- [x] File import accepts `.wsdl,.xml,.json,.yaml,.yml` (dialog filter, `UnifiedExplorerMain.tsx`) **and drag-drop works** — **fixed this gate** (unified load-bar drop zone; drop test asserts `onLoadWsdl("file:///…", {useProxy:false})`).

**Execution parity (phase 4)**

- [x] Petstore `GET` + JSON-body `POST` execute from the unified view — `unified_explorer_phase4.test.tsx` (legacy flat-arg REST semantics) + E2E.
- [x] GraphQL query executes with payload wrapping verified — phase4 test + E2E (`{"query": …}` rule).
- [x] Every execution (SOAP/REST/GraphQL) writes a history entry — `unifiedExecute.test.ts` + phase4 assertions.
- [x] SOAP regression: Country Info executes as before, content-type override respected — phase4 byte-identity gate (R-02/R-03) + E2E SOAP leg.

**Test coverage floor (§8.1–8.6)** — all exist and pass: ScrapbookContext CRUD, ScrapbookPanel, unified-sidebar+scrapbook integration, sample cards (contract **and** render), load-format routing (`__tests__/loadRouting.test.ts`), Rust `parse_spec_as_project` tests, history-write tests, regression guards (SOAP, scrapbook round-trip, M20 bridge parity `__tests__/bridgeParity.test.ts` — green in the 233).

## 4. §12 branch checklist

- [x] Phase 0: test floor; R-01 (surface execution errors); R-02 (real resolved operation to `execute_soap_request`)
- [x] Phase 1: `parse_spec_as_project` OpenAPI/GraphQL, `sample_` naming + refresh merge (Rust tests incl. `test_parse_spec_as_project_duplicate_source_url_triggers_refresh`)
- [x] **Quick requests sidebar (REQUIRED)** — renders, CRUD, edit+run
- [x] **Quick requests auto-save (REQUIRED)** — Q4(c) rule
- [x] **Sample API cards, all 6 exact URLs (REQUIRED)** — render + pre-fill (fixed this gate)
- [x] OpenAPI/GraphQL load wiring + file filters + drag-drop (drag-drop fixed this gate)
- [x] REST execution in unified view
- [x] GraphQL execution in unified view (query wrapping)
- [x] History write on all unified executions
- [x] Deferred items: cancel WSDL load (R-11 `cancel_unified_load` + `unified_explorer_cancel_proxy.test.tsx`), cancel request (R-11 `requestId` + `cancel_request`), WSDL proxy toggle (R-12 `effective_proxy_url`, force-off for local files)
- [x] Context-menu rename (Q8) — `unified_explorer_rename.test.tsx`
- [x] Project folders descoped (Q12, R-13) — documented in branch scope
- [x] `UnifiedProject.source` union extended with `'graphql'` (additive)
- [x] Docs: helpContent.tsx updated; AGENTS.md **open** (§9.3)
- [ ] Legacy retirement — Phase 6, separate PR (explicitly out of scope for this branch per §12; legacy verified functional until then)
- [x] Verification report: this document (npm/vitest + cargo test + §8 E2E)

## 5. Hard constraints — evidence

| Constraint | Evidence |
|---|---|
| `scrapbook.json` schema frozen | `git diff --numstat 45d1fc9..HEAD -- src-tauri/src/scrapbook_storage.rs` → **+279/−0** (tests only); unified quick requests use the existing frozen request shape; round-trip fixture test (`scrapbook_storage.rs:250`) loads an unchanged legacy file |
| `UnifiedProject` additive-only | `shared/src/models.ts` diff vs `45d1fc9`: only `source: … \| 'graphql'` and `displayName?: string` additions; `project_storage.rs` diff: no field removals, `default`+`skip_serializing_if` for new keys |
| Legacy functional | `ApiExplorerMain.tsx`, `ApiExplorerSidebar.tsx`, `bridge.ts` **byte-unchanged** vs baseline; legacy sample cards + drop zone + staging flow intact (233 webview tests incl. legacy suites pass) |
| Round-trips | `project_storage.rs`: `save_load_unified_project_round_trips_content_type_soap_version_binding_name` (:1131), `folder_operation_save_load_round_trips_output_description_portname` (:1223), `unified_operation_save_load_round_trips_output` (:1286); E2E asserts `source` per type (`wsdl`/`openapi`/`graphql`) on the real parse commands |

## 6. Changes made in this gate

| File | Change |
|---|---|
| `src-tauri/src/e2e_unified_explorer.rs` (new) | §8 manual E2E script, automated in-process (real commands, local servers, fresh config dir) |
| `src-tauri/src/lib.rs` | `#[cfg(test)] mod e2e_unified_explorer;` |
| `webview/src/components/explorer/UnifiedExplorerMain.tsx` | (a) six sample cards in the unified `EmptyState` (pre-fill on click, `data-sample-url`), (b) load-bar drag-drop zone (+ shared `loadLocalFilePath` refactor of the file-dialog path), (c) empty-state copy updated |
| `webview/src/components/explorer/__tests__/unified_sample_cards.test.tsx` (new) | 4 tests: render all 6 exact cards, click pre-fills exact URLs, hidden once a project is selected, drag-drop loads `file://` with `useProxy:false` |
| `webview/src/data/helpContent.tsx` | "Sample APIs" + "After Loading" sections rewritten for the unified primary surface |

## 7. Known / accepted (pre-existing, not gated)

- Root `npm test` Node 26 crash (tinyrainbow/vitest) — pre-existing; direct suites are the gate.
- 7 webview `tsc --noEmit` errors — pre-existing baseline, identical before/after this phase.
- `rustfmt --check` dirty across the repo — pre-existing; not a gate.

## 8. Out of scope for this branch (per doc)

- Legacy EXPLORER retirement (Phase 6, separate PR) — now safe: the only sample-card/drag-drop surface that lived in the legacy view has been ported.
- Project folders (Q12 skip), SOAPUI import, workspace export — unchanged.

## 9. Follow-ups

### 9.1 None functional

### 9.2 Push

GitHub push auth is not configured on this host (no `gh` login, no SSH key, no `.netrc`) — the local phase commit is made; push to `origin` needs `gh auth login` first (device code).

### 9.3 AGENTS.md — staged text (apply with approval)

Insert after the "- Simpler build and packaging flow" line (before `### 1. Rust Backend`):

```markdown
### Unified Explorer (primary explorer surface)

The **unified explorer** is the primary explorer surface. It is a single tree
(project → operations → requests) that replaces the legacy API Explorer view,
which remains functional but is slated for retirement in Phase 6.

- **Load**: WSDL / OpenAPI (.json/.yaml/.yml) / GraphQL (URL path containing
  `graphql` or `/gql`) via the URL bar, file dialog, or drag-drop. Routing is
  `detectLoadFormat` (`webview/src/utils/loadRouting.ts`); the six sample cards
  (`webview/src/utils/sampleApiCards.ts`, exact URLs in
  `docs/UNIFIED_EXPLORER_PARITY_DECISION.md` §5.2) render in the unified empty
  state and pre-fill the URL input on click.
- **Execute**: one dispatcher by `requestType` — SOAP via
  `execute_soap_request` (byte-identical to the R-02 baseline), REST/GraphQL via
  `execute_rest_request` (legacy `bridge.ts:433–505` semantics; GraphQL queries
  are wrapped as `{"query": …, "operationName": …}`). Every execution writes a
  history entry (`add_history_entry`, single global `history.json` store) and
  auto-captures into `scrapbook.json` (Quick Requests).
- **Persistence**: projects live under `APINOX_CONFIG_DIR/unified-projects/`
  (`UnifiedProject`, `source: "wsdl" | "openapi" | "graphql"`, additive-only
  fields); quick requests in `scrapbook.json` (frozen schema, never modified by
  the unified view).
```
