import React, { useState, useCallback, useEffect } from 'react';
import {
    ChevronRight,
    ChevronDown,
    FolderOpen,
    FileCode,
    File,
    Server,
} from 'lucide-react';
import { UnifiedProject, ApiOperation, ApiRequest, ScrapbookRequest } from '@shared/models';
import { SidebarContextMenu, CtxMenuSection, CtxMenuItem } from '../sidebar/shared/SidebarContextMenu';
import {
    Copy,
    Link,
    Plus as PlusIcon,
    Download as DownloadIcon,
    Trash2 as Trash2Icon,
    RefreshCw as RefreshCwIcon,
} from '../sidebar/shared/SidebarContextMenu';
import { ScrapbookPanel } from '../sidebar/ScrapbookPanel';

// Drag-and-drop helper functions (extracted to avoid TS1005 JSX brace ambiguity)
const makeDragData = (data: { type: string; projectName: string; fromIndex: number; operationName?: string }): string => {
    return JSON.stringify(data);
};

const handleDragStart = (e: React.DragEvent<HTMLElement>, data: string) => {
    e.dataTransfer.setData('application/x-tree-drag', data);
};

// Find the closest TreeItem row from a drop event that landed between rows.
// Walks up from elementFromPoint to find an element with data-drop-index.
const findClosestDropRow = (x: number, y: number): HTMLElement | null => {
    const elements = document.elementsFromPoint(x, y);
    for (const el of elements) {
        if (el instanceof HTMLElement && el.dataset.dropIndex !== undefined) {
            return el;
        }
    }
    for (const offset of [-6, 6, -12, 12, -18, 18]) {
        const nearby = document.elementsFromPoint(x, y + offset);
        for (const el of nearby) {
            if (el instanceof HTMLElement && el.dataset.dropIndex !== undefined) {
                return el;
            }
        }
    }
    return null;
};

export interface TreeItemProps {
    label: string;
    type: 'project' | 'operation' | 'request';
    id?: string;
    expanded?: boolean;
    selected?: boolean;
    children?: React.ReactNode;
    onToggle?: () => void;
    onClick?: () => void;
    // Indentation level for tree nesting (0=project, 1=operation, 2=request)
    indentLevel?: number;
    // Drag-and-drop: set draggable for operations and requests
    draggable?: boolean;
    onDragStart?: (e: React.DragEvent<HTMLElement>) => void;
    onDragOver?: (e: React.DragEvent<HTMLElement>) => void;
    onDrop?: (e: React.DragEvent<HTMLElement>) => void;
    onDragEnd?: (e: React.DragEvent<HTMLElement>) => void;
    // Context menu
    onContextMenu?: (e: React.MouseEvent) => void;
    // Data attributes for drop-target identification
    dataDropType?: string;
    dataDropIndex?: number;
    dataDropParent?: string;
}

const TreeItem: React.FC<TreeItemProps> = ({
    label,
    type,
    expanded = false,
    selected = false,
    children,
    onToggle,
    onClick,
    onContextMenu,
    indentLevel = 0,
    draggable = false,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    dataDropType,
    dataDropIndex,
    dataDropParent,
}) => {
    const hasChildren = React.Children.count(children) > 0;

    const handleContextMenuInternal = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (onContextMenu) onContextMenu(e);
    };

    const iconStyle = { width: 16, height: 16, flexShrink: 0 };

    let icon: React.ReactNode;
    let color: string;
    switch (type) {
        case 'project':
            icon = <Server size={18} style={iconStyle} />;
            color = 'var(--apinox-icon-primary, #6e7681)';
            break;
        case 'operation':
            icon = <FolderOpen size={16} style={iconStyle} />;
            color = 'var(--apinox-icon-secondary, #6e7681)';
            break;
        case 'request':
            icon = <FileCode size={16} style={iconStyle} />;
            color = 'var(--apinox-icon-secondary, #6e7681)';
            break;
        default:
            icon = <File size={16} style={iconStyle} />;
            color = 'var(--apinox-icon-secondary, #6e7681)';
    }

    // Indentation: 0px for project, 24px for operation, 48px for request
    const paddingLeft = indentLevel * 24;

    return (
        <>
            <div
                draggable={draggable}
                onClick={onClick}
                onContextMenu={handleContextMenuInternal}
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
                data-drop-type={dataDropType}
                data-drop-index={dataDropIndex}
                data-drop-parent={dataDropParent}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: `4px 8px 4px ${paddingLeft + 8}px`,
                    cursor: 'pointer',
                    backgroundColor: selected ? 'var(--apinox-list-activeSelectionBackground)' : 'transparent',
                    color: selected ? 'var(--apinox-list-activeSelectionForeground)' : 'inherit',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                }}
            >
                {/* Expand/collapse chevron */}
                {hasChildren && (
                    <div onClick={onToggle} style={{ cursor: 'pointer', flexShrink: 0 }}>
                        {expanded ? (
                            <ChevronDown size={14} />
                        ) : (
                            <ChevronRight size={14} />
                        )}
                    </div>
                )}
                <span style={{ color, flexShrink: 0 }}>{icon}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            </div>


            {expanded && hasChildren && <div>{children}</div>}
        </>
    );
};

interface CtxMenuState {
    x: number;
    y: number;
    type: 'project' | 'operation' | 'request';
    data: UnifiedProject | ApiOperation | ApiRequest | null;
    projectName?: string;
    operationName?: string;
}

export interface UnifiedExplorerSidebarProps {
    projects: UnifiedProject[];
    selectedNode: { type: string; id: string } | null;
    onSelectNode: (type: string, id: string) => void;
    onRefreshProject: (projectName: string) => void;
    onDeleteProject: (projectName: string) => void;
    onDeleteOperation: (projectName: string, operationName: string) => void;
    onDeleteRequest: (projectName: string, operationName: string, requestName: string) => void;
    onNewRequest: (projectName: string, operationName: string) => void;
    onExportProject: (projectName: string) => void;
    onReorderOperation: (projectName: string, fromIndex: number, toIndex: number) => void;
    onReorderRequest: (projectName: string, operationName: string, fromIndex: number, toIndex: number) => void;
    /**
     * F-01 / R-05 — Quick Requests (scrapbook) section rendered as the bottom
     * section of the unified sidebar (decision doc Q1(a): least surface area,
     * matches the legacy placement in `ApiExplorerSidebar`).
     */
    scrapbook?: {
        requests: ScrapbookRequest[];
        selectedRequest: ScrapbookRequest | null;
        loading: boolean;
        onCreateRequest: () => void;
        onSelectRequest: (request: ScrapbookRequest) => void;
        onDeleteRequest: (id: string) => void;
        onExecuteRequest: (request: ScrapbookRequest) => void;
    };
}

export const UnifiedExplorerSidebar: React.FC<UnifiedExplorerSidebarProps> = ({
    projects,
    selectedNode,
    onSelectNode,
    onRefreshProject,
    onDeleteProject,
    onDeleteOperation,
    onDeleteRequest,
    onNewRequest,
    onExportProject,
    onReorderOperation,
    onReorderRequest,
    scrapbook,
}) => {
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
    const closeCtxMenu = () => setCtxMenu(null);

    // Drop gap indicator: purely visual, rendered as a gap between tree items during drag.
    // The actual drop index is computed from the native event in onDrop (not from state).
    interface DropGap {
        type: 'operation' | 'request';
        projectName: string;
        operationName?: string;
        index: number;
    }
    const [dropGap, setDropGap] = useState<DropGap | null>(null);
    const clearDropGap = useCallback(() => setDropGap(null), []);

    const buildSections = (state: CtxMenuState): CtxMenuSection[] => {
        const items: CtxMenuItem[] = [];

        if (state.type === 'project') {
            const project = state.data as UnifiedProject;
            items.push({ icon: RefreshCwIcon, label: 'Refresh WSDL', sub: project.sourceUrl || 'Reload operations', onClick: () => { onRefreshProject(project.name); closeCtxMenu(); } });
            items.push({ icon: DownloadIcon, label: 'Export Project', onClick: () => { onExportProject(project.name); closeCtxMenu(); } });
        } else if (state.type === 'operation') {
            const op = state.data as ApiOperation;
            items.push({ icon: PlusIcon, label: 'New Request', onClick: () => { onNewRequest(state.projectName || '', op.name); closeCtxMenu(); } });
        } else if (state.type === 'request') {
            const req = state.data as ApiRequest;
            if (req.endpoint) {
                items.push({ icon: Link, label: 'Copy URL', copyText: req.endpoint });
            }
            items.push({ icon: Copy, label: 'Copy Request XML', copyText: req.request || '' });
        }

        items.push({ icon: Trash2Icon, label: 'Delete', danger: true, onClick: () => {
            if (state.type === 'project') onDeleteProject((state.data as UnifiedProject).name);
            else if (state.type === 'operation') {
                const op = state.data as ApiOperation;
                onDeleteOperation(state.projectName || '', op.name);
            } else {
                const req = state.data as ApiRequest;
                onDeleteRequest(state.projectName || '', state.operationName || '', req.name);
            }
            closeCtxMenu();
        }});

        return [{ title: 'Actions', items }];
    };

    // Auto-expand operations that have requests (e.g., after adding a new request)
    useEffect(() => {
        const toExpand = new Set<string>(expandedNodes);
        for (const project of projects) {
            for (const op of project.operations || []) {
                if ((op.requests || []).length > 0 && !expandedNodes.has(op.id || op.name)) {
                    toExpand.add(op.id || op.name);
                }
            }
        }
        if (toExpand.size !== expandedNodes.size) {
            setExpandedNodes(toExpand);
        }
    }, [projects]);

    const toggleNode = useCallback((nodeId: string) => {
        setExpandedNodes(prev => {
            const next = new Set(prev);
            if (next.has(nodeId)) {
                next.delete(nodeId);
            } else {
                next.add(nodeId);
            }
            return next;
        });
    }, []);

    const isSelected = (type: string, id: string) =>
        (selectedNode && selectedNode.type === type && selectedNode.id === id) || false;

    return (
        <div
            style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                minHeight: 0,
            }}
        >
        <div
            style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '4px 0',
            }}
            onDragOver={(e) => {
                // Always allow drops — getData() is restricted during dragover in most browsers
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(e) => {
                // Fallback: drop landed between rows on the container
                e.preventDefault();
                clearDropGap();
                const dragData = e.dataTransfer.getData('application/x-tree-drag');
                if (!dragData) return;
                const parsed = JSON.parse(dragData);
                // Try to find a nearby row to determine drop index
                const row = findClosestDropRow(e.clientX, e.clientY);
                if (!row) return;
                const dropIndex = parseInt(row.dataset.dropIndex || '', 10);
                if (isNaN(dropIndex)) return;
                const rect = row.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const targetIndex = e.clientY < midY ? dropIndex : dropIndex + 1;

                if (parsed.type === 'operation' && row.dataset.dropType === 'operation' && row.dataset.dropParent === parsed.projectName) {
                    onReorderOperation(parsed.projectName, parsed.fromIndex, targetIndex);
                } else if (parsed.type === 'request' && row.dataset.dropType === 'request' && row.dataset.dropParent === `${parsed.projectName}::${parsed.operationName}`) {
                    onReorderRequest(parsed.projectName, parsed.operationName, parsed.fromIndex, targetIndex);
                }
            }}
        >
            {projects.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--apinox-foreground)', opacity: 0.7 }}>
                    <p style={{ margin: 0 }}>No projects yet</p>
                    <p style={{ fontSize: 12, marginTop: 4 }}>Load a WSDL to create one</p>
                </div>
            )}

            {projects.map((project) => {
                const projectId = project.id || project.name;
                const isExpanded = expandedNodes.has(projectId);

                return (
                    <TreeItem
                        key={projectId}
                        label={project.name}
                        type="project"
                        expanded={isExpanded}
                        selected={isSelected('project', projectId)}
                        onClick={() => onSelectNode('project', projectId)}
                        onToggle={() => toggleNode(projectId)}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, type: 'project', data: project }); }}
                    >
                        {(project.operations || []).map((op: ApiOperation, opIndex: number) => {
                            const opId = op.id || op.name;
                            const isOpExpanded = expandedNodes.has(opId);
                            const showOpGapBefore = dropGap?.type === 'operation' && dropGap?.projectName === project.name && dropGap?.index === opIndex;

                            return (
                                <React.Fragment key={opId}>
                                    {showOpGapBefore && (
                                        <div
                                            style={{ height: 24, display: 'flex', alignItems: 'center', paddingLeft: 24 }}
                                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                            onDrop={(e) => {
                                                e.preventDefault(); e.stopPropagation();
                                                clearDropGap();
                                                const data = e.dataTransfer.getData('application/x-tree-drag');
                                                if (!data) return;
                                                const { type, projectName: dragProject, fromIndex } = JSON.parse(data);
                                                if (type === 'operation' && dragProject === project.name) {
                                                    onReorderOperation(project.name, fromIndex, opIndex);
                                                }
                                            }}
                                        >
                                            <div style={{ flex: 1, height: 2, background: 'var(--apinox-tab-active-border, #4a9eff)', borderRadius: 1 }} />
                                        </div>
                                    )}
                                <TreeItem
                                    key={opId}
                                    label={op.name}
                                    type="operation"
                                    id={opId}
                                    indentLevel={1}
                                    expanded={isOpExpanded}
                                    selected={isSelected('operation', opId)}
                                    draggable
                                    dataDropType="operation"
                                    dataDropIndex={opIndex}
                                    dataDropParent={project.name}
                                    onClick={() => onSelectNode('operation', opId)}
                                    onToggle={() => toggleNode(opId)}
                                    onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, type: 'operation', data: op, projectName: project.name }); }}
                                    onDragStart={(e) => {
                                        const dragObj = { type: 'operation', projectName: project.name, fromIndex: opIndex };
                                        handleDragStart(e, makeDragData(dragObj));
                                        const el = e.currentTarget as HTMLElement;
                                        el.style.opacity = '0.3';
                                        el.style.fontSize = '10px';
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        const el = e.currentTarget as HTMLElement;
                                        const rect = el.getBoundingClientRect();
                                        const midY = rect.top + rect.height / 2;
                                        const dropAbove = e.clientY < midY;
                                        setDropGap({
                                            type: 'operation',
                                            projectName: project.name,
                                            index: dropAbove ? opIndex : opIndex + 1,
                                        });
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        clearDropGap();
                                        const el = e.currentTarget as HTMLElement;
                                        const rect = el.getBoundingClientRect();
                                        const midY = rect.top + rect.height / 2;
                                        const targetIndex = e.clientY < midY ? opIndex : opIndex + 1;
                                        const data = e.dataTransfer.getData('application/x-tree-drag');
                                        if (!data) return;
                                        const { type, projectName: dragProject, fromIndex } = JSON.parse(data);
                                        if (type === 'operation' && dragProject === project.name) {
                                            onReorderOperation(project.name, fromIndex, targetIndex);
                                        }
                                    }}
                                    onDragEnd={(e) => {
                                        const el = e.currentTarget as HTMLElement;
                                        el.style.opacity = '';
                                        el.style.fontSize = '';
                                        clearDropGap();
                                    }}
                                >
                                    {(op.requests || []).filter(req => !req.name.startsWith('sample_')).map((req: ApiRequest, reqFilteredIndex: number) => {
                                        const reqId = req.id || req.name;
                                        // Find the real index in the full (unfiltered) requests array
                                        const fullReqIndex = (op.requests || []).findIndex(r => (r.id || r.name) === reqId);
                                        const showReqGapBefore = dropGap?.type === 'request' && dropGap?.projectName === project.name && dropGap?.operationName === op.name && dropGap?.index === fullReqIndex;
                                        return (
                                            <React.Fragment key={reqId}>
                                                {showReqGapBefore && (
                                                    <div
                                                        style={{ height: 24, display: 'flex', alignItems: 'center', paddingLeft: 48 }}
                                                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                                        onDrop={(e) => {
                                                            e.preventDefault(); e.stopPropagation();
                                                            clearDropGap();
                                                            const data = e.dataTransfer.getData('application/x-tree-drag');
                                                            if (!data) return;
                                                            const { type, projectName: dragProject, operationName: dragOp, fromIndex } = JSON.parse(data);
                                                            if (type === 'request' && dragProject === project.name && dragOp === op.name) {
                                                                onReorderRequest(project.name, op.name, fromIndex, fullReqIndex);
                                                            }
                                                        }}
                                                    >
                                                        <div style={{ flex: 1, height: 2, background: 'var(--apinox-tab-active-border, #4a9eff)', borderRadius: 1 }} />
                                                    </div>
                                                )}
                                            <TreeItem
                                                key={reqId}
                                                label={req.name}
                                                type="request"
                                                id={reqId}
                                                indentLevel={2}
                                                draggable
                                                dataDropType="request"
                                                dataDropIndex={fullReqIndex}
                                                dataDropParent={`${project.name}::${op.name}`}
                                                selected={isSelected('request', reqId)}
                                                onClick={() => onSelectNode('request', reqId)}
                                                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCtxMenu({ x: e.clientX, y: e.clientY, type: 'request', data: req, projectName: project.name, operationName: op.name }); }}
                                                onDragStart={(e) => {
                                                    const dragObj = { type: 'request', projectName: project.name, operationName: op.name, fromIndex: fullReqIndex };
                                                    handleDragStart(e, makeDragData(dragObj));
                                                    const el = e.currentTarget as HTMLElement;
                                                    el.style.opacity = '0.3';
                                                    el.style.fontSize = '10px';
                                                }}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    e.dataTransfer.dropEffect = 'move';
                                                    const el = e.currentTarget as HTMLElement;
                                                    const rect = el.getBoundingClientRect();
                                                    const midY = rect.top + rect.height / 2;
                                                    const dropAbove = e.clientY < midY;
                                                    setDropGap({
                                                        type: 'request',
                                                        projectName: project.name,
                                                        operationName: op.name,
                                                        index: dropAbove ? fullReqIndex : fullReqIndex + 1,
                                                    });
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    clearDropGap();
                                                    const el = e.currentTarget as HTMLElement;
                                                    const rect = el.getBoundingClientRect();
                                                    const midY = rect.top + rect.height / 2;
                                                    const targetIndex = e.clientY < midY ? fullReqIndex : fullReqIndex + 1;
                                                    const data = e.dataTransfer.getData('application/x-tree-drag');
                                                    if (!data) return;
                                                    const { type, projectName: dragProject, operationName, fromIndex } = JSON.parse(data);
                                                    if (type === 'request' && dragProject === project.name && operationName === op.name) {
                                                        onReorderRequest(project.name, op.name, fromIndex, targetIndex);
                                                    }
                                                }}
                                                onDragEnd={(e) => {
                                                    const el = e.currentTarget as HTMLElement;
                                                    el.style.opacity = '';
                                                    el.style.fontSize = '';
                                                    clearDropGap();
                                                }}
                                            />
                                            </React.Fragment>
                                        );
                                    })}
                                    {/* Gap after last request */}
                                    {dropGap?.type === 'request' && dropGap?.projectName === project.name && dropGap?.operationName === op.name && dropGap?.index === (op.requests || []).length && (
                                        <div key="gap-after-last-req"
                                            style={{ height: 24, display: 'flex', alignItems: 'center', paddingLeft: 48 }}
                                            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                            onDrop={(e) => {
                                                e.preventDefault(); e.stopPropagation();
                                                clearDropGap();
                                                const data = e.dataTransfer.getData('application/x-tree-drag');
                                                if (!data) return;
                                                const { type, projectName: dragProject, operationName: dragOp, fromIndex } = JSON.parse(data);
                                                if (type === 'request' && dragProject === project.name && dragOp === op.name) {
                                                    onReorderRequest(project.name, op.name, fromIndex, (op.requests || []).length);
                                                }
                                            }}
                                        >
                                            <div style={{ flex: 1, height: 2, background: 'var(--apinox-tab-active-border, #4a9eff)', borderRadius: 1 }} />
                                        </div>
                                    )}
                                </TreeItem>
                                </React.Fragment>
                            );
                        })}
                        {/* Gap after last operation */}
                        {dropGap?.type === 'operation' && dropGap?.projectName === project.name && dropGap?.index === (project.operations || []).length && (
                            <div key="gap-after-last-op"
                                style={{ height: 24, display: 'flex', alignItems: 'center', paddingLeft: 24 }}
                                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                                onDrop={(e) => {
                                    e.preventDefault(); e.stopPropagation();
                                    clearDropGap();
                                    const data = e.dataTransfer.getData('application/x-tree-drag');
                                    if (!data) return;
                                    const { type, projectName: dragProject, fromIndex } = JSON.parse(data);
                                    if (type === 'operation' && dragProject === project.name) {
                                        onReorderOperation(project.name, fromIndex, (project.operations || []).length);
                                    }
                                }}
                            >
                                <div style={{ flex: 1, height: 2, background: 'var(--apinox-tab-active-border, #4a9eff)', borderRadius: 1 }} />
                            </div>
                        )}
                    </TreeItem>
                );
            })}

            {ctxMenu && (
                <SidebarContextMenu
                    x={ctxMenu.x}
                    y={ctxMenu.y}
                    sections={buildSections(ctxMenu)}
                    onClose={closeCtxMenu}
                />
            )}
        </div>

        {/* F-01 / R-05 — Quick Requests (scrapbook) bottom section.
            Q1(a): rendered below the project tree, mirroring the legacy
            placement in ApiExplorerSidebar. The tree scrolls in the flex
            area above; this section keeps its own (short) scroll area so a
            long scrapbook list never pushes the tree out of view. */}
        {scrapbook && (
            <div
                data-testid="unified-quick-requests"
                style={{
                    flexShrink: 0,
                    borderTop: '1px solid var(--apinox-border)',
                    maxHeight: '40%',
                    minHeight: 80,
                    overflowY: 'auto',
                }}
            >
                <ScrapbookPanel
                    requests={scrapbook.requests}
                    selectedRequest={scrapbook.selectedRequest}
                    loading={scrapbook.loading}
                    onCreateRequest={scrapbook.onCreateRequest}
                    onSelectRequest={scrapbook.onSelectRequest}
                    onDeleteRequest={scrapbook.onDeleteRequest}
                    onExecuteRequest={scrapbook.onExecuteRequest}
                />
            </div>
        )}
    </div>
    );
};
