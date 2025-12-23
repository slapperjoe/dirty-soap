import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { bridge, isVsCode } from './utils/bridge';
import { Sidebar } from './components/Sidebar';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { HelpModal } from './components/HelpModal';

import { SchemaViewer } from './components/SchemaViewer';
import { SettingsEditorModal } from './components/SettingsEditorModal';
import { SoapUIInterface, SoapUIProject, SoapUIOperation, SoapUIRequest, SoapSchemaNode } from './models';

// TS might complain about importing from outside src if not careful. 
// Ideally we define types in shared folder. 
// For now, let's redefine Interface or use 'any'.
interface DirtySoapConfigWeb {
    version: number;
    ui: {
        layoutMode: 'vertical' | 'horizontal';
        showLineNumbers: boolean;
        alignAttributes: boolean;
        splitRatio: number;
    };
    activeEnvironment: string;
    environments: Record<string, any>;
    globals: Record<string, string>;
}
import { X } from 'lucide-react';

const Container = styled.div`
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContent = styled.div`
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: 400px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
    padding: 10px 15px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const ModalTitle = styled.div`
    font-weight: bold;
`;

const ModalBody = styled.div`
    padding: 15px;
    overflow-y: auto;
    flex: 1;
`;

const ModalFooter = styled.div`
    padding: 10px 15px;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const ContextMenu = styled.div<{ top: number, left: number }>`
    position: fixed;
    top: ${props => props.top}px;
    left: ${props => props.left}px;
    background-color: var(--vscode-menu-background);
    color: var(--vscode-menu-foreground);
    border: 1px solid var(--vscode-menu-border);
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    z-index: 2000;
    min-width: 150px;
    padding: 4px 0;
`;

const ContextMenuItem = styled.div`
    padding: 6px 12px;
    cursor: pointer;
    &:hover {
        background-color: var(--vscode-menu-selectionBackground);
        color: var(--vscode-menu-selectionForeground);
    }
`;

const Button = styled.button`
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  &:hover {
    background: var(--vscode-button-hoverBackground);
  }
`;

function App() {
    // State
    const [projects, setProjects] = useState<SoapUIProject[]>([]);
    const [exploredInterfaces, setExploredInterfaces] = useState<SoapUIInterface[]>([]);

    // Selection
    const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
    const [selectedInterface, setSelectedInterface] = useState<SoapUIInterface | null>(null);
    const [selectedOperation, setSelectedOperation] = useState<SoapUIOperation | null>(null);
    const [selectedRequest, setSelectedRequest] = useState<SoapUIRequest | null>(null);

    // Data
    // Data
    const [response, setResponse] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [backendConnected, setBackendConnected] = useState(false);

    // UI State
    const [explorerExpanded, setExplorerExpanded] = useState(true);
    const [inputType, setInputType] = useState<'url' | 'file'>('url');
    const [wsdlUrl, setWsdlUrl] = useState('http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [downloadStatus, setDownloadStatus] = useState<string[] | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [savedProjects, setSavedProjects] = useState<Set<string>>(new Set());
    const [workspaceDirty, setWorkspaceDirty] = useState(false);

    const startTimeRef = useRef<number>(0);

    // Layout
    const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
    const [showLineNumbers, setShowLineNumbers] = useState(true);
    const [inlineElementValues, setInlineElementValues] = useState(false);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const [isResizing, setIsResizing] = useState(false);

    // Modals & Menu
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: string, data: any, isExplorer: boolean } | null>(null);
    const [renameState, setRenameState] = useState<{ active: boolean, type: string, data: any, value: string } | null>(null);
    const [sampleModal, setSampleModal] = useState<{ open: boolean, schema: SoapSchemaNode | null, operationName: string }>({ open: false, schema: null, operationName: '' });


    // Settings
    const [config, setConfig] = useState<DirtySoapConfigWeb | null>(null);
    const [rawConfig, setRawConfig] = useState<string>('');
    const [showSettings, setShowSettings] = useState(false);
    const [showHelp, setShowHelp] = useState(false); // Help Modal State
    const [changelog, setChangelog] = useState<string>('');

    // Initial Load
    useEffect(() => {
        // Request settings on load
        bridge.sendMessage({ command: 'getSettings' });
        bridge.sendMessage({ command: 'getAutosave' });

        const state = bridge.getState();
        if (state) {
            setProjects(state.projects || []);
            setExploredInterfaces(state.exploredInterfaces || []);
            setExplorerExpanded(state.explorerExpanded ?? true);
            setWsdlUrl(state.wsdlUrl || '');
            if (state.lastSelectedProject) setSelectedProjectName(state.lastSelectedProject);
        }

        // Test Backend Connection
        bridge.sendMessage({ command: 'echo', message: 'ping' });
        // Retry every 5 seconds if not connected
        const interval = setInterval(() => {
            bridge.sendMessage({ command: 'echo', message: 'ping' });
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Save State & Autosave
    useEffect(() => {
        const state = {
            projects,
            exploredInterfaces,
            explorerExpanded,
            wsdlUrl,
            lastSelectedProject: selectedProjectName
        };
        bridge.setState(state);

        // Autosave to file (debounced)
        const timer = setTimeout(() => {
            bridge.sendMessage({ command: 'autoSaveWorkspace', content: JSON.stringify(state) });
        }, 2000);
        return () => clearTimeout(timer);
    }, [projects, exploredInterfaces, explorerExpanded, wsdlUrl, selectedProjectName]);

    // VS Code Messages
    useEffect(() => {
        const handleMessage = (message: any) => {
            switch (message.command) {
                case 'wsdlParsed':
                    // Convert raw SoapService to SoapUIInterface
                    const newInterfaces: SoapUIInterface[] = message.services.map((svc: any) => ({
                        name: svc.name,
                        type: 'wsdl',
                        bindingName: '', // Parser might need to provide this, or we infer
                        soapVersion: '1.1',
                        definition: wsdlUrl,
                        operations: svc.operations.map((op: any) => ({
                            name: op.name,
                            action: '', // Parser logic
                            input: op.input,
                            requests: [{
                                name: 'Request 1',
                                request: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${op.targetNamespace || 'http://tempuri.org/'}">\n   <soapenv:Header/>\n   <soapenv:Body>\n      <tem:${op.name}>\n         <!--Optional:-->\n         ${getInitialXml(op.input)}\n      </tem:${op.name}>\n   </soapenv:Body>\n</soapenv:Envelope>`
                            }]
                        }))
                    }));
                    setExploredInterfaces(newInterfaces);
                    setExplorerExpanded(true);
                    break;
                case 'response':
                    setLoading(false);
                    const endTime = Date.now();
                    const duration = (endTime - startTimeRef.current) / 1000;

                    let lineCount = 0;
                    let displayResponse = '';

                    const res = message.result;
                    if (res) {
                        console.log('Response received:', res); // Debug log
                        if (res.rawResponse) {
                            displayResponse = typeof res.rawResponse === 'object' ? JSON.stringify(res.rawResponse, null, 2) : res.rawResponse;
                        } else if (typeof res === 'string') {
                            displayResponse = res;
                        } else if (res.body) {
                            displayResponse = typeof res.body === 'object' ? JSON.stringify(res.body, null, 2) : res.body;
                        } else if (res.data && typeof res.data === 'string') {
                            displayResponse = res.data;
                        } else {
                            displayResponse = JSON.stringify(res, null, 2);
                        }
                    }

                    if (displayResponse) {
                        lineCount = displayResponse.split(/\r\n|\r|\n/).length;
                    }

                    // We store the generic result but also the pre-processed display string
                    setResponse({ ...res, rawResponse: displayResponse, duration, lineCount });
                    break;
                case 'error':
                    setLoading(false);
                    setResponse({ error: message.message });
                    break;
                case 'downloadComplete':
                    setDownloadStatus(message.files);
                    if (message.files.length > 0) {
                        // Auto-select the first one for convenience?
                        // Or just show status
                    }
                    setTimeout(() => setDownloadStatus(null), 5000);
                    break;
                case 'wsdlSelected':
                    setSelectedFile(message.path);
                    break;
                case 'sampleSchema':
                    setSampleModal({ open: true, schema: message.schema, operationName: message.operationName });
                    break;
                case 'projectLoaded':
                    // Check if project exists
                    const newProj = message.project;
                    setProjects(prev => {
                        if (prev.find(p => p.name === newProj.name)) return prev;
                        return [...prev, { ...newProj, fileName: message.filename, expanded: false }];
                    });
                    setWorkspaceDirty(true);
                    break;
                case 'workspaceLoaded':
                    // Replace projects or merge? Usually replace workspace
                    setProjects(message.projects.map((p: any) => ({ ...p, expanded: false })));
                    setWorkspaceDirty(false);
                    break;
                case 'echoResponse':
                    console.log("Backend Connected:", message.message);
                    setBackendConnected(true);
                    break;
                case 'localWsdls':
                    // handled by quick pick in sidebar logic? NO, Sidebar invokes pickLocalWsdl
                    // The extension shows a QuickPick?
                    // Ext code: `vscode.window.showOpenDialog`.
                    // The `localWsdls` command in extension was: postMessage({ command: 'localWsdls', files }).
                    // BUT Sidebar logic calls `selectLocalWsdl` which shows dialog.
                    // BUT Sidebar logic calls `selectLocalWsdl` which shows dialog.
                    // The `localWsdls` logic in extension seems unused or fallback.
                    break;
                case 'settingsUpdate':
                    setConfig(message.config);
                    setRawConfig(message.raw);
                    if (message.config.ui) {
                        if (message.config.ui.layoutMode) setLayoutMode(message.config.ui.layoutMode);
                        if (message.config.ui.showLineNumbers !== undefined) setShowLineNumbers(message.config.ui.showLineNumbers);
                        if (message.config.ui.inlineElementValues !== undefined) setInlineElementValues(message.config.ui.inlineElementValues);
                        if (message.config.ui.splitRatio) setSplitRatio(message.config.ui.splitRatio);
                    }
                    break;
                case 'restoreAutosave':
                    if (message.content) {
                        try {
                            const savedState = JSON.parse(message.content);
                            setProjects(savedState.projects || []);
                            setExploredInterfaces(savedState.exploredInterfaces || []);
                            setExplorerExpanded(savedState.explorerExpanded ?? true);
                            setWsdlUrl(savedState.wsdlUrl || '');
                            if (savedState.lastSelectedProject) setSelectedProjectName(savedState.lastSelectedProject);
                        } catch (e) { console.error("Failed to restore autosave", e); }
                    }
                    break;
                case 'changelog':
                    setChangelog(message.content);
                    break;
                case 'projectSaved':
                    setSavedProjects(prev => {
                        const newSet = new Set(prev);
                        newSet.add(message.projectName);
                        return newSet;
                    });
                    setProjects(prev => prev.map(p => {
                        if (p.name !== message.projectName) return p;
                        return {
                            ...p,
                            dirty: false,
                            interfaces: p.interfaces.map(i => ({
                                ...i,
                                operations: i.operations.map(o => ({
                                    ...o,
                                    requests: o.requests.map(r => ({ ...r, dirty: false }))
                                }))
                            }))
                        };
                    }));
                    setTimeout(() => {
                        setSavedProjects(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(message.projectName);
                            return newSet;
                        });
                    }, 2000);
                    break;
                case 'workspaceSaved':
                    setWorkspaceDirty(false);
                    break;
            }
        };

        return bridge.onMessage(handleMessage);
    }, [wsdlUrl]);

    // Resizing Logic
    const startResizing = useCallback(() => setIsResizing(true), []);
    const stopResizing = useCallback(() => {
        setIsResizing(false);
        if (config?.ui) {
            bridge.sendMessage({ command: 'saveUiState', ui: { ...config.ui, splitRatio: splitRatio } });
        }
    }, [config, splitRatio]);
    const resize = useCallback((e: MouseEvent) => {
        if (isResizing) {
            let newRatio = 0.5;
            if (layoutMode === 'horizontal') {
                newRatio = e.clientX / window.innerWidth;
            } else {
                newRatio = (e.clientY - 40) / (window.innerHeight - 40 - 30); // Approx headers
            }
            if (newRatio < 0.1) newRatio = 0.1;
            if (newRatio > 0.9) newRatio = 0.9;
            setSplitRatio(newRatio);
        }
    }, [isResizing, layoutMode]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);


    // Handlers
    const loadWsdl = () => {
        if (inputType === 'url' && wsdlUrl) {
            bridge.sendMessage({ command: 'loadWsdl', url: wsdlUrl, isLocal: false });
        } else if (inputType === 'file' && selectedFile) {
            bridge.sendMessage({ command: 'loadWsdl', url: selectedFile, isLocal: true });
        }
    };

    const pickLocalWsdl = () => {
        bridge.sendMessage({ command: 'selectLocalWsdl' });
    };

    const executeRequest = (xml: string) => {
        setLoading(true);
        setResponse(null);
        startTimeRef.current = Date.now();
        if (selectedOperation) {
            // Find URL
            // If interface has definition, use it?
            // Or rely on WSDL loaded state?
            // `SoapClient` logic uses parsed client OR downloads.
            // We pass definition URL.
            // Prioritize the request-specific endpoint, then the interface definition, then the WSDL URL
            const url = selectedRequest?.endpoint || selectedInterface?.definition || wsdlUrl;
            bridge.sendMessage({ command: 'executeRequest', url, operation: selectedOperation.name, xml, contentType: selectedRequest?.contentType });
        }
    };

    const cancelRequest = () => {
        bridge.sendMessage({ command: 'cancelRequest' });
        setLoading(false);
    };

    const handleRequestUpdate = (updated: SoapUIRequest) => {
        const dirtyUpdated = { ...updated, dirty: true };
        setSelectedRequest(dirtyUpdated);
        setWorkspaceDirty(true);

        // Update in Project/Explorer
        if (selectedProjectName) {
            setProjects(prev => prev.map(p => {
                if (p.name !== selectedProjectName) return p;
                return {
                    ...p,
                    dirty: true,
                    interfaces: p.interfaces.map(i => {
                        if (i.name !== selectedInterface?.name) return i;
                        return {
                            ...i,
                            operations: i.operations.map(o => {
                                if (o.name !== selectedOperation?.name) return o;
                                return {
                                    ...o,
                                    requests: o.requests.map(r => r.name === selectedRequest?.name ? dirtyUpdated : r)
                                };
                            })
                        };
                    })
                };
            }));
        } else {
            setExploredInterfaces(prev => prev.map(i => {
                if (i.name !== selectedInterface?.name) return i;
                return {
                    ...i,
                    operations: i.operations.map(o => {
                        if (o.name !== selectedOperation?.name) return o;
                        return {
                            ...o,
                            requests: o.requests.map(r => r.name === selectedRequest?.name ? dirtyUpdated : r)
                        };
                    })
                };
            }));
        }
    };

    const handleResetRequest = () => {
        if (selectedRequest && selectedOperation) {
            const xml = getInitialXml(selectedOperation.input);
            const updated = { ...selectedRequest, request: xml };
            handleRequestUpdate(updated);
        }
    };

    // Sidebar Helpers
    const addToProject = (iface: SoapUIInterface) => {
        if (projects.length === 0) {
            setProjects([{ name: 'Project 1', interfaces: [iface], expanded: true, dirty: true, id: Date.now().toString() }]);
        } else {
            setProjects(prev => prev.map((p, i) =>
                i === 0 ? { ...p, interfaces: [...p.interfaces, iface], dirty: true } : p
            ));
        }
        setWorkspaceDirty(true);
        // Clear from explorer
        setExploredInterfaces(prev => prev.filter(i => i.name !== iface.name));
        if (exploredInterfaces.length <= 1) { // If it was the last one
            setExplorerExpanded(false);
        }
    };

    const addAllToProject = () => {
        if (projects.length === 0) {
            setProjects([{ name: 'Project 1', interfaces: [...exploredInterfaces], expanded: true, dirty: true, id: Date.now().toString() }]);
        } else {
            setProjects(prev => prev.map((p, i) =>
                i === 0 ? { ...p, interfaces: [...p.interfaces, ...exploredInterfaces], dirty: true } : p
            ));
        }
        setWorkspaceDirty(true);
        clearExplorer();
    };

    const clearExplorer = () => {
        setExploredInterfaces([]);
        setExplorerExpanded(false);
    };

    const removeFromExplorer = (iface: SoapUIInterface) => {
        setExploredInterfaces(prev => prev.filter(i => i !== iface));
    };

    const saveProject = (proj: SoapUIProject) => {
        bridge.sendMessage({ command: 'saveProject', project: proj });
    };

    const closeProject = (name: string) => {
        if (deleteConfirm === name) {
            setProjects(prev => prev.filter(p => p.name !== name));
            setWorkspaceDirty(true);
            // Reset selection if inside this project
            if (selectedProjectName === name) {
                setSelectedProjectName(null);
                setSelectedInterface(null);
                setSelectedOperation(null);
                setSelectedRequest(null);
            }
            setDeleteConfirm(null);
        } else {
            setDeleteConfirm(name);
            setTimeout(() => setDeleteConfirm(c => c === name ? null : c), 3000);
        }
    };

    const saveWorkspace = () => bridge.sendMessage({ command: 'saveWorkspace', projects });
    const openWorkspace = () => bridge.sendMessage({ command: 'openWorkspace' });
    const loadProject = () => bridge.sendMessage({ command: 'loadProject' });
    const addProject = () => {
        console.log("Adding Project, prev count:", projects.length);
        const name = `Project ${projects.length + 1}`;
        console.log("New Name:", name);
        setProjects(prev => [...prev, { name: name, interfaces: [], expanded: true, id: Date.now().toString(), dirty: true }]);
        setWorkspaceDirty(true);
    };


    // Expand Toggles
    const toggleExplorerExpand = () => setExplorerExpanded(!explorerExpanded);
    const toggleProjectExpand = (name: string) => setProjects(prev => prev.map(p => p.name === name ? { ...p, expanded: !p.expanded } : p));
    const toggleInterfaceExpand = (pName: string, iName: string) => {
        setProjects(prev => prev.map(p => {
            if (p.name !== pName) return p;
            return { ...p, interfaces: p.interfaces.map(i => i.name === iName ? { ...i, expanded: !i.expanded } : i) };
        }));
    };
    const toggleOperationExpand = (pName: string, iName: string, oName: string) => {
        setProjects(prev => prev.map(p => {
            if (p.name !== pName) return p;
            return {
                ...p,
                interfaces: p.interfaces.map(i => {
                    if (i.name !== iName) return i;
                    return { ...i, operations: i.operations.map(o => o.name === oName ? { ...o, expanded: !o.expanded } : o) };
                })
            };
        }));
    };

    const toggleExploredInterface = (iName: string) => {
        setExploredInterfaces(prev => prev.map(i => i.name === iName ? { ...i, expanded: !i.expanded } : i));
    };

    const toggleExploredOperation = (iName: string, oName: string) => {
        setExploredInterfaces(prev => prev.map(i => {
            if (i.name !== iName) return i;
            return { ...i, operations: i.operations.map(o => o.name === oName ? { ...o, expanded: !o.expanded } : o) };
        }));
    };

    // Context Menu
    const handleContextMenu = (e: React.MouseEvent, type: string, data: any, isExplorer = false) => {
        // Prevent empty context menus
        if (type === 'interface') return;
        if (isExplorer && type === 'request') return; // Requests in explorer are read-only (no rename/delete/clone)

        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, type, data, isExplorer });
    };

    const closeContextMenu = () => setContextMenu(null);

    // Context Menu Actions
    const handleRename = () => {
        if (contextMenu) {
            setRenameState({ active: true, type: contextMenu.type, data: contextMenu.data, value: contextMenu.data.name });
            closeContextMenu();
        }
    };

    const handleDeleteRequest = () => {
        if (contextMenu && contextMenu.type === 'request') {
            // Logic to delete request from project
            // We need to find the project, interface, operation
            // But we only have user selection or we need to traverse projects
            // Simplest: use selectedProjectName if matches, or ask Sidebar to pass project?
            // Sidebar passes `data`.
            // We need parent info.
            // But for now, rely on `deleteConfirm` or similar?
            // Actually, `handleDelete` in original App.tsx used `items`.
            // I'll implement a robust search-and-delete.
            if (contextMenu.isExplorer) return; // Cannot delete from explorer typically? Or just removes?

            const reqToRemove = contextMenu.data as SoapUIRequest;
            setProjects(prev => prev.map(p => ({
                ...p,
                interfaces: p.interfaces.map(i => ({
                    ...i,
                    operations: i.operations.map(o => ({
                        ...o,
                        requests: o.requests.filter(r => r !== reqToRemove)
                    }))
                }))
            })));
            closeContextMenu();
        }
    };

    const handleCloneRequest = () => {
        if (contextMenu && contextMenu.type === 'request' && !contextMenu.isExplorer) {
            const req = contextMenu.data as SoapUIRequest;
            setProjects(prev => prev.map(p => ({
                ...p,
                interfaces: p.interfaces.map(i => ({
                    ...i,
                    operations: i.operations.map(o => {
                        if (o.requests.includes(req)) {
                            const newReq = { ...req, name: `${req.name} Copy` };
                            return { ...o, requests: [...o.requests, newReq] };
                        }
                        return o;
                    })
                }))
            })));
            closeContextMenu();
        }
    };

    const handleViewSample = () => {
        if (contextMenu && (contextMenu.type === 'operation' || contextMenu.type === 'request')) {
            // How to get schema? Extension logic `sampleSchema`.
            // We need to send message.
            // Op Name?
            // Sidebar context menu 'data' for request is the request object. It doesn't have op name directly?
            // We might need to find it.
            // Simplified: only support on Operation or assume we can find it.
            // For now support on Operation.
            if (contextMenu.type === 'operation') {
                bridge.sendMessage({ command: 'getSampleSchema', operationName: contextMenu.data.name });
            }
            closeContextMenu();
        }
    };

    // ... Rename implementation ...

    return (
        <Container onClick={closeContextMenu}>
            <Sidebar
                explorerExpanded={explorerExpanded}
                toggleExplorerExpand={toggleExplorerExpand}
                exploredInterfaces={exploredInterfaces}
                projects={projects}
                inputType={inputType}
                setInputType={setInputType}
                wsdlUrl={wsdlUrl}
                setWsdlUrl={setWsdlUrl}
                selectedFile={selectedFile}
                loadWsdl={loadWsdl}
                pickLocalWsdl={pickLocalWsdl}
                downloadStatus={downloadStatus}
                addToProject={addToProject}
                addAllToProject={addAllToProject}
                clearExplorer={clearExplorer}
                removeFromExplorer={removeFromExplorer}
                toggleProjectExpand={toggleProjectExpand}
                toggleInterfaceExpand={toggleInterfaceExpand}
                toggleOperationExpand={toggleOperationExpand}
                toggleExploredInterface={toggleExploredInterface}
                toggleExploredOperation={toggleExploredOperation}
                saveWorkspace={saveWorkspace}
                openWorkspace={openWorkspace}
                loadProject={loadProject}
                saveProject={saveProject}
                closeProject={closeProject}
                onAddProject={addProject}
                selectedProjectName={selectedProjectName}
                setSelectedProjectName={setSelectedProjectName}
                selectedInterface={selectedInterface}
                setSelectedInterface={setSelectedInterface}
                selectedOperation={selectedOperation}
                setSelectedOperation={setSelectedOperation}
                selectedRequest={selectedRequest}
                setSelectedRequest={setSelectedRequest}
                setResponse={setResponse}
                handleContextMenu={handleContextMenu}
                deleteConfirm={deleteConfirm}
                backendConnected={backendConnected}
                savedProjects={savedProjects}
                onOpenSettings={() => setShowSettings(true)}
                onOpenHelp={() => setShowHelp(true)}
                workspaceDirty={workspaceDirty}
                showBackendStatus={!isVsCode()}
            />

            <WorkspaceLayout
                selectedRequest={selectedRequest}
                selectedOperation={selectedOperation}
                response={response}
                loading={loading}
                layoutMode={layoutMode}
                showLineNumbers={showLineNumbers}
                splitRatio={splitRatio}
                isResizing={isResizing}
                onExecute={executeRequest}
                onCancel={cancelRequest}
                onUpdateRequest={handleRequestUpdate}
                onReset={handleResetRequest}
                defaultEndpoint={selectedInterface?.definition || wsdlUrl}
                onToggleLayout={() => {
                    const newMode = layoutMode === 'vertical' ? 'horizontal' : 'vertical';
                    setLayoutMode(newMode);
                    bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, layoutMode: newMode } });
                }}
                onToggleLineNumbers={() => {
                    const newState = !showLineNumbers;
                    setShowLineNumbers(newState);
                    bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, showLineNumbers: newState } });
                }}
                inlineElementValues={inlineElementValues}
                onToggleInlineElementValues={() => {
                    const newState = !inlineElementValues;
                    setInlineElementValues(newState);
                    bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, inlineElementValues: newState } });
                }}
                onStartResizing={startResizing}
                config={config}
                onChangeEnvironment={(env) => bridge.sendMessage({ command: 'updateActiveEnvironment', envName: env })}
                changelog={changelog}
            />

            {showSettings && (
                <SettingsEditorModal
                    rawConfig={rawConfig}
                    onClose={() => setShowSettings(false)}
                    onSave={(content) => {
                        bridge.sendMessage({ command: 'saveSettings', raw: true, content });
                        setShowSettings(false);
                    }}
                />
            )}
            {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
            {contextMenu && (
                <ContextMenu top={contextMenu.y} left={contextMenu.x}>
                    {(contextMenu.type === 'request' || contextMenu.type === 'project') && (
                        <ContextMenuItem onClick={handleRename}>Rename</ContextMenuItem>
                    )}
                    {!contextMenu.isExplorer && contextMenu.type === 'request' && (
                        <>
                            <ContextMenuItem onClick={handleCloneRequest}>Clone Request</ContextMenuItem>
                            <ContextMenuItem onClick={handleDeleteRequest} style={{ color: 'var(--vscode-errorForeground)' }}>Delete</ContextMenuItem>
                        </>
                    )}
                    {(contextMenu.type === 'operation') && (
                        <ContextMenuItem onClick={handleViewSample}>View Sample Schema</ContextMenuItem>
                    )}
                </ContextMenu>
            )}

            {/* Rename Modal */}
            {renameState && (
                <ModalOverlay>
                    <ModalContent>
                        <ModalHeader>
                            <ModalTitle>Rename {renameState.type}</ModalTitle>
                            <Button onClick={() => setRenameState(null)} style={{ background: 'transparent' }}><X size={16} /></Button>
                        </ModalHeader>
                        <ModalBody>
                            <input
                                style={{ width: '100%', padding: 5 }}
                                value={renameState.value}
                                onChange={(e) => setRenameState({ ...renameState, value: e.target.value })}
                            />
                        </ModalBody>
                        <ModalFooter>
                            <Button onClick={() => {
                                // Apply rename logic here (update state)
                                if (renameState.type === 'project') {
                                    setProjects(projects.map(p => p === renameState.data ? { ...p, name: renameState.value } : p));
                                } else if (renameState.type === 'interface') {
                                    setProjects(prev => prev.map(p => {
                                        const hasInterface = p.interfaces.some(i => i === renameState.data);
                                        if (hasInterface) {
                                            return {
                                                ...p,
                                                interfaces: p.interfaces.map(i => i === renameState.data ? { ...i, name: renameState.value } : i)
                                            };
                                        }
                                        return p;
                                    }));
                                }
                                setRenameState(null);
                            }}>Save</Button>
                        </ModalFooter>
                    </ModalContent>
                </ModalOverlay>
            )}

            {/* Sample Schema Modal */}
            {sampleModal.open && (
                <ModalOverlay>
                    <ModalContent style={{ width: 600 }}>
                        <ModalHeader>
                            <ModalTitle>Schema: {sampleModal.operationName}</ModalTitle>
                            <Button onClick={() => setSampleModal({ open: false, schema: null, operationName: '' })} style={{ background: 'transparent' }}><X size={16} /></Button>
                        </ModalHeader>
                        <ModalBody>
                            {/* Keep fixed height for tree scroll */}
                            <div style={{ height: 500, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                {sampleModal.schema && <SchemaViewer schema={sampleModal.schema} />}
                            </div>
                        </ModalBody>
                    </ModalContent>
                </ModalOverlay>
            )}

        </Container>
    );
}

// Utility
function getInitialXml(input: any): string {
    // Basic XML generation from WSDL input definition
    if (!input) return '';
    let xml = '';
    for (const key in input) {
        xml += `<${key}>?</${key}>\n`;
    }
    return xml;
}

export default App;
