import React from 'react';
import { Clock, Play, Square, Trash2, Download } from 'lucide-react';
import { WatcherEvent } from '../../models';
import { HeaderButton, ServiceItem } from './shared/SidebarStyles';
import { exportWatcherEvents } from '../../utils/csvExport';

export interface WatcherPanelProps {
    history: WatcherEvent[];
    isRunning: boolean;
    onStart: () => void;
    onStop: () => void;
    onClear: () => void;
    onSelectEvent: (event: WatcherEvent) => void;
}

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
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)', padding: '5px 10px', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 'bold' }}>File Watcher</div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <HeaderButton
                        onClick={(e) => { e.stopPropagation(); if (isRunning) onStop(); else onStart(); }}
                        title={isRunning ? "Stop Watcher" : "Start Watcher"}
                        style={{ color: isRunning ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-testing-iconPassed)' }}
                    >
                        {isRunning ? <Square size={14} /> : <Play size={14} />}
                    </HeaderButton>
                    <HeaderButton
                        onClick={(e) => { e.stopPropagation(); handleExport(); }}
                        title="Export to CSV"
                        style={{ marginLeft: 5, opacity: history.length === 0 ? 0.5 : 1 }}
                        disabled={history.length === 0}
                    >
                        <Download size={14} />
                    </HeaderButton>
                    <HeaderButton onClick={(e) => { e.stopPropagation(); onClear(); }} title="Clear History" style={{ marginLeft: 5 }}>
                        <Trash2 size={14} />
                    </HeaderButton>
                </div>
            </div>

            {/* List */}
            <div style={{ padding: 10, flex: 1, overflowY: 'auto' }}>
                {history.length === 0 ? (
                    <div style={{ color: 'var(--vscode-descriptionForeground)', textAlign: 'center', marginTop: 20 }}>
                        {isRunning ? (
                            <>
                                Watching C:\temp\requestXML.xml...<br />Waiting for events.
                            </>
                        ) : (
                            <>
                                Watcher is stopped.<br />Press Play to begin.
                            </>
                        )}
                    </div>
                ) : (
                    history.map(event => (
                        <ServiceItem key={event.id} onClick={() => onSelectEvent(event)}>
                            <Clock size={14} style={{ marginRight: 5 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 'bold' }}>
                                    {(() => {
                                        const reqOp = event.requestOperation || 'Unknown';
                                        const resOp = event.responseOperation;
                                        if (!resOp) return reqOp;
                                        const reqBase = reqOp.replace(/Request$/, '');
                                        const resBase = resOp.replace(/Response$/, '');
                                        if (reqBase === resBase) return reqBase;
                                        return `${reqOp} - ${resOp} `;
                                    })()}
                                </div>
                                <div style={{ fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)' }}>{event.timestampLabel}</div>
                                <div style={{ fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)' }}>
                                    {event.responseContent ? 'Request & Response' : 'Request Pending...'}
                                </div>
                            </div>
                        </ServiceItem>
                    ))
                )}
            </div>
        </div>
    );
};
