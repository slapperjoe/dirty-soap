# MONACO_PERF_BASELINE.md — Monaco editor performance baseline (task t_12cc8444)

Date: 2026-08-29 · Measured by: lwoody-coder (run 28)
Parent: t_5449a524 ("The Monaco editors are feeling laggy…") · Sibling inputs: MONACO_CALLBACK_AUDIT.md (t_9cf5de65)
Feeds: t_6d3fc405 (root-cause analysis)

---

## 1. Method

- **Harness**: temporary profiling page (`packages/request-editor/perf.html` → `dev/perf-main.tsx` → `dev/perf-app.tsx`) served by the package's Vite dev server on 127.0.0.1:3001. It mounts the **real, unmodified** production components — `MonacoRequestEditor` (xml, autocomplete enabled, wildcard decorations), 3× `MonacoSingleLineInput`, `MonacoResponseViewer` (read-only, **2,108 lines / 119,689 chars** of XML), and a second `MonacoRequestEditor` — in a 6-editor layout mimicking a populated explorer screen.
- **Instrumentation** (`dev/perf-instrumentation.ts`): monkey-patches `monaco.editor.create`, `registerCompletionItemProvider`, and per-editor `onDidChangeModelContent` / `onDidChangeCursorSelection` / `onDidScrollChange` (measures every component-callback fire and counts subscribe/unsubscribe churn), plus `setValue` / `executeEdits` / `setDecorations` / `deltaDecorations`, `PerformanceObserver` long tasks (>50 ms), rAF frame-gap sampler (>34 ms), console capture of Monaco worker-fallback warnings, and `performance.getEntriesByType("resource")` for Monaco chunk transfer.
- **Drivers** (scripted via `window.__perf` from the DevTools console): typing = 40 keystrokes @ 90 ms through `editor.trigger(...,"type")` (same code path as real keydowns); scroll = 40 `revealLineInCenterIfOutsideViewport` steps @ 80 ms over the full 2,108-line response document; autocomplete = `{{env` prefix + `editor.action.triggerSuggest`; idle = 3 s / 2 s sampling windows.
- **Environment**: Vite **dev** build (unminified Monaco ESM, 201 chunks / 8.9 MB fetched), headless Chromium on the LWoody host (RTX 5090 box — close to the user's machine). Monaco **0.55.1** (same major as the webview pin).

### Environment red flag found first

**No `MonacoEnvironment` worker configuration exists anywhere** — grep over `src-tauri/webview/src/` and `packages/request-editor/src/` returns zero hits for `MonacoEnvironment` / `getWorkerUrl` / `getWorker`. At runtime Monaco logs:

```
Could not create web worker(s). Falling back to loading web worker code in main thread,
which might cause UI freezes.
You must define a function MonacoEnvironment.getWorkerUrl or MonacoEnvironment.getWorker
```

So **XML validation, tokenization, and completion all run on the main thread in both the dev harness and the shipping Tauri webview.** This is the highest-leverage structural finding; everything below is measured with that fallback active (i.e., it represents the real-world worst case, which is also the production behavior).

---

## 2. Workflow 1 — Editor initialization

| Metric | Value |
|---|---|
| First `editor.create()` sync cost | **26 ms** (editor #1); editors 2–6: 10.5 / 1.9 / 1.2 / 3.1 / 2.2 ms |
| All 6 editors created | t = 68 → 128 ms after module eval (~60 ms window) |
| First render fire after create | +83 ms |
| Long tasks during init | **60 ms and 77 ms** (monaco core init on main thread) |
| Frame drops during init | 50 ms and 100 ms gaps |
| Monaco JS transfer | 201 chunks, **8.9 MB** (dev, unminified; production minified build is smaller) |

Notes: init cost is dominated by module evaluation + core init, not by the per-editor `create()` calls (1–3 ms each). The 77 ms long task at t≈58 ms lands in the first editor's model/tokenization path. In the shipping app this happens on every app start *and* every time a tab/panel mounts an editor (see §7 item 5: theme-keyed remounts).

---

## 3. Workflow 2 — Typing (40 keys @ 90 ms, request editor, all 6 editors mounted)

| Metric | Value |
|---|---|
| key → model content latency | min 0.2 / p50 **0.6** / p90 1.0 / max 3.0 ms |
| `onDidChangeModelContent` fires | **720 total = 18 per keystroke** (all 6 editors' wrapped listeners; none >0.1 ms, zero slow fires >4 ms) |
| `onDidChangeCursorSelection` fires | 280 total = **7 per keystroke** |
| `deltaDecorations` calls | 83 (≈2 per key — wildcard decoration recompute per keystroke) |
| `setValue` / `executeEdits` | **0** (good: typing does not re-drive the wrapper's value-sync path) |
| Long tasks / frame drops | **0 / 0** for the entire typing phase |
| Listener churn (10-key burst, counter diff) | **+50 `onDidChangeModelContent` subscribes and +50 unsubscribes = 5 full dispose/re-subscribe cycles per keystroke** |
| Live `onDidChangeModelContent` listeners per editor | **22–23** (editor #1: 23, response viewer: 22, single-line inputs: 22) |
| Live `onDidChangeCursorSelection` listeners per editor | 10 (response viewer: 11) |

Interpretation:
- The **Monaco-internal** keystroke path is cheap in this build (sub-millisecond per callback, no long tasks). The raw "editor feels slow" cannot be explained by Monaco's own dispatch at these document sizes in a dev build.
- The measured **5 sub + 5 unsub per keystroke** is the concrete, quantified form of audit item P2: `MonacoEditorWrapper`'s content-listener effect is keyed on `[onChange]` (`MonacoEditorWrapper.tsx:173-186`), and both `MonacoRequestEditor` itself (inline arrow at `MonacoRequestEditor.tsx:544`) **and** the webview (`UnifiedExplorerMain.tsx:599`, inline arrow `onChange={(value) => setEditingXml(value)`) pass a fresh callback identity every render. Each keystroke → `onChange` → `setEditingXml` → parent re-render → new `onChange` identity → effect cleanup + re-subscribe across the wrapper **and** every sibling component that re-renders with a new callback identity. In a dev build this costs ~0.05 ms total per key (50 sub/unsub in <1 ms) — but it is pure waste, it breaks any future memoization, and it is the mechanism by which a *single* expensive callback (e.g. the 120 KB `getValueInRange` selection handler, P3) gets re-attached and re-validated every render.
- What the harness does **not** measure: the React re-render of `UnifiedExplorerMain` on every keystroke (the entire explorer subtree: headers, assertions, extractors panels, both editors' React wrappers, response viewer wrapper). In the real app that parent re-render is the prime suspect for perceived lag, and the per-key `debugLog` in `MonacoRequestEditor:545` (in-memory log store, capped 2000) plus the per-key wildcard `deltaDecorations` recompute ride along with it.
- With the main-thread worker fallback active, **XML validation of the 120 KB document also runs on the main thread** (throttled by Monaco's validation service); this adds periodic jank that the 90 ms key cadence can mask in a scripted run but a human feels when validation catches up.

---

## 4. Workflow 3 — Scrolling (40 reveal steps @ 80 ms, 2,108-line / 120 KB read-only response viewer)

| Metric | Value |
|---|---|
| `onDidScrollChange` fires | **369 = ~9 per scroll step** (all live listeners on that editor: 9 measured) |
| `onDidScrollChange` callback cost | all <0.2 ms, zero slow fires |
| Long tasks / frame drops during scroll | **0 / 0** |
| `setValue`/`executeEdits`/decorations triggered by scrolling | 0 |

Scrolling is clean in this build even at 120 KB. Caveat: `onDidRenderEditor` is not in Monaco 0.55's public API, so per-frame render duration could not be sampled (the `onDidLayoutChange` proxy only fires on layout changes: 6 fires total, all during init). On the user's machine, GPU compositing of the 120 KB scrolled view (and the minimap, if enabled) can still cost frames that this headless harness under-reports.

---

## 5. Workflow 4 — Autocomplete (trigger `{{env` + `triggerSuggest` on request editor)

| Metric | Value |
|---|---|
| `provideCompletionItems` invocations | 2 (Monaco's suggest service querying the provider set) |
| Provider cost | 0.1 ms and 0.3 ms (the app's two `${...}` / `{{...}}` providers are regex-on-line — cheap) |
| Content-change / decorations during phase | 18 / 2 |
| Long tasks / frame drops | 0 / 0 |

Provider *cost* is small; provider *quantity* is the problem (audit P1): `MonacoRequestEditor.handleEditorDidMount` calls `monaco.languages.registerCompletionItemProvider(language, …)` **per editor mount and never disposes** (the disposable return value is dropped at `MonacoRequestEditor.tsx:222` and `:263`). Registration is global per language, so after N request-editor mounts there are 2N live providers, and **every** suggest query in **any** xml editor runs all of them (each doing a `getValueInRange` + regex + `map` over variables/functions). The harness confirms the registration leak is real (`completion-register:xml = 2` after one request editor mounted, `completion-provide = 2` per query).

---

## 6. Direct API cost table (measured on the 120 KB response editor)

| Operation | Cost |
|---|---|
| `setValue` (same 119,689-char content) | 3.1 ms |
| `executeEdits` full-model replace | ~0 ms (async batch; the *render* follows) |
| `revealLineInCenterIfOutsideViewport` (mid-doc) | 0.2 ms |
| `focus()` | 1.7 ms |
| `monaco.editor.setTheme("vs-dark" / "vs")` (global) | 2.4 – 3.1 ms each, re-renders **all** editors |

`setTheme` is global: the theme-sync effects in `MonacoEditorWrapper` (`[theme]` effect, `monacoTheme.ts` `applyMonacoTheme`) plus the **`key={`request-editor-${theme}`} ` / `key={`response-viewer-${theme}`}` on the wrapper (audit P4) mean a theme change *remounts every editor* — paying the full §2 init cost again for each.

---

## 7. Latency hotspots, ranked (baseline → handoff to t_6d3fc405)

1. **H1 — Main-thread Monaco language services (no `MonacoEnvironment` anywhere).** Monaco's own warning: "might cause UI freezes". XML validation + tokenization of 100 KB+ documents on the main thread is the most plausible source of intermittent multi-frame jank (the 60/77 ms init long tasks are the same mechanism). Fix is cheap: configure `MonacoEnvironment.getWorker` (Vite `?worker` imports) in both the webview and the package's dev entry. *Impact: high. Effort: low.*
2. **H2 — Per-keystroke listener churn from unstable `onChange` identities** (`MonacoEditorWrapper.tsx:173-186` `[onChange]` effect + inline arrows at `MonacoRequestEditor.tsx:544` and `UnifiedExplorerMain.tsx:599`). Measured: 5 dispose/re-subscribe cycles per keystroke, 22–23 live content listeners per editor. Cheap today, but it multiplies the cost of every per-keystroke callback (H3, H4) and defeats memoization. Fix: stable callback identity in the wrapper (ref-held latest callback, subscribe once on mount) + `useCallback`/stable props at call sites. *Impact: medium (waste + amplifier). Effort: low.*
3. **H3 — `MonacoResponseViewer.onDidChangeCursorSelection` runs unthrottled** and calls `model.getValueInRange` + `getOffsetAt` per selection change on the 120 KB model (audit P3; 10 live listeners, 7 cursor-selection fires per keystroke measured on focused editors, 280 over 40 keys). Each is sub-0.1 ms in this run, but `getValueInRange` over a large selection on a 120 KB model is O(selection) and scales with document size — the first place the current sub-millisecond numbers stop being true. Fix: throttle/debounce + cache selection, only compute text on mouseup/commit (the code already special-cases mouseup — the keyboard path still fires per change). *Impact: medium-high on large responses. Effort: low.*
4. **H4 — Completion providers registered globally per mount, never disposed** (`MonacoRequestEditor.tsx:222,263`; audit P1). 2N providers after N mounts; every suggest runs all of them in every xml editor. Also: `{{`/`$` trigger characters on a *global* provider means the variable providers fire for `{{` typed in **any** editor bound to that language. Fix: capture and dispose the registration on unmount, or register once per language (module-level) with data read via closure over current variables. *Impact: medium (grows with tabs opened). Effort: low.*
5. **H5 — Parent re-render per keystroke in the explorer.** `setEditingXml` on every keystroke re-renders `UnifiedExplorerMain`'s subtree (both Monaco wrappers, headers/assertions/extractors panels, response viewer wrapper). The harness measures Monaco's side of this loop (sub-ms) but not the React side; with 6 editors and 3 side panels this is the classic Postman-style "everything re-renders per key" pattern. Fix candidates: isolate `editingXml` state into the editor leaf / context with selector-based subscription, memoize `MonacoResponseViewer` (its `value` is stable during typing). *Impact: high (suspected dominant perceived cost). Effort: medium.*
6. **H6 — Theme change remounts all editors** (`key={...theme}` on wrappers + global `setTheme`, audit P4/P8; 2.4–3.1 ms per `setTheme` plus full re-init per editor per §2). Only fires on theme toggle, not per keystroke. *Impact: low frequency, high cost. Effort: low.*
7. **H7 — `debugLog` per keystroke** in `MonacoRequestEditor:545` into a 2000-entry in-memory store (`logger.ts`): allocation + occasional `shift()` on a 2000-element array. Negligible at current size; noted for completeness (it is on the hot path). *Impact: negligible. Effort: trivial.*

Cross-reference: items H2–H6 are the dynamic measurements that validate/quantify static audit items P1–P8 from `MONACO_CALLBACK_AUDIT.md` (t_9cf5de65).

---

## 8. Caveats

- **Dev build numbers**: unminified Monaco ESM over 201 chunks; production Tauri builds are minified/bundled — absolute init numbers will differ, the relative structure (per-`create` 1–3 ms, long tasks in core init, main-thread validation) should hold.
- **Headless Chromium** on the dev host; the user's Tauri webview (also Chromium) should be comparable, but GPU compositing of large scrolls is under-represented here.
- `onDidRenderEditor` is not public in monaco 0.55.1 → per-frame render durations were not sampled; frame drops were sampled via rAF gaps instead (none observed outside init).
- `getScrollInfo`/`setScrollTop` were absent from this ESM instance surface, so scrolling was driven via `revealLineInCenterIfOutsideViewport` (same scroll pipeline, slightly different call site).
- The harness runs 6 editors; real screens may mount more (script editors, assertions panels in the webview add 9 more direct consumers per the audit) — churn and listener counts scale linearly.
- Harness files are **temporary** (`packages/request-editor/perf.html`, `dev/perf-app.tsx`, `dev/perf-main.tsx`, `dev/perf-instrumentation.ts`) — safe to keep for t_6d3fc405's A/B verification, safe to delete afterwards.

## 9. Reproducing

```bash
cd packages/request-editor && npm install
npx vite --port 3001 --strictPort --host 127.0.0.1
# open http://127.0.0.1:3001/perf.html
# DevTools console:
window.__perf.report()          # full report
window.__perf.getCounters()     # sub/unsub churn counters
window.__perf.getEditors()      # live editor handles
```