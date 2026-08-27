/**
 * useMessageHandler Hook
 * 
 * Extracted from App.tsx to handle all VS Code extension messages.
 * Contains temporary debug logging for troubleshooting.
 */

import { useEffect, useRef } from 'react';
import { bridge, isTauri } from '../utils/bridge';
import { debugLog } from '../utils/logger';
import { generateInitialXmlForOperation } from '../utils/soapUtils';
import { BackendCommand, FrontendCommand } from '@shared/messages';
import {
    ApiInterface,
    ApinoxProject,
    ApiRequest,
    TestStep,
    TestCase,
    SidebarView,
    RequestHistoryEntry,
    RequestAttachment,
    WsdlDiff
} from '@shared/models';
import { useNavigation } from '../contexts/NavigationContext';

type SidebarProjectState = ApinoxProject & { loading?: boolean };

export interface MessageHandlerState {
    // Setters for state that the handler modifies
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    setExplorerExpanded: React.Dispatch<React.SetStateAction<boolean>>;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;
    setDownloadStatus: React.Dispatch<React.SetStateAction<string[] | null>>;
    setSelectedFile: React.Dispatch<React.SetStateAction<string | null>>;
    setSampleModal: React.Dispatch<React.SetStateAction<{ open: boolean; schema: any; operationName: string }>>;
    setBackendConnected: React.Dispatch<React.SetStateAction<boolean>>;
    setConfig: React.Dispatch<React.SetStateAction<any>>;
    setRawConfig: React.Dispatch<React.SetStateAction<string>>;
    setLayoutMode: React.Dispatch<React.SetStateAction<'vertical' | 'horizontal'>>;
    setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>;
    setSplitRatio: React.Dispatch<React.SetStateAction<number>> | ((ratio: number) => void);
    setInlineElementValues: React.Dispatch<React.SetStateAction<boolean>>;
    configPath?: string | null;
    setConfigPath: React.Dispatch<React.SetStateAction<string | null>>;
    setConfigDir: React.Dispatch<React.SetStateAction<string | null>>;
    // setProxyConfig removed — moved to MockProxyContext (proxy features now in APIprox)
    setSelectedProjectName: React.Dispatch<React.SetStateAction<string | null>>;
    setWsdlUrl: React.Dispatch<React.SetStateAction<string>>;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    setSavedProjects: React.Dispatch<React.SetStateAction<Set<string>>>;
    setSaveErrors: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    setChangelog: React.Dispatch<React.SetStateAction<string>>;
    setActiveView: React.Dispatch<React.SetStateAction<SidebarView>>;
    setRequestHistory: React.Dispatch<React.SetStateAction<RequestHistoryEntry[]>>;


    // Current values needed for message handling
    wsdlUrl: string;
    projects: ApinoxProject[];
    config: any;
    selectedTestCase: TestCase | null;
    selectedRequest: ApiRequest | null;
    startTimeRef: React.MutableRefObject<number>;

    // Callbacks
    saveProject: (project: ApinoxProject) => void;
    onAttachmentSelected?: (attachment: RequestAttachment) => void;
    setWsdlDiff: React.Dispatch<React.SetStateAction<WsdlDiff | null>>;
}

export function useMessageHandler(state: MessageHandlerState) {
    const {
        setProjects,
        setExplorerExpanded,
        setLoading,
        setResponse,
        setDownloadStatus,
        setSelectedFile,
        setSampleModal,
        setBackendConnected,
        setConfig,
        setRawConfig,
        setLayoutMode,
        setShowLineNumbers,
        setSplitRatio,
        setInlineElementValues,
        setConfigPath,
        setConfigDir,
        // setProxyConfig,
        setSelectedProjectName,
        setWsdlUrl,
        setWorkspaceDirty,
        setSavedProjects,
        setSaveErrors,
        setChangelog,
        // setWatcherHistory, // Removed - watcher features
        // setProxyHistory,
        // setProxyRunning,
        // setTestExecution,
        setActiveView,
        // setActiveBreakpoint, // Removed - breakpoint features
        // setMockHistory,
        // setMockRunning,
        // setMockConfig,
        // setActiveRunId,
        // setPerformanceProgress,
        // setCoordinatorStatus,
        setRequestHistory,
        wsdlUrl,
        projects,
        config,
        selectedTestCase,
        selectedRequest,
        startTimeRef,
        saveProject,
        onAttachmentSelected,
        setWsdlDiff
    } = state;

    // Get exploredInterfaces from NavigationContext
    const { setExploredInterfaces, setActiveView: setActiveViewFromNav } = useNavigation();

    // MockProxyContext removed - proxy/mock features moved to APIprox
    // const { setProxyHistory, setMockHistory, setProxyRunning, setMockRunning } = useMockProxy();

    // Silence unused variable warning until migration is complete
    void setSavedProjects;

    // Use refs for values that change frequently to avoid re-registering message listener
    const projectsRef = useRef(projects);
    const selectedRequestRef = useRef(selectedRequest);
    const selectedTestCaseRef = useRef(selectedTestCase);
    const configRef = useRef(config);
    const wsdlUrlRef = useRef(wsdlUrl);

    // Keep refs up to date
    useEffect(() => { projectsRef.current = projects; }, [projects]);
    useEffect(() => { selectedRequestRef.current = selectedRequest; }, [selectedRequest]);
    useEffect(() => { selectedTestCaseRef.current = selectedTestCase; }, [selectedTestCase]);
    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { wsdlUrlRef.current = wsdlUrl; }, [wsdlUrl]);

    useEffect(() => {
        debugLog('[useMessageHandler] Setting up message listener');

        const handleMessage = (message: any) => {
            debugLog(`[useMessageHandler] Received: ${message.command}`, { hasData: !!message.data || !!message.result });

            switch (message.command) {
                case BackendCommand.WsdlLoadCancelled:
                    debugLog('[useMessageHandler] wsdlLoadCancelled');
                    setDownloadStatus(null);
                    break;

                case BackendCommand.WsdlParsed:
                    const data = message.services;
                    debugLog('[useMessageHandler] wsdlParsed Raw Data', {
                        isArray: Array.isArray(data),
                        keys: data ? Object.keys(data) : 'null',
                        hasInterfaces: !!data?.interfaces,
                        interfacesLength: data?.interfaces?.length
                    });

                    const newInterfaces: ApiInterface[] = [];

                    if (Array.isArray(data)) {
                        // WSDL Handling: Convert SoapService[] to ApiInterface[]
                        data.forEach((svc: any) => {
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
                                const interfaceName = portName === 'Default' ? svc.name : portName;

                                newInterfaces.push({
                                    id: crypto.randomUUID(),
                                    name: interfaceName,
                                    type: 'wsdl',
                                    bindingName: portName,
                                    soapVersion: portName.includes('12') ? '1.2' : '1.1',
                                    definition: wsdlUrlRef.current,
                                    expanded: false,
                                    operations: ops.map((op: any) => ({
                                        id: crypto.randomUUID(),
                                        name: op.name,
                                        action: op.action || '',
                                        input: op.input,
                                        fullSchema: op.fullSchema, // Pass through the full schema
                                        targetNamespace: op.targetNamespace || svc.targetNamespace,
                                        originalEndpoint: op.originalEndpoint,
                                        expanded: false,
                                        requests: [{
                                            id: crypto.randomUUID(),
                                            name: 'Sample',
                                            endpoint: op.originalEndpoint,
                                            contentType: portName.includes('12') ? 'application/soap+xml' : 'text/xml',
                                            headers: {
                                                'Content-Type': portName.includes('12') ? 'application/soap+xml' : 'text/xml'
                                            },
                                            request: generateInitialXmlForOperation(op),
                                            requestType: 'soap', // Explicitly set for WSDL operations
                                            bodyType: 'xml' // Explicitly set for WSDL operations
                                        }]
                                    }))
                                });
                            });
                        });
                    } else if (data && data.interfaces) {
                        // OpenAPI Handling: Already correctly formatted
                        // Ensure IDs are unique if needed, or rely on Parser
                        newInterfaces.push(...data.interfaces);
                    }

                    const uniqueInterfaces = newInterfaces.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
                    debugLog('[useMessageHandler] wsdlParsed complete', { interfaceCount: uniqueInterfaces.length });
                    setExploredInterfaces(uniqueInterfaces);
                    setExplorerExpanded(true);
                    setActiveView(SidebarView.EXPLORER);
                    setDownloadStatus(null); // Clear loading status
                    break;

                case BackendCommand.Response:
                    debugLog('[useMessageHandler] response', { hasResult: !!message.result, op: message.operation, request: message.requestName });
                    setLoading(false);
                    const endTime = Date.now();
                    const duration = (endTime - startTimeRef.current) / 1000;

                    let lineCount = 0;
                    let displayResponse = '';
                    let language: 'xml' | 'json' = 'xml';

                    const res = message.result;
                    const createdAt = Date.now();
                    if (res) {
                        const contentType = (res.headers?.['content-type'] || res.headers?.['Content-Type'] || '').toLowerCase();
                        const tryPrettyJson = (value: string) => {
                            try {
                                return JSON.stringify(JSON.parse(value), null, 2);
                            } catch {
                                return null;
                            }
                        };

                        if (res.rawResponse) {
                            if (typeof res.rawResponse === 'object') {
                                displayResponse = JSON.stringify(res.rawResponse, null, 2);
                                language = 'json';
                            } else if (typeof res.rawResponse === 'string') {
                                const trimmed = res.rawResponse.trim();
                                const isJsonLike = contentType.includes('json') || contentType.includes('graphql') || trimmed.startsWith('{') || trimmed.startsWith('[');
                                if (isJsonLike) {
                                    const pretty = tryPrettyJson(res.rawResponse);
                                    displayResponse = pretty || res.rawResponse;
                                    language = 'json';
                                } else {
                                    displayResponse = res.rawResponse;
                                }
                            }
                        } else if (typeof res === 'string') {
                            const pretty = tryPrettyJson(res);
                            if (pretty) {
                                displayResponse = pretty;
                                language = 'json';
                            } else {
                                displayResponse = res;
                            }
                        } else if (res.body) {
                            if (typeof res.body === 'object') {
                                displayResponse = JSON.stringify(res.body, null, 2);
                                language = 'json';
                            } else {
                                const pretty = tryPrettyJson(res.body);
                                if (pretty) {
                                    displayResponse = pretty;
                                    language = 'json';
                                } else {
                                    displayResponse = res.body;
                                }
                            }
                        } else if (res.data && typeof res.data === 'string') {
                            const pretty = tryPrettyJson(res.data);
                            if (pretty) {
                                displayResponse = pretty;
                                language = 'json';
                            } else {
                                displayResponse = res.data;
                            }
                        } else {
                            displayResponse = JSON.stringify(res, null, 2);
                            language = 'json';
                        }
                    }

                    if (displayResponse) {
                        lineCount = displayResponse.split(/\r\n|\r|\n/).length;
                    }

                    // M5: flag truncated responses so the user knows the body was capped.
                    let rawResponse = displayResponse;
                    if (res?.truncated) {
                        rawResponse = `${rawResponse ? rawResponse + '\n\n' : ''}--- RESPONSE TRUNCATED AT ${(32 * 1024 * 1024 / 1024 / 1024)} MiB (M5 body cap) ---`;
                    }

                    const nextResponse = { ...res, rawResponse, duration, lineCount, assertionResults: message.assertionResults, language, createdAt, truncated: res?.truncated ?? false };
                    debugLog('[useMessageHandler] response:setResponse', { duration, lineCount, language, hasRaw: !!displayResponse, truncated: res?.truncated });
                    setResponse(nextResponse);
                    break;

                case BackendCommand.Error:
                    debugLog('[useMessageHandler] error', { message: message.message, originalCommand: message.originalCommand });
                    setLoading(false);
                    setDownloadStatus(null); // Clear loading status on any error
                    
                    // Handle SaveProject errors specially
                    if (message.originalCommand === FrontendCommand.SaveProject && message.projectName) {
                        debugLog('[useMessageHandler] saveProject error', { projectName: message.projectName, error: message.error });
                        // Track the error
                        setSaveErrors(current => {
                            const next = new Map(current);
                            next.set(message.projectName, message.error || 'Failed to save project');
                            return next;
                        });
                        // Don't update response panel for save errors
                        break;
                    }
                    
                    if (
                        message.originalCommand === FrontendCommand.SyncProjects ||
                        message.originalCommand === FrontendCommand.SaveOpenProjects ||
                        message.originalCommand === FrontendCommand.AutoSaveWorkspace ||
                        message.originalCommand === FrontendCommand.SaveWorkspace
                    ) {
                        // Ignore backend save errors for response panel updates
                        // (prevents wiping response when autosave fails)
                        break;
                    }
                    setResponse({ error: message.message });
                    break;

                case BackendCommand.DownloadComplete:
                    debugLog('[useMessageHandler] downloadComplete', { fileCount: message.files?.length });
                    setDownloadStatus(message.files);
                    setTimeout(() => setDownloadStatus(null), 5000);
                    break;

                case BackendCommand.WsdlSelected:
                    debugLog('[useMessageHandler] wsdlSelected', { path: message.path });
                    setSelectedFile(message.path);
                    break;

                case BackendCommand.SampleSchema:
                    debugLog('[useMessageHandler] sampleSchema', { operationName: message.operationName });
                    setSampleModal({ open: true, schema: message.schema, operationName: message.operationName });
                    break;

                case BackendCommand.AddStepToCase:
                    debugLog('[useMessageHandler] addStepToCase', { caseId: message.caseId });

                    setProjects(prev => prev.map(p => {
                        if (!p.testSuites) return p;
                        const suite = p.testSuites.find(s => s.testCases?.some(tc => tc.id === message.caseId));
                        if (!suite) return p;

                        const updatedSuite = {
                            ...suite,
                            testCases: suite.testCases?.map(tc => {
                                if (tc.id !== message.caseId) return tc;

                                let newStep: TestStep;

                                if (message.request) {
                                    // Created from existing Folder Request - Clone it
                                    const sourceReq = message.request;
                                    newStep = {
                                        id: `step-${Date.now()}`,
                                        name: sourceReq.name,
                                        type: 'request',
                                        config: {
                                            request: {
                                                ...sourceReq,
                                                id: `req-${Date.now()}`, // New ID for the step's copy
                                                // Ensure assertions init if missing
                                                assertions: sourceReq.assertions || [],
                                                readOnly: false
                                            }
                                        }
                                    };
                                } else {
                                    // Created from WSDL/OpenAPI Operation - Use first request if available
                                    const op = message.operation;
                                    
                                    // Check if operation has existing requests (e.g., from OpenAPI)
                                    if (op.requests && op.requests.length > 0) {
                                        const firstRequest = op.requests[0];
                                        newStep = {
                                            id: `step-${Date.now()}`,
                                            name: op.name,
                                            type: 'request',
                                            config: {
                                                request: {
                                                    ...firstRequest,
                                                    id: `req-${Date.now()}`,
                                                    assertions: firstRequest.assertions || []
                                                }
                                            }
                                        };
                                    } else {
                                        // No requests - generate default SOAP XML
                                        newStep = {
                                            id: `step-${Date.now()}`,
                                            name: op.name,
                                            type: 'request',
                                            config: {
                                                request: {
                                                    id: `req-${Date.now()}`,
                                                    name: op.name,
                                                    endpoint: (op as any).originalEndpoint,
                                                    request: generateInitialXmlForOperation(op),
                                                    assertions: []
                                                }
                                            }
                                        };
                                    }
                                }
                                return { ...tc, steps: [...tc.steps, newStep] };
                            })
                        };

                        const updatedProject = { ...p, testSuites: p.testSuites.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
                        setTimeout(() => saveProject(updatedProject), 0);
                        return updatedProject;
                    }));
                    // Don't change activeView - let user stay on current sidebar tab (Tests)
                    break;

                case BackendCommand.PerformanceRunStarted:
                case BackendCommand.PerformanceRunComplete:
                case BackendCommand.PerformanceIterationComplete:
                case BackendCommand.CoordinatorStatus:
                case BackendCommand.AddOperationToPerformance:
                    // Handled in PerformanceContext
                    break;

                case BackendCommand.ProjectLoaded:
                    debugLog('[useMessageHandler] projectLoaded', { projectName: message.project?.name });

                    // Detailed inspection of received project
                    if (message.project?.testSuites) {
                        message.project.testSuites.forEach((ts: any) => {
                            ts.testCases?.forEach((tc: any) => {
                                tc.steps?.forEach((step: any) => {
                                    if (step.type === 'script') {
                                        console.log(`[useMessageHandler] Received Script Step: ${step.name}. Content Length: ${step.config?.scriptContent?.length || 0}`);
                                    }
                                });
                            });
                        });
                    }

                    console.log(`[useMessageHandler] ProjectLoaded for: ${message.project?.name}. FileName: ${message.filename}`);
                    const newProj = message.project as SidebarProjectState;
                    setProjects(prev => {
                        const existingIndex = prev.findIndex(p => (p.id && p.id === newProj.id) || p.name === newProj.name);

                        if (existingIndex !== -1) {
                            const existing = prev[existingIndex] as SidebarProjectState;
                            // MERGE logic: Take new project data, but preserve UI state (expanded, dirty?) 
                            // and user-created folders (not yet persisted to disk)
                            const updated: SidebarProjectState = {
                                ...newProj,
                                fileName: message.filename,
                                expanded: existing.expanded,
                                folders: existing.folders || newProj.folders, // Preserve in-memory folders
                                // If we have local changes (dirty=true), should we overwrite? 
                                // "Load Project" usually implies "Reload from Disk", so yes, overwrite.
                                dirty: false,
                                loading: false
                            };

                            // Ensure ID is stable if missing in newProj (though it should be there)
                            if (!updated.id && existing.id) updated.id = existing.id;

                            const newArr = [...prev];
                            newArr[existingIndex] = updated;
                            return newArr;
                        }
                        return [...prev, { ...newProj, fileName: message.filename, expanded: true, loading: false }];
                    });
                    setWorkspaceDirty(true);
                    break;

                case BackendCommand.WorkspaceLoaded:
                    debugLog('[useMessageHandler] workspaceLoaded', { projectCount: message.projects?.length });
                    setProjects(message.projects.map((p: any) => ({ ...p, expanded: false })));
                    setWorkspaceDirty(false);
                    break;

                case BackendCommand.EchoResponse:
                    debugLog('[useMessageHandler] echoResponse - Backend connected');
                    setBackendConnected(true);
                    break;

                case BackendCommand.LocalWsdls:
                    debugLog('[useMessageHandler] localWsdls (no-op)');
                    break;

                case BackendCommand.SettingsUpdate:
                    debugLog('[useMessageHandler] settingsUpdate', { hasConfig: !!message.config });
                    if (!message.config) {
                        console.warn('[useMessageHandler] Malformed settingsUpdate — missing config payload. Full message:', JSON.stringify(message));
                        break;
                    }
                    setConfig(message.config);
                    setRawConfig(message.raw || JSON.stringify(message.config, null, 2));
                    if (message.config.ui) {
                        if (message.config.ui.layoutMode) setLayoutMode(message.config.ui.layoutMode);
                        if (message.config.ui.showLineNumbers !== undefined) setShowLineNumbers(message.config.ui.showLineNumbers);
                        if (message.config.ui.splitRatio !== undefined) setSplitRatio(message.config.ui.splitRatio);
                        if (message.config.ui.inlineElementValues !== undefined) setInlineElementValues(message.config.ui.inlineElementValues);
                    }

                    if (message.config.lastConfigPath) {
                        setConfigPath(message.config.lastConfigPath);
                    }
                    if (message.configDir) {
                        setConfigDir(message.configDir);
                    } else if (message.configPath) {
                        const derivedDir = message.configPath.replace(/[\\/][^\\/]+$/, '');
                        if (derivedDir) {
                            setConfigDir(derivedDir);
                        }
                    }
                    // Mock/Proxy config handled in MockProxyContext
                    break;
                    break;

                case BackendCommand.RestoreAutosave:
                    debugLog('[useMessageHandler] restoreAutosave', { hasContent: !!message.content });
                    if (message.content) {
                        try {
                            const savedState = JSON.parse(message.content);
                            // Merge with existing projects to preserve UI state like expanded
                            setProjects(prev => {
                                const savedProjects = savedState.projects || [];
                                if (prev.length === 0) {
                                    // No existing projects, use autosave directly but preserve expanded
                                    return savedProjects.map((p: any) => ({
                                        ...p,
                                        expanded: p.expanded !== false, // Default to true if not set
                                        loading: Boolean(p.fileName)
                                    }));
                                }
                                // Merge: for each saved project, update existing or add new
                                const merged = [...prev];
                                savedProjects.forEach((saved: any) => {
                                    const existingIdx = merged.findIndex(p =>
                                        (p.id && p.id === saved.id) || p.name === saved.name
                                    );
                                    if (existingIdx >= 0) {
                                        // Merge - preserve expanded state from existing
                                        merged[existingIdx] = {
                                            ...saved,
                                            expanded: merged[existingIdx].expanded ?? saved.expanded ?? true,
                                            loading: Boolean(saved.fileName)
                                        };
                                    } else {
                                        // Add new with expanded true
                                        merged.push({ ...saved, expanded: saved.expanded !== false, loading: Boolean(saved.fileName) });
                                    }
                                });
                                return merged;
                            });
                            setExploredInterfaces(savedState.exploredInterfaces || []);
                            // setExplorerExpanded(savedState.explorerExpanded ?? true); // Handled in NavigationContext
                            if (savedState.explorerExpanded !== undefined) {
                                setExplorerExpanded(savedState.explorerExpanded);
                            }
                            setWsdlUrl(savedState.wsdlUrl || '');
                            if (savedState.lastSelectedProject) setSelectedProjectName(savedState.lastSelectedProject);

                            // Trigger fresh load from disk for each project to get scriptContent
                            // Autosave only stores UI state, not full data like scriptContent
                            if (savedState.projects) {
                                savedState.projects.forEach((p: any) => {
                                    if (p.fileName) {
                                        bridge.sendMessage({ command: 'loadProject', path: p.fileName });
                                    }
                                });
                            }
                        } catch (e) {
                            debugLog('[useMessageHandler] restoreAutosave FAILED', { error: String(e) });
                        }
                    }
                    break;

                case BackendCommand.Changelog:
                    debugLog('[useMessageHandler] changelog received', { length: message.content?.length });
                    setChangelog(message.content);
                    break;


                // Watcher/Proxy/Mock commands removed - features moved to APIprox
                /*
                case BackendCommand.WatcherUpdate:
                    debugLog('[useMessageHandler] watcherUpdate', {
                        historyLength: message.history?.length
                    });
                    setWatcherHistory(message.history);
                    break;


                case BackendCommand.ProxyLog:
                    if (message.event && setProxyHistory) {
                        setProxyHistory(prev => [message.event, ...prev].slice(0, 50));
                    }
                    break;

                case BackendCommand.MockLog:
                case BackendCommand.MockHistoryUpdate:
                    if (message.event && setMockHistory) {
                        setMockHistory(prev => [message.event, ...prev].slice(0, 50));
                    }
                    break;
                */

                // Proxy/Mock/Breakpoint commands removed - features moved to APIprox
                /*
                case BackendCommand.ProxyStatus:
                    if (message.running !== undefined && setProxyRunning) {
                        setProxyRunning(message.running);
                    }
                    break;

                case BackendCommand.MockStatus:
                    if (message.running !== undefined && setMockRunning) {
                        setMockRunning(message.running);
                    }
                    break;

                case BackendCommand.MockRulesUpdated:
                case BackendCommand.MockHit:
                case BackendCommand.MockRecorded:
                case BackendCommand.UpdateProxyTarget:
                    break;

                case BackendCommand.BreakpointHit:
                    debugLog('[useMessageHandler] breakpointHit', { breakpointId: message.breakpointId, type: message.type });
                    setActiveBreakpoint({
                        id: message.breakpointId,
                        type: message.type,
                        content: message.content,
                        headers: message.headers,
                        breakpointName: message.breakpointName,
                        timeoutMs: message.timeoutMs,
                        startTime: Date.now()
                    });
                    break;

                case BackendCommand.BreakpointTimeout:
                    debugLog('[useMessageHandler] breakpointTimeout', { breakpointId: message.breakpointId });
                    setActiveBreakpoint(null);
                    break;
                */

                case BackendCommand.ConfigFileSelected:
                    debugLog('[useMessageHandler] configFileSelected', { path: message.path });
                    setConfigPath(message.path);
                    break;

                case BackendCommand.AdoHasPatResult:
                    debugLog('[useMessageHandler] adoHasPatResult', { hasPat: message.hasPat });
                    // ADO PAT check result - handled by IntegrationsTab
                    break;

                case BackendCommand.AdoProjectsResult:
                    debugLog('[useMessageHandler] adoProjectsResult (no-op)');
                    break;

                case BackendCommand.AdoTestConnectionResult:
                    debugLog('[useMessageHandler] adoTestConnectionResult (no-op)');
                    break;

                case BackendCommand.AdoAddCommentResult:
                    debugLog('[useMessageHandler] adoAddCommentResult (no-op)');
                    break;

                case BackendCommand.ClipboardText:
                    debugLog('[useMessageHandler] clipboardText (no-op)');
                    break;

                case BackendCommand.ConfigSwitched:
                case BackendCommand.ConfigRestored:
                    debugLog(`[useMessageHandler] ${message.command} (no-op)`);
                    break;

                case BackendCommand.TestRunnerUpdate:
                    // Handled in TestRunnerContext
                    break;

                // Request History handlers
                case BackendCommand.HistoryLoaded: {
                    const entries = message.entries || [];
                    debugLog('[useMessageHandler] historyLoaded', { count: entries.length });
                    if (entries.length === 0 && isTauri()) {
                        try {
                            const cached = localStorage.getItem('apinox_history_cache');
                            const cachedEntries = cached ? JSON.parse(cached) : null;
                            if (Array.isArray(cachedEntries) && cachedEntries.length > 0) {
                                setRequestHistory(cachedEntries);
                                break;
                            }
                        } catch (e) {
                            console.warn('[History] Failed to read cache:', e);
                        }
                    }
                    setRequestHistory(entries);
                    break;
                }

                case BackendCommand.HistoryUpdate:
                    debugLog('[useMessageHandler] historyUpdate', { entryId: message.entry?.id });
                    if (message.entry) {
                        setRequestHistory(prev => [message.entry, ...prev].slice(0, 100));
                    }
                    break;

                case BackendCommand.AttachmentSelected:
                    debugLog('[useMessageHandler] attachmentSelected', { name: message.attachment?.name });
                    if (message.attachment && onAttachmentSelected) {
                        onAttachmentSelected(message.attachment);
                    }
                    break;
                case BackendCommand.ProjectSaved:
                case BackendCommand.ProjectLoaded:
                    // Handled in ProjectContext
                    break;

                case BackendCommand.WsdlRefreshResult:
                    debugLog('[useMessageHandler] wsdlRefreshResult', { hasDiff: !!message.diff });
                    setWsdlDiff(message.diff);
                    break;

                case BackendCommand.ScrapbookLoaded:
                case BackendCommand.ScrapbookUpdated:
                    debugLog(`[useMessageHandler] ${message.command}`, { hasData: !!message.state });
                    // Scrapbook state handled by ScrapbookContext
                    break;

                default:
                    debugLog(`[useMessageHandler] Unknown command: ${message.command}`);
            }
        };

        const cleanup = bridge.onMessage(handleMessage);
        debugLog('[useMessageHandler] Message listener registered');

        return () => {
            debugLog('[useMessageHandler] Cleaning up message listener');
            cleanup();
        };
    }, []); // Empty deps - refs are used to access current values
}
