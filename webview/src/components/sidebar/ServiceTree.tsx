import React from 'react';
import { ChevronRight, ChevronDown, Plus, Trash2, Code, Globe, Zap } from 'lucide-react';
import { ApiInterface, ApiOperation, ApiRequest, ApinoxProject } from '@shared/models';
import { HeaderButton, OperationItem, RequestItem } from './shared/SidebarStyles';

interface ServiceTreeProps {
    interfaces: ApiInterface[];
    projects?: ApinoxProject[]; // For lookup when in project view
    isExplorer: boolean;

    // State
    selectedInterface: ApiInterface | null;
    selectedOperation: ApiOperation | null;
    selectedRequest: ApiRequest | null;
    confirmDeleteId: string | null;


    // Actions
    onToggleInterface: (iface: ApiInterface) => void;
    onSelectInterface: (iface: ApiInterface) => void;
    onToggleOperation: (op: ApiOperation, iface: ApiInterface) => void;
    onSelectOperation: (op: ApiOperation, iface: ApiInterface) => void;
    onSelectRequest: (req: ApiRequest, op: ApiOperation, iface: ApiInterface) => void;
    onContextMenu: (e: React.MouseEvent, type: string, data: any) => void;

    // Explorer Specific
    onAddToProject?: (iface: ApiInterface) => void;
    onRemoveFromExplorer?: (iface: ApiInterface) => void;

    // Project Specific
    onDeleteInterface?: (iface: ApiInterface) => void;
    onAddRequest?: (op: ApiOperation) => void;
    onDeleteOperation?: (op: ApiOperation, iface: ApiInterface) => void;
    onDeleteRequest?: (req: ApiRequest) => void;
    onSaveProject?: () => void; // Saves the parent project
    recentlySaved?: boolean; // True if project was recently saved (for green confirmation)

    setConfirmDeleteId: (id: string | null) => void;

    // Inline Rename Props
    renameId?: string | null;
    renameValue?: string;
    onRenameChange?: (val: string) => void;
    onRenameSubmit?: () => void;
    onRenameCancel?: () => void;
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
    setConfirmDeleteId,

    renameId,
    renameValue,
    onRenameChange,
    onRenameSubmit,
    onRenameCancel
}) => {
    return (
        <>
            {interfaces.map((iface, i) => (
                <div key={i}>
                    <OperationItem
                        $active={selectedInterface?.id && iface.id ? selectedInterface.id === iface.id : selectedInterface?.name === iface.name}
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
                        {isExplorer && selectedInterface?.name === iface.name && onAddToProject && onRemoveFromExplorer && (
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <HeaderButton onClick={(e) => { e.stopPropagation(); onAddToProject(iface); }} title="Add to Project">
                                    <Plus size={14} />
                                </HeaderButton>
                                <HeaderButton onClick={(e) => { e.stopPropagation(); onRemoveFromExplorer(iface); }} title="Remove from Explorer">
                                    <Trash2 size={14} />
                                </HeaderButton>
                            </div>
                        )}
                        {!isExplorer && selectedInterface?.name === iface.name && onDeleteInterface && (
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
                                    $shake={confirmDeleteId === iface.name}
                                >
                                    <Trash2 size={12} />
                                </HeaderButton>
                            </div>
                        )}
                    </OperationItem>
                    {(iface as any).expanded !== false && iface.operations.map((op: any, j: number) => {
                        return (
                            <div key={j} style={{ marginLeft: 15 }}>
                                <OperationItem
                                    $active={selectedOperation?.id && op.id ? selectedOperation.id === op.id : (selectedOperation?.name === op.name && selectedInterface?.name === iface.name)}
                                    onClick={() => onSelectOperation(op, iface)}
                                    onContextMenu={(e) => onContextMenu(e, 'operation', op)}
                                >
                                    <span style={{ marginRight: 5, display: 'flex', alignItems: 'center', width: 14 }}>
                                        <div onClick={(e) => { e.stopPropagation(); onToggleOperation(op, iface); }} style={{ display: 'flex' }}>
                                            {op.expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </div>
                                    </span>
                                    {op.name}
                                    {!isExplorer && selectedOperation?.name === op.name && (
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
                                                    $shake={confirmDeleteId === `op-${iface.name}-${op.name}`}
                                                >
                                                    <Trash2 size={12} />
                                                </HeaderButton>
                                            )}
                                        </div>
                                    )}
                                </OperationItem>

                                {/* Always render request children */}
                                {op.expanded !== false && op.requests.map((req: any, k: number) => {
                                    const isRenaming = renameId === req.id;
                                    return (
                                        <RequestItem
                                            key={k}
                                            $active={selectedRequest?.id === req.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onSelectRequest(req, op, iface);
                                            }}
                                            onContextMenu={(e) => onContextMenu(e, 'request', req)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', width: '100%', overflow: 'hidden' }}>
                                                {/* Request Icon */}
                                                {(() => {
                                                    const type = req.requestType || 'soap';
                                                    const iconProps = { size: 14, style: { marginRight: 6, flexShrink: 0 } };
                                                    switch (type) {
                                                        case 'rest':
                                                            return <Globe {...iconProps} style={{ ...iconProps.style, color: '#48bb78' }} />;
                                                        case 'graphql':
                                                            return <Zap {...iconProps} style={{ ...iconProps.style, color: '#9f7aea' }} />;
                                                        case 'soap':
                                                        default:
                                                            return <Code {...iconProps} style={{ ...iconProps.style, color: '#4299e1' }} />;
                                                    }
                                                })()}

                                                {isRenaming ? (
                                                    <input
                                                        type="text"
                                                        value={renameValue}
                                                        onChange={(e) => onRenameChange?.(e.target.value)}
                                                        onBlur={() => onRenameSubmit?.()}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') onRenameSubmit?.();
                                                            if (e.key === 'Escape') onRenameCancel?.();
                                                        }}
                                                        autoFocus
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{
                                                            background: 'var(--vscode-input-background)',
                                                            color: 'var(--vscode-input-foreground)',
                                                            border: '1px solid var(--vscode-input-border)',
                                                            width: '100%'
                                                        }}
                                                    />
                                                ) : (
                                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{req.name}</span>
                                                )}

                                                {!isExplorer && onDeleteRequest && !isRenaming && (
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
                                                            $shake={confirmDeleteId === req.id}
                                                        >
                                                            <Trash2 size={12} />
                                                        </HeaderButton>
                                                    </div>
                                                )}
                                            </div>
                                        </RequestItem>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            ))}
        </>
    );
};
