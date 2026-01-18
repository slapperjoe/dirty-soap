
import { useRef, useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';
import { useWildcardDecorations } from '../hooks/useWildcardDecorations';
import { bridge } from '../utils/bridge';
import { applyAutoFolding } from '../utils/xmlFoldingUtils';
import { useTheme } from '../contexts/ThemeContext';

loader.config({ monaco });

const EditorContainer = styled.div`
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

interface MonacoRequestEditorProps {
    value: string;
    onChange: (value: string) => void;
    language?: string;
    readOnly?: boolean;
    onFocus?: () => void;
    autoFoldElements?: string[];
    showLineNumbers?: boolean;
    requestId?: string; // Used to detect when user switches to different request
    forceUpdateKey?: number; // Used to force update when value changes externally (e.g. formatting)
    logId?: string; // Debugging ID
}

export interface MonacoRequestEditorHandle {
    insertText: (text: string) => void;
    getValue: () => string;
}

export const MonacoRequestEditor = forwardRef<MonacoRequestEditorHandle, MonacoRequestEditorProps>(({
    value,
    onChange,
    language = 'xml',
    readOnly = false,
    onFocus,
    autoFoldElements,
    showLineNumbers = true,
    requestId,
    forceUpdateKey
}, ref) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const { theme } = useTheme();
    const [editorTheme, setEditorTheme] = useState<string>('vs-dark');
    const previousRequestIdRef = useRef<string | undefined>(undefined);
    const lastSyncedRequestIdRef = useRef<string | undefined>(undefined);
    const lastSyncedForceUpdateKeyRef = useRef<number | undefined>(undefined);

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
        },
        getValue: () => {
            if (editorRef.current) {
                const model = editorRef.current.getModel();
                return model ? model.getValue() : '';
            }
            return '';
        }
    }));

    // Use shared hook for decorations
    useWildcardDecorations(editorRef.current, monacoRef.current, value);

    // Sync value manual implementation to prevent cursor jumps
    useEffect(() => {
        if (editorRef.current) {
            const editor = editorRef.current;
            const model = editor.getModel();
            if (!model) return;


            const currentVal = model.getValue();
            const isNewRequest = requestId !== lastSyncedRequestIdRef.current;
            const isForceUpdate = forceUpdateKey !== undefined && forceUpdateKey !== lastSyncedForceUpdateKeyRef.current;
            const isMount = lastSyncedRequestIdRef.current === undefined;
            const shouldSync = isNewRequest || isForceUpdate || isMount;

            if (shouldSync) {
                // If content is identical, avoid updating to prevent cursor jumps.
                // This specifically handles the "ID Transition" case (Unsaved Name -> Saved ID)
                // where isNewRequest is true but content hasn't changed.
                if (currentVal !== value) {
                    if (isNewRequest) {
                        editor.setValue(value || '');
                    } else {
                        const pos = editor.getPosition();
                        editor.setValue(value || '');
                        if (pos) editor.setPosition(pos);
                    }
                }
            }
            if (forceUpdateKey !== undefined) {
                lastSyncedForceUpdateKeyRef.current = forceUpdateKey;
            }
            lastSyncedRequestIdRef.current = requestId;
        }
        // Removed `value` from dependencies to strictly enforce Force Update pattern.
        // We do NOT want to react to value prop changes unless it is a new request or forced.
    }, [requestId, forceUpdateKey]);

    const applyEditorTheme = (monacoInstance: Monaco) => {
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
        setEditorTheme(themeId);
    };

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        applyEditorTheme(monaco);

        editor.onDidFocusEditorText(() => {
            if (onFocus) onFocus();
        });

        if (autoFoldElements && autoFoldElements.length > 0 && value) {
            applyAutoFolding(editor, value, autoFoldElements);
        }

        // Fix Enter key to insert newline (prevents Enter from being stolen)
        editor.addAction({
            id: 'insert-newline',
            label: 'Insert Newline',
            keybindings: [monaco.KeyCode.Enter],
            run: (ed) => {
                ed.trigger('keyboard', 'type', { text: '\n' });
            }
        });

        // --- Clipboard Fixes ---

        const doPaste = async (ed: any) => {
            try {
                // Try Native Web API first
                const text = await navigator.clipboard.readText();
                if (text) {
                    const selection = ed.getSelection();
                    ed.executeEdits('clipboard', [{ range: selection, text: text, forceMoveMarkers: true }]);
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

        // Paste (Context Menu Override)
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
                // Try Native + Backend for redundancy coverage
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

        // Copy (Context Menu Override)
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
                // Delete selection
                ed.executeEdits('clipboard', [{ range: selection, text: '', forceMoveMarkers: true }]);
            }
        };

        editor.addAction({
            id: 'custom-cut',
            label: 'Cut',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyX],
            run: doCut
        });

        // Cut (Context Menu Override)
        editor.addAction({
            id: 'editor.action.clipboardCutAction',
            label: 'Cut',
            precondition: '!readonly',
            run: doCut
        });

        // --- End Clipboard Fixes ---
    };

    useEffect(() => {
        if (monacoRef.current) {
            applyEditorTheme(monacoRef.current);
        }
    }, [theme]);

    // Listen for Clipboard Data from Backend (Fallback for Paste)
    // Listen for Clipboard Data from Backend (Fallback for Paste)
    useEffect(() => {
        // Log mount
        bridge.sendMessage({ command: 'log', message: `[MonacoRequestEditor] Mounted. RequestId: ${requestId}` });

        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.command === 'clipboardText' && message.text) {
                if (editorRef.current) {
                    const ed = editorRef.current;
                    // Prevent pasting if not focused (avoids broadcasting paste to all editors)
                    if (ed.hasTextFocus()) {
                        const selection = ed.getSelection();
                        ed.executeEdits('clipboard', [{ range: selection, text: message.text, forceMoveMarkers: true }]);
                        ed.focus();
                    }
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => {
            bridge.sendMessage({ command: 'log', message: `[MonacoRequestEditor] Unmounted. RequestId: ${requestId}` });
            window.removeEventListener('message', handleMessage);
        };
    }, []);

    const editorOptions = {
        minimap: { enabled: false }, // Save space
        fontSize: 14,
        fontFamily: 'var(--vscode-editor-font-family)',
        scrollBeyondLastLine: false,
        readOnly: readOnly,
        folding: true,
        automaticLayout: true,
        lineNumbers: showLineNumbers ? 'on' : 'off',
        renderLineHighlight: 'none',
        contextmenu: true,
        acceptSuggestionOnEnter: 'off',
        quickSuggestions: false,
    };

    // Apply auto-folding when switching to a different request
    useEffect(() => {
        if (!editorRef.current || !autoFoldElements || autoFoldElements.length === 0 || !value) {
            previousRequestIdRef.current = requestId;
            return;
        }

        const currentReqId = requestId || '';
        const prevReqId = previousRequestIdRef.current || '';

        if (currentReqId && prevReqId && currentReqId !== prevReqId) {
            applyAutoFolding(editorRef.current, value, autoFoldElements);
        } else if (!previousRequestIdRef.current && requestId) {
            applyAutoFolding(editorRef.current, value, autoFoldElements);
        }

        previousRequestIdRef.current = requestId;
    }, [requestId, value, autoFoldElements]);

    // Keep Monaco language in sync when request or body type changes
    useEffect(() => {
        if (!editorRef.current || !language) return;
        const model = editorRef.current.getModel?.();
        if (model) {
            monaco.editor.setModelLanguage(model, language);
        }
    }, [language, requestId]);

    return (
        <EditorContainer>
            <style>

            </style>
            <Editor
                height="100%"
                key={`request-editor-${theme}`}
                defaultLanguage={language}
                defaultValue={value}
                onChange={(val) => onChange(val || '')}
                theme={editorTheme}
                onMount={handleEditorDidMount}
                options={editorOptions as any}
            />
        </EditorContainer>
    );
});
