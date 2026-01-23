/**
 * useExplorer.ts
 * 
 * Hook for managing WSDL Explorer state and handlers.
 * Extracted from App.tsx to reduce complexity.
 */

import { useState, useCallback } from 'react';
import { ApiInterface, ApinoxProject } from '@shared/models';

interface UseExplorerParams {
    projects: ApinoxProject[];
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    saveProject: (project: ApinoxProject) => void;
}

interface UseExplorerReturn {
    // State
    exploredInterfaces: ApiInterface[];
    setExploredInterfaces: React.Dispatch<React.SetStateAction<ApiInterface[]>>;
    explorerExpanded: boolean;
    setExplorerExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    pendingAddInterface: ApiInterface | null;
    setPendingAddInterface: React.Dispatch<React.SetStateAction<ApiInterface | null>>;

    // Actions
    addToProject: (iface: ApiInterface) => void;
    addInterfaceToNamedProject: (iface: ApiInterface, projectName: string, isNew: boolean) => void;
    addAllToProject: () => void;
    clearExplorer: () => void;
    removeFromExplorer: (iface: ApiInterface) => void;
    toggleExplorerExpand: () => void;
    toggleExploredInterface: (iName: string) => void;
    toggleExploredOperation: (iName: string, oName: string) => void;
}

export function useExplorer({
    projects: _projects,
    setProjects,
    setWorkspaceDirty,
    saveProject
}: UseExplorerParams): UseExplorerReturn {
    // State
    const [exploredInterfaces, setExploredInterfaces] = useState<ApiInterface[]>([]);
    const [explorerExpanded, setExplorerExpanded] = useState(false);
    const [pendingAddInterface, setPendingAddInterface] = useState<ApiInterface | null>(null);

    // Actions
    const clearExplorer = useCallback(() => {
        setExploredInterfaces([]);
        setExplorerExpanded(false);
    }, []);

    // Helper to remove interface from explorer after adding
    const removeInterfaceFromExplorer = useCallback((ifaceName: string) => {
        setExploredInterfaces(prev => {
            const filtered = prev.filter(i => i.name !== ifaceName);
            if (filtered.length === 0) {
                setExplorerExpanded(false);
            }
            return filtered;
        });
    }, []);

    // Add interface to a specific named project (new or existing)
    const addInterfaceToNamedProject = useCallback((iface: ApiInterface, projectName: string, isNew: boolean) => {
        if (isNew) {
            // Create new project with this interface
            const newProject: ApinoxProject = {
                name: projectName,
                interfaces: [iface],
                expanded: true,
                dirty: true,
                id: Date.now().toString()
            };
            setProjects(prev => [...prev, newProject]);
            // Force immediate save for new projects created from explorer
            saveProject(newProject);
        } else {
            // Add to existing project by name
            setProjects(prev => prev.map(p =>
                p.name === projectName
                    ? { ...p, interfaces: [...p.interfaces, iface], dirty: true }
                    : p
            ));
        }
        setWorkspaceDirty(true);
        removeInterfaceFromExplorer(iface.name);
    }, [setProjects, setWorkspaceDirty, removeInterfaceFromExplorer]);

    const addToProject = useCallback((iface: ApiInterface) => {
        // Set pending interface to trigger modal
        setPendingAddInterface(iface);
    }, []);

    const addAllToProject = useCallback(() => {
        // Trigger modal for all explored interfaces
        // We'll use a special marker - first interface with a flag
        if (exploredInterfaces.length > 0) {
            // Set first interface as pending, the modal handler will check for all
            setPendingAddInterface({ ...exploredInterfaces[0], _addAll: true } as any);
        }
    }, [exploredInterfaces]);

    const removeFromExplorer = useCallback((iface: ApiInterface) => {
        setExploredInterfaces(prev => prev.filter(i => i !== iface));
    }, []);

    const toggleExplorerExpand = useCallback(() => {
        setExplorerExpanded(prev => !prev);
    }, []);

    const toggleExploredInterface = useCallback((iName: string) => {
        setExploredInterfaces(prev =>
            prev.map(i => i.name === iName ? { ...i, expanded: !i.expanded } : i)
        );
    }, []);

    const toggleExploredOperation = useCallback((iName: string, oName: string) => {
        setExploredInterfaces(prev => prev.map(i => {
            if (i.name !== iName) return i;
            return {
                ...i,
                operations: i.operations.map(o =>
                    o.name === oName ? { ...o, expanded: !o.expanded } : o
                )
            };
        }));
    }, []);

    return {
        // State
        exploredInterfaces,
        setExploredInterfaces,
        explorerExpanded,
        setExplorerExpanded,
        pendingAddInterface,
        setPendingAddInterface,

        // Actions
        addToProject,
        addInterfaceToNamedProject,
        addAllToProject,
        clearExplorer,
        removeFromExplorer,
        toggleExplorerExpand,
        toggleExploredInterface,
        toggleExploredOperation
    };
}
