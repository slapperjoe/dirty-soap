
import { ApinoxFolder, ApinoxProject } from '@shared/models';


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
