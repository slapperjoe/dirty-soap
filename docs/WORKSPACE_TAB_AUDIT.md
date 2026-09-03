# Audit — "workspace tab" remnants & unified-explorer wiring

Task: t_1ac91034 · Branch base: `2f41c35` (feat/unified-explorer-porting lineage + Phase 6 on top) · 2026-09-03

## 0. TL;DR

- **What "the workspace tab" is**: the **`PROJECTS`** rail view (`SidebarView.PROJECTS`,
  `shared/src/models.ts:510`). The rail button is titled **"Projects"**
  (`SidebarRail.tsx:114-119`) but its sidebar body header literally reads
  **`>Workspace<`** (`components/sidebar/ProjectList.tsx:478`), and the decision docs call
  the legacy surface the "legacy Workspace" view. There is **no literal "Workspace" rail
  tab** — the label "Workspace" appears only as the Projects-view body header, the Help
  page, and Export labels. The legacy **EXPLORER** (WSDL) rail view was already removed in
  Phase 6 (`2f41c35`); `SidebarView.EXPLORER` no longer exists.
- **Why the user still sees it**: Phase 6 retired the legacy *EXPLORER* (WSDL) surface,
  but the **PROJECTS/"Workspace"** rail button was **never** removed. It is the only
  explorer-ish view not covered by Phase 6, and it is **not** in the decision doc's
  "stay alongside the unified explorer" list (that list is Tests/Workflows/Performance/
  History/Notes/Proxy/Mock/Watcher only).
- **Decision**: **Remove the rail entry and redirect deep-links to `UNIFIED_EXPLORER`.**
  Do **not** hard-delete the view this cycle — it is **load-bearing** (TESTS view opens
  request-steps into it) and is the **only access to the legacy `ApinoxProject` on-disk
  store**, which is a *separate* data store from the unified `UnifiedProject` store with
  **no import/migration path**. Full deletion is a larger follow-up (see §5/§6).

## 1. The two project stores (the crux)

| | Legacy "Workspace" (PROJECTS) | Unified Explorer |
|---|---|---|
| Model | `ApinoxProject` (`models.ts:383`) — `interfaces: ApiInterface[]`, `folders?`, `testSuites?` | `UnifiedProject` (`models.ts:409`) — `source`, `operations: ApiOperation[]` (flat), `sourceUrl`, `parsedAt` |
| On-disk dir | `<config>/projects/<name>/` (`project_storage.rs:9-11`) | `<config>/unified-projects/<name>/` (`save_unified_project`, `project_storage.rs:748+`) |
| List command | `list_projects` → `ProjectContext.tsx:200` | `list_unified_projects` → `MainContent.tsx:245` |
| Save/load | `save_project` / `load_project` | `save_unified_project` (refresh/new via `parsers/unified_explorer_commands.rs`) |
| **Migration / import between them** | **NONE exists** — no `migrate`, `import_legacy`, or cross-store reader in `src-tauri/src` | **NONE** |

**Consequence:** removing the PROJECTS view removes the *only* UI that can open, browse,
edit, import (SoapUI), bulk-import, export, and run the legacy `ApinoxProject` store.
Existing users with `projects/` content would lose UI access to it. The unified explorer
does **not** render legacy `ApinoxProject`s (its sidebar/main only consume
`UnifiedProject[]` — `UnifiedExplorerSidebar.tsx:10,186`, `UnifiedExplorerMain.tsx:15,37`).

**Coupling:** the **TESTS** view is built on the *legacy* model
(`TestRunnerContext.tsx:59` → `useProject()` → `ApinoxProject`), and a test's request-step
opens *into* the PROJECTS view: `openStepRequest` →
`setSelectedRequest(req); setActiveView(SidebarView.PROJECTS)` (`MainContent.tsx:1637`).
So PROJECTS is the request-editor surface the TESTS view hands off to — hard-deleting it
would strand legacy test request-steps.

## 2. Every place the "workspace tab" (PROJECTS) is registered / rendered / linked / tested

### 2a. Registered (navigation)
- **`shared/src/models.ts:510`** — `PROJECTS = 'projects'` enum member (the definition).
- **`components/sidebar/SidebarRail.tsx:114-119`** — the **rail NavItem** (FolderIcon,
  `title="Projects"`, `active=...===PROJECTS`, `onClick→onChangeView(PROJECTS)`).
  **This is the user-visible "tab" to remove.**
- **`contexts/NavigationContext.tsx:38`** — default startup view is already
  `UNIFIED_EXPLORER` (good — entry point is correct).
- **`contexts/NavigationContext.tsx:65-77`** — `SwitchToView` `viewMap`: both
  `'explorer'` and `'unified_explorer'` → `UNIFIED_EXPLORER` (Phase 6 done);
  `'projects'` → `PROJECTS` (`:69`).

### 2b. Rendered (view surface)
- **`components/Sidebar.tsx:173-220`** — `activeView===PROJECTS` → renders the
  `ProjectList` body (the legacy project tree).
- **`components/sidebar/ProjectList.tsx:478`** — the `>Workspace<` body header (plus
  `Import SoapUI Workspace` `:504`, `Import Project / Workspace` `:522`,
  `Export Workspace` `:494`).
- **`components/WorkspaceLayout.tsx:847`** — `if (activeView===PROJECTS)` → the legacy
  request/operation editor surface (create-request-from-sample, `OperationSummary`, etc.).
- **`components/WorkspaceLayout.tsx:1093,1095`** — breadcrumb only shown/ built for
  `PROJECTS`.
- **`components/MainContent.tsx:1960`** — the `WorkspaceLayout` container renders for
  every view *except* PROXY/MOCK/WATCHER/NOTES/UNIFIED_EXPLORER (i.e. it renders for
  PROJECTS, TESTS, WORKFLOWS, PERFORMANCE, HISTORY, HOME).
- **`data/helpContent.tsx:102-129`** — Help "Core → **Workspace**" page
  (label `'Workspace'`, content "Workspace & Projects").

### 2c. Linked / deep-linked (navigation targets)
- **`contexts/SearchContext.tsx:195-196`** — search result `view==='projects'` →
  `setActiveView(PROJECTS)`.
- **`components/SearchDropdown.tsx:219`** — `getViewDisplayName('projects')='Projects'`.
- **`hooks/useLayoutHandler.ts:118`** — layout reset branch for `PROJECTS`.
- **`components/MainContent.tsx:657`** — "switch TO Projects" perf-request clear.
- **`components/MainContent.tsx:1637`** — `openStepRequest` → `setActiveView(PROJECTS)`
  (**TESTS → PROJECTS coupling**, §1).
- **`components/MainContent.tsx:2260`** — "add request to test case" → `setActiveView(PROJECTS)`.
- **`components/MainContent.tsx:2351`** — bulk- / URL-import → `setActiveView(PROJECTS)`.
- **No external deep links:** `BackendCommand.SwitchToView` is defined
  (`shared/src/messages.ts:172`) and consumed (`NavigationContext.tsx:61`) but **no Rust
  command or UI sends it** (grep confirms only the enum + the consumer). `useAppLifecycle`
  does **not** persist/restore `activeView`. So the only entry points are the rail button
  + the four internal `setActiveView(PROJECTS)` calls + search.

### 2d. Tested
- **`components/__tests__/DeletePattern.test.tsx`** — renders `ProjectList` directly and
  asserts delete/confirm. Pins the component (not the rail entry).
- **No test renders `SidebarRail` or asserts a "Projects"/"Workspace" nav item exists**
  (grep over all `*.test.tsx`/`*.test.ts` → none). So removing the rail entry breaks no
  test; removing `ProjectList` breaks `DeletePattern.test.tsx`.
- The six `components/explorer/__tests__/unified_*.test.tsx` reference `'projects'` only as
  the `projects: UnifiedProject[]` prop — **unrelated** to the PROJECTS view.

## 3. What Phase 6 already did (so this is the *remainder*)

`2f41c35` removed: the legacy **EXPLORER** (WSDL) rail view + `SidebarView.EXPLORER`
(rewired `'explorer'`→`UNIFIED_EXPLORER`), `ApiExplorerMain`/`ApiExplorerSidebar`, the
`exploredInterfaces` staging (F-19), dead `get_scrapbook_request` (F-27), `CollectionList`
(F-28), `WatcherPanel` (F-29), the commented `SERVER` block (F-30), legacy `wsdlProps` /
`testRunnerProps` (F-31), and `getSampleSchema`/sample-modal (F-25). **It did not touch the
PROJECTS/"Workspace" rail view** — that is what remains.

## 4. Recommendation

**Phase A (this cycle, minimal, safe — the "sort this out" fix): remove the tab + redirect.**
1. **Delete the rail entry** `SidebarRail.tsx:114-119` (the "Projects"/Workspace button).
   Remove the now-unused `FolderIcon` import if unused elsewhere.
2. **Keep the PROJECTS view code functional** (do **not** delete `ProjectList`,
   `WorkspaceLayout` PROJECTS block, or the PROJECTS enum). It stays reachable
   programmatically for the **TESTS → request-step** hand-off (`openStepRequest`) and for
   any legacy-project deep-link — this preserves state, permissions, and deep links.
3. **Redirect the four internal deep-links to `UNIFIED_EXPLORER`** so nothing new points
   at the hidden view: `MainContent.tsx:1637 (openStepRequest)`, `:2260`, `:2351`, and
   `SearchContext.tsx:196`. Keep `NavigationContext.tsx:69` `viewMap['projects']→PROJECTS`
   as a backward-compat target (harmless; nothing sends `'projects'` today).
4. **Update `helpContent.tsx:102-129`**: relabel/redirect the "Workspace" page to the
   unified explorer (or fold its content into the existing "Explorer" group).
5. **Add the regression test** (child `t_1340c643`): assert `SidebarRail` renders **no**
   `title="Projects"`/`title="Workspace"` nav item and that default/switch resolves to
   `UNIFIED_EXPLORER`; keep `DeletePattern.test.tsx` passing.

Result: the workspace tab no longer appears; unified explorer is the entry point; the app
builds cleanly; legacy data and the TESTS hand-off remain reachable. This satisfies the
child task `t_762df439` acceptance **without** the data-loss / test-stranding risk of
full deletion.

**Phase B (larger follow-up, needs product decision — NOT this cycle): full deletion.**
Requires, before the PROJECTS view / `ApinoxProject` store can be deleted:
- a **legacy→unified import/migration** (read `<config>/projects/*` `ApinoxProject`,
  convert to `UnifiedProject`, write to `<config>/unified-projects/`), **or** an explicit
  decision to deprecate the legacy store;
- re-pointing the **TESTS view off the legacy `ApinoxProject` model** (currently
  `TestRunnerContext.tsx:59` → `useProject()`) so `openStepRequest` no longer needs
  PROJECTS;
- relocating **SoapUI/bulk import + export** (currently only in `ProjectList`) into the
  unified surface;
- then delete `ProjectList`, the `WorkspaceLayout` PROJECTS block + breadcrumb,
  `Sidebar.tsx:173-220`, the `PROJECTS` enum member, and `DeletePattern.test.tsx`.

## 5. Exact minimal change list for Phase A

| # | File | Line(s) | Change |
|---|------|---------|--------|
| 1 | `src-tauri/webview/src/components/sidebar/SidebarRail.tsx` | 114-119 | Delete the `PROJECTS` `NavItem` (and unused `FolderIcon` import if none else) |
| 2 | `src-tauri/webview/src/components/MainContent.tsx` | 1637 | `openStepRequest` → `setActiveView(UNIFIED_EXPLORER)` **or** keep `PROJECTS` (see note) |
| 3 | `src-tauri/webview/src/components/MainContent.tsx` | 2260 | `setActiveView(PROJECTS)` → `UNIFIED_EXPLORER` |
| 4 | `src-tauri/webview/src/components/MainContent.tsx` | 2351 | `setActiveView(PROJECTS)` → `UNIFIED_EXPLORER` |
| 5 | `src-tauri/webview/src/contexts/SearchContext.tsx` | 196 | `setActiveView(PROJECTS)` → `UNIFIED_EXPLORER` |
| 6 | `src-tauri/webview/src/data/helpContent.tsx` | 102-129 | Relabel/redirect "Workspace" help page to unified explorer |
| 7 | *(new)* `components/sidebar/__tests__/SidebarRail.test.tsx` | — | Assert no Projects/Workspace rail item; default view `UNIFIED_EXPLORER` (child `t_1340c643`) |

> Note on #2 (`openStepRequest`): TESTS request-steps are legacy `ApinoxProject`
> requests; the unified explorer does not render them. Until Phase B re-points TESTS off
> the legacy model, the *safe* value is to **keep `PROJECTS` here** (the view stays
> reachable, just not on the rail). If a pure redirect is required, TESTS request-step
> editing regresses — flag to the orchestrator as a Phase-B dependency.

## 6. Open decision for the orchestrator (affects child t_762df439)

The child task `t_762df439` wording ("remove the workspace tab from navigation, **or**
replace its route/component with unified explorer") is satisfied by **Phase A** above.
Whether to proceed to **Phase B (full deletion)** depends on the product answer to:
*Are existing legacy `ApinoxProject` files (in `<config>/projects/`) expected to keep
working, and do the TESTS-view request-steps need to keep editing?* If "yes/yes," keep the
view hidden-but-reachable (Phase A) and track Phase B as a separate migration task.
If "no/legacy is abandoned," Phase B becomes the target and the import/migration +
TESTS decoupling are prerequisites.

## 7. Verification status

- Audit is read-only; no code changed. Locations above were grepped/confirmed at `2f41c35`.
- Webview vitest could not be run in this environment (pre-existing root `node_modules`
  `tinyrainbow`/vitest crash under Node 26 — documented, not introduced here). Confirmed by
  inspection that **no existing test pins the Projects rail item**, so Phase A is
  test-safe; `DeletePattern.test.tsx` is the only test affected by any *deletion* of
  `ProjectList` (not by the rail-only change).
