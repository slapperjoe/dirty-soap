# MONACO_LAG_ROOT_CAUSE.md — Root cause analysis: Monaco editor lag

Task: t_6d3fc405 · Date: 2026-08-29 · Analyst: lwoody-coder
Inputs: `MONACO_PERF_BASELINE.md` (t_12cc8444, measured on wt/t_12cc8444 @ 1a71479) and
`MONACO_CALLBACK_AUDIT.md` (t_9cf5de65). All structural claims below were
**re-verified against this worktree's source (wt/t_6d3fc405) and re-measured**
with the profiling harness (re-created in `packages/request-editor/`, extended
with a React `Profiler` for per-commit render costs).

Feeds: t_c20ec889 (implementation of the top fixes).

---

## 1. Verification performed on this branch

Re-ran the baseline harness (real, unmodified production components; 6 editors:
2× `MonacoRequestEditor` (xml, autocomplete, wildcard decorations), 3×
`MonacoSingleLineInput`, 1× read-only `MonacoResponseViewer`) plus a new React
`Profiler` around the harness app and a per-editor `updateOptions` counter:

| Check | Result (this branch) | Matches baseline? |
|---|---|---|
| `MonacoEnvironment`/`getWorker` anywhere in repo | **0 grep hits** (webview + package) | ✓ (H1) |
| Runtime worker-fallback warnings | **2** ("Falling back to loading web worker code in main thread… might cause UI freezes") | ✓ (H1) |
| Typing 40 keys @ 90 ms | content-change fires **720 (18/key)**; deltaDecorations **83**; key→content p50 **0.5 ms**, max 3.6 ms; long tasks **0** | ✓ (H2) |
| Listener churn (40-key burst) | **200 subscribe + 200 unsubscribe = 5 dispose/re-subscribe cycles per keystroke** | ✓ (H2) |
| `completion-register:xml` after 2 request-editor mounts | **2** (one per mount; disposables dropped) — providers accumulate, never disposed | ✓ (H4) |
| **New:** React commits per keystroke | **1 full-tree commit/key; actualDuration p50 0.3 ms, p90 0.5, max 0.6 ms** (harness lower bound) | quantifies H5 |
| **New:** `editor.updateOptions()` per keystroke | **called on ALL 6 mounted editors per keystroke** — 60 calls / 10 keys; request editors ~0.6 ms/key each, single-line inputs ~0.02 ms/key | **new finding (H8, see §2)** |

Source re-verification (file:line in this worktree):

- `MonacoEditorWrapper.tsx:173-186` — content-listener effect keyed on `[onChange]`;
  teardown/re-subscribe whenever `onChange` identity changes. Confirmed.
- `MonacoEditorWrapper.tsx:167-170` — options effect keyed on `[options]`; fires on
  every render that passes a new `options` object. Confirmed.
- `MonacoEditorWrapper.tsx:160-164` — `monaco.editor.setTheme(theme)` is **global**;
  called on every wrapper mount *and* on every `[theme]` change. Confirmed.
- `MonacoRequestEditor.tsx:488-501` — `editorOptions` object literal built in the
  render body → new identity every render → drives the `updateOptions` churn above. **New finding.**
- `MonacoRequestEditor.tsx:222,263` — `registerCompletionItemProvider` (global, per
  mount, return-value IDisposable dropped). Confirmed.
- `MonacoRequestEditor.tsx:541,544-550` — `key={`request-editor-${theme}`}` remount +
  inline `onChange` arrow + per-keystroke `debugLog` (545). Confirmed.
- `MonacoResponseViewer.tsx:131-146` — `onDidChangeCursorSelection` unthrottled;
  `getValueInRange` + `getOffsetAt` per selection change. Confirmed.
- `UnifiedExplorerMain.tsx:56,599` — `editingXml` state in the explorer root; inline
  `onChange={(value) => setEditingXml(value)}` on the request editor. Confirmed.
- `GraphQLVariablesPanel.tsx:99-113` — full-document `JSON.parse` in `handleChange`
  on every keystroke (via inline `onChange={handleChange}` at :140 — though
  `handleChange` itself is stable, the parse is not debounced). Confirmed.
- Vite configs: `src-tauri/webview/vite.config.ts` (aliases
  `@apinox/request-editor/monaco` → package **source**; `monaco-editor` in
  `manualChunks`; `optimizeDeps.exclude` already lists `json.worker` — the app
  plainly ships worker-dependent Monaco features with no worker configured) and
  `packages/request-editor/vite.config.ts` (same pattern in dev). Confirmed.

---

## 2. Root causes (ranked)

The lag is **not** caused by Monaco's core keystroke path — that is sub-millisecond
in both dev (measured) and is fine in production. It is caused by five compounding
structural defects. RC1 is the source of intermittent multi-frame freezes;
RC2–RC3 are the source of steady per-keystroke waste that makes the whole screen
feel heavy while typing; RC4–RC5 are size/scale-dependent costs that grow with
document size and session length.

### RC1 — Monaco language services run on the main thread (no `MonacoEnvironment` anywhere) [HIGH impact]

The repo has **no** `MonacoEnvironment.getWorker`/`getWorkerUrl` in the webview or
the package. Monaco's own warning fires at runtime (2 warnings per harness load):
*“Could not create web worker(s). Falling back to loading web worker code in main
thread, which might cause UI freezes.”*

Consequence: XML/JSON validation, tokenization, folding, and completion
computation all run on the main thread. The 60/77 ms long tasks measured during
init are this mechanism; on 100 KB+ documents (routine for SOAP responses)
validation/tokenization work lands as periodic multi-frame jank that a scripted
90 ms typing cadence masks but a human feels directly. This is the single largest
source of **intermittent** lag and the only one that scales hard with document
size.

### RC2 — Per-render prop identity churn turns every keystroke into 5 listener teardown/re-subscribes + 6 `updateOptions` calls [MEDIUM impact, amplifier]

Three linked defects, all verified by measurement:

1. `MonacoEditorWrapper`'s content-listener effect is keyed on `[onChange]`
   (`MonacoEditorWrapper.tsx:173-186`) and nearly every caller passes an **inline
   arrow** (`MonacoRequestEditor.tsx:544`, `UnifiedExplorerMain.tsx:599`,
   `perf-app`-style usage across 9 webview consumers). Each keystroke →
   `onChange` → parent state → re-render → new arrow identity → **listener
   dispose + re-subscribe**. Measured: **5 full dispose/re-subscribe cycles per
   keystroke** (200 sub + 200 unsub over a 40-key burst) and **22–23 live
   `onDidChangeModelContent` listeners per editor** at steady state.
2. `MonacoRequestEditor` builds `editorOptions` as a **fresh object literal in the
   render body** (`MonacoRequestEditor.tsx:488-501`) and passes it to the wrapper,
   whose `[options]` effect (`MonacoEditorWrapper.tsx:167-170`) calls
   `editor.updateOptions(...)` whenever the identity changes. Measured: **every
   keystroke calls `updateOptions` on all 6 mounted editors** (60 calls / 10 keys;
   ~0.6 ms/key on each request editor). `updateOptions` is comparatively cheap,
   but it runs Monaco's option-diff/refresh pipeline on every editor in the app
   for a value that only changes on settings changes.
3. The same churn re-attaches every higher-level per-keystroke callback (RC4, RC5
   consumers), so RC2 **multiplies** the cost of RC4/RC5 work and permanently
   defeats any future `React.memo`/selector optimization (unstable props make
   memoization a no-op).

RC2's direct cost is modest (fractions of a ms) but it is pure waste on the
hottest path, it is the *mechanism* that keeps RC2-class defects in every future
component, and fixing it is a precondition for RC3 to be measurable/beneficial.

### RC3 — Keystroke state lives in the explorer root: the whole screen re-renders per keystroke [HIGH impact — dominant steady-state cost]

`UnifiedExplorerMain` keeps `editingXml` (and `editingRequest`) in the top-level
component (`UnifiedExplorerMain.tsx:54-56`) and feeds it straight into
`MonacoRequestEditor` with an inline `onChange` (:596-599). Each keystroke →
`setEditingXml` → **the entire explorer subtree re-renders**: both editors'
React wrappers, headers/assertions/extractors/variables panels, response viewer
wrapper, side panels. The harness measures the lower bound of this: 1 full-tree
React commit per keystroke at 0.3–0.6 ms in a 6-editor layout with *no* real
panels. On the real screen (more panels, more editors, styled-components, lucide
icons) the per-key commit is several times larger — and it also re-runs RC2's
churn (new inline arrows → dispose/re-subscribe; new `editorOptions` →
`updateOptions` on all editors). This is the classic Postman-style
"everything re-renders per key" pattern and the best explanation for the
**steady** feeling of heaviness while typing, which the Monaco-side measurements
(sub-ms, 0 long tasks) cannot account for on their own.

### RC4 — Unthrottled `onDidChangeCursorSelection` on large response models [MEDIUM-HIGH impact on large docs]

`MonacoResponseViewer.tsx:131-146` calls `model.getValueInRange(selection)` +
`getOffsetAt(...)` on **every** cursor/selection change (7 fires per keystroke
measured on focused editors; 10–11 live listeners on the response editor). In a
read-only viewer the user is typically *selecting* on 100 KB+ documents: each
drag step / arrow key re-copies the selected range (O(selection) over a 120 KB
model) and pushes it through `onSelectionChange` into consumer React state
(`TrafficDetails` etc.). The mouse path is guarded (report on mouseup); the
keyboard path is not. This is the first place the measured sub-millisecond
numbers stop being true as selection size grows, and it compounds with RC2
(re-attached every render).

### RC5 — Global completion providers registered per mount, never disposed [MEDIUM impact, grows with session]

`MonacoRequestEditor.handleEditorDidMount` calls
`monaco.languages.registerCompletionItemProvider` for the language
(`MonacoRequestEditor.tsx:222,263`) on **every editor mount** and drops the
returned `IDisposable`. Registration is **global per language**, so:

- after N request-editor mounts (tabs opened/closed, and *every theme flip*
  because of the `key={`request-editor-${theme}`}` remount — see RC6 below)
  there are 2N live providers;
- **every** `triggerSuggest` in **any** xml editor runs **all** of them (each
  does `getValueInRange` + regex + `map`);
- the `{"` / `$` trigger characters are global: typing `{{` in one editor fires
  the variable providers registered by every other mounted request editor.

Verified live: `completion-register:xml = 2` after one harness load with two
request editors mounted; disposables never invoked. Per-provider cost is small
(0.1–0.3 ms measured), so today's cost is mostly wasted work — but it grows
linearly with tabs and remounts, and it is the root of "autocomplete feels
slower the longer the app is open."

### RC6/RC7 (secondary, batch as cheap hygiene — not top-5)

- **RC6** — Theme change remounts **all** editors: `key={...theme}` on both
  wrappers + global `monaco.editor.setTheme` (2.4–3.1 ms each, re-renders every
  editor) + full re-init per editor (60–77 ms long tasks per baseline §2) and it
  re-triggers RC5's provider registration. Low frequency, high per-event cost.
- **RC7** — `debugLog` per keystroke (`MonacoRequestEditor.tsx:545`) into a
  2000-entry in-memory store + full-document `JSON.parse` per keystroke in
  `GraphQLVariablesPanel.tsx:107`. Negligible–low; fix in passing.

---

## 3. Prioritized optimization recommendations

Ranked by expected performance impact per unit of implementation effort.
"Verify" rows state how t_c20ec889 should confirm the fix with the harness
(`window.__perf` API, `window.__reactStats({ sincePerfPhase })`, `updateOptions`
counters; run the same 40-key typing / scroll / autocomplete drivers before and
after).

### R1 — Configure Monaco web workers via `MonacoEnvironment.getWorker`  [fixes RC1 — HIGH impact / LOW effort — DO FIRST]

Add one small module, e.g. `packages/request-editor/src/monacoWorkers.ts`:

```ts
import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import JsonWorker   from "monaco-editor/esm/vs/language/json/json.worker?worker";
import CssWorker    from "monaco-editor/esm/vs/language/css/css.worker?worker";
import HtmlWorker   from "monaco-editor/esm/vs/language/html/html.worker?worker";
import TsWorker     from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === "json") return new JsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new CssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new HtmlWorker(); // also serves XML
    if (label === "typescript" || label === "javascript") return new TsWorker();
    return new EditorWorker();
  },
};
```

Import it at the top of `MonacoEditorWrapper.tsx` (the single point where
`monaco.editor.create` is called — so both the Tauri webview (which compiles the
package **source** via the Vite alias) and the package's own dev harness pick it
up automatically; Vite emits the `?worker` chunks in both dev and the `base:'./'`
production build).

- **Expected impact**: removes the main-thread fallback Monaco warns about
  ("might cause UI freezes"); tokenization/validation of large XML moves off the
  main thread; eliminates the 60/77 ms init long tasks' validation component.
- **Verification**: harness `worker-fallback` counter goes 2 → **0** (no console
  warnings); typing/scroll long-task counts stay 0; autocomplete still works
  (XML validation now in `html.worker`).
- **Risk**: low. Only new chunk assets are emitted (verify they're in
  `dist/` of a production webview build and load under Tauri's `base:'./'`).

### R2 — Kill the per-keystroke churn: subscribe-once wrapper + memoized options + stable call-site callbacks  [fixes RC2 — MEDIUM impact / LOW effort]

1. `MonacoEditorWrapper.tsx:173-186` — keep the latest `onChange` in a ref
   (`onChangeRef.current = onChange` on every render) and subscribe
   `onDidChangeModelContent` **once on mount**; the handler calls
   `onChangeRef.current(...)`. The wrapper then becomes immune to unstable
   callback identities from all existing and future callers.
2. `MonacoRequestEditor.tsx:488-501` — wrap `editorOptions` in
   `useMemo([showMinimap, fontSize, fontFamily, readOnly, showLineNumbers])` so
   the wrapper's `[options]` effect only fires on real settings changes.
3. `UnifiedExplorerMain.tsx:599` — `onChange={useCallback(setEditingXml, [])}`
   (or `setEditingXml` directly), and apply the same one-line change to the
   other inline-arrow consumers if t_c20ec889 touches those files.

- **Expected impact**: removes ~5 dispose/re-subscribe cycles and ~6
  `updateOptions` calls **per keystroke**; listener count per editor drops from
  22–23 to ~2; makes R3's memoization actually take effect.
- **Verification**: 40-key burst → sub/unsub churn ≈ 0 (vs 200/200 baseline);
  `updateOptions` calls per 10 keys on all editors → **0** (was 60); typing
  latency and long-task counts unchanged (no regression).
- **Risk**: low. The subscribe-once pattern is behavior-preserving (same
  callback semantics; only the listener's lifetime changes).

### R3 — Isolate keystroke state out of the explorer root  [fixes RC3 — HIGH impact / MEDIUM effort]

`editingXml` in `UnifiedExplorerMain` re-renders the whole explorer subtree per
keystroke (verified: 1 full-tree React commit/key in the harness; larger in the
real screen). Options, in order of preference:

1. **State in the editor leaf**: a small `RequestEditorLeaf` component owns the
   `editingXml` state; the parent only receives it on commit (blur / Run /
   explicit save) via callback. The explorer's other children (panels, response
   viewer, single-line inputs) no longer re-render per key.
2. If other consumers need live XML (e.g. wildcard decorations already read it
   via props, headers panel), expose it through a context with
   selector-based subscription so only the consumers that read it re-render.
3. Whichever approach: `React.memo` `MonacoResponseViewer` (its `value` is
   stable during typing) and the side panels; wrap the request editor's
   non-keystroke props so memoization isn't defeated (R2's stable callbacks are
   a precondition).

- **Expected impact**: removes the dominant steady-state per-key cost in the
  real app (whole-subtree React commits + styled-components re-evaluation +
  RC2's churn on every re-rendered child). This is the fix most likely to
  visibly change the "feels laggy" complaint.
- **Verification**: harness `__reactStats` — React commits per 40-key burst
  drops from 40 (full tree) to ~0 for panels/response viewer (request editor
  leaf still commits, which is unavoidable and cheap); `updateOptions` and
  sub/unsub churn stay at R2's fixed levels; autocomplete/scroll unaffected.
- **Risk**: medium — `editingXml` currently feeds Run/persist paths; the commit
  contract (when the parent sees the final XML) must be preserved. Recommend
  keeping a `flush()` on the leaf (imperative handle) for the Run button.

### R4 — Throttle the response-viewer selection path  [fixes RC4 — MEDIUM-HIGH impact on large docs / LOW effort]

`MonacoResponseViewer.tsx:131-146`: rAF-throttle the `onDidChangeCursorSelection`
handler (coalesce to one fire per frame) and only run
`getValueInRange`+`getOffsetAt` when the selection is non-empty and changed since
last frame; keep the existing mouseup fast path. Optionally debounce the
`onSelectionChange` callback by ~50 ms for consumers that only need the final
value.

- **Expected impact**: per-drag-step cost on 120 KB models drops from
  O(selection) per event to at most one O(selection) per frame (and only when
  the range actually grew); keyboard arrow-moves in a read-only viewer stop
  computing selection text at all (empty selection short-circuit).
- **Verification**: harness — `cursor-selection` slow-fires (dur > 4 ms) on the
  response viewer during a scripted drag-select over a large range → 0; fires per
  40-key burst drop from ~280 to ~40 (one per key max, coalesced per frame).
- **Risk**: low. Selection text is display-only (highlight/preview); a 1-frame
  lag is imperceptible.

### R5 — Fix the completion-provider lifecycle  [fixes RC5 — MEDIUM impact / LOW effort]

Capture the `IDisposable` returned by `registerCompletionItemProvider`
(`MonacoRequestEditor.tsx:222,263`) and dispose it in the unmount cleanup — or,
better, register **once per language** (module-level registry) with the
provider reading the *current* `availableVariables`/functions through a ref, so
N mounted editors share 2 providers instead of 2N. Disposing on unmount is the
smaller, safer change; once-per-language is the proper end state (and it also
removes the "typing `{{` in editor A fires editor B's provider" cross-fire).

- **Expected impact**: provider count stops growing with tabs/remounts (theme
  flips included, once RC6 is fixed); every suggest query runs a constant
  number of providers regardless of how long the session has run.
- **Verification**: harness — `completion-register:xml` stays flat after
  unmounting/remounting a request editor (was 2 per mount, cumulative);
  autocomplete still suggests correctly (drive via `triggerSuggest` in dev or
  real Ctrl+Space in the app).
- **Risk**: low. The provider callbacks close over `availableVariables`; a
  ref-based read keeps suggestions current without re-registration.

### R6 — (Hygiene, fold into R5's change if time allows) Theme remount + per-key debugLog + GraphQL parse

Remove `key={`request-editor-${theme}`}` / `key={`response-viewer-${theme}`}`
(`MonacoRequestEditor.tsx:541`, `MonacoResponseViewer.tsx:77`) — themes already
switch in place via the global `setTheme` effect; gate the per-keystroke
`debugLog` (`:545`) behind a debug flag; debounce the `JSON.parse` in
`GraphQLVariablesPanel` (e.g. 300 ms, parse the last value on flush).

---

## 4. Suggested implementation order for t_c20ec889

1. **R1** (workers) — biggest structural win, no behavior risk, and it removes
   the one source of *intermittent* freezes. Verify `worker-fallback = 0`.
2. **R2** (subscribe-once + memoized options + stable callbacks) — cheap, and it
   de-risks R3 by removing the churn that would otherwise mask the measurement.
3. **R3** (state isolation + memoization) — the dominant steady-state fix;
   needs the most care (commit/flush contract for Run/persist).
4. **R4 + R5** (selection throttle + provider lifecycle) — cheap, independent,
   can land in the same PR or a follow-up.
5. **R6** hygiene in passing.

After the top fixes, re-run the harness end-to-end (init / typing / scroll /
autocomplete drivers in §9 of `MONACO_PERF_BASELINE.md`) and record the
before/after table in t_c20ec889's report. Acceptance signal: `worker-fallback
= 0`, per-keystroke sub/unsub and `updateOptions` churn ≈ 0, React full-tree
commits per keystroke eliminated for non-editor children, and no new long tasks
in any phase.

## 5. Caveats

- Harness React-commit numbers are a **lower bound**: the harness screen has
  fewer panels than the real explorer; the mechanism (root-held keystroke
  state, inline arrows, un-memoized children) is identical and was verified in
  `UnifiedExplorerMain`'s source.
- Monaco-internal keystroke cost is sub-ms in this dev build; if lag persists on
  the user's machine after R1–R3, the remaining suspects are GPU compositing of
  large scrolls (under-reported headless) and per-frame render cost, which is
  not publicly sampleable in monaco 0.55 (`onDidRenderEditor` not in the API).
- The harness files in `packages/request-editor/` (`perf.html`, `dev/perf-*.tsx`,
  `dev/perf-instrumentation.ts` + the `Profiler`/`__reactStats` extension added
  by this task) are **temporary**; keep them while t_c20ec889 runs A/B
  verification, delete afterwards.
- This branch's harness response document is ~1.8K lines vs the baseline's
  2,108 lines / 119,689 chars; all structural findings and the measured
  per-keystroke numbers reproduce within noise.