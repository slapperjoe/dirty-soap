import React, { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import {
    ChevronRight,
    ChevronDown,
    FolderOpen,
    FileCode,
    File,
    Server,
    Upload as UploadIcon,
    FlaskConical as FlaskConicalIcon,
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
    Pencil as PencilIcon,
} from '../sidebar/shared/SidebarContextMenu';
import { ScrapbookPanel } from '../sidebar/ScrapbookPanel';
import { RenameModal } from '../modals/RenameModal';

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

// ── Quick Requests subwindow resize constants ───────────────────────────────
// The Quick Requests section is the bottom subwindow of the unified explorer
// sidebar. The handle between the project tree and the subwindow lets the user
// drag its height; the value is clamped to the min/max below while dragging.
// Default = current visible height: section header (~36px incl. border) +
// four request rows (~24px each) ≈ 132px — preserves the legacy "4 rows" view.
export const QUICK_REQUESTS_DEFAULT_HEIGHT = 132;
// Section header (36px) + at least one request row (~24px) so the subwindow
// always shows its header and a full row.
export const QUICK_REQUESTS_MIN_HEIGHT = 64;
export const clampQuickRequestsHeight = (h: number): number => {
    if (!Number.isFinite(h)) return QUICK_REQUESTS_DEFAULT_HEIGHT;
    return Math.min(600, Math.max(QUICK_REQUESTS_MIN_HEIGHT, Math.round(h)));
};

// ── Quick Requests subwindow height persistence (t_c0116422) ────────────────
// The height the user last dragged is stored in localStorage so it survives
// an app restart. Reads are clamped with clampQuickRequestsHeight, so a
// corrupt or out-of-range saved value can never break the layout (it falls
// back to the default or clamps to the UI min/max). Writes are guarded:
// storage can be unavailable (private mode, quota) and persistence is a
// best-effort nicety — the UI keeps working if a write is skipped.
export const QUICK_REQUESTS_HEIGHT_STORAGE_KEY = 'apinox_quick_requests_height';

export const loadQuickRequestsHeight = (): number => {
    try {
        const raw = window.localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY);
        if (raw === null || raw.trim() === '') return QUICK_REQUESTS_DEFAULT_HEIGHT;
        return clampQuickRequestsHeight(Number(raw));
    } catch {
        return QUICK_REQUESTS_DEFAULT_HEIGHT;
    }
};

export const saveQuickRequestsHeight = (height: number): void => {
    try {
        window.localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, String(clampQuickRequestsHeight(height)));
    } catch {
        // Storage unavailable: skip persistence, the UI is unaffected.
    }
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

export const TreeItem: React.FC<TreeItemProps> = ({
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
                    fontSize:
                        type === 'project'
                            ? 'var(--apinox-fs-md)'
                            : 'var(--apinox-fs-sm)',
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
    /** R-10 (F-17): context-menu rename (display-only `displayName` override). */
    onRenameProject?: (projectName: string, displayName: string) => Promise<void>;
    onRenameOperation?: (projectName: string, operationName: string, displayName: string) => Promise<void>;
    onRenameRequest?: (projectName: string, operationName: string, requestName: string, displayName: string) => Promise<void>;
    onExportProject: (projectName: string) => void;
    /**
     * Phase B (t_86c34d38): relocated from the deleted PROJECTS view
     * (ProjectList header). These import/export flows still WRITE the legacy
     * nested model (a follow-up card converts them to the flat unified model),
     * which keeps working on migrated dirs (non-destructive migration).
     */
    onExportWorkspace?: () => void;
    onBulkImport?: () => void;
    onImportSoapUI?: () => void;
    /** Phase B (t_86c34d38): relocated "Generate Test Suite" (was PROJECTS-view context menu). */
    onGenerateTestSuite?: (target: ApiOperation) => void;
    /**
     * Phase B (t_86c34d38): relocated "Add to Test Case" (was the legacy shared
     * context menu on PROJECTS-view request nodes, which is deleted with the
     * view). Opens the AddToTestCaseModal for a unified request.
     */
    onAddRequestToTestCase?: (request: ApiRequest) => void;
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
    onRenameProject,
    onRenameOperation,
    onRenameRequest,
    onExportProject,
    // Phase B (t_86c34d38): relocated import/export + generate-test-suite.
    onExportWorkspace,
    onBulkImport,
    onImportSoapUI,
    onGenerateTestSuite,
    onAddRequestToTestCase,
    onReorderOperation,
    onReorderRequest,
    scrapbook,
}) => {
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
    const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);
    const closeCtxMenu = () => setCtxMenu(null);

    // R-10 (F-17): rename state — the modal edits a display-only `displayName`
    // override; the stable `name` (directory / WSDL binding / selection
    // identity) never changes, so selection survives a rename.
    const [renameTarget, setRenameTarget] = useState<{
        type: 'project' | 'operation' | 'request';
        projectName: string;
        operationName?: string;
        requestName?: string;
        initial: string;
    } | null>(null);

    const handleRenameSave = useCallback(async (displayName: string) => {
        if (!renameTarget) return;
        const { type, projectName, operationName, requestName } = renameTarget;
        const trimmed = displayName.trim();
        setRenameTarget(null);
        try {
            if (type === 'project' && onRenameProject) {
                await onRenameProject(projectName, trimmed);
            } else if (type === 'operation' && onRenameOperation) {
                await onRenameOperation(projectName, operationName || '', trimmed);
            } else if (type === 'request' && onRenameRequest) {
                await onRenameRequest(projectName, operationName || '', requestName || '', trimmed);
            }
        } catch (e) {
            console.error('[UnifiedExplorerSidebar] Rename failed:', e);
        }
    }, [renameTarget, onRenameProject, onRenameOperation, onRenameRequest]);

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

    // Quick Requests subwindow height (vertical resize via the handle above
    // the section). Seeded synchronously from localStorage during the first
    // render (lazy initializer), so the saved height is applied before first
    // paint — no default→saved flicker. The clamp keeps any saved value
    // inside the UI min/max; without a saved value the default is used.
    const [quickRequestsHeight, setQuickRequestsHeight] = useState<number>(() => loadQuickRequestsHeight());
    // The drag listeners are created once at mousedown, so they read the
    // latest height from this ref (kept in sync where the state is written)
    // to persist it on resize end without a stale closure.
    const quickRequestsHeightRef = useRef(quickRequestsHeight);
    const [handleHovered, setHandleHovered] = useState(false);
    const isResizingQuickRequests = useRef(false);

    // The drag handler reads the container's current height on each move, so
    // an ancestor window resize mid-drag cannot break the clamp.
    const quickRequestsContainerRef = useRef<HTMLDivElement | null>(null);

    const handleQuickRequestsResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const container = quickRequestsContainerRef.current;
        if (!container) return;
        isResizingQuickRequests.current = true;
        const containerTop = container.getBoundingClientRect().top;

        const handleMove = (ev: MouseEvent) => {
            if (!isResizingQuickRequests.current) return;
            const containerHeight = container.getBoundingClientRect().height;
            // New subwindow height = distance from the pointer down to the
            // container's top edge, clamped to [min, max]; the max also keeps
            // the project tree visible (it needs at least the min height).
            const max = Math.max(QUICK_REQUESTS_MIN_HEIGHT, Math.floor(containerHeight - QUICK_REQUESTS_MIN_HEIGHT));
            const next = ev.clientY - containerTop;
            const clamped = Math.min(max, Math.max(QUICK_REQUESTS_MIN_HEIGHT, Math.round(next)));
            quickRequestsHeightRef.current = clamped;
            setQuickRequestsHeight(clamped);
        };
        const handleEnd = () => {
            isResizingQuickRequests.current = false;
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('mouseup', handleEnd);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            // Persist once per gesture, at resize end — the final clamped
            // value. A single write needs no debounce.
            saveQuickRequestsHeight(quickRequestsHeightRef.current);
        };
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'row-resize';
        document.addEventListener('mousemove', handleMove);
        document.addEventListener('mouseup', handleEnd);
    }, []);

    // Release the pointer-drag affordance if the mouseup happens off-window.
    // If the blur ends a drag that never got its mouseup, persist the
    // reached height — otherwise that last resize would be lost.
    useEffect(() => {
        const reset = () => {
            if (isResizingQuickRequests.current) {
                saveQuickRequestsHeight(quickRequestsHeightRef.current);
            }
            isResizingQuickRequests.current = false;
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
        window.addEventListener('blur', reset);
        return () => window.removeEventListener('blur', reset);
    }, []);

    // On startup the saved height is clamped against the live container once
    // layout is known: a value saved while the window was large must not
    // overflow a smaller one (which would push the subwindow out of the
    // sidebar). useLayoutEffect so the correction lands before paint; in
    // non-layout environments (jsdom) the rect height is 0 and this is a
    // no-op. The stored value is deliberately NOT rewritten — only the
    // displayed height is clamped, so a later, larger window restores the
    // original saved height.
    useLayoutEffect(() => {
        const container = quickRequestsContainerRef.current;
        if (!container) return;
        const containerHeight = container.getBoundingClientRect().height;
        if (containerHeight <= 0) return;
        const max = Math.max(QUICK_REQUESTS_MIN_HEIGHT, Math.floor(containerHeight - QUICK_REQUESTS_MIN_HEIGHT));
        if (quickRequestsHeightRef.current > max) {
            quickRequestsHeightRef.current = max;
            setQuickRequestsHeight(max);
        }
    }, []);

    const buildSections = (state: CtxMenuState): CtxMenuSection[] => {
        const items: CtxMenuItem[] = [];

        // R-10 (F-17): display-only rename — available on every node type.
        items.push({ icon: PencilIcon, label: 'Rename', onClick: () => {
            if (state.type === 'project') {
                const project = state.data as UnifiedProject;
                setRenameTarget({ type: 'project', projectName: project.name, initial: project.displayName || project.name });
            } else if (state.type === 'operation') {
                const op = state.data as ApiOperation;
                setRenameTarget({ type: 'operation', projectName: state.projectName || '', operationName: op.name, initial: op.displayName || op.name });
            } else {
                const req = state.data as ApiRequest;
                setRenameTarget({ type: 'request', projectName: state.projectName || '', operationName: state.operationName, requestName: req.name, initial: req.displayName || req.name });
            }
            closeCtxMenu();
        }});

        if (state.type === 'project') {
            const project = state.data as UnifiedProject;
            items.push({ icon: RefreshCwIcon, label: 'Refresh WSDL', sub: project.sourceUrl || 'Reload operations', onClick: () => { onRefreshProject(project.name); closeCtxMenu(); } });
            items.push({ icon: DownloadIcon, label: 'Export Project', onClick: () => { onExportProject(project.name); closeCtxMenu(); } });
            // Phase B (t_86c34d38): relocated from the deleted PROJECTS view
            // (ProjectList "Import & Export" header menu).
            if (onExportWorkspace) {
                items.push({ icon: UploadIcon, label: 'Export Workspace', onClick: () => { onExportWorkspace(); closeCtxMenu(); } });
            }
            if (onBulkImport) {
                items.push({ icon: DownloadIcon, label: 'Bulk Import', onClick: () => { onBulkImport(); closeCtxMenu(); } });
            }
            if (onImportSoapUI) {
                items.push({ icon: DownloadIcon, label: 'Import SoapUI Workspace', onClick: () => { onImportSoapUI(); closeCtxMenu(); } });
            }
        } else if (state.type === 'operation') {
            const op = state.data as ApiOperation;
            items.push({ icon: PlusIcon, label: 'New Request', onClick: () => { onNewRequest(state.projectName || '', op.name); closeCtxMenu(); } });
            // Phase B (t_86c34d38): relocated from the PROJECTS-view context menu.
            if (onGenerateTestSuite) {
                items.push({ icon: FlaskConicalIcon, label: 'Generate Test Suite', onClick: () => { onGenerateTestSuite(op); closeCtxMenu(); } });
            }
        } else if (state.type === 'request') {
            const req = state.data as ApiRequest;
            if (req.endpoint) {
                items.push({ icon: Link, label: 'Copy URL', copyText: req.endpoint });
            }
            items.push({ icon: Copy, label: 'Copy Request XML', copyText: req.request || '' });
            // Phase B (t_86c34d38): relocated from the deleted legacy context
            // menu — the TESTS "Add Request to Test Case" flow stays reachable.
            if (onAddRequestToTestCase) {
                items.push({ icon: FlaskConicalIcon, label: 'Add to Test Case', onClick: () => { onAddRequestToTestCase(req); closeCtxMenu(); } });
            }
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
            ref={quickRequestsContainerRef}
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
                        label={project.displayName || project.name}
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
                                    label={op.displayName || op.name}
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
                                    {(op.requests || []).filter(req => !req.name.startsWith('sample_')).map((req: ApiRequest) => {
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
                                                label={req.displayName || req.name}
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

            {/* R-10 (F-17): display-only rename modal. Saving an empty name
                clears the override (falls back to the stable name). */}
            <RenameModal
                isOpen={!!renameTarget}
                title={renameTarget ? `Rename ${renameTarget.type}` : 'Rename'}
                initialValue={renameTarget?.initial || ''}
                onSave={handleRenameSave}
                onCancel={() => setRenameTarget(null)}
            />
        </div>

        {/* F-01 / R-05 — Quick Requests (scrapbook) bottom section.
            Q1(a): rendered below the project tree, mirroring the legacy
            placement in ApiExplorerSidebar. The subwindow is vertically
            resizable via the handle above it; the project tree scrolls in the
            flex area above, and the request list scrolls inside the
            subwindow so a tall scrapbook never pushes the tree out of view. */}
        {scrapbook && (
            <>
                {/* Vertical resize handle between the project tree and the
                    Quick Requests subwindow. */}
                <div
                    data-testid="unified-quick-requests-resize-handle"
                    onMouseDown={handleQuickRequestsResizeStart}
                    onMouseEnter={() => setHandleHovered(true)}
                    onMouseLeave={() => setHandleHovered(false)}
                    style={{
                        flexShrink: 0,
                        height: 4,
                        cursor: 'row-resize',
                        background: handleHovered
                            ? 'var(--apinox-tab-active-border, var(--apinox-border, #3c3c3c))'
                            : 'transparent',
                        transition: 'background 0.2s',
                    }}
                />

                <div
                    data-testid="unified-quick-requests"
                    style={{
                        flexShrink: 0,
                        borderTop: '1px solid var(--apinox-border)',
                        height: quickRequestsHeight,
                        minHeight: QUICK_REQUESTS_MIN_HEIGHT,
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    <ScrapbookPanel
                        fill
                        requests={scrapbook.requests}
                        selectedRequest={scrapbook.selectedRequest}
                        loading={scrapbook.loading}
                        onCreateRequest={scrapbook.onCreateRequest}
                        onSelectRequest={scrapbook.onSelectRequest}
                        onDeleteRequest={scrapbook.onDeleteRequest}
                        onExecuteRequest={scrapbook.onExecuteRequest}
                    />
                </div>
            </>
        )}
    </div>
    );
};
