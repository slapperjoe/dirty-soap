# Unified Explorer — Implementation Audit (verified against source)

- **Purpose**: Independent re-verification of `docs/UNIFIED_EXPLORER_PARITY_DECISION.md` (the requirements/decision baseline) against the actual code, producing a gap list with per-item evidence. Feeds the recommendations task (t_5ef97703) and requirements-extraction task (t_04b58432).
- **Repo / HEAD audited**: `/home/mark/code/apinox`, branch `feat/unified-explorer-porting`, HEAD `9223669`.
- **Code baseline**: `3f7bc2f` (branch base, per PR description). `git diff 3f7bc2f..HEAD -- src-tauri shared packages` is **empty** — this branch contains **docs only** (3 markdown files added in `5224063`/`9223669`). No feature code has been ported yet. Therefore "current behavior" == the decision doc's audited baseline, and no new regressions have been introduced by this branch.
- **Method**: every F-item below was re-checked by reading the cited file or running a grep that confirms presence/absence. Line numbers are from `3f7bc2f` (== current HEAD for code). Grep-verified "absent" claims are called out so no claim rests on inference.

## 0. Verdict summary

| Category | Count | F-ids |
|---|---|---|
| MISSING (gap; port required or deferred) | 11 | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-10, F-11, F-13, F-23, F-33 (12 incl. deferred F-33) |
| PARTIAL (delta to port or accept) | 4 | F-09, F-16, F-17, F-18 |
| PRESENT (verified; no action) | 7 | F-08, F-12, F-14, F-15, F-20, F-21, F-22 |
| DEPRECATED (intentional; do not port) | 5 | F-19, F-27, F-28, F-29, F-30, F-31 (6 incl. F-31) |
| NOT WORTH (dropped by decision) | 4 | F-24, F-25, F-26, F-32 |
| **Ambiguous / doc-discrepancy flags** | 7 | A-1 … A-7 (§6) |

The decision doc's 33-item classification is **accurate** against code at `3f7bc2f`. No required/MISSING item was found to be secretly present, and no PRESENT item was found to be actually missing. Three minor inaccuracies in the decision doc and two latent implementation risks are flagged in §6 and §7.

---

## 1. MISSING parity items (gaps)

### F-01 Quick requests (scrapbook) sidebar — **MISSING (REQUIRED ⚑)**
- Evidence (absence, grep-verified): `grep -rni "scrapbook\|quick.request" src-tauri/webview/src/components/explorer/` → **no matches**. `UnifiedExplorerSidebar.tsx` renders only the project→operation→request tree (lines 329–554) with no scrapbook section.
- Evidence (feature exists, just not ported): UI `src-tauri/webview/src/components/sidebar/ScrapbookPanel.tsx`; embedded in legacy `ApiExplorerSidebar.tsx:215` (import at :9); state `src-tauri/webview/src/contexts/ScrapbookContext.tsx`; persistence `src-tauri/src/scrapbook_storage.rs` (5 Tauri commands, lib.rs:550–554).
- Gap: the unified sidebar has no Quick Requests section; the app-level `ScrapbookContext` provider (App.tsx) is present but unconsumed by the unified view.

### F-02 Quick requests auto-save for unified selection model — **MISSING (REQUIRED ⚑)**
- Evidence: `useScrapbookAutoSave` is defined in `ScrapbookContext.tsx` and wired only in `src-tauri/webview/src/contexts/TestRunnerContext.tsx:84`, keyed to legacy selection args (`selectedRequest`/`selectedProjectName`/`selectedInterface`/`selectedOperation`/`selectedTestCase`).
- Evidence (no unified wiring): the unified selection model is `selectedNode` (`{type,id}`) in `UnifiedExplorerMain.tsx:23`/`UnifiedExplorerSidebar.tsx:184`; nothing in `components/explorer/` calls the scrapbook auto-save (grep in §1/F-01 confirms no scrapbook refs there at all).
- Gap: executing/saving a request in the unified view never captures into `scrapbook.json`.

### F-03 Sample API cards (6) — **MISSING (REQUIRED ⚑)**
- Evidence (absence): no sample-card markup in `UnifiedExplorerMain.tsx` / `UnifiedExplorerSidebar.tsx`; the unified empty state is a bare `<EmptyState title="Unified Explorer"…/>` (`UnifiedExplorerMain.tsx:385–390`).
- Evidence (legacy cards, exact URLs, verified): `src-tauri/webview/src/components/explorer/ApiExplorerMain.tsx:334–443`, six `onClick={() => setWsdlUrl(...); setInputType('url')}` cards with labels — Swagger Petstore (`https://petstore.swagger.io/v2/swagger.json`), Petstore YAML (`https://petstore.swagger.io/v2/swagger.yaml`), Country Info (`http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL`), Calculator (`http://www.dneonline.com/calculator.asmx?wsdl`), SpaceX (`https://spacex-production.up.railway.app/graphql`), Rick & Morty (`https://rickandmortyapi.com/graphql`). URLs match decision doc §5.2 verbatim.
- Surviving fragment: only Country Info remains, hardcoded as the default URL input at `UnifiedExplorerMain.tsx:56`.

### F-04 OpenAPI load routing — **MISSING**
- Evidence (WSDL-only load path): unified load is `UnifiedExplorerView.handleLoadWsdl` → `invokeTauriCommand('parse_wsdl_as_project', { url })` (`UnifiedExplorerView.tsx:33–43`) → `src-tauri/src/parsers/unified_explorer_commands.rs:17 parse_wsdl_as_project`, which calls `parse_wsdl` and returns `Err("No services found in WSDL")` for anything non-WSDL (rs:38–40).
- Evidence (absence of a spec route): `grep -rn "parse_spec_as_project" src-tauri/ shared/ src-tauri/webview/src/` → **absent** (the doc's proposed Phase-1 command does not exist yet). `UnifiedProject.source` union is `'wsdl' | 'openapi' | 'manual'` (`shared/src/models.ts:411`) — `'openapi'` is declared but never produced by any command.
- Legacy reference (the logic to port): `src-tauri/webview/src/utils/bridge.ts:216–271` routes `.json/.yaml/.yml` → `parse_openapi_spec`.
- File-dialog consequence: unified File filter is `['wsdl','xml']` only (`UnifiedExplorerMain.tsx:199`).

### F-05 GraphQL load routing — **MISSING**
- Evidence: same WSDL-only path as F-04 (single `parse_wsdl_as_project` entry, `UnifiedExplorerView.tsx:35`); no GraphQL introspection reachable from the unified load path.
- Legacy reference: `bridge.ts:273–411` detects `graphql`/`gql` in the URL path, performs adaptive-depth introspection, and builds Query/Mutation interfaces with `__typename` starter bodies.
- `UnifiedProject.source` lacks a `'graphql'` value (`models.ts:411`) — must be added additively before F-05 can be represented.

### F-06 REST execution — **MISSING**
- Evidence (SOAP-only): `UnifiedExplorerMain.handleExecuteRequest` invokes **only** `execute_soap_request` (`UnifiedExplorerMain.tsx:236`); the request is built with a hardcoded SOAP operation stub (`action: null, input: null, fullSchema: null`, lines 238–248). `grep "execute_rest_request|graphql" src-tauri/webview/src/components/explorer/` matches only the legacy `ApiExplorerMain.tsx` sample cards — not the unified execute path.
- Legacy reference: `bridge.ts:433–505` (`ExecuteRequest` with `requestType === 'rest' | 'graphql'`).

### F-07 GraphQL execution — **MISSING**
- Evidence: no GraphQL execution path in `components/explorer/` (grep as above); the unified execute path is SOAP-only.
- Legacy reference: `bridge.ts:439–456` wraps the raw query as `{"query": …}` for `requestType === 'graphql'`.

### F-10 Cancel WSDL load — **MISSING (deferred)**
- Evidence (absence): `grep "cancelWsdlLoad|Cancel" src-tauri/webview/src/components/explorer/UnifiedExplorer*.tsx` → **absent**. The Load button only toggles a `RefreshCw` spinner (`UnifiedExplorerMain.tsx:345–350`).
- Legacy reference: `FrontendCommand.cancelWsdlLoad` (`shared/src/messages.ts`, group CMD-2); legacy Cancel button in `ApiExplorerMain`.

### F-11 Cancel in-flight request — **MISSING (deferred)**
- Evidence (absence): no `cancelRequest`/`cancelAllRequests` in unified components (grep). `handleExecuteRequest` (`UnifiedExplorerMain.tsx:211–291`) has no cancellation handle.
- Legacy reference: `cancel_request`/`cancel_all_requests` Rust commands (RST-9, `soap::commands`).

### F-13 Request history write on execute — **MISSING (recommended port)**
- Evidence (absence): `grep "add_history_entry|saveRequestHistory|AddHistoryEntry" src-tauri/webview/src/components/explorer/` → **absent**. `handleExecuteRequest` never writes history.
- Legacy reference: `bridge.ts:475/567` call `saveRequestHistory` (defined `bridge.ts:1232`, invokes `add_history_entry` at `bridge.ts:1254`).
- Impact: a unified execution is invisible in the global History view — a user-visible regression vs legacy (see §7 R-g2).

### F-23 WSDL download via proxy toggle — **MISSING (deferred)**
- Evidence (absence): `parse_wsdl_as_project(url: String)` (rs:17) takes **no** proxy parameter; `UnifiedExplorerView.tsx:35` passes only `{ url }`.
- Legacy reference: `useProxy` state `wsdlUseProxy` on `MainContent.tsx:596`, sent with `loadWsdl` at `MainContent.tsx:1466`/`1530` (local files force `useProxy:false` at :1472/`pickLocalWsdl`).

### F-33 User-created folders inside a project — **MISSING (deferred; Q12)**
- Evidence (absence): `UnifiedProject` (`models.ts:407–427`) has **no** `folders` field (fields: name, description, source, sourceUrl, parsedAt, lastRefreshedAt, soapVersion, contentType, bindingName, operations, id). `save_unified_project` (`src-tauri/src/project_storage.rs:825–900`) performs **no** folder writes (`grep folder|save_folders` over that range → none). The unified tree is flat project→operation→request (`UnifiedExplorerSidebar.tsx:344–554`).
- Legacy reference: `ApinoxProject.folders?: ApinoxFolder[]` (`models.ts:354`/`373`/`387`), `FolderTree.tsx`, `save_folders` in legacy `project_storage`.

---

## 2. PARTIAL items (delta present)

### F-09 WSDL load via file — **PARTIAL**
- Present: File button → native dialog → `onLoadWsdl(file://path)` (`UnifiedExplorerMain.tsx:194–209`).
- Gap: dialog filter `['wsdl','xml']` only (`:199`); **no drag-drop** (`grep onDrop|onDragOver` in `UnifiedExplorer*.tsx` → none). Legacy has both broad filters and a drag-drop zone: `ApiExplorerMain.tsx:448–475` (`handleDropZoneDrop`, "Drop to import").
- Delta to port (per doc §5.3): extend filters to json/yaml/yml and add drag-drop when F-04/F-05 land.

### F-16 Drag-drop reorder — **PARTIAL (accept as-is per Q9)**
- Present: reorder within a project (operations) and within an operation (requests) via `onReorderOperation`/`onReorderRequest` (`UnifiedExplorerSidebar.tsx:192–193`, drop handlers :315–319 and :443–445/:495–498, gap-after-last :511/:534).
- Gap: **no cross-operation move modal** (legacy `AddToProjectModal`/move modal). Doc Q9 recommends skipping — acceptable.

### F-17 Context menus — **PARTIAL (rename gap)**
- Present (verified in `buildSections`, `UnifiedExplorerSidebar.tsx:224–255`):
  - project → Refresh WSDL (:229), Export Project (:230), Delete (:242)
  - operation → New Request (:233), Delete
  - request → Copy URL (if endpoint, :236–238), Copy Request XML (:239), Delete
- Gap: **no rename** anywhere (project/operation/request). Legacy `useContextMenu` (HK-3) supports rename. Doc Q8 recommends porting rename now.

### F-18 Refresh WSDL / sync — **PARTIAL (diff UI missing)**
- Present: `refresh_unified_project` (rs:83) re-parses and merges server-side, preserves user requests (rs:135–139), renames removed operations `[Legacy] <name>` (rs:161–177); `refresh_project_wsdl` (rs:208) delegates by sourceUrl; `refresh_project_wsdl`/`refresh_unified_project` both registered (lib.rs:592/593). UI triggers it via "Refresh WSDL" (sidebar :229; main button `UnifiedExplorerMain.tsx:456–473`).
- Gap: **no diff/apply UI**. Legacy surface is `src-tauri/webview/src/components/modals/WsdlSyncModal.tsx` + `apply_wsdl_sync` (lib.rs:590) + `refreshWsdl`/`applyWsdlSync` messages (messages.ts:31–32). Doc Q7 recommends skipping the diff UI this branch.
- **Naming flag (A-4)**: the decision doc calls this "wsdlDiff"; the actual component is `WsdlSyncModal.tsx`. Port/revisit should target that file.

---

## 3. PRESENT items (verified; no action)

- **F-08 WSDL load via URL** — `parse_wsdl_as_project` (rs:17); duplicate `sourceUrl` → refresh (rs:22–30).
- **F-12 SOAP execution + response viewer** — `execute_soap_request` (UnifiedExplorerMain.tsx:236); `MonacoResponseViewer` (line 701); per-request response cache `responses` (line 58) and `lastResponse` persisted into the project (rs:82–108 hydrate, 278–285 persist).
- **F-14 Sample request templates** — `SampleRequestPanel` used at `UnifiedExplorerMain.tsx:571`; Rust `generate_sample_xml` (rs:274) + `build_operation_json` (rs:246); `sample_<op>` requests hidden from tree via `!req.name.startsWith('sample_')` (sidebar :426; main :499/:579).
- **F-15 Project tree** — `UnifiedExplorerSidebar` project→operation→request tree with `selectedNode` selection (:329–554).
- **F-20 Operation/interface detail panel** — richer grid at `UnifiedExplorerMain.tsx:505–568` (SOAP Action, Input schema, SOAP Version, **Content-Type with `resolveEffectiveContentType`** :553–560, Binding, Target Namespace). Superset of legacy `ApiExplorerMain.tsx:125–239`.
- **F-21 Environment variables** — `get_settings` + `get_resolved_environment` on mount (UnifiedExplorerMain.tsx:64–79), passed into `execute_soap_request` (`envVariables`, :254).
- **F-22 Interface-level Content-Type override** — project-level `contentType` + `resolveEffectiveContentType`; dropdown `UnifiedExplorerMain.tsx:429–451`; Rust preserves it across refresh (rs:111–115, 192–195) and applies it in `new_unified_request` (rs:407–435).

---

## 4. DEPRECATED items (verified as superseded / dead code)

- **F-19 Staging "explored interfaces"** — state `exploredInterfaces` lives in `NavigationContext.tsx:24/43`; **absent from** `components/explorer/UnifiedExplorer*.tsx` (grep). Unified "load = project immediately" supersedes it. Do not port.
- **F-27 `get_scrapbook_request` command** — registered at `lib.rs:554` but `grep` finds **no UI caller** anywhere in `src-tauri/webview/src/`/`shared/`. Q10: delete in Phase-6 cleanup.
- **F-28 `CollectionList`** — `grep -rln "CollectionList" src-tauri/webview/src/` → only its own file. Orphaned. `SidebarView.COLLECTIONS` has no rail button.
- **F-29 `WatcherPanel`** — `grep -rln "WatcherPanel"` → only its own file (+ a mention in `ARCHITECTURE.md`). Orphaned.
- **F-30 `SidebarView.SERVER` block** — `WorkspaceLayout.tsx:1004–1011` is a commented-out `// SERVER VIEW` block inside a `/* */` region (ends `*/` at :1010). Dead.
- **F-31 `WorkspaceContext` provider / `testRunnerProps` / `wsdlProps`** — `WorkspaceContext.tsx` defines `createContext` (:250) and `useWorkspace` (:266) but **no `WorkspaceProvider` component exists** (`grep -rn "WorkspaceProvider" src-tauri/webview/src/` → only the `@throws`/doc-comment reference at :256/`useWorkspace` guard). `testRunnerProps`/`wsdlProps` are declared in `SidebarContext.tsx:31/34` (legacy). Do not depend on during the port.

---

## 5. NOT WORTH items (verified; correctly descoped)

- **F-24 WSDL URL history** — legacy `wsdlUrlHistory` (`MainContent.tsx:594`), appended on load and capped `.slice(0, 10)` (`:1468–1470`). Absent in unified. Low value; revisit only if users ask.
- **F-25 View Sample Schema modal** — "temporarily disabled" at `MainContent.tsx:2250` (the `getSampleSchema` command still exists, HK-3). Drop with legacy retirement.
- **F-26 Welcome/changelog landing panel** — `WelcomePanel` (HOME view). Unified has its own `EmptyState` (`UnifiedExplorerMain.tsx:385–390`).
- **F-32 "(Preview)" naming / SOAP version badges** — `ServiceTree.tsx:498` renders `{isExplorer ? '(Preview)' : ''}`; badge CSS :178–179. Superseded by the unified tree.

---

## 6. Ambiguous areas & decision-doc discrepancies (flags)

These are the only places the decision doc and the code do not line up, or where an implementer could go wrong. Each is backed by the cited evidence.

- **A-1 — Real location of the unified Rust commands.** The decision doc cites `unified_explorer_commands.rs` (filename only). The actual file is **`src-tauri/src/parsers/unified_explorer_commands.rs`** (module `parsers`, not `src-tauri/src/commands/`). Registered via `parsers::unified_explorer_commands::*` at `lib.rs:591–597`. Implementation tasks should edit the `parsers/` file, not a `commands/` file.
- **A-2 — Rust unit-test count off by one.** Decision doc §8 says "`unified_explorer_commands.rs` has **7** unit tests." Actual count at `3f7bc2f` is **8** test fns: `test_sanitize_name_clean` (:502), `test_sanitize_name_special_chars` (:508), `test_build_operation_json_structure` (:516), `test_build_operation_json_soap12_content_type` (:545), `test_build_operations_json` (:564), `test_parse_wsdl_as_project_structure` (:601), `test_new_unified_request_inherits_project_content_type_override` (:691), `test_new_unified_request_falls_back_to_soap_version_default` (:701). (The two `new_unified_request` content-type tests appear to have been added after the doc's "7" figure.) Immaterial to parity, but the §8 baseline should read 8.
- **A-3 — `UnifiedProject.source` already has `'openapi'` but never uses it.** `models.ts:411` = `'wsdl' | 'openapi' | 'manual'`. The doc §5.3(1) correctly asks to add `'graphql'`; note `'openapi'` is declared-but-dead today (no command sets it), so the OpenAPI port (F-04) should actually start producing `'openapi'` projects rather than just extending the type.
- **A-4 — Legacy refresh/diff surface is `WsdlSyncModal`, not "wsdlDiff".** See F-18. The decision doc's "(wsdlDiff)" label does not match a file; the real component is `src-tauri/webview/src/components/modals/WsdlSyncModal.tsx`.
- **A-5 — Test floor is genuinely thin.** `components/explorer/__tests__/unified_explorer.test.tsx` is 14 lines / 1 test (sidebar renders "No projects yet") — confirmed. No test touches scrapbook (`find … __tests__ … | xargs grep -l scrapbook` → none) or the bridge load routing. §8's Phase-0 floor is therefore a real gap, not already covered.
- **A-6 — Unified execute nulls the real operation metadata.** `handleExecuteRequest` locates `ownerOperation` (UnifiedExplorerMain.tsx:218–229) but then sends a **hardcoded stub** with `action: null, input: null, fullSchema: null, targetNamespace: null` (lines 238–248). It "works" because `endpoint` + `rawXml` carry the SOAP payload, but this diverges from the legacy `useRequestExecution` path (which uses the real operation object) and will need care when the phase-4 request-type dispatcher (risk R3) is added. Flagged here because the decision doc's R3 mitigation ("keep SOAP path byte-identical") assumes the existing path is a faithful baseline; it is only *functionally* faithful for SOAP, not structurally.
- **A-7 — Silent execution errors.** On execute failure `handleExecuteRequest` only calls `debugLog` (UnifiedExplorerMain.tsx:288–290); there is no user-visible error surface (legacy raises the generic `error` event via `useMessageHandler`). Minor UX gap; worth a note in the phase-4 exit check.

---

## 7. Regressions (capability gaps that are user-visible vs legacy)

Because this branch is docs-only, **no new regressions were introduced by the branch**. The following are existing gaps in the unified implementation that are regressions *relative to the legacy view* and should be treated as part of parity closure (several are the doc's MISSING items already listed in §1; they are restated here with user-impact framing):

- **R-g2 (== F-13)** — Executions made in the unified view do not appear in the global History view. User-visible vs legacy, which writes on every execute.
- **R-g4 (== F-23)** — Unified WSDL load ignores the proxy setting; environments that only reach WSDLs through a proxy lose that capability.
- **R-g5 (== F-10/F-11)** — No way to cancel a WSDL load or an in-flight request in the unified view.
- **R-g1 (== A-6)** — SOAP requests are sent with a nulled operation stub rather than the resolved operation; a fidelity/divergence risk when the execution path is extended.
- **R-g3 (== A-7)** — Execution errors are logged but not surfaced to the user in the unified view.

No **positive** regression (a formerly-working unified feature broken by this branch) exists — there is no code change to have broken anything.

---

## 8. Test-baseline confirmation (decision doc §8)

- `unified_explorer.test.tsx` = 14 lines, 1 test — **confirmed**.
- `unified_explorer_commands.rs` unit tests = **8** (doc said 7; see A-2).
- No tests touch scrapbook or bridge load routing — **confirmed** (grep over all `__tests__` files → none reference scrapbook; no test references the unified load-format routing).
- Existing webview test files (for the implementer's awareness of the conventions): `__tests__/bridgeParity.test.ts` (the M20 bridge↔Rust parity test), `components/explorer/__tests__/unified_explorer.test.tsx`, `hooks/__tests__/useMessageHandler*.test.*`, `components/workspace/__tests__/RequestTypeSelector.test.tsx`, and others under `__tests__/` (15 total).

## 9. Bottom line for downstream tasks

- The decision doc's 33-item parity classification is **sound and matches code**; every MISSING/DEPRECATED/PRESENT determination re-checks cleanly.
- The two REQUIRED items (F-01/F-02 quick requests, F-03 sample cards) are genuinely unimplemented; their enabling work (F-04/F-05 load routing, F-06/F-07 execution) is also unimplemented. Nothing on this branch yet moves them.
- Implementers should: (1) edit the Rust commands in `src-tauri/src/parsers/` (A-1), (2) add `'graphql'` to `UnifiedProject.source` and start producing `'openapi'` (A-3), (3) target `WsdlSyncModal.tsx` if the diff UI is ever ported (A-4), and (4) handle the nulled-operation-stub + silent-error quirks when building the phase-4 dispatcher (A-6, A-7).
