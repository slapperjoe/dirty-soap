import React from 'react';
import styled from 'styled-components';
import { Clock, Play, Square, Trash2, Download } from 'lucide-react';
import { WatcherEvent } from '@shared/models';
import { ServiceItem, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderActions, SidebarHeaderTitle } from './shared/SidebarStyles';
import { HeaderButton } from '../common/Button';
import { exportWatcherEvents } from '../../utils/csvExport';
import { EmptyState } from '../common/EmptyState';
import { SPACING_XS } from '../../styles/spacing';

interface WatcherPanelProps {
    history: WatcherEvent[];
    isRunning: boolean;
    onStart: () => void;
    onStop: () => void;
    onClear: () => void;
    onSelectEvent: (event: WatcherEvent) => void;
}

const EventContent = styled.div`
    flex: 1;
    min-width: 0;
`;

const EventTitle = styled.div`
    font-weight: bold;
`;

const EventMeta = styled.div`
    font-size: 0.8em;
    color: var(--apinox-descriptionForeground);
`;

const EventIcon = styled(Clock)`
    margin-right: ${SPACING_XS};
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
                    <HeaderButton
                        onClick={(e) => { e.stopPropagation(); if (isRunning) onStop(); else onStart(); }}
                        title={isRunning ? "Stop Watcher" : "Start Watcher"}
                        style={{ color: isRunning ? 'var(--apinox-testing-iconFailed)' : 'var(--apinox-testing-iconPassed)' }}
                    >
                        {isRunning ? <Square size={14} /> : <Play size={14} />}
                    </HeaderButton>
                    <HeaderButton
                        onClick={(e) => { e.stopPropagation(); handleExport(); }}
                        title="Export to CSV"
                        disabled={history.length === 0}
                        style={{ opacity: history.length === 0 ? 0.5 : 1 }}
                    >
                        <Download size={14} />
                    </HeaderButton>
                    <HeaderButton onClick={(e) => { e.stopPropagation(); onClear(); }} title="Clear History">
                        <Trash2 size={14} />
                    </HeaderButton>
                </SidebarHeaderActions>
            </SidebarHeader>

            {/* List */}
            <SidebarContent>
                {history.length === 0 ? (
                    <EmptyState icon={Clock} title={isRunning ? "Watching for events..." : "Watcher stopped"} description={isRunning ? "Waiting for file changes." : "Press Play to begin."} />
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
