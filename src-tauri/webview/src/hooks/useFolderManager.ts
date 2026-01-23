
import { useCallback } from 'react';
import { ApinoxProject, ApiRequest } from '@shared/models';

export interface UseFolderManagerProps {
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    setSelectedRequest?: (req: ApiRequest) => void;
}

export function useFolderManager({ setProjects, setWorkspaceDirty, setSelectedRequest }: UseFolderManagerProps) {

    const handleAddFolder = useCallback((projectName: string, parentFolderId?: string) => {
        const newId = `folder - ${Date.now()} `;
        const newFolder: import('@shared/models').ApinoxFolder = {
            id: newId,
            name: `New Folder`,
            requests: [],
            expanded: true
        };

        setProjects(prev => prev.map(p => {
            if (p.name !== projectName) return p;
            if (!parentFolderId) {
                // Add to project root
                return { ...p, folders: [...(p.folders || []), newFolder], dirty: true };
            }
            // Add to parent folder recursively
            const addToParent = (folders: import('@shared/models').ApinoxFolder[]): import('@shared/models').ApinoxFolder[] => {
                return folders.map(f => {
                    if (f.id === parentFolderId) {
                        // Found the parent - add new folder to its folders array
                        return { ...f, folders: [...(f.folders || []), newFolder] };
                    }
                    if (f.folders && f.folders.length > 0) {
                        // Recurse into subfolders
                        return { ...f, folders: addToParent(f.folders) };
                    }
                    return f;
                });
            };
            return { ...p, folders: addToParent(p.folders || []), dirty: true };
        }));
        setWorkspaceDirty(true);
    }, [setProjects, setWorkspaceDirty]);

    const handleAddRequestToFolder = useCallback((projectName: string, folderId: string) => {
        const newRequestId = `request - ${Date.now()} `;
        const newRequest: ApiRequest = {
            id: newRequestId,
            name: 'New Request',
            request: '',
            endpoint: 'https://api.example.com',
            method: 'GET',
            requestType: 'rest',
            bodyType: 'json'
        };

        setProjects(prev => prev.map(p => {
            if (p.name !== projectName) return p;
            const updateFolders = (folders: import('@shared/models').ApinoxFolder[]): import('@shared/models').ApinoxFolder[] => {
                return folders.map(f => {
                    if (f.id === folderId) {
                        return { ...f, requests: [...f.requests, newRequest] };
                    }
                    if (f.folders) {
                        return { ...f, folders: updateFolders(f.folders) };
                    }
                    return f;
                });
            };
            return { ...p, folders: updateFolders(p.folders || []), dirty: true };
        }));

        if (setSelectedRequest) {
            setSelectedRequest(newRequest);
        }
        setWorkspaceDirty(true);
    }, [setProjects, setSelectedRequest, setWorkspaceDirty]);

    const handleDeleteFolder = useCallback((projectName: string, folderId: string) => {
        setProjects(prev => prev.map(p => {
            if (p.name !== projectName) return p;
            const filterFolders = (folders: import('@shared/models').ApinoxFolder[]): import('@shared/models').ApinoxFolder[] => {
                return folders.filter(f => f.id !== folderId).map(f => ({
                    ...f,
                    folders: f.folders ? filterFolders(f.folders) : undefined
                }));
            };
            return { ...p, folders: filterFolders(p.folders || []), dirty: true };
        }));
        setWorkspaceDirty(true);
    }, [setProjects, setWorkspaceDirty]);

    const handleToggleFolderExpand = useCallback((projectName: string, folderId: string) => {
        setProjects(prev => prev.map(p => {
            if (p.name !== projectName) return p;
            const toggleFolder = (folders: import('@shared/models').ApinoxFolder[]): import('@shared/models').ApinoxFolder[] => {
                return folders.map(f => {
                    if (f.id === folderId) {
                        return { ...f, expanded: !f.expanded };
                    }
                    if (f.folders) {
                        return { ...f, folders: toggleFolder(f.folders) };
                    }
                    return f;
                });
            };
            return { ...p, folders: toggleFolder(p.folders || []) };
        }));
    }, [setProjects]);

    return {
        handleAddFolder,
        handleAddRequestToFolder,
        handleDeleteFolder,
        handleToggleFolderExpand
    };
}
