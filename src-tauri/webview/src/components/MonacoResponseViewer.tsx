import React, { useRef, useEffect, useState } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';
import { applyAutoFolding } from '../utils/xmlFoldingUtils';
import { useTheme } from '../contexts/ThemeContext';

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
    autoFoldElements?: string[];
}

export const MonacoResponseViewer: React.FC<MonacoResponseViewerProps> = ({
    value,
    language = 'xml',
    showLineNumbers = true,
    onSelectionChange,
    autoFoldElements
}) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const [isReady, setIsReady] = React.useState(!autoFoldElements || autoFoldElements.length === 0 || !value);
    const { theme } = useTheme();
    const [viewerTheme, setViewerTheme] = useState<string>('vs-dark');

    const applyViewerTheme = (monacoInstance: Monaco) => {
        const root = document.documentElement;
        const getVar = (name: string, fallback: string) => {
            const value = getComputedStyle(root).getPropertyValue(name).trim();
            return value || fallback;
        };

        const isLight = theme.includes('light');
        const themeId = `apinox-${theme}`;

        monacoInstance.editor.defineTheme(themeId, {
            base: isLight ? 'vs' : 'vs-dark',
            inherit: true,
            rules: [],
            colors: {
                'editor.background': getVar('--vscode-editor-background', isLight ? '#ffffff' : '#1e1e1e'),
                'editor.foreground': getVar('--vscode-editor-foreground', isLight ? '#000000' : '#d4d4d4'),
                'editor.selectionBackground': getVar('--vscode-editor-selectionBackground', isLight ? '#add6ff' : '#264f78'),
                'editor.lineHighlightBackground': getVar('--vscode-editor-lineHighlightBackground', 'transparent'),
                'editorCursor.foreground': getVar('--vscode-editorCursor-foreground', isLight ? '#000000' : '#ffffff'),
                'editorLineNumber.foreground': getVar('--vscode-editorLineNumber-foreground', isLight ? '#999999' : '#858585'),
                'editorLineNumber.activeForeground': getVar('--vscode-editorLineNumber-activeForeground', isLight ? '#000000' : '#c6c6c6'),
                'editorWhitespace.foreground': getVar('--vscode-editorWhitespace-foreground', isLight ? '#d3d3d3' : '#404040')
            }
        });

        monacoInstance.editor.setTheme(themeId);
        setViewerTheme(themeId);
    };

    // Keep Monaco language in sync so highlighting matches the response format (e.g., JSON vs XML)
    useEffect(() => {
        if (!editorRef.current || !language) return;
        const model = editorRef.current.getModel?.();
        if (model) {
            monaco.editor.setModelLanguage(model, language);
        }
    }, [language, value]);

    useEffect(() => {
        if (monacoRef.current) {
            applyViewerTheme(monacoRef.current);
        }
    }, [theme]);

    // Apply auto-folding when response content changes
    // Response viewer is read-only, so any value change is a new response
    useEffect(() => {
        if (!editorRef.current || !autoFoldElements || autoFoldElements.length === 0 || !value) {
            setIsReady(true);
            return;
        }

        setIsReady(false); // Hide while folding
        applyAutoFolding(editorRef.current, value, autoFoldElements, () => setIsReady(true));
    }, [value, autoFoldElements]);

    return (
        <ViewerContainer style={{ opacity: isReady ? 1 : 0, transition: 'opacity 0.1s' }}>
            <Editor
                height="100%"
                key={`response-viewer-${theme}`}
                defaultLanguage={language}
                value={value}
                theme={viewerTheme}
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
                    editorRef.current = editor;
                    monacoRef.current = monaco;
                    applyViewerTheme(monaco);

                    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyC, () => {
                        editor.trigger('keyboard', 'editor.action.clipboardCopyAction', null);
                    });

                    // Track selection state to support "Wait for Mouse Up"
                    let pendingSelection: any = null;
                    let isMouseDown = false;
                    let wasMouseSelection = false;

                    editor.onMouseDown(() => {
                        isMouseDown = true;
                        wasMouseSelection = true;
                    });

                    editor.onMouseUp(() => {
                        isMouseDown = false;
                        // Only report selection on mouse up (when user finishes selecting with mouse)
                        if (pendingSelection && onSelectionChange) {
                            const model = editor.getModel();
                            if (model) {
                                const text = model.getValueInRange(pendingSelection);
                                if (text) {
                                    const offset = model.getOffsetAt(pendingSelection.getStartPosition());
                                    onSelectionChange({ text, offset });
                                } else {
                                    onSelectionChange(null);
                                }
                            }
                        }
                        // Reset the flag after a brief delay to allow for keyboard selections
                        setTimeout(() => { wasMouseSelection = false; }, 100);
                    });

                    editor.onDidChangeCursorSelection((e) => {
                        pendingSelection = e.selection;

                        // Only immediately notify for keyboard-based selections (not mouse-based)
                        // If mouse is down, we'll wait for mouseup
                        // If this selection was initiated by a mouse, don't notify here
                        if (!isMouseDown && !wasMouseSelection && onSelectionChange) {
                            if (e.selection) {
                                const model = editor.getModel();
                                if (model) {
                                    const text = model.getValueInRange(e.selection);
                                    const offset = model.getOffsetAt(e.selection.getStartPosition());
                                    if (text) {
                                        onSelectionChange({ text, offset });
                                    } else {
                                        onSelectionChange(null);
                                    }
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
