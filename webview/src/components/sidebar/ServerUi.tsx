/**
 * ServerUi.tsx
 * 
 * Unified server sidebar component with mode toggle, mock rules, breakpoints, and combined traffic history.
 * Replaces separate Proxy and Mock tabs.
 */

import React, { useState } from 'react';
import { Play, Square, Trash2, Settings, Network, ArrowRight, Plus, Edit2, ToggleLeft, ToggleRight, Radio, Bug, PlusSquare, Shield } from 'lucide-react';
import { WatcherEvent, MockEvent, ServerMode, ServerConfig, MockRule } from '../../models';
import { HeaderButton, ServiceItem } from './shared/SidebarStyles';
import { MockRuleModal } from '../modals/MockRuleModal';
import { BreakpointModal, Breakpoint } from '../modals/BreakpointModal';
import { createMockRuleFromSource } from '../../utils/mockUtils';

export interface ServerUiProps {
    // Server state
    serverConfig: ServerConfig;
    isRunning: boolean;

    // Actions
    onModeChange: (mode: ServerMode) => void;
    onStart: () => void;
    onStop: () => void;
    onOpenSettings: () => void;

    // Traffic history (combined proxy + mock events)
    proxyHistory: WatcherEvent[];
    mockHistory: MockEvent[];
    onSelectProxyEvent: (event: WatcherEvent) => void;
    onSelectMockEvent: (event: MockEvent) => void;
    selectedEventId?: string;
    onClearHistory: () => void;

    // Mock Rules (shown when mode = mock or both)
    mockRules?: MockRule[];
    onAddMockRule?: (rule: MockRule) => void;
    onDeleteMockRule?: (id: string) => void;
    onToggleMockRule?: (id: string, enabled: boolean) => void;

    // Breakpoints (shown when mode = proxy or both)
    breakpoints?: Breakpoint[];
    onUpdateBreakpoints?: (breakpoints: Breakpoint[]) => void;

    // Certificate
    onOpenCertificate?: () => void;
}

const MODE_OPTIONS: { value: ServerMode; label: string; color?: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'mock', label: 'Moxy', color: 'var(--vscode-charts-green)' },
    { value: 'proxy', label: 'Proxy', color: 'var(--vscode-charts-blue)' },
    { value: 'both', label: 'Both', color: 'var(--vscode-charts-purple)' },
];

export const ServerUi: React.FC<ServerUiProps> = ({
    serverConfig,
    isRunning,
    onModeChange,
    onStart,
    onStop,
    onOpenSettings,
    proxyHistory,
    mockHistory,
    onSelectProxyEvent,
    onSelectMockEvent,
    selectedEventId,
    onClearHistory,
    mockRules = [],
    onAddMockRule,
    onDeleteMockRule,
    onToggleMockRule,
    breakpoints = [],
    onUpdateBreakpoints,
    onOpenCertificate,
}) => {
    const totalEvents = proxyHistory.length + mockHistory.length;
    const showMockSection = serverConfig.mode === 'mock' || serverConfig.mode === 'both';
    const showProxySection = serverConfig.mode === 'proxy' || serverConfig.mode === 'both';

    // DEBUG: Diagnose missing sections
    console.log('[ServerUi] Render', {
        mode: serverConfig.mode,
        showMockSection,
        showProxySection,
        hasMockRulesHandler: !!onAddMockRule,
        hasBreakpointHandler: !!onUpdateBreakpoints,
        mockRulesCount: mockRules.length,
        breakpointsCount: breakpoints.length
    });

    // Modal states
    const [ruleModal, setRuleModal] = useState<{ open: boolean, rule?: MockRule | null }>({ open: false });
    const [breakpointModal, setBreakpointModal] = useState<{ open: boolean, bp?: Breakpoint | null }>({ open: false });
    const [showRules, setShowRules] = useState(true);
    const [showBreakpoints, setShowBreakpoints] = useState(true);

    const handleSaveRule = (rule: MockRule) => {
        if (onAddMockRule) {
            onAddMockRule(rule);
        }
    };

    const handleSaveBreakpoint = (bp: Breakpoint) => {
        if (onUpdateBreakpoints) {
            const existing = breakpoints.findIndex(b => b.id === bp.id);
            if (existing >= 0) {
                const updated = [...breakpoints];
                updated[existing] = bp;
                onUpdateBreakpoints(updated);
            } else {
                onUpdateBreakpoints([...breakpoints, bp]);
            }
        }
    };

    const handleCreateMockFromEvent = (e: React.MouseEvent, event: WatcherEvent | MockEvent) => {
        e.stopPropagation();
        if (onAddMockRule) {
            // Normalize event to MockSourceData
            const sourceData = {
                url: event.url || '',
                statusCode: event.status || 200,
                responseBody: 'responseContent' in event ? (event.responseContent || '') : (event.responseBody || ''),
                responseHeaders: event.responseHeaders
            };
            const newRule = createMockRuleFromSource(sourceData);
            onAddMockRule(newRule);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)',
                padding: '5px 10px',
                alignItems: 'center',
                justifyContent: 'space-between'
            }}>
                <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Network size={14} />
                    Server
                    {isRunning && (
                        <span style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: 'var(--vscode-testing-iconPassed)',
                            animation: 'pulse 2s infinite'
                        }} />
                    )}
                </div>
                <HeaderButton onClick={onOpenSettings} title="Server Settings">
                    <Settings size={14} />
                </HeaderButton>
            </div>

            {/* Scrollable Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 10, color: 'var(--vscode-descriptionForeground)' }}>
                {/* Mode Toggle */}
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.8em', marginBottom: 4 }}>Mode</div>
                    <div style={{ display: 'flex', gap: 4, opacity: isRunning ? 0.6 : 1 }}>
                        {MODE_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => !isRunning && onModeChange(opt.value)}
                                disabled={isRunning}
                                title={isRunning ? "Stop the server to change modes" : opt.label}
                                style={{
                                    flex: 1,
                                    padding: '6px 8px',
                                    fontSize: 11,
                                    border: `1px solid ${serverConfig.mode === opt.value ? (opt.color || 'var(--vscode-button-background)') : 'var(--vscode-input-border)'}`,
                                    borderRadius: 4,
                                    background: serverConfig.mode === opt.value
                                        ? (opt.color || 'var(--vscode-button-background)')
                                        : 'transparent',
                                    color: serverConfig.mode === opt.value
                                        ? 'var(--vscode-button-foreground)'
                                        : 'var(--vscode-input-foreground)',
                                    cursor: isRunning ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Status Bar */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    background: 'var(--vscode-editor-inactiveSelectionBackground)',
                    borderRadius: 5,
                    fontSize: '0.85em',
                    marginBottom: 10
                }}>
                    <div>
                        <span style={{ opacity: 0.7 }}>Port:</span> {serverConfig.port}
                        {serverConfig.targetUrl && (
                            <>
                                <span style={{ opacity: 0.5, margin: '0 8px' }}>→</span>
                                <span style={{ opacity: 0.7 }} title={serverConfig.targetUrl}>
                                    {serverConfig.targetUrl.length > 25
                                        ? serverConfig.targetUrl.substring(0, 25) + '...'
                                        : serverConfig.targetUrl}
                                </span>
                            </>
                        )}
                    </div>

                    {serverConfig.mode !== 'off' && (
                        !isRunning ? (
                            <HeaderButton
                                onClick={onStart}
                                style={{ color: 'var(--vscode-testing-iconPassed)', border: '1px solid currentColor', padding: '4px 6px' }}
                                title="Start Server"
                            >
                                <Play size={12} />
                            </HeaderButton>
                        ) : (
                            <HeaderButton
                                onClick={onStop}
                                style={{ color: 'var(--vscode-testing-iconFailed)', border: '1px solid currentColor', padding: '4px 6px' }}
                                title="Stop Server"
                            >
                                <Square size={12} />
                            </HeaderButton>
                        )
                    )}
                    {/* Certificate button for HTTPS targets */}
                    {serverConfig.targetUrl?.toLowerCase().startsWith('https') && onOpenCertificate && (
                        <HeaderButton
                            onClick={onOpenCertificate}
                            title="Install Certificate (Required for HTTPS)"
                            style={{ color: 'var(--vscode-charts-yellow)', marginLeft: 4 }}
                        >
                            <Shield size={14} />
                        </HeaderButton>
                    )}
                </div>

                {/* Mock Rules Section */}
                {showMockSection && onAddMockRule && (
                    <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 10, marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <h4
                                style={{ margin: 0, fontSize: '0.9em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                                onClick={() => setShowRules(!showRules)}
                            >
                                <Radio size={14} />
                                Mock Rules ({mockRules.length})
                            </h4>
                            <HeaderButton onClick={() => setRuleModal({ open: true })} title="Add Mock Rule">
                                <Plus size={14} />
                            </HeaderButton>
                        </div>

                        {showRules && mockRules.length > 0 && (
                            <div style={{ fontSize: '0.85em' }}>
                                {mockRules.map((rule) => (
                                    <div
                                        key={rule.id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            padding: '6px 8px',
                                            marginBottom: 4,
                                            backgroundColor: 'var(--vscode-list-hoverBackground)',
                                            borderRadius: 4,
                                            opacity: rule.enabled ? 1 : 0.5
                                        }}
                                    >
                                        <button
                                            onClick={() => onToggleMockRule?.(rule.id, !rule.enabled)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: rule.enabled ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-disabledForeground)',
                                                padding: 2,
                                                display: 'flex'
                                            }}
                                            title={rule.enabled ? 'Disable' : 'Enable'}
                                        >
                                            {rule.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                        </button>
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {rule.name || 'Unnamed Rule'}
                                            </div>
                                            <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                                                {rule.conditions?.length || 0} condition(s) • {rule.statusCode}
                                            </div>
                                        </div>
                                        <HeaderButton
                                            onClick={() => setRuleModal({ open: true, rule })}
                                            title="Edit"
                                            style={{ padding: 4 }}
                                        >
                                            <Edit2 size={12} />
                                        </HeaderButton>
                                        <HeaderButton
                                            onClick={() => onDeleteMockRule?.(rule.id)}
                                            title="Delete"
                                            style={{ padding: 4, color: 'var(--vscode-testing-iconFailed)' }}
                                        >
                                            <Trash2 size={12} />
                                        </HeaderButton>
                                    </div>
                                ))}
                            </div>
                        )}

                        {showRules && mockRules.length === 0 && (
                            <div style={{ fontSize: '0.8em', opacity: 0.7, textAlign: 'center', padding: 10 }}>
                                No mock rules. Click + to add one.
                            </div>
                        )}
                    </div>
                )}

                {/* Breakpoints Section */}
                {showProxySection && onUpdateBreakpoints && (
                    <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 10, marginBottom: 10 }}>
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
                            <div style={{ fontSize: '0.8em', opacity: 0.7, textAlign: 'center', padding: 10 }}>
                                No breakpoints. Click + to add one.
                            </div>
                        )}
                    </div>
                )}

                {/* Traffic History */}
                <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 10 }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 5
                    }}>
                        <h4 style={{ margin: 0, fontSize: '0.9em' }}>Traffic ({totalEvents})</h4>
                        {totalEvents > 0 && (
                            <HeaderButton onClick={onClearHistory} title="Clear History" style={{ padding: 4 }}>
                                <Trash2 size={14} />
                            </HeaderButton>
                        )}
                    </div>

                    {totalEvents === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            marginTop: 20,
                            fontSize: '0.8em',
                            opacity: 0.7,
                            color: 'var(--vscode-descriptionForeground)'
                        }}>
                            {serverConfig.mode === 'off'
                                ? 'Select a mode and start the server to capture traffic.'
                                : isRunning
                                    ? 'Waiting for requests...'
                                    : 'Start the server to capture traffic.'}
                        </div>
                    ) : (
                        <>
                            {/* Interleave proxy and mock events by timestamp */}
                            {[...proxyHistory.map(e => ({ type: 'proxy' as const, event: e, timestamp: e.timestamp })),
                            ...mockHistory.map(e => ({ type: 'mock' as const, event: e, timestamp: e.timestamp }))]
                                .sort((a, b) => b.timestamp - a.timestamp)
                                .map((item, i) => (
                                    item.type === 'proxy' ? (
                                        <ServiceItem
                                            key={`proxy-${i}`}
                                            style={{
                                                paddingLeft: 5,
                                                paddingRight: 5,
                                                backgroundColor: (item.event as WatcherEvent).id === selectedEventId
                                                    ? 'var(--vscode-list-activeSelectionBackground)'
                                                    : undefined,
                                                color: (item.event as WatcherEvent).id === selectedEventId
                                                    ? 'var(--vscode-list-activeSelectionForeground)'
                                                    : undefined
                                            }}
                                            onClick={() => onSelectProxyEvent(item.event as WatcherEvent)}
                                        >
                                            <div style={{ flex: 1, fontSize: '0.85em', overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 'bold' }}>{(item.event as WatcherEvent).method}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <span style={{ color: 'var(--vscode-charts-blue)', fontSize: '0.8em' }}>PROXY</span>
                                                        <span style={{ opacity: 0.7 }}>{(item.event as WatcherEvent).status}</span>
                                                    </div>
                                                </div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={(item.event as WatcherEvent).url}>
                                                    {(item.event as WatcherEvent).url}
                                                </div>
                                            </div>
                                            {onAddMockRule && (
                                                <button
                                                    onClick={(e) => handleCreateMockFromEvent(e, item.event as WatcherEvent)}
                                                    title="Create Mock Rule"
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        color: 'inherit',
                                                        opacity: (item.event as WatcherEvent).id === selectedEventId ? 1 : 0.5,
                                                        padding: 4,
                                                        display: 'flex',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <PlusSquare size={14} />
                                                </button>
                                            )}
                                        </ServiceItem>
                                    ) : (
                                        <ServiceItem
                                            key={`mock-${i}`}
                                            style={{
                                                paddingLeft: 5,
                                                paddingRight: 5,
                                                backgroundColor: (item.event as MockEvent).id === selectedEventId
                                                    ? 'var(--vscode-list-activeSelectionBackground)'
                                                    : undefined,
                                                color: (item.event as MockEvent).id === selectedEventId
                                                    ? 'var(--vscode-list-activeSelectionForeground)'
                                                    : undefined
                                            }}
                                            onClick={() => onSelectMockEvent(item.event as MockEvent)}
                                        >
                                            <div style={{ flex: 1, fontSize: '0.85em', overflow: 'hidden' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span style={{ fontWeight: 'bold' }}>{(item.event as MockEvent).method}</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        {(item.event as MockEvent).matchedRule && (
                                                            <span style={{ color: 'var(--vscode-charts-green)', fontSize: '0.8em' }}>MOXY</span>
                                                        )}
                                                        {(item.event as MockEvent).passthrough && (
                                                            <span style={{ color: 'var(--vscode-charts-blue)', fontSize: '0.8em', display: 'flex', alignItems: 'center' }}>
                                                                <ArrowRight size={10} /> FWD
                                                            </span>
                                                        )}
                                                        <span style={{ opacity: 0.7 }}>{(item.event as MockEvent).status}</span>
                                                    </div>
                                                </div>
                                                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={(item.event as MockEvent).url}>
                                                    {(item.event as MockEvent).url}
                                                </div>
                                                {(item.event as MockEvent).matchedRule && (
                                                    <div style={{ fontSize: '0.75em', opacity: 0.7, color: 'var(--vscode-charts-green)' }}>
                                                        Rule: {(item.event as MockEvent).matchedRule}
                                                    </div>
                                                )}
                                            </div>
                                            {onAddMockRule && (
                                                <button
                                                    onClick={(e) => handleCreateMockFromEvent(e, item.event as MockEvent)}
                                                    title="Create Mock Rule"
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        color: 'inherit',
                                                        opacity: (item.event as MockEvent).id === selectedEventId ? 1 : 0.5,
                                                        padding: 4,
                                                        display: 'flex',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <PlusSquare size={14} />
                                                </button>
                                            )}
                                        </ServiceItem>
                                    )
                                ))}
                        </>
                    )}
                </div>
            </div>

            {/* Modals */}
            <MockRuleModal
                open={ruleModal.open}
                rule={ruleModal.rule}
                onClose={() => setRuleModal({ open: false })}
                onSave={handleSaveRule}
            />
            <BreakpointModal
                open={breakpointModal.open}
                breakpoint={breakpointModal.bp}
                onClose={() => setBreakpointModal({ open: false })}
                onSave={handleSaveBreakpoint}
            />
        </div>
    );
};
