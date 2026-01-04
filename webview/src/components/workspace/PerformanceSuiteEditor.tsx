import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Plus, Trash2, Settings, Clock, Repeat, Flame, Zap, GripVertical, Loader, Square, Calendar, ToggleLeft, ToggleRight, Import } from 'lucide-react';
import { PerformanceSuite, PerformanceRun, PerformanceSchedule, PerformanceRequest } from '../../models';
import {
    Content,
    Toolbar,
    ToolbarButton,
    IconButton
} from '../../styles/WorkspaceLayout.styles';

const EditorContainer = styled.div`
    padding: 20px;
    height: 100%;
    overflow-y: auto;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
`;

const Section = styled.div`
    margin-bottom: 25px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
    padding: 15px;
    border: 1px solid var(--vscode-widget-border);
`;

const SectionHeader = styled.h3`
    margin: 0 0 15px 0;
    font-size: 1.1em;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 8px;
`;

const Grid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
`;

const FormGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 5px;
`;

const Label = styled.label`
    font-size: 0.9em;
    opacity: 0.8;
    display: flex;
    align-items: center;
    gap: 5px;
`;

const Input = styled.input`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 6px;
    border-radius: 4px;
    font-family: inherit;
    
    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }
`;

const RequestList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const RequestItem = styled.div<{ isDragging?: boolean; isDropTarget?: boolean }>`
    display: flex;
    align-items: center;
    padding: 10px;
    background: ${props => props.isDragging ? 'var(--vscode-editor-selectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    border: 1px solid ${props => props.isDropTarget ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'};
    border-radius: 4px;
    gap: 12px;
    opacity: ${props => props.isDragging ? 0.5 : 1};
    transition: border-color 0.15s ease, background-color 0.15s ease;
`;

const DragHandle = styled.div`
    cursor: grab;
    opacity: 0.5;
    display: flex;
    align-items: center;
    
    &:active {
        cursor: grabbing;
    }
    
    &:hover {
        opacity: 1;
    }
`;

const MethodBadge = styled.span`
    font-size: 0.8em;
    font-weight: bold;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    min-width: 45px;
    text-align: center;
`;

interface PerformanceSuiteEditorProps {
    suite: PerformanceSuite;
    onUpdate: (suite: PerformanceSuite) => void;
    onRun: (id: string) => void;
    onStop: () => void;
    isRunning: boolean;
    onAddRequest?: (suiteId: string) => void;
    onDeleteRequest?: (suiteId: string, requestId: string) => void;
    onUpdateRequest?: (suiteId: string, requestId: string, updates: Partial<PerformanceRequest>) => void;
    onSelectRequest?: (request: PerformanceRequest) => void;
    onImportFromWorkspace?: (suiteId: string) => void;
    progress?: { iteration: number; total: number } | null;
    history?: PerformanceRun[];
    schedules?: PerformanceSchedule[];
    onAddSchedule?: (suiteId: string, cronExpression: string) => void;
    onToggleSchedule?: (scheduleId: string, enabled: boolean) => void;
    onDeleteSchedule?: (scheduleId: string) => void;
}

export const PerformanceSuiteEditor: React.FC<PerformanceSuiteEditorProps> = ({
    suite,
    onUpdate,
    onRun,
    onStop,
    isRunning,
    onAddRequest,
    onDeleteRequest,
    onSelectRequest,
    onImportFromWorkspace,
    schedules = [],
    onAddSchedule,
    onToggleSchedule,
    onDeleteSchedule
}) => {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [newCron, setNewCron] = useState('0 3 * * *'); // Default: daily at 3am
    const [showScheduleInput, setShowScheduleInput] = useState(false);

    const handleChange = (field: keyof PerformanceSuite, value: any) => {
        onUpdate({ ...suite, [field]: value });
    };

    const handleConfigChange = (e: React.ChangeEvent<HTMLInputElement>, field: keyof PerformanceSuite, type: 'number' | 'text' = 'text') => {
        let val = e.target.value;
        if (type === 'number') {
            const num = parseInt(val);
            if (!isNaN(num)) {
                handleChange(field, num);
            }
        } else {
            handleChange(field, val);
        }
    };

    // Drag and Drop handlers
    const handleDragStart = (e: React.DragEvent, requestId: string) => {
        setDraggedId(requestId);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', requestId);
    };

    const handleDragOver = (e: React.DragEvent, requestId: string) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (requestId !== draggedId) {
            setDropTargetId(requestId);
        }
    };

    const handleDragLeave = () => {
        setDropTargetId(null);
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        setDropTargetId(null);

        if (!draggedId || draggedId === targetId) {
            setDraggedId(null);
            return;
        }

        // Reorder steps
        const sortedRequests = [...suite.requests];
        const draggedIndex = sortedRequests.findIndex(r => r.id === draggedId);
        const targetIndex = sortedRequests.findIndex(r => r.id === targetId);

        if (draggedIndex === -1 || targetIndex === -1) {
            setDraggedId(null);
            return;
        }

        const [draggedItem] = sortedRequests.splice(draggedIndex, 1);
        sortedRequests.splice(targetIndex, 0, draggedItem);

        // Update order field
        sortedRequests.forEach((r, i) => r.order = i);

        onUpdate({ ...suite, requests: sortedRequests });
        setDraggedId(null);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
        setDropTargetId(null);
    };

    const sortedRequests = [...(suite.requests || [])].sort((a, b) => a.order - b.order);

    return (
        <Content>
            <Toolbar>
                <div style={{ fontWeight: 'bold', fontSize: '1.1em', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Zap size={16} />
                    {suite.name}
                </div>
                <div style={{ flex: 1 }} />

                {isRunning ? (
                    <ToolbarButton onClick={onStop} style={{ backgroundColor: 'var(--vscode-errorForeground)', color: 'white' }}>
                        <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                        <Square size={10} /> Stop
                    </ToolbarButton>
                ) : (
                    <>
                        {onImportFromWorkspace && (
                            <ToolbarButton onClick={() => onImportFromWorkspace(suite.id)} title="Import from Workspace">
                                <Import size={14} /> Import
                            </ToolbarButton>
                        )}
                        <ToolbarButton onClick={() => onRun(suite.id)} style={{ color: 'var(--vscode-testing-iconPassed)' }}>
                            <Play size={14} /> Run Suite
                        </ToolbarButton>
                    </>
                )}
            </Toolbar>

            <EditorContainer>
                {/* Configuration Section */}
                <Section>
                    <SectionHeader>
                        <Settings size={16} /> Configuration
                    </SectionHeader>
                    <Grid>
                        <FormGroup>
                            <Label><Clock size={14} /> Delay (ms)</Label>
                            <Input
                                type="number"
                                value={suite.delayBetweenRequests}
                                onChange={(e) => handleConfigChange(e, 'delayBetweenRequests', 'number')}
                                title="Delay between requests in sequence"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label><Repeat size={14} /> Iterations</Label>
                            <Input
                                type="number"
                                value={suite.iterations}
                                onChange={(e) => handleConfigChange(e, 'iterations', 'number')}
                                title="Number of times to run the full sequence"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label><Zap size={14} /> Concurrency</Label>
                            <Input
                                type="number"
                                value={suite.concurrency}
                                onChange={(e) => handleConfigChange(e, 'concurrency', 'number')}
                                min={1}
                                title="Parallel requests (1 = sequential)"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label><Flame size={14} /> Warmup Runs</Label>
                            <Input
                                type="number"
                                value={suite.warmupRuns}
                                onChange={(e) => handleConfigChange(e, 'warmupRuns', 'number')}
                                title="Runs to discard before measuring stats"
                            />
                        </FormGroup>
                    </Grid>
                </Section>

                {/* Steps Section */}
                <Section>
                    <SectionHeader>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Play size={16} /> Test Requests
                        </div>
                        {onAddRequest && (
                            <div style={{ display: 'flex', gap: 5 }}>
                                <ToolbarButton onClick={() => onAddRequest(suite.id)}>
                                    <Plus size={14} /> Add Request
                                </ToolbarButton>
                            </div>
                        )}
                    </SectionHeader>

                    <RequestList>
                        {sortedRequests.map((req, index) => (
                            <RequestItem
                                key={req.id}
                                draggable
                                isDragging={draggedId === req.id}
                                isDropTarget={dropTargetId === req.id}
                                onDragStart={(e) => handleDragStart(e, req.id)}
                                onDragOver={(e) => handleDragOver(e, req.id)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, req.id)}
                                onDragEnd={handleDragEnd}
                                onClick={() => onSelectRequest?.(req)}
                                style={{ cursor: 'pointer' }}
                            >
                                <DragHandle onClick={(e) => e.stopPropagation()}>
                                    <GripVertical size={16} />
                                </DragHandle>
                                <div style={{ fontWeight: 'bold', width: 25, opacity: 0.6 }}>{index + 1}.</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <MethodBadge>{req.method}</MethodBadge>
                                        <span style={{ fontWeight: 500 }}>{req.name}</span>
                                    </div>
                                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: 4 }}>
                                        {req.endpoint}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    {onDeleteRequest && (
                                        <IconButton onClick={(e) => { e.stopPropagation(); onDeleteRequest(suite.id, req.id); }} title="Remove Request">
                                            <Trash2 size={14} />
                                        </IconButton>
                                    )}
                                </div>
                            </RequestItem>
                        ))}
                        {sortedRequests.length === 0 && (
                            <div style={{ padding: 20, textAlign: 'center', opacity: 0.6, fontStyle: 'italic' }}>
                                No requests in suite. Add a request to begin.
                            </div>
                        )}
                    </RequestList>
                </Section>

                {/* Scheduling Section */}
                <Section>
                    <SectionHeader>
                        <Calendar size={16} /> Scheduling
                    </SectionHeader>

                    {/* Add New Schedule */}
                    {showScheduleInput ? (
                        <div style={{ display: 'flex', gap: 10, marginBottom: 15 }}>
                            <Input
                                type="text"
                                value={newCron}
                                onChange={(e) => setNewCron(e.target.value)}
                                placeholder="0 3 * * * (daily at 3am)"
                                style={{ flex: 1 }}
                            />
                            <ToolbarButton
                                onClick={() => {
                                    if (onAddSchedule && newCron) {
                                        onAddSchedule(suite.id, newCron);
                                        setNewCron('0 3 * * *');
                                        setShowScheduleInput(false);
                                    }
                                }}
                                style={{ color: 'var(--vscode-testing-iconPassed)' }}
                            >
                                <Plus size={14} /> Add
                            </ToolbarButton>
                            <ToolbarButton onClick={() => setShowScheduleInput(false)}>
                                Cancel
                            </ToolbarButton>
                        </div>
                    ) : (
                        <ToolbarButton onClick={() => setShowScheduleInput(true)}>
                            <Plus size={14} /> Add Schedule
                        </ToolbarButton>
                    )}

                    {/* Schedule List */}
                    {schedules.filter(s => s.suiteId === suite.id).map(schedule => (
                        <RequestItem key={schedule.id}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                                <button
                                    onClick={() => onToggleSchedule?.(schedule.id, !schedule.enabled)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: schedule.enabled
                                            ? 'var(--vscode-testing-iconPassed)'
                                            : 'var(--vscode-disabledForeground)',
                                        padding: 0
                                    }}
                                    title={schedule.enabled ? 'Disable' : 'Enable'}
                                >
                                    {schedule.enabled ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                                </button>
                                <div>
                                    <div style={{ fontWeight: 500 }}>
                                        <code>{schedule.cronExpression}</code>
                                    </div>
                                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                        {schedule.enabled ? 'Active' : 'Disabled'}
                                        {schedule.lastRun && ` • Last run: ${new Date(schedule.lastRun).toLocaleString()}`}
                                    </div>
                                </div>
                            </div>
                            <IconButton
                                onClick={() => onDeleteSchedule?.(schedule.id)}
                                title="Delete Schedule"
                            >
                                <Trash2 size={14} />
                            </IconButton>
                        </RequestItem>
                    ))}

                    {schedules.filter(s => s.suiteId === suite.id).length === 0 && !showScheduleInput && (
                        <div style={{ padding: 15, textAlign: 'center', opacity: 0.6, fontStyle: 'italic' }}>
                            No schedules. Click "Add Schedule" to run this suite automatically.
                        </div>
                    )}
                </Section>
            </EditorContainer>
        </Content>
    );
};
