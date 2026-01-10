import React, { useState } from 'react';
import { ChevronRight, ChevronDown, FolderPlus, Plus, Trash2, Folder, Code, Globe, Zap, Save } from 'lucide-react';
import { ApinoxFolder, SoapUIRequest } from '@shared/models';
import { HeaderButton, OperationItem, RequestItem, DirtyMarker } from './shared/SidebarStyles';

export interface FolderTreeProps {
    folders: ApinoxFolder[];
    projectName: string;
    level?: number;

    // Selection
    selectedFolderId: string | null;
    setSelectedFolderId: (id: string | null) => void;
    selectedRequest: SoapUIRequest | null;
    setSelectedRequest: (req: SoapUIRequest | null) => void;
    setSelectedProjectName: (name: string | null) => void;
    setResponse: (res: any) => void;

    // Actions
    onAddFolder?: (projectName: string, parentFolderId?: string) => void;
    onAddRequest?: (projectName: string, folderId: string) => void;
    onDeleteFolder?: (projectName: string, folderId: string) => void;
    onDeleteRequest?: (req: SoapUIRequest) => void;
    onToggleFolderExpand?: (projectName: string, folderId: string) => void;
    onSaveProject?: () => void;

    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;

    handleContextMenu?: (e: React.MouseEvent, type: string, data: any) => void;

    // Inline Rename Props
    renameId?: string | null;
    renameValue?: string;
    onRenameChange?: (val: string) => void;
    onRenameSubmit?: () => void;
    onRenameCancel?: () => void;

    readOnly?: boolean;
}

export const FolderTree: React.FC<FolderTreeProps> = ({
    folders,
    projectName,
    level = 0,
    selectedFolderId,
    setSelectedFolderId,
    selectedRequest,
    setSelectedRequest,
    setSelectedProjectName,
    setResponse,
    onAddFolder,
    onAddRequest,
    onDeleteFolder,
    onDeleteRequest,
    onToggleFolderExpand,
    deleteConfirm,
    setDeleteConfirm,
    onSaveProject,
    handleContextMenu,

    renameId,
    renameValue,
    onRenameChange,
    onRenameSubmit,
    onRenameCancel,
    readOnly
}) => {
    // Track hovered folder for showing buttons
    const [_hoveredId, setHoveredId] = useState<string | null>(null);

    const handleFolderClick = (folder: ApinoxFolder) => {
        setSelectedProjectName(projectName);
        setSelectedFolderId(folder.id);
        setSelectedRequest(null);
    };

    const handleRequestClick = (req: SoapUIRequest, folder: ApinoxFolder) => {
        setSelectedProjectName(projectName);
        setSelectedFolderId(folder.id);
        setSelectedRequest(req);
        setResponse(null);
    };

    return (
        <>
            {folders.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                const isExpanded = folder.expanded !== false;
                const isRenaming = renameId === folder.id;

                return (
                    <div key={folder.id} style={{ marginLeft: level * 10 }}>
                        <OperationItem
                            active={isSelected}
                            onClick={() => handleFolderClick(folder)}
                            onMouseEnter={() => setHoveredId(folder.id)}
                            onMouseLeave={() => setHoveredId(null)}

                            onContextMenu={(e) => !readOnly && handleContextMenu && handleContextMenu(e, 'folder', folder)}
                        >
                            <span
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleFolderExpand?.(projectName, folder.id);
                                }}
                                style={{ marginRight: 5, display: 'flex', alignItems: 'center', width: 14, cursor: 'pointer' }}
                            >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            <Folder size={14} style={{ marginRight: 5, opacity: 0.7 }} />

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
                                        flex: 1
                                    }}
                                />
                            ) : (
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {folder.name}
                                </span>
                            )}

                            {/* Show buttons only when selected */}
                            {isSelected && !isRenaming && !readOnly && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    {onAddRequest && (
                                        <HeaderButton
                                            onClick={(e) => { e.stopPropagation(); onAddRequest(projectName, folder.id); }}
                                            title="Add Request"
                                        >
                                            <Plus size={12} />
                                        </HeaderButton>
                                    )}
                                    {onAddFolder && (
                                        <HeaderButton
                                            onClick={(e) => { e.stopPropagation(); onAddFolder(projectName, folder.id); }}
                                            title="Add Subfolder"
                                        >
                                            <FolderPlus size={12} />
                                        </HeaderButton>
                                    )}
                                    {onDeleteFolder && (
                                        <HeaderButton
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (deleteConfirm === folder.id) {
                                                    onDeleteFolder(projectName, folder.id);
                                                    setDeleteConfirm(null);
                                                } else {
                                                    setDeleteConfirm(folder.id);
                                                    setTimeout(() => setDeleteConfirm(null), 3000);
                                                }
                                            }}
                                            title={deleteConfirm === folder.id ? "Click again to Confirm" : "Delete Folder"}
                                            style={{ color: deleteConfirm === folder.id ? 'var(--vscode-errorForeground)' : undefined }}
                                            shake={deleteConfirm === folder.id}
                                        >
                                            <Trash2 size={12} />
                                        </HeaderButton>
                                    )}
                                </div>
                            )}
                        </OperationItem >

                        {/* Render requests when expanded */}
                        {
                            isExpanded && folder.requests.map((req) => {
                                const isReqRenaming = renameId === req.id;
                                // Determine icon and color based on request type
                                const getRequestIcon = () => {
                                    const type = req.requestType || 'soap';
                                    const iconProps = { size: 14, style: { marginRight: 6, flexShrink: 0 } };

                                    switch (type) {
                                        case 'rest':
                                            return <Globe {...iconProps} style={{ ...iconProps.style, color: '#48bb78' }} />; // Green
                                        case 'graphql':
                                            return <Zap {...iconProps} style={{ ...iconProps.style, color: '#9f7aea' }} />; // Purple
                                        case 'soap':
                                        default:
                                            return <Code {...iconProps} style={{ ...iconProps.style, color: '#4299e1' }} />; // Blue
                                    }
                                };

                                return (
                                    <RequestItem
                                        key={req.id}
                                        active={selectedRequest?.id === req.id}
                                        onClick={() => handleRequestClick(req, folder)}
                                        style={{ marginLeft: 20 }}
                                        onContextMenu={(e) => !readOnly && handleContextMenu && handleContextMenu(e, 'request', req)}
                                    >
                                        {getRequestIcon()}

                                        {isReqRenaming ? (
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
                                                    flex: 1
                                                }}
                                            />
                                        ) : (
                                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {req.name}
                                            </span>
                                        )}

                                        {!isReqRenaming && req.dirty && <DirtyMarker>●</DirtyMarker>}
                                        {/* Action Buttons */}
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            {req.dirty && onSaveProject && !isReqRenaming && !readOnly && (
                                                <HeaderButton
                                                    onClick={(e) => { e.stopPropagation(); onSaveProject(); }}
                                                    title="Save Project"
                                                >
                                                    <Save size={12} />
                                                </HeaderButton>
                                            )}
                                            {selectedRequest?.id === req.id && onDeleteRequest && !isReqRenaming && !readOnly && (
                                                <HeaderButton
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (deleteConfirm === req.id) {
                                                            onDeleteRequest(req);
                                                            setDeleteConfirm(null);
                                                        } else {
                                                            setDeleteConfirm(req.id!);
                                                            setTimeout(() => setDeleteConfirm(null), 3000);
                                                        }
                                                    }}
                                                    title={deleteConfirm === req.id ? "Click again to Confirm" : "Delete Request"}
                                                    style={{ color: deleteConfirm === req.id ? 'var(--vscode-errorForeground)' : undefined }}
                                                    shake={deleteConfirm === req.id}
                                                >
                                                    <Trash2 size={12} />
                                                </HeaderButton>
                                            )}
                                        </div>
                                    </RequestItem>
                                );
                            })
                        }

                        {/* Render nested folders */}
                        {
                            isExpanded && folder.folders && folder.folders.length > 0 && (
                                <FolderTree
                                    folders={folder.folders}
                                    projectName={projectName}
                                    level={level + 1}
                                    selectedFolderId={selectedFolderId}
                                    setSelectedFolderId={setSelectedFolderId}
                                    selectedRequest={selectedRequest}
                                    setSelectedRequest={setSelectedRequest}
                                    setSelectedProjectName={setSelectedProjectName}
                                    setResponse={setResponse}
                                    onAddFolder={onAddFolder}
                                    onAddRequest={onAddRequest}
                                    onDeleteFolder={onDeleteFolder}
                                    onDeleteRequest={onDeleteRequest}
                                    onToggleFolderExpand={onToggleFolderExpand}
                                    deleteConfirm={deleteConfirm}
                                    setDeleteConfirm={setDeleteConfirm}
                                    onSaveProject={onSaveProject}
                                    handleContextMenu={handleContextMenu}

                                    renameId={renameId}
                                    renameValue={renameValue}
                                    onRenameChange={onRenameChange}
                                    onRenameSubmit={onRenameSubmit}
                                    onRenameCancel={onRenameCancel}
                                    readOnly={readOnly}
                                />
                            )
                        }
                    </div >
                );
            })}
        </>
    );
};
