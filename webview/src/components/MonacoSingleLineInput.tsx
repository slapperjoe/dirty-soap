import React, { useRef } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';
import { useWildcardDecorations } from '../hooks/useWildcardDecorations';

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

export interface MonacoSingleLineInputProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string; // Monaco doesn't support placeholder natively easily, but we can fake it or ignore
    readOnly?: boolean;
    onEnter?: () => void; // Support for hitting Enter
}

export const MonacoSingleLineInput: React.FC<MonacoSingleLineInputProps> = ({
    value,
    onChange,
    readOnly = false,
    onEnter
}) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);

    // Apply Wildcard Decorations
    useWildcardDecorations(editorRef.current, monacoRef.current, value);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        // Handle Enter Key
        editor.addCommand(monaco.KeyCode.Enter, () => {
            if (onEnter) onEnter();
        });

        // Handle Paste (strip newlines)
        editor.onDidPaste((_: any) => {
            const val = editor.getValue();
            if (val.includes('\n')) {
                const clean = val.replace(/[\r\n]+/g, '');
                editor.setValue(clean);
                onChange(clean);
            }
        });
    };

    // Force single line behavior on change (prevent newlines)
    const handleChange = (val: string | undefined) => {
        const v = val || '';
        if (v.includes('\n')) {
            const clean = v.replace(/[\r\n]+/g, '');
            // We can't easily push back to editor loop without causing cursor jumps usually,
            // but for a URL bar it's mostly fine or we wait for effect.
            // Actually, simplest is to strip it before calling onChange.
            onChange(clean);
        } else {
            onChange(v);
        }
    };

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
                    contextmenu: false,
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
};
