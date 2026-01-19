import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Square, Shield, Trash2, FolderOpen, Network, FileCode, FileDown, Bug, Plus, Edit2, ToggleLeft, ToggleRight } from 'lucide-react';
import { WatcherEvent } from '@shared/models';
/* eslint-disable react/no-inline-styles, react/jsx-no-inline-styles */
import { HeaderButton, ServiceItem, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderTitle } from './shared/SidebarStyles';
import { formatXml } from '@shared/utils/xmlFormatter';
import { BreakpointModal, Breakpoint } from '../modals/BreakpointModal';

export interface ProxyUiProps {
    isRunning: boolean;
    config: { port: number, target: string, systemProxyEnabled?: boolean };
    history: WatcherEvent[];
    onStart: () => void;
    onStop: () => void;
    onUpdateConfig: (config: { port: number, target: string, systemProxyEnabled?: boolean }) => void;
    onClear: () => void;
    onSelectEvent: (event: WatcherEvent) => void;
    onSaveHistory: (content: string) => void;

    // Config Switcher
    configPath: string | null;
    onSelectConfigFile: () => void;
    onInjectProxy: () => void;
    onRestoreProxy: () => void;
    onOpenCertificate?: () => void;

    // Breakpoints
    breakpoints?: Breakpoint[];
    onUpdateBreakpoints?: (breakpoints: Breakpoint[]) => void;
}

const Content = styled(SidebarContent)`
    color: var(--vscode-descriptionForeground);
`;

export const ProxyUi: React.FC<ProxyUiProps> = ({
    isRunning,
    config,
    history,
    onStart,
    onStop,
    onUpdateConfig,
    onClear,
    onSelectEvent,
    onSaveHistory,
    configPath,
    onSelectConfigFile,
    onInjectProxy,
    onRestoreProxy,
    onOpenCertificate,
    breakpoints = [],
    onUpdateBreakpoints
}) => {
    const isHttps = config.target.toLowerCase().startsWith('https');
    const [breakpointModal, setBreakpointModal] = useState<{ open: boolean, bp?: Breakpoint | null }>({ open: false });
    const [showBreakpoints, setShowBreakpoints] = useState(true);

    const generateEventMarkdown = (event: WatcherEvent) => {
        let md = `## Request: ${event.url} \n\n`;
        md += `Timestamp: ${event.timestampLabel} \n`;
        md += `Method: ${event.method} \n`;
        md += `Status: ${event.status} \n`;
        md += `Duration: ${(event.duration || 0).toFixed(2)} s\n\n`;

        md += '### Request\n\n';
        if (event.requestHeaders) {
            md += '#### Headers\n';
            md += '```yaml\n';
            Object.entries(event.requestHeaders).forEach(([k, v]) => {
                md += `${k}: ${v}\n`;
            });
            md += '```\n\n';
        }
        md += '#### Body\n';
        const reqBody = event.formattedBody || (event.requestContent || event.requestBody || '').trim();
        if (reqBody) {
            md += '```xml\n' + formatXml(reqBody, true) + '\n```\n\n';
        } else {
            md += '*Empty Body*\n\n';
        }

        md += '### Response\n\n';
        if (event.responseHeaders) {
            md += '#### Headers\n';
            md += '```yaml\n';
            Object.entries(event.responseHeaders).forEach(([k, v]) => {
                md += `${k}: ${v}\n`;
            });
            md += '```\n\n';
        }
        md += '#### Body\n';
        const resBody = event.responseContent || event.responseBody || '';
        if (resBody) {
            let displayRes = resBody;
            try {
                if (resBody.trim().startsWith('<')) displayRes = formatXml(resBody, true);
                else if (resBody.trim().startsWith('{')) displayRes = JSON.stringify(JSON.parse(resBody), null, 2);
            } catch (e) { }

            md += '```\n' + displayRes + '\n```\n\n';
        } else {
            md += '*Empty Body*\n\n';
        }
        return md;
    };

    const handleSaveSingleReport = (event: WatcherEvent, e: React.MouseEvent) => {
        e.stopPropagation();
        const md = generateEventMarkdown(event);
        onSaveHistory(md);
    };

    return (
        <SidebarContainer>
            <SidebarHeader>
                <SidebarHeaderTitle>Dirty Proxy</SidebarHeaderTitle>
            </SidebarHeader>

            <Content>
                {/* compact controls */}
                <div style={{ marginBottom: 15, padding: 10, backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 5 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.8em', marginBottom: 2 }}>Local Port</label>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-input-border)' }}>
                                <div
                                    onClick={() => onUpdateConfig({ ...config, port: Math.max(1, (config.port || 9000) - 1) })}
                                    style={{ padding: '4px 8px', cursor: 'pointer', borderRight: '1px solid var(--vscode-input-border)', userSelect: 'none' }}
                                >-</div>
                                <input
                                    type="number"
                                    className="vscode-input"
                                    value={config.port}
                                    onChange={(e) => onUpdateConfig({ ...config, port: parseInt(e.target.value) || 9000 })}
                                    style={{
                                        flex: 1,
                                        width: '50px',
                                        padding: '4px',
                                        background: 'transparent',
                                        color: 'var(--vscode-input-foreground)',
                                        border: 'none',
                                        textAlign: 'center',
                                        appearance: 'textfield', // Hide default arrows
                                    }}
                                />
                                <div
                                    onClick={() => onUpdateConfig({ ...config, port: (config.port || 9000) + 1 })}
                                    style={{ padding: '4px 8px', cursor: 'pointer', borderLeft: '1px solid var(--vscode-input-border)', userSelect: 'none' }}
                                >+</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', paddingBottom: 1 }}>
                            {!isRunning ? (
                                <HeaderButton onClick={onStart} style={{ color: 'var(--vscode-testing-iconPassed)', border: '1px solid currentColor', padding: '5px 8px', height: '28px' }} title="Start Proxy"><Play size={14} /></HeaderButton>
                            ) : (
                                <HeaderButton onClick={onStop} style={{ color: 'var(--vscode-testing-iconFailed)', border: '1px solid currentColor', padding: '5px 8px', height: '28px' }} title="Stop Proxy"><Square size={14} /></HeaderButton>
                            )}
                        </div>
                    </div>

                    <div style={{ marginBottom: 5 }}>
                        <label style={{ display: 'block', fontSize: '0.8em', marginBottom: 2 }}>Target URL</label>
                        <input
                            type="text"
                            className="vscode-input"
                            value={config.target}
                            onChange={(e) => onUpdateConfig({ ...config, target: e.target.value })}
                            style={{ width: '100%', padding: '4px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
                        />
                    </div>

                    <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            id="chkSystemProxy"
                            checked={config.systemProxyEnabled !== false}
                            onChange={e => onUpdateConfig({ ...config, systemProxyEnabled: e.target.checked })}
                            style={{
                                marginRight: 6,
                                accentColor: 'var(--vscode-button-background)',
                                width: '14px',
                                height: '14px',
                                cursor: 'pointer'
                            }}
                        />
                        <label htmlFor="chkSystemProxy" style={{ fontSize: '0.8em', cursor: 'pointer', userSelect: 'none' }} title="Uncheck to bypass local corporate proxy (direct connection)">
                            Use System Proxy
                        </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <div style={{ fontSize: '0.8em' }}>Status: {isRunning ? <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>Running</span> : 'Stopped'}</div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            {isHttps && onOpenCertificate && (
                                <HeaderButton onClick={onOpenCertificate} title="Install Certificate (Required for HTTPS)" style={{ color: 'var(--vscode-charts-yellow)' }}>
                                    <Shield size={14} />
                                </HeaderButton>
                            )}
                            <HeaderButton onClick={onClear} title="Clear Traffic History"><Trash2 size={14} /></HeaderButton>
                        </div>
                    </div>
                </div>

                {/* Breakpoints Section */}
                {onUpdateBreakpoints && (
                    <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 10, marginTop: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h4
                                style={{ margin: 0, fontSize: '0.9em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                                onClick={() => setShowBreakpoints(!showBreakpoints)}
                            >
                                <Bug size={14} />
                                Breakpoints ({breakpoints.length})
                            </h4>
                            <HeaderButton onClick={() => setBreakpointModal({ open: true })} title="Add Breakpoint">
                                <Plus size={14} />
                            </HeaderButton>
                        </div>

                        {showBreakpoints && breakpoints.length > 0 && (
                            <div style={{ fontSize: '0.85em' }}>
                                {breakpoints.map((bp, i) => (
                                    <div
                                        key={bp.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '6px 8px',
                                            marginBottom: 4,
                                            backgroundColor: 'var(--vscode-list-hoverBackground)',
                                            borderRadius: 4,
                                            opacity: bp.enabled ? 1 : 0.5
                                        }}
                                    >
                                        <button
                                            onClick={() => {
                                                const updated = breakpoints.map((b, idx) =>
                                                    idx === i ? { ...b, enabled: !b.enabled } : b
                                                );
                                                onUpdateBreakpoints(updated);
                                            }}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: bp.enabled ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-disabledForeground)',
                                                padding: 2,
                                                display: 'flex'
                                            }}
                                            title={bp.enabled ? 'Disable' : 'Enable'}
                                        >
                                            {bp.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                        </button>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {bp.name || bp.pattern}
                                            </div>
                                            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                                                {bp.target} • {bp.matchOn}{bp.isRegex ? ' (regex)' : ''}
                                            </div>
                                        </div>
                                        <HeaderButton
                                            onClick={() => setBreakpointModal({ open: true, bp })}
                                            title="Edit"
                                            style={{ padding: 4 }}
                                        >
                                            <Edit2 size={12} />
                                        </HeaderButton>
                                        <HeaderButton
                                            onClick={() => {
                                                const updated = breakpoints.filter((_, idx) => idx !== i);
                                                onUpdateBreakpoints(updated);
                                            }}
                                            title="Delete"
                                            style={{ padding: 4, color: 'var(--vscode-testing-iconFailed)' }}
                                        >
                                            <Trash2 size={12} />
                                        </HeaderButton>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showBreakpoints && breakpoints.length === 0 && (
                            <div style={{ textAlign: 'center', fontSize: '0.8em', opacity: 0.7, padding: '10px 0' }}>
                                No breakpoints configured.
                            </div>
                        )}
                    </div>
                )}

                <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 10, marginTop: 10 }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9em' }}>Config Switcher</h4>
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginBottom: 5 }}>
                        <div style={{
                            flex: 1,
                            fontSize: '0.8em',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            padding: '4px',
                            backgroundColor: 'var(--vscode-editor-background)',
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: '2px'
                        }} title={configPath || ''}>
                            {configPath ? configPath.split(/[\\/]/).pop() : 'Select web.config...'}
                        </div>
                        <HeaderButton onClick={onSelectConfigFile} title="Browse"><FolderOpen size={14} /></HeaderButton>
                    </div>

                    {configPath && (
                        <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
                            <HeaderButton onClick={onInjectProxy} style={{ flex: 1, justifyContent: 'center', border: '1px solid var(--vscode-button-border)', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }} title="Inject Proxy Address">
                                <Network size={12} style={{ marginRight: 5 }} /> Inject
                            </HeaderButton>
                            <HeaderButton onClick={onRestoreProxy} style={{ flex: 1, justifyContent: 'center', border: '1px solid var(--vscode-button-border)', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }} title="Restore Original Config">
                                <FileCode size={12} style={{ marginRight: 5 }} /> Restore
                            </HeaderButton>
                        </div>
                    )}
                </div>

                <div style={{ marginTop: 15, borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <h4 style={{ margin: 0, fontSize: '0.9em' }}>Traffic ({history.length})</h4>
                        {history.length > 0 && (
                            <HeaderButton onClick={onClear} title="Clear Traffic History" style={{ padding: 4 }}>
                                <Trash2 size={14} />
                            </HeaderButton>
                        )}
                    </div>
                    {history.length === 0 ? (
                        <div style={{ textAlign: 'center', marginTop: 10, fontSize: '0.8em', opacity: 0.7 }}>
                            No events captured.
                        </div>
                    ) : (
                        history.map((event, i) => (
                            <ServiceItem
                                key={i}
                                style={{ paddingLeft: 5, paddingRight: 5 }}
                                onClick={() => onSelectEvent(event)}
                            >
                                <div style={{ flex: 1, fontSize: '0.85em', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontWeight: 'bold' }}>{event.method}</span>
                                        <span style={{ opacity: 0.7 }}>{event.status}</span>
                                    </div>
                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={event.url}>{event.url}</div>
                                </div>
                                <HeaderButton onClick={(e) => handleSaveSingleReport(event, e)} title="Save Request Log"><FileDown size={14} /></HeaderButton>
                            </ServiceItem>
                        ))
                    )}
                </div>
            </Content>

            {/* Breakpoint Modal */}
            {onUpdateBreakpoints && (
                <BreakpointModal
                    open={breakpointModal.open}
                    breakpoint={breakpointModal.bp}
                    onClose={() => setBreakpointModal({ open: false })}
                    onSave={(bp) => {
                        const existing = breakpoints.findIndex(b => b.id === bp.id);
                        if (existing >= 0) {
                            // Update existing
                            const updated = [...breakpoints];
                            updated[existing] = bp;
                            onUpdateBreakpoints(updated);
                        } else {
                            // Add new
                            onUpdateBreakpoints([...breakpoints, bp]);
                        }
                    }}
                />
            )}
        </SidebarContainer>
    );
};
