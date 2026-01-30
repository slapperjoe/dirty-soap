/**
 * DebugModal.tsx
 * 
 * Debug and diagnostics modal for APInox.
 * Shows sidecar logs, frontend logs, system debug information, and connection testing.
 * Opens with Ctrl+Shift+D keyboard shortcut.
 */

import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { useTheme } from '../../contexts/ThemeContext';
import { bridge } from '../../utils/bridge';
import { DiagnosticsTab } from './DiagnosticsTab';

interface DebugModalProps {
    isOpen: boolean;
    onClose: () => void;
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

export const DebugModal: React.FC<DebugModalProps> = ({ isOpen, onClose }) => {
    const { isTauriMode } = useTheme();

    // Tab state
    const [activeTab, setActiveTab] = useState<'logs' | 'diagnostics'>('logs');

    // Debug screen state
    const [sidecarLogs, setSidecarLogs] = useState<string[]>([]);
    const [frontendLogState, setFrontendLogState] = useState<Array<{ timestamp: number; level: string; message: string }>>([]);
    const [settingsDebug, setSettingsDebug] = useState<any>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [showSidecarLogs, setShowSidecarLogs] = useState(false);
    const [showFrontendLogs, setShowFrontendLogs] = useState(false);
    const [showSystemInfo, setShowSystemInfo] = useState(true); // Start expanded
    const [showDebugInfo, setShowDebugInfo] = useState(false);
    const [isLoadingLogs, setIsLoadingLogs] = useState(false);
    const [debugIndicatorVisible, setDebugIndicatorVisible] = useState(false);
    const [connectionTest, setConnectionTest] = useState<{ status: string; message: string } | null>(null);
    const [copyStatus, setCopyStatus] = useState<string | null>(null);
    
    // Tauri-specific state
    const [configDir, setConfigDir] = useState<string | null>(null);
    const [sidecarReady, setSidecarReady] = useState<boolean | null>(null);
    const [sidecarPort, setSidecarPort] = useState<number | null>(null);
    const [sidecarDiagnostics, setSidecarDiagnostics] = useState<any>(null);
    const [debugEndpointInfo, setDebugEndpointInfo] = useState<any>(null);

    // Refs for auto-scrolling log containers
    const sidecarLogsRef = React.useRef<HTMLDivElement>(null);
    const frontendLogsRef = React.useRef<HTMLDivElement>(null);

    // Helper function to close all accordions
    const closeAllAccordions = () => {
        setShowSidecarLogs(false);
        setShowFrontendLogs(false);
        setShowSystemInfo(false);
        setShowDebugInfo(false);
    };

    // Helper function to toggle accordion (closes others)
    const toggleAccordion = (section: 'sidecar' | 'frontend' | 'system' | 'debug') => {
        if (section === 'sidecar') {
            const wasOpen = showSidecarLogs;
            closeAllAccordions();
            setShowSidecarLogs(!wasOpen);
        } else if (section === 'frontend') {
            const wasOpen = showFrontendLogs;
            closeAllAccordions();
            setShowFrontendLogs(!wasOpen);
        } else if (section === 'system') {
            const wasOpen = showSystemInfo;
            closeAllAccordions();
            setShowSystemInfo(!wasOpen);
        } else if (section === 'debug') {
            const wasOpen = showDebugInfo;
            closeAllAccordions();
            setShowDebugInfo(!wasOpen);
        }
    };

    // Auto-scroll sidecar logs to bottom when opened
    React.useEffect(() => {
        if (showSidecarLogs && sidecarLogsRef.current) {
            setTimeout(() => {
                if (sidecarLogsRef.current) {
                    sidecarLogsRef.current.scrollTop = sidecarLogsRef.current.scrollHeight;
                }
            }, 0);
        }
    }, [showSidecarLogs]);

    // Auto-scroll frontend logs to bottom when opened
    React.useEffect(() => {
        if (showFrontendLogs && frontendLogsRef.current) {
            setTimeout(() => {
                if (frontendLogsRef.current) {
                    frontendLogsRef.current.scrollTop = frontendLogsRef.current.scrollHeight;
                }
            }, 0);
        }
    }, [showFrontendLogs]);

    // Load logs and debug info when modal opens in Tauri mode
    useEffect(() => {
        if (!isOpen || !isTauriMode) return;

        const loadLogsAndDebugInfo = async () => {
            try {
                setIsLoadingLogs(true);
                
                // Load Tauri-specific information
                const { invoke } = await import('@tauri-apps/api/core');
                const dir = await invoke<string | null>('get_config_dir');
                setConfigDir(dir);
                const ready = await invoke<boolean>('is_sidecar_ready');
                setSidecarReady(ready);
                const port = await invoke<number>('get_sidecar_port');
                setSidecarPort(port);
                
                // Load comprehensive diagnostics
                try {
                    const diagnostics = await invoke<any>('get_sidecar_diagnostics');
                    setSidecarDiagnostics(diagnostics);
                    console.log('[DebugModal] Sidecar diagnostics:', diagnostics);
                } catch (e) {
                    console.warn('[DebugModal] Failed to get sidecar diagnostics:', e);
                }
                
                // Fetch debug endpoint info if sidecar is ready
                if (ready && port) {
                    try {
                        const response = await fetch(`http://127.0.0.1:${port}/debug`);
                        if (response.ok) {
                            const debugInfo = await response.json();
                            setDebugEndpointInfo(debugInfo);
                        }
                    } catch (e) {
                        console.warn('[DebugModal] Failed to fetch debug endpoint:', e);
                    }
                }
                
                // Load sidecar logs - always read from the actual log file for consistency
                try {
                    const tauriLogs = await invoke<string[]>('get_tauri_logs', { lines: 100 });
                    setSidecarLogs(tauriLogs);
                } catch (e) {
                    console.warn('[DebugModal] Failed to get logs:', e);
                    setSidecarLogs(['Unable to retrieve logs: ' + String(e)]);
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
                console.error('[DebugModal] Failed to load debug info:', error);
            } finally {
                setIsLoadingLogs(false);
            }
        };

        loadLogsAndDebugInfo();

        // Only poll if explicitly requested (don't auto-poll to avoid UI freezing)
        // User can manually refresh if needed
    }, [isOpen, isTauriMode]);

    // Check debug indicator visibility on mount
    useEffect(() => {
        if (!isOpen) return;
        
        const indicator = document.getElementById('debug-indicator');
        if (indicator) {
            const isVisible = indicator.style.display !== 'none';
            setDebugIndicatorVisible(isVisible);
        }
    }, [isOpen]);

    // Clear sidecar logs handler
    const clearSidecarLogs = async () => {
        try {
            await bridge.sendMessageAsync({ command: 'clearSidecarLogs' });
            setSidecarLogs([]);
            setFetchError(null);
        } catch (error: any) {
            setFetchError(error.message || 'Failed to clear logs');
            console.error('[DebugModal] Failed to clear logs:', error);
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

    // Copy all diagnostics to clipboard
    const copyAllDiagnostics = async () => {
        try {
            setCopyStatus('Copying...');
            
            // Format all diagnostic information
            const lines: string[] = [];
            lines.push('=== APInox Diagnostic Information ===');
            lines.push(`Timestamp: ${new Date().toISOString()}`);
            lines.push('');
            
            // System Information
            lines.push('--- System Information ---');
            if (configDir) lines.push(`Settings Location: ${configDir}`);
            if (sidecarReady !== null) lines.push(`Sidecar Status: ${sidecarReady ? '✓ Ready' : '✗ Not Ready'}`);
            if (sidecarPort && sidecarReady) lines.push(`Sidecar Port: ${sidecarPort}`);
            
            // Sidecar Diagnostics
            if (sidecarDiagnostics) {
                lines.push('');
                lines.push('--- Sidecar Diagnostics ---');
                if (sidecarDiagnostics.binaryInfo) {
                    lines.push(`Binary Type: ${sidecarDiagnostics.binaryInfo.type} (${sidecarDiagnostics.binaryInfo.embeddedNodeVersion})`);
                    lines.push(`Description: ${sidecarDiagnostics.binaryInfo.description}`);
                }
                if (sidecarDiagnostics.processRunning !== undefined) {
                    lines.push(`Sidecar Process: ${sidecarDiagnostics.processRunning ? '✓ Running' : '✗ Not Running'}`);
                }
                if (sidecarDiagnostics.startupError) {
                    lines.push(`Startup Error: ${sidecarDiagnostics.startupError}`);
                }
                if (sidecarDiagnostics.logFilePath) {
                    lines.push(`Log File: ${sidecarDiagnostics.logFilePath}`);
                }
            }
            
            // Debug Endpoint Info
            if (debugEndpointInfo) {
                lines.push('');
                lines.push('--- Sidecar Runtime Info ---');
                if (debugEndpointInfo.nodeVersion) lines.push(`Embedded Node.js: ${debugEndpointInfo.nodeVersion}`);
                if (debugEndpointInfo.platform) lines.push(`Platform: ${debugEndpointInfo.platform} (${debugEndpointInfo.arch})`);
                if (debugEndpointInfo.pid) lines.push(`Process ID: ${debugEndpointInfo.pid}`);
                if (debugEndpointInfo.uptime !== undefined) lines.push(`Uptime: ${Math.floor(debugEndpointInfo.uptime)}s`);
                if (debugEndpointInfo.memoryUsage) {
                    lines.push(`Memory: ${Math.round(debugEndpointInfo.memoryUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(debugEndpointInfo.memoryUsage.heapTotal / 1024 / 1024)}MB`);
                }
            }
            
            // Sidecar Logs (last 50 lines)
            if (sidecarLogs.length > 0) {
                lines.push('');
                lines.push('--- Recent Logs (last 50 lines) ---');
                const recentLogs = sidecarLogs.slice(-50);
                recentLogs.forEach(log => lines.push(log));
            }
            
            // Frontend Logs (last 20 lines)
            if (frontendLogState.length > 0) {
                lines.push('');
                lines.push('--- Recent Frontend Logs (last 20) ---');
                const recentFrontend = frontendLogState.slice(-20);
                recentFrontend.forEach(log => {
                    const time = new Date(log.timestamp).toISOString();
                    lines.push(`[${time}] [${log.level.toUpperCase()}] ${log.message}`);
                });
            }
            
            const diagnosticText = lines.join('\n');
            
            // Copy to clipboard using Tauri clipboard plugin
            const { writeText } = await import('@tauri-apps/plugin-clipboard-manager');
            await writeText(diagnosticText);
            
            setCopyStatus('✓ Copied!');
            setTimeout(() => setCopyStatus(null), 2000);
        } catch (error: any) {
            console.error('[DebugModal] Failed to copy diagnostics:', error);
            setCopyStatus('✗ Failed to copy');
            setTimeout(() => setCopyStatus(null), 2000);
        }
    };

    if (!isTauriMode) {
        return (
            <Modal isOpen={isOpen} onClose={onClose} title="Debug & Diagnostics" width={800}>
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--vscode-descriptionForeground)' }}>
                    Debug diagnostics are only available in Tauri standalone mode.
                </div>
            </Modal>
        );
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Debug & Diagnostics" width={900}>
            {/* Tab Navigation */}
            <div style={{ 
                display: 'flex', 
                borderBottom: '1px solid var(--vscode-panel-border)',
                marginBottom: '20px'
            }}>
                <button
                    onClick={() => setActiveTab('logs')}
                    style={{
                        padding: '10px 20px',
                        background: activeTab === 'logs' ? 'var(--vscode-tab-activeBackground)' : 'transparent',
                        color: activeTab === 'logs' ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)',
                        border: 'none',
                        borderBottom: activeTab === 'logs' ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent',
                        cursor: 'pointer',
                        fontSize: '0.95em',
                        fontWeight: activeTab === 'logs' ? 600 : 400
                    }}
                >
                    📋 Logs & System Info
                </button>
                <button
                    onClick={() => setActiveTab('diagnostics')}
                    style={{
                        padding: '10px 20px',
                        background: activeTab === 'diagnostics' ? 'var(--vscode-tab-activeBackground)' : 'transparent',
                        color: activeTab === 'diagnostics' ? 'var(--vscode-tab-activeForeground)' : 'var(--vscode-tab-inactiveForeground)',
                        border: 'none',
                        borderBottom: activeTab === 'diagnostics' ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent',
                        cursor: 'pointer',
                        fontSize: '0.95em',
                        fontWeight: activeTab === 'diagnostics' ? 600 : 400
                    }}
                >
                    🔧 Certificate & Proxy
                </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'diagnostics' ? (
                <DiagnosticsTab />
            ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Action Buttons */}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <button
                            onClick={toggleDebugIndicator}
                            style={{
                                padding: '8px 16px',
                                fontSize: '0.9em',
                                background: debugIndicatorVisible ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
                                color: debugIndicatorVisible ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
                                border: '1px solid var(--vscode-button-border)',
                                cursor: 'pointer',
                                borderRadius: '2px',
                            }}
                        >
                            {debugIndicatorVisible ? '👁️ Hide' : '👁️‍🗨️ Show'} Debug Indicator
                        </button>
                        <button
                            onClick={testConnection}
                            style={{
                                padding: '8px 16px',
                                fontSize: '0.9em',
                                background: 'var(--vscode-button-background)',
                                color: 'var(--vscode-button-foreground)',
                                border: '1px solid var(--vscode-button-border)',
                                cursor: 'pointer',
                                borderRadius: '2px',
                            }}
                            disabled={connectionTest?.status === 'testing'}
                        >
                            {connectionTest?.status === 'testing' ? '⏳ Testing...' : '🔌 Test Connection'}
                        </button>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                            onClick={async () => {
                                setIsLoadingLogs(true);
                                try {
                                    const { invoke } = await import('@tauri-apps/api/core');
                                    // Always read from the actual log file for consistency with file contents
                                    const tauriLogs = await invoke<string[]>('get_tauri_logs', { lines: 100 });
                                    setSidecarLogs(tauriLogs);
                                } catch (e) {
                                    console.error('[DebugModal] Failed to refresh logs:', e);
                                } finally {
                                    setIsLoadingLogs(false);
                                }
                            }}
                            disabled={isLoadingLogs}
                            style={{
                                padding: '8px 16px',
                                background: 'var(--vscode-button-secondaryBackground)',
                                color: 'var(--vscode-button-secondaryForeground)',
                                border: '1px solid var(--vscode-button-border)',
                                borderRadius: '2px',
                                cursor: isLoadingLogs ? 'not-allowed' : 'pointer',
                                fontSize: '0.9em',
                                opacity: isLoadingLogs ? 0.5 : 1
                            }}
                        >
                            {isLoadingLogs ? '🔄 Refreshing...' : '🔄 Refresh Logs'}
                        </button>
                        <button
                            onClick={copyAllDiagnostics}
                            style={{
                                padding: '8px 16px',
                                background: copyStatus ? 'var(--vscode-button-secondaryBackground)' : 'var(--vscode-button-background)',
                                color: 'var(--vscode-button-foreground)',
                                border: '1px solid var(--vscode-button-border)',
                                borderRadius: '2px',
                                cursor: 'pointer',
                                fontSize: '0.9em',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                            onMouseEnter={(e) => {
                                if (!copyStatus) {
                                    e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!copyStatus) {
                                    e.currentTarget.style.background = 'var(--vscode-button-background)';
                                }
                            }}
                        >
                            {copyStatus === 'Copying...' && '⏳'}
                            {copyStatus === '✓ Copied!' && '✓'}
                            {copyStatus === '✗ Failed to copy' && '✗'}
                            {!copyStatus && '📋'}
                            {copyStatus || 'Copy All Diagnostics'}
                        </button>
                    </div>
                </div>
                
                {/* Connection Test Result */}
                {connectionTest && (
                    <div style={{
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
                
                {/* System Information */}
                <div>
                    <div 
                        onClick={() => toggleAccordion('system')}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px',
                            cursor: 'pointer',
                            userSelect: 'none',
                            padding: '4px 0',
                            marginBottom: '8px',
                            fontWeight: 'bold',
                        }}
                    >
                        <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                            {showSystemInfo ? '▼' : '▶'}
                        </span>
                        System Information
                    </div>
                    
                    {showSystemInfo && (
                        <div style={{
                            background: 'var(--vscode-editor-background)',
                            border: '1px solid var(--vscode-panel-border)',
                            padding: '12px',
                            borderRadius: '3px',
                            fontSize: '0.9em',
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
                        {configDir && (
                            <div>
                                <span style={{ opacity: 0.7 }}>Settings Location:</span>{' '}
                                <span>{configDir}</span>
                            </div>
                        )}
                        {sidecarReady !== null && (
                            <div>
                                <span style={{ opacity: 0.7 }}>Sidecar Status:</span>{' '}
                                <span style={{ color: sidecarReady ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-editorWarning-foreground)' }}>
                                    {sidecarReady ? '✓ Ready' : '✗ Not Ready'}
                                    {sidecarPort && sidecarReady && ` (port ${sidecarPort})`}
                                </span>
                            </div>
                        )}
                        
                        {/* Available Endpoints */}
                        {sidecarPort && sidecarReady && (
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ opacity: 0.7, fontSize: '0.85em', marginBottom: '4px' }}>Available Endpoints:</div>
                                <div style={{ paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <a 
                                        href={`http://127.0.0.1:${sidecarPort}/health`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ 
                                            color: 'var(--vscode-textLink-foreground)',
                                            textDecoration: 'none',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                    >
                                        http://127.0.0.1:{sidecarPort}/health
                                    </a>
                                    <a 
                                        href={`http://127.0.0.1:${sidecarPort}/debug`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ 
                                            color: 'var(--vscode-textLink-foreground)',
                                            textDecoration: 'none',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                    >
                                        http://127.0.0.1:{sidecarPort}/debug
                                    </a>
                                    <a 
                                        href={`http://127.0.0.1:${sidecarPort}/logs`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ 
                                            color: 'var(--vscode-textLink-foreground)',
                                            textDecoration: 'none',
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
                                        onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
                                    >
                                        http://127.0.0.1:{sidecarPort}/logs
                                    </a>
                                </div>
                            </div>
                        )}
                        
                        {/* Standalone Binary Info */}
                        {sidecarDiagnostics?.binaryInfo && (
                            <div>
                                <span style={{ opacity: 0.7 }}>Binary Type:</span>{' '}
                                <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>
                                    ✓ Standalone ({sidecarDiagnostics.binaryInfo.embeddedNodeVersion})
                                </span>
                            </div>
                        )}
                        
                        {/* Sidecar Process */}
                        {sidecarDiagnostics?.processRunning !== undefined && (
                            <div>
                                <span style={{ opacity: 0.7 }}>Sidecar Process:</span>{' '}
                                <span style={{ color: sidecarDiagnostics.processRunning ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-editorWarning-foreground)' }}>
                                    {sidecarDiagnostics.processRunning ? '✓ Running' : '✗ Not Running'}
                                </span>
                            </div>
                        )}
                        
                        {/* Startup Error */}
                        {sidecarDiagnostics?.startupError && (
                            <div style={{ marginTop: '8px' }}>
                                <span style={{ opacity: 0.7 }}>Startup Error:</span>{' '}
                                <span style={{ color: 'var(--vscode-editorError-foreground)', fontWeight: 'bold' }}>
                                    {sidecarDiagnostics.startupError}
                                </span>
                            </div>
                        )}
                        
                        {/* Log File Path */}
                        {sidecarDiagnostics?.logFilePath && (
                            <div style={{ marginTop: '8px' }}>
                                <span style={{ opacity: 0.7 }}>Log File:</span>{' '}
                                <span 
                                    style={{ 
                                        fontSize: '0.85em', 
                                        wordBreak: 'break-all',
                                        color: 'var(--vscode-textLink-foreground)',
                                        cursor: 'pointer',
                                        textDecoration: 'underline'
                                    }}
                                    onClick={() => {
                                        bridge.sendMessage({ 
                                            command: 'openFile', 
                                            filePath: sidecarDiagnostics.logFilePath 
                                        });
                                    }}
                                    title="Click to open log file"
                                >
                                    {sidecarDiagnostics.logFilePath}
                                </span>
                            </div>
                        )}
                        
                        {/* Debug Endpoint Info */}
                        {debugEndpointInfo && (
                            <>
                                <div style={{ marginTop: '8px', opacity: 0.7, fontSize: '0.85em' }}>
                                    Sidecar Runtime Info:
                                </div>
                                {debugEndpointInfo.nodeVersion && (
                                    <div style={{ paddingLeft: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>Embedded Node.js:</span>{' '}
                                        <span>{debugEndpointInfo.nodeVersion}</span>
                                    </div>
                                )}
                                {debugEndpointInfo.platform && (
                                    <div style={{ paddingLeft: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>Platform:</span>{' '}
                                        <span>{debugEndpointInfo.platform} ({debugEndpointInfo.arch})</span>
                                    </div>
                                )}
                                {debugEndpointInfo.pid && (
                                    <div style={{ paddingLeft: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>Process ID:</span>{' '}
                                        <span>{debugEndpointInfo.pid}</span>
                                    </div>
                                )}
                                {debugEndpointInfo.uptime !== undefined && (
                                    <div style={{ paddingLeft: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>Uptime:</span>{' '}
                                        <span>{Math.floor(debugEndpointInfo.uptime)}s</span>
                                    </div>
                                )}
                                {debugEndpointInfo.memoryUsage && (
                                    <div style={{ paddingLeft: '12px' }}>
                                        <span style={{ opacity: 0.7 }}>Memory:</span>{' '}
                                        <span>{Math.round(debugEndpointInfo.memoryUsage.heapUsed / 1024 / 1024)}MB / {Math.round(debugEndpointInfo.memoryUsage.heapTotal / 1024 / 1024)}MB</span>
                                    </div>
                                )}
                            </>
                        )}
                        
                        {!sidecarReady && (
                            <div style={{ 
                                marginTop: '12px',
                                padding: '12px',
                                background: 'var(--vscode-inputValidation-warningBackground)',
                                border: '1px solid var(--vscode-inputValidation-warningBorder)',
                                borderRadius: '4px',
                                fontSize: '0.9em'
                            }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--vscode-inputValidation-warningForeground)' }}>
                                    ⚠ Sidecar Not Ready
                                </div>
                                <div style={{ marginBottom: '6px' }}>Possible causes:</div>
                                <ul style={{ margin: '4px 0', paddingLeft: '20px', lineHeight: '1.6' }}>
                                    {!sidecarDiagnostics?.processRunning && (
                                        <li>Standalone binary failed to start - Check logs below for errors</li>
                                    )}
                                    <li>Standalone binary not built - Run: <code style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '2px 4px' }}>npm run tauri:build</code></li>
                                    <li>Port conflict or firewall blocking localhost</li>
                                    <li>Permissions issue with config directory</li>
                                    <li>Binary corrupted or wrong architecture</li>
                                </ul>
                                <div style={{ marginTop: '8px', fontSize: '0.95em' }}>
                                    📋 Check <strong>Sidecar Logs</strong> tab below for detailed error messages
                                </div>
                            </div>
                        )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Error Display */}
                {fetchError && (
                    <div style={{
                        padding: '8px 12px',
                        background: 'var(--vscode-inputValidation-errorBackground)',
                        border: '1px solid var(--vscode-inputValidation-errorBorder)',
                        color: 'var(--vscode-inputValidation-errorForeground)',
                        borderRadius: '3px',
                        fontSize: '0.9em',
                    }}>
                        ⚠️ {fetchError}
                    </div>
                )}

                {/* Sidecar Console Logs */}
                <div>
                    <div 
                        onClick={() => toggleAccordion('sidecar')}
                        style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            marginBottom: 8,
                            cursor: 'pointer',
                            userSelect: 'none',
                            padding: '4px 0',
                        }}
                    >
                        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                {showSidecarLogs ? '▼' : '▶'}
                            </span>
                            All Logs (Tauri + Sidecar)
                            <span style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)', fontWeight: 'normal' }}>
                                ({sidecarLogs.length} {sidecarLogs.length === 1 ? 'entry' : 'entries'})
                                {isLoadingLogs && ' - Loading...'}
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearSidecarLogs();
                                }}
                                disabled={sidecarLogs.length === 0}
                                style={{
                                    padding: '4px 12px',
                                    fontSize: '0.9em',
                                    background: 'var(--vscode-button-secondaryBackground)',
                                    color: 'var(--vscode-button-secondaryForeground)',
                                    border: '1px solid var(--vscode-button-border)',
                                    borderRadius: '2px',
                                    cursor: sidecarLogs.length === 0 ? 'not-allowed' : 'pointer',
                                    opacity: sidecarLogs.length === 0 ? 0.5 : 1,
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {showSidecarLogs && (
                        <div 
                            ref={sidecarLogsRef}
                            style={{
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
                </div>

                {/* Frontend Console Logs */}
                <div>
                    <div 
                        onClick={() => toggleAccordion('frontend')}
                        style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            marginBottom: 8,
                            cursor: 'pointer',
                            userSelect: 'none',
                            padding: '4px 0',
                        }}
                    >
                        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                {showFrontendLogs ? '▼' : '▶'}
                            </span>
                            Frontend Logs (React/Browser)
                            <span style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)', fontWeight: 'normal' }}>
                                ({frontendLogState.length} {frontendLogState.length === 1 ? 'entry' : 'entries'})
                            </span>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    clearFrontendLogs();
                                }}
                                disabled={frontendLogState.length === 0}
                                style={{
                                    padding: '4px 12px',
                                    fontSize: '0.9em',
                                    background: 'var(--vscode-button-secondaryBackground)',
                                    color: 'var(--vscode-button-secondaryForeground)',
                                    border: '1px solid var(--vscode-button-border)',
                                    borderRadius: '2px',
                                    cursor: frontendLogState.length === 0 ? 'not-allowed' : 'pointer',
                                    opacity: frontendLogState.length === 0 ? 0.5 : 1,
                                }}
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {showFrontendLogs && (
                        <div 
                            ref={frontendLogsRef}
                            style={{
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
                </div>

                {/* Settings Debug Information */}
                {settingsDebug && (
                    <div>
                        <div 
                            onClick={() => toggleAccordion('debug')}
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '8px',
                                cursor: 'pointer',
                                userSelect: 'none',
                                padding: '4px 0',
                                marginBottom: '8px',
                                fontWeight: 'bold',
                            }}
                        >
                            <span style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                {showDebugInfo ? '▼' : '▶'}
                            </span>
                            System Debug Information
                        </div>
                        
                        {showDebugInfo && (
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
                        )}
                    </div>
                )}
            </div>
            )}
        </Modal>
    );
};
