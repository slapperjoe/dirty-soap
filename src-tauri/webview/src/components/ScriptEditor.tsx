import React, { useRef, useState, useEffect } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { TestStep } from '@shared/models';
import { bridge } from '../utils/bridge';
import { Toolbar, ToolbarButton } from '../styles/WorkspaceLayout.styles';
import { ChevronLeft, Play } from 'lucide-react';
import { ScriptPlaygroundModal } from './modals/ScriptPlaygroundModal';
import { ToolbarSeparator } from '../styles/WorkspaceLayout.styles';
import { useTheme } from '../contexts/ThemeContext';

interface ScriptEditorProps {
    step: TestStep;
    onUpdate: (step: TestStep) => void;
    isReadOnly?: boolean;
    onBack?: () => void;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ step, onUpdate, isReadOnly, onBack }) => {
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<Monaco | null>(null);
    // Initialize local state from prop
    const [scriptContent, setScriptContent] = useState(step.config.scriptContent || '');
    const [showPlayground, setShowPlayground] = useState(false);
    const { theme } = useTheme();
    const [editorTheme, setEditorTheme] = useState<string>('vs-dark');

    // Track previous prop value to detect actual remote changes
    const prevStepContent = useRef(step.config.scriptContent);

    // Update local state and ref ONLY if prop actually changes remotely (e.g. undo/redo or initial load)
    useEffect(() => {
        if (step.config.scriptContent !== prevStepContent.current) {
            // Only update if the incoming prop is different from what we expect
            // This prevents local typing from being overwritten by the prop update it triggered
            if (scriptContent !== step.config.scriptContent) {
                setScriptContent(step.config.scriptContent || '');
            }
            prevStepContent.current = step.config.scriptContent;
        }
    }, [step.config.scriptContent]); // Removed scriptContent dep to avoid loops

    // Refs for flush-on-unmount pattern
    const latestScriptContent = useRef(scriptContent);
    const latestStep = useRef(step);
    const onUpdateRef = useRef(onUpdate);

    // Keep refs in sync
    useEffect(() => {
        latestScriptContent.current = scriptContent;
        latestStep.current = step;
        onUpdateRef.current = onUpdate;
    }, [scriptContent, step, onUpdate]);

    // Auto-save effect with debounce AND flush on unmount
    useEffect(() => {
        const timer = setTimeout(() => {
            // Debounced Save
            if (latestScriptContent.current !== latestStep.current.config.scriptContent) {
                bridge.sendMessage({ command: 'log', message: `[ScriptEditor] Auto-saving step (debounce): ${latestStep.current.id}` });
                onUpdateRef.current({
                    ...latestStep.current,
                    config: {
                        ...latestStep.current.config,
                        scriptContent: latestScriptContent.current
                    }
                });
                prevStepContent.current = latestScriptContent.current;
            }
        }, 800);

        return () => {
            clearTimeout(timer);
            // Flush on Unmount / Cleanup
            // If content is still different from prop, save immediately
            if (latestScriptContent.current !== latestStep.current.config.scriptContent) {
                bridge.sendMessage({ command: 'log', message: `[ScriptEditor] Auto-saving step (flush): ${latestStep.current.id}` });
                onUpdateRef.current({
                    ...latestStep.current,
                    config: {
                        ...latestStep.current.config,
                        scriptContent: latestScriptContent.current
                    }
                });
                prevStepContent.current = latestScriptContent.current;
            }
        };
    }, [scriptContent]); // Trigger on every keystroke (for debounce reset)

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

        // Configure JavaScript defaults for the Sandbox API
        monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
            noSemanticValidation: false,
            noSyntaxValidation: false,
        });

        // Add extra lib for API autocomplete
        const libUri = 'ts:filename/sandbox.d.ts';
        monaco.languages.typescript.javascriptDefaults.addExtraLib(`
            /**
             * Log a message to the test runner output.
             * @param message The message to log.
             */
            declare function log(message: string): void;

            /**
             * Fail the current test step/case with a reason.
             * @param reason The error message.
             */
            declare function fail(reason: string): void;

            /**
             * Jump to a specific step in the test case.
             * @param stepName The exact name of the step to jump to.
             */
            declare function goto(stepName: string): void;

            /**
             * Pause execution for a specified duration.
             * @param ms Duration in milliseconds.
             */
            declare function delay(ms: number): Promise<void>;

            /**
             * Shared context object for storing variables across steps.
             */
            declare const context: Record<string, any>;
        `, libUri);
    };

    useEffect(() => {
        if (monacoRef.current) {
            applyEditorTheme(monacoRef.current);
        }
    }, [theme]);

    const handleChange = (value: string | undefined) => {
        if (value !== undefined) {
            setScriptContent(value);
        }
    };

    const handleBack = () => {
        if (onBack) {
            onBack();
        }
    };

    return (
        <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', width: '100%' }}>
            <Toolbar>
                {onBack && (
                    <>
                        <ToolbarButton onClick={handleBack} title="Back to Test Case">
                            <ChevronLeft size={14} /> Back
                        </ToolbarButton>
                        <ToolbarSeparator />
                    </>
                )}
                <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <span style={{ fontWeight: 'bold', marginLeft: 10 }}>Script: {step.name}</span>
                </div>

                <ToolbarButton onClick={() => setShowPlayground(true)} title="Run in Playground">
                    <Play size={14} /> Playground
                </ToolbarButton>
            </Toolbar>

            <div style={{ padding: '5px 10px', background: 'var(--vscode-editor-background)', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                <span style={{ fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)' }}>
                    API: <code>log(msg)</code>, <code>context</code>, <code>goto(step)</code>, <code>delay(ms)</code>.
                </span>
            </div>

            <div style={{ flex: 1, overflow: 'hidden' }}>
                <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme={editorTheme}
                    value={scriptContent}
                    onChange={handleChange}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 14,
                        readOnly: isReadOnly,
                        automaticLayout: true,
                    }}
                />
            </div>

            {showPlayground && (
                <ScriptPlaygroundModal
                    scriptType="step"
                    initialScript={scriptContent}
                    onClose={() => setShowPlayground(false)}
                    onApplyScript={(newScript) => {
                        setScriptContent(newScript);
                    }}
                />
            )}
        </div>
    );
};
