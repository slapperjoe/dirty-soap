/**
 * ProjectContext.tsx
 * 
 * Centralizes project state management for the APInox application.
 * This context provides a single source of truth for:
 * - Projects list and their state
 * - Selected project tracking
 * - Workspace dirty state
 * - Project CRUD operations
 * 
 * Usage:
 *   1. Wrap your app with <ProjectProvider>
 *   2. Access state and actions via useProject() hook
 * 
 * Example:
 *   const { projects, addProject, saveProject } = useProject();
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { SoapUIProject } from '@shared/models';
import { bridge } from '../utils/bridge';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Shape of the ProjectContext value.
 * Contains both state and actions for project management.
 */
export interface ProjectContextValue {
    // -------------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------------

    /** Array of all loaded projects */
    projects: SoapUIProject[];

    /** Name of the currently selected project (if any) */
    selectedProjectName: string | null;

    /** Flag indicating unsaved changes to workspace */
    workspaceDirty: boolean;

    /** Set of project names with pending save indicators */
    savedProjects: Set<string>;

    /** ID of item awaiting delete confirmation (shared state for delete confirm pattern) */
    deleteConfirm: string | null;

    // -------------------------------------------------------------------------
    // STATE SETTERS (exposed for complex handlers in App.tsx)
    // -------------------------------------------------------------------------

    setProjects: React.Dispatch<React.SetStateAction<SoapUIProject[]>>;
    setSelectedProjectName: React.Dispatch<React.SetStateAction<string | null>>;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    setSavedProjects: React.Dispatch<React.SetStateAction<Set<string>>>;
    setDeleteConfirm: React.Dispatch<React.SetStateAction<string | null>>;

    // -------------------------------------------------------------------------
    // ACTIONS
    // -------------------------------------------------------------------------

    /** Creates a new empty project with auto-generated name */
    addProject: () => void;

    /** 
     * Closes (removes) a project by name.
     * Uses double-click-to-confirm pattern via deleteConfirm state.
     */
    closeProject: (name: string) => void;

    /** Sends loadProject command to backend (optionally with specific path) */
    loadProject: (path?: string) => void;

    /** Sends saveProject command to backend */
    saveProject: (project: SoapUIProject) => void;

    /** Toggles the expanded state of a project in the sidebar */
    toggleProjectExpand: (name: string) => void;

    /** Toggles the expanded state of an interface within a project */
    toggleInterfaceExpand: (projectName: string, interfaceName: string) => void;

    /** Toggles the expanded state of an operation within an interface */
    toggleOperationExpand: (projectName: string, interfaceName: string, operationName: string) => void;

    // -------------------------------------------------------------------------
    // UTILITIES
    // -------------------------------------------------------------------------

    /**
     * Helper to update a specific project by name.
     * Automatically marks project and workspace as dirty.
     * 
     * @param name - Project name to update
     * @param updater - Function that receives the project and returns updated version
     */
    updateProject: (name: string, updater: (p: SoapUIProject) => SoapUIProject) => void;

    /**
     * Finds a project by its name.
     * @returns The project or undefined if not found
     */
    findProjectByName: (name: string) => SoapUIProject | undefined;
}

// =============================================================================
// CONTEXT CREATION
// =============================================================================

/**
 * The React Context for project state.
 * Initially undefined - must be used within ProjectProvider.
 */
const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface ProjectProviderProps {
    children: ReactNode;
    /** 
     * Optional initial projects (e.g., from autosave restoration).
     * If not provided, starts with empty array.
     */
    initialProjects?: SoapUIProject[];
}

/**
 * Provider component that manages project state.
 * Wrap your application (or relevant portion) with this provider.
 */
export function ProjectProvider({ children, initialProjects = [] }: ProjectProviderProps) {
    // -------------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------------

    const [projects, setProjects] = useState<SoapUIProject[]>(initialProjects);
    const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
    const [workspaceDirty, setWorkspaceDirty] = useState(false);
    const [savedProjects, setSavedProjects] = useState<Set<string>>(new Set());
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Sync projects to backend when they change
    useEffect(() => {
        // Debounce sync to avoid spamming bridge on rapid state changes
        const timer = setTimeout(() => {
            if (projects.length > 0) {
                // debugLog('Syncing projects to backend', { count: projects.length });
                bridge.sendMessage({ command: 'log', message: `[ProjectContext] Syncing projects. Count: ${projects.length}` });
                bridge.sendMessage({ command: 'syncProjects', projects });
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [projects]);

    // -------------------------------------------------------------------------
    // DEBUG LOGGING
    // Temporary logging for troubleshooting - can be removed after stabilization
    // -------------------------------------------------------------------------

    const debugLog = useCallback((action: string, data?: any) => {
        console.log(`[ProjectContext] ${action}`, data || '');
        bridge.sendMessage({ command: 'log', message: `[ProjectContext] ${action}`, data: JSON.stringify(data || {}) });
    }, []);

    // -------------------------------------------------------------------------
    // ACTIONS
    // -------------------------------------------------------------------------

    /**
     * Creates a new empty project.
     * Auto-generates name based on current project count.
     */
    const addProject = useCallback(() => {
        debugLog('addProject', { currentCount: projects.length });

        const name = `Project ${projects.length + 1}`;
        const newProject: SoapUIProject = {
            name,
            interfaces: [],
            expanded: true,
            dirty: true,
            id: Date.now().toString()
        };

        setProjects(prev => [...prev, newProject]);
        setWorkspaceDirty(true);

        debugLog('addProject complete', { newName: name });
    }, [projects.length, debugLog]);

    /**
     * Closes a project using double-click-to-confirm pattern.
     * First click: sets deleteConfirm to the project name
     * Second click (within 3s): actually removes the project
     */
    const closeProject = useCallback((name: string) => {
        debugLog('closeProject', { name, isConfirming: deleteConfirm === name });

        if (deleteConfirm === name) {
            // Second click - actually close
            setProjects(prev => prev.filter(p => p.name !== name));
            setWorkspaceDirty(true);

            // Notify backend that project is closed to clear from memory
            bridge.sendMessage({ command: 'closeProject', name });

            // Clear selection if we're closing the selected project
            if (selectedProjectName === name) {
                setSelectedProjectName(null);
            }

            setDeleteConfirm(null);
            debugLog('closeProject executed', { name });
        } else {
            // First click - request confirmation
            setDeleteConfirm(name);

            // Auto-clear after 3 seconds if not confirmed
            setTimeout(() => {
                setDeleteConfirm(current => current === name ? null : current);
            }, 3000);
        }
    }, [deleteConfirm, selectedProjectName, debugLog]);

    /**
     * Requests project load from backend.
     * If path is provided, loads that specific file.
     * If not, shows file picker dialog (handled by backend).
     */
    const loadProject = useCallback((path?: string) => {
        debugLog('loadProject', { path: path || 'picker' });
        bridge.sendMessage({ command: 'loadProject', path });
    }, [debugLog]);

    /**
     * Saves a project to the backend.
     * The backend handles file system operations and will respond
     * with 'projectSaved' message handled by useMessageHandler.
     */
    const saveProject = useCallback((project: SoapUIProject) => {
        debugLog('saveProject', { name: project.name });
        bridge.sendMessage({ command: 'log', message: `[ProjectContext] saveProject called for: ${project.name}` });
        bridge.sendMessage({ command: 'saveProject', project });
    }, [debugLog]);

    /**
     * Toggles expanded/collapsed state of a project in the sidebar.
     */
    const toggleProjectExpand = useCallback((name: string) => {
        setProjects(prev => prev.map(p =>
            p.name === name ? { ...p, expanded: !p.expanded } : p
        ));
    }, []);

    /**
     * Toggles expanded/collapsed state of an interface within a project.
     */
    const toggleInterfaceExpand = useCallback((projectName: string, interfaceName: string) => {
        setProjects(prev => prev.map(p => {
            if (p.name !== projectName) return p;
            return {
                ...p,
                interfaces: p.interfaces.map(i =>
                    i.name === interfaceName ? { ...i, expanded: !i.expanded } : i
                )
            };
        }));
    }, []);

    /**
     * Toggles expanded/collapsed state of an operation within an interface.
     */
    const toggleOperationExpand = useCallback((projectName: string, interfaceName: string, operationName: string) => {
        setProjects(prev => prev.map(p => {
            if (p.name !== projectName) return p;
            return {
                ...p,
                interfaces: p.interfaces.map(i => {
                    if (i.name !== interfaceName) return i;
                    return {
                        ...i,
                        operations: i.operations.map(o =>
                            o.name === operationName ? { ...o, expanded: !o.expanded } : o
                        )
                    };
                })
            };
        }));
    }, []);

    // -------------------------------------------------------------------------
    // UTILITIES
    // -------------------------------------------------------------------------

    /**
     * Helper to update a specific project by name.
     * Automatically marks project and workspace as dirty.
     */
    const updateProject = useCallback((name: string, updater: (p: SoapUIProject) => SoapUIProject) => {
        setProjects(prev => prev.map(p => {
            if (p.name === name) {
                const updated = updater(p);
                return { ...updated, dirty: true };
            }
            return p;
        }));
        setWorkspaceDirty(true);
    }, []);

    /**
     * Finds a project by name.
     */
    const findProjectByName = useCallback((name: string): SoapUIProject | undefined => {
        return projects.find(p => p.name === name);
    }, [projects]);

    // -------------------------------------------------------------------------
    // CONTEXT VALUE
    // -------------------------------------------------------------------------

    const value: ProjectContextValue = {
        // State
        projects,
        selectedProjectName,
        workspaceDirty,
        savedProjects,
        deleteConfirm,

        // Setters (exposed for complex handlers)
        setProjects,
        setSelectedProjectName,
        setWorkspaceDirty,
        setSavedProjects,
        setDeleteConfirm,

        // Actions
        addProject,
        closeProject,
        loadProject,
        saveProject,
        toggleProjectExpand,
        toggleInterfaceExpand,
        toggleOperationExpand,

        // Utilities
        updateProject,
        findProjectByName
    };

    return (
        <ProjectContext.Provider value={value}>
            {children}
        </ProjectContext.Provider>
    );
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access project context.
 * Must be used within a ProjectProvider.
 * 
 * @throws Error if used outside of ProjectProvider
 * 
 * @example
 * function MySidebar() {
 *     const { projects, addProject } = useProject();
 *     return <button onClick={addProject}>Add Project</button>;
 * }
 */
export function useProject(): ProjectContextValue {
    const context = useContext(ProjectContext);

    if (context === undefined) {
        throw new Error('useProject must be used within a ProjectProvider');
    }

    return context;
}
