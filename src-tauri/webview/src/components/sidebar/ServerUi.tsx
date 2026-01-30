/**
 * ServerUi.tsx
 * 
 * Unified server sidebar component with mode toggle, mock rules, breakpoints, and combined traffic history.
 * Replaces separate Proxy and Mock tabs.
 */

import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { Play, Square, Trash2, Settings, ArrowRight, Plus, Edit2, ToggleLeft, ToggleRight, Radio, Bug, PlusSquare, Shield, Car } from 'lucide-react';
import { WatcherEvent, MockEvent, ServerMode, ServerConfig, MockRule } from '@shared/models';
import { ServiceItem, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderActions, SidebarHeaderTitle } from './shared/SidebarStyles';
import { MockRuleModal } from '../modals/MockRuleModal';
import { BreakpointModal, Breakpoint } from '../modals/BreakpointModal';
import { createMockRuleFromSource } from '../../utils/mockUtils';
import { IconButton, ToggleButton, RunButton, StopButton } from '../common/Button';
import { SPACING_XS, SPACING_SM, SPACING_MD, SPACING_LG } from '../../styles/spacing';

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

const Content = styled(SidebarContent)`
    color: var(--vscode-descriptionForeground);
`;

const fadeIn = keyframes`
    from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
    to { opacity: 1; transform: translateX(-50%) translateY(0); }
`;

const pulse = keyframes`
    0% { transform: scale(1); opacity: 0.6; }
    50% { transform: scale(1.15); opacity: 1; }
    100% { transform: scale(1); opacity: 0.6; }
`;

const NotificationToast = styled.div`
    position: absolute;
    top: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--vscode-notificationsInfoIcon-foreground);
    color: white;
    padding: ${SPACING_SM} ${SPACING_LG};
    border-radius: 4px;
    z-index: 1000;
    font-size: 0.85em;
    box-shadow: 0 4px 10px rgba(0,0,0,0.3);
    animation: ${fadeIn} 0.2s ease;
`;

const StatusDot = styled.span`
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--vscode-testing-iconPassed);
    animation: ${pulse} 2s infinite;
`;

const ModeSection = styled.div`
    margin-bottom: 10px;
`;

const ModeLabel = styled.div`
    font-size: 0.8em;
    margin-bottom: ${SPACING_XS};
`;

const ModeOptions = styled.div<{ $disabled: boolean }>`
    display: flex;
    gap: ${SPACING_XS};
    opacity: ${props => props.$disabled ? 0.6 : 1};
`;

const StatusBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: ${SPACING_SM} 10px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 5px;
    font-size: 0.85em;
    margin-bottom: 10px;
`;

const StatusLabel = styled.span`
    opacity: 0.7;
`;

const StatusArrow = styled.span`
    opacity: 0.5;
    margin: 0 ${SPACING_SM};
`;

const StatusTarget = styled.span`
    opacity: 0.7;
`;

const Section = styled.div`
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 10px;
    margin-bottom: 10px;
`;

const SectionHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: ${SPACING_SM};
`;

const SectionTitle = styled.h4<{ $clickable?: boolean }>`
    margin: 0;
    font-size: 0.9em;
    cursor: ${props => props.$clickable ? 'pointer' : 'default'};
    display: flex;
    align-items: center;
    gap: ${SPACING_XS};
`;

const SectionList = styled.div`
    font-size: 0.85em;
`;

const RuleRow = styled.div<{ $enabled: boolean }>`
    display: flex;
    align-items: center;
    gap: ${SPACING_XS};
    padding: ${SPACING_XS} ${SPACING_SM};
    margin-bottom: ${SPACING_XS};
    background-color: var(--vscode-list-hoverBackground);
    border-radius: 4px;
    opacity: ${props => props.$enabled ? 1 : 0.5};
`;

const RuleToggle = styled.button<{ $enabled: boolean }>`
    background: none;
    border: none;
    cursor: pointer;
    color: ${props => props.$enabled ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-disabledForeground)'};
    padding: 2px;
    display: flex;
`;

const RuleInfo = styled.div`
    flex: 1;
    overflow: hidden;
`;

const RuleName = styled.div`
    font-weight: bold;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const RuleMeta = styled.div`
    font-size: 0.8em;
    opacity: 0.7;
`;

const EmptySection = styled.div`
    font-size: 0.8em;
    opacity: 0.7;
    text-align: center;
    padding: 10px;
`;

const TrafficSection = styled.div`
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 10px;
`;

const TrafficHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: ${SPACING_XS};
`;

const TrafficTitle = styled.h4`
    margin: 0;
    font-size: 0.9em;
`;

const EmptyTraffic = styled.div`
    text-align: center;
    margin-top: 20px;
    font-size: 0.8em;
    opacity: 0.7;
    color: var(--vscode-descriptionForeground);
`;

const TrafficItem = styled(ServiceItem)<{ $selected: boolean }>`
    padding-left: 5px;
    padding-right: 5px;
    background-color: ${props => props.$selected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.$selected ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'};
`;

const TrafficContent = styled.div`
    flex: 1;
    font-size: 0.85em;
    overflow: hidden;
`;

const TrafficRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const TrafficMethod = styled.span`
    font-weight: bold;
`;

const TrafficMeta = styled.div`
    display: flex;
    align-items: center;
    gap: ${SPACING_XS};
`;

const ProxyBadge = styled.span`
    color: var(--vscode-charts-blue);
    font-size: 0.8em;
`;

const MoxyBadge = styled.span`
    color: var(--vscode-charts-green);
    font-size: 0.8em;
`;

const ForwardBadge = styled.span`
    color: var(--vscode-charts-blue);
    font-size: 0.8em;
    display: flex;
    align-items: center;
`;

const TrafficStatus = styled.span`
    opacity: 0.7;
`;

const TrafficUrl = styled.div`
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const RuleBadge = styled.div`
    font-size: 0.75em;
    opacity: 0.7;
    color: var(--vscode-charts-green);
`;

const MODE_OPTIONS: { value: ServerMode; label: string; color?: string }[] = [
    { value: 'off', label: 'Off' },
    { value: 'mock', label: 'Moxy', color: 'var(--vscode-charts-green, var(--vscode-button-background))' },
    { value: 'proxy', label: 'Proxy', color: 'var(--vscode-charts-orange, var(--vscode-button-background))' },
    { value: 'both', label: 'Both', color: 'var(--vscode-charts-purple, var(--vscode-button-background))' },
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
    const [notification, setNotification] = useState<string | null>(null);

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
                responseHeaders: event.responseHeaders,
                // Include request body for SOAP operation name extraction
                requestBody: 'requestContent' in event ? (event.requestContent || '') : (event.requestBody || '')
            };
            const newRule = createMockRuleFromSource(sourceData);
            onAddMockRule(newRule);

            // Show notification
            setNotification(`Mock rule added: ${newRule.name}`);
            setTimeout(() => setNotification(null), 3000);
        }
    };

    return (
        <SidebarContainer>
            {/* Notification Toast */}
            {notification && (
                <NotificationToast>
                    {notification}
                </NotificationToast>
            )}
            {/* Header */}
            <SidebarHeader>
                <SidebarHeaderTitle>
                    Server
                    {isRunning && <StatusDot />}
                </SidebarHeaderTitle>
                <SidebarHeaderActions>
                    <IconButton onClick={onOpenSettings} title="Server Settings">
                        <Settings size={14} />
                    </IconButton>
                </SidebarHeaderActions>
            </SidebarHeader>

            {/* Scrollable Content */}
            <Content>
                {/* Mode Toggle */}
                <ModeSection>
                    <ModeLabel>Mode</ModeLabel>
                    <ModeOptions $disabled={isRunning}>
                        {MODE_OPTIONS.map(opt => (
                            <ToggleButton
                                key={opt.value}
                                onClick={() => !isRunning && onModeChange(opt.value)}
                                disabled={isRunning}
                                title={isRunning ? "Stop the server to change modes" : opt.label}
                                $active={serverConfig.mode === opt.value}
                                $activeColor={opt.color}
                            >
                                {opt.label}
                            </ToggleButton>
                        ))}
                    </ModeOptions>
                </ModeSection>

                {/* Status Bar */}
                <StatusBar>
                    <div>
                        <StatusLabel>Port:</StatusLabel> {serverConfig.port}
                        {serverConfig.targetUrl && (
                            <>
                                <StatusArrow>→</StatusArrow>
                                <StatusTarget title={serverConfig.targetUrl}>
                                    {serverConfig.targetUrl.length > 25
                                        ? serverConfig.targetUrl.substring(0, 25) + '...'
                                        : serverConfig.targetUrl}
                                </StatusTarget>
                            </>
                        )}
                    </div>

                    {serverConfig.mode !== 'off' && (
                        !isRunning ? (
                            <RunButton
                                onClick={onStart}
                                title="Start Server"
                                style={{ border: '1px solid currentColor', padding: '4px 6px' }}
                            >
                                <Play size={12} />
                            </RunButton>
                        ) : (
                            <StopButton
                                onClick={onStop}
                                title="Stop Server"
                                style={{ border: '1px solid currentColor', padding: '4px 6px' }}
                            >
                                <Square size={12} />
                            </StopButton>
                        )
                    )}
                    {/* Certificate button for HTTPS targets */}
                    {serverConfig.targetUrl?.toLowerCase().startsWith('https') && onOpenCertificate && (
                        <IconButton
                            onClick={onOpenCertificate}
                            title="Install Certificate (Required for HTTPS)"
                            style={{ color: 'var(--vscode-charts-yellow)', marginLeft: '4px' }}
                        >
                            <Shield size={14} />
                        </IconButton>
                    )}
                </StatusBar>

                {/* Mock Rules Section */}
                {showMockSection && onAddMockRule && (
                    <Section>
                        <SectionHeader>
                            <SectionTitle $clickable onClick={() => setShowRules(!showRules)}>
                                <Radio size={14} />
                                Mock Rules ({mockRules.length})
                            </SectionTitle>
                            <IconButton onClick={() => setRuleModal({ open: true })} title="Add Mock Rule">
                                <Plus size={14} />
                            </IconButton>
                        </SectionHeader>

                        {showRules && mockRules.length > 0 && (
                            <SectionList>
                                {mockRules.map((rule) => (
                                    <RuleRow key={rule.id} $enabled={rule.enabled}>
                                        <RuleToggle
                                            onClick={() => onToggleMockRule?.(rule.id, !rule.enabled)}
                                            $enabled={rule.enabled}
                                            title={rule.enabled ? 'Disable' : 'Enable'}
                                        >
                                            {rule.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                        </RuleToggle>
                                        <RuleInfo>
                                            <RuleName>{rule.name || 'Unnamed Rule'}</RuleName>
                                            <RuleMeta>
                                                {rule.conditions?.length || 0} condition(s) • {rule.statusCode}
                                            </RuleMeta>
                                        </RuleInfo>
                                        <IconButton
                                            onClick={() => setRuleModal({ open: true, rule })}
                                            title="Edit"
                                        >
                                            <Edit2 size={12} />
                                        </IconButton>
                                        <IconButton
                                            onClick={() => onDeleteMockRule?.(rule.id)}
                                            title="Delete"
                                            $danger
                                        >
                                            <Trash2 size={12} />
                                        </IconButton>
                                    </RuleRow>
                                ))}
                            </SectionList>
                        )}

                        {showRules && mockRules.length === 0 && (
                            <EmptySection>
                                No mock rules. Click + to add one.
                            </EmptySection>
                        )}
                    </Section>
                )}

                {/* Breakpoints Section */}
                {showProxySection && onUpdateBreakpoints && (
                    <Section>
                        <SectionHeader>
                            <SectionTitle $clickable onClick={() => setShowBreakpoints(!showBreakpoints)}>
                                <Bug size={14} />
                                Breakpoints ({breakpoints.length})
                            </SectionTitle>
                            <IconButton onClick={() => setBreakpointModal({ open: true })} title="Add Breakpoint">
                                <Plus size={14} />
                            </IconButton>
                        </SectionHeader>

                        {showBreakpoints && breakpoints.length > 0 && (
                            <SectionList>
                                {breakpoints.map((bp, i) => (
                                    <RuleRow key={bp.id} $enabled={bp.enabled}>
                                        <RuleToggle
                                            onClick={() => {
                                                const updated = breakpoints.map((b, idx) =>
                                                    idx === i ? { ...b, enabled: !b.enabled } : b
                                                );
                                                onUpdateBreakpoints(updated);
                                            }}
                                            $enabled={bp.enabled}
                                            title={bp.enabled ? 'Disable' : 'Enable'}
                                        >
                                            {bp.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                        </RuleToggle>
                                        <RuleInfo>
                                            <RuleName>{bp.name || bp.pattern}</RuleName>
                                            <RuleMeta>
                                                {bp.target} • {bp.matchOn}{bp.isRegex ? ' (regex)' : ''}
                                            </RuleMeta>
                                        </RuleInfo>
                                        <IconButton
                                            onClick={() => setBreakpointModal({ open: true, bp })}
                                            title="Edit"
                                        >
                                            <Edit2 size={12} />
                                        </IconButton>
                                        <IconButton
                                            onClick={() => {
                                                const updated = breakpoints.filter((_, idx) => idx !== i);
                                                onUpdateBreakpoints(updated);
                                            }}
                                            title="Delete"
                                            $danger
                                        >
                                            <Trash2 size={12} />
                                        </IconButton>
                                    </RuleRow>
                                ))}
                            </SectionList>
                        )}

                        {showBreakpoints && breakpoints.length === 0 && (
                            <EmptySection>
                                No breakpoints. Click + to add one.
                            </EmptySection>
                        )}
                    </Section>
                )}

                {/* Traffic History */}
                <TrafficSection>
                    <TrafficHeader>
                        <TrafficTitle>
                            <Car size={14} style={{ marginRight: 6 }} />
                            Traffic ({totalEvents})
                        </TrafficTitle>
                        {totalEvents > 0 && (
                            <IconButton onClick={onClearHistory} title="Clear History">
                                <Trash2 size={14} />
                            </IconButton>
                        )}
                    </TrafficHeader>

                    {totalEvents === 0 ? (
                        <EmptyTraffic>
                            {serverConfig.mode === 'off'
                                ? 'Select a mode and start the server to capture traffic.'
                                : isRunning
                                    ? 'Waiting for requests...'
                                    : 'Start the server to capture traffic.'}
                        </EmptyTraffic>
                    ) : (
                        <>
                            {/* Interleave proxy and mock events by timestamp */}
                            {[...proxyHistory.map(e => ({ type: 'proxy' as const, event: e, timestamp: e.timestamp })),
                            ...mockHistory.map(e => ({ type: 'mock' as const, event: e, timestamp: e.timestamp }))]
                                .sort((a, b) => b.timestamp - a.timestamp)
                                .map((item, i) => (
                                    item.type === 'proxy' ? (
                                        <TrafficItem
                                            key={`proxy-${i}`}
                                            $selected={(item.event as WatcherEvent).id === selectedEventId}
                                            onClick={() => onSelectProxyEvent(item.event as WatcherEvent)}
                                        >
                                            <TrafficContent>
                                                <TrafficRow>
                                                    <TrafficMethod>{(item.event as WatcherEvent).method}</TrafficMethod>
                                                    <TrafficMeta>
                                                        <ProxyBadge>PROXY</ProxyBadge>
                                                        <TrafficStatus>{(item.event as WatcherEvent).status}</TrafficStatus>
                                                    </TrafficMeta>
                                                </TrafficRow>
                                                <TrafficUrl title={(item.event as WatcherEvent).url}>
                                                    {(item.event as WatcherEvent).url}
                                                </TrafficUrl>
                                            </TrafficContent>
                                            {onAddMockRule && (
                                                <IconButton
                                                    onClick={(e) => handleCreateMockFromEvent(e, item.event as WatcherEvent)}
                                                    title="Create Mock Rule"
                                                    style={{ opacity: (item.event as WatcherEvent).id === selectedEventId ? 1 : 0.5 }}
                                                >
                                                    <PlusSquare size={14} />
                                                </IconButton>
                                            )}
                                        </TrafficItem>
                                    ) : (
                                        <TrafficItem
                                            key={`mock-${i}`}
                                            $selected={(item.event as MockEvent).id === selectedEventId}
                                            onClick={() => onSelectMockEvent(item.event as MockEvent)}
                                        >
                                            <TrafficContent>
                                                <TrafficRow>
                                                    <TrafficMethod>{(item.event as MockEvent).method}</TrafficMethod>
                                                    <TrafficMeta>
                                                        {(item.event as MockEvent).matchedRule && (
                                                            <MoxyBadge>MOXY</MoxyBadge>
                                                        )}
                                                        {(item.event as MockEvent).passthrough && (
                                                            <ForwardBadge>
                                                                <ArrowRight size={10} /> FWD
                                                            </ForwardBadge>
                                                        )}
                                                        <TrafficStatus>{(item.event as MockEvent).status}</TrafficStatus>
                                                    </TrafficMeta>
                                                </TrafficRow>
                                                <TrafficUrl title={(item.event as MockEvent).url}>
                                                    {(item.event as MockEvent).url}
                                                </TrafficUrl>
                                                {(item.event as MockEvent).matchedRule && (
                                                    <RuleBadge>
                                                        Rule: {(item.event as MockEvent).matchedRule}
                                                    </RuleBadge>
                                                )}
                                            </TrafficContent>
                                            {onAddMockRule && (
                                                <IconButton
                                                    onClick={(e) => handleCreateMockFromEvent(e, item.event as MockEvent)}
                                                    title="Create Mock Rule"
                                                    style={{ opacity: (item.event as MockEvent).id === selectedEventId ? 1 : 0.5 }}
                                                >
                                                    <PlusSquare size={14} />
                                                </IconButton>
                                            )}
                                        </TrafficItem>
                                    )
                                ))}
                        </>
                    )}
                </TrafficSection>
            </Content>

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
        </SidebarContainer>
    );
};
