/**
 * useMessageHandler Hook
 * 
 * Extracted from App.tsx to handle all VS Code extension messages.
 * Contains temporary debug logging for troubleshooting.
 */

import { useEffect, useRef } from 'react';
import { bridge } from '../utils/bridge';
import { getInitialXml } from '../utils/soapUtils';
import { BackendCommand, FrontendCommand } from '@shared/messages';
import {
    ApiInterface,
    ApinoxProject,
    ApiRequest,
    TestStep,
    TestCase,
    WatcherEvent,
    SidebarView,
    RequestHistoryEntry,
    RequestAttachment,
    WsdlDiff
} from '@shared/models';

// Debug logger - console only to prevent message flooding
// Note: Sending log messages back to the backend on every received message
// creates a flood that can lock up the UI, especially on first start
const debugLog = (context: string, data?: any) => {
    const msg = `[useMessageHandler] ${context}`;
    console.log(msg, data || '');
};

export interface MessageHandlerState {
    // Setters for state that the handler modifies
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    setExploredInterfaces: React.Dispatch<React.SetStateAction<ApiInterface[]>>;
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
    // setActiveRunId: React.Dispatch<React.SetStateAction<string | null>>; // Moved to PerformanceContext
    // setPerformanceProgress: React.Dispatch<React.SetStateAction<any>>; // Moved to PerformanceContext
    // setCoordinatorStatus: React.Dispatch<React.SetStateAction<any>>; // Moved to PerformanceContext
    configPath?: string | null;
    setConfigPath: React.Dispatch<React.SetStateAction<string | null>>;
    // setProxyConfig: React.Dispatch<React.SetStateAction<any>>; // Moved to MockProxyContext
    setSelectedProjectName: React.Dispatch<React.SetStateAction<string | null>>;
    setWsdlUrl: React.Dispatch<React.SetStateAction<string>>;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    setSavedProjects: React.Dispatch<React.SetStateAction<Set<string>>>;
    setChangelog: React.Dispatch<React.SetStateAction<string>>;
    setWatcherHistory: React.Dispatch<React.SetStateAction<WatcherEvent[]>>;
    // setProxyHistory: Moved to MockProxyContext
    // setProxyRunning: Moved to MockProxyContext
    // setTestExecution: Moved to TestRunnerContext
    setActiveView: React.Dispatch<React.SetStateAction<SidebarView>>;
    setActiveBreakpoint: React.Dispatch<React.SetStateAction<{
        id: string;
        type: 'request' | 'response';
        content: string;
        headers?: Record<string, any>;
        breakpointName: string;
        timeoutMs: number;
        startTime: number;
    } | null>>;
    // setMockHistory: Moved to MockProxyContext
    // setMockRunning: Moved to MockProxyContext
    // setMockConfig: Moved to MockProxyContext
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
        setExploredInterfaces,
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
        // setProxyConfig,
        setSelectedProjectName,
        setWsdlUrl,
        setWorkspaceDirty,
        setSavedProjects,
        setChangelog,
        setWatcherHistory,
        // setProxyHistory,
        // setProxyRunning,
        // setTestExecution,
        setActiveView,
        setActiveBreakpoint,
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

    // Silence unused variable warning until migration is complete
    void setSavedProjects;

    const hasPerformedInitialLoad = useRef(false);

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
        debugLog('Setting up message listener');

        const handleMessage = (message: any) => {
            debugLog(`Received: ${message.command}`, { hasData: !!message.data || !!message.result });

            switch (message.command) {
                case BackendCommand.WsdlParsed:
                    const data = message.services;
                    debugLog('wsdlParsed Raw Data', {
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
                                    operations: ops.map((op: any) => ({
                                        id: crypto.randomUUID(),
                                        name: op.name,
                                        action: '',
                                        input: op.input,
                                        targetNamespace: op.targetNamespace || svc.targetNamespace,
                                        originalEndpoint: op.originalEndpoint,
                                        requests: [{
                                            id: crypto.randomUUID(),
                                            name: 'Request 1',
                                            endpoint: op.originalEndpoint,
                                            headers: {
                                                'Content-Type': portName.includes('12') ? 'application/soap+xml' : 'text/xml'
                                            },
                                            request: portName.includes('12')
                                                ? `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tem="${op.targetNamespace || svc.targetNamespace || 'http://tempuri.org/'}">\n   <soap:Header/>\n   <soap:Body>\n      <tem:${op.name}>\n         <!--Optional:-->\n${getInitialXml(op.input)}\n      </tem:${op.name}>\n   </soap:Body>\n</soap:Envelope>`
                                                : `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${op.targetNamespace || svc.targetNamespace || 'http://tempuri.org/'}">\n   <soapenv:Header/>\n   <soapenv:Body>\n      <tem:${op.name}>\n         <!--Optional:-->\n${getInitialXml(op.input)}\n      </tem:${op.name}>\n   </soapenv:Body>\n</soapenv:Envelope>`
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
                    debugLog('wsdlParsed complete', { interfaceCount: uniqueInterfaces.length });
                    setExploredInterfaces(uniqueInterfaces);
                    setExplorerExpanded(true);
                    setActiveView(SidebarView.EXPLORER);
                    break;

                case BackendCommand.Response:
                    debugLog('response', { hasResult: !!message.result, op: message.operation, request: message.requestName });
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

                    const nextResponse = { ...res, rawResponse: displayResponse, duration, lineCount, assertionResults: message.assertionResults, language, createdAt };
                    debugLog('response:setResponse', { duration, lineCount, language, hasRaw: !!displayResponse });
                    setResponse(nextResponse);
                    break;

                case BackendCommand.Error:
                    debugLog('error', { message: message.message });
                    setLoading(false);
                    setResponse({ error: message.message });
                    break;

                case BackendCommand.DownloadComplete:
                    debugLog('downloadComplete', { fileCount: message.files?.length });
                    setDownloadStatus(message.files);
                    setTimeout(() => setDownloadStatus(null), 5000);
                    break;

                case BackendCommand.WsdlSelected:
                    debugLog('wsdlSelected', { path: message.path });
                    setSelectedFile(message.path);
                    break;

                case BackendCommand.SampleSchema:
                    debugLog('sampleSchema', { operationName: message.operationName });
                    setSampleModal({ open: true, schema: message.schema, operationName: message.operationName });
                    break;

                case BackendCommand.AddStepToCase:
                    debugLog('addStepToCase', { caseId: message.caseId });

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
                                    // Created from WSDL Operation - Generate default
                                    const op = message.operation;
                                    newStep = {
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
                    debugLog('projectLoaded', { projectName: message.project?.name });

                    // Detailed inspection of received project
                    if (message.project?.testSuites) {
                        message.project.testSuites.forEach((ts: any) => {
                            ts.testCases?.forEach((tc: any) => {
                                tc.steps?.forEach((step: any) => {
                                    if (step.type === 'script') {
                                        try {
                                            bridge.sendMessage({
                                                command: 'log',
                                                message: `[useMessageHandler] Received Script Step: ${step.name}. Content Length: ${step.config?.scriptContent?.length || 0}`
                                            });
                                        } catch (error) {
                                            console.error('[useMessageHandler] Failed to log script step:', error);
                                        }
                                    }
                                });
                            });
                        });
                    }

                    try {
                        bridge.sendMessage({ command: 'log', message: `[useMessageHandler] ProjectLoaded for: ${message.project?.name}. FileName: ${message.filename}` });
                    } catch (error) {
                        console.error('[useMessageHandler] Failed to log project loaded:', error);
                    }
                    const newProj = message.project;
                    setProjects(prev => {
                        const existingIndex = prev.findIndex(p => (p.id && p.id === newProj.id) || p.name === newProj.name);

                        if (existingIndex !== -1) {
                            const existing = prev[existingIndex];
                            // MERGE logic: Take new project data, but preserve UI state (expanded, dirty?) 
                            // and user-created folders (not yet persisted to disk)
                            const updated = {
                                ...newProj,
                                fileName: message.filename,
                                expanded: existing.expanded,
                                folders: existing.folders || newProj.folders, // Preserve in-memory folders
                                // If we have local changes (dirty=true), should we overwrite? 
                                // "Load Project" usually implies "Reload from Disk", so yes, overwrite.
                                dirty: false
                            };

                            // Ensure ID is stable if missing in newProj (though it should be there)
                            if (!updated.id && existing.id) updated.id = existing.id;

                            const newArr = [...prev];
                            newArr[existingIndex] = updated;
                            return newArr;
                        }
                        return [...prev, { ...newProj, fileName: message.filename, expanded: true }];
                    });
                    setWorkspaceDirty(true);
                    break;

                case BackendCommand.WorkspaceLoaded:
                    debugLog('workspaceLoaded', { projectCount: message.projects?.length });
                    setProjects(message.projects.map((p: any) => ({ ...p, expanded: false })));
                    setWorkspaceDirty(false);
                    break;

                case BackendCommand.EchoResponse:
                    debugLog('echoResponse - Backend connected');
                    setBackendConnected(true);
                    break;

                case BackendCommand.LocalWsdls:
                    debugLog('localWsdls (no-op)');
                    break;

                case BackendCommand.SettingsUpdate:
                    debugLog('settingsUpdate', { hasConfig: !!message.config });
                    setConfig(message.config);
                    setRawConfig(message.raw || JSON.stringify(message.config, null, 2));
                    if (message.config.ui) {
                        if (message.config.ui.layoutMode) setLayoutMode(message.config.ui.layoutMode);
                        if (message.config.ui.showLineNumbers !== undefined) setShowLineNumbers(message.config.ui.showLineNumbers);
                        if (message.config.ui.splitRatio !== undefined) setSplitRatio(message.config.ui.splitRatio);
                        if (message.config.ui.inlineElementValues !== undefined) setInlineElementValues(message.config.ui.inlineElementValues);
                    }

                    // Auto-load projects defined in settings (if not already handled by App restore)
                    // We check hasPerformedInitialLoad to avoid repeated loads on settings updates
                    if (!hasPerformedInitialLoad.current && message.config.openProjects && message.config.openProjects.length > 0) {
                        debugLog('settingsUpdate: Auto-loading projects', { count: message.config.openProjects.length });
                        hasPerformedInitialLoad.current = true;
                        message.config.openProjects.forEach((path: string) => {
                            bridge.sendMessage({ command: FrontendCommand.LoadProject, path });
                        });
                    }
                    else if (projects.length === 0 && message.config.openProjects && message.config.openProjects.length > 0) {
                        // Fallback: If for some reason we have no projects and get an update (e.g. settings change manually),
                        // maybe we should load? But "openProjects" comes from settings, which might not change often.
                        // Let's stick to the initial load or explicit user action.
                        // Actually, keeping the length==0 check as a secondary gate might be okay, but
                        // the initial load flag is the primary fix.
                    }

                    if (message.config.lastConfigPath) {
                        setConfigPath(message.config.lastConfigPath);
                    }
                    // Mock/Proxy config handled in MockProxyContext
                    break;
                    break;

                case BackendCommand.RestoreAutosave:
                    debugLog('restoreAutosave', { hasContent: !!message.content });
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
                                        expanded: p.expanded !== false // Default to true if not set
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
                                            expanded: merged[existingIdx].expanded ?? saved.expanded ?? true
                                        };
                                    } else {
                                        // Add new with expanded true
                                        merged.push({ ...saved, expanded: saved.expanded !== false });
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
                            debugLog('restoreAutosave FAILED', { error: String(e) });
                        }
                    }
                    break;

                case BackendCommand.Changelog:
                    debugLog('changelog received');
                    setChangelog(message.content);
                    break;



                case BackendCommand.WatcherUpdate:
                    debugLog('watcherUpdate', {
                        historyLength: message.history?.length
                    });
                    setWatcherHistory(message.history);
                    break;


                case BackendCommand.ProxyLog:
                case BackendCommand.ProxyStatus:
                case BackendCommand.MockLog:
                case BackendCommand.MockStatus:
                case BackendCommand.MockRulesUpdated:
                case BackendCommand.MockHit:
                case BackendCommand.MockRecorded:
                case BackendCommand.UpdateProxyTarget:
                    break;

                case BackendCommand.BreakpointHit:
                    debugLog('breakpointHit', { breakpointId: message.breakpointId, type: message.type });
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
                    debugLog('breakpointTimeout', { breakpointId: message.breakpointId });
                    setActiveBreakpoint(null);
                    break;

                case BackendCommand.ConfigFileSelected:
                    debugLog('configFileSelected', { path: message.path });
                    setConfigPath(message.path);
                    break;

                case BackendCommand.AdoHasPatResult:
                    debugLog('adoHasPatResult', { hasPat: message.hasPat });
                    // ADO PAT check result - handled by IntegrationsTab
                    break;

                case BackendCommand.AdoProjectsResult:
                    debugLog('adoProjectsResult (no-op)');
                    break;

                case BackendCommand.AdoTestConnectionResult:
                    debugLog('adoTestConnectionResult (no-op)');
                    break;

                case BackendCommand.AdoAddCommentResult:
                    debugLog('adoAddCommentResult (no-op)');
                    break;

                case BackendCommand.ClipboardText:
                    debugLog('clipboardText (no-op)');
                    break;

                case BackendCommand.ConfigSwitched:
                case BackendCommand.ConfigRestored:
                    debugLog(`${message.command} (no-op)`);
                    break;

                case BackendCommand.TestRunnerUpdate:
                    // Handled in TestRunnerContext
                    break;

                // Request History handlers
                case BackendCommand.HistoryLoaded:
                    debugLog('historyLoaded', { count: message.entries?.length || 0 });
                    setRequestHistory(message.entries || []);
                    break;

                case BackendCommand.HistoryUpdate:
                    debugLog('historyUpdate', { entryId: message.entry?.id });
                    if (message.entry) {
                        setRequestHistory(prev => [message.entry, ...prev].slice(0, 100));
                    }
                    break;

                case BackendCommand.AttachmentSelected:
                    debugLog('attachmentSelected', { name: message.attachment?.name });
                    if (message.attachment && onAttachmentSelected) {
                        onAttachmentSelected(message.attachment);
                    }
                    break;
                case BackendCommand.ProjectSaved:
                case BackendCommand.ProjectLoaded:
                    // Handled in ProjectContext
                    break;

                case BackendCommand.WsdlRefreshResult:
                    debugLog('wsdlRefreshResult', { hasDiff: !!message.diff });
                    setWsdlDiff(message.diff);
                    break;

                default:
                    debugLog(`Unknown command: ${message.command}`);
            }
        };

        const cleanup = bridge.onMessage(handleMessage);
        debugLog('Message listener registered');

        return () => {
            debugLog('Cleaning up message listener');
            cleanup();
        };
    }, []); // Empty deps - refs are used to access current values
}
