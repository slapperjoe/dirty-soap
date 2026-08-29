/**
 * perf-driver.js — TEMPORARY (task t_c20ec889).
 *
 * Identical driver for the BEFORE and AFTER harness runs. Paste this whole
 * IIFE into the page console (or browser tool). It writes its final report to
 * window.__driverResult and sets window.__driverDone = true, so the caller can
 * poll for completion.
 *
 * Phases:
 *  - typing-40keys:      40 typed chars on the request1 editor @ 90 ms
 *  - autocomplete:       one triggerSuggest on request1, settle 1.5 s
 *  - selection-response: growing selection on the read-only response viewer
 *  - remount-churn:      (post-hoc, read-only counters only)
 */
(async () => {
  const P = window.__perf;
  if (!P) { window.__driverResult = "ERROR: window.__perf not ready"; window.__driverDone = true; return; }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const findEditor = (prefix) => {
    for (const e of P.getEditors()) {
      const m = e.editor.getModel && e.editor.getModel();
      if (m && (m.getValue() || "").startsWith(prefix)) return e.editor;
    }
    return null;
  };
  const countersBefore = P.getCounters();
  const reactBefore = (window.__reactStats && window.__reactStats()) || null;

  const req1 = findEditor("<GetUserRequest");
  const resp = findEditor("<soap:Envelope");
  if (!req1 || !resp) {
    window.__driverResult = "ERROR: editors not found req1=" + !!req1 + " resp=" + !!resp + " editors=" + P.getEditors().length;
    window.__driverDone = true;
    return;
  }

  // Let everything settle post-load.
  await sleep(500);

  // --- Phase 1: typing 40 keys on the main request editor ---
  req1.focus();
  await sleep(300);
  P.beginPhase("typing-40keys");
  const chars = "abcdefghij".repeat(4); // 40 keys
  for (const ch of chars) {
    P.markKey();
    req1.trigger("perf", "type", { text: ch });
    await sleep(90);
  }
  P.endPhase("typing-40keys");
  await sleep(300);

  // --- Phase 2: autocomplete (triggers every registered xml provider) ---
  P.beginPhase("autocomplete");
  req1.trigger("perf", "editor.action.triggerSuggest", null);
  await sleep(1500);
  P.endPhase("autocomplete");
  await sleep(300);

  // --- Phase 3: growing selection on the read-only response viewer ---
  // Reproduces drag-select over a large model: onDidChangeCursorSelection
  // fires per step; the component handler runs getValueInRange over the range.
  P.beginPhase("selection-response");
  resp.focus();
  await sleep(200);
  resp.setPosition({ lineNumber: 5, column: 3 });
  const range = window.__monaco.Range;
  for (let i = 1; i <= 40; i++) {
    P.markKey();
    resp.setSelection(new range(5, 3, Math.min(5 + i, 620), 80));
    await sleep(90);
  }
  P.endPhase("selection-response");
  await sleep(300);

  const countersAfter = P.getCounters();
  const delta = {};
  for (const k of Object.keys(countersAfter)) {
    delta[k] = countersAfter[k] - (countersBefore[k] || 0);
  }
  const report = P.report();
  window.__driverResult = {
    delta,
    countersAfter,
    reactStatsAll: window.__reactStats ? window.__reactStats() : null,
    reactStatsTyping: window.__reactStats ? window.__reactStats({ sincePerfPhase: "typing-40keys" }) : null,
    phases: report.phases,
    init: report.init,
    editorCreates: report.editorCreates,
    typing: report.typing,
    monacoResources: report.monacoResources,
    stats: report.stats,
  };
  window.__driverDone = true;
  console.log("[perf-driver] done");
})();