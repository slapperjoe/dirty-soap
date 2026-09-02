# Unified Explorer Parity — Recommendations (prioritized)

- **Purpose**: Drafted, ranked recommendations for closing the unified explorer parity gaps, suitable for inclusion in `docs/UNIFIED_EXPLORER_PARITY_DECISION.md` (consumed by t_c22dc012 / t_2e8a4080).
- **Inputs**:
  - `docs/UNIFIED_EXPLORER_PARITY_DECISION.md` (baseline, `3f7bc2f`)
  - `docs/UNIFIED_EXPLORER_IMPLEMENTATION_AUDIT.md` (per-item evidence, A-1…A-7, R-g1…R-g5)
  - `.agent/parity_requirements_extract.md` (requirements extraction, Q1–Q12)
- **Code state at drafting**: branch `feat/unified-explorer-porting` @ `9223669`, docs-only; code baseline `3f7bc2f`. Key evidence re-verified live before drafting (see §7).
- **Ranking method**: each item scored on **user impact** (H/M/L), **effort** (S ≈ ≤ half-day, M ≈ 1–2 days, L ≈ 3+ days), **risk**, and **dependencies**. Immediate fixes come first; the ranked plan then maps onto the doc's phase gates (§6) with explicit pull-forwards where the data justifies them.

---

## 1. Immediate fixes (do first — independent, low-risk)

### R-01. Surface execution errors to the user — maps A-7 / R-g3 (F-12 UX)
- **Gap**: `handleExecuteRequest` catches failures and only calls `debugLog` (`UnifiedExplorerMain.tsx:287–290`, verified). A failed request in the unified view produces zero user feedback — worse than legacy, which raises the generic `error` event.
- **Recommendation**: on execute failure, set a user-visible error state (inline banner above the response viewer, or toast) with the error text; keep `debugLog`. Add one webview test that a rejected `execute_soap_request` renders the error surface.
- **Impact H / Effort S / Risk low** — no behavior change on the success path; no Rust changes.
- **Dependencies**: none. **Phase**: Phase 0 (do with the test floor).

### R-02. Send the real resolved operation to `execute_soap_request` — maps A-6 / R-g1
- **Gap**: the execute path locates `ownerOperation` but sends a hardcoded stub (`action: null, input: null, fullSchema: null, targetNamespace: null`, `UnifiedExplorerMain.tsx:238–248`, verified). It works today because `endpoint` + `rawXml` carry the payload, but the doc's R3 mitigation ("keep SOAP path byte-identical") assumes the existing path is a faithful baseline — it is only *functionally* faithful, not structurally.
- **Recommendation**: replace the stub with the real `ownerOperation` fields (action/input/output/targetNamespace/fullSchema, falling back to the stub shape only when `ownerOperation` is genuinely absent). Add a Rust or TS assertion test that the sent operation object carries the resolved action for a saved project.
- **Impact M / Effort S–M / Risk low** — payload bytes unchanged; removes a divergence that would bite the phase-4 dispatcher (R3).
- **Dependencies**: none; **must precede R-09** (phase-4 dispatcher) so the dispatcher starts from a faithful SOAP baseline.

### R-03. Land the test floor — maps A-5 / doc §8
- **Gap**: `unified_explorer.test.tsx` is 14 lines / 1 test; no test touches scrapbook or bridge load routing (audit §8, verified).
- **Recommendation**: before any feature port, add: (a) `unified_explorer_commands.rs` coverage for `parse_spec_as_project` once it exists (see R-05) — for now, lock the current 8 unit tests; (b) webview tests for the scrapbook auto-save hook against the *unified* `selectedNode` model; (c) a bridge load-routing test (URL/file extension → WSDL vs OpenAPI vs GraphQL path). Doc §8.1–8.6 defines the floor; treat it as the Phase-0 exit gate.
- **Impact M (enabler) / Effort M / Risk low** — no production code changes.
- **Dependencies**: none. **Phase**: Phase 0, before R-04.

### R-04. Correct the decision doc's factual discrepancies — maps A-1, A-2, A-4
- **Gap**: (a) unified Rust commands live in `src-tauri/src/parsers/unified_explorer_commands.rs`, not `commands/`; (b) §8 says 7 Rust unit tests, actual count is 8 (verified: `grep -c "fn test_"` = 8); (c) the legacy refresh/diff UI is `WsdlSyncModal.tsx`, not "wsdlDiff".
- **Recommendation**: fix these three citations in the decision doc when the Recommendations section is added (t_c22dc012). An implementer following the doc's paths would hunt for the wrong file and mis-count the test baseline.
- **Impact M (prevent misdirection) / Effort S / Risk none** — docs only.
- **Dependencies**: none. **Phase**: Phase 0.

## 2. Ranked plan (phase-mapped)

Order below is the recommended build order. Phase labels follow doc §6; "pull-forward" notes mark where the impact/effort data argues for earlier work.

### P0 — Phase 2: Quick requests (REQUIRED ⚑)
### R-05. Quick requests sidebar + unified auto-save — maps F-01, F-02 (R-g: none; closes mandatory gap)
- **What**: render `ScrapbookPanel` (or equivalent) as the **bottom section of the unified sidebar** (Q1(a) confirmed — least surface change, preserves muscle memory); make a selected scrapbook request drive `UnifiedExplorerMain` via `selectedNode.type === 'scrapbook'`; Run/Save-back through `ScrapbookContext`; re-wire auto-save per **Q4(c)** — every execution updates the scrapbook entry keyed by endpoint+operation, else appends (no unbounded growth). Do **not** touch the existing legacy `useScrapbookAutoSave` hook (`TestRunnerContext.tsx:84`); add a unified capture path (doc §5.1(4), risk R4).
- **Constraints**: `scrapbook.json` schema is **frozen** — verify with a fixture of ≥3 requests incl. one REST that existing scrapbooks load unchanged. Keep the three documented error paths working (missing/corrupt file → empty state; config-dir error → `error` event; use-outside-provider throws).
- **Scope note**: quick requests execute through the existing SOAP path in Phase 2; REST/GraphQL quick requests become fully functional when R-09 lands (this is consistent with doc §5.1(3) "route through the shared request engine gained in phase 4").
- **Impact H / Effort M / Risk low** — `ScrapbookContext` + `scrapbook_storage.rs` (5 commands) already exist app-wide; this is wiring, not new infrastructure.
- **Dependencies**: none (R-03 test floor helps verify the new capture path).

### P0 — Phase 3: Load routing + Sample APIs (REQUIRED ⚑)
### R-06. OpenAPI + GraphQL load routing — maps F-04, F-05
- **What**: add `parse_spec_as_project` (or extend `parse_wsdl_as_project` with a format router) in `src-tauri/src/parsers/unified_explorer_commands.rs` (A-1 — **not** `commands/`) that builds `UnifiedProject` from `parse_openapi_spec` (port legacy `bridge.ts:216–271` routing: `.json/.yaml/.yml`) and from GraphQL introspection (port `bridge.ts:273–411`: adaptive-depth tiers, Query/Mutation interfaces, `__typename` starter bodies). Extend the file-dialog filter to `wsdl,xml,json,yaml,yml` and add drag-drop (F-09 delta, `ApiExplorerMain.tsx:448–475` reference) in the same change — the two share the routing logic.
- **Hard constraints** (audit §6 / doc §5.3):
  1. Add `'graphql'` to `UnifiedProject.source` (`models.ts:411`, additive only) and start **producing** `'openapi'` (today it's declared-but-dead, A-3).
  2. Sample/starter requests **must** be named `sample_<operation>` (lowercase + underscore) or the tree's `name.startsWith('sample_')` filter shows them as user requests (risk R2).
  3. Keep duplicate-`sourceUrl` → refresh; define OpenAPI/GraphQL refresh semantics as re-parse/re-introspect + merge with `[Legacy]` rename, same as WSDL (Q5 confirmed).
  4. On-disk format: additive `source` values only (R5).
- **Impact H (enables 4 of 6 sample cards + all non-SOAP work) / Effort L / Risk M** — new Rust code paths; mitigated by the existing bridge-parity test convention (`bridgeParity.test.ts`) and the §8 test floor (R-03).
- **Dependencies**: R-04 (correct paths). **Blocks**: R-07.

### R-07. Six sample API cards in unified empty state — maps F-03
- **What**: port the six cards verbatim from `ApiExplorerMain.tsx:334–443` (URLs re-verified live, see §7) into the unified `EmptyState` area, grouped OpenAPI / SOAP / GraphQL; click pre-fills the URL input and sets input type. **Empty state only** this branch (Q2(a)); the top-bar "Samples" menu (Q2(b)) is listed under follow-ups. **All six ship in the same PR as the load routing** (Q3 confirmed — 4 dead cards is a worse state than waiting one phase).
- **Impact H (mandatory) / Effort S / Risk low** — pure UI, URLs are constants.
- **Dependencies**: R-06 (sequencing invariant R1 — cards must not land before load routing; phase-3 exit check requires all six to load).

### P1 — Phase 4: Execution parity
### R-08. History write on unified execute — maps F-13 / R-g2
- **What**: write `add_history_entry` from the unified execute handler (legacy reference: `bridge.ts:1232/1254`). Single global history store only — never a second store (doc §10.4, Q6).
- **Pull-forward**: doc schedules this in Phase 4, but it is **low effort (S), high impact (H), and independent** — it closes the most concrete user-visible regression (a unified execution vanishes from History). Implement it against the SOAP execute path in Phase 2 (alongside R-05) and extend it to REST/GraphQL in the phase-4 dispatcher; the doc's phase-4 acceptance criterion ("every execution writes a history entry") is then already satisfied for SOAP.
- **Impact H / Effort S / Risk low**. **Dependencies**: none; extension step depends on R-09.

### R-09. REST + GraphQL execution — maps F-06, F-07 (enables R-05's full scope)
- **What**: a request-type dispatcher in the unified execute path: SOAP → existing `execute_soap_request` (byte-identical, per R3); REST → `execute_rest_request`; GraphQL → raw query wrapped `{"query": …}` (legacy `bridge.ts:439–456`). Choose the Monaco editor `language` per request `contentType`/`requestType` (today hardcoded `xml` — audit §5.3(3), risk R3). Petstore GET+POST and one GraphQL query are the phase-4 acceptance cases.
- **Impact H / Effort L / Risk M** — the riskiest item on the branch; mitigations: R-02 first (faithful SOAP baseline), bridge-parity tests, per-type integration test.
- **Dependencies**: R-06, R-02. **Phase**: 4.

### P2 — Phase 5: Deferred parity (explicitly optional)
### R-10. Context-menu rename — maps F-17 / Q8
- **What**: port rename for project/operation/request (legacy `useContextMenu`). Doc Q8 recommends porting now — it is the most conspicuous menu gap and is additive/low-risk, so **do it in Phase 5 only if the earlier phases land on time; otherwise it descopes cleanly** without touching any required item.
- **Impact M / Effort S / Risk low** — additive persistence field only. **Dependencies**: none.

### R-11. Cancel WSDL load + cancel in-flight request — maps F-10, F-11 / R-g5
- **What**: port `cancelWsdlLoad` / `cancel_request` / `cancel_all_requests` into the unified view.
- **Impact L–M / Effort M / Risk M** — requires abort plumbing through the Rust load path; only matters when WSDLs are slow or requests hang. **Defer**; revisit if users hit it.
- **Dependencies**: none. **Phase**: 5 (or post-branch).

### R-12. WSDL load via proxy toggle — maps F-23 / R-g4 / R9
- **What**: pass the app proxy setting through `parse_wsdl_as_project` (legacy: `useProxy` at `MainContent.tsx:596`, force-off for local files).
- **Impact M for proxy-only environments / Effort S–M / Risk M (R9 — proxy interaction is a known failure mode; the recent update-check fix shows how subtly rustls/OS-proxy issues bite). **Defer to Phase 5; test against the OS-proxy scenario before shipping.**
- **Dependencies**: none.

### R-13. Project folders — maps F-33 / Q12
- **Decision**: **skip this branch** (Q12(b) confirmed) — manual organization, orthogonal to every required port, and it would force a `UnifiedProject` schema addition (`folders` field + storage writes) that complicates the additive-format constraint. Revisit post-legacy-retirement.
- **Impact L / Effort M / Risk M (schema). No dependencies to close; listed so the descoping is explicit rather than silent.

## 3. Explicit non-goals (do NOT port)

Carried verbatim from the decision doc, now audit-verified (audit §4/§5):

| Item | Reason |
|---|---|
| F-19 staging "explored interfaces" workflow | Superseded by unified load=project. Do not port. |
| F-16 cross-operation request move modal | Q9 — in-tree DnD reorder covers ~95% of use. Accept as-is. |
| F-18 WSDL refresh diff/apply UI | Q7 — server-side merge + `[Legacy]` rename is a superset for the common case. Skip this branch; if revisited, target `WsdlSyncModal.tsx` (A-4), not "wsdlDiff". |
| F-24 WSDL URL history | Not worth (10-entry cap, low value). |
| F-25 View Sample Schema modal | Not worth (disabled upstream). |
| F-26 Welcome/changelog panel | Not worth (unified `EmptyState` replaces it). |
| F-32 "(Preview)" naming / SOAP version badges | Not worth (superseded by unified tree). |
| F-27–F-31 dead code (`get_scrapbook_request`, `CollectionList`, `WatcherPanel`, `SidebarView.SERVER` block, `WorkspaceContext` legacy wiring) | **Not this branch.** Removed in the Phase-6 legacy-retirement PR (Q11). Do not wire `get_scrapbook_request` (Q10) — panel CRUD covers the need. |
| Rail views: Tests / Workflows / Performance / History / Notes / Proxy & Traffic / Mock / Watcher | Out of scope by doc §10.1 — they remain independent views alongside the unified explorer. |
| `scrapbook.json` schema changes; non-additive `UnifiedProject` format changes | Hard constraints (frozen schema; additive-only `source` values). |

## 4. Follow-up work (post-branch)

1. **Phase 6 — legacy EXPLORER retirement (separate PR, Q11)**: remove F-19, F-27…F-31 and the legacy `ApiExplorerMain` sample-card block once the unified view is the primary surface; update `AGENTS.md` to name the unified explorer primary.
2. **Top-bar "Samples" menu** (Q2(b)) — cheap follow-up to the empty-state cards.
3. **Revisit list (user-request driven)**: F-18 diff UI (via `WsdlSyncModal.tsx`), F-33 folders, F-24/F-25/F-26 if users ask, F-10/F-11 cancel if slow WSDLs are reported.
4. **Proxy hardening** (R12 context): the recent update-check fix (OS proxy + rustls/webpki roots) is the prior art for any new network-path work in the explorer; reuse its root-store approach.

## 5. Decision confirmations (Q1–Q12)

Confirmed as recommended by the decision doc, with audit corrections folded in:

| Q | Decision (confirmed) |
|---|---|
| Q1 | Quick Requests = bottom section of unified sidebar. |
| Q2 | Sample cards in unified empty state only this branch; top-bar menu is follow-up. |
| Q3 | All 6 cards ship with load routing, same PR. |
| Q4 | Auto-capture = update entry keyed by endpoint+operation, else append. |
| Q5 | OpenAPI/GraphQL refresh = re-parse/re-introspect + merge, same as WSDL. |
| Q6 | History write included; **pulled forward to the SOAP path in phase 2** (R-08) — phase-4 criterion unchanged. |
| Q7 | Skip diff UI this branch; real component is `WsdlSyncModal.tsx` (A-4). |
| Q8 | Port rename now (R-10); descopes cleanly if phases slip. |
| Q9 | Skip cross-operation move. |
| Q10 | Delete `get_scrapbook_request` in Phase 6; do not wire. |
| Q11 | Legacy retirement = separate PR. |
| Q12 | Skip folders this branch (R-13). |

## 6. Summary table (ranked)

| # | Rec | Gap | Phase | Impact | Effort | Risk | Deps |
|---|-----|-----|-------|--------|--------|------|------|
| R-01 | Surface execution errors | A-7 / R-g3 | 0 | H | S | low | — |
| R-02 | Real operation on execute | A-6 / R-g1 | 0 | M | S–M | low | — |
| R-03 | Test floor | A-5 / §8 | 0 | M (enabler) | M | low | — |
| R-04 | Doc corrections | A-1/2/4 | 0 | M (enabler) | S | none | — |
| R-05 | Quick requests + auto-save ⚑ | F-01, F-02 | 2 | H | M | low | R-03 |
| R-08 | History write (pulled forward) ⚑* | F-13 / R-g2 | 2 (ext. 4) | H | S | low | — |
| R-06 | OpenAPI/GraphQL load routing ⚑* | F-04, F-05, F-09 | 3 | H | L | M | R-04 |
| R-07 | Six sample cards ⚑ | F-03 | 3 | H | S | low | R-06 |
| R-09 | REST+GraphQL execution | F-06, F-07 | 4 | H | L | M | R-06, R-02 |
| R-10 | Context-menu rename | F-17 / Q8 | 5 | M | S | low | — |
| R-11 | Cancel load/request | F-10, F-11 / R-g5 | 5 | L–M | M | M | — |
| R-12 | Proxy toggle on load | F-23 / R-g4 | 5 | M | S–M | M | — |
| R-13 | Project folders — **skip** | F-33 / Q12 | n/a | L | M | M | — |

⚑ REQUIRED for branch DoD. ⚑* mandatory for branch DoD (enabling item). R-08 is not ⚑-marked in the doc but closes a user-visible regression cheaply; the pull-forward is this draft's one deviation from the doc's phase order, and it does not change any acceptance criterion.

## 7. Verification performed before drafting (live, @ `9223669`)

- `src-tauri/src/parsers/unified_explorer_commands.rs` exists; `grep -c "fn test_"` = **8** (confirms A-2).
- `shared/src/models.ts:411` = `source: 'wsdl' | 'openapi' | 'manual'` (confirms A-3 — no `'graphql'`, `'openapi'` dead).
- `UnifiedExplorerMain.tsx:238–248` nulled stub and `:287–290` debugLog-only catch re-read (confirms A-6, A-7).
- File dialog filter `['wsdl','xml']` at `:199` (confirms F-09 gap).
- `WsdlSyncModal.tsx` present (confirms A-4).
- All six legacy sample-card URLs re-grep'd in `ApiExplorerMain.tsx:348/362/381/395/414/428` — match doc §5.2 verbatim.
- `lib.rs:554` still registers `scrapbook_storage::get_scrapbook_request` (confirms F-27 dead-code status).
