import React, { useState } from 'react';
import styled from 'styled-components';
import { ChevronRight, ChevronDown, FolderPlus, Plus, Trash2, Folder, Code, Globe, Zap } from 'lucide-react';
import { ApinoxFolder, ApiRequest } from '@shared/models';
import { HeaderButton, OperationItem, RequestItem } from './shared/SidebarStyles';

const FolderWrapper = styled.div<{ $level: number }>`
    margin-left: ${props => props.$level * 10}px;
`;

const Toggle = styled.span`
    margin-right: 5px;
    display: flex;
    align-items: center;
    width: 14px;
    cursor: pointer;
`;

const FolderIcon = styled(Folder)`
    margin-right: 5px;
    opacity: 0.7;
`;

const FolderName = styled.span`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RenameInput = styled.input`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    flex: 1;
`;

const Actions = styled.div`
    display: flex;
    align-items: center;
    gap: 2px;
`;

const RequestRow = styled(RequestItem)`
    margin-left: 20px;
`;

const RequestName = styled.span`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RequestActions = styled.div`
    display: flex;
    gap: 4px;
`;

const DangerButton = styled(HeaderButton)<{ $danger?: boolean }>`
    color: ${props => props.$danger ? 'var(--vscode-errorForeground)' : 'var(--vscode-icon-foreground)'};
`;

const SoapIcon = styled(Code)`
    margin-right: 6px;
    flex-shrink: 0;
    color: #4299e1;
`;

const RestIcon = styled(Globe)`
    margin-right: 6px;
    flex-shrink: 0;
    color: #48bb78;
`;

const GraphqlIcon = styled(Zap)`
    margin-right: 6px;
    flex-shrink: 0;
    color: #9f7aea;
`;

interface FolderTreeProps {
    folders: ApinoxFolder[];
    projectName: string;
    level?: number;

    // Selection
    selectedFolderId: string | null;
    setSelectedFolderId?: (id: string | null) => void;
    selectedRequest: ApiRequest | null;
    setSelectedRequest: (req: ApiRequest | null) => void;
    setSelectedProjectName: (name: string | null) => void;
    setResponse: (res: any) => void;

    // Actions
    onAddFolder?: (projectName: string, parentFolderId?: string) => void;
    onAddRequest?: (projectName: string, folderId: string) => void;
    onDeleteFolder?: (projectName: string, folderId: string) => void;
    onDeleteRequest?: (req: ApiRequest) => void;
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
        setSelectedFolderId?.(folder.id);
        setSelectedRequest(null);
    };

    const handleRequestClick = (req: ApiRequest, folder: ApinoxFolder) => {
        setSelectedProjectName(projectName);
        setSelectedFolderId?.(folder.id);
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
                    <FolderWrapper key={folder.id} $level={level}>
                        <OperationItem
                            $active={isSelected}
                            onClick={() => handleFolderClick(folder)}
                            onMouseEnter={() => setHoveredId(folder.id)}
                            onMouseLeave={() => setHoveredId(null)}

                            onContextMenu={(e) => !readOnly && handleContextMenu && handleContextMenu(e, 'folder', folder)}
                        >
                            <Toggle
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleFolderExpand?.(projectName, folder.id);
                                }}
                            >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </Toggle>
                            <FolderIcon size={14} />

                            {isRenaming ? (
                                <RenameInput
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
                                    title="Rename folder"
                                    placeholder="Folder name"
                                />
                            ) : (
                                <FolderName>{folder.name}</FolderName>
                            )}

                            {/* Show buttons only when selected */}
                            {isSelected && !isRenaming && !readOnly && (
                                <Actions>
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
                                        <DangerButton
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
                                            $danger={deleteConfirm === folder.id}
                                            $shake={deleteConfirm === folder.id}
                                        >
                                            <Trash2 size={12} />
                                        </DangerButton>
                                    )}
                                </Actions>
                            )}
                        </OperationItem >

                        {/* Render requests when expanded */}
                        {
                            isExpanded && folder.requests.map((req) => {
                                const isReqRenaming = renameId === req.id;
                                // Determine icon and color based on request type
                                const getRequestIcon = () => {
                                    const type = req.requestType || 'soap';
                                    switch (type) {
                                        case 'rest':
                                            return <RestIcon size={14} />; // Green
                                        case 'graphql':
                                            return <GraphqlIcon size={14} />; // Purple
                                        case 'soap':
                                        default:
                                            return <SoapIcon size={14} />; // Blue
                                    }
                                };

                                return (
                                    <RequestRow
                                        key={req.id}
                                        $active={selectedRequest?.id === req.id}
                                        onClick={() => handleRequestClick(req, folder)}
                                        onContextMenu={(e) => !readOnly && handleContextMenu && handleContextMenu(e, 'request', req)}
                                    >
                                        {getRequestIcon()}

                                        {isReqRenaming ? (
                                            <RenameInput
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
                                                title="Rename request"
                                                placeholder="Request name"
                                            />
                                        ) : (
                                            <RequestName>{req.name}</RequestName>
                                        )}

                                        {/* Action Buttons */}
                                        <RequestActions>
                                            {selectedRequest?.id === req.id && onDeleteRequest && !isReqRenaming && !readOnly && (
                                                <DangerButton
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
                                                    $danger={deleteConfirm === req.id}
                                                    $shake={deleteConfirm === req.id}
                                                >
                                                    <Trash2 size={12} />
                                                </DangerButton>
                                            )}
                                        </RequestActions>
                                    </RequestRow>
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
                    </FolderWrapper>
                );
            })}
        </>
    );
};
