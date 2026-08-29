# Monaco Editor Lag — Resolution Report (t_5449a524)

Question: "The Monaco editors are feeling laggy when being used — do we have too many callbacks in them, or what could we do to make things more responsive?"

Answer: **Yes — it was both too many callbacks and where Monaco's language services ran.** Four specialist tasks investigated and fixed it; this report consolidates the results.

## What was wrong (verified, not guessed)

Measured via a Vite perf harness (`packages/request-editor/perf.html`, mounted the real
production components, driven via CDP) plus a full callback inventory:

| # | Root cause | Evidence | Fix |
|---|-----------|----------|-----|
| R1 | **No Monaco web worker configured anywhere** — all XML tokenization/validation ran on the main thread | Monaco's own "Falling back to main thread... might cause UI freezes" warnings fired at runtime (2 at init) | `src/monaco-env.ts`: `MonacoEnvironment.getWorker` via Vite `?worker` import |
| R2 | **Per-keystroke listener churn** — inline-arrow `onChange` + effect keyed on `[onChange]` tore down and re-subscribed every Monaco listener on every keystroke; 22–23 live content listeners per editor | 5 dispose/re-subscribe cycles per key, 18 content-event fires per key, 720 in 40 keys | Subscribe **once** on mount; keep latest callback in a ref (MonacoEditorWrapper, MonacoResponseViewer, MonacoRequestEditor) |
| R3 | **Completion providers registered globally per mount, never disposed** | 2N XML providers after N mounts; all run on every suggest query in every same-language editor | Cache providers per language; disposable kept |
| R4 | **Un-memoized `editorOptions` object literal recreated each render** → `updateOptions()` called on *all* mounted editors per keystroke (6 calls/key, new finding from RCA pass) | Measured via harness `updateOptions` counter | `useMemo` the options objects |
| R5 | **No React.memo anywhere in the package** — parent re-render per keystroke re-rendered the whole explorer subtree incl. both editors | React Profiler: 1 commit per keystroke, 2.1–3.5 ms | `React.memo` on the editor components |
| R6 | Per-keystroke full recomputes: `useWildcardDecorations` recompute, `GraphQLVariablesPanel` sync `JSON.parse`, `setEditingXml` state loop in `UnifiedExplorerMain` | Static + dynamic audit | Debounce/tighten + loop split |

## Measured impact (before → after, identical CDP driver)

- `onDidChangeModelContent` churn: **200 → 0** (100% eliminated)
- `updateOptions` per typing run: **240 → 120** (50%)
- Main-thread worker-fallback warnings: **2 → 0**
- No frame drops / long tasks in before or after runs
- Type-check clean; root vitest 55 pass; no regressions

## Where the detail lives

- `MONACO_PERF_BASELINE.md` — baseline measurements, hotspot ranking H1–H7 (t_12cc8444)
- `MONACO_CALLBACK_AUDIT.md` — full per-editor callback inventory, P1–P8 (t_9cf5de65)
- `MONACO_LAG_ROOT_CAUSE.md` — root-cause analysis R1–R6 + prioritized fix plan (t_6d3fc405)
- Code + verification harness on this branch: `packages/request-editor/src/monaco-env.ts`,
  `dev/run-cdp-perf.cjs`, before/after baselines in `packages/request-editor/dev/` (t_c20ec889, commit b2439c5)

## Optional follow-ups (not done, low priority)

1. Add `@shared` alias to `packages/request-editor` vitest config — 3 pre-existing test-file
   load failures (stash-verified pre-existing, not from this work) would then run.
2. Delete the temporary perf harness (`packages/request-editor/perf.html`, `dev/perf-*`) once
   it has served its purpose — it is committed here for reference/regression A/B.
3. The `updateOptions` counter still shows 120/run rather than 0: remaining calls come from
   the un-memoized options paths in the smaller editors — cheap to chase if typing on very
   large documents still feels soft.