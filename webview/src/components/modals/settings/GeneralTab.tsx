/**
 * GeneralTab.tsx
 * 
 * Network and UI settings for the Settings modal.
 */

import React, { useState, useEffect } from 'react';
import {
    ApinoxConfig,
    ScrollableForm,
    FormGroup,
    Label,
    Input,
    Select,
    CheckboxLabel,
    SectionHeader,
} from './SettingsTypes';
import { ProxyRulesEditor } from './ProxyRulesEditor';
import { useTheme } from '../../../contexts/ThemeContext';
import { bridge } from '../../../utils/bridge';

interface GeneralTabProps {
    config: ApinoxConfig;
    onChange: (section: keyof ApinoxConfig, key: string, value: any) => void;
}

// Frontend console log capture
const frontendLogs: Array<{ timestamp: number; level: string; message: string }> = [];
const MAX_FRONTEND_LOGS = 100;

// Intercept console methods
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

const captureLog = (level: string, ...args: any[]) => {
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    frontendLogs.push({
        timestamp: Date.now(),
        level,
        message
    });
    
    // Keep only the last MAX_FRONTEND_LOGS entries
    if (frontendLogs.length > MAX_FRONTEND_LOGS) {
        frontendLogs.shift();
    }
};

console.log = (...args: any[]) => {
    captureLog('log', ...args);
    originalConsoleLog.apply(console, args);
};

console.warn = (...args: any[]) => {
    captureLog('warn', ...args);
    originalConsoleWarn.apply(console, args);
};

console.error = (...args: any[]) => {
    captureLog('error', ...args);
    originalConsoleError.apply(console, args);
};

export const GeneralTab: React.FC<GeneralTabProps> = ({ config, onChange }) => {
    const { theme, setTheme, isTauriMode } = useTheme();

    // Debug screen state
    const [sidecarLogs, setSidecarLogs] = useState<string[]>([]);
    const [frontendLogState, setFrontendLogState] = useState<Array<{ timestamp: number; level: string; message: string }>>([]);
    const [settingsDebug, setSettingsDebug] = useState<any>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [showSidecarLogs, setShowSidecarLogs] = useState(false);
    const [showFrontendLogs, setShowFrontendLogs] = useState(false);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [debugIndicatorVisible, setDebugIndicatorVisible] = useState(true);
    const [connectionTest, setConnectionTest] = useState<{ status: string; message: string } | null>(null);

    // Load logs and debug info when in Tauri mode
    useEffect(() => {
        if (!isTauriMode) return;

        const loadLogsAndDebugInfo = async () => {
            try {
                setIsLoadingLogs(true);
                
                // Load sidecar logs
                const logsResponse = await bridge.sendMessageAsync({ command: 'getSidecarLogs', count: 100 });
                if (logsResponse.logs) {
                    setSidecarLogs(logsResponse.logs);
                }

                // Update frontend logs state
                setFrontendLogState([...frontendLogs]);

                // Load debug info
                const debugResponse = await bridge.sendMessageAsync({ command: 'getDebugInfo' });
                if (debugResponse.debugInfo) {
                    setSettingsDebug(debugResponse.debugInfo);
                }

                setFetchError(null);
            } catch (error: any) {
                setFetchError(error.message || 'Failed to load debug information');
                console.error('[GeneralTab] Failed to load debug info:', error);
            } finally {
                setIsLoadingLogs(false);
            }
        };

        loadLogsAndDebugInfo();

        // Set up polling interval for real-time updates (every 5 seconds)
        const interval = setInterval(loadLogsAndDebugInfo, 5000);
        return () => clearInterval(interval);
    }, [isTauriMode]);

    // Keyboard shortcut: Ctrl+Shift+D to toggle debug indicator
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                toggleDebugIndicator();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [debugIndicatorVisible]);

    // Clear sidecar logs handler
    const clearSidecarLogs = async () => {
        try {
            await bridge.sendMessageAsync({ command: 'clearSidecarLogs' });
            setSidecarLogs([]);
            setFetchError(null);
        } catch (error: any) {
            setFetchError(error.message || 'Failed to clear logs');
            console.error('[GeneralTab] Failed to clear logs:', error);
        }
    };

    // Clear frontend logs handler
    const clearFrontendLogs = () => {
        frontendLogs.length = 0;
        setFrontendLogState([]);
    };

    // Toggle debug indicator
    const toggleDebugIndicator = () => {
        const indicator = document.getElementById('debug-indicator');
        if (indicator) {
            const newVisibility = !debugIndicatorVisible;
            indicator.style.display = newVisibility ? 'block' : 'none';
            setDebugIndicatorVisible(newVisibility);
        }
    };

    // Test connection between frontend and backend
    const testConnection = async () => {
        try {
            setConnectionTest({ status: 'testing', message: 'Testing connection...' });
            const startTime = Date.now();
            
            // Send a test command
            const response = await bridge.sendMessageAsync({ command: 'getDebugInfo' });
            const duration = Date.now() - startTime;
            
            if (response.debugInfo) {
                setConnectionTest({
                    status: 'success',
                    message: `✓ Connection successful (${duration}ms)\nMode: ${response.debugInfo.mode || response.debugInfo.sidecar ? 'Tauri/Sidecar' : 'Unknown'}`
                });
            } else {
                setConnectionTest({
                    status: 'error',
                    message: '✗ No response data received'
                });
            }
        } catch (error: any) {
            setConnectionTest({
                status: 'error',
                message: `✗ Connection failed: ${error.message}`
            });
        }
    };

    return (
        <ScrollableForm>
            <div style={{ display: 'flex', gap: '30px' }}>
                {/* Left Column: User Interface */}
                <div style={{ flex: 1 }}>
                    <SectionHeader style={{ marginTop: 0 }}>User Interface</SectionHeader>

                    {/* Theme Selector - Only in Tauri Mode */}
                    {isTauriMode && (
                        <FormGroup>
                            <Label>Theme</Label>
                            <Select value={theme} onChange={e => setTheme(e.target.value as any)}>
                                <option value="dark">Dark</option>
                                <option value="light">Light</option>
                                <option value="solarized-dark">Solarized Dark</option>
                                <option value="solarized-light">Solarized Light</option>
                            </Select>
                        </FormGroup>
                    )}

                    <FormGroup>
                        <Label>Layout Mode</Label>
                        <Select
                            value={config.ui?.layoutMode ?? 'vertical'}
                            onChange={e => onChange('ui', 'layoutMode', e.target.value)}
                        >
                            <option value="vertical">Vertical (Two Columns)</option>
                            <option value="horizontal">Horizontal (Stacked)</option>
                        </Select>
                    </FormGroup>
                    <FormGroup>
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.ui?.showLineNumbers ?? true}
                                onChange={e => onChange('ui', 'showLineNumbers', e.target.checked)}
                            />
                            Show Line Numbers in Editor
                        </CheckboxLabel>
                    </FormGroup>
                    <FormGroup>
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.ui?.alignAttributes ?? false}
                                onChange={e => onChange('ui', 'alignAttributes', e.target.checked)}
                            />
                            Align Attributes Vertically
                        </CheckboxLabel>
                    </FormGroup>
                    <FormGroup>
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.ui?.inlineElementValues ?? false}
                                onChange={e => onChange('ui', 'inlineElementValues', e.target.checked)}
                            />
                            Inline simple values in XML Response (Experimental)
                        </CheckboxLabel>
                    </FormGroup>
                    <FormGroup>
                        <Label>Auto-Fold XML Elements</Label>
                        <div style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)', marginBottom: 8 }}>
                            Enter element names to automatically collapse in editors (e.g., Security, Header)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                            {(config.ui?.autoFoldElements || []).map((element, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '4px 8px',
                                        background: 'var(--vscode-badge-background)',
                                        color: 'var(--vscode-badge-foreground)',
                                        borderRadius: 3,
                                        fontSize: '0.9em'
                                    }}
                                >
                                    <span>{element}</span>
                                    <button
                                        onClick={() => {
                                            const newElements = [...(config.ui?.autoFoldElements || [])];
                                            newElements.splice(idx, 1);
                                            onChange('ui', 'autoFoldElements', newElements);
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'inherit',
                                            cursor: 'pointer',
                                            padding: 0,
                                            fontSize: '1.1em',
                                            lineHeight: 1
                                        }}
                                        title="Remove"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <Input
                                type="text"
                                placeholder="Element name (e.g., Security)"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const input = e.target as HTMLInputElement;
                                        const value = input.value.trim();
                                        if (value && !(config.ui?.autoFoldElements || []).includes(value)) {
                                            onChange('ui', 'autoFoldElements', [...(config.ui?.autoFoldElements || []), value]);
                                            input.value = '';
                                        }
                                    }
                                }}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </FormGroup>
                </div>


                {/* Right Column: Network */}
                <div style={{ flex: 1 }}>
                    <SectionHeader style={{ marginTop: 0 }}>Network</SectionHeader>
                    <FormGroup>
                        <Label>Default Timeout (seconds)</Label>
                        <Input
                            type="number"
                            value={config.network?.defaultTimeout ?? 30}
                            onChange={e => onChange('network', 'defaultTimeout', parseInt(e.target.value))}
                        />
                    </FormGroup>
                    <FormGroup>
                        <Label>Retry Count</Label>
                        <Input
                            type="number"
                            min={0}
                            max={10}
                            value={config.network?.retryCount ?? 0}
                            onChange={e => onChange('network', 'retryCount', parseInt(e.target.value))}
                        />
                    </FormGroup>
                    <FormGroup>
                        <Label>Proxy URL (Optional)</Label>
                        <Input
                            type="text"
                            placeholder="http://127.0.0.1:8080"
                            value={config.network?.proxy ?? ''}
                            onChange={e => onChange('network', 'proxy', e.target.value)}
                        />
                    </FormGroup>
                    <FormGroup>
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.network?.strictSSL ?? true}
                                onChange={e => onChange('network', 'strictSSL', e.target.checked)}
                            />
                            Strict SSL (Verify Certificates)
                        </CheckboxLabel>
                    </FormGroup>

                    <ProxyRulesEditor config={config} onChange={onChange} />
                </div>
            </div>

            {/* Debug Screen Section - Only in Tauri Mode */}
            {isTauriMode && (
                <div style={{ marginTop: '30px', borderTop: '1px solid var(--vscode-panel-border)', paddingTop: '20px' }}>
                    <SectionHeader>Diagnostics &amp; Debug Information</SectionHeader>

                    {/* Debug Controls */}
                    <FormGroup>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                                onClick={toggleDebugIndicator}
                                style={{
                                    padding: '6px 12px',
                                    fontSize: '0.9em',
                                    background: debugIndicatorVisible ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
                                    color: debugIndicatorVisible ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
                                    border: '1px solid var(--vscode-panel-border)',
                                    cursor: 'pointer',
                                    borderRadius: '3px',
                                }}
                            >
                                {debugIndicatorVisible ? '👁️ Hide' : '👁️‍🗨️ Show'} Debug Indicator
                            </button>
                            <button
                                onClick={testConnection}
                                style={{
                                    padding: '6px 12px',
                                    fontSize: '0.9em',
                                    background: 'var(--vscode-button-background)',
                                    color: 'var(--vscode-button-foreground)',
                                    border: '1px solid var(--vscode-panel-border)',
                                    cursor: 'pointer',
                                    borderRadius: '3px',
                                }}
                                disabled={connectionTest?.status === 'testing'}
                            >
                                {connectionTest?.status === 'testing' ? '⏳ Testing...' : '🔌 Test Connection'}
                            </button>
                        </div>

                        {connectionTest && (
                            <div style={{
                                marginTop: '8px',
                                padding: '8px 12px',
                                background: connectionTest.status === 'success' 
                                    ? 'var(--vscode-testing-iconPassed)' 
                                    : connectionTest.status === 'error'
                                    ? 'var(--vscode-inputValidation-errorBackground)'
                                    : 'var(--vscode-badge-background)',
                                border: '1px solid var(--vscode-panel-border)',
                                borderRadius: '3px',
                                fontSize: '0.9em',
                                whiteSpace: 'pre-line',
                                color: 'var(--vscode-editor-foreground)',
                            }}>
                                {connectionTest.message}
                            </div>
                        )}
                    </FormGroup>

                    {/* Sidecar Console Logs */}
                    <FormGroup>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Label style={{ marginBottom: 0 }}>Sidecar Logs (Node.js Backend)</Label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {isLoadingLogs && (
                                    <span style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)' }}>
                                        Loading...
                                    </span>
                                )}
                                <span style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)' }}>
                                    {sidecarLogs.length} {sidecarLogs.length === 1 ? 'entry' : 'entries'}
                                </span>
                                <button
                                    onClick={clearSidecarLogs}
                                    disabled={sidecarLogs.length === 0}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: '0.9em',
                                        cursor: sidecarLogs.length === 0 ? 'not-allowed' : 'pointer',
                                        opacity: sidecarLogs.length === 0 ? 0.5 : 1,
                                    }}
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={() => setShowSidecarLogs(!showSidecarLogs)}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: '0.9em',
                                    }}
                                >
                                    {showSidecarLogs ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        {fetchError && (
                            <div style={{
                                padding: '8px 12px',
                                marginBottom: '8px',
                                background: 'var(--vscode-inputValidation-errorBackground)',
                                border: '1px solid var(--vscode-inputValidation-errorBorder)',
                                color: 'var(--vscode-inputValidation-errorForeground)',
                                borderRadius: '3px',
                                fontSize: '0.9em',
                            }}>
                                ⚠️ {fetchError}
                            </div>
                        )}

                        {showSidecarLogs && (
                            <div style={{
                                maxHeight: '300px',
                                overflowY: 'auto',
                                background: 'var(--vscode-editor-background)',
                                border: '1px solid var(--vscode-panel-border)',
                                padding: '8px',
                                fontFamily: 'var(--vscode-editor-font-family, monospace)',
                                fontSize: '0.85em',
                                lineHeight: '1.4',
                                borderRadius: '3px',
                            }}>
                                {sidecarLogs.length === 0 ? (
                                    <div style={{
                                        color: 'var(--vscode-descriptionForeground)',
                                        textAlign: 'center',
                                        padding: '20px',
                                        fontStyle: 'italic',
                                    }}>
                                        No logs available
                                    </div>
                                ) : (
                                    sidecarLogs.map((log, i) => (
                                        <div
                                            key={i}
                                            style={{
                                                marginBottom: 4,
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                color: log.includes('[ERROR]') || log.includes('Error') ? 'var(--vscode-errorForeground)' :
                                                    log.includes('[WARN]') || log.includes('Warning') ? 'var(--vscode-editorWarning-foreground)' :
                                                        'var(--vscode-editor-foreground)',
                                            }}
                                        >
                                            {log}
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </FormGroup>

                    {/* Frontend Console Logs */}
                    <FormGroup>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <Label style={{ marginBottom: 0 }}>Frontend Logs (React/Browser)</Label>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)' }}>
                                    {frontendLogState.length} {frontendLogState.length === 1 ? 'entry' : 'entries'}
                                </span>
                                <button
                                    onClick={clearFrontendLogs}
                                    disabled={frontendLogState.length === 0}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: '0.9em',
                                        cursor: frontendLogState.length === 0 ? 'not-allowed' : 'pointer',
                                        opacity: frontendLogState.length === 0 ? 0.5 : 1,
                                    }}
                                >
                                    Clear
                                </button>
                                <button
                                    onClick={() => setShowFrontendLogs(!showFrontendLogs)}
                                    style={{
                                        padding: '4px 12px',
                                        fontSize: '0.9em',
                                    }}
                                >
                                    {showFrontendLogs ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        {showFrontendLogs && (
                            <div style={{
                                maxHeight: '300px',
                                overflowY: 'auto',
                                background: 'var(--vscode-editor-background)',
                                border: '1px solid var(--vscode-panel-border)',
                                padding: '8px',
                                fontFamily: 'var(--vscode-editor-font-family, monospace)',
                                fontSize: '0.85em',
                                lineHeight: '1.4',
                                borderRadius: '3px',
                            }}>
                                {frontendLogState.length === 0 ? (
                                    <div style={{
                                        color: 'var(--vscode-descriptionForeground)',
                                        textAlign: 'center',
                                        padding: '20px',
                                        fontStyle: 'italic',
                                    }}>
                                        No logs captured yet
                                    </div>
                                ) : (
                                    frontendLogState.map((log, i) => {
                                        const timestamp = new Date(log.timestamp).toLocaleTimeString();
                                        return (
                                            <div
                                                key={i}
                                                style={{
                                                    marginBottom: 4,
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word',
                                                    color: log.level === 'error' ? 'var(--vscode-errorForeground)' :
                                                        log.level === 'warn' ? 'var(--vscode-editorWarning-foreground)' :
                                                            'var(--vscode-editor-foreground)',
                                                }}
                                            >
                                                <span style={{ opacity: 0.6 }}>[{timestamp}]</span> [{log.level.toUpperCase()}] {log.message}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </FormGroup>

                    {/* Settings Debug Information */}
                    {settingsDebug && (
                        <details style={{ marginTop: 16 }}>
                            <summary style={{
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                marginBottom: 8,
                                padding: '8px',
                                background: 'var(--vscode-sideBar-background)',
                                borderRadius: '3px',
                                userSelect: 'none',
                            }}>
                                System Debug Information
                            </summary>
                            <div style={{
                                background: 'var(--vscode-editor-background)',
                                border: '1px solid var(--vscode-panel-border)',
                                padding: '12px',
                                fontFamily: 'var(--vscode-editor-font-family, monospace)',
                                fontSize: '0.8em',
                                whiteSpace: 'pre-wrap',
                                overflowX: 'auto',
                                maxHeight: '400px',
                                overflowY: 'auto',
                                borderRadius: '3px',
                                lineHeight: '1.5',
                            }}>
                                {JSON.stringify(settingsDebug, null, 2)}
                            </div>
                        </details>
                    )}
                </div>
            )}
        </ScrollableForm >
    );
};
