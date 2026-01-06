import React, { useRef, useState, useEffect } from 'react';
import Editor, { Monaco } from '@monaco-editor/react';
import { SoapTestStep } from '@shared/models';
import { bridge } from '../utils/bridge';
import { Toolbar, ToolbarButton } from '../styles/WorkspaceLayout.styles';
import { ChevronLeft, Save } from 'lucide-react';

interface ScriptEditorProps {
    step: SoapTestStep;
    onUpdate: (step: SoapTestStep) => void;
    isReadOnly?: boolean;
    onBack?: () => void;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({ step, onUpdate, isReadOnly, onBack }) => {
    const editorRef = useRef<any>(null);
    // Initialize local state from prop
    const [scriptContent, setScriptContent] = useState(step.config.scriptContent || '');
    const [isDirty, setIsDirty] = useState(false);

    // Track previous prop value to detect actual remote changes
    const prevStepContent = useRef(step.config.scriptContent);

    // Update local state ONLY if prop actually changes remotely (e.g. undo/redo or initial load)
    useEffect(() => {
        if (step.config.scriptContent !== prevStepContent.current) {
            prevStepContent.current = step.config.scriptContent;
            // Only overwrite local if not dirty, OR if we want to force sync (optional policy)
            // For now, respect local dirty state unless it's a new step selection (which would remount component anyway)
            if (!isDirty) {
                setScriptContent(step.config.scriptContent || '');
            }
        }
    }, [step.config.scriptContent, isDirty]);

    const handleEditorDidMount = (editor: any, monaco: Monaco) => {
        editorRef.current = editor;

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

    const handleChange = (value: string | undefined) => {
        if (value !== undefined) {
            setScriptContent(value);
            setIsDirty(true);
        }
    };

    const handleSave = () => {
        bridge.sendMessage({ command: 'log', message: `[ScriptEditor] handleSave called. Content length: ${scriptContent.length}` });
        bridge.sendMessage({ command: 'log', message: `[ScriptEditor] Calling onUpdate for step: ${step.id}` });
        onUpdate({
            ...step,
            config: {
                ...step.config,
                scriptContent: scriptContent
            }
        });
        setIsDirty(false);
    };

    const handleBack = () => {
        if (isDirty) {
            // Show confirmation dialog
            const confirmed = window.confirm('You have unsaved changes. Do you want to save before leaving?');
            if (confirmed) {
                handleSave();
            }
        }
        if (onBack) {
            onBack();
        }
    };

    return (
        <div style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', width: '100%' }}>
            <Toolbar>
                {onBack && (
                    <ToolbarButton onClick={handleBack} title="Back to Test Case">
                        <ChevronLeft size={14} /> Back
                    </ToolbarButton>
                )}
                <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    <span style={{ fontWeight: 'bold', marginLeft: 10 }}>Script: {step.name}</span>
                    {isDirty && <span style={{ marginLeft: 5, fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)' }}>(Unsaved)</span>}
                </div>
                {isDirty && (
                    <ToolbarButton onClick={handleSave} title="Save Script" style={{ marginLeft: 'auto' }}>
                        <Save size={14} /> Save
                    </ToolbarButton>
                )}
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
                    theme="vs-dark" // We should ideally inherit from VS Code theme
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
        </div>
    );
};
