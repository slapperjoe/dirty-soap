# Unified Explorer Parity — Extracted Requirements

Source: `docs/UNIFIED_EXPLORER_PARITY_DECISION.md` (DRAFT FOR REVIEW, 2026-09-02, repo HEAD `3f7bc2f`, branch `feat/unified-explorer-porting`).
Extracted for task t_04b58432. Every requirement below is traceable to a doc section; nothing here is invented beyond the document.

---

## A. Decision context (why this work exists)

- **Goal** (§Scope, p.9): Decide what of the legacy **Workspace** view and legacy **API Explorer** (EXPLORER) view must be ported so the **Unified Explorer** (`UNIFIED_EXPLORER` rail view) can replace them.
- **Out of scope** (p.10, §10.1): the separate rail views Tests, Workflows, Performance, History, Notes, Proxy & Traffic, Mock Server, File Watcher — they stay alongside the unified explorer as their own views; they are NOT "explorer parity" items.
- **Classification legend** (§1): PRESENT / PARTIAL / MISSING / DEPRECATED / NOT WORTH. Items marked ⚑ are the task-mandate **REQUIRED** set. 33 items inventoried; count: 12 missing, 4 partial, 7 present, 6 deprecated, 4 not-worth (§4, p.109).
- **Verification caveat** (p.8, §3 note): the parent inventory rated "GraphQL introspection / OpenAPI sample generation — Present" because the Rust parsers are shared; the doc calls this **incorrect as a parity statement** — the parsers are **not reachable from the unified load path** (F-04/F-05). The unified explorer today cannot load any non-WSDL sample API and cannot execute REST/GraphQL even if loaded.

---

## B. MUST-HAVE parity (⚑ REQUIRED — task mandate, cannot ship without)

These are the only three items the doc marks **⚑ REQUIRED** (§4, p.88–90).

| Req | Feature | Decision | Phases | Source |
|-----|---------|----------|--------|--------|
| R1 | **F-01 — Quick requests (scrapbook) sidebar** in unified explorer (create/select/delete/execute standalone requests) | MISSING → PORT (REQUIRED) | 2 | §3 row F-01, §4, §5.1 |
| R2 | **F-02 — Quick requests auto-save** for the unified selection model (executed/edited requests captured into scrapbook) | MISSING → PORT (REQUIRED) | 2 | §3 row F-02, §4, §5.1(4), §7 |
| R3 | **F-03 — Sample API cards (all 6)** in unified empty state; click pre-fills URL + correct input type | MISSING → PORT (REQUIRED) | 3 | §3 row F-03, §4, §5.2, §7 |

The three REQUIRED items are **deliberately early** (phases 2 and 3) so branch work cannot complete with a required gap (§6, p.159; §12).

### Port details for the REQUIRED items (§5.1)

F-01/F-02 — survives unchanged (app-level/Rust): `ScrapbookContext.tsx`, `scrapbook_storage.rs` (file format `~/.apinox/scrapbook.json` — **do not change the schema**), the 4 FrontendCommands + 2 BackendCommands, the 4 registered Tauri commands. What must move:
1. **UI**: render `ScrapbookPanel` (or equivalent) in `UnifiedExplorerSidebar` — recommend bottom section under the tree, mirroring legacy placement (§5.1(1); placement is open decision Q1).
2. **Selection model**: a selected scrapbook request must drive `UnifiedExplorerMain` via `selectedNode`-style state (e.g. `selectedNode.type === 'scrapbook'`); main area shows an editable surface (endpoint, headers, body) with Run/Save-back via `ScrapbookContext.updateRequest` (§5.1(2)).
3. **Execution**: route through the shared request engine (SOAP/REST/GraphQL) gained in phase 4, so quick requests work for all request types (§5.1(3)).
4. **Auto-save**: re-wire `useScrapbookAutoSave` (currently keyed to legacy selection, `TestRunnerContext.tsx:84`) for the unified model; doc **recommends option (b)** — capture in the unified execute/save path, leave the legacy hook untouched (§5.1(4); risk R4).
5. **Error paths** (inventory §11.4) must keep working: missing/corrupt `scrapbook.json` → empty state; config-dir error → surfaced via `error` event; use-outside-provider throws (§5.1(5)).

F-03 — **exact 6 cards** (§5.2 table, from `ApiExplorerMain.tsx:334–443`):

| # | Label | Group | Exact URL | Type |
|---|-------|-------|-----------|------|
| 1 | Swagger Petstore | OpenAPI | `https://petstore.swagger.io/v2/swagger.json` | OpenAPI 2.0 JSON |
| 2 | Petstore YAML | OpenAPI | `https://petstore.swagger.io/v2/swagger.yaml` | OpenAPI 2.0 YAML |
| 3 | Country Info | SOAP | `http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL` | SOAP WSDL |
| 4 | Calculator | SOAP | `http://www.dneonline.com/calculator.asmx?wsdl` | SOAP WSDL |
| 5 | SpaceX | GraphQL | `https://spacex-production.up.railway.app/graphql` | GraphQL |
| 6 | Rick & Morty | GraphQL | `https://rickandmortyapi.com/graphql` | GraphQL |

Render in unified empty state (decision Q2: empty state only for this branch); click pre-fills URL input + sets input type; update `data/helpContent.tsx` if it references the legacy view (§5.2, §7).

---

## C. ENABLING / must-have for the branch DoD (MISSING → PORT, but not ⚑-marked)

These are not ⚑-REQUIRED, but they are **dependencies of the REQUIRED items** and appear in the branch **definition of done** (§7) and the **branch handoff checklist** (§12). Shipping the REQUIRED items without them produces "dead sample cards" (risk R1). Treat as required-for-branch even though not ⚑-marked.

| Req | Feature | Decision | Phase | Source |
|-----|---------|----------|-------|--------|
| E1 | **F-04 — OpenAPI load** routing into unified `UnifiedProject` (`.json`/`.yaml`/`.yml` → `parse_openapi_spec`; tag grouping; sample JSON bodies) | MISSING → PORT (cards depend on it) | 3 (Rust in 1) | §3 F-04, §4, §5.3, §6 |
| E2 | **F-05 — GraphQL load** routing into unified `UnifiedProject` (introspection, adaptive depth tiers, Query/Mutation interfaces, `__typename` starter bodies) | MISSING → PORT (cards depend on it) | 3 (Rust in 1) | §3 F-05, §4, §5.3, §6 |
| E3 | **F-06 — REST execution** (OpenAPI requests) in unified view | MISSING → PORT | 4 | §3 F-06, §4, §6, §7 |
| E4 | **F-07 — GraphQL execution** (raw query wrapped `{"query":...}`) in unified view | MISSING → PORT | 4 | §3 F-07, §4, §6, §7 |
| E5 | **F-09 — File import filters** extended to json/yaml/yml + drag-drop | PARTIAL → PORT delta | 3 | §3 F-09, §4, §6, §7 |
| E6 | **F-13 — Request history write on unified execute** (→ `add_history_entry`, global History store) | MISSING → PORT (recommended) | 4 | §3 F-13, §4, §6, §7, Q6 |

**Load-routing port traps** (§5.3) that E1/E2 must satisfy:
1. Extend `parse_wsdl_as_project` (or add `parse_spec_as_project`) to build a `UnifiedProject` with `source: 'openapi' | 'graphql'`; the `UnifiedProject.source` union (models.ts:411) currently only allows `'wsdl' | 'openapi' | 'manual'`, so **`'graphql'` must be added** (additive, safe) (§5.3(1)).
2. **Sample-request naming trap**: unified tree hides requests `name.startsWith('sample_')` (lowercase+underscore); legacy builders name starters `'Sample'` (capital). Ported builders **must** use `sample_<operation>` naming or starters appear as real user requests (§5.3(2); risk R2).
3. **Content-type / editor-language trap**: `UnifiedExplorerMain` hardcodes Monaco `language="xml"` + SOAP execution; OpenAPI/GraphQL projects need `language` chosen per request `contentType`/`requestType` and execution routed to `execute_rest_request` (§5.3(3); risk R3).
4. File dialog filters extended (E5); GraphQL/OpenAPI file imports route by extension exactly like URL routing (§5.3(4)).
5. Keep duplicate-`sourceUrl` → refresh behaviour; define OpenAPI/GraphQL refresh semantics (re-introspect/re-parse + merge like WSDL) (§5.3(5); decision Q5).

---

## D. NICE-TO-HAVE / deferred parity (phase 5, optional — may be explicitly descoped)

| Req | Feature | Decision | Source |
|-----|---------|----------|--------|
| N1 | **F-10 — Cancel WSDL load** | MISSING → PORT (deferred, optional) | §3 F-10, §4 |
| N2 | **F-11 — Cancel in-flight request** | MISSING → PORT (deferred, optional) | §3 F-11, §4 |
| N3 | **F-23 — WSDL download via proxy toggle** (`useProxy` on load) | MISSING → PORT (deferred, optional; risk R9) | §3 F-23, §4, §9 R9 |
| N4 | **F-17 — Context-menu rename** (project/operation/request) | PARTIAL → decide (Q8) | §3 F-17, §4, Q8 |
| N5 | **F-33 — Project folders** (grouping ops/requests) in unified model | MISSING → PORT (deferred, decide Q12); blocks nothing else | §3 F-33, §4, Q12 |

Note: N4 and N5 are gated on open decisions Q8 / Q12 (see §F). The §12 checklist lists each as "if Q8 = yes" / "if Q12 = port; else explicit descoping note."

---

## E. NO-PORT buckets (present / accept-as-is / deprecated / not-worth)

- **PRESENT — no action** (F-08, F-12, F-14, F-15, F-20, F-21, F-22): WSDL load via URL; SOAP execution + response viewer; sample request templates; project tree; operation/interface detail panels; env vars; interface-level Content-Type override (§4, p.103).
- **PARTIAL — accept as-is (recommend no port)**: **F-16 — cross-operation request move** (drag-drop reorder already present within project/operation; cross-move low value) (§4, p.99; Q9 → skip).
- **DEPRECATED — do NOT port; remove during legacy retirement (Phase 6, separate task)**: F-19 (staging "explored interfaces"/Add-to-Project — superseded by load=project), F-27 (`get_scrapbook_request` unused command), F-28 (`CollectionList`/COLLECTIONS), F-29 (`WatcherPanel`), F-30 (`SidebarView.SERVER` block), F-31 (`WorkspaceContext`/legacy wiring) (§3, §4 p.107; §10.3; Q10, Q11).
- **NOT WORTH — do not port**: F-24 (WSDL URL history), F-25 (View Sample Schema modal — disabled upstream), F-26 (Welcome/changelog panel — unified `EmptyState` replaces it), F-32 (Preview naming / SOAP version badges) (§4 p.105; §10.1 note).

---

## F. Hard constraints (acceptance-gating invariants)

From §7 (Global) and §10 (Scope decisions, "made, not open"):

1. **`scrapbook.json` schema is FROZEN** — existing scrapbooks must load unchanged; verify with a fixture of ≥3 requests incl. one REST request (§7, §10.5, §5.1).
2. **`UnifiedProject` on-disk format**: additive-only changes — only new `source` values `openapi`/`graphql`; no breaking schema change (§7, §5.3(1); risk R5).
3. **Legacy EXPLORER view stays fully functional until Phase 6** — no user-visible regression during the port; legacy retirement is a **separate PR** (§7, §6 Phase 6, §10, risk R10).
4. **Tests green**: `npm test` (webview + bridge parity) and `cargo test` (src-tauri) must pass (§7).
5. **Documentation**: `data/helpContent.tsx` "Sample APIs" section updated; `AGENTS.md` updated to name the unified explorer as the primary explorer surface (§7).
6. **Single global history store** — unified executions write to the same `add_history_entry`; do not create a second history store (§10.4; Q6).
7. **Scope frozen** (§10): rail views (Tests/Workflows/Performance/History/Notes/Proxy/Mock/Watcher) out of scope; staging workflow deprecated by design (do not port); dead code removed only in retirement phase.

---

## G. Explicit acceptance criteria (definition of done for the branch, §7)

**Global**
- Every REQUIRED item (§4) implemented and verified.
- `npm test` (webview + bridge parity) and `cargo test` (src-tauri) pass.
- Legacy EXPLORER view still fully functional until Phase 6 (no regression).
- No change to `scrapbook.json` schema; existing scrapbooks load unchanged (fixture ≥3 requests incl. one REST).
- No change to `UnifiedProject` on-disk format beyond additive `source` values (`openapi`/`graphql`).
- Docs: `helpContent.tsx` Sample APIs updated; `AGENTS.md` updated.

**Quick requests (phase 2)**
- Quick Requests section visible in unified sidebar; create/select/delete work; empty + loading states render.
- Selecting a quick request opens it editable (endpoint, headers, body) with Run; response renders in the unified response viewer.
- Editing/saving a quick request persists to `scrapbook.json` (verify file contents after restart).
- Auto-capture: executing a unified request appends/updates the scrapbook entry per the chosen capture rule (Q4).
- Corrupt/missing `scrapbook.json` → empty state, no crash.

**Sample APIs (phase 3)**
- All 6 cards present in unified empty state with the exact §5.2 URLs; click pre-fills the URL input.
- Each sample loads: Petstore (both) → REST ops; Country Info + Calculator → SOAP ops; SpaceX + Rick & Morty → Query/Mutation ops.
- File import accepts `.wsdl,.xml,.json,.yaml,.yml` and drag-drop works.

**Execution parity (phase 4)**
- Petstore `GET` and a `POST` with JSON body execute from the unified view and return the response.
- A SpaceX/Rick & Morty query executes (GraphQL payload wrapping verified).
- Every execution (SOAP/REST/GraphQL) writes a history entry visible in the History view.
- SOAP regression: Country Info operation executes as before (content-type override respected).

**Test coverage floor** — tests from §8.1–8.6 exist and pass.

---

## H. Open decisions (Q1–Q12, §11) with doc recommendations — inputs for the recommendations draft

| # | Question | Doc recommendation |
|---|----------|--------------------|
| Q1 | Where does Quick Requests live in unified UI? | (a) bottom section of unified sidebar (least surface, muscle memory) |
| Q2 | Where do the 6 sample cards render? | (a) unified empty state only for this branch; (b) top-bar "Samples" menu is a cheap follow-up |
| Q3 | Do OpenAPI/GraphQL cards ship in the same PR as WSDL cards? | yes — 4-dead-of-6 cards is a worse state than waiting one phase |
| Q4 | Auto-capture rule for quick requests? | (c) every execution updates a request keyed by endpoint+operation, else appends (closest to legacy intent, no unbounded growth) |
| Q5 | Refresh semantics for OpenAPI/GraphQL — same merge/`[Legacy]` as WSDL? | yes, for consistency |
| Q6 | History write for unified executions — include in phase 4 or split? | include (a unified request vanishing from History is a user-visible regression) |
| Q7 | Port WSDL refresh diff/apply UI (legacy `wsdlDiff`)? | skip this branch — server-side merge is a superset for the common case; revisit if requested |
| Q8 | Context-menu rename in unified view? | port now — most conspicuous menu gap; low effort, additive |
| Q9 | Cross-operation request move (legacy modal)? | skip — drag-drop reorder covers 95% of use |
| Q10 | `get_scrapbook_request` (registered, unused) — wire or delete? | delete in Phase 6 cleanup; panel CRUD covers the need |
| Q11 | Legacy EXPLORER retirement — same PR or separate? | separate PR (risk R10); Phase 6 is the trigger |
| Q12 | Port project folders (F-33) into unified model? | (b) skip this branch — manual-organization feature, orthogonal to required ports; revisit after legacy retirement |

---

## I. Recommended porting order (phase gates, §6) — sequencing constraint

Phase 0 (test floor) → Phase 1 (Rust `parse_spec_as_project`) → **Phase 2 (Quick requests ⚑)** → **Phase 3 (Sample APIs ⚑ + load routing)** → Phase 4 (execution parity: REST/GraphQL + history) → Phase 5 (deferred parity) → Phase 6 (legacy retirement, separate PR).

Sequencing invariant (risk R1): **OpenAPI/GraphQL load routing must land before sample cards; cards must not land ahead of phase 1.** Phase 3 exit check requires all 6 cards to load; phase 4 requires execution. Phase 2 and Phase 3 are the two REQUIRED items and are deliberately early.
