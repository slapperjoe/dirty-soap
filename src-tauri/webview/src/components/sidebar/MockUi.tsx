/* eslint-disable react/no-inline-styles, react/jsx-no-inline-styles */
import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Square, Trash2, Plus, Edit2, ToggleLeft, ToggleRight, Radio, ArrowRight, Circle } from 'lucide-react';
import { MockConfig, MockRule, MockEvent } from '@shared/models';
import { HeaderButton, ServiceItem, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderTitle } from './shared/SidebarStyles';
import { MockRuleModal } from '../modals/MockRuleModal';

interface MockUiProps {
    isRunning: boolean;
    config: MockConfig;
    history: MockEvent[];
    onStart: () => void;
    onStop: () => void;
    onUpdateConfig: (config: Partial<MockConfig>) => void;
    onClear: () => void;
    onSelectEvent: (event: MockEvent) => void;

    // Rule management
    rules: MockRule[];
    onAddRule: (rule: MockRule) => void;
    onUpdateRule: (id: string, updates: Partial<MockRule>) => void;
    onDeleteRule: (id: string) => void;
    onToggleRule: (id: string, enabled: boolean) => void;
    onEditRule?: (rule: MockRule) => void;
}

const Content = styled(SidebarContent)`
    color: var(--vscode-descriptionForeground);
`;

const DEFAULT_CONFIG: MockConfig = {
    enabled: false,
    port: 9001,
    targetUrl: 'http://localhost:8080',
    rules: [],
    passthroughEnabled: true,
    routeThroughProxy: false
};

export const MockUi: React.FC<MockUiProps> = ({
    isRunning,
    config = DEFAULT_CONFIG,
    history,
    onStart,
    onStop,
    onUpdateConfig,
    onClear,
    onSelectEvent,
    rules,
    onAddRule,
    onDeleteRule,
    onToggleRule
}) => {
    const [showRules, setShowRules] = useState(true);
    const [ruleModal, setRuleModal] = useState<{ open: boolean, rule?: MockRule | null }>({ open: false });

    const handleAddRule = () => {
        setRuleModal({ open: true, rule: null });
    };

    const handleEditRule = (rule: MockRule) => {
        setRuleModal({ open: true, rule });
    };

    const handleSaveRule = (rule: MockRule) => {
        // Check if it's an update or new rule
        const existing = rules.find(r => r.id === rule.id);
        if (existing) {
            onAddRule(rule); // Will update via command
        } else {
            onAddRule(rule);
        }
    };

    return (
        <SidebarContainer>
            <SidebarHeader>
                <SidebarHeaderTitle>
                    <Radio size={14} />
                    Dirty Moxy
                </SidebarHeaderTitle>
            </SidebarHeader>

            <Content>
                {/* Controls */}
                <div style={{ marginBottom: 15, padding: 10, backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 5 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.8em', marginBottom: 2 }}>Port</label>
                            <div style={{ display: 'flex', alignItems: 'center', background: 'var(--vscode-input-background)', border: '1px solid var(--vscode-input-border)' }}>
                                <div
                                    onClick={() => onUpdateConfig({ port: Math.max(1, (config.port || 9001) - 1) })}
                                    style={{ padding: '4px 8px', cursor: 'pointer', borderRight: '1px solid var(--vscode-input-border)', userSelect: 'none' }}
                                >-</div>
                                <input
                                    type="number"
                                    className="vscode-input"
                                    value={config.port}
                                    onChange={(e) => onUpdateConfig({ port: parseInt(e.target.value) || 9001 })}
                                    style={{
                                        flex: 1,
                                        width: '50px',
                                        padding: '4px',
                                        background: 'transparent',
                                        color: 'var(--vscode-input-foreground)',
                                        border: 'none',
                                        textAlign: 'center',
                                        appearance: 'textfield',
                                    }}
                                />
                                <div
                                    onClick={() => onUpdateConfig({ port: (config.port || 9001) + 1 })}
                                    style={{ padding: '4px 8px', cursor: 'pointer', borderLeft: '1px solid var(--vscode-input-border)', userSelect: 'none' }}
                                >+</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', paddingBottom: 1 }}>
                            {!isRunning ? (
                                <HeaderButton onClick={onStart} style={{ color: 'var(--vscode-testing-iconPassed)', border: '1px solid currentColor', padding: '5px 8px', height: '28px' }} title="Start Dirty Moxy"><Play size={14} /></HeaderButton>
                            ) : (
                                <HeaderButton onClick={onStop} style={{ color: 'var(--vscode-testing-iconFailed)', border: '1px solid currentColor', padding: '5px 8px', height: '28px' }} title="Stop Dirty Moxy"><Square size={14} /></HeaderButton>
                            )}
                        </div>
                    </div>

                    <div style={{ marginBottom: 5 }}>
                        <label style={{ display: 'block', fontSize: '0.8em', marginBottom: 2 }}>Target URL (Passthrough)</label>
                        <input
                            type="text"
                            className="vscode-input"
                            value={config.targetUrl}
                            onChange={(e) => onUpdateConfig({ targetUrl: e.target.value })}
                            placeholder="http://localhost:8080"
                            style={{ width: '100%', padding: '4px', background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
                        />
                    </div>

                    <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            id="chkPassthrough"
                            checked={config.passthroughEnabled !== false}
                            onChange={e => onUpdateConfig({ passthroughEnabled: e.target.checked })}
                            style={{
                                marginRight: 6,
                                accentColor: 'var(--vscode-button-background)',
                                width: '14px',
                                height: '14px',
                                cursor: 'pointer'
                            }}
                        />
                        <label htmlFor="chkPassthrough" style={{ fontSize: '0.8em', cursor: 'pointer', userSelect: 'none' }} title="Forward unmatched requests to target URL">
                            Forward unmatched requests
                        </label>
                    </div>

                    {config.passthroughEnabled && (
                        <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center', paddingLeft: 20 }}>
                            <input
                                type="checkbox"
                                id="chkRouteProxy"
                                checked={config.routeThroughProxy === true}
                                onChange={e => onUpdateConfig({ routeThroughProxy: e.target.checked })}
                                style={{
                                    marginRight: 6,
                                    accentColor: 'var(--vscode-button-background)',
                                    width: '14px',
                                    height: '14px',
                                    cursor: 'pointer'
                                }}
                            />
                            <label htmlFor="chkRouteProxy" style={{ fontSize: '0.8em', cursor: 'pointer', userSelect: 'none' }} title="Route passthrough traffic through Dirty Proxy instead of directly to target">
                                Route through Dirty Proxy
                            </label>
                        </div>
                    )}

                    <div style={{ marginBottom: 5, display: 'flex', alignItems: 'center' }}>
                        <input
                            type="checkbox"
                            id="chkRecordMode"
                            checked={config.recordMode === true}
                            onChange={e => onUpdateConfig({ recordMode: e.target.checked })}
                            style={{
                                marginRight: 6,
                                accentColor: 'var(--vscode-charts-yellow)',
                                width: '14px',
                                height: '14px',
                                cursor: 'pointer'
                            }}
                        />
                        <label htmlFor="chkRecordMode" style={{ fontSize: '0.8em', cursor: 'pointer', userSelect: 'none', color: config.recordMode ? 'var(--vscode-charts-yellow)' : undefined }} title="Auto-capture real responses as mock rules">
                            🔴 Record Mode
                        </label>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                        <div style={{ fontSize: '0.8em' }}>Status: {isRunning ? <span style={{ color: 'var(--vscode-testing-iconPassed)' }}>Running</span> : 'Stopped'}</div>
                    </div>
                </div>

                {/* Mock Rules Section */}
                <div style={{ borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 10, marginTop: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <h4
                            style={{ margin: 0, fontSize: '0.9em', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                            onClick={() => setShowRules(!showRules)}
                        >
                            <Circle size={14} />
                            Mock Rules ({rules.length})
                        </h4>
                        <HeaderButton onClick={handleAddRule} title="Add Mock Rule">
                            <Plus size={14} />
                        </HeaderButton>
                    </div>

                    {showRules && rules.length > 0 && (
                        <div style={{ fontSize: '0.85em' }}>
                            {rules.map((rule) => (
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
                                        onClick={() => onToggleRule(rule.id, !rule.enabled)}
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
                                        <div style={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {rule.name}
                                            {rule.hitCount && rule.hitCount > 0 && (
                                                <span style={{ fontSize: '0.8em', opacity: 0.7 }}>({rule.hitCount})</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                                            {rule.conditions.map(c => `${c.type}: ${c.pattern.substring(0, 20)}${c.pattern.length > 20 ? '...' : ''}`).join(' & ')}
                                        </div>
                                    </div>
                                    <HeaderButton
                                        onClick={() => handleEditRule(rule)}
                                        title="Edit"
                                        style={{ padding: 4 }}
                                    >
                                        <Edit2 size={12} />
                                    </HeaderButton>
                                    <HeaderButton
                                        onClick={() => onDeleteRule(rule.id)}
                                        title="Delete"
                                        style={{ padding: 4, color: 'var(--vscode-testing-iconFailed)' }}
                                    >
                                        <Trash2 size={12} />
                                    </HeaderButton>
                                </div>
                            ))}
                        </div>
                    )}

                    {showRules && rules.length === 0 && (
                        <div style={{ textAlign: 'center', fontSize: '0.8em', opacity: 0.7, padding: '10px 0' }}>
                            No mock rules configured.
                            <br />
                            <span style={{ color: 'var(--vscode-textLink-foreground)', cursor: 'pointer' }} onClick={handleAddRule}>
                                Click + to add one.
                            </span>
                        </div>
                    )}
                </div>

                {/* Traffic Log */}
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
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 'bold' }}>{event.method}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            {event.matchedRule && (
                                                <span style={{ color: 'var(--vscode-charts-green)', fontSize: '0.8em' }}>MOXY</span>
                                            )}
                                            {event.passthrough && (
                                                <span style={{ color: 'var(--vscode-charts-blue)', fontSize: '0.8em', display: 'flex', alignItems: 'center' }}>
                                                    <ArrowRight size={10} /> FWD
                                                </span>
                                            )}
                                            <span style={{ opacity: 0.7 }}>{event.status}</span>
                                        </div>
                                    </div>
                                    <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={event.url}>{event.url}</div>
                                    {event.matchedRule && (
                                        <div style={{ fontSize: '0.75em', opacity: 0.7, color: 'var(--vscode-charts-green)' }}>
                                            Rule: {event.matchedRule}
                                        </div>
                                    )}
                                </div>
                            </ServiceItem>
                        ))
                    )}
                </div>
            </Content>

            {/* Mock Rule Modal */}
            <MockRuleModal
                open={ruleModal.open}
                rule={ruleModal.rule}
                onClose={() => setRuleModal({ open: false })}
                onSave={handleSaveRule}
            />
        </SidebarContainer>
    );
};
