
import { useRef, useImperativeHandle, forwardRef, useEffect } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';
import { useWildcardDecorations } from '../hooks/useWildcardDecorations';
import { bridge } from '../utils/bridge';

loader.config({ monaco });

const InputContainer = styled.div`
  height: 26px; /* Matches standard VS Code input height approx */
  width: 100%;
  overflow: hidden;
  border: 1px solid var(--vscode-input-border);
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  display: flex;
  align-items: center;
  position: relative;
  
  &:focus-within {
      border-color: var(--vscode-focusBorder);
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

export const MonacoSingleLineInput = forwardRef<MonacoSingleLineInputHandle, MonacoSingleLineInputProps>(({
    value,
    onChange,
    readOnly = false,
    onEnter,
    onFocus
}, ref) => {
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
                    forceMoveMarkers: true
                };
                editor.executeEdits("my-source", [op]);
                editor.focus();
            }
        }
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
                // Try Native Web API first
                const text = await navigator.clipboard.readText();
                if (text) {
                    const clean = text.replace(/[\r\n]+/g, ''); // Enforce single line
                    const selection = ed.getSelection();
                    ed.executeEdits('clipboard', [{ range: selection, text: clean, forceMoveMarkers: true }]);
                }
            } catch (e) {
                // Fallback to Backend
                bridge.sendMessage({ command: 'clipboardAction', action: 'read' });
            }
        };

        // Paste (Ctrl+V)
        editor.addAction({
            id: 'custom-paste',
            label: 'Paste',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV],
            run: doPaste
        });

        // Paste (Context Menu Override - this ID is standard in Monaco)
        // Overriding this ID makes the Context Menu "Paste" item use our logic!
        editor.addAction({
            id: 'editor.action.clipboardPasteAction',
            label: 'Paste',
            precondition: '!readonly',
            run: doPaste
        });


        // Copy (Ctrl+C)
        const doCopy = (ed: any) => {
            const selection = ed.getSelection();
            const text = ed.getModel()?.getValueInRange(selection);
            if (text) {
                navigator.clipboard.writeText(text).catch(() => { });
                bridge.sendMessage({ command: 'clipboardAction', action: 'write', text });
            }
        };

        editor.addAction({
            id: 'custom-copy',
            label: 'Copy',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC],
            run: doCopy
        });

        // Override Context Menu Copy
        editor.addAction({
            id: 'editor.action.clipboardCopyAction',
            label: 'Copy',
            run: doCopy
        });


        // Cut (Ctrl+X)
        const doCut = (ed: any) => {
            const selection = ed.getSelection();
            const text = ed.getModel()?.getValueInRange(selection);
            if (text) {
                navigator.clipboard.writeText(text).catch(() => { });
                bridge.sendMessage({ command: 'clipboardAction', action: 'write', text });
                ed.executeEdits('clipboard', [{ range: selection, text: '', forceMoveMarkers: true }]);
            }
        };

        editor.addAction({
            id: 'custom-cut',
            label: 'Cut',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
            run: doCut
        });

        // Override Context Menu Cut
        editor.addAction({
            id: 'editor.action.clipboardCutAction',
            label: 'Cut',
            precondition: '!readonly',
            run: doCut
        });

        // --- End Clipboard Fixes ---

        editor.onDidFocusEditorText(() => {
            if (onFocus) onFocus();
        });
    };

    // Force single line behavior on change (prevent newlines)
    const handleChange = (val: string | undefined) => {
        const v = val || '';
        if (v.includes('\n')) {
            const clean = v.replace(/[\r\n]+/g, '');
            onChange(clean);
        } else {
            onChange(v);
        }
    };

    // Listen for Clipboard Data from Backend (Fallback for Paste)
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.command === 'clipboardText' && message.text) {
                if (editorRef.current) {
                    const ed = editorRef.current;
                    // Check if this editor currently has focus, otherwise we might paste to the wrong input if multiple exist
                    // But typically we only have one focused. Monaco doesn't have a reliable "hasFocus" boolean prop sync'd here easily without state.
                    // We'll rely on the fact that if the user invoked Paste, they likely focused it.
                    // Actually, if multiple editors listen to 'clipboardText', ALL will paste. That's bad.
                    // Ideally we check if this editor is focused.
                    if (ed.hasTextFocus()) {
                        const clean = message.text.replace(/[\r\n]+/g, '');
                        const selection = ed.getSelection();
                        ed.executeEdits('clipboard', [{ range: selection, text: clean, forceMoveMarkers: true }]);
                    }
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <InputContainer>
            <style>
                {`
                .wildcard-tag-decoration {
                    background-color: rgba(255, 105, 180, 0.2);
                    border: 1px solid var(--vscode-editorBracketHighlight-foreground4);
                    border-radius: 12px;
                    margin-left: 2px;
                    margin-right: 2px;
                }
                .wildcard-tag-text {
                    font-weight: bold;
                    color: #ff69b4 !important;
                    font-style: italic;
                }
                /* Hide cursor when not focused? No, input needs cursor. */
                `}
            </style>
            <Editor
                height="26px" // Explicit height to match container
                defaultLanguage="text"
                value={value}
                onChange={handleChange}
                theme="vs-dark"
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false },
                    lineNumbers: 'off',
                    glyphMargin: false,
                    folding: false,
                    lineDecorationsWidth: 0,
                    lineNumbersMinChars: 0,
                    renderLineHighlight: 'none',
                    scrollbar: { horizontal: 'hidden', vertical: 'hidden' },
                    overviewRulerLanes: 0,
                    hideCursorInOverviewRuler: true,
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    contextmenu: true,
                    fontFamily: 'var(--vscode-font-family)',
                    fontSize: 13,
                    readOnly: readOnly,
                    wordWrap: 'off',
                    matchBrackets: 'never',
                    links: false,
                    padding: { top: 4 },
                    // "Single Line" feel
                }}
            />
        </InputContainer>
    );
});
