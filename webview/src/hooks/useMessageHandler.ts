/**
 * useMessageHandler Hook
 * 
 * Extracted from App.tsx to handle all VS Code extension messages.
 * Contains temporary debug logging for troubleshooting.
 */

import { useEffect } from 'react';
import { bridge } from '../utils/bridge';
import {
    SoapUIInterface,
    SoapUIProject,
    SoapUIRequest,
    SoapTestStep,
    SoapTestCase,
    WatcherEvent,
    SidebarView,
    MockEvent,
    MockConfig
} from '../models';

// Debug logger - sends to VS Code output and console
const debugLog = (context: string, data?: any) => {
    const msg = `[useMessageHandler] ${context}`;
    console.log(msg, data || '');
    // Also send to extension for VS Code output window
    bridge.sendMessage({ command: 'log', message: msg, data: JSON.stringify(data || {}) });
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


    // Current values needed for message handling
    wsdlUrl: string;
    projects: SoapUIProject[];
    proxyConfig: any;
    selectedTestCase: SoapTestCase | null;
    selectedRequest: SoapUIRequest | null;
    startTimeRef: React.MutableRefObject<number>;

    // Callbacks
    saveProject: (project: SoapUIProject) => void;
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
        wsdlUrl,
        projects,
        proxyConfig,
        selectedTestCase,
        selectedRequest,
        startTimeRef,
        saveProject
    } = state;

    useEffect(() => {
        debugLog('Setting up message listener');

        const handleMessage = (message: any) => {
            debugLog(`Received: ${message.command}`, { hasData: !!message.data || !!message.result });

            switch (message.command) {
                case 'wsdlParsed':
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
                                name: interfaceName,
                                type: 'wsdl',
                                bindingName: portName,
                                soapVersion: portName.includes('12') ? '1.2' : '1.1',
                                definition: wsdlUrl,
                                operations: ops.map((op: any) => ({
                                    name: op.name,
                                    action: '',
                                    input: op.input,
                                    targetNamespace: op.targetNamespace || svc.targetNamespace,
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

                    const uniqueInterfaces = splitInterfaces.filter((v, i, a) => a.findIndex(t => t.name === v.name) === i);
                    debugLog('wsdlParsed complete', { interfaceCount: uniqueInterfaces.length });
                    setExploredInterfaces(uniqueInterfaces);
                    setExplorerExpanded(true);
                    break;

                case 'response':
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

                case 'error':
                    debugLog('error', { message: message.message });
                    setLoading(false);
                    setResponse({ error: message.message });
                    break;

                case 'downloadComplete':
                    debugLog('downloadComplete', { fileCount: message.files?.length });
                    setDownloadStatus(message.files);
                    setTimeout(() => setDownloadStatus(null), 5000);
                    break;

                case 'wsdlSelected':
                    debugLog('wsdlSelected', { path: message.path });
                    setSelectedFile(message.path);
                    break;

                case 'sampleSchema':
                    debugLog('sampleSchema', { operationName: message.operationName });
                    setSampleModal({ open: true, schema: message.schema, operationName: message.operationName });
                    break;

                case 'addStepToCase':
                    debugLog('addStepToCase', { caseId: message.caseId });
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
                    // Don't change activeView - let user stay on current sidebar tab (Tests)
                    break;

                case 'projectLoaded':
                    debugLog('projectLoaded', { projectName: message.project?.name });
                    const newProj = message.project;
                    setProjects(prev => {
                        const existingIndex = prev.findIndex(p => (p.id && p.id === newProj.id) || p.name === newProj.name);

                        if (existingIndex !== -1) {
                            const existing = prev[existingIndex];
                            const updated = { ...existing, fileName: message.filename };
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
                    debugLog('workspaceLoaded', { projectCount: message.projects?.length });
                    setProjects(message.projects.map((p: any) => ({ ...p, expanded: false })));
                    setWorkspaceDirty(false);
                    break;

                case 'echoResponse':
                    debugLog('echoResponse - Backend connected');
                    setBackendConnected(true);
                    break;

                case 'localWsdls':
                    debugLog('localWsdls (no-op)');
                    break;

                case 'settingsUpdate':
                    debugLog('settingsUpdate', { hasConfig: !!message.config });
                    setConfig(message.config);
                    setRawConfig(message.raw || JSON.stringify(message.config, null, 2));
                    if (message.config.ui) {
                        if (message.config.ui.layoutMode) setLayoutMode(message.config.ui.layoutMode);
                        if (message.config.ui.showLineNumbers !== undefined) setShowLineNumbers(message.config.ui.showLineNumbers);
                        if (message.config.ui.splitRatio !== undefined) setSplitRatio(message.config.ui.splitRatio);
                        if (message.config.ui.inlineElementValues !== undefined) setInlineElementValues(message.config.ui.inlineElementValues);
                    }

                    if (projects.length === 0 && message.config.openProjects && message.config.openProjects.length > 0) {
                        debugLog('settingsUpdate: Auto-loading projects', { count: message.config.openProjects.length });
                        message.config.openProjects.forEach((path: string) => {
                            bridge.sendMessage({ command: 'loadProject', path });
                        });
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

                case 'restoreAutosave':
                    debugLog('restoreAutosave', { hasContent: !!message.content });
                    if (message.content) {
                        try {
                            const savedState = JSON.parse(message.content);
                            setProjects(savedState.projects || []);
                            setExploredInterfaces(savedState.exploredInterfaces || []);
                            setExplorerExpanded(savedState.explorerExpanded ?? true);
                            setWsdlUrl(savedState.wsdlUrl || '');
                            if (savedState.lastSelectedProject) setSelectedProjectName(savedState.lastSelectedProject);
                        } catch (e) {
                            debugLog('restoreAutosave FAILED', { error: String(e) });
                        }
                    }
                    break;

                case 'changelog':
                    debugLog('changelog received');
                    setChangelog(message.content);
                    break;

                case 'projectSaved':
                    debugLog('projectSaved', { projectName: message.projectName });
                    setSavedProjects(prev => {
                        const newSet = new Set(prev);
                        newSet.add(message.projectName);
                        return newSet;
                    });
                    setProjects(prev => prev.map(p => {
                        if (p.name !== message.projectName) return p;
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
                    debugLog('workspaceSaved');
                    setWorkspaceDirty(false);
                    break;

                case 'watcherUpdate':
                    debugLog('watcherUpdate', { historyLength: message.history?.length });
                    setWatcherHistory(message.history);
                    break;

                case 'proxyLog':
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

                case 'proxyStatus':
                    debugLog('proxyStatus', { running: message.running });
                    setProxyRunning(message.running);
                    break;

                case 'mockLog':
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

                case 'mockStatus':
                    debugLog('mockStatus', { running: message.running });
                    setMockRunning(message.running);
                    break;

                case 'mockRulesUpdated':
                    if (message.rules) {
                        setMockConfig(prev => ({ ...prev, rules: message.rules }));
                    }
                    break;

                case 'performanceRunComplete':
                    debugLog('Performance Run Complete', message.run);
                    setActiveRunId(undefined);
                    setPerformanceProgress(null); // Reset progress when run completes
                    // We rely on settings update for history, but could manually update if needed
                    break;

                case 'performanceIterationComplete':
                    debugLog(`Iteration ${message.data.iteration}/${message.data.total}`);
                    setPerformanceProgress({ iteration: message.data.iteration + 1, total: message.data.total });
                    break;


                case 'mockHit':
                    debugLog('mockHit', { ruleId: message.rule?.id });
                    // Visual feedback could be added here
                    break;

                case 'mockRecorded':
                    debugLog('mockRecorded', { name: message.rule?.name });
                    // Maybe a notification system later
                    break;

                case 'breakpointHit':
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

                case 'breakpointTimeout':
                    debugLog('breakpointTimeout', { breakpointId: message.breakpointId });
                    setActiveBreakpoint(null);
                    break;

                case 'configFileSelected':
                    debugLog('configFileSelected', { path: message.path });
                    setConfigPath(message.path);
                    break;

                case 'adoHasPatResult':
                    debugLog('adoHasPatResult', { hasPat: message.hasPat });
                    // ADO PAT check result - handled by IntegrationsTab
                    break;

                case 'adoProjectsResult':
                    debugLog('adoProjectsResult (no-op)');
                    break;

                case 'adoTestConnectionResult':
                    debugLog('adoTestConnectionResult (no-op)');
                    break;

                case 'adoAddCommentResult':
                    debugLog('adoAddCommentResult (no-op)');
                    break;

                case 'clipboardText':
                    debugLog('clipboardText (no-op)');
                    break;

                case 'configSwitched':
                case 'configRestored':
                    debugLog(`${message.command} (no-op)`);
                    break;

                case 'updateProxyTarget':
                    debugLog('updateProxyTarget', { target: message.target });
                    const newConfig = { ...proxyConfig, target: message.target };
                    setProxyConfig(newConfig);
                    bridge.sendMessage({ command: 'updateProxyConfig', config: newConfig });
                    break;

                case 'testRunnerUpdate':
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

                            if (selectedTestCase && selectedTestCase.id === caseId) {
                                if (selectedRequest) {
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
    }, [wsdlUrl, projects, proxyConfig, selectedTestCase, selectedRequest]);
}
