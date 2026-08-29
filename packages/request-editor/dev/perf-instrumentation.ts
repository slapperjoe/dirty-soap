/**
 * perf-instrumentation.ts — TEMPORARY profiling harness (task t_12cc8444)
 *
 * Auto-instruments the monaco-editor module namespace at import time
 * (imported first by dev/perf-app.tsx, before any editor component runs):
 *  - monaco.editor.create() synchronous cost (editor init)
 *  - monaco.languages.registerCompletionItemProvider (registration leak
 *    + per-query provideCompletionItems cost)
 *  - per-editor: wraps onDidChangeModelContent / onDidChangeCursorSelection
 *    / onDidScrollChange so component callback cost is measured per fire,
 *    and counts subscribe/unsubscribe churn (inline-onChange re-subscription)
 *  - per-editor: own onDidRenderEditor + onDidScrollChange subscriptions
 *    (render-fire / scroll-fire timestamps)
 *  - wraps setValue / executeEdits / setDecorations / deltaDecorations
 *  - long tasks (PerformanceObserver), rAF frame drops (>34ms), and
 *    console warnings about monaco falling back to main-thread workers
 *
 * All events carry t = ms relative to instrumentation start. Phases
 * (beginPhase/endPhase) let the report slice stats per workflow.
 */
import * as monaco from "monaco-editor";
import type * as MonacoNS from "monaco-editor";

export interface PerfEvent {
  t: number; // ms relative to t0
  type: string;
  dur?: number; // ms
  name?: string;
  detail?: any;
}

let t0 = performance.now();
const events: PerfEvent[] = [];
const counters: Record<string, number> = {};
const registry: Array<{ id: number; editor: any; label: string }> = [];
const phases: Array<{ label: string; from: number; to: number; tStart: number; tEnd: number }> = [];
const MAX_EVENTS = 250_000;

export function now() { return performance.now(); }
export function rel() { return performance.now() - t0; }

export function push(e: PerfEvent) {
  if (events.length < MAX_EVENTS) events.push(e);
  else counters["events-dropped"] = (counters["events-dropped"] || 0) + 1;
}

export function mark(type: string, extra?: Partial<PerfEvent>) {
  push({ t: rel(), type, ...extra });
}

export function bump(name: string, by = 1) {
  counters[name] = (counters[name] || 0) + by;
}

export function getEvents() { return events; }
export function getCounters() { return { ...counters }; }
export function getRegistry() { return registry.slice(); }

export function beginPhase(label: string) {
  mark("phase-start", { name: label });
  phases.push({ label, from: events.length, to: -1, tStart: rel(), tEnd: -1 });
}
export function endPhase(label: string) {
  const p = phases.find((x) => x.label === label && x.to === -1);
  if (p) {
    p.to = events.length;
    p.tEnd = rel();
  }
  mark("phase-end", { name: label, dur: rel() - (p ? p.tStart : 0) });
}
export function getPhases() { return phases.slice(); }

/** rAF gap sampler — records frame gaps > 34ms (frame drops at 60Hz). */
let rafRunning = false;
export function setSampling(on: boolean) {
  if (on && !rafRunning) {
    rafRunning = true;
    let last = performance.now();
    const loop = (nowTs: number) => {
      const gap = nowTs - last;
      last = nowTs;
      if (gap > 34) {
        bump("frame-drop");
        push({ t: nowTs - t0, type: "frame-drop", dur: gap });
      }
      if (rafRunning) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  } else if (!on) {
    rafRunning = false;
  }
}

export function startLongTaskObserver() {
  try {
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        bump("longtask");
        push({ t: e.startTime - t0, type: "longtask", dur: e.duration, detail: { name: e.name } });
      }
    });
    po.observe({ entryTypes: ["longtask"] });
  } catch (e) {
    console.warn("[perf] longtask observer unavailable", e);
  }
}

/** Capture console warnings about Monaco falling back to main-thread workers. */
export function startConsoleCapture() {
  const origWarn = console.warn.bind(console);
  console.warn = (...a: any[]) => {
    const s = a.map((x) => (x instanceof Error ? x.message : String(x))).join(" ");
    if (/worker/i.test(s)) {
      bump("worker-fallback");
      push({ t: rel(), type: "console-warn", detail: s.slice(0, 300) });
    }
    origWarn(...a);
  };
}

function wrapListenerMethod(editor: any, method: string, type: string) {
  const orig = editor[method];
  if (typeof orig !== "function") return;
  editor[method] = (cb: any) => {
    const wrapped = (...args: any[]) => {
      const s = performance.now();
      const r = cb(...args);
      const d = performance.now() - s;
      push({ t: s - t0, type, dur: d });
      if (d > 4) push({ t: s - t0, type: type + ":slow", dur: d });
      return r;
    };
    const disposable: any = orig.call(editor, wrapped);
    bump(`sub:${method}`);
    if (disposable && typeof disposable.dispose === "function") {
      const origDispose = disposable.dispose.bind(disposable);
      disposable.dispose = () => {
        bump(`unsub:${method}`);
        origDispose();
      };
    }
    return disposable;
  };
}

function instrumentEditor(editor: any, id: number) {
  // Component callback cost (subscribed via wrapped methods).
  wrapListenerMethod(editor, "onDidChangeModelContent", "content-change");
  wrapListenerMethod(editor, "onDidChangeCursorSelection", "cursor-selection");
  wrapListenerMethod(editor, "onDidScrollChange", "scroll-change");

  // Own fire-time subscriptions (independent of component subscriptions).
  // onDidRenderEditor is NOT part of the public IStandaloneCodeEditor API in
  // monaco 0.55 — fall back to onDidLayoutChange as the render proxy.
  if (typeof editor.onDidRenderEditor === "function") {
    editor.onDidRenderEditor(() => push({ t: rel(), type: "render-fire" }));
  } else if (typeof editor.onDidLayoutChange === "function") {
    editor.onDidLayoutChange(() => push({ t: rel(), type: "render-fire" }));
  }
  if (typeof editor.onDidScrollChange === "function") {
    editor.onDidScrollChange((c: any) =>
      push({ t: rel(), type: "scroll-fire", detail: { top: c && c.scrollTop } }),
    );
  }

  const origExec = editor.executeEdits;
  editor.executeEdits = (source: string, ...rest: any[]) => {
    const s = performance.now();
    const r = origExec.apply(editor, [source, ...rest]);
    push({ t: s - t0, type: "executeEdits", dur: performance.now() - s });
    return r;
  };
  const origSetValue = editor.setValue;
  editor.setValue = (v: string) => {
    const s = performance.now();
    const r = origSetValue.call(editor, v);
    push({ t: s - t0, type: "setValue", dur: performance.now() - s, detail: { len: v ? v.length : 0 } });
    return r;
  };
  // Decoration churn — wildcard decorations recompute on every keystroke.
  const origSetDeco = editor.setDecorations;
  if (typeof origSetDeco === "function") {
    editor.setDecorations = (owner: string, decos: any) => {
      const s = performance.now();
      const r = origSetDeco.call(editor, owner, decos);
      push({ t: s - t0, type: "setDecorations", dur: performance.now() - s, detail: { n: decos && decos.length } });
      return r;
    };
  }
  const origDeltaDeco = editor.deltaDecorations;
  if (typeof origDeltaDeco === "function") {
    editor.deltaDecorations = (old: any, next: any) => {
      const s = performance.now();
      const r = origDeltaDeco.call(editor, old, next);
      push({ t: s - t0, type: "deltaDecorations", dur: performance.now() - s, detail: { old: old && old.length, next: next && next.length } });
      return r;
    };
  }
  // updateOptions churn — per-render options-object identity forces this on
  // every editor while any editor receives a keystroke (RC2 finding).
  const origUpdateOptions = editor.updateOptions;
  if (typeof origUpdateOptions === "function") {
    editor.updateOptions = (opts: any) => {
      const s = performance.now();
      const r = origUpdateOptions.call(editor, opts);
      const d = performance.now() - s;
      bump("updateOptions");
      push({ t: s - t0, type: "updateOptions", dur: d });
      if (d > 4) push({ t: s - t0, type: "updateOptions:slow", dur: d });
      return r;
    };
  }

  registry.push({ id, editor, label: `editor-${id}` });
}

let started = false;
export function startInstrumentation() {
  if (started) return;
  started = true;
  t0 = performance.now();
  mark("instrumentation-start");

  // --- monaco.editor.create wrap (init cost + per-editor instrumentation) ---
  const origCreate = monaco.editor.create;
  let createCount = 0;
  monaco.editor.create = ((...args: any[]) => {
    const s = performance.now();
    const editor = (origCreate as any).apply(monaco.editor, args);
    const d = performance.now() - s;
    createCount += 1;
    const opts = args[1] || {};
    const model = (args[0] && args[0].model) || null;
    push({
      t: s - t0,
      type: "editor-create",
      dur: d,
      name: `editor-${createCount}`,
      detail: {
        language: (model && model.getLanguageId && model.getLanguageId()) || opts.language || "?",
        valueLen: model && model.getValueLength ? model.getValueLength() : typeof opts.value === "string" ? opts.value.length : 0,
        model: !!model,
      },
    });
    instrumentEditor(editor, createCount);
    return editor;
  }) as any;
  if ((monaco.editor as any).create === origCreate) {
    // Non-writable namespace binding — patching failed. Surface it loudly.
    console.error("[perf] FAILED to patch monaco.editor.create (namespace read-only)");
  }

  // --- completion provider registration wrap (leak + per-query cost) ---
  const origReg = monaco.languages.registerCompletionItemProvider;
  monaco.languages.registerCompletionItemProvider = (selector: any, provider: any) => {
    const lang = Array.isArray(selector)
      ? selector.map((s: any) => s.language).join(",")
      : typeof selector === "string"
        ? selector
        : (selector && selector.language) || "*";
    const wrapped: any = { ...provider };
    if (typeof provider.provideCompletionItems === "function") {
      const origP = provider.provideCompletionItems.bind(provider);
      wrapped.provideCompletionItems = async (...args: any[]) => {
        const s = performance.now();
        let r: any;
        try {
          r = await origP(...args);
        } catch (e) {
          r = { suggestions: [] };
        }
        const d = performance.now() - s;
        bump("completion-provide");
        push({
          t: s - t0,
          type: "completion-provide",
          dur: d,
          name: lang,
          detail: { language: lang, suggestions: Array.isArray(r && r.suggestions) ? r.suggestions.length : 0 },
        });
        return r;
      };
    }
    const disp = origReg.call(monaco.languages, selector, wrapped);
    bump(`completion-register:${lang}`);
    push({ t: rel(), type: "completion-register", name: lang });
    return disp;
  };
  if ((monaco.languages as any).registerCompletionItemProvider === origReg) {
    console.error("[perf] FAILED to patch registerCompletionItemProvider (namespace read-only)");
  }

  startLongTaskObserver();
  startConsoleCapture();
  setSampling(true);
}

startInstrumentation();

// ---------- report ----------
function pct(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

function summarizeMonacoResources() {
  const rs = performance.getEntriesByType("resource").filter((r) => r.name.toLowerCase().includes("monaco"));
  const total = rs.reduce((a, r) => a + (r.transferSize || 0), 0);
  const sumLoadMs = rs.reduce((a, r) => a + (r.responseEnd - r.startTime), 0);
  return {
    chunkCount: rs.length,
    transferBytes: total,
    sumLoadMs: Math.round(sumLoadMs),
    sample: rs.slice(0, 8).map((r) => ({ name: (r.name.split("/").pop() || r.name.slice(-40)), ms: Math.round(r.duration) })),
  };
}

function statsOf(arr: number[]) {
  const s = arr.slice().sort((x, y) => x - y);
  return {
    n: arr.length,
    min: s[0] ?? 0,
    p50: pct(s, 50),
    p90: pct(s, 90),
    p99: pct(s, 99),
    max: s[s.length - 1] ?? 0,
    totalMs: Math.round(arr.reduce((a, b) => a + b, 0)),
  };
}

function statsIn(type: string, from = 0, to = events.length) {
  const arr: number[] = [];
  for (let i = from; i < to; i++) {
    const e = events[i];
    if (e.type === type && typeof e.dur === "number") arr.push(e.dur);
  }
  return statsOf(arr);
}

function countsIn(prefix: string, from = 0, to = events.length) {
  const out: Record<string, number> = {};
  for (let i = from; i < to; i++) {
    const t = events[i].type;
    if (t.startsWith(prefix)) out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/** Join synthetic key events with the first subsequent content-change / render-fire. */
function computeTypingLatency(from = 0, to = events.length) {
  const keys: number[] = [];
  const contentT: number[] = [];
  const renderT: number[] = [];
  for (let i = from; i < to; i++) {
    const e = events[i];
    if (e.type === "key") keys.push(e.t);
    else if (e.type === "content-change") contentT.push(e.t);
    else if (e.type === "render-fire") renderT.push(e.t);
  }
  const keyContent: number[] = [];
  const keyRender: number[] = [];
  let ci = 0;
  let ri = 0;
  for (const k of keys) {
    while (ci < contentT.length && contentT[ci] < k) ci += 1;
    if (ci < contentT.length && contentT[ci] - k < 500) {
      keyContent.push(contentT[ci] - k);
      while (ri < renderT.length && renderT[ri] < contentT[ci]) ri += 1;
      if (ri < renderT.length && renderT[ri] - k < 500) keyRender.push(renderT[ri] - k);
    }
  }
  return { content: statsOf(keyContent), render: statsOf(keyRender) };
}

export function getReport() {
  const firstCreate = events.find((e) => e.type === "editor-create");
  const firstRenderFire = events.find((e) => e.type === "render-fire");
  const report: any = {
    counters: { ...counters },
    eventsTotal: events.length,
    editors: registry.map((r) => ({ id: r.id, label: r.label })),
    monacoResources: summarizeMonacoResources(),
    init: {
      firstCreateAtMs: firstCreate ? Math.round(firstCreate.t) : null,
      firstCreateMs: firstCreate ? firstCreate.dur : null,
      timeToFirstRenderMs:
        firstCreate && firstRenderFire ? Math.round(firstRenderFire.t - firstCreate.t) : null,
    },
    stats: {
      "editor-create": statsIn("editor-create"),
      "content-change": statsIn("content-change"),
      "content-change:slow": statsIn("content-change:slow"),
      "render-fire": { n: events.filter((e) => e.type === "render-fire").length },
      "scroll-fire": { n: events.filter((e) => e.type === "scroll-fire").length },
      "scroll-change": statsIn("scroll-change"),
      "cursor-selection": statsIn("cursor-selection"),
      setValue: statsIn("setValue"),
      executeEdits: statsIn("executeEdits"),
      setDecorations: statsIn("setDecorations"),
      deltaDecorations: statsIn("deltaDecorations"),
      "completion-provide": statsIn("completion-provide"),
      longtask: statsIn("longtask"),
      "frame-drop": statsIn("frame-drop"),
    },
    typing: computeTypingLatency(),
    phases: phases.map((p) => ({
      label: p.label,
      durationMs: Math.round(p.tEnd - p.tStart),
      stats: {
        "content-change": statsIn("content-change", p.from, p.to),
        "render-fire": { n: events.slice(p.from, p.to).filter((e) => e.type === "render-fire").length },
        "scroll-change": statsIn("scroll-change", p.from, p.to),
        "scroll-fire": { n: events.slice(p.from, p.to).filter((e) => e.type === "scroll-fire").length },
        "setDecorations": statsIn("setDecorations", p.from, p.to),
        "deltaDecorations": statsIn("deltaDecorations", p.from, p.to),
        "completion-provide": statsIn("completion-provide", p.from, p.to),
        longtask: statsIn("longtask", p.from, p.to),
        "frame-drop": statsIn("frame-drop", p.from, p.to),
        setValue: statsIn("setValue", p.from, p.to),
        executeEdits: statsIn("executeEdits", p.from, p.to),
      },
      eventCounts: countsIn("", p.from, p.to),
      typing: computeTypingLatency(p.from, p.to),
    })),
    editorCreates: events
      .filter((e) => e.type === "editor-create")
      .map((e) => ({ t: Math.round(e.t), ms: e.dur, ...((e.detail as any) || {}) })),
  };
  return report;
}

// ---------- window API for driving from DevTools / browser tool ----------
const w = window as any;
w.__monaco = monaco; // real monaco namespace (window.monaco is not set in ESM builds)
w.__perf = {
  report: () => {
    const r = getReport();
    console.log("[perf-report]", r);
    return r;
  },
  dump: () => JSON.stringify(getReport()),
  beginPhase,
  endPhase,
  markKey: () => mark("key"),
  setSampling,
  getEvents,
  getCounters,
  getPhases,
  getEditors: () => registry.map((r) => ({ id: r.id, label: r.label, editor: r.editor })),
};
console.log("[perf] instrumentation active; window.__perf ready");