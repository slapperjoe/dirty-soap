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
    ApinoxProject,
    ApiRequest,
    TestStep,
    TestCase,
    SidebarView,
    RequestHistoryEntry,
    RequestAttachment,
    WsdlDiff
} from '@shared/models';

type SidebarProjectState = ApinoxProject & { loading?: boolean };

export interface MessageHandlerState {
    // Setters for state that the handler modifies
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;
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
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    setSavedProjects: React.Dispatch<React.SetStateAction<Set<string>>>;
    setSaveErrors: React.Dispatch<React.SetStateAction<Map<string, string>>>;
    setChangelog: React.Dispatch<React.SetStateAction<string>>;
    setActiveView: React.Dispatch<React.SetStateAction<SidebarView>>;
    setRequestHistory: React.Dispatch<React.SetStateAction<RequestHistoryEntry[]>>;


    // Current values needed for message handling
    projects: ApinoxProject[];
    config: any;
    selectedTestCase: TestCase | null;
    selectedRequest: ApiRequest | null;
    startTimeRef: React.MutableRefObject<number>;
    // H1: the in-flight request id (echoed back by the backend in Response/Error
    // events); lets cancelRequest target exactly the running request.
    requestIdRef?: React.MutableRefObject<string | null>;

    // Callbacks
    saveProject: (project: ApinoxProject) => void;
    onAttachmentSelected?: (attachment: RequestAttachment) => void;
    setWsdlDiff: React.Dispatch<React.SetStateAction<WsdlDiff | null>>;
}

export function useMessageHandler(state: MessageHandlerState) {
    const {
        setProjects,
        setLoading,
        setResponse,
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
        projects,
        config,
        selectedTestCase,
        selectedRequest,
        startTimeRef,
        requestIdRef,
        saveProject,
        onAttachmentSelected,
        setWsdlDiff
    } = state;

    // MockProxyContext removed - proxy/mock features moved to APIprox
    // const { setProxyHistory, setMockHistory, setProxyRunning, setMockRunning } = useMockProxy();

    // Silence unused variable warning until migration is complete
    void setSavedProjects;

    // Use refs for values that change frequently to avoid re-registering message listener
    const projectsRef = useRef(projects);
    const selectedRequestRef = useRef(selectedRequest);
    const selectedTestCaseRef = useRef(selectedTestCase);
    const configRef = useRef(config);

    // Keep refs up to date
    useEffect(() => { projectsRef.current = projects; }, [projects]);
    useEffect(() => { selectedRequestRef.current = selectedRequest; }, [selectedRequest]);
    useEffect(() => { selectedTestCaseRef.current = selectedTestCase; }, [selectedTestCase]);
    useEffect(() => { configRef.current = config; }, [config]);

    useEffect(() => {
        debugLog('[useMessageHandler] Setting up message listener');

        const handleMessage = (message: any) => {
            debugLog(`[useMessageHandler] Received: ${message.command}`, { hasData: !!message.data || !!message.result });

            switch (message.command) {
                case BackendCommand.Response:
                    debugLog('[useMessageHandler] response', { hasResult: !!message.result, op: message.operation, request: message.requestName, requestId: message.requestId || null });
                    // H1: remember this execution's id so cancelRequest can target it.
                    if (requestIdRef && message.requestId) {
                        requestIdRef.current = message.requestId;
                    }
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
                    debugLog('[useMessageHandler] error', { message: message.message, originalCommand: message.originalCommand, requestId: message.requestId || null });
                    // H1: execution errors still identify the in-flight request
                    // (e.g. cancelled / timeout); keep the id for cancel semantics.
                    if (requestIdRef && message.requestId) {
                        requestIdRef.current = message.requestId;
                    }
                    setLoading(false);
                    
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
