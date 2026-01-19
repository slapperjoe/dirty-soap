/**
 * GeneralTab.tsx
 * 
 * Network and UI settings for the Settings modal.
 */

import React, { useEffect, useState } from 'react';
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
import { useUI } from '../../../contexts/UIContext';
import { bridge } from '../../../utils/bridge';
import { FrontendCommand } from '@shared/messages';

interface GeneralTabProps {
    config: ApinoxConfig;
    onChange: (section: keyof ApinoxConfig, key: string, value: any) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ config, onChange }) => {
    const { theme, setTheme, isTauriMode } = useTheme();
    const { configDir } = useUI();
    const [tauriConfigDir, setTauriConfigDir] = useState<string | null>(null);
    const [sidecarReady, setSidecarReady] = useState<boolean | null>(null);
    const [sidecarPort, setSidecarPort] = useState<number | null>(null);
    const [logs, setLogs] = useState<Array<{ timestamp: string; level: string; message: string }>>([]);
    const [showLogs, setShowLogs] = useState(false);

    useEffect(() => {
        if (!isTauriMode) return;
        const loadTauriInfo = async () => {
            try {
                const { invoke } = await import('@tauri-apps/api/core');
                const dir = await invoke<string | null>('get_config_dir');
                if (dir) setTauriConfigDir(dir);
                const ready = await invoke<boolean>('is_sidecar_ready');
                setSidecarReady(ready);
                const port = await invoke<number>('get_sidecar_port');
                setSidecarPort(port);
            } catch (e) {
                setSidecarReady(false);
            }
        };

        loadTauriInfo();
    }, [isTauriMode]);

    useEffect(() => {
        if (!sidecarPort) return;
        try {
            const response = await fetch(`http://127.0.0.1:${sidecarPort}/logs`);
            const data = await response.json();
            setLogs(data.logs || []);
        } catch (e) {
            console.error('Failed to load logs:', e);
        }
    };

    const clearLogs = async () => {
        if (!sidecarPort) return;
        try {
            await fetch(`http://127.0.0.1:${sidecarPort}/logs/clear`, { method: 'POST' });
            setLogs([]);
        } catch (e) {
            console.error('Failed to clear logs:', e);
        }
    };

    useEffect(() => {
        if (showLogs && sidecarPort) {
            loadLogs();
            const interval = setInterval(loadLogs, 2000); // Auto-refresh every 2s
            return () => clearInterval(interval);
        }
    }, [showLogs, sidecarPort]);

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
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.ui?.showDebugIndicator ?? false}
                                onChange={e => onChange('ui', 'showDebugIndicator', e.target.checked)}
                            />
                            Show Debug Indicator
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

                    <FormGroup>
                        <Label>Settings Location</Label>
                        <span style={{ fontSize: '0.85em'}}>{configDir || tauriConfigDir || 'Unknown'}</span>
                        {isTauriMode && (
                            <div style={{ fontSize: '0.75em', color: 'var(--vscode-descriptionForeground)', marginTop: 4 }}>
                                <div>
                                    Sidecar status: {sidecarReady === null ? 'Checking…' : (sidecarReady ? `Ready (port ${sidecarPort || '?'})` : 'Not ready')}
                                </div>
                                {sidecarPort && (
                                    <div>
                                        Debug endpoint: <a href={`http://127.0.0.1:${sidecarPort}/debug`} target="_blank" rel="noopener noreferrer">
                                            http://127.0.0.1:{sidecarPort}/debug
                                        </a>
                                    </div>
                                )}
                                {settingsDebug && (
                                    <div style={{ marginTop: 4 }}>
                                        <div>Config file: {settingsDebug.configPath || 'Unknown'}</div>
                                        <div>File exists: {settingsDebug.exists ? 'Yes' : 'No'} | Raw length: {settingsDebug.rawLength ?? 0}</div>
                                        <div>APINOX_CONFIG_DIR env: {settingsDebug.envVar || 'not set'}</div>
                                        <div>APINOX_CONFIG_FILE env: {settingsDebug.envFile || 'not set'}</div>
                                        {settingsDebug.readError && <div style={{ color: 'var(--vscode-errorForeground)' }}>Error: {settingsDebug.readError}</div>}
                                    </div>
                                )}
                                {fetchError && (
                                    <div style={{ marginTop: 8, padding: 8, background: 'var(--vscode-inputValidation-errorBackground)', border: '1px solid var(--vscode-inputValidation-errorBorder)' }}>
                                        <strong>Fetch Error:</strong>
                                        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.85em', marginTop: 4 }}>{fetchError}</pre>
                                    </div>
                                )}
                                {sidecarPort && (
                                    <div style={{ marginTop: 8 }}>
                                        <button 
                                            onClick={() => setShowLogs(!showLogs)}
                                            style={{
                                                padding: '4px 8px',
                                                    <strong>Sidecar Console Logs ({logs.length})</strong>
                                                    <button 
                                                        onClick={clearLogs}
                                                        style={{
                                                            padding: '2px 6px',
                                                            fontSize: '0.9em',
                                                            cursor: 'pointer',
                                                            background: 'var(--vscode-button-secondaryBackground)',
                                                            color: 'var(--vscode-button-secondaryForeground)',
                                                            border: 'none',
                                                            borderRadius: 2
                                                        }}
                                                    >
                                                        Clear
                                                    </button>
                                                </div>
                                                {logs.length === 0 ? (
                                                    <div style={{ color: 'var(--vscode-descriptionForeground)' }}>No logs</div>
                                                ) : (
                                                    logs.slice().reverse().map((log, i) => (
                                                        <div key={i} style={{ 
                                                            marginBottom: 4, 
                                                            paddingBottom: 4, 
                                                            borderBottom: '1px solid var(--vscode-widget-border)',
                                                            color: log.level === 'error' ? 'var(--vscode-errorForeground)' : 
                                                                   log.level === 'warn' ? 'var(--vscode-editorWarning-foreground)' : 
                                                                   'var(--vscode-foreground)'
                                                        }}>
                                                            <span style={{ opacity: 0.6 }}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                                                            {' '}
                                                            <span style={{ fontWeight: 'bold' }}>[{log.level.toUpperCase()}]</span>
                                                            {' '}
                                                            <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{log.message}</span>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                {rawConfigPreview && (
                                    <details style={{ marginTop: 8, fontSize: '0.7em', color: 'var(--vscode-descriptionForeground)' }}>
                                        <summary style={{ cursor: 'pointer', userSelect: 'none' }}>File Content Preview (first 500 chars)</summary>
                            Settings are stored in a single config.jsonc file within this folder.
                            Local storage (Tauri) caches: theme (apinox-theme), UI state (apinox_state),
                            window bounds (apinox_window_state), request history cache (apinox_history_cache),
                            and last response per request (apinox:lastResponse:&lt;id&gt;).
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
        </ScrollableForm >
    );
};
