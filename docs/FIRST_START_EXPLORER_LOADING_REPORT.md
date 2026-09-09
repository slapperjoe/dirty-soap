# First-Start Explorer Lockup — Fix Report

**Task:** t_eeb7aa8a (root) — first-start UI lockup: move unified-explorer interface
loading to a background worker and show a loading message in the sidebar.
**Status:** MERGED & PUSHED to `main` @ `c4b34dc` (2026-09-09).

## Problem

On first start APInox froze for ~1.9 s (30 projects × 100 ops). Root cause
(diagnosis lane t_d55a5ff6, contract in `docs/FIRST_START_EXPLORER_LOADING_CONTRACT.md`):
`list_unified_projects` was the one **synchronous** Tauri command in the startup
path — sync commands run inline on Tauri's main event-loop thread, so a full-disk
load of every project (operations + fullSchema + request XML bodies + tests +
folders, ~31.55 MB IPC payload) blocked the UI. `UnifiedProjectContext` also
awaited `migrate_legacy_projects` sequentially before it.

## Fix (4 lanes, merged via wt/t_28cab51c)

| Lane | Contribution |
|------|--------------|
| t_d55a5ff6 | Diagnosis + loading contract (`docs/FIRST_START_EXPLORER_LOADING_CONTRACT.md`), env-gated bench harness `bench_startup_load_costs` |
| t_aafaf92b | Background loader: `list_unified_projects` now `async`; new `list_unified_projects_skeleton` (light first-paint reader, ~1% of old payload — skips request bodies/fullSchema/tests/folders) + `load_unified_project_detail` (on-demand per-project full load); 4 `unified-load-*` BackendCommand events; rewritten `UnifiedProjectContext` with the 4-phase load state machine (idle/loading/ready/error), skeleton-first startup with concurrent non-gating migration, deduped detail loads |
| t_9e350f06 | §4 sidebar loading indicator in `UnifiedExplorerSidebar.tsx`: fixed ~24 px row with spinner + "Loading interfaces… (n/m)" while loading, muted warning on ready-with-errors, error state + Retry (wired to context `refresh()`), plain empty state preserved |
| t_28cab51c | End-to-end integration & verification + 8-case loading-indicator regression test |

## Behaviour after the fix

- **First paint** uses the skeleton list (async, off the Tauri main thread):
  sidebar tree renders project/operation/request names immediately.
- **Full detail** (fullSchema, request bodies) loads on demand when a
  project's operation/request is selected, searched, or saved — cached, never
  loaded twice.
- **Loading message**: spinner row with progress counter appears in the unified
  explorer sidebar during load and clears when ready; partial rendering keeps
  the already-loaded tree interactive mid-load.
- **Migration** runs concurrently (fire-and-forget) and re-snapshots via
  `unified-load-refresh` — it no longer gates first paint.
- **Save safety**: `saveProject`/`updateProject` ensure the full project is
  loaded first, so a skeleton can never be persisted half-shape.

## Verification (re-run on the merged tree, main @ c4b34dc)

| Gate | Result |
|------|--------|
| webview vitest (`src-tauri/webview`, `vitest run`) | 41 files, **282/282 pass** |
| Rust lib tests (`cargo test -p apinox --lib`) | **176/176 pass** |
| TypeScript (`tsc --noEmit`) | **0 errors** |
| Startup bench (30×100 ops, `APINOX_STARTUP_BENCH=1`) | skeleton **1063 ms / 296 KB off-main** vs old **1913 ms SYNC / 31.55 MB** on the main thread |

Key regression tests:
- `contexts/__tests__/unifiedProjectContextLoader.test.tsx` (4 cases) —
  loading-state transition, no double-load of a project's detail.
- `components/explorer/__tests__/unified_explorer_loading_indicator.test.tsx`
  (8 cases) — indicator appears with (n/m) counter, partial rendering keeps the
  tree interactive mid-load, fixed-height row (no layout shift), clears on
  ready, ready-with-errors warning, error + Retry, idle empty state.
- `project_storage.rs` skeleton/detail tests — skeleton strips every deferrable
  payload and stays <5% of the full payload; detail round-trips the full
  project byte-identically to the canonical load.

## Lanes consolidated

- `wt/t_aafaf92b` @ 63a009c ≡ `wt/t_9e350f06` @ 5d259fe (identical loader
  content, fast-forwarded into the integration branch).
- `wt/t_28cab51c` @ ba428e4 = loader + §4 indicator + verification
  (the merged superset).
- `wt/t_d55a5ff6` stayed at base 0374c95; its design note was committed in
  implemented form on the integration branch.
- Note: `wt/t_9e350f06` still carries **dirty F-02 Quick-Requests files**
  belonging to the separate lane t_20e9b02c (pushed at origin/wt/t_20e9b02c,
  byte-identical to that branch's content). Left in place for that lane; no
  F-02 content leaked into this fix (verified hunk-by-hunk).
