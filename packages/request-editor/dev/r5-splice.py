#!/usr/bin/env python3
"""One-off R5 splice for MonacoRequestEditor.tsx (task t_c20ec889).

Moves the two per-mount completion-provider registrations out of
handleEditorDidMount into a module-level once-per-language registry
(ensureVariableCompletionProviders) and replaces the in-function block
with a single call. Exact-string surgery, no regexes.
"""
import sys

PATH = "src/components/MonacoRequestEditor.tsx"

src = open(PATH, encoding="utf-8").read()

START = "      // --- Variable Autocomplete ---"
END = "      // Copy (Ctrl+C)"
si = src.index(START)
ei = src.index(END)
assert src.find(START, si + 1) == -1, "start marker not unique"
assert src.find(END, ei + 1) == -1, "end marker not unique"
assert si < ei, "markers out of order"

MODULE_CODE = '''// R5 (MONACO_LAG_ROOT_CAUSE.md): completion providers are a shared,
// per-language monaco resource. Previously each mounted request editor
// registered its own pair of providers (2 per mount, cumulative across
// tabs and theme-flip remounts), so every suggest query ran 2N providers
// for N editors, and typing `{{` in one editor could fire another
// editor's stale provider. Providers are now registered ONCE per language
// and read each editor's current variables live, keyed by that editor's
// model URI (published in MonacoRequestEditor's onMount).
const variableCompletionRegistered = new Set<string>();
const editorVariablesByModel = new Map<
  string,
  () => Array<{ name: string; value: string | null; source: string }>
>();

function getEditorVariables(model: any): Array<{
  name: string;
  value: string | null;
  source: string;
}> {
  if (!model || !model.uri) return [];
  const provider = editorVariablesByModel.get(model.uri.toString());
  return provider ? provider() : [];
}

function ensureVariableCompletionProviders(monaco: Monaco, language: string): void {
  if (variableCompletionRegistered.has(language)) {
    return;
  }
  variableCompletionRegistered.add(language);

  // Defensive: test environments mock monaco-editor without `languages`.
  if (!monaco || !monaco.languages || !monaco.languages.registerCompletionItemProvider) {
    return;
  }

  // ${...} chain variables (live per-editor values via the model URI)
  monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ["$", "{"],
    provideCompletionItems: (model: any, position: any) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Check if we're typing ${...}
      const match = textUntilPosition.match(/\\$\\{([^}]*)$/);
      if (!match) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = getEditorVariables(model).map((variable) => ({
        label: variable.name,
        kind: monaco.languages.CompletionItemKind.Variable,
        detail: variable.value
          ? `= ${variable.value}`
          : "(not yet extracted)",
        documentation: `From: ${variable.source}\\nValue: ${variable.value || "pending"}`,
        insertText: variable.name,
        range: range,
      }));

      return { suggestions };
    },
  });

  // {{...}} variables (env/global/functions - static list)
  monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: ["{"],
    provideCompletionItems: (model: any, position: any) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Check if we're typing {{...}}
      const match = textUntilPosition.match(/\\{\\{([^}]*)$/);
      if (!match) {
        return { suggestions: [] };
      }

      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions: any[] = [];

      // Add function suggestions
      const functions = [
        {
          name: "uuid",
          detail: "Generate a new UUID",
          doc: "Generates a random UUID v4 identifier",
        },
        {
          name: "newguid",
          detail: "Generate a new GUID",
          doc: "Alias for uuid - generates a random UUID",
        },
        {
          name: "now",
          detail: "Current timestamp (ISO)",
          doc: "Returns the current date/time in ISO 8601 format",
        },
        {
          name: "epoch",
          detail: "Current Unix timestamp",
          doc: "Returns the current timestamp in seconds",
        },
        {
          name: "randomInt(1,100)",
          detail: "Random integer",
          doc: "Generate a random integer between min and max (inclusive)\\nExample: {{randomInt(1,100)}}",
        },
        {
          name: "lorem(5)",
          detail: "Lorem ipsum text",
          doc: "Generate lorem ipsum placeholder text\\nExample: {{lorem(10)}} generates 10 words",
        },
        {
          name: "name",
          detail: "Random name",
          doc: "Generates a random full name",
        },
        {
          name: "country",
          detail: "Random country",
          doc: "Generates a random country name",
        },
        {
          name: "state",
          detail: "Random US state",
          doc: "Generates a random US state name",
        },
        {
          name: "now+1d",
          detail: "Date math (future)",
          doc: "Add time to current date\\nExamples: {{now+1d}} (1 day), {{now+2m}} (2 months), {{now+3y}} (3 years)",
        },
        {
          name: "now-1d",
          detail: "Date math (past)",
          doc: "Subtract time from current date\\nExamples: {{now-1d}} (1 day ago), {{now-2m}} (2 months ago)",
        },
        {
          name: "env",
          detail: "Environment endpoint URL",
          doc: "Shortcut for the current environment's endpoint URL",
        },
        {
          name: "url",
          detail: "Environment endpoint URL",
          doc: "Shortcut for the current environment's endpoint URL (alias for env)",
        },
      ];

      functions.forEach((fn) => {
        suggestions.push({
          label: fn.name,
          kind: monaco.languages.CompletionItemKind.Function,
          detail: fn.detail,
          documentation: fn.doc,
          insertText: fn.name,
          range: range,
        });
      });

      // TODO: Add environment and global variables when available
      // This would require passing them as props similar to availableVariables

      return { suggestions };
    },
  });
}

'''

REPLACE_REGION = (
    "      // --- Variable Autocomplete (R5: shared, per-language providers) ---\n"
    "      // R5 (MONACO_LAG_ROOT_CAUSE.md): completion providers are now\n"
    "      // registered once per language via the module-level\n"
    "      // ensureVariableCompletionProviders(); each mounted editor just\n"
    "      // publishes its current variables under its model URI (below,\n"
    "      // in onMount) so the shared providers read them live. No per-mount\n"
    "      // registration, no cumulative provider growth, no cross-editor\n"
    "      // completion fire.\n"
    "      ensureVariableCompletionProviders(monaco, language);\n"
)

src = src[:si] + REPLACE_REGION + src[ei:]

ANCHOR = "export const MonacoRequestEditor = forwardRef<"
ai = src.index(ANCHOR)
src = src[:ai] + MODULE_CODE + src[ai:]

open(PATH, "w", encoding="utf-8").write(src)
print("R5 splice OK: provider block moved to module registry")