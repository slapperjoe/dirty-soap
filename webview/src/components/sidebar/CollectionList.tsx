/**
 * CollectionList - Sidebar component for displaying REST API collections
 * Similar to ProjectList but for REST/GraphQL requests organized in collections
 */

import React from 'react';
import styled, { css } from 'styled-components';
import { Plus, ChevronDown, ChevronRight, Folder, FolderOpen, Trash2, FileJson } from 'lucide-react';
import { RestCollection, RestFolder, ApiRequest } from '@shared/models';
import { HeaderButton, OperationItem, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderActions, SidebarHeaderTitle, shake } from './shared/SidebarStyles';

interface CollectionListProps {
    collections: RestCollection[];

    // Selection
    selectedCollectionId: string | null;
    setSelectedCollectionId: (id: string | null) => void;
    selectedRequest: ApiRequest | null;
    setSelectedRequest: (req: ApiRequest | null) => void;
    setResponse: (res: any) => void;

    // Actions
    onAddCollection: () => void;
    onAddRequest: (collectionId: string, folderId?: string) => void;
    onAddFolder: (collectionId: string, parentFolderId?: string) => void;
    onDeleteCollection?: (collection: RestCollection) => void;
    onDeleteFolder?: (folder: RestFolder, collectionId: string) => void;
    onDeleteRequest?: (req: ApiRequest) => void;
    onRenameCollection?: (collection: RestCollection, newName: string) => void;

    // Toggle expansion
    toggleCollectionExpand: (collectionId: string) => void;
    toggleFolderExpand: (collectionId: string, folderId: string) => void;

    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;
}

const CollectionContainer = styled(SidebarContainer)`
    overflow: hidden;
`;

const CollectionContent = styled(SidebarContent)`
    overflow-y: auto;
`;

const RequestRow = styled(OperationItem)<{ $isDeleting: boolean; $isSelected: boolean }>`
    padding-left: 28px;
    background-color: ${props => props.$isDeleting
        ? 'var(--vscode-inputValidation-errorBackground)'
        : props.$isSelected
            ? 'var(--vscode-list-activeSelectionBackground)'
            : 'transparent'};
    color: ${props => props.$isDeleting
        ? 'var(--vscode-errorForeground)'
        : props.$isSelected
            ? 'var(--vscode-list-activeSelectionForeground)'
            : 'inherit'};
    ${props => props.$isDeleting && css`animation: ${shake} 0.3s ease-in-out;`}
`;

const RequestIcon = styled(FileJson)`
    margin-right: 6px;
    opacity: 0.7;
`;

const MethodBadge = styled.span<{ $color: string }>`
    font-size: 10px;
    font-weight: 600;
    margin-right: 6px;
    color: ${props => props.$color};
`;

const RequestName = styled.span`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RequestDelete = styled(Trash2)`
    opacity: 0.5;
    margin-left: 4px;
    cursor: pointer;
`;

const FolderRow = styled(OperationItem)<{ $level: number }>`
    padding-left: ${props => 12 + props.$level * 12}px;
`;

const FolderIcon = styled(Folder)`
    margin-left: 4px;
`;

const FolderOpenIcon = styled(FolderOpen)`
    margin-left: 4px;
`;

const FolderName = styled.span`
    margin-left: 6px;
    font-weight: 500;
`;

const EmptyCollections = styled.div`
    opacity: 0.6;
    font-style: italic;
    text-align: center;
    padding: 20px;
    font-size: 12px;
`;

const CollectionRow = styled(OperationItem)<{ $isDeleting: boolean; $isSelected: boolean }>`
    font-weight: bold;
    background-color: ${props => props.$isDeleting
        ? 'var(--vscode-inputValidation-errorBackground)'
        : props.$isSelected
            ? 'var(--vscode-list-activeSelectionBackground)'
            : 'transparent'};
    color: ${props => props.$isDeleting ? 'var(--vscode-errorForeground)' : 'inherit'};
    ${props => props.$isDeleting && css`animation: ${shake} 0.3s ease-in-out;`}
`;

const CollectionFolderIcon = styled(Folder)`
    margin-left: 4px;
`;

const CollectionName = styled.span`
    margin-left: 6px;
    flex: 1;
`;

const CollectionAction = styled.div`
    display: flex;
    align-items: center;
    cursor: pointer;
`;

const AddRequestIcon = styled(Plus)`
    opacity: 0.5;
    margin-left: 4px;
`;

const DeleteCollectionIcon = styled(Trash2)`
    opacity: 0.5;
    margin-left: 4px;
    cursor: pointer;
`;

const EmptyCollectionRequests = styled.div`
    padding-left: 28px;
    opacity: 0.5;
    font-size: 11px;
    font-style: italic;
`;

const RequestItem: React.FC<{
    request: ApiRequest;
    isSelected: boolean;
    onClick: () => void;
    onDelete?: () => void;
    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;
}> = ({ request, isSelected, onClick, onDelete, deleteConfirm, setDeleteConfirm }) => {
    const methodColors: Record<string, string> = {
        'GET': 'var(--vscode-charts-green)',
        'POST': 'var(--vscode-charts-blue)',
        'PUT': 'var(--vscode-charts-orange)',
        'PATCH': 'var(--vscode-charts-yellow)',
        'DELETE': 'var(--vscode-charts-red)',
    };

    const method = request.method || 'GET';
    const isDeleting = deleteConfirm === request.id;

    return (
        <RequestRow
            $isDeleting={isDeleting}
            $isSelected={isSelected}
            onClick={isDeleting ? () => {
                onDelete?.();
                setDeleteConfirm(null);
            } : onClick}
        >
            <RequestIcon size={14} />
            <MethodBadge $color={methodColors[method] || 'var(--vscode-foreground)'}>
                {method}
            </MethodBadge>
            <RequestName>{request.name}</RequestName>
            {onDelete && !isDeleting && (
                <RequestDelete
                    size={12}
                    onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(request.id || null);
                    }}
                />
            )}
        </RequestRow>
    );
};

const FolderItem: React.FC<{
    folder: RestFolder;
    collectionId: string;
    level: number;
    selectedRequest: ApiRequest | null;
    onSelectRequest: (req: ApiRequest) => void;
    onToggleExpand: () => void;
    onAddRequest?: () => void;
    onDeleteRequest?: (req: ApiRequest) => void;
    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;
}> = ({
    folder,
    level,
    selectedRequest,
    onSelectRequest,
    onToggleExpand,
    onDeleteRequest,
    deleteConfirm,
    setDeleteConfirm
}) => {
        const isExpanded = folder.expanded ?? true;

        return (
            <div>
                <FolderRow
                    $level={level}
                    onClick={onToggleExpand}
                >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {isExpanded ? <FolderOpenIcon size={14} /> : <FolderIcon size={14} />}
                    <FolderName>{folder.name}</FolderName>
                </FolderRow>

                {isExpanded && (
                    <>
                        {/* Nested folders */}
                        {folder.folders?.map(subFolder => (
                            <FolderItem
                                key={subFolder.id}
                                folder={subFolder}
                                collectionId=""
                                level={level + 1}
                                selectedRequest={selectedRequest}
                                onSelectRequest={onSelectRequest}
                                onToggleExpand={() => { }}
                                onDeleteRequest={onDeleteRequest}
                                deleteConfirm={deleteConfirm}
                                setDeleteConfirm={setDeleteConfirm}
                            />
                        ))}

                        {/* Requests in folder */}
                        {folder.requests.map(req => (
                            <RequestItem
                                key={req.id}
                                request={req}
                                isSelected={selectedRequest?.id === req.id}
                                onClick={() => onSelectRequest(req)}
                                onDelete={() => onDeleteRequest?.(req)}
                                deleteConfirm={deleteConfirm}
                                setDeleteConfirm={setDeleteConfirm}
                            />
                        ))}
                    </>
                )}
            </div>
        );
    };

export const CollectionList: React.FC<CollectionListProps> = ({
    collections,
    selectedCollectionId,
    setSelectedCollectionId,
    selectedRequest,
    setSelectedRequest,
    setResponse,
    onAddCollection,
    onAddRequest,
    onDeleteCollection,
    onDeleteRequest,
    toggleCollectionExpand,
    toggleFolderExpand,
    deleteConfirm,
    setDeleteConfirm
}) => {
    const handleSelectRequest = (req: ApiRequest) => {
        setSelectedRequest(req);
        setResponse(null);
    };

    return (
        <CollectionContainer>
            {/* Header */}
            <SidebarHeader>
                <SidebarHeaderTitle>Collections</SidebarHeaderTitle>
                <SidebarHeaderActions>
                    <HeaderButton onClick={onAddCollection} title="New Collection">
                        <Plus size={16} />
                    </HeaderButton>
                </SidebarHeaderActions>
            </SidebarHeader>

            {/* Collections List */}
            <CollectionContent>
                {collections.length === 0 && (
                    <EmptyCollections>
                        No REST collections yet.
                        <br />
                        Click + to create one.
                    </EmptyCollections>
                )}

                {collections.map(collection => {
                    const isExpanded = collection.expanded ?? true;
                    const isSelected = selectedCollectionId === collection.id;
                    const isDeleting = deleteConfirm === collection.id;

                    return (
                        <div key={collection.id}>
                            {/* Collection Header */}
                            <CollectionRow
                                $isDeleting={isDeleting}
                                $isSelected={isSelected}
                                onClick={isDeleting ? () => {
                                    onDeleteCollection?.(collection);
                                    setDeleteConfirm(null);
                                } : () => {
                                    toggleCollectionExpand(collection.id);
                                    setSelectedCollectionId(collection.id);
                                }}
                            >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <CollectionFolderIcon size={14} />
                                <CollectionName>{collection.name}</CollectionName>

                                {!isDeleting && (
                                    <>
                                        <CollectionAction
                                            title="Add Request"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onAddRequest(collection.id);
                                            }}
                                        >
                                            <AddRequestIcon size={12} />
                                        </CollectionAction>
                                        {onDeleteCollection && (
                                            <DeleteCollectionIcon
                                                size={12}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setDeleteConfirm(collection.id);
                                                }}
                                            />
                                        )}
                                    </>
                                )}
                            </CollectionRow>

                            {/* Expanded Content */}
                            {isExpanded && (
                                <>
                                    {/* Folders */}
                                    {collection.folders?.map(folder => (
                                        <FolderItem
                                            key={folder.id}
                                            folder={folder}
                                            collectionId={collection.id}
                                            level={1}
                                            selectedRequest={selectedRequest}
                                            onSelectRequest={handleSelectRequest}
                                            onToggleExpand={() => toggleFolderExpand(collection.id, folder.id)}
                                            onDeleteRequest={onDeleteRequest}
                                            deleteConfirm={deleteConfirm}
                                            setDeleteConfirm={setDeleteConfirm}
                                        />
                                    ))}

                                    {/* Top-level requests in collection */}
                                    {collection.requests.map(req => (
                                        <RequestItem
                                            key={req.id}
                                            request={req}
                                            isSelected={selectedRequest?.id === req.id}
                                            onClick={() => handleSelectRequest(req)}
                                            onDelete={() => onDeleteRequest?.(req)}
                                            deleteConfirm={deleteConfirm}
                                            setDeleteConfirm={setDeleteConfirm}
                                        />
                                    ))}

                                    {/* Empty state within collection */}
                                    {collection.requests.length === 0 && (!collection.folders || collection.folders.length === 0) && (
                                        <EmptyCollectionRequests>
                                            No requests yet
                                        </EmptyCollectionRequests>
                                    )}
                                </>
                            )}
                        </div>
                    );
                })}
            </CollectionContent>
        </CollectionContainer>
    );
};
