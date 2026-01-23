import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Plus, Trash2, Settings, Clock, Repeat, Flame, Zap, GripVertical, Loader, Square, Calendar, ToggleLeft, ToggleRight, Import, Download, ChevronDown, ChevronRight, CheckCircle, XCircle, AlertTriangle, Users, Server } from 'lucide-react';
import { PerformanceSuite, PerformanceRun, PerformanceSchedule, PerformanceRequest, CoordinatorStatus } from '@shared/models';
import { WorkerStatusPanel } from './WorkerStatusPanel';

import {
    Content,
    Toolbar,
    ToolbarButton,
    IconButton,
    RunButton
} from '../../styles/WorkspaceLayout.styles';
import { ContextMenu, ContextMenuItem } from '../../styles/App.styles';

const EditorContainer = styled.div`
    padding: 20px;
    height: 100%;
    overflow-y: auto;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
`;

const Section = styled.div<{ $collapsed?: boolean }>`
    margin-bottom: 25px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
    padding: 0;
    border: 1px solid var(--vscode-widget-border);
    overflow: hidden;
`;

const SectionHeader = styled.div<{ $clickable?: boolean }>`
    margin: 0;
    padding: 15px;
    font-size: 1.1em;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    cursor: ${props => props.$clickable ? 'pointer' : 'default'};
    user-select: none;
    transition: background 0.15s ease;
    
    &:hover {
        background: ${props => props.$clickable ? 'var(--vscode-list-hoverBackground)' : 'transparent'};
    }
`;

const SectionContent = styled.div<{ $collapsed?: boolean }>`
    display: ${props => props.$collapsed ? 'none' : 'block'};
    padding: 15px;
`;

const SectionTitle = styled.span`
    flex: 1;
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

const RequestItem = styled.div<{ $isDragging?: boolean; $isDropTarget?: boolean }>`
    display: flex;
    align-items: center;
    padding: 10px;
    background: ${props => props.$isDragging ? 'var(--vscode-editor-selectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    border: 1px solid ${props => props.$isDropTarget ? 'var(--vscode-focusBorder)' : 'var(--vscode-panel-border)'};
    border-radius: 4px;
    gap: 12px;
    opacity: ${props => props.$isDragging ? 0.5 : 1};
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

// Stats Grid for SLA metrics
const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
    gap: 10px;
    margin-bottom: 15px;
`;

const StatCard = styled.div<{ $variant?: 'success' | 'warning' | 'error' }>`
    background: var(--vscode-input-background);
    border-radius: 6px;
    padding: 10px;
    text-align: center;
    border: 1px solid ${props =>
        props.$variant === 'success' ? 'var(--vscode-testing-iconPassed)' :
            props.$variant === 'warning' ? 'var(--vscode-editorWarning-foreground)' :
                props.$variant === 'error' ? 'var(--vscode-testing-iconFailed)' :
                    'var(--vscode-widget-border)'};
`;

const StatValue = styled.div`
    font-size: 1.3em;
    font-weight: bold;
    margin-bottom: 2px;
`;

const StatLabel = styled.div`
    font-size: 0.75em;
    opacity: 0.7;
`;

// Progress Bar
const ProgressContainer = styled.div`
    margin: 10px 0;
`;

const ProgressBar = styled.div`
    height: 8px;
    background: var(--vscode-editorWidget-background);
    border-radius: 4px;
    overflow: hidden;
    border: 1px solid var(--vscode-widget-border);
`;

const ProgressFill = styled.div<{ $percent: number }>`
    height: 100%;
    width: ${props => props.$percent}%;
    background: var(--vscode-progressBar-background, var(--vscode-testing-iconPassed));
    transition: width 0.3s ease;
    min-width: ${props => (props.$percent > 0 ? '4px' : '0')};
`;

// Bar Chart for response times
const ChartContainer = styled.div`
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 80px;
    margin: 15px 0;
    padding: 10px;
    background: var(--vscode-input-background);
    border-radius: 6px;
`;

const ChartBar = styled.div<{ $height: number; $success: boolean }>`
    flex: 1;
    min-width: 4px;
    max-width: 16px;
    height: ${props => props.$height}%;
    background: ${props => props.$success ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)'};
    border-radius: 2px 2px 0 0;
    transition: height 0.3s ease;
`;

// Run History Item
const RunItem = styled.div`
    background: var(--vscode-input-background);
    border-radius: 6px;
    margin-bottom: 8px;
    border: 1px solid var(--vscode-widget-border);
    overflow: hidden;
`;

const RunHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    cursor: pointer;
    
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const RunDetails = styled.div`
    padding: 12px;
    border-top: 1px solid var(--vscode-widget-border);
    background: var(--vscode-editor-background);
    max-height: 200px;
    overflow-y: auto;
`;

const InfoBanner = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 6px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 16px;
    font-size: 0.9em;
`;

const InfoBannerTitle = styled.div`
    font-weight: 600;
    color: var(--vscode-foreground);
`;

const ResultRow = styled.div<{ $success: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    margin: 2px 0;
    background: ${props => props.$success ? 'var(--vscode-diffEditor-insertedTextBackground)' : 'var(--vscode-diffEditor-removedTextBackground)'};
    border-radius: 3px;
    font-size: 0.85em;
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
    // Coordinator props
    coordinatorStatus?: CoordinatorStatus;
    onStartCoordinator?: (port: number, expectedWorkers: number) => void;
    onStopCoordinator?: () => void;
}

export const PerformanceSuiteEditor: React.FC<PerformanceSuiteEditorProps> = ({
    suite,
    onUpdate,
    onRun,
    onStop,
    isRunning,
    onAddRequest,
    onDeleteRequest,
    onUpdateRequest,
    onSelectRequest,
    onImportFromWorkspace,
    schedules = [],
    onAddSchedule,
    onToggleSchedule,
    onDeleteSchedule,
    progress,
    history = [],
    coordinatorStatus,
    onStartCoordinator,
    onStopCoordinator
}) => {
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [newCron, setNewCron] = useState('0 3 * * *'); // Default: daily at 3am
    const [showScheduleInput, setShowScheduleInput] = useState(false);
    const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
    const [coordPort, setCoordPort] = useState(8765);
    const [coordExpected, setCoordExpected] = useState(1);

    // Rename state
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    // Delete confirmation state
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // Context Menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; reqId: string; currentName: string } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, reqId: string, currentName: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, reqId, currentName });
    };

    const closeContextMenu = () => setContextMenu(null);

    const startRename = () => {
        if (contextMenu) {
            setRenameId(contextMenu.reqId);
            setRenameValue(contextMenu.currentName);
            closeContextMenu();
        }
    };

    // Handle global click to close menu
    React.useEffect(() => {
        const handleClick = () => closeContextMenu();
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const submitRename = () => {
        if (renameId && onUpdateRequest) {
            onUpdateRequest(suite.id, renameId, { name: renameValue });
        }
        setRenameId(null);
        setRenameValue('');
    };

    // Helper to check if section is collapsed
    const isCollapsed = (sectionId: string) => {
        return suite.collapsedSections?.includes(sectionId) ?? false;
    };

    // Toggle collapse state for a section
    const toggleSection = (sectionId: string) => {
        const current = suite.collapsedSections || [];
        const updated = current.includes(sectionId)
            ? current.filter(id => id !== sectionId)
            : [...current, sectionId];
        onUpdate({ ...suite, collapsedSections: updated });
    };

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
    const sortedHistory = [...(history || [])].sort((a, b) => (b.startTime || 0) - (a.startTime || 0));

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
                        <RunButton onClick={() => onRun(suite.id)}>
                            <Play size={14} /> Run Suite
                        </RunButton>
                    </>
                )}
            </Toolbar>

            <EditorContainer>
                {/* Summary Card - Only shown when there's run history */}
                {sortedHistory.length > 0 && (
                    <Section style={{ marginBottom: 20, background: 'var(--vscode-editor-background)', borderColor: 'var(--vscode-testing-iconPassed)' }}>
                        <SectionHeader>
                            <SectionTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <CheckCircle size={16} style={{ color: 'var(--vscode-testing-iconPassed)' }} />
                                Performance Summary
                            </SectionTitle>
                        </SectionHeader>
                        <SectionContent>
                            <Grid style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                                <div>
                                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4 }}>Total Requests</div>
                                    <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>{suite.requests?.length || 0}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4 }}>Last Run</div>
                                    <div style={{ fontSize: '1.5em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {sortedHistory[0].status === 'completed' ? (
                                            <CheckCircle size={18} style={{ color: 'var(--vscode-testing-iconPassed)' }} />
                                        ) : (
                                            <XCircle size={18} style={{ color: 'var(--vscode-testing-iconFailed)' }} />
                                        )}
                                        <span style={{ fontSize: '0.7em' }}>{new Date(sortedHistory[0].startTime).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4 }}>Avg Response Time</div>
                                    <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                                        {sortedHistory[0].summary?.avgResponseTime ?
                                            sortedHistory[0].summary.avgResponseTime.toFixed(0)
                                            : '0'}ms
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4 }}>Success Rate</div>
                                    <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>
                                        {sortedHistory[0].summary?.successRate !== undefined ?
                                            (sortedHistory[0].summary.successRate * 100).toFixed(0)
                                            : '0'}%
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 4 }}>Iterations</div>
                                    <div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>{
                                        sortedHistory[0].summary?.totalRequests ?
                                            Math.floor(sortedHistory[0].summary.totalRequests / (suite.requests?.length || 1))
                                            : '0'
                                    }</div>
                                </div>
                            </Grid>
                        </SectionContent>
                    </Section>
                )}

                {/* Info Banner - Only shown when there are no runs */}
                {sortedHistory.length === 0 && (
                    <InfoBanner>
                        <AlertTriangle size={18} />
                        <div>
                            <InfoBannerTitle>No performance runs yet</InfoBannerTitle>
                            <div>Configure your test requests below and click "Run Suite" to start your first performance test.</div>
                        </div>
                    </InfoBanner>
                )}

                {/* Run Progress - Only show when running */}
                {isRunning && (
                    <Section>
                        <SectionHeader>
                            <Loader size={16} className="animate-spin" /> Running...
                        </SectionHeader>
                        <SectionContent>
                            <ProgressContainer>
                                <div style={{ marginBottom: 5, fontSize: '0.9em' }}>
                                    {progress && progress.total > 0
                                        ? `Iteration ${progress.iteration} of ${progress.total}`
                                        : 'Starting...'}
                                </div>
                                <ProgressBar>
                                    <ProgressFill $percent={progress && progress.total > 0 ? (progress.iteration / progress.total) * 100 : 0} />
                                </ProgressBar>
                            </ProgressContainer>
                        </SectionContent>
                    </Section>
                )}

                {/* Configuration Section */}
                <Section $collapsed={isCollapsed('config')}>
                    <SectionHeader $clickable onClick={() => toggleSection('config')}>
                        {isCollapsed('config') ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <SectionTitle><Settings size={16} /> Configuration</SectionTitle>
                    </SectionHeader>
                    <SectionContent $collapsed={isCollapsed('config')}>
                        <Grid>
                            <FormGroup>
                                <Label title="Delay between requests in sequence"><Clock size={14} /> Delay (ms)</Label>
                                <Input
                                    type="number"
                                    value={suite.delayBetweenRequests}
                                    onChange={(e) => handleConfigChange(e, 'delayBetweenRequests', 'number')}
                                    title="Delay between requests in sequence"
                                />
                            </FormGroup>
                            <FormGroup>
                                <Label title="Number of times to run the full sequence"><Repeat size={14} /> Iterations</Label>
                                <Input
                                    type="number"
                                    value={suite.iterations}
                                    onChange={(e) => handleConfigChange(e, 'iterations', 'number')}
                                    title="Number of times to run the full sequence"
                                />
                            </FormGroup>
                            <FormGroup>
                                <Label title="Parallel requests (1 = sequential)"><Zap size={14} /> Concurrency</Label>
                                <Input
                                    type="number"
                                    value={suite.concurrency}
                                    onChange={(e) => handleConfigChange(e, 'concurrency', 'number')}
                                    min={1}
                                    title="Parallel requests (1 = sequential)"
                                />
                            </FormGroup>
                            <FormGroup>
                                <Label title="Runs to discard before measuring stats"><Flame size={14} /> Warmup Runs</Label>
                                <Input
                                    type="number"
                                    value={suite.warmupRuns}
                                    onChange={(e) => handleConfigChange(e, 'warmupRuns', 'number')}
                                    title="Runs to discard before measuring stats"
                                />
                            </FormGroup>
                        </Grid>
                    </SectionContent>
                </Section>

                {/* Test Requests Section */}
                <Section $collapsed={isCollapsed('requests')}>
                    <SectionHeader $clickable onClick={() => toggleSection('requests')}>
                        {isCollapsed('requests') ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <SectionTitle><Play size={16} /> Test Requests ({suite.requests.length})</SectionTitle>
                        {onAddRequest && !isCollapsed('requests') && (
                            <ToolbarButton onClick={(e) => { e.stopPropagation(); onAddRequest(suite.id); }}>
                                <Plus size={14} /> Add Request
                            </ToolbarButton>
                        )}
                    </SectionHeader>
                    <SectionContent $collapsed={isCollapsed('requests')}>
                        <RequestList>
                            {sortedRequests.map((req, index) => (
                                <RequestItem
                                    key={req.id}
                                    draggable
                                    $isDragging={draggedId === req.id}
                                    $isDropTarget={dropTargetId === req.id}
                                    onDragStart={(e) => handleDragStart(e, req.id)}
                                    onDragOver={(e) => handleDragOver(e, req.id)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, req.id)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => onSelectRequest?.(req)}
                                    onContextMenu={(e) => handleContextMenu(e, req.id, req.name)}
                                    style={{ cursor: 'pointer' }}
                                >
                                    <DragHandle onClick={(e) => e.stopPropagation()}>
                                        <GripVertical size={16} />
                                    </DragHandle>
                                    <div style={{ fontWeight: 'bold', width: 25, opacity: 0.6 }}>{index + 1}.</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <MethodBadge>{req.method}</MethodBadge>
                                            {renameId === req.id ? (
                                                <Input
                                                    value={renameValue}
                                                    onChange={(e) => setRenameValue(e.target.value)}
                                                    onBlur={submitRename}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') submitRename();
                                                        if (e.key === 'Escape') setRenameId(null);
                                                        e.stopPropagation();
                                                    }}
                                                    autoFocus
                                                    onClick={(e) => e.stopPropagation()}
                                                    style={{ padding: '2px 4px', width: 200 }}
                                                />
                                            ) : (
                                                <span style={{ fontWeight: 500 }}>{req.name}</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.85em', opacity: 0.7, marginTop: 4 }}>
                                            {req.endpoint}
                                        </div>
                                        {(req.interfaceName || req.operationName) && (
                                            <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: 2, fontStyle: 'italic' }}>
                                                {req.interfaceName} {req.operationName && ` • ${req.operationName}`}
                                            </div>
                                        )}
                                        {req.soapAction && (
                                            <div style={{ fontSize: '0.8em', opacity: 0.6, marginTop: 2, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={req.soapAction}>
                                                Action: {req.soapAction}
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>

                                        {onDeleteRequest && (
                                            <IconButton
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (deleteConfirmId === req.id) {
                                                        onDeleteRequest(suite.id, req.id);
                                                        setDeleteConfirmId(null);
                                                    } else {
                                                        setDeleteConfirmId(req.id);
                                                        setTimeout(() => setDeleteConfirmId(current => current === req.id ? null : current), 3000);
                                                    }
                                                }}
                                                title={deleteConfirmId === req.id ? "Click again to Confirm" : "Remove Request"}
                                                shake={deleteConfirmId === req.id}
                                            >
                                                <Trash2 size={14} />
                                            </IconButton>
                                        )}
                                    </div>
                                </RequestItem>
                            ))}
                            {/* Local Context Menu */}
                            {contextMenu && (
                                <ContextMenu top={contextMenu.y} left={contextMenu.x} onClick={(e: any) => e.stopPropagation()}>
                                    <ContextMenuItem onClick={() => startRename()}>
                                        Rename
                                    </ContextMenuItem>
                                    <ContextMenuItem onClick={() => {
                                        if (onDeleteRequest) onDeleteRequest(suite.id, contextMenu.reqId);
                                        closeContextMenu();
                                    }}>
                                        Delete
                                    </ContextMenuItem>
                                </ContextMenu>
                            )}
                            {sortedRequests.length === 0 && (
                                <div style={{ padding: 20, textAlign: 'center', opacity: 0.6, fontStyle: 'italic' }}>
                                    No requests in suite. Add a request to begin.
                                </div>
                            )}
                        </RequestList>
                    </SectionContent>
                </Section>

                {/* Scheduling Section */}
                <Section $collapsed={isCollapsed('scheduling')}>
                    <SectionHeader $clickable onClick={() => toggleSection('scheduling')}>
                        {isCollapsed('scheduling') ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <SectionTitle><Calendar size={16} /> Scheduling ({schedules.filter(s => s.suiteId === suite.id).length})</SectionTitle>
                        {!isCollapsed('scheduling') && !showScheduleInput && (
                            <ToolbarButton onClick={(e) => { e.stopPropagation(); setShowScheduleInput(true); }} title="Add Schedule">
                                <Plus size={14} /> Add Schedule
                            </ToolbarButton>
                        )}
                    </SectionHeader>
                    <SectionContent $collapsed={isCollapsed('scheduling')}>
                        {/* Add New Schedule */}
                        {showScheduleInput && (
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
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (deleteConfirmId === schedule.id) {
                                            onDeleteSchedule?.(schedule.id);
                                            setDeleteConfirmId(null);
                                        } else {
                                            setDeleteConfirmId(schedule.id);
                                            setTimeout(() => setDeleteConfirmId(current => current === schedule.id ? null : current), 3000);
                                        }
                                    }}
                                    title={deleteConfirmId === schedule.id ? "Click again to Confirm" : "Delete Schedule"}
                                    shake={deleteConfirmId === schedule.id}
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
                    </SectionContent>
                </Section>

                {/* Distributed Workers Section */}
                {coordinatorStatus && onStartCoordinator && onStopCoordinator && (
                    <Section $collapsed={isCollapsed('workers')}>
                        <SectionHeader $clickable onClick={() => toggleSection('workers')}>
                            {isCollapsed('workers') ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                            <SectionTitle><Users size={16} /> Distributed Workers ({coordinatorStatus.workers.length})</SectionTitle>

                            {/* Coordinator Controls - Only visible when expanded */}
                            {!isCollapsed('workers') && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} onClick={e => e.stopPropagation()}>
                                    {!coordinatorStatus.running ? (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <span style={{ fontSize: '0.85em', opacity: 0.7 }}>Port:</span>
                                                <Input
                                                    type="number"
                                                    value={coordPort}
                                                    onChange={e => setCoordPort(parseInt(e.target.value) || 8765)}
                                                    min={1024}
                                                    max={65535}
                                                    style={{ width: 60, padding: 2 }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <span style={{ fontSize: '0.85em', opacity: 0.7 }}>Expected:</span>
                                                <Input
                                                    type="number"
                                                    value={coordExpected}
                                                    onChange={e => setCoordExpected(parseInt(e.target.value) || 1)}
                                                    min={1}
                                                    max={100}
                                                    style={{ width: 40, padding: 2 }}
                                                />
                                            </div>
                                            <ToolbarButton onClick={() => onStartCoordinator(coordPort, coordExpected)} title="Start Coordinator" style={{ color: 'var(--vscode-testing-iconPassed)' }}>
                                                <Play size={14} /> Start
                                            </ToolbarButton>
                                        </>
                                    ) : (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.85em' }} title="Coordinator running">
                                                <Server size={14} style={{ color: 'var(--vscode-testing-iconPassed)' }} />
                                                <span>Port {coordinatorStatus.port}</span>
                                            </div>
                                            <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                                {coordinatorStatus.workers.length}/{coordinatorStatus.expectedWorkers} connected
                                            </div>
                                            <ToolbarButton onClick={onStopCoordinator} title="Stop Coordinator" style={{ color: 'var(--vscode-errorForeground)' }}>
                                                <Square size={14} /> Stop
                                            </ToolbarButton>
                                        </>
                                    )}
                                </div>
                            )}
                        </SectionHeader>
                        <SectionContent $collapsed={isCollapsed('workers')}>
                            <WorkerStatusPanel
                                status={coordinatorStatus}
                            />
                        </SectionContent>
                    </Section>
                )}

                {/* Run History */}
                <Section $collapsed={isCollapsed('history')}>
                    <SectionHeader $clickable onClick={() => toggleSection('history')}>
                        {isCollapsed('history') ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <SectionTitle><Clock size={16} /> Run History ({sortedHistory.length})</SectionTitle>
                    </SectionHeader>
                    <SectionContent $collapsed={isCollapsed('history')}>
                        {sortedHistory.length > 0 ? (
                            <>
                                {sortedHistory.slice(0, 5).map((run) => {
                                    const isExpanded = expandedRunId === run.id;
                                    const stats = run.summary;
                                    const maxDuration = Math.max(...run.results.map(r => r.duration), 1);

                                    return (
                                        <RunItem key={run.id}>
                                            <RunHeader onClick={() => setExpandedRunId(isExpanded ? null : run.id)}>
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                                {run.status === 'completed' ? (
                                                    <CheckCircle size={16} style={{ color: 'var(--vscode-testing-iconPassed)' }} />
                                                ) : run.status === 'aborted' ? (
                                                    <AlertTriangle size={16} style={{ color: 'var(--vscode-editorWarning-foreground)' }} />
                                                ) : (
                                                    <XCircle size={16} style={{ color: 'var(--vscode-testing-iconFailed)' }} />
                                                )}
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 500 }}>
                                                        {new Date(run.startTime).toLocaleString()}
                                                    </div>
                                                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                                        {stats.totalRequests} requests • {(stats.successRate*100).toFixed(0)}% success • avg {stats.avgResponseTime.toFixed(0)}ms
                                                    </div>
                                                </div>
                                                <ToolbarButton
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        // Export CSV
                                                        const csv = [
                                                            'Request,Iteration,Duration (ms),Status,Success,SLA Breached,Timestamp',
                                                            ...run.results.map(r =>
                                                                `"${r.requestName}",${r.iteration},${r.duration.toFixed(2)},${r.status},${r.success},${r.slaBreached},${new Date(r.timestamp).toISOString()}`
                                                            )
                                                        ].join('\n');
                                                        const blob = new Blob([csv], { type: 'text/csv' });
                                                        const url = URL.createObjectURL(blob);
                                                        const a = document.createElement('a');
                                                        a.href = url;
                                                        a.download = `performance-run-${run.id}.csv`;
                                                        a.click();
                                                        URL.revokeObjectURL(url);
                                                    }}
                                                    title="Export CSV"
                                                >
                                                    <Download size={14} />
                                                </ToolbarButton>
                                            </RunHeader>

                                            {isExpanded && (
                                                <RunDetails>
                                                    {/* SLA Statistics */}
                                                    <StatsGrid>
                                                        <StatCard $variant={stats.successRate >= 0.95 ? 'success' : stats.successRate >= 0.80 ? 'warning' : 'error'}>
                                                            <StatValue>{(stats.successRate === 1 ? '100' : (stats.successRate * 100).toFixed(1))}%</StatValue>
                                                            <StatLabel>Success Rate</StatLabel>
                                                        </StatCard>
                                                        <StatCard>
                                                            <StatValue>{stats.avgResponseTime.toFixed(0)}ms</StatValue>
                                                            <StatLabel>Average</StatLabel>
                                                        </StatCard>
                                                        <StatCard>
                                                            <StatValue>{stats.minResponseTime.toFixed(0)}ms</StatValue>
                                                            <StatLabel>Min</StatLabel>
                                                        </StatCard>
                                                        <StatCard>
                                                            <StatValue>{stats.maxResponseTime.toFixed(0)}ms</StatValue>
                                                            <StatLabel>Max</StatLabel>
                                                        </StatCard>
                                                        <StatCard>
                                                            <StatValue>{stats.p50.toFixed(0)}ms</StatValue>
                                                            <StatLabel>p50</StatLabel>
                                                        </StatCard>
                                                        <StatCard>
                                                            <StatValue>{stats.p95.toFixed(0)}ms</StatValue>
                                                            <StatLabel>p95</StatLabel>
                                                        </StatCard>
                                                        <StatCard $variant={stats.slaBreachCount > 0 ? 'error' : 'success'}>
                                                            <StatValue>{stats.p99.toFixed(0)}ms</StatValue>
                                                            <StatLabel>p99</StatLabel>
                                                        </StatCard>
                                                        <StatCard $variant={stats.slaBreachCount > 0 ? 'error' : undefined}>
                                                            <StatValue>{stats.slaBreachCount}</StatValue>
                                                            <StatLabel>SLA Breaches</StatLabel>
                                                        </StatCard>
                                                    </StatsGrid>

                                                    {/* Response Time Chart */}
                                                    <div style={{ fontSize: '0.85em', marginBottom: 5, opacity: 0.7 }}>Response Times</div>
                                                    <ChartContainer>
                                                        {run.results.slice(0, 50).map((result, idx) => (
                                                            <ChartBar
                                                                key={idx}
                                                                $height={(result.duration / maxDuration) * 100}
                                                                $success={result.success}
                                                                title={`${result.requestName}: ${result.duration.toFixed(0)}ms`}
                                                            />
                                                        ))}
                                                    </ChartContainer>

                                                    {/* Individual Results */}
                                                    <div style={{ fontSize: '0.85em', marginBottom: 5, opacity: 0.7 }}>Results ({run.results.length})</div>
                                                    {run.results.slice(0, 20).map((result, idx) => (
                                                        <ResultRow key={idx} $success={result.success}>
                                                            {result.success ? (
                                                                <CheckCircle size={12} style={{ color: 'var(--vscode-testing-iconPassed)' }} />
                                                            ) : (
                                                                <XCircle size={12} style={{ color: 'var(--vscode-testing-iconFailed)' }} />
                                                            )}
                                                            <span style={{ flex: 1 }}>{result.requestName}</span>
                                                            <span style={{ opacity: 0.7 }}>#{result.iteration + 1}</span>
                                                            <span style={{ fontWeight: 500 }}>{result.duration.toFixed(0)}ms</span>
                                                            {result.slaBreached && (
                                                                <span title="SLA Breached">
                                                                    <AlertTriangle size={12} style={{ color: 'var(--vscode-editorWarning-foreground)' }} />
                                                                </span>
                                                            )}
                                                        </ResultRow>
                                                    ))}
                                                    {run.results.length > 20 && (
                                                        <div style={{ textAlign: 'center', opacity: 0.6, fontSize: '0.85em', marginTop: 8 }}>
                                                            ... and {run.results.length - 20} more results
                                                        </div>
                                                    )}
                                                </RunDetails>
                                            )}
                                        </RunItem>
                                    );
                                })}
                            </>
                        ) : (
                            <div style={{ padding: 15, textAlign: 'center', opacity: 0.6, fontStyle: 'italic' }}>
                                No runs yet. History will appear after the first completed run.
                            </div>
                        )}
                    </SectionContent>
                </Section>
            </EditorContainer>
        </Content >
    );
};
