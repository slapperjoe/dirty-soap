/**
 * useMessageHandler Hook
 * 
 * Extracted from App.tsx to handle all VS Code extension messages.
 * Contains temporary debug logging for troubleshooting.
 */

import { useEffect, useRef } from 'react';
import { bridge } from '../utils/bridge';
import { BackendCommand, FrontendCommand } from '@shared/messages';
import {
    SoapUIInterface,
    SoapUIProject,
    SoapUIRequest,
    SoapTestStep,
    SoapTestCase,
    WatcherEvent,
    SidebarView,
    MockEvent,
    MockConfig,
    RequestHistoryEntry,
    SoapAttachment
} from '@shared/models';

// Debug logger - sends to VS Code output and console
const debugLog = (context: string, data?: any) => {
    const msg = `[useMessageHandler] ${context}`;
    console.log(msg, data || '');
    // Also send to extension for VS Code output window
    bridge.sendMessage({ command: FrontendCommand.Log, message: msg, data: JSON.stringify(data || {}) });
};

// Helper function to generate initial XML from operation input schema
const getInitialXml = (input: any): string => {
    if (!input) return '';
    // This is a simplified version - the full logic should be imported or passed in
    const generateXml = (node: any, indent: string = ''): string => {
        if (!node) return '';
        if (typeof node === 'string') return `${indent}<!-- ${node} -->`;
        if (Array.isArray(node)) {
            return node.map(n => generateXml(n, indent)).join('\n');
        }
        if (typeof node === 'object') {
            const entries = Object.entries(node);
            return entries.map(([key, value]) => {
                if (typeof value === 'object' && value !== null) {
                    return `${indent}<${key}>\n${generateXml(value, indent + '   ')}\n${indent}</${key}>`;
                }
                return `${indent}<${key}>?</${key}>`;
            }).join('\n');
        }
        return '';
    };
    return generateXml(input, '         ');
};

export interface MessageHandlerState {
    // Setters for state that the handler modifies
    setProjects: React.Dispatch<React.SetStateAction<SoapUIProject[]>>;
    setExploredInterfaces: React.Dispatch<React.SetStateAction<SoapUIInterface[]>>;
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
    setSplitRatio: React.Dispatch<React.SetStateAction<number>>;
    setInlineElementValues: React.Dispatch<React.SetStateAction<boolean>>;
    setConfigPath: React.Dispatch<React.SetStateAction<string | null>>;
    setProxyConfig: React.Dispatch<React.SetStateAction<any>>;
    setSelectedProjectName: React.Dispatch<React.SetStateAction<string | null>>;
    setWsdlUrl: React.Dispatch<React.SetStateAction<string>>;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    setSavedProjects: React.Dispatch<React.SetStateAction<Set<string>>>;
    setChangelog: React.Dispatch<React.SetStateAction<string>>;
    setWatcherHistory: React.Dispatch<React.SetStateAction<WatcherEvent[]>>;
    setProxyHistory: React.Dispatch<React.SetStateAction<WatcherEvent[]>>;
    setProxyRunning: React.Dispatch<React.SetStateAction<boolean>>;
    setTestExecution: React.Dispatch<React.SetStateAction<Record<string, Record<string, any>>>>;
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
    setMockHistory: React.Dispatch<React.SetStateAction<MockEvent[]>>;
    setMockRunning: React.Dispatch<React.SetStateAction<boolean>>;
    setMockConfig: React.Dispatch<React.SetStateAction<MockConfig>>;
    setActiveRunId: React.Dispatch<React.SetStateAction<string | undefined>>;
    setPerformanceProgress: React.Dispatch<React.SetStateAction<{ iteration: number; total: number } | null>>;
    setRequestHistory: React.Dispatch<React.SetStateAction<RequestHistoryEntry[]>>;


    // Current values needed for message handling
    wsdlUrl: string;
    projects: SoapUIProject[];
    proxyConfig: any;
    config: any;
    selectedTestCase: SoapTestCase | null;
    selectedRequest: SoapUIRequest | null;
    startTimeRef: React.MutableRefObject<number>;

    // Callbacks
    saveProject: (project: SoapUIProject) => void;
    onAttachmentSelected?: (attachment: SoapAttachment) => void;
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
        setProxyConfig,
        setSelectedProjectName,
        setWsdlUrl,
        setWorkspaceDirty,
        setSavedProjects,
        setChangelog,
        setWatcherHistory,
        setProxyHistory,
        setProxyRunning,
        setTestExecution,
        setActiveBreakpoint,
        setMockHistory,
        setMockRunning,
        setMockConfig,
        setActiveRunId,
        setPerformanceProgress,
        setRequestHistory,
        wsdlUrl,
        projects,
        proxyConfig,
        config,
        selectedTestCase,
        selectedRequest,
        startTimeRef,
        saveProject,
        onAttachmentSelected
    } = state;

    const hasPerformedInitialLoad = useRef(false);

    // Use refs for values that change frequently to avoid re-registering message listener
    const projectsRef = useRef(projects);
    const selectedRequestRef = useRef(selectedRequest);
    const selectedTestCaseRef = useRef(selectedTestCase);
    const configRef = useRef(config);
    const proxyConfigRef = useRef(proxyConfig);
    const wsdlUrlRef = useRef(wsdlUrl);

    // Keep refs up to date
    useEffect(() => { projectsRef.current = projects; }, [projects]);
    useEffect(() => { selectedRequestRef.current = selectedRequest; }, [selectedRequest]);
    useEffect(() => { selectedTestCaseRef.current = selectedTestCase; }, [selectedTestCase]);
    useEffect(() => { configRef.current = config; }, [config]);
    useEffect(() => { proxyConfigRef.current = proxyConfig; }, [proxyConfig]);
    useEffect(() => { wsdlUrlRef.current = wsdlUrl; }, [wsdlUrl]);

    useEffect(() => {
        debugLog('Setting up message listener');

        const handleMessage = (message: any) => {
            debugLog(`Received: ${message.command}`, { hasData: !!message.data || !!message.result });

            switch (message.command) {
                case BackendCommand.WsdlParsed:
                    debugLog('wsdlParsed', { serviceCount: message.services?.length });
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
                            const interfaceName = portName === 'Default' ? svc.name : portName;

                            splitInterfaces.push({
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

                    const uniqueInterfaces = splitInterfaces.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
                    debugLog('wsdlParsed complete', { interfaceCount: uniqueInterfaces.length });
                    setExploredInterfaces(uniqueInterfaces);
                    setExplorerExpanded(true);
                    break;

                case BackendCommand.Response:
                    debugLog('response', { hasResult: !!message.result });
                    setLoading(false);
                    const endTime = Date.now();
                    const duration = (endTime - startTimeRef.current) / 1000;

                    let lineCount = 0;
                    let displayResponse = '';

                    const res = message.result;
                    if (res) {
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

                    setResponse({ ...res, rawResponse: displayResponse, duration, lineCount, assertionResults: message.assertionResults });
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
                    // const op = message.operation; // Removed unused var, accessed inside loop
                    setProjects(prev => prev.map(p => {
                        if (!p.testSuites) return p;
                        const suite = p.testSuites.find(s => s.testCases?.some(tc => tc.id === message.caseId));
                        if (!suite) return p;

                        const updatedSuite = {
                            ...suite,
                            testCases: suite.testCases?.map(tc => {
                                if (tc.id !== message.caseId) return tc;

                                let newStep: SoapTestStep;

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
                                                assertions: sourceReq.assertions || []
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

                case BackendCommand.AddOperationToPerformance:
                    debugLog('addOperationToPerformance', { suiteId: message.suiteId, operation: message.operation?.name });
                    console.log('[useMessageHandler] ADD_OP_PERF: Received message', JSON.stringify(message));

                    const perfOp = message.operation;
                    const perfReq = message.request; // From new backend command

                    debugLog('addOperationToPerformance', {
                        hasPerfOp: !!perfOp,
                        hasPerfReq: !!perfReq,
                        hasSuiteId: !!message.suiteId,
                        hasConfig: !!configRef.current,
                        hasPerformanceSuites: !!configRef.current?.performanceSuites,
                        suitesCount: configRef.current?.performanceSuites?.length || 0
                    });

                    try {
                        if ((perfOp || perfReq) && message.suiteId && configRef.current?.performanceSuites) {
                            const suiteIndex = configRef.current.performanceSuites.findIndex((s: any) => s.id === message.suiteId);
                            debugLog('addOperationToPerformance', { suiteIndex, lookingForId: message.suiteId });
                            console.log('[useMessageHandler] ADD_OP_PERF: Found suite index', suiteIndex);

                            if (suiteIndex !== -1) {
                                // Diagnostics
                                // Diagnostics
                                console.log('[useMessageHandler] addOperationToPerformance', { suiteId: message.suiteId, existingRequests: configRef.current.performanceSuites[suiteIndex].requests?.length });

                                const suite = { ...configRef.current.performanceSuites[suiteIndex] };
                                let newRequest = message.request;

                                // Ensure unique ID for the new request instance
                                if (newRequest) {
                                    newRequest = {
                                        ...newRequest,
                                        id: `perf-req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                        method: newRequest.method || 'POST',
                                        requestBody: newRequest.requestBody || (newRequest as any).request || '',
                                        interfaceName: newRequest.interfaceName, // From payload
                                        operationName: newRequest.operationName, // From payload
                                        order: (suite.requests?.length || 0) + 1
                                    };
                                } else {
                                    // Fallback construction
                                    const perfOp = message.operation; // Assuming it might be passed if request isn't
                                    if (perfOp) {
                                        newRequest = {
                                            id: `perf-req-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                                            name: perfOp.name,
                                            endpoint: (perfOp as any).originalEndpoint || '',
                                            method: 'POST',
                                            soapAction: perfOp.soapAction,
                                            requestBody: `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="${perfOp.targetNamespace || 'http://tempuri.org/'}">
   <soapenv:Header/>
   <soapenv:Body>
      <tem:${perfOp.name}>
${getInitialXml(perfOp.input)}
      </tem:${perfOp.name}>
   </soapenv:Body>
</soapenv:Envelope>`,
                                            headers: {},
                                            extractors: [],
                                            slaThreshold: 200,
                                            order: (suite.requests?.length || 0) + 1
                                        };
                                    }
                                }

                                if (newRequest) {
                                    // Add to suite
                                    const nextRequests = [...(suite.requests || []), newRequest];
                                    const nextSuite = { ...suite, requests: nextRequests };

                                    // Send FULL suite update to backend (Heavy Hammer approach like Test Suite saveProject)
                                    // Send FULL suite update to backend (Heavy Hammer approach like Test Suite saveProject)
                                    debugLog('addOperationToPerformance', { step: 'Sending UpdatePerformanceSuite', suiteId: nextSuite.id });
                                    bridge.sendMessage({
                                        command: FrontendCommand.UpdatePerformanceSuite,
                                        suiteId: nextSuite.id,
                                        updates: nextSuite
                                    });

                                    // Optimistic Update
                                    setConfig((prevConfig: any) => {
                                        const currentSuites = prevConfig.performanceSuites || [];
                                        const idx = currentSuites.findIndex((s: any) => s.id === message.suiteId);
                                        if (idx !== -1) {
                                            const s = { ...currentSuites[idx] };
                                            s.requests = [...(s.requests || []), newRequest];

                                            const newSuites = [...currentSuites];
                                            newSuites[idx] = s;
                                            return { ...prevConfig, performanceSuites: newSuites };
                                        }
                                        return prevConfig;
                                    });
                                }
                            } else {
                                console.error('[useMessageHandler] Suite not found for addOperationToPerformance');
                            }
                        } else {
                            debugLog('addOperationToPerformance', { error: 'Missing required data' });
                        }
                    } catch (error: any) {
                        console.error('[useMessageHandler] Error in addOperationToPerformance:', error);
                        debugLog('addOperationToPerformance error', { message: error.message, stack: error.stack });
                    }
                    break;

                case BackendCommand.ProjectLoaded:
                    debugLog('projectLoaded', { projectName: message.project?.name });

                    // Detailed inspection of received project
                    if (message.project?.testSuites) {
                        message.project.testSuites.forEach((ts: any) => {
                            ts.testCases?.forEach((tc: any) => {
                                tc.steps?.forEach((step: any) => {
                                    if (step.type === 'script') {
                                        bridge.sendMessage({
                                            command: 'log',
                                            message: `[useMessageHandler] Received Script Step: ${step.name}. Content Length: ${step.config?.scriptContent?.length || 0}`
                                        });
                                    }
                                });
                            });
                        });
                    }

                    bridge.sendMessage({ command: 'log', message: `[useMessageHandler] ProjectLoaded for: ${message.project?.name}. FileName: ${message.filename}` });
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
                    if (message.config.lastProxyTarget) {
                        setProxyConfig((prev: any) => ({ ...prev, target: message.config.lastProxyTarget! }));
                    }
                    // Load mock server config including saved rules
                    if (message.config.mockServer) {
                        setMockConfig(message.config.mockServer);
                    }
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
                            setExplorerExpanded(savedState.explorerExpanded ?? true);
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

                case BackendCommand.ProjectSaved:
                    debugLog('projectSaved', { projectName: message.projectName });
                    setSavedProjects(prev => {
                        const newSet = new Set(prev);
                        newSet.add(message.projectName);
                        return newSet;
                    });
                    setProjects(prev => prev.map(p => {
                        if (p.name !== message.projectName) return p;
                        const clearFoldersDirty = (folders: any[]): any[] => {
                            return folders.map(f => ({
                                ...f,
                                requests: f.requests.map((r: any) => ({ ...r, dirty: false })),
                                folders: f.folders ? clearFoldersDirty(f.folders) : undefined
                            }));
                        };

                        return {
                            ...p,
                            fileName: message.fileName || p.fileName,
                            dirty: false,
                            interfaces: p.interfaces.map(i => ({
                                ...i,
                                operations: i.operations.map(o => ({
                                    ...o,
                                    requests: o.requests.map(r => ({ ...r, dirty: false }))
                                }))
                            })),
                            folders: p.folders ? clearFoldersDirty(p.folders) : undefined
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

                case BackendCommand.WorkspaceSaved:
                    debugLog('workspaceSaved');
                    setWorkspaceDirty(false);
                    break;

                case BackendCommand.WatcherUpdate:
                    debugLog('watcherUpdate', { historyLength: message.history?.length });
                    setWatcherHistory(message.history);
                    break;

                case BackendCommand.ProxyLog:
                    debugLog('proxyLog', { eventId: message.event?.id });
                    setProxyHistory(prev => {
                        const existingIndex = prev.findIndex(e => e.id === message.event.id);
                        if (existingIndex !== -1) {
                            const updated = [...prev];
                            updated[existingIndex] = { ...updated[existingIndex], ...message.event };
                            return updated;
                        }
                        return [message.event, ...prev];
                    });
                    break;

                case BackendCommand.ProxyStatus:
                    debugLog('proxyStatus', { running: message.running });
                    setProxyRunning(message.running);
                    break;

                case BackendCommand.MockLog:
                    debugLog('mockLog', { eventId: message.event?.id });
                    setMockHistory(prev => {
                        const existingIndex = prev.findIndex(e => e.id === message.event.id);
                        if (existingIndex !== -1) {
                            const updated = [...prev];
                            updated[existingIndex] = { ...updated[existingIndex], ...message.event };
                            return updated;
                        }
                        return [message.event, ...prev];
                    });
                    break;

                case BackendCommand.MockStatus:
                    debugLog('mockStatus', { running: message.running });
                    setMockRunning(message.running);
                    break;

                case BackendCommand.MockRulesUpdated:
                    if (message.rules) {
                        setMockConfig(prev => ({ ...prev, rules: message.rules }));
                    }
                    break;

                case BackendCommand.PerformanceRunStarted:
                    debugLog('Performance Run Started', message.data);
                    setActiveRunId(message.data?.runId);
                    setPerformanceProgress({ iteration: 0, total: 0 }); // Initialize progress
                    break;

                case BackendCommand.PerformanceRunComplete:
                    debugLog('Performance Run Complete', message.run);
                    setActiveRunId(undefined);
                    setPerformanceProgress(null); // Reset progress when run completes
                    // Add the run to history immediately for UI display (dedupe by ID)
                    if (message.run) {
                        setConfig((prevConfig: any) => {
                            const existingHistory = prevConfig.performanceHistory || [];
                            // Check if this run already exists in history
                            const alreadyExists = existingHistory.some((r: any) => r.id === message.run.id);
                            if (alreadyExists) {
                                return prevConfig; // Don't add duplicate
                            }
                            return {
                                ...prevConfig,
                                performanceHistory: [message.run, ...existingHistory].slice(0, 25)
                            };
                        });
                    }
                    break;

                case BackendCommand.PerformanceIterationComplete:
                    debugLog(`Iteration ${message.data.iteration}/${message.data.total}`);
                    setPerformanceProgress({ iteration: message.data.iteration + 1, total: message.data.total });
                    break;


                case BackendCommand.MockHit:
                    debugLog('mockHit', { ruleId: message.rule?.id });
                    // Visual feedback could be added here
                    break;

                case BackendCommand.MockRecorded:
                    debugLog('mockRecorded', { name: message.rule?.name });
                    // Maybe a notification system later
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

                case BackendCommand.UpdateProxyTarget:
                    debugLog('updateProxyTarget', { target: message.target });
                    const newConfig = { ...proxyConfigRef.current, target: message.target };
                    setProxyConfig(newConfig);
                    bridge.sendMessage({ command: FrontendCommand.UpdateProxyConfig, config: newConfig });
                    break;

                case BackendCommand.TestRunnerUpdate:
                    debugLog('testRunnerUpdate', { type: message.data?.type, caseId: message.data?.caseId });
                    setTestExecution(prev => {
                        const { type, caseId, stepId, error } = message.data;
                        const newState = { ...prev };
                        if (!newState[caseId]) newState[caseId] = {};

                        if (type === 'testCaseStart') {
                            newState[caseId] = {};
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

                            if (selectedTestCaseRef.current && selectedTestCaseRef.current.id === caseId) {
                                if (selectedRequestRef.current) {
                                    const step = selectedTestCaseRef.current.steps.find(s => s.id === stepId);
                                    if (step && step.config.request && (step.config.request.id === selectedRequestRef.current.id)) {
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
