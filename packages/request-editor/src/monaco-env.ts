// Monaco worker wiring (R1 in MONACO_LAG_ROOT_CAUSE.md).
//
// Without a MonacoEnvironment.getWorker hook, monaco cannot spawn its
// web workers and falls back to running tokenization/parsing on the main
// thread. With several editors mounted in the explorer that fallback
// starves the UI. This module registers Vite `?worker` constructors for
// every worker kind monaco uses in this app (editor, json, css, html,
// typescript) and must be imported by anything that creates a monaco
// editor. It is safe to import multiple times (idempotent).
import type { Environment } from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

// Monaco's ESM build reads `globalThis.MonacoEnvironment` (see
// `getMonacoEnvironment` in monaco-editor/esm/vs/base/browser/browser.js).
const globalScope = globalThis as { MonacoEnvironment?: Environment };

let configured = false;

export function ensureMonacoWorkers(): void {
  if (configured) {
    return;
  }
  configured = true;

  globalScope.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (label) {
        case "json":
          return new jsonWorker();
        case "css":
        case "scss":
        case "less":
          return new cssWorker();
        case "html":
        case "handlebars":
        case "razor":
          return new htmlWorker();
        case "typescript":
        case "javascript":
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };
}

// Configure on import so every monaco consumer in this package gets real
// workers without per-component wiring.
ensureMonacoWorkers();