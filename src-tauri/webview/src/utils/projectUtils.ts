
import { ApinoxFolder, ApinoxProject } from '@shared/models';

/**
 * Recursively updates a folder name or a request name within a folder structure.
 */
const renameInFolders = (
    folders: ApinoxFolder[],
    targetId: string,
    targetType: 'folder' | 'request',
    newName: string
): { folders: ApinoxFolder[]; updated: boolean } => {
    let updated = false;

    const newFolders = folders.map(folder => {
        // 1. Rename Folder
        if (targetType === 'folder' && folder.id === targetId) {
            updated = true;
            return { ...folder, name: newName };
        }

        // 2. Rename Request inside Folder
        let requests = folder.requests;
        if (targetType === 'request') {
            const reqIndex = folder.requests.findIndex(r => r.id === targetId);
            if (reqIndex !== -1) {
                updated = true;
                requests = folder.requests.map((r, i) =>
                    i === reqIndex ? { ...r, name: newName, dirty: true } : r
                );
            }
        }

        // 3. Recurse into subfolders
        let subFolders = folder.folders;
        // Optimization: if we already found the target and it was a direct child rename, we technically don't need to deep recurse 
        // IF IDs are unique. However, if we didn't find it yet, or to be safe, we recurse.
        // Also, if we renamed the CURRENT folder, we still process its children (though names won't match targetId).

        if (folder.folders && folder.folders.length > 0) {
            const result = renameInFolders(folder.folders, targetId, targetType, newName);
            if (result.updated) {
                updated = true;
                subFolders = result.folders;
            }
        }

        if (subFolders !== folder.folders || requests !== folder.requests || (targetType === 'folder' && folder.id === targetId)) {
            return { ...folder, folders: subFolders, requests };
        }

        return folder;
    });

    return { folders: newFolders, updated };
};

/**
 * Helper to update project structure with a renamed item
 */
export const updateProjectWithRename = (
    projects: ApinoxProject[],
    targetId: string, // ID or Name depending on what's available context
    targetType: 'folder' | 'request' | 'project',
    newName: string,
    targetData?: any // Fallback if we need to match by reference
): ApinoxProject[] => {
    return projects.map(p => {
        // 0. Handle Project Rename
        if (targetType === 'project') {
            // Match by ID if available, or name. Note: Project ID might be missing in legacy, so fallback to name.
            const isMatch = (p.id && p.id === targetId) || (!p.id && p.name === targetId);
            if (isMatch) {
                return { ...p, name: newName, dirty: true };
            }
            return p;
        }

        let projectDirty = false;
        let newInterfaces = p.interfaces;
        let newFolders = p.folders;

        // 1. Handle Requests in Interfaces (legacy/flat structure)
        if (targetType === 'request') {
            newInterfaces = p.interfaces.map(i => ({
                ...i,
                operations: i.operations.map(o => {
                    const reqIndex = o.requests.findIndex(r => r.id === targetId || (targetData && r === targetData));
                    if (reqIndex !== -1) {
                        projectDirty = true;
                        return {
                            ...o,
                            requests: o.requests.map((r, idx) =>
                                idx === reqIndex ? { ...r, name: newName, dirty: true } : r
                            )
                        };
                    }
                    return o;
                })
            }));
        }

        // 2. Handle Folders and Requests in Folders
        if (p.folders && p.folders.length > 0) {
            // targetType here is guaranteed to be 'folder' | 'request' due to early return above (if flow analysis works)
            // or we just cast it to be sure.
            const nextType = targetType as 'folder' | 'request';
            const folderResult = renameInFolders(p.folders, targetId, nextType, newName);
            if (folderResult.updated) {
                newFolders = folderResult.folders;
                projectDirty = true;
            }
        }

        if (projectDirty) {
            return {
                ...p,
                interfaces: newInterfaces,
                folders: newFolders,
                dirty: true
            };
        }
        return p;
    });
};

/**
 * Recursively searches for a request in folders and returns the path (array of names) if found.
 */
const findPathInFolders = (folders: ApinoxFolder[], targetId: string): string[] | null => {
    for (const folder of folders) {
        // Check requests in this folder
        if (folder.requests.some(r => r.id === targetId)) {
            return [folder.name];
        }

        // Recursively check subfolders
        if (folder.folders && folder.folders.length > 0) {
            const subPath = findPathInFolders(folder.folders, targetId);
            if (subPath) {
                return [folder.name, ...subPath];
            }
        }
    }
    return null;
};

/**
 * Finds the breadcrumb path to a specific request ID across all projects.
 * Returns null if not found.
 */
export const findPathToRequest = (projects: ApinoxProject[], targetId: string): string[] | null => {
    for (const p of projects) {
        // 1. Check Interfaces (Legacy/WSDL structure)
        if (p.interfaces) {
            for (const i of p.interfaces) {
                for (const o of i.operations) {
                    if (o.requests.some(r => r.id === targetId)) {
                        // Found in interface/operation
                        return [p.name, i.name, o.name];
                    }
                }
            }
        }

        // 2. Check Folders
        if (p.folders && p.folders.length > 0) {
            const folderPath = findPathInFolders(p.folders, targetId);
            if (folderPath) {
                return [p.name, ...folderPath];
            }
        }
    }
    return null;
};
