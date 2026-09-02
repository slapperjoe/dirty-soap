# Unified Explorer — Porting Parity Decision Document

- **Status**: DRAFT FOR REVIEW (no code implemented; this doc is the decision artifact)
- **Date**: 2026-09-02
- **Repo/HEAD**: `/home/mark/code/apinox`, branch `main`, commit `3f7bc2f`
- **Inputs**:
  - `docs/LEGACY_WORKSPACE_EXPLORER_INVENTORY.md` (t_a48a7584 — complete, read-only audit of the legacy workspace/sidebar system, 15 sections)
  - Direct read-only code verification of the legacy API explorer and the unified explorer (this pass). **Note**: the second planned inventory, t_ef1f6612 ("Audit api explorer features and sample APIs"), completed with an unrelated artifact (an AWS S3 CLI guide written by a worker on a different host) and produced **no usable inventory**. Every legacy API-explorer feature classified in this document was therefore re-verified directly against source at commit `3f7bc2f` before being listed. Line references below are from that commit.
- **Scope**: Features of the legacy **Workspace** view and legacy **API Explorer** (EXPLORER) view, compared against the **Unified Explorer** (`UNIFIED_EXPLORER` rail view), to decide what must be ported so the unified explorer can replace them.
- **Out of scope (scope decision, see §10)**: the separate rail views Tests, Workflows, Performance, History, Notes, Proxy & Traffic, Mock Server, File Watcher. These stay alongside the unified explorer as their own views and are not "explorer parity" items.

## 1. Classification legend

| Class | Meaning |
|---|---|
| **PRESENT** | Already in the unified explorer; no port needed (verification noted) |
| **PARTIAL** | Exists in the unified explorer in a reduced/different form; port the delta or accept as-is |
| **MISSING** | Absent from the unified explorer; porting work required |
| **DEPRECATED** | Legacy feature intentionally superseded by the unified design (or dead code); do not port, remove/leave |
| **NOT WORTH** | Legacy feature with low value or poor fit; recommend dropping |

**REQUIRED** items (per task mandate) are marked with ⚑. Every inventoried item has exactly one decision in §4.

## 2. System summary (verified)

**Legacy API Explorer** (`SidebarView.EXPLORER`):
- Main: `components/explorer/ApiExplorerMain.tsx` — URL input + Load/Cancel, **six Sample API cards** (lines 334–443), file import zone (click or drag-drop), operation/interface detail panels.
- Sidebar: `components/sidebar/ApiExplorerSidebar.tsx` — `ServiceTree` in explorer mode (Add to Project / Add All / Remove / Clear / context menus over *explored interfaces* — a staging list in `NavigationContext`) plus the **Quick Requests section** = `ScrapbookPanel` (line 215).
- Load path: `bridge.sendMessage({command:'loadWsdl', ...})` → `utils/bridge.ts:212–430` **routes by URL**: `.json/.yaml/.yml` → `parse_openapi_spec`; path contains `graphql`/`gql` → GraphQL introspection (adaptive depth tiers); otherwise `parse_wsdl`. Legacy messages carry `useProxy` (MainContent.tsx:1466) and a URL history (≤10, MainContent.tsx:596/1464).
- Execute path: `bridge.sendMessage(FrontendCommand.ExecuteRequest)` → `bridge.ts` routes SOAP → `execute_soap_request`, REST/GraphQL → `execute_rest_request`; **writes request history** via `saveRequestHistory` (`add_history_entry`, bridge.ts:475/567/1232–1254); supports `cancelRequest`/`cancelAllRequests`.
- Quick requests (scrapbook): `ScrapbookPanel.tsx` (UI) + `ScrapbookContext.tsx` (state, app-level provider, `useScrapbookAutoSave`) + `src-tauri/src/scrapbook_storage.rs` → `~/.apinox/scrapbook.json`; bridge commands `getScrapbook`/`addScrapbookRequest`/`updateScrapbookRequest`/`deleteScrapbookRequest` + events `scrapbookLoaded`/`scrapbookUpdated`; auto-save hook wired in `TestRunnerContext.tsx:84`.

**Unified Explorer** (`SidebarView.UNIFIED_EXPLORER`):
- `components/explorer/UnifiedExplorerView.tsx` (wrapper), `UnifiedExplorerMain.tsx` (712 lines), `UnifiedExplorerSidebar.tsx` (566 lines).
- Load path: top bar URL input (default = Country Info WSDL, `UnifiedExplorerMain.tsx:56`) + File button → `UnifiedExplorerView.handleLoadWsdl` → **`parse_wsdl_as_project` only** (`unified_explorer_commands.rs:17`), which calls `parse_wsdl` and returns `"No services found in WSDL"` for anything non-WSDL. File dialog filter is `['wsdl','xml']` only (`UnifiedExplorerMain.tsx:199`).
- Project model: loading **immediately creates and persists** a `UnifiedProject` (duplicate `sourceUrl` triggers refresh — no staging "explored interfaces" step). Refresh merges, preserves user requests, renames removed operations to `[Legacy] <name>` (`unified_explorer_commands.rs:161–177`).
- Execute path: `handleExecuteRequest` → `execute_soap_request` **only** (`UnifiedExplorerMain.tsx:236`), hardcoded `language="xml"` editor, SOAP-only request construction. **No history write, no REST/GraphQL execution, no cancel.** Responses cached in React state and persisted as `lastResponse` inside the project file.
- Sidebar: project → operation → request tree, DnD reorder (within a project / within an operation), context menu (project: Refresh WSDL / Export Project / Delete; operation: New Request / Delete; request: Copy URL / Copy Request XML / Delete). No rename.
- Env vars: loaded via `get_settings` + `get_resolved_environment` on mount, passed into `execute_soap_request` (`UnifiedExplorerMain.tsx:64–79`).
- Sample request templates: `SampleRequestPanel` used at `UnifiedExplorerMain.tsx:571`; `sample_<op>` requests generated in Rust (`build_operation_json`, `unified_explorer_commands.rs:246–271`) and hidden from tree lists via the `name.startsWith('sample_')` filter.

## 3. Side-by-side comparison

| # | Feature | Legacy location (verified) | Unified status (verified) | Decision |
|---|---------|---------------------------|---------------------------|----------|
| F-01 | **Quick requests (scrapbook) sidebar** — create/select/delete/execute standalone requests | `ScrapbookPanel.tsx` + `ScrapbookContext.tsx` + `scrapbook_storage.rs` (QR-1…QR-5) | **Missing** — zero scrapbook references in `components/explorer/` (grep-verified) | **MISSING ⚑ REQUIRED** |
| F-02 | **Quick requests auto-save** (executed/edited requests captured into scrapbook) | `useScrapbookAutoSave` in `TestRunnerContext.tsx:84`, keyed to legacy selection flow | **Missing** — hook exists but no unified-view wiring (unified uses `selectedNode`, a different selection model) | **MISSING ⚑ REQUIRED** |
| F-03 | **Sample API cards** (6 cards, 3 groups: OpenAPI ×2, SOAP ×2, GraphQL ×2; click pre-fills URL) | `ApiExplorerMain.tsx:334–443` (exact URLs in §5) | **Missing** — no cards; only Country Info survives as the default URL string (line 56) | **MISSING ⚑ REQUIRED** |
| F-04 | **OpenAPI load** (`.json`/`.yaml`/`.yml` → `parse_openapi_spec`, interfaces grouped by tag, per-path operations with sample JSON bodies) | `bridge.ts:218–271`; `openapi_parser.rs:211` `generate_sample` | **Missing** — unified load path is WSDL-only; an OpenAPI URL fails with "No services found in WSDL"; File dialog excludes json/yaml | **MISSING** (required for F-03 cards to work) |
| F-05 | **GraphQL load** (introspection, adaptive depth tiers, Query/Mutation interfaces, `__typename` starter bodies) | `bridge.ts:274–411` | **Missing** — same WSDL-only gap | **MISSING** (required for F-03 cards to work) |
| F-06 | **REST execution** (OpenAPI requests) | `bridge.ts:433–505` (`execute_rest_request`, history write) | **Missing** — `handleExecuteRequest` is SOAP-only | **MISSING** (consequence of F-04) |
| F-07 | **GraphQL execution** (raw query wrapped as `{"query":...}`) | `bridge.ts:433–456` | **Missing** — same | **MISSING** (consequence of F-05) |
| F-08 | **WSDL load via URL** | `loadWsdl` bridge → `parse_wsdl` | **Present** — `parse_wsdl_as_project` (with duplicate-URL → refresh behaviour) | PRESENT |
| F-09 | **WSDL load via file** | import zone, filters wsdl/xml/json/yaml/yml | **Partial** — File button works but dialog filter is wsdl/xml only (`UnifiedExplorerMain.tsx:199`); no drag-drop zone | PARTIAL (extend filters when F-04/F-05 land) |
| F-10 | **Cancel WSDL load** | Cancel button → `cancelWsdlLoad` | **Missing** — Load button only shows a spinner, no cancel | MISSING (low priority; see §8 order) |
| F-11 | **Cancel in-flight request** | `cancelRequest`/`cancelAllRequests` commands | **Missing** — no cancel UI or path in `UnifiedExplorerMain` | MISSING (low priority) |
| F-12 | **Request execution (SOAP) + response viewer** | `useRequestExecution` / bridge SOAP path, full response panel | **Present** — `execute_soap_request` + `MonacoResponseViewer`, response cache per request + `lastResponse` persistence | PRESENT |
| F-13 | **Request history write on execute** | `saveRequestHistory` → `add_history_entry` (bridge.ts:1232–1254) | **Missing** — unified execute never calls `add_history_entry`; the global History view won't record unified executions | MISSING (recommend port; see §11 Q6) |
| F-14 | **Sample request templates** (`sample_<op>` generated on parse; Reset to default XML) | `SampleRequestPanel` + `generateXmlBody` | **Present** — same `SampleRequestPanel` at `UnifiedExplorerMain.tsx:571`; Rust `generate_sample_xml` | PRESENT |
| F-15 | **Project tree** (projects/operations/requests, selection, expand) | `ProjectList` + `ServiceTree`/`FolderTree` | **Present** — unified tree with equivalent selection model | PRESENT |
| F-16 | **Drag-drop reorder** | projects/ops/requests reorder + cross-operation/interface **move modal** | **Partial** — reorder within project/operation only; no cross-operation move | PARTIAL (acceptable; cross-move low value — §11 Q9) |
| F-17 | **Context menus** | full menus (rename, delete, copy URL/XML/response, view sample schema, export) | **Partial** — subset: Refresh/Export/Delete (project), New Request/Delete (operation), Copy URL/Copy XML/Delete (request). **No rename anywhere.** | PARTIAL (rename gap — §11 Q8) |
| F-18 | **Refresh WSDL / sync** | `refreshWsdl` + `applyWsdlSync` with **diff UI** (wsdlDiff) | **Present, different model** — `refresh_unified_project` re-parses and merges server-side, preserves user requests, `[Legacy]` prefix for removed ops; **no diff/apply UI** | PARTIAL (diff UI: see §11 Q7) |
| F-19 | **Staging "explored interfaces" + Add to Project / Add All / Remove / Clear** | `NavigationContext.exploredInterfaces`, `useExplorer.ts`, `AddToProjectModal` | **Superseded by design** — unified load = persisted project immediately (duplicate URL → refresh); no staging step | DEPRECATED (intentional) |
| F-20 | **Operation/interface detail panels** (SOAP action, input schema, binding, namespace, endpoint) | `ApiExplorerMain.tsx:125–239` | **Present** — richer grid in `UnifiedExplorerMain.tsx:505–568` (adds Content-Type, effective-content-type resolution) | PRESENT |
| F-21 | **Environment variables** (active env, interpolation) | `EnvironmentSelector` header + env resolution | **Present** — `get_resolved_environment` loaded on mount, passed to execute | PRESENT |
| F-22 | **Interface-level Content-Type override** (SOAP) | per-interface contentType in legacy model | **Present** — project-level `contentType` override + `resolveEffectiveContentType` (spec doc) | PRESENT |
| F-23 | **WSDL download via proxy toggle** (`useProxy` on loadWsdl) | MainContent.tsx:596/1466; `wsdlUseProxy` state | **Missing** — `parse_wsdl_as_project` receives no proxy param | MISSING (low priority) |
| F-24 | **WSDL URL history** (last 10 URLs) | `wsdlUrlHistory` (MainContent.tsx:596) | **Missing** | NOT WORTH (revisit only if users ask) |
| F-25 | **View Sample Schema modal** (`getSampleSchema`) | context menu item (MainContent.tsx:2132, useContextMenu.ts:298) — **temporarily disabled** in legacy | Missing | NOT WORTH (disabled upstream; drop the command + event with the legacy view) |
| F-26 | **Welcome/changelog landing panel** | `WelcomePanel` (HOME view) | Unified has its own `EmptyState` landing | NOT WORTH (unified empty state is the replacement) |
| F-27 | **`get_scrapbook_request` Rust command** | registered (lib.rs:554), no UI caller | n/a | DEPRECATED (either wire into port or remove — §11 Q10) |
| F-28 | **`CollectionList` / `SidebarView.COLLECTIONS`** (REST collections) | orphaned — no rail entry, no render path | n/a | DEPRECATED (dead code; delete with legacy-view cleanup) |
| F-29 | **`WatcherPanel`** | orphaned — no references | n/a | DEPRECATED (dead code) |
| F-30 | **`SidebarView.SERVER` block** | commented out (WorkspaceLayout.tsx:1004–1011) | n/a | DEPRECATED (dead code) |
| F-31 | **`WorkspaceContext` provider / `testRunnerProps` / `wsdlProps`** | unused legacy wiring | n/a | DEPRECATED (legacy-view cleanup; do not depend on in port) |
| F-32 | **Explorer operation "(Preview)" naming, SOAP version badges** | `ServiceTree` explorer mode | superseded by unified tree | NOT WORTH |
| F-33 | **User-created folders inside a project** (grouping operations/requests; `FolderTree`, drag-drop into folders; folders persisted by `save_project` → `save_folders`) | `FolderTree.tsx`, `ApinoxFolder` (shared/src/models.ts:350), `project_storage.rs:194/249` | **Missing** — `UnifiedProject` has no `folders` field (models.ts:407–427) and `save_unified_project` does not write folder files; the unified tree is flat project → operation → request | **MISSING** (deferred; see §11 Q12) |

**Verification note on the parent inventory's §12 baseline:** it rated "GraphQL introspection / OpenAPI sample generation — Present" for the unified explorer because the *Rust parsers* are shared. That is **incorrect as a parity statement**: the parsers exist but are **not reachable from the unified load path** (F-04/F-05). The unified explorer today cannot load any of the four non-WSDL sample APIs, and could not execute REST/GraphQL requests even if loaded.

## 4. Decision register (one row per inventoried item)

Required first (task mandate):

| Item | Decision | Phase |
|---|---|---|
| F-01 Quick requests sidebar in unified explorer | **MISSING — PORT (REQUIRED ⚑)** | 2 |
| F-02 Quick requests auto-save for unified selection model | **MISSING — PORT (REQUIRED ⚑)** | 2 |
| F-03 Sample API cards (all 6) in unified explorer | **MISSING — PORT (REQUIRED ⚑)** | 3 |
| F-04 OpenAPI load routing into unified project model | **MISSING — PORT** (cards depend on it) | 3 |
| F-05 GraphQL load routing into unified project model | **MISSING — PORT** (cards depend on it) | 3 |
| F-06 REST execution in unified view | **MISSING — PORT** | 4 |
| F-07 GraphQL execution in unified view | **MISSING — PORT** | 4 |
| F-09 File import filters (add json/yaml/yml) + drag-drop | **PARTIAL — PORT delta** | 3 |
| F-13 History write on unified execution | **MISSING — PORT (recommended)** | 4 |
| F-10 Cancel WSDL load | **MISSING — PORT (deferred, optional)** | 5 |
| F-11 Cancel in-flight request | **MISSING — PORT (deferred, optional)** | 5 |
| F-16 Cross-operation move | **PARTIAL — accept as-is (recommend no port)** | — |
| F-17 Context menu rename gap | **PARTIAL — decide (§11 Q8)** | 5 |
| F-18 WSDL refresh diff/apply UI | **PARTIAL — decide (§11 Q7)** | — |
| F-23 WSDL load via proxy | **MISSING — PORT (deferred, optional)** | 5 |
| F-08, F-12, F-14, F-15, F-20, F-21, F-22 | **PRESENT — no action** | — |
| F-19 staging/Add-to-Project | **DEPRECATED — keep out of unified (superseded by load=project)** | — |
| F-24, F-25, F-26, F-32 | **NOT WORTH — do not port** | — |
| F-33 Project folders | **MISSING — PORT (deferred, decide Q12)** — not a required item; blocks nothing else | 5 |
| F-27, F-28, F-29, F-30, F-31 | **DEPRECATED — remove during legacy-view retirement (separate cleanup task)** | 6 |

Count: 33 items → 12 missing, 4 partial, 7 present, 6 deprecated, 4 not-worth. Every inventoried item is covered.

## 5. Required port detail

### 5.1 Quick requests sidebar (F-01, F-02) ⚑

Surviving unchanged (already app-level / Rust): `ScrapbookContext.tsx`, `scrapbook_storage.rs` (file format `~/.apinox/scrapbook.json` — **do not change the schema**), the 4 FrontendCommands + 2 BackendCommands, the 4 registered Tauri commands.

What must move:
1. **UI**: render `ScrapbookPanel` (or an equivalent section) in `UnifiedExplorerSidebar` — recommend bottom section under the tree, mirroring the legacy placement, or as a decision per §11 Q1.
2. **Selection model**: scrapbook select/edit currently mutates the *legacy* selection state (`selectedRequest` + cleared project/interface/operation context — `ApiExplorerSidebar.tsx:118–141`). In the unified view, a selected scrapbook request must drive `UnifiedExplorerMain` via `selectedNode`-style state (e.g. a `selectedNode.type === 'scrapbook'` node), and the main area must show an editor for the scrapbook request (endpoint, headers, body) with Run/Save-back via `ScrapbookContext.updateRequest`.
3. **Execution**: legacy scrapbook execution reuses the shared request engine. The unified view should route through the same engine it will gain in phase 4 (SOAP/REST/GraphQL), so quick requests work for all request types.
4. **Auto-save (F-02)**: `useScrapbookAutoSave` is keyed to legacy selection args (`TestRunnerContext.tsx:84`). It must be re-wired for the unified selection model — decision: either (a) generalize the hook to accept a "is scrapbook context" predicate + updater callback, or (b) capture in the unified execute/save path directly. Option (b) is simpler and testable; recommend (b).
5. **Error paths** (from inventory §11.4) must keep working in the new surface: missing/corrupt `scrapbook.json` → empty state; config dir error → surfaced via `error` event; use-outside-provider throws.

### 5.2 Sample APIs (F-03) ⚑ — exact URLs from `ApiExplorerMain.tsx:334–443`

| # | Card label | Group | URL (exact) | Type |
|---|-----------|-------|-------------|------|
| 1 | Swagger Petstore | OpenAPI | `https://petstore.swagger.io/v2/swagger.json` | OpenAPI 2.0 JSON |
| 2 | Petstore YAML | OpenAPI | `https://petstore.swagger.io/v2/swagger.yaml` | OpenAPI 2.0 YAML |
| 3 | Country Info | SOAP | `http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL` | SOAP WSDL |
| 4 | Calculator | SOAP | `http://www.dneonline.com/calculator.asmx?wsdl` | SOAP WSDL |
| 5 | SpaceX | GraphQL | `https://spacex-production.up.railway.app/graphql` | GraphQL |
| 6 | Rick & Morty | GraphQL | `https://rickandmortyapi.com/graphql` | GraphQL |

Cards render in the unified empty state (and/or top bar area — decision Q2); click pre-fills the URL input and sets the correct input type. Also update `data/helpContent.tsx` if it references the legacy view.

### 5.3 OpenAPI/GraphQL load routing (F-04, F-05)

The format-detection + parsing logic today lives in `bridge.ts` (frontend) and produces legacy `ApiInterface[]` (tag-grouped for OpenAPI; Query/Mutation interfaces for GraphQL). The unified model is `UnifiedProject` (flat operations, `source` field, `sample_` naming). Port requires:

1. Extend `parse_wsdl_as_project` (or add `parse_spec_as_project`) to accept the routed result and build a `UnifiedProject` with `source: 'openapi' | 'graphql'` — note the shared `UnifiedProject.source` union (models.ts:411) currently only allows `'wsdl' | 'openapi' | 'manual'`, so `'graphql'` must be added to the type (additive, safe).
2. **Sample-request naming trap**: the unified tree hides requests whose name `startsWith('sample_')` (lowercase, underscore). Legacy OpenAPI/GraphQL builders name their starter request `'Sample'` (capital). Ported builders **must** use `sample_<operation>` naming or the starter requests will appear as real user requests in the tree.
3. **Content-type / editor language trap**: `UnifiedExplorerMain` hardcodes Monaco `language="xml"` and SOAP execution. OpenAPI/GraphQL projects need `language` chosen per request `contentType`/`requestType`, and execution routed to `execute_rest_request` (F-06/F-07).
4. File import dialog filters extended to json/yaml/yml (F-09); GraphQL/OpenAPI file imports route by file extension exactly like URL routing.
5. Keep the existing duplicate-`sourceUrl` → refresh behaviour; define refresh semantics for OpenAPI/GraphQL projects (re-introspect/re-parse + merge like WSDL).

## 6. Recommended porting order

| Phase | Content | Depends on | Exit check |
|---|---|---|---|
| **0. Test floor** | Unit tests for `ScrapbookContext` CRUD (mocked bridge), `ScrapbookPanel` render/interactions, unified load-format error behaviour (Rust), sample-card component (before it exists, define the contract) | — | `npm test` green; new tests fail appropriately against unported code where TDD is used |
| **1. Rust foundation** | `parse_spec_as_project` (or extended command) for OpenAPI/GraphQL → `UnifiedProject`; `sample_` naming; refresh merge for non-WSDL sources | Phase 0 | Rust unit tests: openapi spec, graphql introspection fixture, non-WSDL URL to legacy WSDL path still errors cleanly |
| **2. Quick requests ⚑** | `ScrapbookPanel` into unified sidebar; `selectedNode`-style selection + editor surface; unified-aware auto-save capture; execution via existing SOAP path | Phase 0 | Manual: create/select/edit/delete/run a quick request from the unified view; persists across restart in `scrapbook.json`; existing legacy view unaffected (still working — legacy retirement is later) |
| **3. Sample APIs ⚑ + load routing** | 6 cards in unified empty state; wire WSDL cards to existing path; wire OpenAPI/GraphQL cards to Phase-1 command; file filters + drag-drop | Phase 1 | All 6 sample cards load and render operations in the unified tree (Petstore → operations per tag; SpaceX → Query/Mutation; Country Info/Calculator → WSDL ops) |
| **4. Execution parity** | REST + GraphQL execution in `handleExecuteRequest` (reuse bridge `execute_rest_request` semantics incl. GraphQL query wrapping); editor language by content type; **history write** (`add_history_entry`) on every unified execution | Phase 3 | Petstore GET/POST run from unified view and appear in global History; GraphQL query runs; SOAP still works (regression) |
| **5. Deferred parity** | Cancel WSDL load; cancel in-flight request; proxy toggle for WSDL load; context-menu rename (if Q8 says yes); project folders (if Q12 says port) | Phase 4 | each item's manual check |
| **6. Legacy retirement (separate task, after approval)** | Remove EXPLORER rail view + `ApiExplorerMain`/`ApiExplorerSidebar`/staging flow + dead code (F-28…F-31, F-25, F-27) once unified parity is accepted | Phase 5 | app runs without `EXPLORER` view; dead code gone; tests green |

Phases 2 and 3 are the two REQUIRED items and are deliberately early; phase 3's cards only fully work for OpenAPI/GraphQL once phases 1+3+4 are all in, so the card UI should ship with a visible "loading" state and a clear error for formats not yet wired if it lands ahead of phase 4 (it shouldn't — order above avoids this).

## 7. Acceptance criteria (definition of done for the branch)

**Global**
- [ ] Every REQUIRED item (§4) implemented and verified on the acceptance list below.
- [ ] `npm test` (webview + bridge parity) and `cargo test` (src-tauri) pass.
- [ ] Legacy EXPLORER view still fully functional until Phase 6 (no user-visible regression during the port).
- [ ] No changes to `scrapbook.json` file schema; existing scrapbooks load unchanged (verified with a fixture containing ≥3 requests incl. one REST request).
- [ ] No changes to `UnifiedProject` on-disk format beyond additive fields (`source` values `openapi`/`graphql`).
- [ ] Documentation: `data/helpContent.tsx` "Sample APIs" section updated; `AGENTS.md` updated with the unified explorer as the primary explorer surface.

**Quick requests (phase 2)**
- [ ] Quick Requests section visible in unified explorer sidebar; create/select/delete work; empty state and loading state render.
- [ ] Selecting a quick request opens it editable (endpoint, headers, body) with Run; response renders in the unified response viewer.
- [ ] Editing and saving a quick request persists to `scrapbook.json` (verify file contents after app restart).
- [ ] Auto-capture: executing a request in the unified view appends/updates the corresponding scrapbook entry per the chosen capture rule (Q4).
- [ ] Corrupt/missing `scrapbook.json` → empty state, no crash.

**Sample APIs (phase 3)**
- [ ] All 6 cards present in the unified empty state with the exact URLs in §5.2; click pre-fills the URL input.
- [ ] Each sample loads: Petstore (both) → REST operations; Country Info + Calculator → SOAP operations; SpaceX + Rick & Morty → Query/Mutation operations.
- [ ] File import accepts `.wsdl,.xml,.json,.yaml,.yml` and drag-drop works.

**Execution parity (phase 4)**
- [ ] Petstore `GET` and a `POST` with JSON body execute from the unified view and return the response.
- [ ] A SpaceX/Rick & Morty query executes (GraphQL payload wrapping verified).
- [ ] Every execution (SOAP/REST/GraphQL) writes a history entry visible in the History view.
- [ ] SOAP regression: Country Info operation executes as before (content-type override respected).

**Test coverage floor (see §8)** — tests from §8.1–8.6 exist and pass.

## 8. Test coverage needs

Current baseline (verified): `components/explorer/__tests__/unified_explorer.test.tsx` is a 14-line smoke test (1 test: sidebar renders "No projects yet"). `unified_explorer_commands.rs` has 7 unit tests. No tests touch scrapbook or the bridge load routing.

Required additions:

1. **`ScrapbookContext`** (new, `contexts/__tests__/`): CRUD against a mocked bridge (load on mount, create defaults incl. `id`/timestamps, update, delete clears selection, event handler `scrapbookLoaded`/`scrapbookUpdated` re-syncs + prunes deleted selection).
2. **`ScrapbookPanel`** (new, `sidebar/__tests__/`): render list/empty/loading; create/delete/execute callbacks fire with right ids; context menu items.
3. **Unified sidebar + scrapbook integration** (extend `explorer/__tests__/`): quick-requests section renders below tree; selecting a scrapbook node drives `onSelectNode`-equivalent.
4. **Sample API cards** (new): 6 cards render with exact URLs/labels; click sets URL input value (assert exact strings from §5.2).
5. **Load-format routing** (new, webview): the unified load entry point routes by URL/file extension to WSDL vs OpenAPI vs GraphQL (extract routing into a testable pure function if needed); error surfaces for unknown formats.
6. **Rust**: `parse_spec_as_project` unit tests — OpenAPI fixture (tag grouping, `sample_` naming, JSON bodies), GraphQL fixture (Query/Mutation, `__typename` starter), refresh-merge for non-WSDL source (preserves user requests, `[Legacy]` rename), duplicate sourceUrl → refresh.
7. **History write** (new, webview): unified execute path calls the history write with correct fields (mock `add_history_entry`).
8. **Regression guards**: SOAP execution in unified view (mock `execute_soap_request` response shape), `scrapbook.json` schema fixture round-trip (Rust `scrapbook_storage` — check for existing tests first, add if absent), bridge parity test (M20) still green with any new commands.

Manual/E2E script (for the verification report, mirroring the repo's update-proxy E2E pattern): fresh app → each sample card → run one operation per type → verify History → create a quick request → restart app → verify persistence.

## 9. Risks

| # | Risk | Likelihood/Impact | Mitigation |
|---|------|-------------------|-----------|
| R1 | **Sample cards ship dead**: OpenAPI/GraphQL cards fail in the unified view because load routing (F-04/05) and execution (F-06/07) are the real gaps behind the cards | High / High (user-facing) | Porting order above wires routing *before* cards; phase-3 exit check requires all 6 to load; phase-4 requires execution. Cards must not land ahead of phase 1 |
| R2 | **Sample-request naming mismatch** (`Sample` vs `sample_`) makes starter requests appear as user requests or get hidden wrongly | High / Medium | Phase-1 rule in §5.3(2); Rust test asserts naming |
| R3 | **Execution path divergence**: unified `execute_soap_request` call hardcodes SOAP assumptions (null operation, xml language). Naive REST/GraphQL addition corrupts SOAP behaviour | Medium / High | Add a request-type dispatcher next to the existing path; keep SOAP path byte-identical; regression test (SOAP Country Info) as gate |
| R4 | **Auto-save hook re-wiring** touches the shared `TestRunnerContext` used by the legacy view; a wrong predicate double-captures or drops captures | Medium / Medium | Prefer option (b) (§5.1(4)): capture at unified execute/save, leave legacy hook untouched; test both flows |
| R5 | **Data-format drift**: `UnifiedProject` schema extended per-source; old projects must still load | Medium / High | Additive-only fields; round-trip test with a fixture of each `source` value |
| R6 | **GraphQL introspection complexity** (depth tiers, error parsing) lives inline in `bridge.ts:274–411`; extracting it risks regressions in the legacy view which still uses it | Medium / Medium | Don't move the legacy path in this branch; reuse the same bridge-level function from the unified path until Phase 6, then relocate |
| R7 | **Two execution engines during transition** (legacy bridge funnel vs unified direct invoke) with divergent features (history, cancel) — easy to fix one and forget the other | High / Medium | Phase 4 explicitly closes the history gap; keep a parity checklist in the branch (one row per capability) |
| R8 | **Test floor is thin** (1 smoke test for the whole unified surface) — regression risk in the area being changed most | High / Medium | Phase 0 before feature work; §8 minimum set is a hard gate |
| R9 | **Proxy gap**: unified WSDL load ignores the proxy setting (F-23) — environments that only reach WSDLs via a proxy lose capability | Low / Medium | Deferred phase-5 item; flag in release notes if it slips |
| R10 | **Scope creep into legacy retirement**: removing the EXPLORER view in the same branch as the port makes rollback hard | Medium / High | Retirement is Phase 6 as a separate task (t_d98aea3e branch checklist keeps it a distinct checkbox; recommend a separate PR) |

## 10. Scope decisions (made, not open)

1. Tests/Workflows/Performance/History/Notes/Proxy/Mock/Watcher rail views are **out of scope** — they remain alongside the unified explorer.
2. The staging "explored interfaces → Add to Project" workflow is **deprecated by design** (F-19); the unified "load = project" model wins. Do not port the staging list.
3. Dead code (F-28…F-31, F-25, F-27) is **removed in the legacy-retirement phase**, not in the port.
4. History for unified executions goes to the **same global history store** (`add_history_entry`) — two history stores would be worse.
5. `scrapbook.json` format is **frozen** — existing users' quick requests must survive.

## 11. Open decisions for the team

| # | Question | Options | Recommendation |
|---|----------|---------|----------------|
| Q1 | Where does the Quick Requests section live in the unified UI? | (a) bottom section of unified sidebar (legacy placement); (b) its own rail view; (c) both (sidebar section + rail) | (a) — least surface area, matches muscle memory |
| Q2 | Where do the 6 sample cards render? | (a) unified empty state only; (b) empty state + a persistent "Samples" menu in the top bar | (a) for this branch; (b) is a cheap follow-up |
| Q3 | Do the OpenAPI/GraphQL sample cards ship in the *same* PR as WSDL cards? | yes / no (WSDL cards first) | yes — half-shipped cards (4 dead of 6) are a worse state than waiting one phase |
| Q4 | Auto-capture rule for quick requests in the unified view? | (a) every execution appends; (b) capture only on explicit "Save as quick request"; (c) every execution updates a request keyed by endpoint+operation, else appends | (c) — closest to legacy intent without unbounded growth |
| Q5 | Refresh semantics for OpenAPI/GraphQL projects — same merge/`[Legacy]` behaviour as WSDL? | yes / define separately | yes, for consistency |
| Q6 | History write for unified executions — confirmed in (phase 4) or split out? | include / split | include — a unified request that vanishes from History is a user-visible regression vs legacy |
| Q7 | Port the WSDL refresh **diff/apply UI** (legacy `wsdlDiff`)? | port / skip (server-side merge is the new model) | skip for this branch — server-side merge is a superset for the common case; revisit if diff UX is requested |
| Q8 | Context-menu **rename** (project/operation/request) in the unified view? | port now / defer | port now — its absence is the most conspicuous menu gap; low effort, additive |
| Q9 | Cross-operation request **move** (legacy modal)? | port / skip | skip — drag-drop reorder covers 95% of the use; low value per line count |
| Q10 | `get_scrapbook_request` (registered, unused) — wire into port or delete? | wire / delete | delete in Phase 6 cleanup; the panel's own CRUD covers the need |
| Q11 | Legacy EXPLORER view retirement — same PR as port or separate? | same / separate | separate PR (risk R10); this doc's Phase 6 is the trigger |
| Q12 | Port **project folders** (F-33) into the unified model? Legacy `ApinoxProject` has `folders?: ApinoxFolder[]`; `UnifiedProject` is flat. Options: (a) port folders + `save_folders` into unified projects; (b) skip — WSDL-driven projects are operation-per-service and folders rarely apply | (a) / (b) | (b) for this branch: folders are a manual-organization feature for large hand-built projects, orthogonal to the required ports; revisit after legacy retirement if users ask. Note: legacy projects containing folders can already not be opened by the unified view (different project format), so no data is lost by (b) until/unless a legacy→unified import is ever built |

## 12. Branch handoff (for t_d98aea3e)

- Branch: `feat/unified-explorer-porting` from `main` @ `3f7bc2f`.
- Branch description should cite this document and mark the REQUIRED items: **Quick requests sidebar (F-01/F-02)**, **Sample API cards (F-03)** — plus the enabling work they depend on (F-04/F-05/F-06/F-07).
- Checklist (one checkbox per line, mirroring §4/§6):
  - [ ] Phase 0: test floor (ScrapbookContext/Panel tests, sample-card contract, Rust format-error tests)
  - [ ] Phase 1: `parse_spec_as_project` for OpenAPI/GraphQL with `sample_` naming + refresh merge (Rust tests)
  - [ ] **Quick requests sidebar in unified explorer (REQUIRED)** — section renders, CRUD, edit+run surface
  - [ ] **Quick requests auto-save for unified selection model (REQUIRED)** — capture rule per Q4
  - [ ] **Sample API cards — all 6 exact URLs (REQUIRED)** — render + pre-fill
  - [ ] OpenAPI/GraphQL load wiring + file filters (json/yaml/yml) + drag-drop
  - [ ] REST execution in unified view
  - [ ] GraphQL execution in unified view (query wrapping)
  - [ ] History write on all unified executions
  - [ ] Deferred: cancel WSDL load / cancel request / WSDL proxy toggle (or explicit descoping)
  - [ ] Context-menu rename (if Q8 = yes)
  - [ ] Project folders in unified model (if Q12 = port; else explicit descoping note in PR)
  - [ ] `UnifiedProject.source` union extended with `'graphql'` (additive type change)
  - [ ] Docs: helpContent sample APIs, AGENTS.md
  - [ ] Legacy retirement (separate PR, Phase 6): EXPLORER view + dead code F-27…F-31
  - [ ] Verification report: `npm test` + `cargo test` + manual E2E script from §8

Every REQUIRED item is individually tracked in the checklist so branch work cannot complete with a required gap.
