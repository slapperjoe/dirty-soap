import React, { useState, useEffect, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { bridge, isVsCode } from './utils/bridge';
import { Sidebar } from './components/Sidebar';
import { WorkspaceLayout } from './components/WorkspaceLayout';
import { HelpModal } from './components/HelpModal';

import { AddToTestCaseModal } from './components/modals/AddToTestCaseModal';
import { ConfirmationModal } from './components/modals/ConfirmationModal';
import { RenameModal } from './components/modals/RenameModal';
import { SampleModal } from './components/modals/SampleModal';
import { ExtractorModal } from './components/modals/ExtractorModal';
import { SettingsEditorModal } from './components/modals/SettingsEditorModal';
import { SoapUIInterface, SoapUIProject, SoapUIOperation, SoapUIRequest, SoapTestCase, SoapTestStep, SoapTestSuite, WatcherEvent, SidebarView, SoapTestExtractor, SoapUIAssertion } from './models';
import { formatXml } from './utils/xmlFormatter';
import { CustomXPathEvaluator } from './utils/xpathEvaluator';

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
    lastConfigPath?: string;
    lastProxyTarget?: string;
    openProjects?: string[];
}

interface ConfirmationState {
    title: string;
    message: string;
    onConfirm: () => void;
}

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



function App() {
    // State
    const [projects, setProjects] = useState<SoapUIProject[]>([]);
    const [exploredInterfaces, setExploredInterfaces] = useState<SoapUIInterface[]>([]);
    const [testExecution, setTestExecution] = useState<Record<string, Record<string, {
        status: 'running' | 'pass' | 'fail',
        error?: string,
        assertionResults?: any[],
        response?: any
    }>>>({});

    // Selection
    const [selectedProjectName, setSelectedProjectName] = useState<string | null>(null);
    const [selectedInterface, setSelectedInterface] = useState<SoapUIInterface | null>(null);
    const [selectedOperation, setSelectedOperation] = useState<SoapUIOperation | null>(null);
    const [selectedRequest, setSelectedRequest] = useState<SoapUIRequest | null>(null);
    const [selectedStep, setSelectedStep] = useState<SoapTestStep | null>(null); // Track Generic Step selection
    const [selectedTestCase, setSelectedTestCase] = useState<SoapTestCase | null>(null);
    const [response, setResponse] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [explorerExpanded, setExplorerExpanded] = useState(false);
    // exploredInterfaces already defined above



    const handleSelectTestSuite = (suiteId: string) => {
        const suite = projects.find(p => p.testSuites?.some(s => s.id === suiteId))?.testSuites?.find(s => s.id === suiteId);
        if (suite) {
            setSelectedTestCase(null);
            setSelectedStep(null);
            setSelectedRequest(null);
            setSelectedOperation(null);
            setSelectedInterface(null);
            setResponse(null);
            setActiveView(SidebarView.PROJECTS);
        }
    };

    const handleSelectTestCase = (caseId: string) => {
        // Find Case
        let foundCase: SoapTestCase | null = null;
        for (const p of projects) {
            if (p.testSuites) {
                for (const s of p.testSuites) {
                    const c = s.testCases?.find(tc => tc.id === caseId);
                    if (c) {
                        foundCase = c;
                        break;
                    }
                }
            }
            if (foundCase) break;
        }

        if (foundCase) {
            setSelectedTestCase(foundCase);
            setSelectedStep(null);
            setSelectedRequest(null);
            setSelectedOperation(null);
            setSelectedInterface(null);
            setResponse(null);
            setActiveView(SidebarView.PROJECTS);

            // Auto-select first step if it's a request?
            // For now, let WorkspaceLayout handle the Case View.
        } else {
            bridge.sendMessage({ command: 'error', message: `Could not find Test Case: ${caseId}` });
        }
    };
    // Data
    const [backendConnected, setBackendConnected] = useState(false);

    // UI State
    const [inputType, setInputType] = useState<'url' | 'file'>('url');
    const [wsdlUrl, setWsdlUrl] = useState('http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [downloadStatus, setDownloadStatus] = useState<string[] | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
    const [savedProjects, setSavedProjects] = useState<Set<string>>(new Set());
    const [workspaceDirty, setWorkspaceDirty] = useState(false);

    // Watcher / Proxy State
    const [activeView, setActiveView] = useState<SidebarView>(SidebarView.PROJECTS);
    const [watcherHistory, setWatcherHistory] = useState<WatcherEvent[]>([]);
    const [watcherRunning, setWatcherRunning] = useState(false);

    // Proxy State (Placeholders)
    const [proxyHistory, setProxyHistory] = useState<WatcherEvent[]>([]); // Reusing WatcherEvent for now
    const [proxyRunning, setProxyRunning] = useState(false);
    const [proxyConfig, setProxyConfig] = useState({ port: 9000, target: 'http://localhost:8080', systemProxyEnabled: true });
    const [configPath, setConfigPath] = useState<string | null>(null);

    const startTimeRef = useRef<number>(0);

    // Layout
    const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
    const [showLineNumbers, setShowLineNumbers] = useState(true);
    const [inlineElementValues, setInlineElementValues] = useState(false);
    const [hideCausalityData, setHideCausalityData] = useState(false);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const [isResizing, setIsResizing] = useState(false);

    // Modals & Menu
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: string, data: any, isExplorer: boolean } | null>(null);
    const [renameState, setRenameState] = useState<{ active: boolean, type: string, data: any, value: string } | null>(null);
    const [confirmationModal, setConfirmationModal] = useState<ConfirmationState | null>(null);
    const [addToTestCaseModal, setAddToTestCaseModal] = React.useState<{ open: boolean, request: SoapUIRequest | null }>({ open: false, request: null });
    const [sampleModal, setSampleModal] = React.useState<{ open: boolean, schema: any | null, operationName: string }>({ open: false, schema: null, operationName: '' });
    const [extractorModal, setExtractorModal] = React.useState<{ xpath: string, value: string, source: 'body' | 'header', variableName: string } | null>(null);





    // Settings
    const [config, setConfig] = useState<DirtySoapConfigWeb | null>(null);
    const [rawConfig, setRawConfig] = useState<string>('');
    const [showSettings, setShowSettings] = useState(false);
    const [showHelp, setShowHelp] = useState(false); // Help Modal State

    // Workspace State
    const [changelog, setChangelog] = useState<string>('');

    // Initial Load
    useEffect(() => {
        // Request settings on load
        bridge.sendMessage({ command: 'getSettings' });
        bridge.sendMessage({ command: 'getAutosave' });
        bridge.sendMessage({ command: 'getWatcherHistory' });

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

    // Auto-save Open Projects (Project Paths)
    useEffect(() => {
        // Collect file names of all open projects
        const paths = projects.map(p => p.fileName).filter(Boolean) as string[];
        // Debounce slightly to avoid excessive writes
        const timer = setTimeout(() => {
            bridge.sendMessage({ command: 'saveOpenProjects', paths });
        }, 1000);
        return () => clearTimeout(timer);
    }, [projects]);

    // Sync selectedTestCase with latest projects state
    useEffect(() => {
        if (selectedTestCase) {
            // Re-hydrate stale selectedTestCase
            for (const p of projects) {
                if (p.testSuites) {
                    for (const s of p.testSuites) {
                        const updatedCase = s.testCases?.find(tc => tc.id === selectedTestCase.id);
                        if (updatedCase) {
                            if (updatedCase !== selectedTestCase) {
                                // console.log('[sync] Re-hydrating selectedTestCase', updatedCase.name);
                                setSelectedTestCase(updatedCase);
                            }
                            return;
                        }
                    }
                }
            }
        }
    }, [projects, selectedTestCase]);

    // VS Code Messages
    useEffect(() => {
        const handleMessage = (message: any) => {
            switch (message.command) {
                case 'wsdlParsed':
                    // Convert raw SoapService to SoapUIInterface, Splitting by Port
                    const splitInterfaces: SoapUIInterface[] = [];

                    message.services.forEach((svc: any) => {
                        // Group operations by Port
                        const operationsByPort = new Map<string, any[]>();
                        svc.operations.forEach((op: any) => {
                            const port = op.portName || 'Default';
                            if (!operationsByPort.has(port)) {
                                operationsByPort.set(port, []);
                            }
                            operationsByPort.get(port)!.push(op);
                        });

                        // Create an Interface for each Port
                        operationsByPort.forEach((ops, portName) => {
                            // Use Port Name as the Interface Name if it's distinct from Service (or just use Port Name as it's usually unique/descriptive in WSDL)
                            // If Port is 'Default', use Service Name.
                            const interfaceName = portName === 'Default' ? svc.name : portName;

                            splitInterfaces.push({
                                name: interfaceName,
                                type: 'wsdl',
                                bindingName: portName, // Store port as binding name
                                soapVersion: portName.includes('12') ? '1.2' : '1.1', // Heuristic
                                definition: wsdlUrl,
                                operations: ops.map((op: any) => ({
                                    name: op.name,
                                    action: '',
                                    input: op.input,
                                    targetNamespace: op.targetNamespace || svc.targetNamespace, // Use Operation TNS, fallback to Service TNS
                                    originalEndpoint: op.originalEndpoint,
                                    requests: [{
                                        name: 'Request 1',
                                        headers: {
                                            'Content-Type': portName.includes('12') ? 'application/soap+xml' : 'text/xml'
                                        },
                                        request: portName.includes('12')
                                            ? `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tem="${op.targetNamespace || svc.targetNamespace || 'http://tempuri.org/'}">\n   <soap:Header/>\n   <soap:Body>\n      <tem:${op.name}>\n         <!--Optional:-->\n         ${getInitialXml(op.input)}\n      </tem:${op.name}>\n   </soap:Body>\n</soap:Envelope>`
                                            : `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${op.targetNamespace || svc.targetNamespace || 'http://tempuri.org/'}">\n   <soapenv:Header/>\n   <soapenv:Body>\n      <tem:${op.name}>\n         <!--Optional:-->\n         ${getInitialXml(op.input)}\n      </tem:${op.name}>\n   </soapenv:Body>\n</soapenv:Envelope>`
                                    }]
                                }))
                            });
                        });
                    });

                    // Deduplicate interfaces by name just in case
                    const uniqueInterfaces = splitInterfaces.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);

                    setExploredInterfaces(uniqueInterfaces);
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
                    setResponse({ ...res, rawResponse: displayResponse, duration, lineCount, assertionResults: message.assertionResults });
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
                case 'addStepToCase':
                    const op = message.operation;
                    setProjects(prev => prev.map(p => {
                        if (!p.testSuites) return p;
                        const suite = p.testSuites.find(s => s.testCases?.some(tc => tc.id === message.caseId));
                        if (!suite) return p;

                        const updatedSuite = {
                            ...suite,
                            testCases: suite.testCases?.map(tc => {
                                if (tc.id !== message.caseId) return tc;

                                const newStep: SoapTestStep = {
                                    id: `step-${Date.now()}`,
                                    name: op.name,
                                    type: 'request',
                                    config: {
                                        request: {
                                            id: `req-${Date.now()}`,
                                            name: op.name,
                                            endpoint: (op as any).originalEndpoint,
                                            request: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${op.targetNamespace || 'http://tempuri.org/'}">\n   <soapenv:Header/>\n   <soapenv:Body>\n      <tem:${op.name}>\n         <!--Optional:-->\n         ${getInitialXml(op.input)}\n      </tem:${op.name}>\n   </soapenv:Body>\n</soapenv:Envelope>`,
                                            assertions: []
                                        }
                                    }
                                };
                                return { ...tc, steps: [...tc.steps, newStep] };
                            })
                        };

                        const updatedProject = { ...p, testSuites: p.testSuites.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }));
                    setActiveView(SidebarView.PROJECTS);
                    break;
                case 'projectLoaded':
                    // Check if project exists
                    const newProj = message.project;
                    setProjects(prev => {
                        // Match by ID first (most reliable) if available, then Name
                        const existingIndex = prev.findIndex(p => (p.id && p.id === newProj.id) || p.name === newProj.name);

                        if (existingIndex !== -1) {
                            const existing = prev[existingIndex];
                            // Update filename and merge properties, but preserve local state if needed
                            const updated = { ...existing, fileName: message.filename };
                            // Ensure ID is consistent if missing locally
                            if (!updated.id && newProj.id) updated.id = newProj.id;

                            const newArr = [...prev];
                            newArr[existingIndex] = updated;
                            return newArr;
                        }
                        return [...prev, { ...newProj, fileName: message.filename, expanded: true }];
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
                    console.log("App.tsx: Received settingsUpdate.", { rawLength: message.raw?.length, configKeys: Object.keys(message.config || {}) });
                    setConfig(message.config);
                    setRawConfig(message.raw || JSON.stringify(message.config, null, 2));
                    // Consume UI preferences
                    if (message.config.ui) {
                        if (message.config.ui.layoutMode) setLayoutMode(message.config.ui.layoutMode);
                        if (message.config.ui.showLineNumbers !== undefined) setShowLineNumbers(message.config.ui.showLineNumbers);
                        if (message.config.ui.splitRatio !== undefined) setSplitRatio(message.config.ui.splitRatio);
                        if (message.config.ui.inlineElementValues !== undefined) setInlineElementValues(message.config.ui.inlineElementValues);
                    }

                    // Auto-load projects if we have none and config has some
                    if (projects.length === 0 && message.config.openProjects && message.config.openProjects.length > 0) {
                        message.config.openProjects.forEach((path: string) => {
                            // invoke loadProject via bridge directly or helper
                            // helper loadProject needs to accept path.
                            bridge.sendMessage({ command: 'loadProject', path });
                        });
                    }
                    if (message.config.lastConfigPath) {
                        setConfigPath(message.config.lastConfigPath);
                    }
                    if (message.config.lastProxyTarget) {
                        setProxyConfig(prev => ({ ...prev, target: message.config.lastProxyTarget! }));
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
                            fileName: message.fileName || p.fileName, // Update filename if provided
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
                case 'watcherUpdate':
                    setWatcherHistory(message.history);
                    break;
                case 'proxyLog':
                    setProxyHistory(prev => {
                        const existingIndex = prev.findIndex(e => e.id === message.event.id);
                        if (existingIndex !== -1) {
                            // Update existing entry (Response received)
                            const updated = [...prev];
                            updated[existingIndex] = { ...updated[existingIndex], ...message.event };
                            return updated;
                        }
                        return [message.event, ...prev];
                    });
                    break;
                case 'proxyStatus':
                    setProxyRunning(message.running);
                    break;
                case 'configFileSelected':
                    setConfigPath(message.path);
                    break;
                case 'configSwitched':
                case 'configRestored':
                    // Handled by backend notification for now
                    break;
                case 'updateProxyTarget':
                    const newConfig = { ...proxyConfig, target: message.target };
                    setProxyConfig(newConfig);
                    bridge.sendMessage({ command: 'updateProxyConfig', config: newConfig });
                    break;
                case 'testRunnerUpdate':
                    setTestExecution(prev => {
                        const { type, caseId, stepId, error } = message.data;
                        const newState = { ...prev };
                        if (!newState[caseId]) newState[caseId] = {};

                        if (type === 'testCaseStart') {
                            newState[caseId] = {}; // Reset
                        } else if (type === 'stepStart') {
                            newState[caseId][stepId] = { status: 'running' };
                        } else if (type === 'stepPass' || type === 'stepFail') {
                            const rawRes = message.data.response;
                            const enhancedResponse = rawRes ? {
                                ...rawRes,
                                lineCount: rawRes.rawResponse ? rawRes.rawResponse.split(/\r\n|\r|\n/).length : 0,
                                duration: (rawRes.timeTaken || 0) / 1000
                            } : null;

                            newState[caseId][stepId] = {
                                status: type === 'stepPass' ? 'pass' : 'fail',
                                error,
                                assertionResults: message.data.assertionResults,
                                response: enhancedResponse
                            };

                            // Auto-update Response Panel if currently selected
                            if (selectedTestCase && selectedTestCase.id === caseId) {
                                // Find if this step corresponds to the currently selected request
                                // Note: We don't have direct access to 'step' object here easily, but we can check if selectedRequest is linked?
                                // Actually, simpler: If the user is looking at a request that matches this step?
                                // Let's just update if we have a selectedRequest and it matches.
                                if (selectedRequest) {
                                    // This is tricky without iteration. Let's just check if we are viewing the test case.
                                    // Actually, we can just defer this to the 'onOpenStepRequest' which reads from state.
                                    // But to live update, we need to setResponse.
                                    // Iterate selectedTestCase steps to find match
                                    const step = selectedTestCase.steps.find(s => s.id === stepId);
                                    if (step && step.config.request && (step.config.request.id === selectedRequest.id)) {
                                        setResponse({
                                            ...enhancedResponse,
                                            assertionResults: message.data.assertionResults
                                        });
                                    }
                                }
                            }
                        }
                        return newState;
                    });
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
        console.log('[App] executeRequest called');
        console.log('[App] Context - Operation:', selectedOperation?.name, 'Request:', selectedRequest?.name);

        setLoading(true);
        setResponse(null);
        startTimeRef.current = Date.now();

        // Allow execution if we have a request context, even if not fully in an Operation content (e.g. Test Step)
        if (selectedOperation || selectedRequest) {
            const url = selectedRequest?.endpoint || selectedInterface?.definition || wsdlUrl;
            const opName = selectedOperation?.name || selectedRequest?.name || 'Unknown Operation';

            console.log('[App] Sending executeRequest message. URL:', url, 'Op:', opName);

            const logToOutput = (msg: string) => bridge.sendMessage({ command: 'log', message: msg });
            logToOutput(`Starting execution of step: ${selectedStep?.name || selectedRequest?.name}`);

            // Calculate context variables if running a test step
            const contextVariables: Record<string, string> = {};
            if (selectedTestCase && selectedStep) {
                const currentIndex = selectedTestCase.steps.findIndex(s => s.id === selectedStep.id);
                if (currentIndex > 0) {
                    const priorSteps = selectedTestCase.steps.slice(0, currentIndex);
                    priorSteps.forEach(step => {
                        if (step.type === 'request' && step.config.request?.extractors) {
                            const stepExec = testExecution[selectedTestCase.id]?.[step.id];
                            if (stepExec?.response) {
                                const rawResp = stepExec.response.rawResponse || (typeof stepExec.response.result === 'string'
                                    ? stepExec.response.result
                                    : JSON.stringify(stepExec.response.result));

                                if (rawResp) {
                                    step.config.request.extractors.forEach(ext => {
                                        if (ext.source === 'body') {
                                            try {
                                                const val = CustomXPathEvaluator.evaluate(rawResp, ext.path);
                                                if (val) {
                                                    contextVariables[ext.variable] = val;
                                                    logToOutput(`[Context] Extracted '${ext.variable}' = '${val}' from step '${step.name}'`);
                                                } else {
                                                    logToOutput(`[Context] Warning: Extractor for '${ext.variable}' in step '${step.name}' returned null.`);
                                                }
                                            } catch (e) {
                                                console.warn('[App] Extractor failed for variable ' + ext.variable, e);
                                                logToOutput(`[Context] Error evaluating extractor for '${ext.variable}': ${e}`);
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    });
                }
            }

            console.log('[App] Context Variables:', contextVariables);
            if (Object.keys(contextVariables).length > 0) {
                logToOutput(`[Context] Sending ${Object.keys(contextVariables).length} context variables to backend.`);
            }

            bridge.sendMessage({
                command: 'executeRequest',
                url,
                operation: opName,
                xml,
                contentType: selectedRequest?.contentType,
                assertions: selectedRequest?.assertions,
                headers: selectedRequest?.headers,
                contextVariables
            });
        } else {
            console.error('[App] executeRequest aborted: No selectedOperation or selectedRequest');
            setLoading(false);
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

                // 1. Is it a Test Case modification?
                if (selectedTestCase) {
                    console.log('[handleRequestUpdate] Updating within Test Case:', selectedTestCase.name);
                    let caseUpdated = false;
                    const updatedSuites = p.testSuites?.map(s => {
                        const tcIndex = s.testCases?.findIndex(tc => tc.id === selectedTestCase.id) ?? -1;
                        if (tcIndex === -1) return s;

                        const updatedCases = [...(s.testCases || [])];
                        // Find step containing this request - Prefer ID match, fallback to Name
                        const stepIndex = updatedCases[tcIndex].steps.findIndex(step =>
                            (updated.id && step.config.request?.id === updated.id) ||
                            step.config.request?.name === updated.name ||
                            (selectedRequest && step.config.request?.name === selectedRequest.name)
                        );

                        console.log('[handleRequestUpdate] Step Search Result:', stepIndex, 'for request:', updated.name);

                        if (stepIndex !== -1) {
                            caseUpdated = true;
                            updatedCases[tcIndex] = {
                                ...updatedCases[tcIndex],
                                steps: updatedCases[tcIndex].steps.map((st, i) => {
                                    if (i === stepIndex) {
                                        // Ensure ID exists on the saved request (Heal legacy data)
                                        const finalRequest = {
                                            ...dirtyUpdated,
                                            id: dirtyUpdated.id || `req-${Date.now()}-healed`
                                        };
                                        return { ...st, config: { ...st.config, request: finalRequest } };
                                    }
                                    return st;
                                })
                            };
                        }
                        return { ...s, testCases: updatedCases };
                    });

                    if (caseUpdated) {
                        const updatedProject = { ...p, testSuites: updatedSuites, dirty: true };
                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }
                }

                // 2. Normal Request Modification
                const updatedProject = {
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
                setTimeout(() => saveProject(updatedProject), 0);
                return updatedProject;
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

    const handleAddAssertion = (data: { xpath: string, expectedContent: string }) => {
        console.log("App.tsx: handleAddAssertion Called.", data, "TC:", selectedTestCase?.id, "Step:", selectedStep?.id);

        if (!selectedTestCase || !selectedStep) {
            console.error("App.tsx: Missing selection state", { tc: !!selectedTestCase, step: !!selectedStep });
            return;
        }

        let updatedStep: SoapTestStep | null = null;
        let updatedProjectOrNull: SoapUIProject | null = null;

        // Calculate new state
        const nextProjects = projects.map(p => {
            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
            if (!suite) return p;

            const updatedSuite = {
                ...suite,
                testCases: suite.testCases?.map(tc => {
                    if (tc.id !== selectedTestCase.id) return tc;
                    return {
                        ...tc,
                        steps: tc.steps.map(s => {
                            if (s.id !== selectedStep.id) return s;
                            if (s.type !== 'request' || !s.config.request) return s;

                            const newAssertion: SoapUIAssertion = {
                                id: crypto.randomUUID(),
                                type: 'XPath Match',
                                name: 'XPath Match - ' + data.xpath.split('/').pop(),
                                configuration: {
                                    xpath: data.xpath,
                                    expectedContent: data.expectedContent
                                }
                            };

                            const newStep = {
                                ...s,
                                config: {
                                    ...s.config,
                                    request: {
                                        ...s.config.request,
                                        assertions: [...(s.config.request.assertions || []), newAssertion],
                                        dirty: true
                                    }
                                }
                            };
                            updatedStep = newStep;
                            return newStep;
                        })
                    };
                })
            };

            const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
            updatedProjectOrNull = updatedProject;
            return updatedProject;
        });

        if (updatedProjectOrNull) {
            setProjects(nextProjects);
            setTimeout(() => saveProject(updatedProjectOrNull!), 0);
            if (updatedStep) {
                console.log("Updating Selected Step State:", (updatedStep as any).config.request.assertions.length, "assertions");
                setSelectedStep(updatedStep);
                if ((updatedStep as any).type === 'request' && (updatedStep as any).config.request) {
                    setSelectedRequest((updatedStep as any).config.request);
                }
            }
        }
    };

    const handleAddExistenceAssertion = (data: { xpath: string }) => {
        console.log("Adding Existence Assertion:", data);
        if (!selectedTestCase || !selectedStep) return;

        let updatedStep: SoapTestStep | null = null;
        let updatedProjectOrNull: SoapUIProject | null = null;

        const nextProjects = projects.map(p => {
            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
            if (!suite) return p;

            const updatedSuite = {
                ...suite,
                testCases: suite.testCases?.map(tc => {
                    if (tc.id !== selectedTestCase.id) return tc;
                    return {
                        ...tc,
                        steps: tc.steps.map(s => {
                            if (s.id !== selectedStep.id) return s;
                            if (s.type !== 'request' || !s.config.request) return s;

                            const newAssertion: SoapUIAssertion = {
                                id: crypto.randomUUID(),
                                type: 'XPath Match',
                                name: 'Node Exists - ' + data.xpath.split('/').pop(),
                                configuration: {
                                    xpath: `count(${data.xpath}) > 0`,
                                    expectedContent: 'true'
                                }
                            };

                            const newStep = {
                                ...s,
                                config: {
                                    ...s.config,
                                    request: {
                                        ...s.config.request,
                                        assertions: [...(s.config.request.assertions || []), newAssertion],
                                        dirty: true
                                    }
                                }
                            };
                            updatedStep = newStep;
                            return newStep;
                        })
                    };
                })
            };

            const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
            updatedProjectOrNull = updatedProject;
            return updatedProject;
        });

        if (updatedProjectOrNull) {
            setProjects(nextProjects);
            setTimeout(() => saveProject(updatedProjectOrNull!), 0);
            if (updatedStep) {
                console.log("Updating Selected Step State:", (updatedStep as any).config.request.assertions.length, "assertions");
                setSelectedStep(updatedStep);
                if ((updatedStep as any).type === 'request' && (updatedStep as any).config.request) {
                    setSelectedRequest((updatedStep as any).config.request);
                }
            }
        }
    };
    // Sidebar Helpers
    const addToProject = (iface: SoapUIInterface) => {
        // Prevent duplicates
        if (projects.length > 0 && projects[0].interfaces.some(i => i.name === iface.name)) {
            console.warn(`Interface ${iface.name} already exists in project`);
            return;
        }

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
                i === 0 ? {
                    ...p,
                    interfaces: [
                        ...p.interfaces,
                        ...exploredInterfaces.filter(ex => !p.interfaces.some(existing => existing.name === ex.name))
                    ],
                    dirty: true
                } : p
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

    // runSuite and runCase are defined above


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

    // const saveWorkspace = () => bridge.sendMessage({ command: 'saveWorkspace', projects }); // Removed
    // const openWorkspace = () => bridge.sendMessage({ command: 'openWorkspace' }); // Removed in favor of autosave
    const loadProject = (path?: string) => bridge.sendMessage({ command: 'loadProject', path });
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

    const handleDeleteRequest = (targetReq?: SoapUIRequest) => {
        const reqToRemove = targetReq || (contextMenu?.type === 'request' ? contextMenu.data as SoapUIRequest : null);
        if (reqToRemove) {
            // Check context menu if relying on it
            if (!targetReq && contextMenu?.isExplorer) return;

            setProjects(prev => {
                let projectChanged: SoapUIProject | null = null;
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
                        projectChanged = newP;
                        return newP;
                    }
                    return p;
                });

                if (projectChanged) saveProject(projectChanged);
                return newProjects;
            });

            if (contextMenu) closeContextMenu();
        }
    };
    // Helper to store context if needed, or just rely on Sidebar calling it correctly.
    // Actually ContextMenu has isExplorer. Direct call? Sidebar should prevent calling if explorer.

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

    const handleAddRequest = (targetOp?: SoapUIOperation) => {
        const op = targetOp || (contextMenu?.type === 'operation' ? contextMenu.data as SoapUIOperation : null);
        if (op) {
            const newReqName = `Request ${op.requests.length + 1}`;

            // Try to clone first request or create blank
            let newReqContent = '';
            if (op.requests.length > 0) {
                newReqContent = op.requests[0].request;
            } else {
                newReqContent = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${op.input || 'http://example.com/'}">\n   <soapenv:Header/>\n   <soapenv:Body>\n      <web:${op.name}>\n         <!--Optional:-->\n      </web:${op.name}>\n   </soapenv:Body>\n</soapenv:Envelope>`;
            }

            const newRequest: SoapUIRequest = {
                name: newReqName,
                request: newReqContent,
                id: crypto.randomUUID(),
                dirty: true,
                endpoint: op.requests[0]?.endpoint || '' // Copy endpoint from sibling or empty
            };

            setProjects(prev => prev.map(p => {
                // Find project containing this operation
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
                    const updatedProject = { ...p, interfaces: newInterfaces, dirty: true };
                    saveProject(updatedProject);
                    return updatedProject;
                }
                return p;
            }));

            if (contextMenu) closeContextMenu();
        }
    };

    const handleDeleteInterface = (iface: SoapUIInterface) => {
        setProjects(prev => {
            let projectChanged: SoapUIProject | null = null;
            const newProjects = prev.map(p => {
                const hasInterface = p.interfaces.some(i => i.name === iface.name);
                if (hasInterface) {
                    const newInterfaces = p.interfaces.filter(i => i.name !== iface.name);
                    const newP = { ...p, interfaces: newInterfaces, dirty: true };
                    projectChanged = newP;
                    return newP;
                }
                return p;
            });

            if (projectChanged) saveProject(projectChanged as SoapUIProject);
            return newProjects;
        });
        setWorkspaceDirty(true);

        if (selectedInterface?.name === iface.name) {
            setSelectedInterface(null);
            setSelectedOperation(null);
            setSelectedRequest(null);
            setResponse(null);
        }
    };

    const handleDeleteOperation = (op: SoapUIOperation, iface: SoapUIInterface) => {
        setProjects(prev => {
            let projectChanged: SoapUIProject | null = null;
            const newProjects = prev.map(p => {
                const targetInterface = p.interfaces.find(i => i.name === iface.name);
                if (targetInterface) {
                    const newInterfaces = p.interfaces.map(i => {
                        if (i.name === iface.name) {
                            // Filter operation by name
                            const newOps = i.operations.filter(o => o.name !== op.name);
                            return { ...i, operations: newOps };
                        }
                        return i;
                    });
                    const newP = { ...p, interfaces: newInterfaces, dirty: true };
                    projectChanged = newP;
                    return newP;
                }
                return p;
            });

            if (projectChanged) saveProject(projectChanged as SoapUIProject);
            return newProjects;
        });
        setWorkspaceDirty(true);

        // Clear selection if needed
        if (selectedOperation?.name === op.name && selectedInterface?.name === iface.name) {
            setSelectedOperation(null);
            setSelectedRequest(null);
            setResponse(null);
        }
    };

    const handleViewSample = () => {
        if (contextMenu && (contextMenu.type === 'operation' || contextMenu.type === 'request')) {
            // How to get schema? Extension logic `sampleSchema`.
            // We need to send message.
            // Op Name?
            // Sidebar context menu 'data' for request is the request object. It doesn't have op name directly?
            // We might need to find it.
            // Simplified: only support on Operation.
            if (contextMenu.type === 'operation') {
                bridge.sendMessage({ command: 'getSampleSchema', operationName: contextMenu.data.name });
            }
            closeContextMenu();
        }
    };

    const handleGenerateTestSuite = (target: SoapUIInterface | SoapUIOperation) => {
        console.log('[handleGenerateTestSuite] ENTRY. Target:', target);
        if ((target as any).operations) console.log('Target is Interface with operations:', (target as any).operations.length);
        if ((target as any).originalEndpoint) console.log('Target is Operation with Endpoint:', (target as any).originalEndpoint);

        // 1. Find the project containing this target
        let targetProject: SoapUIProject | null = null;
        for (const p of projects) {
            if (p.interfaces.some(i => i === target || i.operations.some(o => o === target))) {
                targetProject = p;
                break;
            }
        }
        if (!targetProject) return;

        // 2. Identify Operations
        let operationsToProcess: SoapUIOperation[] = [];
        let baseName = '';
        if ((target as any).operations) {
            operationsToProcess = (target as SoapUIInterface).operations;
            baseName = target.name;
        } else {
            operationsToProcess = [target as SoapUIOperation];
            baseName = target.name;
        }

        // 3. Create Suite
        const newSuite: SoapTestSuite = {
            id: `ts-${Date.now()}`,
            name: `Test Suite - ${baseName}`,
            testCases: [],
            expanded: true
        };

        // 4. Generate Cases
        operationsToProcess.forEach(op => {
            console.log('[handleGenerateTestSuite] Processing op:', op.name, op);

            const newCase: SoapTestCase = {
                id: `tc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: op.name,
                steps: [],
                expanded: true
            };
            console.log(`[DEBUG] Generating Test Case for ${op.name}`);
            console.log(`[DEBUG] TargetNamespace: ${(op as any).targetNamespace}`);
            console.log(`[DEBUG] OriginalEndpoint: ${(op as any).originalEndpoint}`);

            const newStep: SoapTestStep = {
                id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                name: 'Request 1',
                type: 'request',
                config: {
                    request: {
                        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        name: 'Request 1',
                        endpoint: (op as any).originalEndpoint || undefined, // Set Endpoint!
                        request: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${op.targetNamespace || 'http://tempuri.org/'}">\n   <soapenv:Header/>\n   <soapenv:Body>\n      <tem:${op.name}>\n         <!--Optional:-->\n         ${getInitialXml(op.input)}\n      </tem:${op.name}>\n   </soapenv:Body>\n</soapenv:Envelope>`,
                        assertions: [
                            {
                                id: `assert-${Date.now()}-1`,
                                type: 'Simple Not Contains',
                                name: 'Not SOAP Fault',
                                description: 'Response should not contain Fault',
                                configuration: { token: 'Fault' }
                            },
                            {
                                id: `assert-${Date.now()}-2`,
                                type: 'Response SLA',
                                name: 'Response SLA',
                                description: 'Response time check',
                                configuration: { sla: '200' }
                            }
                        ]
                    }
                }
            };
            newCase.steps.push(newStep);
            newSuite.testCases.push(newCase);
        });

        // 5. Save Logic
        setProjects(prev => prev.map(p => {
            if (p.id === targetProject!.id || p.fileName === targetProject!.fileName) {
                const updated = { ...p, testSuites: [...(p.testSuites || []), newSuite], dirty: true };
                setTimeout(() => saveProject(updated), 0);
                return updated;
            }
            return p;
        }));

        setActiveView(SidebarView.PROJECTS);
        closeContextMenu();
    };

    const handleSelectWatcherEvent = (event: WatcherEvent) => {
        let requestBody = event.formattedBody;
        if (requestBody === undefined) {
            const raw = event.requestContent || event.requestBody || '';
            requestBody = formatXml(raw, true, inlineElementValues, hideCausalityData);

            // Cache the formatted body so it doesn't re-format on next click
            if (activeView === 'proxy') {
                setProxyHistory(prev => prev.map(e => e.id === event.id ? { ...e, formattedBody: requestBody } : e));
            } else {
                setWatcherHistory(prev => prev.map(e => e.id === event.id ? { ...e, formattedBody: requestBody } : e));
            }
        }

        const tempRequest: SoapUIRequest = {
            id: event.id,
            name: `Logged: ${event.timestampLabel}`,
            request: requestBody,
            dirty: false,
            headers: event.requestHeaders || {},
            endpoint: event.url || '',
            method: event.method || 'POST'
        };

        const tempOp: SoapUIOperation = {
            name: 'External Request',
            input: '',
            requests: [tempRequest],
            action: 'WatcherAction'
        };

        const tempIface: SoapUIInterface = {
            name: 'File Watcher',
            type: 'wsdl',
            soapVersion: '1.1',
            definition: '',
            operations: [tempOp],
            bindingName: 'WatcherBinding'
        };

        setSelectedInterface(tempIface);
        setSelectedOperation(tempOp);
        setSelectedInterface(tempIface);
        setSelectedOperation(tempOp);
        setSelectedRequest(tempRequest);
        setSelectedTestCase(null); // Ensure we exit test case context

        const responseContent = event.responseContent || event.responseBody;
        if (responseContent) {
            setResponse({
                rawResponse: responseContent,
                duration: event.duration || 0,
                lineCount: responseContent.split(/\r\n|\r|\n/).length,
                success: event.success,
                headers: event.responseHeaders
            });
        } else {
            setResponse(null);
        }
    };

    const handleRunTestCaseWrapper = (caseId: string) => {
        // Find Project and Context to determine proper endpoint fallback
        let fallbackEndpoint = wsdlUrl || '';
        let targetProject: SoapUIProject | undefined;
        let foundCase: SoapTestCase | undefined;

        for (const p of projects) {
            if (p.testSuites) {
                for (const s of p.testSuites) {
                    const c = s.testCases?.find(tc => tc.id === caseId);
                    if (c) {
                        targetProject = p;
                        foundCase = c;
                        break;
                    }
                }
            }
            if (foundCase) break;
        }

        if (targetProject && targetProject.interfaces && targetProject.interfaces.length > 0) {
            if (foundCase) {
                const matchingIface = targetProject.interfaces.find(i => i.operations.some(o => o.name === foundCase?.name));
                if (matchingIface && matchingIface.definition) {
                    fallbackEndpoint = matchingIface.definition;
                } else if (targetProject.interfaces[0].definition) {
                    fallbackEndpoint = targetProject.interfaces[0].definition;
                }
            } else if (targetProject.interfaces[0].definition) {
                fallbackEndpoint = targetProject.interfaces[0].definition;
            }
        }

        console.log('[App] Running Case with Fallback:', fallbackEndpoint);
        bridge.sendMessage({ command: 'runTestCase', caseId, testCase: foundCase, fallbackEndpoint });
    };

    const handleRunTestSuiteWrapper = (suiteId: string) => {
        let fallbackEndpoint = wsdlUrl || '';
        const targetProject = projects.find(p => p.testSuites?.some(s => s.id === suiteId));

        if (targetProject && targetProject.interfaces && targetProject.interfaces.length > 0) {
            if (targetProject.interfaces[0].definition) {
                fallbackEndpoint = targetProject.interfaces[0].definition;
            }
        }
        console.log('[App] Running Suite with Fallback:', fallbackEndpoint);
        bridge.sendMessage({ command: 'runTestSuite', suiteId, fallbackEndpoint });
    };

    const handleSaveExtractor = (data: { xpath: string, value: string, source: 'body' | 'header', variableName: string }) => {
        if (!selectedTestCase || !selectedStep?.config?.request) return;

        const newExtractor: SoapTestExtractor = {
            id: `ext-${Date.now()}`,
            variable: data.variableName,
            source: data.source,
            path: data.xpath
        };

        const updatedStep = {
            ...selectedStep,
            config: {
                ...selectedStep.config,
                request: {
                    ...selectedStep.config.request,
                    extractors: [...(selectedStep.config.request.extractors || []), newExtractor]
                }
            }
        };

        // Update Project State
        setProjects(prev => prev.map(p => {
            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
            if (!suite) return p;

            const updatedSuite = {
                ...suite,
                testCases: suite.testCases?.map(tc => {
                    if (tc.id !== selectedTestCase.id) return tc;
                    return {
                        ...tc,
                        steps: tc.steps.map(s => s.id === selectedStep.id ? updatedStep : s)
                    };
                })
            };
            const newP = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
            setTimeout(() => saveProject(newP), 0);
            return newP;
        }));

        // Update Local State for UI
        setSelectedStep(updatedStep);
        if (selectedRequest && selectedRequest.id === updatedStep.config.request.id) {
            setSelectedRequest(updatedStep.config.request);
        }
    };

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
                // saveWorkspace={saveWorkspace} // Removed
                // openWorkspace={openWorkspace} // Removed
                loadProject={() => loadProject()}
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
                setSelectedRequest={(req) => {
                    setSelectedRequest(req);
                    setSelectedTestCase(null); // Clear test case when main request is selected
                }}
                setResponse={setResponse}
                handleContextMenu={handleContextMenu}
                onDeleteInterface={handleDeleteInterface}
                onDeleteOperation={handleDeleteOperation}
                deleteConfirm={deleteConfirm}
                setDeleteConfirm={setDeleteConfirm}
                backendConnected={backendConnected}
                savedProjects={savedProjects}
                onOpenSettings={() => setShowSettings(true)}
                onOpenHelp={() => setShowHelp(true)}
                workspaceDirty={workspaceDirty}
                showBackendStatus={!isVsCode()}

                activeView={activeView}
                onChangeView={setActiveView}
                onAddSuite={(projName) => {
                    const project = projects.find(p => p.name === projName);
                    if (project) {
                        const newSuite = {
                            id: `suite-${Date.now()}`,
                            name: `TestSuite ${((project.testSuites || []).length + 1)}`,
                            testCases: [],
                            expanded: true
                        };
                        const updatedProject = {
                            ...project,
                            testSuites: [...(project.testSuites || []), newSuite],
                            dirty: true
                        };

                        // Update State
                        setProjects(projects.map(p => p.name === projName ? updatedProject : p));

                        // Save
                        saveProject(updatedProject);
                    }
                }}
                onRunSuite={handleRunTestSuiteWrapper}
                onDeleteSuite={(suiteId) => {
                    if (deleteConfirm === suiteId) {
                        setProjects(prev => prev.map(p => {
                            if (!p.testSuites || !p.testSuites.some(s => s.id === suiteId)) return p;

                            const remaining = p.testSuites.filter(s => s.id !== suiteId);
                            const updated = { ...p, testSuites: remaining, dirty: true };

                            setTimeout(() => saveProject(updated), 0);
                            return updated;
                        }));
                        setDeleteConfirm(null);
                    } else {
                        setDeleteConfirm(suiteId);
                        setTimeout(() => setDeleteConfirm(null), 2000);
                    }
                }}
                onSelectSuite={handleSelectTestSuite}
                onSelectTestCase={handleSelectTestCase}
                onToggleSuiteExpand={(suiteId) => {
                    setProjects(prev => prev.map(p => {
                        if (!p.testSuites?.some(s => s.id === suiteId)) return p;

                        const updatedSuites = p.testSuites.map(s => {
                            if (s.id !== suiteId) return s;
                            return { ...s, expanded: s.expanded === false ? true : false };
                        });

                        const updatedProject = { ...p, testSuites: updatedSuites, dirty: true };
                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }));
                }}
                onToggleCaseExpand={(caseId) => {
                    setProjects(prev => prev.map(p => {
                        const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                        if (!suite) return p;

                        const updatedSuite = {
                            ...suite,
                            testCases: suite.testCases?.map(tc => {
                                if (tc.id !== caseId) return tc;
                                return { ...tc, expanded: tc.expanded === false ? true : false };
                            })
                        };

                        const updatedProject = {
                            ...p,
                            testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s),
                            dirty: true
                        };
                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }));
                }}
                onAddTestCase={(suiteId) => {
                    setProjects(prev => prev.map(p => {
                        const suite = p.testSuites?.find(s => s.id === suiteId);
                        if (!suite) return p;

                        const newCase: SoapTestCase = {
                            id: `tc-${Date.now()}`,
                            name: `TestCase ${(suite.testCases?.length || 0) + 1}`,
                            expanded: true,
                            steps: []
                        };
                        const updatedSuite = { ...suite, testCases: [...(suite.testCases || []), newCase] };
                        const updatedProject = {
                            ...p,
                            testSuites: p.testSuites!.map(s => s.id === suiteId ? updatedSuite : s),
                            dirty: true
                        };

                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }));
                }}
                onRunCase={handleRunTestCaseWrapper}
                onDeleteTestCase={(caseId) => {
                    if (deleteConfirm === caseId) {
                        setProjects(prev => prev.map(p => {
                            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                            if (!suite) return p;

                            const updatedSuite = { ...suite, testCases: suite.testCases?.filter(tc => tc.id !== caseId) || [] };
                            const updatedProject = {
                                ...p,
                                testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s),
                                dirty: true
                            };

                            setTimeout(() => saveProject(updatedProject), 0);
                            return updatedProject;
                        }));
                        setDeleteConfirm(null);
                    } else {
                        setDeleteConfirm(caseId);
                        setTimeout(() => setDeleteConfirm(null), 2000);
                    }
                }}

                watcherHistory={watcherHistory}
                onSelectWatcherEvent={handleSelectWatcherEvent}
                watcherRunning={watcherRunning}
                onStartWatcher={() => {
                    setWatcherRunning(true);
                    bridge.sendMessage({ command: 'startWatcher' });
                }}
                onStopWatcher={() => {
                    setWatcherRunning(false);
                    bridge.sendMessage({ command: 'stopWatcher' });
                }}
                onClearWatcher={() => {
                    setWatcherHistory([]);
                    bridge.sendMessage({ command: 'clearWatcherHistory' });
                }}

                proxyRunning={proxyRunning}
                onStartProxy={() => {
                    bridge.sendMessage({ command: 'startProxy' });
                    // Optimistic update
                    setProxyRunning(true);
                }}
                onStopProxy={() => {
                    bridge.sendMessage({ command: 'stopProxy' });
                    setProxyRunning(false);
                }}
                proxyConfig={proxyConfig}
                onUpdateProxyConfig={(config) => {
                    const newConfig = { ...config, systemProxyEnabled: config.systemProxyEnabled ?? true };
                    setProxyConfig(newConfig);
                    bridge.sendMessage({ command: 'updateProxyConfig', config: newConfig });
                }}
                proxyHistory={proxyHistory}
                onClearProxy={() => setProxyHistory([])}
                configPath={configPath}
                onSelectConfigFile={() => bridge.sendMessage({ command: 'selectConfigFile' })}
                onOpenCertificate={() => bridge.sendMessage({ command: 'installCertificate' })}
                onSaveProxyHistory={(content) => bridge.sendMessage({ command: 'saveProxyHistory', content })}
                onInjectProxy={() => {
                    if (configPath) {
                        const proxyUrl = `http://localhost:${proxyConfig.port}`;
                        bridge.sendMessage({ command: 'injectProxy', path: configPath, proxyUrl });
                    }
                }}
                onRestoreProxy={() => {
                    if (configPath) {
                        bridge.sendMessage({ command: 'restoreProxy', path: configPath });
                    }
                }}
                onSaveUiState={() => {
                    if (config) {
                        bridge.sendMessage({ command: 'saveUiState', ui: config.ui });
                    }
                }}
                onAddRequest={handleAddRequest}
                onDeleteRequest={handleDeleteRequest}
            />

            <WorkspaceLayout
                selectedRequest={selectedRequest}
                selectedOperation={selectedOperation}
                selectedTestCase={selectedTestCase}
                onRunTestCase={handleRunTestCaseWrapper}
                onOpenStepRequest={(req) => {
                    // Legacy Support / Deep Linking? 
                    // This is triggered by clicking a Request Step in the list IF onSelectStep is not passed.
                    // But we will pass onSelectStep now.
                    // However, we still need this logic if invoked elsewise?
                    // Let's keep the logic inside the new handler or keep this for now.
                    setSelectedRequest(req);
                    // ... (rest of logic) ...
                }}
                onSelectStep={(step) => {
                    setSelectedStep(step);
                    if (step) {
                        if (step.type === 'request' && step.config.request) {
                            setSelectedRequest(step.config.request);
                            // Update Response Panel Logic
                            if (selectedTestCase) {
                                const result = testExecution[selectedTestCase.id]?.[step.id];
                                if (result && result.response) {
                                    setResponse({
                                        ...result.response,
                                        assertionResults: result.assertionResults
                                    });
                                } else {
                                    setResponse(null);
                                }
                            }
                        } else {
                            setSelectedRequest(null);
                            setResponse(null);
                        }
                    } else {
                        setSelectedRequest(null);
                        setResponse(null);
                    }
                }}
                onDeleteStep={(stepId) => {
                    if (!selectedTestCase) return;
                    setProjects(prev => prev.map(p => {
                        const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
                        if (!suite) return p;

                        const updatedSuite = {
                            ...suite,
                            testCases: suite.testCases?.map(tc => {
                                if (tc.id !== selectedTestCase.id) return tc;
                                return {
                                    ...tc,
                                    steps: tc.steps.filter(s => s.id !== stepId)
                                };
                            })
                        };
                        const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }));

                    if (selectedStep?.id === stepId) {
                        setSelectedStep(null);
                        setSelectedRequest(null);
                        setResponse(null);
                    }
                }}
                onMoveStep={(stepId, direction) => {
                    if (!selectedTestCase) return;
                    setProjects(prev => prev.map(p => {
                        const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
                        if (!suite) return p;

                        const updatedSuite = {
                            ...suite,
                            testCases: suite.testCases?.map(tc => {
                                if (tc.id !== selectedTestCase.id) return tc;
                                const steps = [...tc.steps];
                                const index = steps.findIndex(s => s.id === stepId);
                                if (index === -1) return tc;

                                if (direction === 'up' && index > 0) {
                                    [steps[index], steps[index - 1]] = [steps[index - 1], steps[index]];
                                } else if (direction === 'down' && index < steps.length - 1) {
                                    [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
                                } else {
                                    return tc; // No change
                                }

                                return { ...tc, steps };
                            })
                        };
                        const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }));
                }}
                onAddExtractor={(data) => {
                    if (!selectedStep) return;
                    setExtractorModal({ ...data, variableName: '' });
                }}
                onAddAssertion={handleAddAssertion}
                onAddExistenceAssertion={handleAddExistenceAssertion}
                onUpdateStep={(updatedStep) => {
                    if (!selectedTestCase) return;
                    setProjects(prev => prev.map(p => {
                        const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
                        if (!suite) return p; // Should be rare

                        const updatedSuite = {
                            ...suite,
                            testCases: suite.testCases?.map(tc => {
                                if (tc.id !== selectedTestCase.id) return tc;
                                return {
                                    ...tc,
                                    steps: tc.steps.map(s => s.id === updatedStep.id ? updatedStep : s)
                                };
                            })
                        };

                        const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
                        // Debounce save? User requested less notifications.
                        // We will address the notification suppression in the backend, but we should debounce the save here too if typing.
                        // For now, direct save.
                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }));
                    setSelectedStep(updatedStep);
                }}
                onBackToCase={() => {
                    setSelectedRequest(null);
                    setSelectedStep(null);
                    setResponse(null); // Clear response when going back so we don't show stale data
                }}
                selectedStep={selectedStep}
                onAddStep={(caseId, type) => {
                    if (type === 'delay') {
                        setProjects(prev => prev.map(p => {
                            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                            if (!suite) return p;

                            const updatedSuite = {
                                ...suite,
                                testCases: suite.testCases?.map(tc => {
                                    if (tc.id !== caseId) return tc;
                                    const newStep: SoapTestStep = {
                                        id: `step-${Date.now()}`,
                                        name: 'Delay',
                                        type: 'delay',
                                        config: { delayMs: 1000 }
                                    };
                                    return { ...tc, steps: [...tc.steps, newStep] };
                                }) || []
                            };

                            const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
                            setTimeout(() => saveProject(updatedProject), 0);
                            return updatedProject;
                        }));
                    } else if (type === 'request') {
                        bridge.sendMessage({ command: 'pickOperationForTestCase', caseId });
                    }
                }}
                testExecution={testExecution}
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
                    // Invalidate formatted body cache to force re-format with new settings
                    setProxyHistory(prev => prev.map(e => ({ ...e, formattedBody: undefined })));
                    setWatcherHistory(prev => prev.map(e => ({ ...e, formattedBody: undefined })));
                    bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, inlineElementValues: newState } });
                }}
                hideCausalityData={hideCausalityData}
                onToggleHideCausalityData={() => {
                    const newState = !hideCausalityData;
                    setHideCausalityData(newState);
                    // Invalidate formatted body cache
                    setProxyHistory(prev => prev.map(e => ({ ...e, formattedBody: undefined })));
                    setWatcherHistory(prev => prev.map(e => ({ ...e, formattedBody: undefined })));
                    bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, hideCausalityData: newState } });
                }}
                isReadOnly={activeView !== 'projects'}
                onStartResizing={startResizing}
                config={config}
                onChangeEnvironment={(env) => bridge.sendMessage({ command: 'updateActiveEnvironment', envName: env })}
                changelog={changelog}
            />

            {showSettings && (
                <SettingsEditorModal
                    rawConfig={rawConfig}
                    onClose={() => setShowSettings(false)}
                    onSave={(content, config) => {
                        bridge.sendMessage({ command: 'saveSettings', raw: !config, content, config });
                        setShowSettings(false);
                    }}
                />
            )}
            {showHelp && (
                <HelpModal
                    onClose={() => setShowHelp(false)}
                />
            )}
            {contextMenu && (
                <ContextMenu top={contextMenu.y} left={contextMenu.x}>
                    {(contextMenu.type === 'request' || contextMenu.type === 'project') && (
                        <ContextMenuItem onClick={handleRename}>Rename</ContextMenuItem>
                    )}
                    {!contextMenu.isExplorer && contextMenu.type === 'request' && (
                        <>
                            <ContextMenuItem onClick={handleCloneRequest}>Clone Request</ContextMenuItem>
                            <ContextMenuItem onClick={() => {
                                if (contextMenu) {
                                    setAddToTestCaseModal({ open: true, request: contextMenu.data as SoapUIRequest });
                                    closeContextMenu();
                                }
                            }}>Add to Test Case</ContextMenuItem>
                            <ContextMenuItem onClick={() => handleDeleteRequest()} style={{ color: 'var(--vscode-errorForeground)' }}>Delete</ContextMenuItem>
                        </>
                    )}
                    {(contextMenu.type === 'operation') && (
                        <>
                            <ContextMenuItem onClick={() => handleGenerateTestSuite(contextMenu.data)}>Generate Test Suite</ContextMenuItem>
                            <ContextMenuItem onClick={() => handleAddRequest()}>Add Request</ContextMenuItem>
                            <ContextMenuItem onClick={handleViewSample}>View Sample Schema</ContextMenuItem>
                        </>
                    )}
                    {(contextMenu.type === 'interface') && (
                        <ContextMenuItem onClick={() => handleGenerateTestSuite(contextMenu.data)}>Generate Test Suite</ContextMenuItem>
                    )}
                </ContextMenu>
            )}



            {/* Rename Modal */}
            <RenameModal
                isOpen={!!renameState}
                title={`Rename ${renameState?.type}`}
                initialValue={renameState?.value || ''}
                onCancel={() => setRenameState(null)}
                onSave={(value) => {
                    if (!renameState) return;
                    // Apply rename logic here (update state)
                    if (renameState.type === 'project') {
                        setProjects(projects.map(p => p === renameState.data ? { ...p, name: value } : p));
                    } else if (renameState.type === 'interface') {
                        setProjects(prev => prev.map(p => {
                            const hasInterface = p.interfaces.some(i => i === renameState.data);
                            if (hasInterface) {
                                return {
                                    ...p,
                                    interfaces: p.interfaces.map(i => i === renameState.data ? { ...i, name: value } : i)
                                };
                            }
                            return p;
                        }));
                    }
                    setRenameState(null);
                }}
            />

            {/* Sample Schema Modal */}
            <SampleModal
                isOpen={sampleModal.open}
                operationName={sampleModal.operationName}
                schema={sampleModal.schema}
                onClose={() => setSampleModal({ open: false, schema: null, operationName: '' })}
            />

            {/* Add to Test Case Modal */}
            {
                addToTestCaseModal.open && addToTestCaseModal.request && (
                    <AddToTestCaseModal
                        projects={projects}
                        onClose={() => setAddToTestCaseModal({ open: false, request: null })}
                        onAdd={(target) => {
                            const req = addToTestCaseModal.request!;
                            const newStep: SoapTestStep = {
                                id: `step-${Date.now()}`,
                                name: req.name,
                                type: 'request',
                                config: {
                                    request: { ...req, id: `req-${Date.now()}` },
                                    requestId: undefined
                                }
                            };

                            setProjects(prev => prev.map(p => {
                                const suite = target.suiteId ? p.testSuites?.find(s => s.id === target.suiteId) :
                                    p.testSuites?.find(s => s.testCases.some(tc => tc.id === target.caseId));

                                if (!suite) return p;

                                const updatedTestSuites = (p.testSuites || []).map(s => {
                                    if (s.id === suite.id) {
                                        // If creating new case
                                        if (target.type === 'new') {
                                            const newCase: SoapTestCase = {
                                                id: `tc-${Date.now()}`,
                                                name: `TestCase ${(s.testCases?.length || 0) + 1}`,
                                                expanded: true,
                                                steps: [newStep]
                                            };
                                            return { ...s, testCases: [...(s.testCases || []), newCase] };
                                        }
                                        // If adding to existing
                                        if (target.type === 'existing' && target.caseId) {
                                            return {
                                                ...s,
                                                testCases: s.testCases.map(tc =>
                                                    tc.id === target.caseId ? { ...tc, steps: [...tc.steps, newStep] } : tc
                                                )
                                            };
                                        }
                                    }
                                    return s;
                                });

                                const newProj = { ...p, testSuites: updatedTestSuites, dirty: true };
                                setTimeout(() => saveProject(newProj), 0);
                                return newProj;
                            }));
                            setAddToTestCaseModal({ open: false, request: null });
                            setActiveView(SidebarView.PROJECTS);
                        }}
                    />
                )
            }

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={!!confirmationModal}
                title={confirmationModal?.title || ''}
                message={confirmationModal?.message || ''}
                onCancel={() => setConfirmationModal(null)}
                onConfirm={() => {
                    confirmationModal?.onConfirm();
                    setConfirmationModal(null);
                }}
            />

            {/* Extractor Modal */}
            <ExtractorModal
                isOpen={!!extractorModal}
                data={extractorModal}
                onClose={() => setExtractorModal(null)}
                onSave={(data) => {
                    handleSaveExtractor(data);
                    setExtractorModal(null);
                }}
            />

        </Container >
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
