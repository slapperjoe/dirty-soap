/**
 * useContextMenu.ts
 * 
 * Hook for managing context menu state and actions.
 * Extracted from App.tsx to reduce complexity.
 */

import { useState, useCallback } from 'react';
import { ApinoxProject, ApiInterface, ApiOperation, ApiRequest } from '@shared/models';
import { bridge } from '../utils/bridge';
import { generateInitialXmlForOperation } from '../utils/soapUtils';

interface ContextMenuState {
    x: number;
    y: number;
    type: string;
    data: any;
    isExplorer: boolean;
}

interface RenameState {
    active: boolean;
    type: string;
    data: any;
    value: string;
}

interface UseContextMenuParams {
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    saveProject: (project: ApinoxProject) => void;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    selectedInterface: ApiInterface | null;
    selectedOperation: ApiOperation | null;
    setSelectedInterface: React.Dispatch<React.SetStateAction<ApiInterface | null>>;
    setSelectedOperation: React.Dispatch<React.SetStateAction<ApiOperation | null>>;
    setSelectedRequest: React.Dispatch<React.SetStateAction<ApiRequest | null>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;
}

interface UseContextMenuReturn {
    // State
    contextMenu: ContextMenuState | null;
    setContextMenu: React.Dispatch<React.SetStateAction<ContextMenuState | null>>;
    renameState: RenameState | null;
    setRenameState: React.Dispatch<React.SetStateAction<RenameState | null>>;

    // Actions
    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
    closeContextMenu: () => void;
    handleRename: () => void;
    handleDeleteRequest: (targetReq?: ApiRequest) => void;
    handleCloneRequest: () => void;
    handleAddRequest: (targetOp?: ApiOperation) => void;
    handleDeleteInterface: (iface: ApiInterface) => void;
    handleDeleteOperation: (op: ApiOperation, iface: ApiInterface) => void;
    handleViewSample: () => void;
    handleExportNative: (project: ApinoxProject) => void;
}

export function useContextMenu({
    setProjects,
    saveProject,
    setWorkspaceDirty,
    selectedInterface,
    selectedOperation,
    setSelectedInterface,
    setSelectedOperation,
    setSelectedRequest,
    setResponse
}: UseContextMenuParams): UseContextMenuReturn {
    // State
    const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
    const [renameState, setRenameState] = useState<RenameState | null>(null);

    // Actions
    const closeContextMenu = useCallback(() => {
        setContextMenu(null);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent, type: string, data: any, isExplorer = false) => {
        // Prevent empty context menus
        if (type === 'interface') return;
        if (isExplorer && type === 'request') return; // Requests in explorer are read-only

        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, type, data, isExplorer });
    }, []);

    const handleRename = useCallback(() => {
        if (contextMenu) {
            setRenameState({ active: true, type: contextMenu.type, data: contextMenu.data, value: contextMenu.data.name });
            closeContextMenu();
        }
    }, [contextMenu, closeContextMenu]);

    const handleDeleteRequest = useCallback((targetReq?: ApiRequest) => {
        const reqToRemove = targetReq || (contextMenu?.type === 'request' ? contextMenu.data as ApiRequest : null);
        if (reqToRemove) {
            // Check context menu if relying on it
            if (!targetReq && contextMenu?.isExplorer) return;

            setProjects(prev => {
                // let projectChanged: ApinoxProject | null = null;
                const newProjects = prev.map(p => {
                    let changed = false;
                    const newInterfaces = p.interfaces.map(i => ({
                        ...i,
                        operations: i.operations.map(o => {
                            if (o.requests.includes(reqToRemove)) {
                                changed = true;
                                return { ...o, requests: o.requests.filter(r => r !== reqToRemove) };
                            }
                            return o;
                        })
                    }));

                    if (changed) {
                        const newP = { ...p, interfaces: newInterfaces, dirty: true };
                        // projectChanged = newP;
                        return newP;
                    }
                    return p;
                });

                // if (projectChanged) saveProject(projectChanged);
                return newProjects;
            });

            // Clear the deleted request selection but keep parent operation selected
            setSelectedRequest(null);

            if (contextMenu) closeContextMenu();
        }
    }, [contextMenu, setProjects, saveProject, closeContextMenu, setSelectedRequest]);

    const handleCloneRequest = useCallback(() => {
        if (contextMenu && contextMenu.type === 'request' && !contextMenu.isExplorer) {
            const req = contextMenu.data as ApiRequest;
            setProjects(prev => prev.map(p => {
                let found = false;
                const newInterfaces = p.interfaces.map(i => ({
                    ...i,
                    operations: i.operations.map(o => {
                        if (o.requests.includes(req)) {
                            found = true;
                            const newReq = { ...req, name: `${req.name} Copy`, id: crypto.randomUUID(), dirty: true };
                            return { ...o, requests: [...o.requests, newReq] };
                        }
                        return o;
                    })
                }));

                if (found) {
                    return { ...p, interfaces: newInterfaces, dirty: true };
                }
                return p;
            }));
            closeContextMenu();
        }
    }, [contextMenu, setProjects, closeContextMenu]);

    const handleAddRequest = useCallback((targetOp?: ApiOperation) => {
        const op = targetOp || (contextMenu?.type === 'operation' ? contextMenu.data as ApiOperation : null);
        if (op) {
            const newReqName = `Request ${op.requests.length + 1}`;

            // Try to clone first request or create from schema
            let newReqContent = '';
            if (op.requests.length > 0) {
                newReqContent = op.requests[0].request;
            } else {
                // Generate initial XML using best available schema
                newReqContent = generateInitialXmlForOperation(op);
            }

            const newRequest: ApiRequest = {
                name: newReqName,
                request: newReqContent,
                id: crypto.randomUUID(),
                dirty: true,
                endpoint: op.requests[0]?.endpoint || ''
            };

            setProjects(prev => prev.map(p => {
                let found = false;
                const newInterfaces = p.interfaces.map(i => {
                    const newOps = i.operations.map(o => {
                        if (o.name === op.name && i.operations.includes(op)) {
                            found = true;
                            return { ...o, requests: [...o.requests, newRequest], expanded: true };
                        }
                        return o;
                    });
                    return { ...i, operations: newOps };
                });

                if (found) {
                    return { ...p, interfaces: newInterfaces, dirty: true };
                }
                return p;
            }));

            // Auto-select the new request
            setSelectedRequest(newRequest);
            setResponse(null);

            if (contextMenu) closeContextMenu();
        }
    }, [contextMenu, setProjects, closeContextMenu, setSelectedRequest, setResponse]);

    const handleDeleteInterface = useCallback((iface: ApiInterface) => {
        setProjects(prev => {
            // let projectChanged: ApinoxProject | null = null;
            const newProjects = prev.map(p => {
                const hasInterface = p.interfaces.some(i => i.name === iface.name);
                if (hasInterface) {
                    const newInterfaces = p.interfaces.filter(i => i.name !== iface.name);
                    const newP = { ...p, interfaces: newInterfaces, dirty: true };
                    // projectChanged = newP;
                    return newP;
                }
                return p;
            });

            // if (projectChanged) saveProject(projectChanged);
            return newProjects;
        });
        setWorkspaceDirty(true);

        if (selectedInterface?.name === iface.name) {
            setSelectedInterface(null);
            setSelectedOperation(null);
            setSelectedRequest(null);
            setResponse(null);
        }
    }, [setProjects, saveProject, setWorkspaceDirty, selectedInterface, setSelectedInterface, setSelectedOperation, setSelectedRequest, setResponse]);

    const handleDeleteOperation = useCallback((op: ApiOperation, iface: ApiInterface) => {
        setProjects(prev => {
            // let projectChanged: ApinoxProject | null = null;
            const newProjects = prev.map(p => {
                const targetInterface = p.interfaces.find(i => i.name === iface.name);
                if (targetInterface) {
                    const newInterfaces = p.interfaces.map(i => {
                        if (i.name === iface.name) {
                            const newOps = i.operations.filter(o => o.name !== op.name);
                            return { ...i, operations: newOps };
                        }
                        return i;
                    });
                    const newP = { ...p, interfaces: newInterfaces, dirty: true };
                    // projectChanged = newP;
                    return newP;
                }
                return p;
            });

            // if (projectChanged) saveProject(projectChanged);
            return newProjects;
        });
        setWorkspaceDirty(true);

        if (selectedOperation?.name === op.name && selectedInterface?.name === iface.name) {
            setSelectedOperation(null);
            setSelectedRequest(null);
            setResponse(null);
        }
    }, [setProjects, saveProject, setWorkspaceDirty, selectedInterface, selectedOperation, setSelectedOperation, setSelectedRequest, setResponse]);

    const handleViewSample = useCallback(() => {
        if (contextMenu && (contextMenu.type === 'operation' || contextMenu.type === 'request')) {
            if (contextMenu.type === 'operation') {
                bridge.sendMessage({ command: 'getSampleSchema', operationName: contextMenu.data.name });
            }
            closeContextMenu();
        }
    }, [contextMenu, closeContextMenu]);

    const handleExportNative = useCallback((project: ApinoxProject) => {
        bridge.sendMessage({ command: 'exportNative', project });
        closeContextMenu();
    }, [closeContextMenu]);

    return {
        // State
        contextMenu,
        setContextMenu,
        renameState,
        setRenameState,

        // Actions
        handleContextMenu,
        closeContextMenu,
        handleRename,
        handleDeleteRequest,
        handleCloneRequest,
        handleAddRequest,
        handleDeleteInterface,
        handleDeleteOperation,
        handleViewSample,
        handleExportNative
    };
}
