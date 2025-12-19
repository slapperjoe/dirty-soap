import React, { useEffect, useRef } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';

loader.config({ monaco });

const EditorContainer = styled.div`
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

export interface MonacoRequestEditorProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
    readOnly?: boolean;
}

export const MonacoRequestEditor: React.FC<MonacoRequestEditorProps> = ({
    value,
    onChange,
    language = 'xml',
    readOnly = false
}) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const decorationsRef = useRef<string[]>([]);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
        updateDecorations();
    };

    const updateDecorations = () => {
        if (!editorRef.current || !monacoRef.current) return;

        const model = editorRef.current.getModel();
        if (!model) return;

        const text = model.getValue();
        const regex = /\{\{[^}]+\}\}/g; // Matches {{...}}
        const matches: any[] = [];
        let match;

        while ((match = regex.exec(text)) !== null) {
            const startPos = model.getPositionAt(match.index);
            const endPos = model.getPositionAt(match.index + match[0].length);

            matches.push({
                range: new monacoRef.current.Range(
                    startPos.lineNumber,
                    startPos.column,
                    endPos.lineNumber,
                    endPos.column
                ),
                options: {
                    isWholeLine: false,
                    className: 'wildcard-tag-decoration',
                    inlineClassName: 'wildcard-tag-text',
                    hoverMessage: { value: 'Wildcard Tag' }
                }
            });
        }

        decorationsRef.current = editorRef.current.deltaDecorations(
            decorationsRef.current,
            matches
        );
    };

    useEffect(() => {
        updateDecorations();
    }, [value]);

    return (
        <EditorContainer>
            <style>
                {`
                .wildcard-tag-decoration {
                    background-color: rgba(255, 69, 58, 0.2); /* Red-Orange specific */
                    border: 1px solid var(--vscode-charts-red);
                    border-radius: 12px; /* Fully rounded "pill" style */
                    margin-left: 2px;
                    margin-right: 2px;
                }
                .wildcard-tag-text {
                    font-weight: bold;
                    color: var(--vscode-charts-red) !important;
                    font-style: italic;
                }
                `}
            </style>
            <Editor
                height="100%"
                defaultLanguage={language}
                value={value}
                onChange={(val) => onChange(val || '')}
                theme="vs-dark" // Default to dark, ideally sync with VSCode theme
                onMount={handleEditorDidMount}
                options={{
                    minimap: { enabled: false }, // Save space
                    fontSize: 14,
                    fontFamily: 'var(--vscode-editor-font-family)',
                    scrollBeyondLastLine: false,
                    readOnly: readOnly,
                    folding: true,
                    automaticLayout: true,
                    lineNumbers: 'on',
                    renderLineHighlight: 'none',
                    contextmenu: false, // Use custom context menu if needed, or default
                }}
            />
        </EditorContainer>
    );
};
