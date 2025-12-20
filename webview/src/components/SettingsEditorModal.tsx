import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import MonacoEditor from '@monaco-editor/react';
import { X, Save, Info } from 'lucide-react';


const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
`;

const ModalContent = styled.div`
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  width: 800px;
  max-width: 95%;
  height: 80vh;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
    padding: 10px 15px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--vscode-editorGroupHeader-tabsBackground);
`;

const ModalTitle = styled.div`
    font-weight: bold;
    font-size: 14px;
`;

const Button = styled.button`
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  &:hover {
    background: var(--vscode-button-hoverBackground);
  }
`;

const CloseButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    &:hover { color: var(--vscode-errorForeground); }
`;

const EditorContainer = styled.div`
    flex: 1;
    position: relative;
    overflow: hidden;
`;

const HelpPanel = styled.div`
    padding: 10px 15px;
    border-top: 1px solid var(--vscode-panel-border);
    background-color: var(--vscode-sideBar-background);
    color: var(--vscode-foreground);
    font-size: 0.9em;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-height: 50px;
`;

const configDescriptions: Record<string, string> = {
    "version": "Configuration schema version. Do not change manually.",
    "network": "Network settings including timeouts and proxies.",
    "defaultTimeout": "Default timeout for requests in seconds.",
    "retryCount": "Number of times to retry failed requests.",
    "proxy": "HTTP Proxy URL (e.g. http://proxy.com:8080). Leave empty to use system default.",
    "ui": "User Interface customization settings.",
    "layoutMode": "Panel layout orientation: 'vertical' or 'horizontal'.",
    "showLineNumbers": "Toggle line numbers in request/response editors.",
    "alignAttributes": "If true, XML attributes will be aligned vertically in requests.",
    "splitRatio": "Initial position of the divider between request and response (0.1 to 0.9).",
    "activeEnvironment": "The key of the currently selected environment.",
    "environments": "Define environment-specific variables here. Keys are environment names.",
    "endpoint_url": "The target SOAP service URL for this environment.",
    "env": "Short identifier for the environment (accessible via {{env}} wildcard).",
    "globals": "Global variables available in all environments (accessible via {{key}}).",
    "recentWorkspaces": "History of recently opened workspaces."
};

interface SettingsEditorModalProps {
    rawConfig: string;
    onClose: () => void;
    onSave: (content: string) => void;
}

export const SettingsEditorModal: React.FC<SettingsEditorModalProps> = ({ rawConfig, onClose, onSave }) => {
    const [content, setContent] = useState(rawConfig);
    const [error, setError] = useState<string | null>(null);
    const [helpText, setHelpText] = useState<string>('Hover or move cursor over a setting to see its description.');

    useEffect(() => {
        setContent(rawConfig);
    }, [rawConfig]);

    const handleSave = () => {
        // Basic validation
        try {
            // We use standard JSON parse to check validity, but strip comments first?
            // Actually jsonc-parser isn't available in webview unless we bundle it.
            // For now, let's just attempt to save. The extension handles strict jsonc parsing.
            // If the user writes invalid JSONC, extension might fail or just not parse it.
            // We can trust the user or try to validate.
            // But validation of JSONC in browser without library is hard.
            // Let's just save.
            onSave(content);
            onClose();
        } catch (e: any) {
            setError(e.message);
        }
    };

    return (
        <ModalOverlay>
            <ModalContent>
                <ModalHeader>
                    <ModalTitle>Settings (config.jsonc)</ModalTitle>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <Button onClick={handleSave}>
                            <Save size={14} /> Save
                        </Button>
                        <CloseButton onClick={onClose}>
                            <X size={18} />
                        </CloseButton>
                    </div>
                </ModalHeader>
                <EditorContainer>
                    <MonacoEditor
                        height="100%"
                        language="json" // Monaco supports JSON with comments usually if set right, or 'jsonc'
                        theme="vs-dark" // We should detect theme
                        value={content}
                        options={{
                            minimap: { enabled: false },
                            automaticLayout: true,
                            formatOnPaste: true,
                            formatOnType: true
                            // json defaults?
                        }}
                        onChange={(value) => setContent(value || '')}
                        onMount={(editor, monaco) => {
                            // Enable JSONC comments support in Monaco
                            monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
                                validate: true,
                                allowComments: true,
                                schemas: []
                            });

                            editor.onDidChangeCursorPosition((e) => {
                                const model = editor.getModel();
                                if (!model) return;
                                const content = model.getLineContent(e.position.lineNumber);
                                // Try to match "key":
                                const match = content.match(/"([^"]+)"\s*:/);
                                if (match && match[1]) {
                                    const key = match[1];
                                    if (configDescriptions[key]) {
                                        setHelpText(`${key}: ${configDescriptions[key]}`);
                                    } else {
                                        setHelpText(`Unknown setting: ${key}`);
                                    }
                                } else {
                                    // Check if we are inside a specific block?
                                    // For now simple line keys
                                    setHelpText('');
                                }
                            });
                        }}
                    />
                </EditorContainer>
                <HelpPanel>
                    <Info size={16} style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                        {helpText || "Move cursor to a setting to see details."}
                    </div>
                </HelpPanel>
                {error && (
                    <div style={{ padding: 10, color: 'var(--vscode-errorForeground)', borderTop: '1px solid var(--vscode-panel-border)' }}>
                        Error: {error}
                    </div>
                )}
            </ModalContent>
        </ModalOverlay>
    );
};
