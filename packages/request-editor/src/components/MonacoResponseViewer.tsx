import React, { useRef, useEffect, useState, useMemo } from 'react';
import { MonacoEditorWrapper } from '../monaco';
import type { MonacoType as Monaco } from '../monaco';
import styled from 'styled-components';
import { applyAutoFolding } from '../utils/xmlFoldingUtils';
import { useTheme } from '../contexts/ThemeContext';
import { applyMonacoTheme } from '../utils/monacoTheme';

const ViewerContainer = styled.div`
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

interface MonacoResponseViewerProps {
    value: string;
    language?: string;
    showLineNumbers?: boolean;
    showMinimap?: boolean; // NEW: Show minimap
    onSelectionChange?: (data: { text: string, offset: number } | null) => void;
    autoFoldElements?: string[];
    fontSize?: number; // Font size for viewer (default: 14)
    fontFamily?: string; // Font family for viewer (default: Consolas)
}

const MonacoResponseViewerBase: React.FC<MonacoResponseViewerProps> = ({
    value,
    language = 'xml',
    showLineNumbers = true,
    showMinimap = false,
    onSelectionChange,
    autoFoldElements,
    fontSize = 14,
    fontFamily = 'Consolas, "Courier New", monospace'
}) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);
    // R4 (MONACO_LAG_ROOT_CAUSE.md): the selection listener is subscribed
    // once in onMount, so it always reads the latest callback through a ref
    // instead of re-subscribing when caller callback identity changes.
    const onSelectionChangeRef = useRef<MonacoResponseViewerProps['onSelectionChange']>(onSelectionChange);
    onSelectionChangeRef.current = onSelectionChange;
    const [isReady, setIsReady] = React.useState(!autoFoldElements || autoFoldElements.length === 0 || !value);
    const { theme } = useTheme();
    const [viewerTheme, setViewerTheme] = useState<string>('vs-dark');

    const applyViewerTheme = (monacoInstance: Monaco) => {
        setViewerTheme(applyMonacoTheme(monacoInstance, theme));
    };

    // Keep Monaco language in sync so highlighting matches the response format (e.g., JSON vs XML)
    useEffect(() => {
        if (!editorRef.current || !language) return;
        const model = editorRef.current.getModel?.();
        if (model && monacoRef.current) {
            monacoRef.current.editor.setModelLanguage(model, language);
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

    // R2 (MONACO_LAG_ROOT_CAUSE.md): memoize the viewer options so the wrapper's
            // [options] effect stops calling updateOptions on every parent re-render.
            const viewerOptions = useMemo(
                () => ({
                    minimap: { enabled: showMinimap },
                    fontSize: fontSize,
                    fontFamily: fontFamily,
                    scrollBeyondLastLine: false,
                    readOnly: true,
                    folding: true,
                    automaticLayout: true,
                    lineNumbers: showLineNumbers ? 'on' : 'off',
                    renderLineHighlight: 'none',
                    contextmenu: true,
                }),
                [showMinimap, fontSize, fontFamily, showLineNumbers]
            );

            return (
            <ViewerContainer style={{ opacity: isReady ? 1 : 0, transition: 'opacity 0.1s' }}>
                <MonacoEditorWrapper
                    height="100%"
                    // R6 (MONACO_LAG_ROOT_CAUSE.md): no theme remount key — the
                    // theme switches in place via applyViewerTheme/setTheme.
                    language={language}
                    value={value}
                    theme={viewerTheme}
                    options={viewerOptions}
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

                    // R4 (MONACO_LAG_ROOT_CAUSE.md): onDidChangeCursorSelection fires
                    // per drag step / arrow key; running model.getValueInRange over the
                    // selected range on every fire is O(selection) per event (100 KB+
                    // responses are routine). Coalesce to at most one fire per frame
                    // (requestAnimationFrame), only when the selection is non-empty and
                    // actually changed since the last processed frame. Keyboard
                    // cursor moves produce an empty selection and are skipped entirely.
                    let rafPending = false;
                    let lastProcessedKey = '';
                    const selectionKey = (sel: any) =>
                        sel
                            ? `${sel.startLineNumber}:${sel.startColumn}-${sel.endLineNumber}:${sel.endColumn}`
                            : '';
                    const processSelection = () => {
                        rafPending = false;
                        const sel = pendingSelection;
                        pendingSelection = null;
                        // Mouse selections are reported on mouseup instead.
                        if (isMouseDown || wasMouseSelection) return;
                        const cb = onSelectionChangeRef.current;
                        if (!cb) return;
                        if (!sel || sel.isEmpty()) {
                            cb(null);
                            return;
                        }
                        const key = selectionKey(sel);
                        if (key === lastProcessedKey) return;
                        lastProcessedKey = key;
                        const model = editor.getModel();
                        if (!model) return;
                        const text = model.getValueInRange(sel);
                        if (text) {
                            const offset = model.getOffsetAt(sel.getStartPosition());
                            cb({ text, offset });
                        } else {
                            cb(null);
                        }
                    };

                    editor.onMouseDown(() => {
                        isMouseDown = true;
                        wasMouseSelection = true;
                    });

                    editor.onMouseUp(() => {
                        isMouseDown = false;
                        // Only report selection on mouse up (when user finishes selecting with mouse)
                        const sel = pendingSelection;
                        pendingSelection = null;
                        if (sel && onSelectionChangeRef.current) {
                            const model = editor.getModel();
                            if (model) {
                                const text = model.getValueInRange(sel);
                                if (text) {
                                    const offset = model.getOffsetAt(sel.getStartPosition());
                                    onSelectionChangeRef.current({ text, offset });
                                } else {
                                    onSelectionChangeRef.current(null);
                                }
                            }
                        }
                        // Reset the flag after a brief delay to allow for keyboard selections
                        setTimeout(() => { wasMouseSelection = false; }, 100);
                    });

                    editor.onDidChangeCursorSelection((e: any) => {
                        pendingSelection = e.selection;
                        if (!rafPending) {
                            rafPending = true;
                            requestAnimationFrame(processSelection);
                        }
                    });
                }}
            />
        </ViewerContainer>
    );
};

// R3 (MONACO_LAG_ROOT_CAUSE.md): the viewer's `value` is stable while the user
// types in other editors, so memoization keeps it out of per-keystroke parent
// re-renders (React.memo short-circuits before the wrapper re-renders at all).
export const MonacoResponseViewer = React.memo(MonacoResponseViewerBase);
