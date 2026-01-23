import React from 'react';
import styled from 'styled-components';
import { Clock, Play, Square, Trash2, Download } from 'lucide-react';
import { WatcherEvent } from '@shared/models';
import { HeaderButton, ServiceItem, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderActions, SidebarHeaderTitle } from './shared/SidebarStyles';
import { exportWatcherEvents } from '../../utils/csvExport';

interface WatcherPanelProps {
    history: WatcherEvent[];
    isRunning: boolean;
    onStart: () => void;
    onStop: () => void;
    onClear: () => void;
    onSelectEvent: (event: WatcherEvent) => void;
}

const EmptyMessage = styled.div`
    color: var(--vscode-descriptionForeground);
    text-align: center;
    margin-top: 20px;
`;

const EventContent = styled.div`
    flex: 1;
    min-width: 0;
`;

const EventTitle = styled.div`
    font-weight: bold;
`;

const EventMeta = styled.div`
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
`;

const ToggleButton = styled(HeaderButton)<{ $running: boolean }>`
    color: ${props => props.$running ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconPassed)'};
`;

const ExportButton = styled(HeaderButton)<{ $disabled: boolean }>`
    opacity: ${props => props.$disabled ? 0.5 : 1};
`;

const EventIcon = styled(Clock)`
    margin-right: 5px;
`;

export const WatcherPanel: React.FC<WatcherPanelProps> = ({
    history,
    isRunning,
    onStart,
    onStop,
    onClear,
    onSelectEvent
}) => {
    const handleExport = () => {
        if (history.length === 0) return;
        const exportData = history.map(e => ({
            id: e.id,
            timestamp: e.timestamp || Date.now(),
            type: e.responseContent ? 'request_response' : 'request',
            method: 'SOAP',
            url: e.requestOperation || 'Unknown',
            status: e.responseContent ? 200 : undefined,
            duration: undefined
        }));
        exportWatcherEvents(exportData);
    };

    return (
        <SidebarContainer>
            {/* Header */}
            <SidebarHeader>
                <SidebarHeaderTitle>File Watcher</SidebarHeaderTitle>
                <SidebarHeaderActions>
                    <ToggleButton
                        onClick={(e) => { e.stopPropagation(); if (isRunning) onStop(); else onStart(); }}
                        title={isRunning ? "Stop Watcher" : "Start Watcher"}
                        $running={isRunning}
                    >
                        {isRunning ? <Square size={14} /> : <Play size={14} />}
                    </ToggleButton>
                    <ExportButton
                        onClick={(e) => { e.stopPropagation(); handleExport(); }}
                        title="Export to CSV"
                        $disabled={history.length === 0}
                        disabled={history.length === 0}
                    >
                        <Download size={14} />
                    </ExportButton>
                    <HeaderButton onClick={(e) => { e.stopPropagation(); onClear(); }} title="Clear History">
                        <Trash2 size={14} />
                    </HeaderButton>
                </SidebarHeaderActions>
            </SidebarHeader>

            {/* List */}
            <SidebarContent>
                {history.length === 0 ? (
                    <EmptyMessage>
                        {isRunning ? (
                            <>
                                Watching C:\temp\requestXML.xml...<br />Waiting for events.
                            </>
                        ) : (
                            <>
                                Watcher is stopped.<br />Press Play to begin.
                            </>
                        )}
                    </EmptyMessage>
                ) : (
                    history.map(event => (
                        <ServiceItem key={event.id} onClick={() => onSelectEvent(event)}>
                            <EventIcon size={14} />
                            <EventContent>
                                <EventTitle>
                                    {(() => {
                                        const reqOp = event.requestOperation || 'Unknown';
                                        const resOp = event.responseOperation;
                                        if (!resOp) return reqOp;
                                        const reqBase = reqOp.replace(/Request$/, '');
                                        const resBase = resOp.replace(/Response$/, '');
                                        if (reqBase === resBase) return reqBase;
                                        return `${reqOp} - ${resOp} `;
                                    })()}
                                </EventTitle>
                                <EventMeta>{event.timestampLabel}</EventMeta>
                                <EventMeta>
                                    {event.responseContent ? 'Request & Response' : 'Request Pending...'}
                                </EventMeta>
                            </EventContent>
                        </ServiceItem>
                    ))
                )}
            </SidebarContent>
        </SidebarContainer>
    );
};
