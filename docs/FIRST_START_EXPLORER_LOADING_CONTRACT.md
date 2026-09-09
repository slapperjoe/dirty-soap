# First-Start Lockup — Unified Explorer Loading Contract

**Status:** IMPLEMENTED (t_aafaf92b loader lane; verification tracked in t_28cab51c; sidebar indicator t_9e350f06)
**Task:** t_d55a5ff6 — Profile first-start lockup and define explorer loading contract
**Issue:** "On first start apinox is locking up for some time. I believe this is because unified explorer has quite a few interfaces that it's loading all at once."

**Implementation note (t_aafaf92b):** the startup path is now skeleton-first —
`UnifiedProjectContext` invokes `list_unified_projects_skeleton` on mount
(async, off the main thread; ~1 KB–300 KB payload depending on store size)
and runs `migrate_legacy_projects` concurrently (it no longer gates the list,
re-snapshotting via `unified-load-refresh` when it migrated anything). Full
project detail (fullSchema + request bodies) loads on demand per project via
`load_unified_project_detail` when an operation/request is selected or a
save/tests flow needs it (deduped by name; see the context's
`fullRef`/`pendingRef`). `list_unified_projects` is `async` and remains the
full/fallback path used by `refresh()`. One refinement over the original
design: `list_unified_projects_skeleton` is a dedicated LIGHT reader
(`load_unified_project_skeleton`) that skips request `*.xml` bodies and
test/folder loads entirely, rather than a strip pass over the full load —
measured at 30×100 ops: skeleton 303 KB / off-main vs. the old sync full
list 31.55 MB on the main thread (bench: `bench_startup_load_costs`).

---

## 1. What blocks the UI (root cause, traced)

App startup sequence (all confirmed in code):

1. `App.tsx:125` mounts `UnifiedProjectProvider` (above everything else, before `MainContent`).
2. `UnifiedProjectContext.tsx:116-129` — on-mount effect runs, sequentially:
   - `await invoke('migrate_legacy_projects')` — `project_storage.rs:956`, `async` (runs off the main thread on the tokio runtime; **does not freeze the UI**, but delays the list; on a true first start with many legacy dirs it does a full load + rewrite of each).
   - `await refresh()` → `invoke('list_unified_projects')` — `project_storage.rs:1541`, **plain `pub fn` — a *synchronous* Tauri command**.
3. Per Tauri v2 semantics (confirmed in the tauri-2.10.3 source in this repo, `tauri-macros/src/command/wrapper.rs:359` `body_blocking`, and the official docs at v2.tauri.app/develop/calling-rust: *"Commands without the async keyword are executed on the main thread"*), a sync command executes **inline on the tao main event-loop thread — the same thread that renders the window**.
4. `list_unified_projects` (project_storage.rs:1541-1567) fully loads **every** project in `~/.apinox/projects/`:
   - `properties.json` per project
   - every `operation.json` **including the full `fullSchema` tree** (`load_unified_operation`, :1464-1537)
   - every request `*.json` metadata **plus the `*.xml` body inlined** (:1488-1515)
   - all `tests/` suites (`load_test_suites_from_dir`, :1422) and `folders/` (:1441)
   - then serializes the entire `Vec<serde_json::Value>` as the IPC payload.
5. Webview side (`UnifiedProjectContext.tsx:73-81`): `JSON.parse` of that payload, `setProjects(...)` → whole-tree React re-render. `UnifiedExplorerSidebar.tsx:376-388` then auto-expands every operation with requests.

Every other startup command is `async` (`get_settings`, `get_history`, `get_scrapbook`, `migrate_legacy_projects`, `check_for_updates`) — `list_unified_projects` is the **single sync command in the startup path**. That is the isolated root cause of the freeze.

## 2. Measurements (real code, reproducible)

Repro harness: `project_storage::tests::bench_startup_load_costs_when_opted_in`
(opt-in bench test, added by this task; run with
`APINOX_STARTUP_BENCH=1 BENCH_PROJECTS=30 BENCH_OPS=100 cargo test -p apinox --lib bench_startup_load_costs -- --nocapture`).
It builds a store with the **real** `save_unified_project` writer (30 projects × 100 ops, realistic `fullSchema` + 1.5 KB request bodies) and times the real startup commands.

Measured on the LWoody host (RTX 5090 box, warm page cache — a cold start on a user machine is slower, not faster):

| Store | `migrate_legacy_projects` | `list_unified_projects` (SYNC, main thread) | IPC payload |
|---|---|---|---|
| 12 projects × 60 ops (720 ops) | 1 ms | **460 ms UI freeze** | 7.6 MB |
| 30 projects × 100 ops (3000 ops) | 1 ms | **1927 ms UI freeze** | 31.6 MB |

Webview side (node, same 30×100 payload shape): `JSON.parse` ≈ 80 ms, ~6,030 tree rows rendered. Cheap next to the 1.9 s Rust-side block — **the dominant cost is the synchronous disk load + payload build on the main thread, not the webview**.

Payload composition of the 31.6 MB (measured from the real `list_unified_projects` output):

| Component | Share | Needed for first paint? |
|---|---|---|
| `fullSchema` trees | **77.5 %** | No — only when opening an operation in the editor (default-XML generation / refresh) |
| request XML bodies | 15.9 % | No — only when a request is opened in the editor |
| tree skeleton (project/operation/request **names**, displayNames) | **0.53 %** (~170 KB) | **Yes — this is all the sidebar renders** |
| `tests/` suites, `folders/`, `input`/`output`/`action`/`originalEndpoint` | ~6 % | No — TESTS view / new-request / execute paths |

**Critical for first paint ≈ 0.5 % of the payload.** The sidebar (`UnifiedExplorerSidebar.tsx:449-481`) renders names only; everything else is deferred to open-time.

## 3. Proposed background worker API

Goal: first paint < ~100 ms regardless of store size; details load lazily; UI never blocks.

### 3.1 Rust (src-tauri/src/project_storage.rs)

1. **`list_unified_projects` → `pub async fn`** (one-word change). Tauri then runs it on the tokio runtime instead of the main thread — this alone removes the UI freeze for the list phase. (Keep it; it is also the fallback/full-load path.)
2. **`list_unified_projects_skeleton() -> Vec<UnifiedProjectSkeleton>`** — new, `async`. Per project: read `properties.json` + each `operation.json` but extract only `name`/`displayName`/request names (skip `fullSchema`, bodies, `input`/`output`). Payload ≈ the 0.53 % column above (~170 KB for 3000 ops) → first paint in single-digit-to-low-double-digit ms.
   - `UnifiedProjectSkeleton` (shared model):
     ```ts
     { name: string; displayName?: string; source: string; sourceUrl?: string;
       soapVersion?: string; contentType?: string;
       operations: { name: string; displayName?: string; requestNames: string[] }[] }
     ```
3. **`load_unified_project_detail(projectName) -> UnifiedProject`** — `async` wrapper over the existing `load_unified_project` (:1367) (which is currently sync). Called on demand when a project's details are first needed (operation selected / request opened / TESTS view reads suites). Cache in the context: once a project is full, keep it; subsequent opens are instant.
4. **Migration must not gate the list.** Start the skeleton load immediately; run `migrate_legacy_projects` concurrently (fire-and-forget with a completion callback). When migration finishes and migrated anything, emit `unified-load-refresh` so the context re-runs the skeleton (migrated projects appear without a second manual reload).

### 3.2 Event/progress mechanism

Follows the existing precedent (`BackendCommand.BulkImportProgress` / `BulkImportComplete`, `shared/src/messages.ts:142-143`, consumed via `bridge.onMessage` / the `backend_command` Tauri event):

- **`unified-load-progress`** — `{ loaded: number, total: number, name?: string }` — one per project as the background loader finishes it (used if the full/async list path is streamed instead of skeleton+detail).
- **`unified-load-project`** — `{ project: UnifiedProjectSkeleton | UnifiedProject }` — incremental arrival of a project (background worker pushes; UI appends).
- **`unified-load-done`** — `{ total: number, errors: { name: string, message: string }[] }` — terminal event; per-project errors are non-fatal (that project is simply absent from the tree until fixed/retried).
- **`unified-load-refresh`** — `{ reason: 'migration' | 'external' }` — tells the context to re-snapshot the skeleton.

Add the four names to `shared/src/messages.ts` `BackendCommand` and register them in `useMessageHandler.ts` (or a dedicated `useUnifiedLoadListener` inside the provider — preferred, keeps `useMessageHandler` untouched).

### 3.3 Frontend loader shape (`UnifiedProjectContext`)

```
mount
 ├─ startUnifiedLoad()
 │    ├─ phase: idle → loading
 │    ├─ invoke list_unified_projects_skeleton   // fast, populates partial state immediately
 │    ├─ (background) migrate_legacy_projects    // off-main, completes → unified-load-refresh
 │    └─ on unified-load-project/done → apply, phase: loading → ready
 ├─ openProject(name)
 │    └─ if !detailsLoaded[name]: invoke load_unified_project_detail(name)
 │         (editor pane shows a per-project "Loading…" until it lands)
```

Rules: no `await` chain on the main-thread-sensitive path; every `setProjects` is incremental (append/replace one project, never a bulk 30 MB swap); dedupe by project name so an event-driven arrival and a direct fetch never double-load the same project (acceptance criterion: "no interface is skipped or loaded twice").

## 4. Sidebar loading-state contract (for the UI task, t_9e350f06)

Single source of truth on the context (consumed via `useUnifiedProjects().load` — the UI must not couple to the worker/IPC implementation):

```ts
type ExplorerLoadState =
    | { phase: 'idle' }
    | { phase: 'loading'; loaded: number; total: number; current?: string }
    | { phase: 'ready';   loaded: number; total: number; errors: { name: string; message: string }[] }
    | { phase: 'error';   message: string };   // fatal (e.g. projects dir unreadable)
```

State machine:

```
idle ──load starts──▶ loading ──all arrived / done──▶ ready
                        │  ▲                            │
                        │  └─ retry() (fatal) ──────────┘ (error only)
                        └──▶ error (fatal failure, e.g. skeleton invoke rejects)
```

- `loading` → `ready` is guaranteed (terminal) even when individual projects fail: failures land in `ready.errors`, not in `error`.
- Empty store is `ready` with `total === 0` (NOT a distinct state — the existing "No projects yet" empty-state markup at `UnifiedExplorerSidebar.tsx:449-454` renders as-is).

Sidebar rendering rules:

1. **Indicator row** (only while `phase === 'loading'`): a fixed-height (≈24 px, matching a `TreeItem` row) row at the top of the tree area — spinner + `Loading interfaces… (3/12)` (numbers from `loaded`/`total`; omit the counter if `total` unknown). Reserved height when absent → **no layout shift** when it appears/disappears.
2. **Partial rendering**: projects already in state render normally beneath the indicator; the UI is fully interactive (selection, other tabs, executing an already-loaded request) during the load.
3. **`ready`**: indicator removed. If `errors.length > 0`, show a single muted warning row (`2 projects failed to load — right-click the project to retry`) that does not hide the tree.
4. **`error`**: replace the tree area with the message + a `Retry` button (calls the context's `refresh()`; no full app reload).
5. **Per-project detail state** (editor pane, not sidebar): opening an operation whose project details haven't loaded yet shows a spinner in the editor pane only; the sidebar keeps showing the skeleton rows.

## 5. Acceptance mapping

| Criterion (task body) | Where satisfied |
|---|---|
| Reproduce the first-start lockup | §2 bench test (real commands, env-gated; 1.9 s UI-blocking load measured) |
| Identify the blocking calls | §1 (sync `list_unified_projects` on the Tauri main thread; sequential `migrate_legacy_projects` gate; 31 MB IPC payload + full-tree re-render) |
| List interfaces/components loaded at once | §1 step 4 + §2 table (every project: properties, all operations with fullSchema, all request bodies, all tests, all folders — 6,030 rows for 30×100) |
| Critical-for-first-paint vs deferrable | §2 payload composition (names ≈ 0.5 % critical; fullSchema 77.5 % + bodies 15.9 % deferrable) |
| Loading-state contract (idle/loading/ready/error + progress/events) | §4 states + §3.2 events |
| Background worker API proposal | §3 (async-ify list, skeleton+detail commands, event names, context loader shape) |

## 6. Out of scope / follow-ups

- Full implementation: t_aafaf92b (loader) + t_9e350f06 (sidebar indicator) + t_28cab51c (verification/regression test).
- `refresh_project_wsdl` and `parse_wsdl_as_project` are already `async`; no change needed.
- The 6,030-row React tree render is acceptable at this scale; if stores grow >10k visible rows, virtualize the sidebar (not required for this fix).
- `load_unified_project` is also sync (`:1367`) — it is invoked by `refresh`/rename flows today; the `load_unified_project_detail` wrapper in §3.1 covers its startup relevance.
