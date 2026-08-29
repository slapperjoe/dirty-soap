import { useRef, useEffect } from "react";
import type { MonacoType } from "../monaco";
import { debugLog, debugError, debugWarn } from "../utils/logger";

export const useWildcardDecorations = (
  editor: any,
  monaco: MonacoType | null,
  value: string,
  availableChainVariables?: Array<{
    name: string;
    value: string | null;
    source: string;
  }>,
  availableEnvVariables?: Array<{ name: string; value: string | null }>,
) => {
  const decorationsRef = useRef<string[]>([]);

  const updateDecorations = () => {
    // console.log('updateDecorations called', { editor: !!editor, monaco: !!monaco, valueLength: value ? value.length : 0 });
    if (!editor || !monaco) return;

    try {
      const model = editor.getModel();
      if (!model || model.isDisposed()) return;

      const text = model.getValue();
      debugLog("useWildcardDecorations: text length", text.length);

      const matches: any[] = [];

      // Match {{...}} - Environment/Global variables and functions ONLY
      // Workflow variables use ${...} syntax exclusively
      const envRegex = /\{\{[^}]+\}\}/g;
      let envMatch;

      while ((envMatch = envRegex.exec(text)) !== null) {
        if (!envMatch || typeof envMatch[0] !== "string") {
          debugError("useWildcardDecorations: Invalid env match", envMatch);
          continue;
        }

        const startPos = model.getPositionAt(envMatch.index);
        const endPos = model.getPositionAt(envMatch.index + envMatch[0].length);

        const content = envMatch[0];
        const isEnv = content === "{{env}}" || content === "{{url}}";

        // Check if variable exists (env/global variables and functions only)
        const varName = content.substring(2, content.length - 2); // Remove {{ }}
        const envVar = availableEnvVariables?.find((v) => v.name === varName);
        const isDefined = envVar || isKnownFunction(varName);

        // Build hover message with more context
        let hoverMsg = "";
        let className = "wildcard-tag-decoration";
        let inlineClassName = "wildcard-tag-text";

        if (isEnv) {
          hoverMsg =
            "**Environment Variable**\n\nResolves to the active environment's endpoint URL";
          className = "environment-tag-decoration";
          inlineClassName = "environment-tag-text";
        } else if (envVar) {
          hoverMsg = `**Custom Variable**\n\nName: \`${varName}\`\n`;
          if (envVar.value) {
            hoverMsg += `Value: \`${envVar.value}\`\n`;
          } else {
            hoverMsg += `Value: _(not set)_\n`;
          }
          hoverMsg += "\nDefined in Settings → Environments";
        } else if (isKnownFunction(varName)) {
          hoverMsg = getFunctionDescription(varName);
        } else {
          hoverMsg =
            "**⚠️ Unknown Variable**\n\nThis variable is not defined in:\n";
          hoverMsg += "- Environment variables (Settings → Environments)\n";
          hoverMsg += "- Global variables\n";
          hoverMsg += "- Built-in functions\n\n";
          hoverMsg +=
            "💡 **Note:** Workflow variables use `${varName}` syntax, not `{{varName}}`";
        }

        matches.push({
          range: new monaco.Range(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column,
          ),
          options: {
            isWholeLine: false,
            className: className,
            inlineClassName: inlineClassName,
            hoverMessage: {
              value: hoverMsg,
              isTrusted: true,
              supportHtml: true,
            },
          },
        });

        // Add warning underline for undefined variables
        if (!isDefined && !isKnownFunction(varName)) {
          matches.push({
            range: new monaco.Range(
              startPos.lineNumber,
              startPos.column,
              endPos.lineNumber,
              endPos.column,
            ),
            options: {
              isWholeLine: false,
              inlineClassName: "undefined-variable-warning",
            },
          });
        }
      }

      // Match ${...} - Chain variables (extracted from previous steps)
      const chainRegex = /\$\{[^}]+\}/g;
      let chainMatch;

      while ((chainMatch = chainRegex.exec(text)) !== null) {
        if (!chainMatch || typeof chainMatch[0] !== "string") {
          debugError("useWildcardDecorations: Invalid chain match", chainMatch);
          continue;
        }

        const startPos = model.getPositionAt(chainMatch.index);
        const endPos = model.getPositionAt(
          chainMatch.index + chainMatch[0].length,
        );

        const content = chainMatch[0];
        const varName = content.substring(2, content.length - 1); // Remove ${ }

        // Check if chain variable exists
        const isDefined = availableChainVariables?.some(
          (v) => v.name === varName,
        );
        const variable = availableChainVariables?.find(
          (v) => v.name === varName,
        );

        // Build enhanced hover message
        let hoverMsg =
          "**Workflow Variable** (Extracted from previous step)\n\n";
        if (isDefined && variable) {
          hoverMsg += `**Name:** \`${varName}\`\n`;
          hoverMsg += `**Source:** ${variable.source}\n`;

          if (variable.value) {
            // Truncate long values
            const displayValue =
              variable.value.length > 100
                ? variable.value.substring(0, 100) + "..."
                : variable.value;
            hoverMsg += `**Current Value:** \`${displayValue}\`\n`;
          } else {
            hoverMsg += `**Status:** ⏳ _Pending extraction (run test to extract)_\n`;
          }

          hoverMsg +=
            "\n💡 This variable is extracted during test execution and injected into subsequent requests.";
        } else {
          hoverMsg = `**⚠️ Undefined Workflow Variable**\n\nVariable \`${varName}\` is not extracted in any prior step.\n\n`;
          hoverMsg += "To fix:\n";
          hoverMsg += "1. Add an **Extractor** in a previous step\n";
          hoverMsg += "2. Use an XPath expression to extract the value\n";
          hoverMsg += "3. Assign it to this variable name";
        }

        matches.push({
          range: new monaco.Range(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column,
          ),
          options: {
            isWholeLine: false,
            className: "chain-variable-decoration",
            inlineClassName: "chain-variable-text",
            hoverMessage: {
              value: hoverMsg,
              isTrusted: true,
              supportHtml: true,
            },
          },
        });

        // Add warning underline for undefined chain variables
        if (!isDefined) {
          matches.push({
            range: new monaco.Range(
              startPos.lineNumber,
              startPos.column,
              endPos.lineNumber,
              endPos.column,
            ),
            options: {
              isWholeLine: false,
              inlineClassName: "undefined-variable-warning",
            },
          });
        }
      }

      // Verify editor is still alive before applying
      if (editor.getModel() === model) {
        decorationsRef.current = editor.deltaDecorations(
          decorationsRef.current,
          matches,
        );
      }
    } catch (e) {
      debugWarn("Wildcard decoration update failed", e);
    }
  };

  useEffect(() => {
    // Debounce: fast typing re-triggers this effect per keystroke; running
    // the regex pass + deltaDecorations synchronously on every key is wasted
    // work. 150 ms keeps decorations visually in lockstep with typing
    // (R3-lite in MONACO_LAG_ROOT_CAUSE.md).
    const timer = setTimeout(() => {
      updateDecorations();
    }, 150);
    return () => clearTimeout(timer);
  }, [value, editor, monaco, availableChainVariables, availableEnvVariables]);

  return { updateDecorations };
};

// Known function names that don't need to be defined
function isKnownFunction(name: string): boolean {
  const knownFunctions = [
    "uuid",
    "newguid",
    "now",
    "epoch",
    "lorem",
    "name",
    "country",
    "state",
    "env",
    "url",
    "randomInt",
  ];

  // Check if it's a known function
  if (knownFunctions.includes(name)) return true;

  // Check if it's date math like now+1d, now-2m
  if (/^now[+-]\d+[dmy]$/.test(name)) return true;

  // Check if it's lorem with count like lorem(5)
  if (/^lorem\(\d+\)$/.test(name)) return true;

  // Check if it's randomInt with range like randomInt(1,100)
  if (/^randomInt\(\d+,\d+\)$/.test(name)) return true;

  return false;
}

// Get detailed function description for hover tooltip
function getFunctionDescription(name: string): string {
  const descriptions: Record<string, string> = {
    uuid: "**Dynamic Function: UUID Generator**\n\nGenerates a random UUID v4 identifier.\n\nExample: `{{uuid}}`\n\nOutput: `550e8400-e29b-41d4-a716-446655440000`",
    newguid:
      "**Dynamic Function: GUID Generator**\n\nAlias for uuid - generates a random UUID v4.\n\nExample: `{{newguid}}`\n\nOutput: `550e8400-e29b-41d4-a716-446655440000`",
    now: "**Dynamic Function: Current Timestamp**\n\nReturns the current date/time in ISO 8601 format.\n\nExample: `{{now}}`\n\nOutput: `2026-02-06T07:30:00.000Z`",
    epoch:
      "**Dynamic Function: Unix Timestamp**\n\nReturns the current Unix timestamp in seconds.\n\nExample: `{{epoch}}`\n\nOutput: `1738825800`",
    lorem:
      "**Dynamic Function: Lorem Ipsum**\n\nGenerates lorem ipsum placeholder text.\n\nExample: `{{lorem(5)}}`\n\nOutput: 5 words of Lorem Ipsum text",
    name: "**Dynamic Function: Random Name**\n\nGenerates a random full name.\n\nExample: `{{name}}`\n\nOutput: `John Smith`",
    country:
      "**Dynamic Function: Random Country**\n\nGenerates a random country name.\n\nExample: `{{country}}`\n\nOutput: `United States`",
    state:
      "**Dynamic Function: Random State**\n\nGenerates a random US state name.\n\nExample: `{{state}}`\n\nOutput: `California`",
    randomInt:
      "**Dynamic Function: Random Integer**\n\nGenerate a random integer between min and max (inclusive).\n\nExample: `{{randomInt(1,100)}}`\n\nOutput: `42`",
    env: "**Environment Shortcut**\n\nResolves to the active environment's endpoint URL.\n\nEquivalent to `{{url}}`",
    url: "**Environment Shortcut**\n\nResolves to the active environment's endpoint URL.\n\nSet in Settings → Environments → endpoint_url",
  };

  // Check for special patterns
  if (/^now[+-]\d+[dmy]$/.test(name)) {
    const match = name.match(/^now([+-])(\d+)([dmy])$/);
    if (match) {
      const op = match[1] === "+" ? "Add" : "Subtract";
      const unit =
        match[3] === "d" ? "days" : match[3] === "m" ? "months" : "years";
      return `**Dynamic Function: Date Math**\n\n${op} ${match[2]} ${unit} to current date.\n\nExample: \`{{${name}}}\`\n\nSupports: d (days), m (months), y (years)`;
    }
  }

  if (/^lorem\(\d+\)$/.test(name)) {
    const match = name.match(/^lorem\((\d+)\)$/);
    if (match) {
      return `**Dynamic Function: Lorem Ipsum**\n\nGenerates ${match[1]} words of Lorem Ipsum text.\n\nExample: \`{{lorem(${match[1]})}}\``;
    }
  }

  if (/^randomInt\(\d+,\d+\)$/.test(name)) {
    const match = name.match(/^randomInt\((\d+),(\d+)\)$/);
    if (match) {
      return `**Dynamic Function: Random Integer**\n\nGenerates a random integer between ${match[1]} and ${match[2]} (inclusive).\n\nExample: \`{{randomInt(${match[1]},${match[2]})}}\``;
    }
  }

  return (
    descriptions[name] ||
    "**Dynamic Wildcard Function**\n\nThis is a recognized dynamic function."
  );
}
