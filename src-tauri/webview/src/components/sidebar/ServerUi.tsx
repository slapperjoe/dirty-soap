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
import { HeaderButton, ServiceItem, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderActions, SidebarHeaderTitle } from './shared/SidebarStyles';
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
    padding: 8px 16px;
    border-radius: 4px;
    z-index: 1000;
    font-size: 0.85em;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
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
    margin-bottom: 4px;
`;

const ModeOptions = styled.div<{ $disabled: boolean }>`
    display: flex;
    gap: 4px;
    opacity: ${props => props.$disabled ? 0.6 : 1};
`;

const ModeButton = styled.button<{ $active: boolean; $activeColor?: string; $disabled: boolean }>`
    flex: 1;
    padding: 6px 8px;
    font-size: 11px;
    border: 1px solid ${props => props.$active
        ? (props.$activeColor || 'var(--vscode-button-background)')
        : 'var(--vscode-input-border)'};
    border-radius: 4px;
    background: ${props => props.$active
        ? (props.$activeColor || 'var(--vscode-button-background)')
        : 'transparent'};
    color: ${props => props.$active
        ? 'var(--vscode-button-foreground)'
        : 'var(--vscode-input-foreground)'};
    font-weight: ${props => props.$active ? 600 : 500};
    box-shadow: ${props => props.$active
        ? 'inset 0 0 0 1px var(--vscode-focusBorder)'
        : 'inset 0 0 0 0 transparent'};
    cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
    transition: all 0.15s ease;
`;

const StatusBar = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
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
    margin: 0 8px;
`;

const StatusTarget = styled.span`
    opacity: 0.7;
`;

const StartStopButton = styled(HeaderButton)<{ $running: boolean }>`
    color: ${props => props.$running ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconPassed)'};
    border: 1px solid currentColor;
    padding: 4px 6px;
`;

const CertButton = styled(HeaderButton)`
    color: var(--vscode-charts-yellow);
    margin-left: 4px;
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
    margin-bottom: 8px;
`;

const SectionTitle = styled.h4<{ $clickable?: boolean }>`
    margin: 0;
    font-size: 0.9em;
    cursor: ${props => props.$clickable ? 'pointer' : 'default'};
    display: flex;
    align-items: center;
    gap: 5px;
`;

const SectionList = styled.div`
    font-size: 0.85em;
`;

const RuleRow = styled.div<{ $enabled: boolean }>`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    margin-bottom: 4px;
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

const SmallHeaderButton = styled(HeaderButton)`
    padding: 4px;
`;

const SmallDangerButton = styled(SmallHeaderButton)`
    color: var(--vscode-testing-iconFailed);
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
    margin-bottom: 5px;
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
    gap: 4px;
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

const CreateRuleButton = styled.button<{ $selected: boolean }>`
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    opacity: ${props => props.$selected ? 1 : 0.5};
    padding: 4px;
    display: flex;
    align-items: center;
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
                    <HeaderButton onClick={onOpenSettings} title="Server Settings">
                        <Settings size={14} />
                    </HeaderButton>
                </SidebarHeaderActions>
            </SidebarHeader>

            {/* Scrollable Content */}
            <Content>
                {/* Mode Toggle */}
                <ModeSection>
                    <ModeLabel>Mode</ModeLabel>
                    <ModeOptions $disabled={isRunning}>
                        {MODE_OPTIONS.map(opt => (
                            <ModeButton
                                key={opt.value}
                                onClick={() => !isRunning && onModeChange(opt.value)}
                                disabled={isRunning}
                                title={isRunning ? "Stop the server to change modes" : opt.label}
                                $active={serverConfig.mode === opt.value}
                                $activeColor={opt.color}
                                $disabled={isRunning}
                            >
                                {opt.label}
                            </ModeButton>
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
                            <StartStopButton
                                onClick={onStart}
                                title="Start Server"
                                $running={false}
                            >
                                <Play size={12} />
                            </StartStopButton>
                        ) : (
                            <StartStopButton
                                onClick={onStop}
                                title="Stop Server"
                                $running={true}
                            >
                                <Square size={12} />
                            </StartStopButton>
                        )
                    )}
                    {/* Certificate button for HTTPS targets */}
                    {serverConfig.targetUrl?.toLowerCase().startsWith('https') && onOpenCertificate && (
                        <CertButton
                            onClick={onOpenCertificate}
                            title="Install Certificate (Required for HTTPS)"
                        >
                            <Shield size={14} />
                        </CertButton>
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
                            <HeaderButton onClick={() => setRuleModal({ open: true })} title="Add Mock Rule">
                                <Plus size={14} />
                            </HeaderButton>
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
                                        <SmallHeaderButton
                                            onClick={() => setRuleModal({ open: true, rule })}
                                            title="Edit"
                                        >
                                            <Edit2 size={12} />
                                        </SmallHeaderButton>
                                        <SmallDangerButton
                                            onClick={() => onDeleteMockRule?.(rule.id)}
                                            title="Delete"
                                        >
                                            <Trash2 size={12} />
                                        </SmallDangerButton>
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
                            <HeaderButton onClick={() => setBreakpointModal({ open: true })} title="Add Breakpoint">
                                <Plus size={14} />
                            </HeaderButton>
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
                                        <SmallHeaderButton
                                            onClick={() => setBreakpointModal({ open: true, bp })}
                                            title="Edit"
                                        >
                                            <Edit2 size={12} />
                                        </SmallHeaderButton>
                                        <SmallDangerButton
                                            onClick={() => {
                                                const updated = breakpoints.filter((_, idx) => idx !== i);
                                                onUpdateBreakpoints(updated);
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 size={12} />
                                        </SmallDangerButton>
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
                            <Car size={14} />
                            Traffic ({totalEvents})
                        </TrafficTitle>
                        {totalEvents > 0 && (
                            <SmallHeaderButton onClick={onClearHistory} title="Clear History">
                                <Trash2 size={14} />
                            </SmallHeaderButton>
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
                                                <CreateRuleButton
                                                    onClick={(e) => handleCreateMockFromEvent(e, item.event as WatcherEvent)}
                                                    title="Create Mock Rule"
                                                    $selected={(item.event as WatcherEvent).id === selectedEventId}
                                                >
                                                    <PlusSquare size={14} />
                                                </CreateRuleButton>
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
                                                <CreateRuleButton
                                                    onClick={(e) => handleCreateMockFromEvent(e, item.event as MockEvent)}
                                                    title="Create Mock Rule"
                                                    $selected={(item.event as MockEvent).id === selectedEventId}
                                                >
                                                    <PlusSquare size={14} />
                                                </CreateRuleButton>
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
