
import { useRef, useImperativeHandle, forwardRef, useEffect, useState } from 'react';
import Editor, { Monaco, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';
import { useWildcardDecorations } from '../hooks/useWildcardDecorations';
import { bridge } from '../utils/bridge';
import { applyAutoFolding } from '../utils/xmlFoldingUtils';

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
    onFocus?: () => void;
    autoFoldElements?: string[];
    requestId?: string; // Used to detect when user switches to different request
}

export interface MonacoRequestEditorHandle {
    insertText: (text: string) => void;
}

export const MonacoRequestEditor = forwardRef<MonacoRequestEditorHandle, MonacoRequestEditorProps>(({
    value,
    onChange,
    language = 'xml',
    readOnly = false,
    onFocus,
    autoFoldElements,
    requestId
}, ref) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const previousRequestIdRef = useRef<string | undefined>(undefined);
    const [isReady, setIsReady] = useState(!autoFoldElements || autoFoldElements.length === 0);

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

    // Use shared hook for decorations
    useWildcardDecorations(editorRef.current, monacoRef.current, value);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco;

        editor.onDidFocusEditorText(() => {
            if (onFocus) onFocus();
        });

        if (autoFoldElements && autoFoldElements.length > 0 && value) {
            applyAutoFolding(editor, value, autoFoldElements, () => setIsReady(true));
        } else {
            setIsReady(true);
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

    // Listen for Clipboard Data from Backend (Fallback for Paste)
    useEffect(() => {
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
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Apply auto-folding when switching to a different request
    useEffect(() => {
        if (!editorRef.current || !autoFoldElements || autoFoldElements.length === 0 || !value) {
            previousRequestIdRef.current = requestId;
            return;
        }

        // If requestId changed, it's a different request - apply folding
        if (requestId !== previousRequestIdRef.current) {
            setIsReady(false); // Hide while folding
            applyAutoFolding(editorRef.current, value, autoFoldElements, () => setIsReady(true));
            previousRequestIdRef.current = requestId;
        }
    }, [requestId, value, autoFoldElements]);

    return (
        <EditorContainer style={{ opacity: isReady ? 1 : 0, transition: 'opacity 0.1s' }}>
            <style>
                {/* Styles moved to index.css */}
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
                    contextmenu: true,
                    acceptSuggestionOnEnter: 'off',
                    quickSuggestions: false,
                }}
            />
        </EditorContainer>
    );
});
