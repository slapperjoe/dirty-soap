import React, {
  useRef,
  useImperativeHandle,
  forwardRef,
  useEffect,
} from "react";
import { MonacoEditorWrapper, Monaco } from "../monaco";
import styled from "styled-components";
import { debugWarn } from "../utils/logger";
import { useWildcardDecorations } from "../hooks/useWildcardDecorations";

const InputContainer = styled.div`
  height: 26px; /* Matches standard VS Code input height approx */
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--apinox-input-border);
  background-color: var(--apinox-input-background);
  color: var(--apinox-input-foreground);
  display: flex;
  align-items: center;
  position: relative;

  &:focus-within {
    border-color: var(--apinox-focusBorder);
  }
`;

interface MonacoSingleLineInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string; // Monaco doesn't support placeholder natively easily, but we can fake it or ignore
  readOnly?: boolean;
  onEnter?: () => void; // Support for hitting Enter
  onFocus?: () => void;
}

export interface MonacoSingleLineInputHandle {
  insertText: (text: string) => void;
}

export const MonacoSingleLineInputBase = forwardRef<
  MonacoSingleLineInputHandle,
  MonacoSingleLineInputProps
>(({ value, onChange, readOnly = false, onEnter, onFocus }, ref) => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);

  useImperativeHandle(ref, () => ({
    insertText: (text: string) => {
      if (editorRef.current && monacoRef.current) {
        const editor = editorRef.current;
        const selection = editor.getSelection();
        const op = {
          range: selection,
          text: text,
          forceMoveMarkers: true,
        };
        editor.executeEdits("my-source", [op]);
        editor.focus();
      }
    },
  }));

  // Apply Wildcard Decorations
  useWildcardDecorations(editorRef.current, monacoRef.current, value);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addCommand(monaco.KeyCode.Enter, () => {
      if (onEnter) onEnter();
    });

    // --- Clipboard Fixes ---

    // Paste Action (Shared logic)
    const doPaste = async (ed: any) => {
      try {
        // Use native clipboard API
        const text = await navigator.clipboard.readText();
        if (text) {
          const clean = text.replace(/[\r\n]+/g, ""); // Enforce single line
          const selection = ed.getSelection();
          ed.executeEdits("clipboard", [
            { range: selection, text: clean, forceMoveMarkers: true },
          ]);
        }
      } catch (e) {
        // Clipboard access denied - log warning
        debugWarn("[MonacoSingleLineInput] Clipboard access denied");
      }
    };

    // Paste (Ctrl+V)
    editor.addAction({
      id: "custom-paste",
      label: "Paste",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
      run: doPaste,
    });

    // Paste (Context Menu Override - this ID is standard in Monaco)
    // Overriding this ID makes the Context Menu "Paste" item use our logic!
    editor.addAction({
      id: "editor.action.clipboardPasteAction",
      label: "Paste",
      precondition: "!readonly",
      run: doPaste,
    });

    // Copy (Ctrl+C)
    const doCopy = (ed: any) => {
      const selection = ed.getSelection();
      const text = ed.getModel()?.getValueInRange(selection);
      if (text) {
        navigator.clipboard.writeText(text).catch((e) => {
          debugWarn(
            "[MonacoSingleLineInput] Clipboard write failed:",
            e.message,
          );
        });
      }
    };

    editor.addAction({
      id: "custom-copy",
      label: "Copy",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
      run: doCopy,
    });

    // Override Context Menu Copy
    editor.addAction({
      id: "editor.action.clipboardCopyAction",
      label: "Copy",
      run: doCopy,
    });

    // Cut (Ctrl+X)
    const doCut = (ed: any) => {
      const selection = ed.getSelection();
      const text = ed.getModel()?.getValueInRange(selection);
      if (text) {
        navigator.clipboard.writeText(text).catch((e) => {
          debugWarn(
            "[MonacoSingleLineInput] Clipboard write failed:",
            e.message,
          );
        });
        ed.executeEdits("clipboard", [
          { range: selection, text: "", forceMoveMarkers: true },
        ]);
      }
    };

    editor.addAction({
      id: "custom-cut",
      label: "Cut",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
      run: doCut,
    });

    // Override Context Menu Cut
    editor.addAction({
      id: "editor.action.clipboardCutAction",
      label: "Cut",
      precondition: "!readonly",
      run: doCut,
    });

    // --- End Clipboard Fixes ---

    editor.onDidFocusEditorText(() => {
      if (onFocus) onFocus();
    });
  };

  // Force single line behavior on change (prevent newlines)
  const handleChange = (val: string | undefined) => {
    const v = val || "";
    if (v.includes("\n")) {
      const clean = v.replace(/[\r\n]+/g, "");
      onChange(clean);
    } else {
      onChange(v);
    }
  };

  // Listen for Clipboard Data from Backend (Fallback for Paste)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === "clipboardText" && message.text) {
        if (editorRef.current) {
          const ed = editorRef.current;
          // Check if this editor currently has focus, otherwise we might paste to the wrong input if multiple exist
          // But typically we only have one focused. Monaco doesn't have a reliable "hasFocus" boolean prop sync'd here easily without state.
          // We'll rely on the fact that if the user invoked Paste, they likely focused it.
          // Actually, if multiple editors listen to 'clipboardText', ALL will paste. That's bad.
          // Ideally we check if this editor is focused.
          if (ed.hasTextFocus()) {
            const clean = message.text.replace(/[\r\n]+/g, "");
            const selection = ed.getSelection();
            ed.executeEdits("clipboard", [
              { range: selection, text: clean, forceMoveMarkers: true },
            ]);
          }
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <InputContainer>
      <style>
        {`
                .wildcard-tag-decoration {
                    background-color: rgba(255, 105, 180, 0.2);
                    border: 1px solid var(--apinox-editorBracketHighlight-foreground4);
                    border-radius: 12px;
                    margin-left: 2px;
                    margin-right: 2px;
                }
                .wildcard-tag-text {
                    font-weight: bold;
                    color: var(--apinox-editorBracketHighlight-foreground2, #da70d6) !important;
                    font-style: italic;
                }
                /* Hide cursor when not focused? No, input needs cursor. */
                `}
      </style>
      <MonacoEditorWrapper
        height="26px" // Explicit height to match container
        language="text"
        value={value}
        onChange={handleChange}
        theme="vs-dark"
        onMount={handleEditorDidMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: "off",
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 0,
          renderLineHighlight: "none",
          scrollbar: { horizontal: "hidden", vertical: "hidden" },
          hideCursorInOverviewRuler: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          contextmenu: true,
          fontFamily: "var(--apinox-font-family)",
          fontSize: 13,
          readOnly: readOnly,
          wordWrap: "off",
          matchBrackets: "never",
          links: false,
          padding: { top: 4 },
          // "Single Line" feel
        }}
      />
    </InputContainer>
  );
});

// R3 (MONACO_LAG_ROOT_CAUSE.md): memoize — these inputs are mounted next to
// the request editor and previously re-rendered on every keystroke even when
// their own value was unchanged.
export const MonacoSingleLineInput = React.memo(MonacoSingleLineInputBase);
