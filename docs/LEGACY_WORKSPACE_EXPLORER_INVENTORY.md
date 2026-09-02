# APInox Legacy Workspace Explorer — Feature Inventory

- **Purpose**: Complete read-only inventory of the legacy workspace explorer / legacy sidebar system, ready to be compared side-by-side against the Unified Explorer (replacement baseline). Feeds the parity decision document (t_87740a18).
- **Repo**: /home/mark/code/apinox — branch `main`, HEAD `3f7bc2f` (audit performed 2026-09-02).
- **Scope**: Tauri webview (`src-tauri/webview/src/`), shared package (`shared/src/`), Rust backend (`src-tauri/src/`). No code was modified during this audit.
- **Quick requests sidebar**: explicitly marked with **[QUICK REQUESTS]** throughout (see also §11).

## 1. Glossary / system boundaries

"Legacy workspace explorer" = everything rendered by the legacy `Sidebar` + `MainContent`/`WorkspaceLayout` machinery, i.e. every `SidebarView` except `UNIFIED_EXPLORER`. The **Unified Explorer** (`components/explorer/UnifiedExplorer*.tsx`) is the new merged view (projects + explorer in one tree) and is the replacement baseline used for comparison in §12.

Key naming note: the **quick requests sidebar is implemented as `ScrapbookPanel`** ("scrapbook" in code). It is embedded as a section of the legacy WSDL Explorer sidebar (`ApiExplorerSidebar`), not a standalone rail view.

## 2. App shell & provider chain

`src-tauri/webview/src/App.tsx` (providers, in nesting order):

```
ThemeProvider (standalone)
└─ EditorSettingsProvider            (from @apinox/request-editor/core)
   └─ ProjectProvider                (contexts/ProjectContext.tsx)
      └─ SelectionProvider           (contexts/SelectionContext.tsx)
         └─ UIProvider               (contexts/UIContext.tsx)
            └─ NavigationProvider    (contexts/NavigationContext.tsx)
               └─ ScrapbookProvider  (contexts/ScrapbookContext.tsx)   [QUICK REQUESTS]
                  └─ TestRunnerProvider (contexts/TestRunnerContext.tsx)
                     └─ PerformanceProvider (contexts/PerformanceContext.tsx)
                        └─ SearchProvider    (contexts/SearchContext.tsx)
                           └─ MainContent
```

| ID | Name | Location | Behavior | Inputs / Outputs | Dependencies | Notes |
|----|------|----------|----------|------------------|--------------|-------|
| APP-1 | App shell + provider tree | `src-tauri/webview/src/App.tsx` | Wraps `MainContent` in the 10-level context chain above; hosts `ErrorBoundary` from request-editor core | — | all contexts | Provider order is load-bearing (e.g. TestRunnerProvider must be inside UIProvider, NavigationProvider, ScrapbookProvider) |
| APP-2 | Error boundary | `App.tsx` (`ErrorBoundary` import) | Catches render errors, shows fallback | — | `@apinox/request-editor/core` | Only global error surface at app level |
| APP-3 | Theme | `contexts/ThemeContext.tsx` | Theme state for modals (used by SettingsEditorModal, GeneralTab, ScriptPlaygroundModal) | theme value/setters | request-editor `ThemeProvider` | Separate from the request-editor core theme provider |

## 3. View system (routes)

There is no URL router; views are selected by the `SidebarView` enum and the rail.

- **Enum**: `shared/src/models.ts:504` `SidebarView` — values: `HOME`, `PROJECTS`, `COLLECTIONS`, `EXPLORER`, `UNIFIED_EXPLORER`, `TESTS`, `WORKFLOWS`, `PERFORMANCE`, `HISTORY`, `PROXY`, `MOCK`, `WATCHER`, `NOTES`.
- **Rail**: `components/sidebar/SidebarRail.tsx` (235 lines) renders 11 buttons: Projects, WSDL Explorer, Unified Explorer, Tests, Workflows, Performance, History, Notes, Proxy & Traffic, Mock Server, File Watcher.
- **Content switch**: `components/MainContent.tsx` (~line 1950–1973) and `components/WorkspaceLayout.tsx` (per-view blocks at lines 615, 623, 657, 795, 868, 933, 944, 955, 966, 1014) route each view to its panel; `Sidebar.tsx` switches the sidebar body per view (lines 136–254).

| ID | View (SidebarView) | Rail label | Sidebar body component | Main content | Behavior | Notes |
|----|--------------------|-----------|------------------------|--------------|----------|-------|
| VIEW-1 | `HOME` | — (not on rail) | hidden (`hideContent`) | `WelcomePanel` (WorkspaceLayout:615/1032) | App landing/changelog surface | Reached via app start / "Home" |
| VIEW-2 | `PROJECTS` | Projects | `ProjectList` (+ `EnvironmentSelector` header) | project folder/request tree (WorkspaceLayout:868) | Manage saved projects: open/save/delete/rename, folders, requests, context menus | Primary legacy workspace view |
| VIEW-3 | `COLLECTIONS` | — | — (no rail button) | none found | REST/GraphQL collections | **Declared in enum only — no rail entry, no rendering path found (orphaned/dead)** |
| VIEW-4 | `EXPLORER` | WSDL Explorer | `ApiExplorerSidebar` (contains ServiceTree + Scrapbook section) | `ApiExplorerMain` (empty state) / selected operation editor | Load WSDL/OpenAPI/GraphQL, browse interfaces, add to project | Legacy API explorer; hosts **[QUICK REQUESTS]** section |
| VIEW-5 | `UNIFIED_EXPLORER` | Unified Explorer | `UnifiedExplorerSidebar` (rendered by `Sidebar.tsx:254`) | `UnifiedExplorerMain` via `UnifiedExplorerView` | Merged projects + explorer tree, WSDL load, per-request rows, sample request panel | **Replacement baseline** (§12) |
| VIEW-6 | `TESTS` | Tests | `TestsUi` | test case editor / runner (WorkspaceLayout:657) | Test suites, cases, steps, assertions, run | Structure locked while in TESTS view (WorkspaceLayout:318) |
| VIEW-7 | `WORKFLOWS` | Workflows | `WorkflowsUi` | workflow editor (WorkspaceLayout:795; step types: delay, condition, loop, script) | Request-chaining workflows | — |
| VIEW-8 | `PERFORMANCE` | Performance | `PerformanceUi` | performance suite editor (WorkspaceLayout:623) | Load suites, run/abort, history | Structure locked while in PERFORMANCE view |
| VIEW-9 | `HISTORY` | History | `HistorySidebar` | history list + entry detail (WorkspaceLayout:1014) | Executed-request history: star, delete, clear | Empty-state hides sidebar body (Sidebar:112) |
| VIEW-10 | `PROXY` | Proxy & Traffic | full-panel mode (`proxyFullPanelView`) | proxy pages (WorkspaceLayout:933) | MITM proxy: traffic, breakpoints, rules, certificates | From APIprox; sidebar body hidden in full-panel mode (Sidebar:111) |
| VIEW-11 | `MOCK` | Mock Server | full-panel mode | mock rules/history (WorkspaceLayout:944) | Mock server: rules, record mode, collections | From APIprox |
| VIEW-12 | `WATCHER` | File Watcher | full-panel mode | file watcher / SOAP pair viewer (WorkspaceLayout:955) | Watch files, inspect SOAP pairs | From APIprox |
| VIEW-13 | `NOTES` | Notes | `NotesList` (Sidebar:249) | `NotesEditor` (lazy, MainContent:1973) | Markdown/code scratchpad; notes persisted via Rust `notes_storage` | Hybrid markdown/code/binary notes |
| — | `SERVER` | — | — | commented-out block (WorkspaceLayout:1004–1011) | **Dead code**: `SidebarView.SERVER` referenced but not in enum; block is inside a `/* */` comment | Cleanup candidate |

## 4. Legacy sidebar structure

| ID | Name | Location (lines) | Behavior | Inputs / Outputs | Dependencies | Notes |
|----|------|------------------|----------|------------------|--------------|-------|
| SID-1 | `Sidebar` | `components/Sidebar.tsx` (275) | Sidebar shell: header (title, environment selector, backend status), body switch per view, expand/collapse, mobile drawer | props → `SidebarContext`; renders per-view body | `SidebarContext`, `NavigationContext`, panel components | `hideContent` when collapsed / HOME / proxy full-panel / empty history |
| SID-2 | `SidebarContext` | `contexts/SidebarContext.tsx` (88) | Composite context mirroring `SidebarProps`: `projectProps`, `explorerProps`, `wsdlProps` (populated, unused by current panels), `selectionProps`, `testRunnerProps` (legacy), `testsProps`, `workflowsProps`, `performanceProps`, `historyProps`, `unifiedProps`, plus `activeView`, `onChangeView`, `sidebarExpanded`, `backendConnected`, `workspaceDirty`, `activeEnvironment`/`environments` | prop groups in, panel components out | `types/props.ts` interfaces | Replaces 120+ props through the tree |
| SID-3 | `SidebarRail` | `components/sidebar/SidebarRail.tsx` (235) | Vertical icon rail; 11 view buttons + notes; active-view highlighting | `activeView`, `onChangeView` | `SidebarView`, `EnvironmentSelector` | Unified Explorer is a first-class rail button |
| SID-4 | `EnvironmentSelector` | `components/sidebar/EnvironmentSelector.tsx` (162) | Header dropdown for active environment; env var interpolation source | `activeEnvironment`, `environments`, `onChangeEnvironment` | settings (`update_active_environment` command) | Used by SidebarRail header |
| SID-5 | `FolderTree` | `components/sidebar/FolderTree.tsx` (366) | Folder hierarchy inside a project (drag-drop, rename, delete) | folder nodes, callbacks | used by `ProjectList` | Part of PROJECTS view |

## 5. Sidebar panels per view

| ID | Name | Location (lines) | Behavior | Inputs / Outputs | Dependencies | Notes |
|----|------|------------------|----------|------------------|--------------|-------|
| PNL-1 | `ProjectList` | `components/sidebar/ProjectList.tsx` (894) | Legacy project tree: projects → folders → operations → requests; create/open/save/delete/rename; context menus; drag-drop reorder; dirty markers | `projectProps` (SidebarContext) | `FolderTree`, project storage commands | Main body of PROJECTS view |
| PNL-2 | `ApiExplorerSidebar` | `components/sidebar/ApiExplorerSidebar.tsx` (227) | WSDL Explorer view body: input controls (URL/file), loaded interface list, context menu, then **Scrapbook section** at bottom (line ~215) | `explorerProps`, scrapbook state from context | `ServiceTree`, `ScrapbookPanel` | Hosts the quick requests sidebar (§11) |
| PNL-3 | `ServiceTree` | `components/sidebar/ServiceTree.tsx` (722) | Tree of explored WSDL/OpenAPI/GraphQL interfaces → operations → sample requests; "Add to Project", "Add All", "Clear", per-operation context menus | `exploredInterfaces` (NavigationContext), callbacks | `NavigationContext` | Read-only browse surface before adding to project |
| PNL-4 | `ScrapbookPanel` [QUICK REQUESTS] | `components/sidebar/ScrapbookPanel.tsx` (175) | Quick requests list: create/select/delete/execute standalone requests; loading spinner; empty state | props: `requests`, `selectedRequest`, `loading`, `onCreateRequest`, `onSelectRequest`, `onDeleteRequest`, `onExecuteRequest` | `ScrapbookContext` state; `TestRunnerContext` auto-save hook | See §11 deep-dive |
| PNL-5 | `TestsUi` | `components/sidebar/TestsUi.tsx` (526) | Test suite/case tree: create suite/case, steps, assertions; select for runner | `testsProps` | `TestRunnerContext`, `SelectionContext` | TESTS view body |
| PNL-6 | `WorkflowsUi` | `components/sidebar/WorkflowsUi.tsx` (240) | Workflow list + step tree (delay/condition/loop/script) | `workflowsProps` | `SelectionContext` (selectedWorkflowStep) | WORKFLOWS view body |
| PNL-7 | `PerformanceUi` | `components/sidebar/PerformanceUi.tsx` (350) | Performance suite tree: suites, requests, run/abort, history | `performanceProps` | `PerformanceContext` | PERFORMANCE view body |
| PNL-8 | `HistorySidebar` | `components/sidebar/HistorySidebar.tsx` (621) | Executed-request history list: search, star toggle, delete, clear, config; click → detail view | `historyProps` | history storage commands | HISTORY view body; empty state hides sidebar |
| PNL-9 | `NotesList` | `components/sidebar/NotesList.tsx` (275) | Notes index: list, create, rename, delete, recent notes, file-type sniffing; click → `NotesEditor` | notes index via Rust `notes_storage` | `NotesContext` (in `notes/`), `notes_storage.rs` | NOTES view body |
| PNL-10 | `CollectionList` | `components/sidebar/CollectionList.tsx` (401) | **ORPHANED**: REST API collections list — defined but referenced nowhere outside itself | (props interface only) | `SidebarView.COLLECTIONS` (also orphaned) | Dead/deferred; no wiring found |
| PNL-11 | `WatcherPanel` | `components/sidebar/WatcherPanel.tsx` (118) | **ORPHANED**: watcher sidebar panel — defined but referenced nowhere outside itself | — | WATCHER view (main content renders `EmptyFileWatcher`/watcher pages instead) | Dead code candidate |

## 6. Main content & workspace layout

| ID | Name | Location (lines) | Behavior | Inputs / Outputs | Dependencies | Notes |
|----|------|------------------|----------|------------------|--------------|-------|
| CTX-1 | `MainContent` | `components/MainContent.tsx` (2555) | Root of content area: owns projects/response/loading state, message handling, view routing, context menus, auto-save, lazy-loads `WorkspaceLayout`, `NotesEditor`, history detail | all contexts; bridge messages | all contexts, hooks, panels | Aggregates `WorkspaceContext` value (line ~1500) and provides it around lazy `WorkspaceLayout` (line ~1950) |
| CTX-2 | `WorkspaceLayout` | `components/WorkspaceLayout.tsx` (1224) | Request/test/workflow editing surface: per-view content blocks, breadcrumb, editor + response split, structure-locked views (TESTS/PERFORMANCE), workflow step editors | `useWorkspace()` (WorkspaceContext) | `WorkspaceContext`, request-editor package | Note: no `WorkspaceProvider` exists in `contexts/` — MainContent constructs and supplies the value inline |
| CTX-3 | `WelcomePanel` | `components/workspace/WelcomePanel.tsx` (exported from `workspace/index.ts`) | Home/empty landing: changelog, recent projects, sample request entry point | `changelog` prop | `SampleRequestPanel` | Rendered for HOME view and empty states |
| CTX-4 | `SampleRequestPanel` | `components/workspace/SampleRequestPanel.tsx` | Editor for an operation's generated `sample_` request (the per-operation **request template**); edit, run, save-as-request | sample request object, execute callback | request execution hook | **Used by BOTH legacy and unified explorer** (UnifiedExplorerMain:571) — request templates are already cross-cutting |
| CTX-5 | Request execution | `hooks/useRequestExecution.ts` (uses "original request template from the operation" for `sample_` requests, line ~514) | Builds/executes SOAP/REST requests, captures response, history entry, scrapbook auto-save | request/operation/project | soap commands, history, scrapbook | Single execution path shared by legacy + unified views |

## 7. State slices (contexts)

| ID | Context | Location (lines) | State owned | Consumers | Notes |
|----|---------|------------------|-------------|-----------|-------|
| ST-1 | `ProjectContext` | `contexts/ProjectContext.tsx` (1019) | `projects[]`, `dirtyProjects`, load/save/open/close/sync projects, WSDL import, environments wiring | MainContent, SidebarContext, WorkspaceLayout | Largest context; bridges to `project_storage` commands |
| ST-2 | `SelectionContext` | `contexts/SelectionContext.tsx` (315) | `selectedInterface/Operation/Request`, `selectedTestSuite/Case/Step`, `selectedPerformanceSuiteId`, `selectedWorkflowStep`, `response`, `loading` + setters | WorkspaceLayout, TestRunner, Search, panels | Central cross-view selection |
| ST-3 | `UIContext` | `contexts/UIContext.tsx` (312) | `layoutMode`, `showLineNumbers`, `inlineElementValues`, `hideCausalityData`, `splitRatio`, `isResizing`, `showSettings` + modal states, `config` (ApinoxConfig) | editors, settings modal, WorkspaceLayout | Persisted via `saveUiState`/`saveSettings` |
| ST-4 | `NavigationContext` | `contexts/NavigationContext.tsx` (103) | `activeView`, `setActiveView`, `sidebarExpanded`, `toggleSidebar`, `exploredInterfaces[]` (API Explorer state) | rail, sidebar, explorer panels | `exploredInterfaces` is the legacy API explorer's in-memory surface |
| ST-5 | `ScrapbookContext` [QUICK REQUESTS] | `contexts/ScrapbookContext.tsx` (306) | `requests: ScrapbookRequest[]`, `loading`, `add/update/delete/execute`, `createRequest` (with defaults), plus `useScrapbookAutoSave(selectedRequest, selectedProjectName, selectedInterface, selectedOperation, selectedTestCase)` hook | `ScrapbookPanel`, `TestRunnerContext` (line ~84), `ApiExplorerSidebar` | App-level provider; persists to Rust via `get/add/update/deleteScrapbookRequest` |
| ST-6 | `TestRunnerContext` | `contexts/TestRunnerContext.tsx` (268) | Test run state machine (testCaseStart/stepStart/stepComplete...), run results; calls `useScrapbookAutoSave` | TestsUi, runner, MainContent | Requires ScrapbookProvider above it |
| ST-7 | `PerformanceContext` | `contexts/PerformanceContext.tsx` (503) | Performance suites/requests, run progress, history, abort | PerformanceUi, WorkspaceLayout | Bridges to `performance::commands` |
| ST-8 | `SearchContext` | `contexts/SearchContext.tsx` (435) | `searchQuery`, `searchResults`, `isSearching`, `selectedIndex`, `isSearchVisible`, `groupedResults`, `performSearch/selectResult/navigateToLastResult` | global search (Ctrl/Cmd+K style) | Searches across projects/operations/requests |
| ST-9 | `WorkspaceContext` | `contexts/WorkspaceContext.tsx` (274) | Aggregated facade: projects, dirty, selection (interface/op/request/test/workflow/performance), `activeView`, explorer input state (`inputType`, `wsdlUrl`, `loadWsdl`, `downloadStatus`), `response`/`loading`, layout/editor flags, `config`, `defaultEndpoint`, read-only flag | `WorkspaceLayout` (via `useWorkspace()`) | **No `WorkspaceProvider` component in the file is used anywhere** — MainContent builds the value inline and wraps the lazy `WorkspaceLayout` (MainContent:1500/1950–1955). Refactor artifact; port should not depend on this file |
| ST-10 | `ThemeContext` | `contexts/ThemeContext.tsx` | Theme state for settings/modals | modals only | See APP-3 |

## 8. Hooks (webview/src/hooks)

| ID | Hook | Behavior | Dependencies | Notes |
|----|------|----------|--------------|-------|
| HK-1 | `useAppLifecycle` | App boot: settings load, open-projects restore, autosave/restore wiring | bridge, settings commands | |
| HK-2 | `useBreakpoint` / `useMobileLayout` | Responsive/mobile sidebar drawer | UIContext | |
| HK-3 | `useContextMenu` | Legacy context menus (project/request/interface/op); includes "View Sample Schema" → `getSampleSchema` command (line 298) | Selection, bridge | Sample-schema modal is **temporarily disabled** in MainContent (line ~2250) |
| HK-4 | `useDragAndDrop` | Tree drag-drop (reorder projects/ops/requests) | ProjectContext | |
| HK-5 | `useExplorer` | API explorer actions (load/clear, add-to-project) | NavigationContext, ProjectContext | |
| HK-6 | `useFolderManager` | Folder CRUD inside projects | ProjectContext | |
| HK-7 | `useLayoutHandler` | Panel resize/split-ratio persistence | UIContext | |
| HK-8 | `useMessageHandler` | All backend→frontend `BackendCommand` dispatch (e.g. `SampleSchema` at line 373, `Response`, `Error`, `WsdlParsed`, `ScrapbookLoaded`/`ScrapbookUpdated`) | all contexts | Single message funnel |
| HK-9 | `useRequestExecution` | Execute request (SOAP/REST), history write, scrapbook auto-save, sample_ template handling | soap/http commands | Shared legacy+unified |
| HK-10 | `useRequestHandlers` | Request CRUD (create/duplicate/rename/delete) | ProjectContext | |
| HK-11 | `useSidebarCallbacks` | Assembles `SidebarProps` prop groups consumed by `SidebarContext` | many | |
| HK-12 | `useTestCaseHandlers` | Test case/step CRUD + assertions | TestRunner/Project | |
| HK-13 | `useWildcardDecorations` | Editor wildcard highlighting | request-editor | |
| HK-14 | `useWorkflowHandlers` | Workflow CRUD + step ops | Selection | |
| HK-15 | `useWorkspaceCallbacks` | Callbacks for WorkspaceLayout test-step operations | Selection, TestRunner | |

## 9. Bridge / command surface (shared/src/messages.ts)

### 9.1 Frontend → backend (`FrontendCommand`, 119 entries)

| ID | Group | Commands | Behavior | Notes |
|----|-------|----------|----------|-------|
| CMD-1 | Core/workspace | `executeRequest`, `saveProject`, `loadProject`, `log`, `saveOpenProjects`, `saveWorkspace`, `openWorkspace`, `getSampleSchema`, `clipboardAction`, `cancelRequest`, `cancelAllRequests`, `saveSettings`, `getSettings`, `setActiveEnvironment`, `saveUiState`, `updateActiveEnvironment`, `autoSaveWorkspace`, `getAutosave`, `selectConfigFile` | Request execution, persistence, settings, clipboard | `getSampleSchema` result modal currently disabled |
| CMD-2 | WSDL/explorer | `downloadWsdl`, `loadWsdl`, `cancelWsdlLoad`, `getLocalWsdls`, `selectLocalWsdl`, `closeProject`, `syncProjects`, `refreshWsdl`, `applyWsdlSync`, `bulkImportWsdls` | API loading & sync | Legacy EXPLORER view driver |
| CMD-3 | ADO | `adoStorePat`, `adoHasPat`, `adoDeletePat`, `adoListProjects`, `adoTestConnection`, `adoAddComment` | Azure DevOps integration (PAT-stored via Rust `secret_storage`) | |
| CMD-4 | Test runner | `runTestSuite`, `runTestCase`, `getTestRunUpdates`, `pickOperationForTestCase`, `updateTestStep` | Streaming test runs (runId + updates poll pattern) | |
| CMD-5 | Workflow | `executeWorkflow`, `saveWorkflow`, `deleteWorkflow`, `getWorkflows` | | |
| CMD-6 | Performance | `getPerformanceSuites`, `addPerformanceSuite`, `updatePerformanceSuite`, `deletePerfomanceSuite` (sic), `addPerformanceRequest`, `pickOperationForPerformance`, `updatePerformanceRequest`, `deletePerformanceRequest`, `runPerformanceSuite`, `abortPerformanceSuite`, `getPerformanceHistory`, `getPerformanceRunUpdates`, `importTestSuiteToPerformance`, `exportPerformanceResults` | | Note `deletePerfomanceSuite` typo is the stable wire name |
| CMD-7 | Schedule | `getSchedules`, `addSchedule`, `updateSchedule`, `deleteSchedule`, `toggleSchedule` | | |
| CMD-8 | Coordinator | `startCoordinator`, `stopCoordinator`, `getCoordinatorStatus` | Distributed testing | |
| CMD-9 | History | `getHistory`, `toggleStarHistory`, `deleteHistoryEntry`, `clearHistory`, `updateHistoryConfig` | | |
| CMD-10 | Attachments | `selectAttachment` | SOAP attachments | |
| CMD-11 | Script playground | `executePlaygroundScript` | | |
| CMD-12 | Debug/diagnostics | `getSidecarLogs`, `clearSidecarLogs`, `getDebugInfo`, `openFile`, `checkCertificate`, `checkCertificateStore`, `installCertificateToLocalMachine`, `moveCertificateToLocalMachine`, `regenerateCertificate`, `resetCertificates` | Proxy cert lifecycle | Shell perms needed (see §10) |
| CMD-13 | Workspace export/import | `exportWorkspace`, `importWorkspace`, `deleteProjectFiles` | | |
| CMD-14 | Scrapbook [QUICK REQUESTS] | `getScrapbook`, `addScrapbookRequest`, `updateScrapbookRequest`, `deleteScrapbookRequest` | Quick requests persistence | Comment in messages.ts: "Scrapbook (API Explorer Quick Requests)" — canonical naming confirmation |

### 9.2 Backend → frontend (`BackendCommand`, 71 entries)

| ID | Group | Events | Notes |
|----|-------|--------|-------|
| EVT-1 | General | `log`, `response`, `error`, `clipboardText`, `sampleSchema`, `changelog`, `restoreAutosave`, `projectSaved`, `workspaceSaved` | `error` is the generic backend error event (see §11.4) |
| EVT-2 | WSDL | `wsdlParsed`, `wsdlLoadCancelled`, `downloadComplete`, `wsdlSelected`, `localWsdls`, `configFileSelected`, `wsdlRefreshResult`, `bulkImportProgress`, `bulkImportComplete` | |
| EVT-3 | Tests/perf | `testRunnerUpdate`, `performanceRunComplete`, `performanceIterationComplete`, `performanceRunStarted`, `addStepToCase`, `addOperationToPerformance` | |
| EVT-4 | Coordinator/config | `coordinatorStatus`, `settingsUpdate`, `configSwitched`, `configRestored`, `updateProxyTarget`, `configUpdate` | |
| EVT-5 | History | `historyLoaded`, `historyUpdate` | |
| EVT-6 | Misc | `attachmentSelected`, `playgroundScriptResult`, `toggleSidebar`, `switchToView`, `echoResponse` | |
| EVT-7 | Scrapbook [QUICK REQUESTS] | `scrapbookLoaded`, `scrapbookUpdated` | Push to keep panel in sync |
| EVT-8 | Mock | `mockHistoryStart`, `mockHistoryUpdate` | |
| EVT-9 | Unified explorer | `unifiedProjectParsed`, `unifiedProjectRefreshed` | New-surface events |
| EVT-10 | ADO | `adoHasPatResult`, `adoProjectsResult`, `adoTestConnectionResult`, `adoAddCommentResult`, `adoPatStored`, `adoPatDeleted` | |

## 10. Rust backend commands (Tauri handlers in `src-tauri/src/lib.rs`)

| ID | Module | Commands | Behavior / storage | Notes |
|----|--------|----------|--------------------|-------|
| RST-1 | `project_storage` | `save_project`, `load_project`, `list_projects`, `list_unified_projects`, `delete_project`, `save_unified_project`, `close_project` | `FolderProjectStorage` on disk (project folders, `properties.json`, `operation.json`, requests, tests) | `originalEndpoint` persistence critical (AGENTS.md) |
| RST-2 | `history_storage` | `get_history`, `add_history_entry`, `clear_history`, `delete_history_entry`, `toggle_star_history`, `get_starred_history`, `clear_history_older_than`, `update_history_config`, `get_history_config` | Request history store + config | |
| RST-3 | `scrapbook_storage` [QUICK REQUESTS] | `get_scrapbook`, `add_scrapbook_request`, `update_scrapbook_request`, `delete_scrapbook_request`, `get_scrapbook_request` | JSON file at `<config>/scrapbook.json` (config dir = `$APINOX_CONFIG_DIR` else `~/.apinox`); dir auto-created; load tolerates missing/corrupt file (empty state fallback) | All five registered in lib.rs:550–554; the 5th (`get_scrapbook_request`) has **no matching FrontendCommand** — unused from UI |
| RST-4 | `notes_storage` | `load_notes_index`, `load_note_content`, `load_note_bytes`, `save_note`, `save_note_bytes`, `delete_note`, `rename_note`, `upsert_note_index`, `add_recent_note_path`, `sniff_file_type`, `get_notes_dir_path` | Notes dir under config | |
| RST-5 | `secret_storage` | `store_secret`, `get_secret`, `delete_secret`, `resolve_secret_value`, `is_secret_ref`, `list_secret_keys` | Secret refs (e.g. ADO PAT, env secrets) | |
| RST-6 | `settings_manager` | `get_settings`, `get_raw_settings`, `save_raw_settings`, `save_settings`, `update_ui_settings`, `update_active_environment`, `update_open_projects`, `update_workflows`, `get_config_dir_path`, `get_config_file_path`, `get_resolved_environment`, `get_global_variables` | `~/.apinox/config.jsonc` | |
| RST-7 | `http::commands` | `execute_http_request`, `execute_rest_request` | Raw HTTP/REST execution | |
| RST-8 | `parsers` | `parse_wsdl`, `refresh_wsdl`, `apply_wsdl_sync`, `parse_openapi_spec`, `parse_wsdl_as_project`, `refresh_unified_project`, `refresh_project_wsdl`, `delete_unified_project`, `delete_unified_operation`, `delete_unified_request`, `new_unified_request` | WSDL + OpenAPI parsing; unified-explorer project ops (new surface) | OpenAPI `generate_sample` builds sample request bodies (openapi_parser.rs:211) |
| RST-9 | `soap::commands` | `build_soap_envelope`, `execute_soap_request`, `cancel_request`, `cancel_all_requests` | SOAP execution | |
| RST-10 | `soap::cert_commands` | certificate check/install/move/regenerate/reset | Proxy MITM CA lifecycle | Shell allowlist in capabilities (below) |
| RST-11 | `testing::commands` | `run_test_case`, `run_test_suite`, `get_test_run_updates` | Streaming test runs | |
| RST-12 | `performance::commands` | `run_performance_suite`, `get_performance_run_updates`, `abort_performance_suite` | | |
| RST-13 | `workflow::commands` | `run_workflow`, `get_workflows`, `save_workflow`, `delete_workflow` | | |
| RST-14 | `commands::proxy_server` | `start_proxy`, `stop_proxy`, `get_proxy_status` | MITM proxy (APIprox) | |
| RST-15 | `commands::mock_server` | `start_mock`, `stop_mock`, `get_mock_status`, `get_mock_rules`, `add_mock_rule`, `update_mock_rule`, `delete_mock_rule`, `set_mock_record_mode`, `save_mock_rules`, `export_mock_collection`, `import_mock_collection` | Mock server (APIprox) | |
| RST-16 | `workspace_export` | `export_workspace`, `import_workspace`, `export_unified_project` | | |
| RST-17 | `updater` | `check_for_updates`, `download_update`, `launch_installer`, `open_url_in_browser` | Self-update | |

### 10.1 Permissions (Tauri capabilities)

`src-tauri/capabilities/default.json` — `core:default`, window ops, `dialog:default` + save, `opener:default` (+ `allow-open-path` for `$TEMP/**`), `shell:default` + `shell:allow-execute` allowlist: `certutil`, `security`, `update-ca-certificates`, `sudo`, `cp` (certificate management only). No other FS/network capabilities — all other I/O goes through the registered Tauri commands above.

## 11. [QUICK REQUESTS] — deep dive (Scrapbook subsystem)

### 11.1 Identification

The **quick requests sidebar** = `ScrapbookPanel` (UI) + `ScrapbookContext` (state) + `scrapbook_storage.rs` (persistence). `shared/src/messages.ts:114` documents the group as `// Scrapbook (API Explorer Quick Requests)`. It is a section at the bottom of the legacy **WSDL Explorer** sidebar (`ApiExplorerSidebar:215`), not a rail view.

### 11.2 Components & wiring

| ID | Name | Location | Behavior | Inputs / Outputs | Dependencies | Notes |
|----|------|----------|----------|------------------|--------------|-------|
| QR-1 | `ScrapbookPanel` | `components/sidebar/ScrapbookPanel.tsx` (175) | Renders the quick requests section: header with "new" action, list of requests, selection highlight, delete, execute | props: `requests`, `selectedRequest`, `loading`, `onCreateRequest`, `onSelectRequest`, `onDeleteRequest`, `onExecuteRequest` | `ScrapbookContext` (via parent), request execution | Embedded in `ApiExplorerSidebar` (EXPLORER view only) |
| QR-2 | `ScrapbookContext` / `useScrapbook` | `contexts/ScrapbookContext.tsx` (306) | Owns `requests: ScrapbookRequest[]` + `loading`; CRUD ops call bridge commands; `createRequest()` builds a new request with defaults (name, empty body, timestamp fields `id`/`createdAt`/`lastModified`); `useScrapbookAutoSave(selectedRequest, projectName, interface, operation, testCase)` captures executed/selected requests into the scrapbook | context: state + actions; consumed at App level (App.tsx:123) | `FrontendCommand.Get/Add/Update/DeleteScrapbookRequest`, `BackendCommand.ScrapbookLoaded/Updated` | Provider must wrap TestRunnerProvider |
| QR-3 | `scrapbook_storage.rs` | `src-tauri/src/scrapbook_storage.rs` | File persistence: `scrapbook.json` in config dir (`$APINOX_CONFIG_DIR` or `~/.apinox`, dir auto-created); tolerant load (missing/corrupt → empty); atomic-ish write on every mutation | 5 Tauri commands (RST-3) | config dir | `get_scrapbook_request` registered but unused by UI |
| QR-4 | Auto-save integration | `contexts/TestRunnerContext.tsx:84` | After selecting/executing a request (optionally within a test case), the request is auto-captured into the scrapbook | selected request/project/operation/testCase | QR-2 | This is how "quick requests" accumulate during normal use |
| QR-5 | Execution path | `ApiExplorerSidebar` `handleExecuteScrapbookRequest` → `useRequestExecution` | Executes the scrapbook request (endpoint + edited XML), response shown in main area | request | RST-7/RST-9, history | Same execution engine as project requests |

### 11.3 Sample APIs & request templates (what quick requests expose)

**Sample APIs** — legacy `ApiExplorerMain` welcome/empty state (`components/explorer/ApiExplorerMain.tsx:334–443`), 6 cards in 3 groups; each click pre-fills the WSDL URL input:

| ID | Sample | Group | URL (exact) | Type | In unified explorer? |
|----|--------|-------|-------------|------|----------------------|
| API-1 | Swagger Petstore | OpenAPI | `https://petstore.swagger.io/v2/swagger.json` | OpenAPI 2.0 JSON | **No** |
| API-2 | Petstore YAML | OpenAPI | `https://petstore.swagger.io/v2/swagger.yaml` | OpenAPI 2.0 YAML | **No** |
| API-3 | Country Info | SOAP | `http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL` | SOAP WSDL | Partial — hardcoded as the default URL input (UnifiedExplorerMain:56) but not as a card |
| API-4 | Calculator | SOAP | `http://www.dneonline.com/calculator.asmx?wsdl` | SOAP WSDL | **No** |
| API-5 | SpaceX | GraphQL | `https://spacex-production.up.railway.app/graphql` | GraphQL | **No** |
| API-6 | Rick & Morty | GraphQL | `https://rickandmortyapi.com/graphql` | GraphQL | **No** |

Documented in `data/helpContent.tsx` ("Sample APIs" section, same six). Loading-methods: URL + file import/drag-drop; format detection: `.wsdl`/`.xml` → WSDL, `.json` → OpenAPI, `.yaml/.yml` → OpenAPI, path contains `graphql`/`gql` → GraphQL introspection (auto introspection query, builds Query/Mutation interfaces with `__typename` starter bodies).

**Request templates**:
- Per-operation `sample_` request auto-generated on WSDL/OpenAPI/GraphQL load (OpenAPI: `generate_sample` in `openapi_parser.rs:211`; SOAP: default XML via recursive schema walk, `generateXmlBody` in the request editor; "Reset" restores the default XML template per `helpContent.tsx:59`).
- `SampleRequestPanel` (`components/workspace/SampleRequestPanel.tsx`) edits the `sample_` request; **already used by the unified explorer** (UnifiedExplorerMain:571) — so request templates are NOT missing from the unified surface.
- `getSampleSchema` command + `sampleSchema` event exist, but the "View Sample Schema" modal is temporarily disabled (MainContent:2250).
- Scrapbook `createRequest` defaults = the quick-request template (new empty request with id/timestamps).

### 11.4 Error paths (quick requests)

| Path | Behavior |
|------|----------|
| Config dir unresolvable | `scrapbook_storage::get_scrapbook_path` → Err("Could not determine config directory") → command error surfaced via `error` event |
| Missing/corrupt `scrapbook.json` | Load falls back to empty `ScrapbookState` (panel shows empty state); next save rewrites file |
| Bridge command failure | Generic `BackendCommand.Error` event → toast/console via `useMessageHandler` |
| Execute failure | Request-error path shared with all execution (`useRequestExecution` error capture; response error rendering) |
| `useScrapbook` outside provider | Throws `'useScrapbook must be used within a ScrapbookProvider'` (ScrapbookContext:33) |

## 12. Comparison baseline — Unified Explorer (replacement target)

Files: `components/explorer/UnifiedExplorerView.tsx` (60, wrapper), `UnifiedExplorerSidebar.tsx` (566), `UnifiedExplorerMain.tsx` (712). Rail button VIEW-5; dedicated `unifiedProps` in SidebarContext; dedicated backend events EVT-9; dedicated commands RST-8 (unified set).

| ID | Capability | Legacy (pre-unified) | Unified Explorer | Parity status |
|----|-----------|----------------------|------------------|---------------|
| UE-1 | Project tree (projects/folders/ops/requests) | `ProjectList` (PNL-1) | `UnifiedExplorerSidebar` merged tree | Present |
| UE-2 | WSDL/URL load + file import | `ApiExplorerMain` (welcome + import zone) | `UnifiedExplorerMain` URL bar (default = Country Info WSDL) + import | Present |
| UE-3 | **Sample API cards (6)** | `ApiExplorerMain:334–443` (API-1…API-6) | **None** | **MISSING** |
| UE-4 | **Quick requests / scrapbook sidebar** | `ScrapbookPanel` in EXPLORER view (QR-1…QR-5) | **None** (no scrapbook reference in `components/explorer/`) | **MISSING** |
| UE-5 | Per-operation sample request (`sample_`) | `SampleRequestPanel` | `SampleRequestPanel` (UnifiedExplorerMain:571) | Present |
| UE-6 | Unified project persistence | — | `save_unified_project`, `list_unified_projects`, unified delete/new ops (RST-1, RST-8) | New |
| UE-7 | Refresh/sync | `refreshWsdl`/`applyWsdlSync` | `refresh_unified_project`, `refresh_project_wsdl` + EVT-9 | Present |
| UE-8 | Drag-drop reorder | ProjectList DnD | tree DnD (`application/x-tree-drag`, `onReorderRequest`/`onReorderOperation`) | Present |
| UE-9 | Context menus | per-view context menus | `SidebarContextMenu` with sections (UnifiedExplorerSidebar:556) | Present |
| UE-10 | GraphQL introspection / OpenAPI sample generation | parsers | same Rust parsers (`parse_wsdl_as_project`) | Present |

## 13. Orphaned / dead code found (relevant to parity decisions)

| ID | Item | Location | Finding |
|----|------|----------|---------|
| DEAD-1 | `CollectionList` | `components/sidebar/CollectionList.tsx` (401) | Referenced nowhere; `SidebarView.COLLECTIONS` has no rail button or render path |
| DEAD-2 | `WatcherPanel` | `components/sidebar/WatcherPanel.tsx` (118) | Referenced nowhere (WATCHER main content uses watcher pages instead) |
| DEAD-3 | `SidebarView.SERVER` block | `WorkspaceLayout.tsx:1004–1011` | Commented out; `SERVER` not in enum |
| DEAD-4 | `WorkspaceContext` provider | `contexts/WorkspaceContext.tsx` | No `WorkspaceProvider` used anywhere; MainContent supplies the aggregated value inline |
| DEAD-5 | `testRunnerProps` | `SidebarContext` | Marked "Legacy — tests now use testsProps" |
| DEAD-6 | `wsdlProps` | `SidebarContext` | "Populated but currently consumed only by future WSDL-in-sidebar work" |
| DEAD-7 | Sample schema modal | `MainContent.tsx:2250` | "temporarily disabled" while `getSampleSchema` command still exists |
| DEAD-8 | `get_scrapbook_request` command | `scrapbook_storage.rs` / lib.rs:554 | Registered, no matching FrontendCommand/UI caller |

## 14. Data dependencies (persistence)

| ID | Data | Location (config dir `~/.apinox` or `$APINOX_CONFIG_DIR`) | Owner | Notes |
|----|------|-----------------------------------------------------------|-------|-------|
| DATA-1 | `config.jsonc` | settings, ui state, environments, replaceRules | `settings_manager` | |
| DATA-2 | `scrapbook.json` [QUICK REQUESTS] | quick requests list | `scrapbook_storage` | Tolerant load; rewritten on every mutation |
| DATA-3 | `projects/` (or open-projects dirs) | `properties.json`, `interfaces/**/interface.json`, `operation.json`, `Request*.xml`/`.json`, `tests/**` | `project_storage` | `originalEndpoint` critical field |
| DATA-4 | history store + config | executed requests, stars, retention config | `history_storage` | |
| DATA-5 | notes dir + index | notes content (text/binary), recents | `notes_storage` | |
| DATA-6 | secrets | ADO PAT, secret refs | `secret_storage` | |
| DATA-7 | mock rules | `mock-rules.jsonc` (per AGENTS.md) | mock server | |
| DATA-8 | proxy cert store | MITM CA | cert commands | |

## 15. Porting-relevant summary (for t_87740a18 decision doc)

**Required ports (per task scope):**
1. **[QUICK REQUESTS] Scrapbook sidebar** (QR-1…QR-5, RST-3, CMD-14, EVT-7, DATA-2) — state lives at app level, so the Rust layer and context survive unchanged; what must move is (a) the `ScrapbookPanel` section (or an equivalent) into the unified explorer sidebar, and (b) the `useScrapbookAutoSave` wiring in `TestRunnerContext` (currently keyed to the legacy selection flow).
2. **Sample API cards** (API-1…API-6) — the six sample URLs + group layout from `ApiExplorerMain:334–443`; today only Country Info survives as the unified URL-input default.

**Already present in unified explorer** (no port needed): project tree, WSDL load, `sample_` request templates + `SampleRequestPanel`, DnD reorder, context menus, refresh/sync, GraphQL/OpenAPI parsing.

**Likely out of scope for unified explorer** (not explorer features): Tests, Workflows, Performance, History, Notes, Proxy, Mock, Watcher views — separate rail views, kept alongside.

**Clean-up candidates** flagged in §13.
