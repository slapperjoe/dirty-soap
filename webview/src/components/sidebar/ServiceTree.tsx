import React from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, Save } from 'lucide-react';
import { SoapUIInterface, SoapUIOperation, SoapUIRequest, SoapUIProject } from '../../models';
import { HeaderButton, OperationItem, RequestItem, DirtyMarker } from './shared/SidebarStyles';

export interface ServiceTreeProps {
    interfaces: SoapUIInterface[];
    projects?: SoapUIProject[]; // For lookup when in project view
    isExplorer: boolean;

    // State
    selectedInterface: SoapUIInterface | null;
    selectedOperation: SoapUIOperation | null;
    selectedRequest: SoapUIRequest | null;
    confirmDeleteId: string | null;


    // Actions
    onToggleInterface: (iface: SoapUIInterface) => void;
    onSelectInterface: (iface: SoapUIInterface) => void;
    onToggleOperation: (op: SoapUIOperation, iface: SoapUIInterface) => void;
    onSelectOperation: (op: SoapUIOperation, iface: SoapUIInterface) => void;
    onSelectRequest: (req: SoapUIRequest, op: SoapUIOperation, iface: SoapUIInterface) => void;
    onContextMenu: (e: React.MouseEvent, type: string, data: any) => void;

    // Explorer Specific
    onAddToProject?: (iface: SoapUIInterface) => void;
    onRemoveFromExplorer?: (iface: SoapUIInterface) => void;

    // Project Specific
    onDeleteInterface?: (iface: SoapUIInterface) => void;
    onAddRequest?: (op: SoapUIOperation) => void;
    onDeleteOperation?: (op: SoapUIOperation, iface: SoapUIInterface) => void;
    onDeleteRequest?: (req: SoapUIRequest) => void;
    onSaveProject?: () => void; // Saves the parent project
    recentlySaved?: boolean; // True if project was recently saved (for green confirmation)

    setConfirmDeleteId: (id: string | null) => void;


}

export const ServiceTree: React.FC<ServiceTreeProps> = ({
    interfaces,
    isExplorer,
    selectedInterface,
    selectedOperation,
    selectedRequest,
    confirmDeleteId,

    onToggleInterface,
    onSelectInterface,
    onToggleOperation,
    onSelectOperation,
    onSelectRequest,
    onContextMenu,
    onAddToProject,
    onRemoveFromExplorer,
    onDeleteInterface,
    onAddRequest,
    onDeleteOperation,
    onDeleteRequest,
    onSaveProject,
    recentlySaved,
    setConfirmDeleteId

}) => {
    return (
        <>
            {interfaces.map((iface, i) => (
                <div key={i}>
                    <OperationItem
                        active={selectedInterface === iface}
                        onContextMenu={(e) => onContextMenu(e, 'interface', iface)}
                        onClick={() => onSelectInterface(iface)}
                        style={{ paddingLeft: 20 }}
                    >
                        <span
                            onClick={(e) => { e.stopPropagation(); onToggleInterface(iface); }}
                            style={{ marginRight: 5, display: 'flex', cursor: 'pointer' }}
                        >
                            {(iface as any).expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {iface.name} {isExplorer ? '(Preview)' : ''}
                        </span>
                        {isExplorer && selectedInterface === iface && onAddToProject && onRemoveFromExplorer && (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <HeaderButton onClick={(e) => { e.stopPropagation(); onAddToProject(iface); }} title="Add to Project">
                                    <Plus size={14} />
                                </HeaderButton>
                                <HeaderButton onClick={(e) => { e.stopPropagation(); onRemoveFromExplorer(iface); }} title="Remove from Explorer">
                                    <Trash2 size={14} />
                                </HeaderButton>
                            </div>
                        )}
                        {!isExplorer && selectedInterface === iface && onDeleteInterface && (
                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                                <HeaderButton
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirmDeleteId === iface.name) {
                                            onDeleteInterface(iface);
                                            setConfirmDeleteId(null);
                                        } else {
                                            setConfirmDeleteId(iface.name);
                                            setTimeout(() => setConfirmDeleteId(null), 3000);
                                        }
                                    }}
                                    title={confirmDeleteId === iface.name ? "Click again to Confirm Delete" : "Delete Interface"}
                                    style={{ color: confirmDeleteId === iface.name ? 'var(--vscode-errorForeground)' : undefined }}
                                    shake={confirmDeleteId === iface.name}
                                >
                                    <Trash2 size={12} />
                                </HeaderButton>
                            </div>
                        )}
                    </OperationItem>
                    {(iface as any).expanded !== false && iface.operations.map((op: any, j: number) => {
                        const hasSingleRequest = op.requests.length === 1;
                        const singleRequest = hasSingleRequest ? op.requests[0] : null;

                        return (
                            <div key={j} style={{ marginLeft: 15 }}>
                                <OperationItem
                                    active={selectedOperation === op && (!hasSingleRequest || selectedRequest === singleRequest)}
                                    onClick={() => onSelectOperation(op, iface)}
                                    onContextMenu={(e) => onContextMenu(e, 'operation', op)}
                                >
                                    <span style={{ marginRight: 5, display: 'flex', alignItems: 'center', width: 14 }}>
                                        {!hasSingleRequest && (
                                            <div onClick={(e) => { e.stopPropagation(); onToggleOperation(op, iface); }} style={{ display: 'flex' }}>
                                                {op.expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </div>
                                        )}
                                    </span>
                                    {op.name}
                                    {!isExplorer && hasSingleRequest && singleRequest?.dirty && <DirtyMarker>●</DirtyMarker>}
                                    {hasSingleRequest && singleRequest?.dirty && !isExplorer && onSaveProject && (
                                        <HeaderButton
                                            onClick={(e) => { e.stopPropagation(); onSaveProject(); }}
                                            title="Save Project"
                                            style={{ marginLeft: 5, color: recentlySaved ? 'var(--vscode-testing-iconPassed)' : 'inherit' }}
                                        >
                                            <Save size={12} />
                                        </HeaderButton>
                                    )}
                                    {!isExplorer && selectedOperation === op && (
                                        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                                            {onAddRequest && (
                                                <HeaderButton
                                                    onClick={(e) => { e.stopPropagation(); onAddRequest(op); }}
                                                    title="Add New Request"
                                                >
                                                    <Plus size={12} />
                                                </HeaderButton>
                                            )}
                                            {onDeleteOperation && (
                                                <HeaderButton
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const id = `op-${iface.name}-${op.name}`;
                                                        if (confirmDeleteId === id) {
                                                            onDeleteOperation(op, iface);
                                                            setConfirmDeleteId(null);
                                                        } else {
                                                            setConfirmDeleteId(id);
                                                            setTimeout(() => setConfirmDeleteId(null), 3000);
                                                        }
                                                    }}
                                                    title={confirmDeleteId === `op-${iface.name}-${op.name}` ? "Click to Confirm Delete" : "Delete Operation"}
                                                    style={{ color: confirmDeleteId === `op-${iface.name}-${op.name}` ? 'var(--vscode-errorForeground)' : undefined }}
                                                    shake={confirmDeleteId === `op-${iface.name}-${op.name}`}
                                                >
                                                    <Trash2 size={12} />
                                                </HeaderButton>
                                            )}
                                        </div>
                                    )}
                                </OperationItem>

                                {/* Render Children only if NOT single request */}
                                {!hasSingleRequest && op.expanded !== false && op.requests.map((req: any, k: number) => (
                                    <RequestItem
                                        key={k}
                                        active={selectedRequest === req}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelectRequest(req, op, iface);
                                        }}
                                        onContextMenu={(e) => onContextMenu(e, 'request', req)}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.name}</span>
                                            {!isExplorer && req.dirty && <DirtyMarker>●</DirtyMarker>}
                                            {req.dirty && !isExplorer && onSaveProject && (
                                                <HeaderButton
                                                    onClick={(e) => { e.stopPropagation(); onSaveProject(); }}
                                                    title="Save Project"
                                                >
                                                    <Save size={12} />
                                                </HeaderButton>
                                            )}
                                            {!isExplorer && onDeleteRequest && (
                                                <div style={{ marginLeft: 5 }}>
                                                    <HeaderButton
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (confirmDeleteId === req.id) {
                                                                onDeleteRequest(req);
                                                                setConfirmDeleteId(null);
                                                            } else {
                                                                setConfirmDeleteId(req.id);
                                                                setTimeout(() => setConfirmDeleteId(null), 3000);
                                                            }
                                                        }}
                                                        title={confirmDeleteId === req.id ? "Click again to Confirm Delete" : "Delete Request"}
                                                        style={{ color: confirmDeleteId === req.id ? 'var(--vscode-errorForeground)' : undefined }}
                                                        shake={confirmDeleteId === req.id}
                                                    >
                                                        <Trash2 size={12} />
                                                    </HeaderButton>
                                                </div>
                                            )}
                                        </div>
                                    </RequestItem>
                                ))}
                            </div>
                        );
                    })}
                </div>
            ))}
        </>
    );
};
