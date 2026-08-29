# Monaco Callback Audit — APInox

Task: t_9cf5de65
Date: 2026-08-29
Auditor: omen-worker (package + webview source inspection)

## Scope

This audit covers every Monaco editor instance and its event/callback
registrations across the codebase. All editor instances funnel through the
shared `packages/request-editor` package's `MonacoEditorWrapper` (the webview
imports it as `@apinox/request-editor/monaco`). The higher-level shared
components (`MonacoRequestEditor`, `MonacoResponseViewer`, `ScriptEditor`,
`MonacoSingleLineInput`, `GraphQLVariablesPanel`, `AssertionsPanel`) wrap
`MonacoEditorWrapper` and add their own callbacks. The webview components that
use `MonacoEditorWrapper` directly add only an `onChange` (plus occasional
`onMount`).

## Architecture summary

- The only place a raw Monaco editor is created is
  `MonacoEditorWrapper.tsx` via `monaco.editor.create(...)`.
- Every editor instance therefore gets the wrapper's own `onDidChangeModelContent`
  listener (drives `onChange`).
- Higher-level components layer additional listeners/actions on top.

## 1. The core wrapper: `packages/request-editor/src/components/MonacoEditorWrapper.tsx`

The single place `monaco.editor.create()` is called. Callbacks registered:

| Line | Event / API | Frequency | Disposed? | Notes |
|------|-------------|-----------|-----------|-------|
| 177 | `editor.onDidChangeModelContent` | **per keystroke** | yes (cleanup on `[onChange]` change) | Fires `onChange(editor.getValue())` on EVERY content change. No debounce/throttle. This is the single hottest Monaco callback in the app. |

**Critical issue — re-subscription churn on every render:**
The `onChange` effect depends on `[onChange]`. Most callers pass an **inline
arrow function** (e.g. `MonacoRequestEditor` line 544, `ScriptEditor` line 275,
`NotesEditor` line 443, `GraphQLVariablesPanel` line 140, every webview caller).
Because inline arrows have a new identity on every render, the wrapper tears
down and re-registers its `onDidChangeModelContent` listener on **every parent
re-render**. Each keystroke → `onChange` → parent `setState` → re-render →
new inline `onChange` → wrapper effect cleanup + re-subscribe. This is wasted
work on the hot path and partially negates the debounce/flush logic callers
build (e.g. ScriptEditor's 800ms debounced save still triggers a re-subscribe
on every keystroke via its own state update).

**Other wrapper notes:**
- Line 108: `automaticLayout: true` — Monaco's layout observer fires on every
  container resize / layout change. Not a user-input callback, but contributes
  to per-frame work in split/resizable layouts.
- Lines 126-148: value sync via `executeEdits` on `[value]` change; guarded by
  `value !== current`, so no redundant write when identical.
- Lines 160-170: `setTheme` / `updateOptions` effects — cheap, not per-keystroke.

## 2. `MonacoRequestEditor.tsx` (shared)

Adds, on top of the wrapper, the following (all registered once in
`handleEditorDidMount`, fired on editor mount):

| Line | Event / API | Frequency | Notes |
|------|-------------|-----------|-------|
| 162 | `editor.onDidFocusEditorText` | on focus | fires `onFocus()` if provided — low frequency, OK |
| 176 | `editor.addAction` "insert-newline" (Enter) | per keypress | keybinding hijack — action registry |
| 204/212 | `addAction` paste (Ctrl+V + context-menu override) | per paste | |
| 222 | `monaco.languages.registerCompletionItemProvider` (${...}) | on provider query | **global registry leak** (see below) |
| 263 | `monaco.languages.registerCompletionItemProvider` ({{...}}) | on provider query | **global registry leak** (see below) |
| 391/399 | `addAction` copy | per copy | |
| 423/431 | `addAction` cut | per cut | |
| 476 | `window.addEventListener("message")` | per message | properly removed on unmount; guarded by `ed.hasTextFocus()` |

**Problem: completion providers are registered GLOBALLY on every editor mount.**
`registerCompletionItemProvider` is a **monaco global** (not per-editor) API.
`handleEditorDidMount` calls it unconditionally (the `{{...}}` one at line 263
has no guard at all; the `${...}` one at 222 is guarded by
`availableVariables.length > 0`). Combined with the wrapper's remount-on-theme
`key={`request-editor-${theme}`}`, every theme switch or editor remount
re-registers these providers and **never disposes them**. Over a session with
multiple requests + theme flips, providers accumulate → completion queries run
N redundant providers, each scanning the model. This is a genuine leak and a
per-keystroke autocomplete cost.

**Problem: no debounce on the content→onChange path.**
`onChange` fires on every keystroke (via wrapper) and propagates straight to
the parent (e.g. `updateRequestBody` in the explorer). See recommendations.

**`key` remount on theme change.** Line 541 `key={`request-editor-${theme}`}`
forces a full editor dispose + recreate when the app theme flips. This is
expensive (re-parses the whole model, re-runs folding, re-registers providers,
re-creates the model). Monaco themes can be swapped in place with
`monaco.editor.setTheme` — no remount needed.

## 3. `MonacoResponseViewer.tsx` (shared)

Read-only viewer. Callbacks:

| Line | Event / API | Frequency | Notes |
|------|-------------|-----------|-------|
| 98 | `editor.addCommand` Ctrl+C | per copy | OK |
| 107 | `editor.onMouseDown` | per mousedown | sets `isMouseDown`/`wasMouseSelection` flags |
| 112 | `editor.onMouseUp` | per mouseup | fires `onSelectionChange` |
| 131 | `editor.onDidChangeCursorSelection` | **per cursor move / selection change** | calls `onSelectionChange` + `getValueInRange` + `getOffsetAt` on every selection event — **no throttle/debounce** |

**Problem: `onDidChangeCursorSelection` is high-frequency and unthrottled.**
It fires on every selection change including cursor arrow-key moves and
drag-select steps. On each fire it recomputes `getValueInRange` + `getOffsetAt`
over the full selected range and calls `onSelectionChange` (a prop that in
consumers like `TrafficDetails` may drive React state / UI). There is a
mouse-down/up guard intended to dedupe mouse selections, but keyboard cursor
moves still fire per keystroke. No debounce/rAF throttle.

**`key` remount on theme change.** Line 77 `key={`response-viewer-${theme}`}`
— same remount-on-theme cost as the request editor.

## 4. `MonacoSingleLineInput.tsx` (shared)

| Line | Event / API | Frequency | Notes |
|------|-------------|-----------|-------|
| 71 | `editor.addCommand` Enter | per Enter | fires `onEnter` |
| 96/105 | `addAction` paste (Ctrl+V + context override) | per paste | |
| 126/134 | `addAction` copy | per copy | |
| 157/165 | `addAction` cut | per cut | |
| 174 | `editor.onDidFocusEditorText` | on focus | fires `onFocus()` — OK |
| 213 | `window.addEventListener("message")` | per message | removed on unmount; guarded by `hasTextFocus()` |

No high-frequency Monaco listeners here. All low-frequency. `onChange` is
inherited from the wrapper (per keystroke) but that's inherent to an input.

## 5. `ScriptEditor.tsx` (shared)

| Line | Event / API | Frequency | Notes |
|------|-------------|-----------|-------|
| (mount) | `ts.javascriptDefaults.setDiagnosticsOptions` | once | global, OK |
| 166 | `ts.javascriptDefaults.addExtraLib` (sandbox.d.ts) | once per mount | **global registry; re-added on each mount; never removed** — minor leak, same libUri overwrites so bounded |
| (wrapper) | `onDidChangeModelContent` → `handleChange` → `setScriptContent` | per keystroke | |
| 104 | debounced auto-save `setTimeout(800ms)` | per keystroke reset | debounced save is good, but `setScriptContent` on every keystroke re-renders and re-subscribes the wrapper's onChange (new inline arrow) |

The 800ms debounce on save is correct. The residual cost is per-keystroke state
update + wrapper re-subscription. `onChange={handleChange}` is a stable ref so
the wrapper re-subscribe is triggered by the parent re-render creating a new
`value`/props — actually `handleChange` is stable; the re-subscribe is driven by
`setScriptContent` re-rendering this component, which recreates the props object
but `handleChange` reference stays stable. So re-subscribe here is less of an
issue than in inline-arrow callers. Still, decorations and re-renders run per
keystroke.

## 6. `GraphQLVariablesPanel.tsx` (shared)

| Line | Event / API | Frequency | Notes |
|------|-------------|-----------|-------|
| 140 | wrapper `onChange` (inline arrow) → `handleChange` | per keystroke | `JSON.parse` of the WHOLE document on every keystroke — `handleChange` parses full JSON each time. For large variables this is per-keystroke parse cost. |

**Problem: full `JSON.parse` on every keystroke.** Each keystroke re-parses the
entire JSON body and on failure just sets an error banner. No debounce.

## 7. `AssertionsPanel.tsx` (shared)

| Line | Event / API | Frequency | Notes |
|------|-------------|-----------|-------|
| 388 | `editor.addAction` "insert-newline" | per Enter | one small action per assertion's script editor |

Per-keystroke wrapper `onChange` → `updateConfig(id, 'script', val)` — writes
to parent state on every keystroke of the script editor. No debounce.

## 8. Webview direct `MonacoEditorWrapper` consumers

All register only an `onChange` (inline arrow → per-keystroke state update) and
in most cases no onMount. Instances:

| File | Line | Language | onChange target | onMount |
|------|------|----------|-----------------|---------|
| `notes/NotesEditor.tsx` | 439 | per-note | `updateContent` (drives note dirty/autosave) | none |
| `components/workspace/ScriptStepEditor.tsx` | 145 | javascript | `setScript` | none |
| `components/workspace/RequestStepEditor.tsx` | 192 | xml | `setRequestBody` | none |
| `components/modals/WorkflowBuilderModal.tsx` | 1024 | javascript | `updateCurrentStep({script})` | none |
| `components/modals/WorkflowBuilderModal.tsx` | 1091 | xml | `updateCurrentStep({requestBody})` | none |
| `components/modals/SettingsEditorModal.tsx` | 536 | json | `setJsonContent` | applies theme |
| `components/modals/ScriptPlaygroundModal.tsx` | 403 | xml | `setResponseBody` | none |
| `components/modals/ScriptPlaygroundModal.tsx` | 440 | json | `setVariables` | none |
| `components/modals/ScriptPlaygroundModal.tsx` | 454 | javascript | `setScript` | none |

Each of these is a per-keystroke `setState`/`onChange`. For `NotesEditor`, note
that `updateContent` feeds autosave + dirty tracking — the debounce (if any)
lives in the notes store, but the Monaco wrapper still fires per keystroke.

## 9. Webview consumers of the higher-level shared components

These are the editors the user actually types into most:

| Consumer | Request editor | Response viewer | Single-line inputs |
|----------|----------------|-----------------|--------------------|
| `components/explorer/UnifiedExplorerMain.tsx` | `MonacoRequestEditorWithToolbar` (595) | `MonacoResponseViewer` (641) | — |
| `components/WorkspaceLayout.tsx` | `MonacoRequestEditorWithToolbar` | `MonacoResponseViewer` | `MonacoSingleLineInput` (URL) |
| `components/proxy/TrafficDetails.tsx` | `MonacoRequestEditorWithToolbar` (252) | `MonacoResponseViewerWithToolbar` (268) + `MonacoResponseViewer` (282) | — |
| `components/proxy/MockRulesPage.tsx` | `MonacoRequestEditor` (1064) | — | — |
| `components/proxy/FileWatcherPage.tsx` | `MonacoRequestEditorWithToolbar` (467) | `MonacoResponseViewer` (488) | — |
| `components/proxy/BreakpointsPage.tsx` | `MonacoRequestEditorWithToolbar` (835) | — | — |

Each request editor inherits all of section 2's callbacks; each response viewer
inherits section 3's. A typical explorer screen holds **1 request editor + 1
response viewer**, i.e. 2 `onDidChangeModelContent`-class hot paths and 1
`onDidChangeCursorSelection` hot path, plus the accumulated global completion
providers.

## 10. Redundant / duplicate registrations (cross-file)

1. **Global completion-provider accumulation** (MonacoRequestEditor). Registered
   on every mount, never disposed, and the editor is force-remounted on theme
   change (`key`). Providers accumulate across sessions of editing. HIGH impact
   on autocomplete latency and keystroke handling.
2. **Duplicate clipboard/action registry overrides.** The same custom
   `addAction` ids (`editor.action.clipboardPasteAction`, `...CopyAction`,
   `...CutAction`, `custom-paste/copy/cut`) are registered in **three**
   components: `MonacoRequestEditor`, `MonacoSingleLineInput`, and
   (paste/copy/cut) duplicated per editor. These are per-editor, so not a leak,
   but the identical ~60-line clipboard block is copy-pasted in 3 places —
   maintenance/redundancy smell, not a runtime leak.
3. **Duplicate `insert-newline` Enter action** registered in both
   `MonacoRequestEditor` (176) and `AssertionsPanel` (388) — same behavior,
   duplicated.
4. **Duplicate useWildcardDecorations / xmlFoldingUtils copies** exist in
   `src-tauri/webview/src/{hooks,utils}` but the shared package has its own.
   The webview copies are dead/duplicate code (only referenced by a stale test
   `__tests__/MonacoRequestEditor.test.tsx` that imports a local
   `../MonacoRequestEditor` that doesn't exist). Not a runtime callback leak,
   but confirms duplicated editor logic lives in two places.

## 11. Problematic registrations — ranked

| # | Severity | Location | Problem |
|---|----------|----------|---------|
| P1 | HIGH | MonacoRequestEditor.tsx:222,263 | `registerCompletionItemProvider` is global, re-registered on every mount/theme-remount, never disposed → providers accumulate; autocomplete runs N redundant providers per query |
| P2 | HIGH | MonacoEditorWrapper.tsx:177 + inline-arrow `onChange` callers | `onDidChangeModelContent` fires per keystroke; inline `onChange` arrows cause listener teardown+re-subscribe on every parent render (hot-path churn) |
| P3 | MED | MonacoResponseViewer.tsx:131 | `onDidChangeCursorSelection` unthrottled; `getValueInRange`+`getOffsetAt`+`onSelectionChange` per cursor move/selection step |
| P4 | MED | MonacoRequestEditor.tsx:541 / MonacoResponseViewer.tsx:77 | `key={...theme}` forces full editor remount on theme change → re-parse, re-fold, re-register providers |
| P5 | MED | GraphQLVariablesPanel.tsx:99-113 | full-document `JSON.parse` on every keystroke |
| P6 | MED | MonacoRequestEditor.tsx:162, AssertionsPanel, ScriptEditor, ScriptStepEditor | `onFocus`/state-update wiring runs on every keystroke (no debounce) where the consumer expects infrequent updates |
| P7 | LOW | MonacoRequestEditor + MonacoSingleLineInput + AssertionsPanel | ~60-line clipboard/action registration block copy-pasted in 3+ places (redundant code) |
| P8 | LOW | MonacoRequestEditor/ResponseViewer `key` remount + global `setTheme` in wrapper | `monaco.editor.setTheme` is global — one theme change re-themes every editor; combined with keyed remount it multiplies work |

## 12. Callback count summary

Per active request editor instance (`MonacoRequestEditor`):
- 1 × `onDidChangeModelContent` (wrapper, per keystroke)
- 1 × `onDidFocusEditorText`
- 8 × `addAction` (insert-newline, 2×paste, 2×copy, 2×cut) — keybinding/context actions
- 2 × `registerCompletionItemProvider` (global, accumulate)
- 1 × `window.addEventListener("message")`
- = **~13 registrations, of which 1 is per-keystroke (hot) and 2 are global-accumulating**

Per active response viewer instance (`MonacoResponseViewer`):
- 1 × `onDidChangeModelContent` (wrapper, per keystroke — read-only so only fires on programmatic set)
- 1 × `onMouseDown`, 1 × `onMouseUp`
- 1 × `onDidChangeCursorSelection` (per cursor move — hot)
- 1 × `addCommand` Ctrl+C
- = **~5 registrations, 1 hot**

Per single-line input:
- 1 × `onDidChangeModelContent` (wrapper)
- 1 × `onDidFocusEditorText`
- 1 × `addCommand` Enter
- 6 × `addAction` (2×paste, 2×copy, 2×cut)
- 1 × `window.addEventListener("message")`
- = **~10 registrations, 1 per-keystroke**

A typical explorer screen (request editor + response viewer): **~18 Monaco
registrations, 2 hot per-keystroke paths, plus 2 global providers per request
editor mount.**

## 13. What is NOT a problem (verified)

- All `addAction`/`addCommand` registrations are per-editor (disposed with the
  editor) except the `registerCompletionItemProvider` globals.
- `window.addEventListener("message")` handlers are correctly removed on
  unmount in MonacoRequestEditor and MonacoSingleLineInput.
- The wrapper's `onDidChangeModelContent` effect correctly disposes its
  listener when `onChange` identity changes (cleanup present).
- Wrapper value-sync guards against redundant writes (`value !== current`).
- ScriptEditor's auto-save is properly debounced at 800ms and flushes on unmount.

## 14. Recommendations (pointer for t_6d3fc405 root-cause analysis)

1. Register completion providers **once, globally, at module init** (or dispose
   on unmount with the returned `IDisposable`), not per editor mount.
2. Remove the theme `key` remount; swap themes in place via
   `monaco.editor.setTheme` (already done globally) so editors don't rebuild.
3. Stabilize `onChange` callbacks with `useCallback` and/or memoized props to
   stop the wrapper re-subscribing `onDidChangeModelContent` every render.
4. Debounce/rAF-throttle `MonacoResponseViewer.onDidChangeCursorSelection` and
   the request editor's `onChange` → parent state path.
5. Debounce `GraphQLVariablesPanel` JSON parsing.
6. Extract the duplicated clipboard/action block into one shared helper.
