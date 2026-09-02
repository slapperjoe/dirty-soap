# PR description — `feat/unified-explorer-porting`

> Paste into the GitHub PR body when the PR is opened. Branch description is
> complete as of the docs commit; the checklist below is the implementation
> tracker (one checkbox per line, mirroring §4/§6 of the decision document).

- **Branch**: `feat/unified-explorer-porting`
- **Base**: `main` @ `3f7bc2fd8de2f0f4620dfca17c7d13976d28eec0` (`3f7bc2f`)
- **Docs commit on this branch**: `5224063` (decision document + legacy inventory)
- **Decision document**: `docs/UNIFIED_EXPLORER_PARITY_DECISION.md`
- **Status**: ready for implementation tasks (no feature code on this branch yet)

## Summary

The Unified Explorer (`UNIFIED_EXPLORER` rail view) is intended to replace the
legacy Workspace and API Explorer views. This branch ports the missing
functionality so it can do that. The approved decision document
(`docs/UNIFIED_EXPLORER_PARITY_DECISION.md`, reviewed at `3f7bc2f`) inventoried
33 legacy features with exactly one side-by-side decision each
(12 missing / 4 partial / 7 present / 6 deprecated / 4 not-worth) and defines
the porting order, acceptance criteria, and test-coverage floor.

**Approved REQUIRED scope** (must ship on this branch, individually tracked):

1. **Quick requests sidebar** (F-01) — scrapbook/quick-requests section in the
   unified explorer sidebar: create/select/delete/edit + run.
2. **Quick requests auto-save** (F-02) — re-wired for the unified selection
   model so executed/edited requests are captured into `scrapbook.json`
   (capture rule per open decision Q4 — recommended: upsert keyed by
   endpoint+operation).
3. **Sample API cards** (F-03) — all 6 cards in the unified empty state with
   the exact URLs from §5.2 of the decision document (Petstore JSON + YAML,
   Country Info, Calculator, SpaceX, Rick & Morty); click pre-fills the URL
   input and sets the correct input type.

**Enabling work the REQUIRED items depend on** (cards are dead without these):

- F-04 OpenAPI load routed into the `UnifiedProject` model
  (`parse_spec_as_project`; `UnifiedProject.source` union extended additively
  with `'graphql'`).
- F-05 GraphQL load (introspection) routed into the `UnifiedProject` model.
- F-06 REST execution + F-07 GraphQL execution in the unified execute path.

## Out of scope (decided, per §10 of the decision document)

- Tests / Workflows / Performance / History / Notes / Proxy & Traffic / Mock
  Server / File Watcher rail views stay alongside the unified explorer.
- Legacy staging flow ("explored interfaces → Add to Project") is deprecated by
  design — the unified "load = project" model wins (F-19).
- Dead-code removal (F-27…F-31, F-25) happens in the legacy-retirement phase,
  as a **separate PR** (open decision Q11; risk R10).
- NOT WORTH items (F-24 WSDL URL history, F-25 sample-schema modal, F-26
  welcome panel, F-32 preview naming/badges) are not ported.
- Project folders (F-33) deferred per Q12 recommendation (skip for this
  branch; explicit descoping note below if Q12 lands on skip).
- The `scrapbook.json` schema is frozen — existing quick requests must load
  unchanged.

## Implementation checklist (derived from decision doc §4/§6/§7)

### Phase 0 — Test floor
- [ ] Unit tests: `ScrapbookContext` CRUD against mocked bridge
      (load on mount, create defaults incl. id/timestamps, update, delete
      clears selection, `scrapbookLoaded`/`scrapbookUpdated` re-sync + prunes
      deleted selection)
- [ ] Unit tests: `ScrapbookPanel` render (list/empty/loading) +
      create/delete/execute callbacks fire with right ids + context menu
- [ ] Contract defined for sample-card component (6 cards, exact URLs from
      §5.2) before implementation
- [ ] Rust unit tests: unified load-format error behaviour (non-WSDL URL to
      WSDL path errors cleanly)
- [ ] `npm test` green with the new floor in place

### Phase 1 — Rust foundation
- [ ] `parse_spec_as_project` (or extended command) for OpenAPI/GraphQL →
      `UnifiedProject` (F-04, F-05)
- [ ] `sample_<operation>` starter-request naming enforced (R2 trap: legacy
      builders emit `Sample`; tree hides `startsWith('sample_')`)
- [ ] Refresh merge for non-WSDL sources (preserve user requests,
      `[Legacy]` rename for removed ops; duplicate `sourceUrl` → refresh)
- [ ] Rust tests: OpenAPI fixture (tag grouping, `sample_` naming, JSON
      bodies), GraphQL fixture (Query/Mutation, `__typename` starters),
      refresh-merge + duplicate-sourceUrl cases

### Phase 2 — REQUIRED: Quick requests sidebar (F-01, F-02)
- [ ] **Quick requests sidebar in unified explorer (REQUIRED)** — section
      renders in `UnifiedExplorerSidebar` (bottom section, per Q1
      recommendation); create/select/delete work; empty + loading states
      render
- [ ] Selecting a quick request drives the main area via a
      `selectedNode`-style node (`type === 'scrapbook'`); editor surface shows
      endpoint/headers/body with Run + save-back via
      `ScrapbookContext.updateRequest`; response renders in the unified
      response viewer
- [ ] **Quick requests auto-save for unified selection model (REQUIRED)** —
      capture at unified execute/save path (decision doc §5.1(4), option b;
      leave the legacy `useScrapbookAutoSave` hook untouched, R4); capture
      rule per Q4 (recommended: upsert keyed by endpoint+operation)
- [ ] Persists to `~/.apinox/scrapbook.json` and survives app restart
      (verify file contents); schema unchanged
- [ ] Error paths keep working: missing/corrupt `scrapbook.json` → empty
      state, no crash; config-dir error surfaced via error event
- [ ] Legacy view's quick requests unaffected (regression check)

### Phase 3 — REQUIRED: Sample API cards (F-03) + load wiring (F-04, F-05, F-09)
- [ ] **Sample API cards — all 6 exact URLs (REQUIRED)** — render in unified
      empty state (per Q2 recommendation); click pre-fills URL input with the
      exact strings from §5.2:
      - `https://petstore.swagger.io/v2/swagger.json` (Swagger Petstore, OpenAPI)
      - `https://petstore.swagger.io/v2/swagger.yaml` (Petstore YAML, OpenAPI)
      - `http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL` (Country Info, SOAP)
      - `http://www.dneonline.com/calculator.asmx?wsdl` (Calculator, SOAP)
      - `https://spacex-production.up.railway.app/graphql` (SpaceX, GraphQL)
      - `https://rickandmortyapi.com/graphql` (Rick & Morty, GraphQL)
- [ ] All 6 cards load and render operations in the unified tree (Petstore →
      ops per tag; SpaceX/Rick & Morty → Query/Mutation; Country Info/
      Calculator → WSDL ops)
- [ ] File import dialog filters extended to `.wsdl,.xml,.json,.yaml,.yml`
      + drag-drop import (F-09); file imports route by extension like URLs
- [ ] `UnifiedProject.source` union extended additively with `'graphql'`
      (models.ts)
- [ ] Docs: `data/helpContent.tsx` "Sample APIs" section updated

### Phase 4 — Execution parity (F-06, F-07, F-13)
- [ ] REST execution in unified view (`handleExecuteRequest` dispatcher next
      to the existing SOAP path; SOAP path kept byte-identical — R3)
- [ ] GraphQL execution in unified view (raw query wrapped as
      `{"query": ...}`; reuse legacy bridge semantics — R6)
- [ ] Editor Monaco language chosen per request `contentType`/request type
      (no more hardcoded `language="xml"`)
- [ ] History write (`add_history_entry`) on every unified execution
      (SOAP/REST/GraphQL) — entries visible in the global History view
      (Q6 = include; scope decision 4)
- [ ] Regression: Country Info SOAP operation executes as before,
      content-type override respected

### Phase 5 — Deferred parity (each item manual-checked, or explicitly
### descoped in this PR description)
- [ ] Cancel WSDL load (F-10) — port or explicit descoping
- [ ] Cancel in-flight request (F-11) — port or explicit descoping
- [ ] WSDL load via proxy toggle (F-23) — port or explicit descoping
- [ ] Context-menu rename for project/operation/request (F-17; Q8 = port now
      — recommended)
- [ ] Project folders in unified model (F-33) — port or explicit descoping
      note (Q12 recommendation: skip for this branch)
- [ ] WSDL refresh diff/apply UI (F-18) — Q7 recommendation: skip (server-side
      merge is the new model); note decision here

### Cross-cutting / definition of done (§7 of decision document)
- [ ] `npm test` (webview + bridge parity) and `cargo test` (src-tauri) pass
- [ ] Legacy EXPLORER view still fully functional until Phase 6 (no
      user-visible regression during the port)
- [ ] No changes to `scrapbook.json` file schema; fixture with ≥3 requests
      (incl. one REST) round-trips unchanged
- [ ] No changes to `UnifiedProject` on-disk format beyond additive fields
      (`source` values `openapi`/`graphql`)
- [ ] `AGENTS.md` updated: unified explorer is the primary explorer surface
- [ ] Manual E2E script run (mirrors repo's update-proxy E2E pattern): fresh
      app → each sample card → run one operation per type → verify History →
      create a quick request → restart app → verify persistence
- [ ] Verification report attached to the PR (test output + E2E results)
- [ ] Legacy retirement (Phase 6, **separate PR**): EXPLORER view +
      `ApiExplorerMain`/`ApiExplorerSidebar`/staging flow + dead code
      (F-27, F-28, F-29, F-30, F-31, F-25)

## Open decisions to confirm before Phase 2+ (decision doc §11)

| # | Question | Recommendation |
|---|----------|----------------|
| Q1 | Quick Requests placement in unified UI | (a) bottom section of unified sidebar |
| Q2 | Where sample cards render | (a) unified empty state only |
| Q3 | OpenAPI/GraphQL cards in same PR as WSDL cards | yes |
| Q4 | Quick-request auto-capture rule | (c) upsert keyed by endpoint+operation |
| Q5 | OpenAPI/GraphQL refresh semantics = WSDL merge/`[Legacy]`? | yes |
| Q6 | History write for unified executions | include in Phase 4 |
| Q7 | WSDL refresh diff/apply UI | skip this branch |
| Q8 | Context-menu rename | port now |
| Q9 | Cross-operation request move | skip |
| Q10 | `get_scrapbook_request` (unused command) | delete in Phase 6 cleanup |
| Q11 | Legacy EXPLORER retirement | separate PR |
| Q12 | Project folders (F-33) | skip this branch (explicit note) |

## Risks (top of decision doc §9)

- R1 sample cards ship dead without load routing + execution → porting order
  wires routing before cards (Phase 1 before Phase 3; Phase 4 exit-checks
  execution)
- R2 `Sample` vs `sample_` naming trap → Phase-1 rule + Rust test
- R3 naive REST/GraphQL addition corrupts SOAP → request-type dispatcher,
  SOAP path byte-identical, regression test as gate
- R4 auto-save re-wiring touches shared legacy context → capture at unified
  execute/save path (option b), legacy hook untouched
- R5 data-format drift → additive-only fields + round-trip fixture test per
  `source` value
- R10 scope creep into legacy retirement → Phase 6 is a separate PR
