import React from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';

loader.config({ monaco });

const ViewerContainer = styled.div`
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

interface MonacoResponseViewerProps {
    value: string;
    language?: string;
    showLineNumbers?: boolean;
    onSelectionChange?: (data: { text: string, offset: number } | null) => void;
}

export const MonacoResponseViewer: React.FC<MonacoResponseViewerProps> = ({
    value,
    language = 'xml',
    showLineNumbers = true,
    onSelectionChange
}) => {
    return (
        <ViewerContainer>
            <Editor
                height="100%"
                defaultLanguage={language}
                value={value}
                theme="vs-dark"
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: 'var(--vscode-editor-font-family)',
                    scrollBeyondLastLine: false,
                    readOnly: true,
                    folding: true,
                    automaticLayout: true,
                    lineNumbers: showLineNumbers ? 'on' : 'off',
                    renderLineHighlight: 'none',
                    contextmenu: true,
                }}
                onMount={(editor, monaco) => {
                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
                        editor.trigger('keyboard', 'editor.action.clipboardCopyAction', null);
                    });

                    // Track selection state to support "Wait for Mouse Up"
                    let pendingSelection: any = null;
                    let isMouseDown = false;

                    editor.onMouseDown(() => {
                        isMouseDown = true;
                    });

                    editor.onMouseUp(() => {
                        isMouseDown = false;
                        if (pendingSelection && onSelectionChange) {
                            if (pendingSelection) {
                                const model = editor.getModel();
                                if (model) {
                                    const text = model.getValueInRange(pendingSelection);
                                    const offset = model.getOffsetAt(pendingSelection.getStartPosition());
                                    onSelectionChange({ text, offset });
                                }
                            } else {
                                onSelectionChange(null);
                            }
                            // Do not clear pendingSelection here if we want it to persist until cleared?
                            // Actually, keeping it is fine, but we handled the event.
                        }
                    });

                    editor.onDidChangeCursorSelection((e) => {
                        pendingSelection = e.selection;

                        // Immediate update for keyboard interactions (when mouse is not down)
                        if (!isMouseDown && onSelectionChange) {
                            if (e.selection) {
                                const model = editor.getModel();
                                if (model) {
                                    const text = model.getValueInRange(e.selection);
                                    const offset = model.getOffsetAt(e.selection.getStartPosition());
                                    onSelectionChange({ text, offset });
                                }
                            } else {
                                onSelectionChange(null);
                            }
                        }
                    });
                }}
            />
        </ViewerContainer>
    );
};
