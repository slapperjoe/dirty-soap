import React, { useState, useEffect, useCallback } from 'react';
import { Container, ContextMenu, ContextMenuItem } from './styles/App.styles';
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
import { CreateReplaceRuleModal } from './components/modals/CreateReplaceRuleModal';
import { AddToDevOpsModal } from './components/modals/AddToDevOpsModal';
import { AddToProjectModal } from './components/modals/AddToProjectModal';
import { SoapUIRequest, SoapTestCase, SoapTestStep, SidebarView, ReplaceRule, PerformanceSuite, PerformanceRequest } from './models';
import { useMessageHandler } from './hooks/useMessageHandler';
import { useProject } from './contexts/ProjectContext';
import { useSelection } from './contexts/SelectionContext';
import { useUI } from './contexts/UIContext';
import { useExplorer } from './hooks/useExplorer';
import { useContextMenu } from './hooks/useContextMenu';
import { useTestCaseHandlers } from './hooks/useTestCaseHandlers';
import { useRequestExecution } from './hooks/useRequestExecution';
import { useWatcherProxy } from './hooks/useWatcherProxy';
import { useSidebarCallbacks } from './hooks/useSidebarCallbacks';
import { useWorkspaceCallbacks } from './hooks/useWorkspaceCallbacks';

// NOTE: DirtySoapConfigWeb interface removed - config type comes from models.ts

interface ConfirmationState {
    title: string;
    message: string;
    onConfirm: () => void;
}

// NOTE: Container, ContextMenu, ContextMenuItem moved to styles/App.styles.ts


function App() {
    // ==========================================================================
    // CONTEXT - Project state from ProjectContext
    // ==========================================================================
    const {
        projects,
        setProjects,
        selectedProjectName,
        setSelectedProjectName,
        workspaceDirty,
        setWorkspaceDirty,
        savedProjects,
        setSavedProjects,
        deleteConfirm,
        setDeleteConfirm,
        addProject,
        closeProject,
        loadProject,
        saveProject,
        toggleProjectExpand,
        toggleInterfaceExpand,
        toggleOperationExpand
    } = useProject();

    // ==========================================================================
    // CONTEXT - Selection state from SelectionContext
    // ==========================================================================
    const {
        selectedInterface,
        setSelectedInterface,
        selectedOperation,
        setSelectedOperation,
        selectedRequest,
        setSelectedRequest,
        selectedStep,
        setSelectedStep,
        selectedTestCase,
        setSelectedTestCase,
        response,
        setResponse,
        loading,
        setLoading,
        selectedPerformanceSuiteId,
        setSelectedPerformanceSuiteId
    } = useSelection();



    // ==========================================================================
    // EXPLORER - from useExplorer hook
    // ==========================================================================
    const {
        exploredInterfaces,
        setExploredInterfaces,
        explorerExpanded,
        setExplorerExpanded,
        pendingAddInterface,
        setPendingAddInterface,
        addToProject,
        addInterfaceToNamedProject,
        addAllToProject,
        clearExplorer,
        removeFromExplorer,
        toggleExplorerExpand,
        toggleExploredInterface,
        toggleExploredOperation
    } = useExplorer({ projects, setProjects, setWorkspaceDirty });

    // ==========================================================================
    // LOCAL STATE - Remaining state that stays in App
    // ==========================================================================
    const [testExecution, setTestExecution] = useState<Record<string, Record<string, {
        status: 'running' | 'pass' | 'fail',
        error?: string,
        assertionResults?: any[],
        response?: any
    }>>>({});

    // NOTE: handleSelectTestSuite, handleSelectTestCase now come from useTestCaseHandlers hook

    // Backend Connection
    const [backendConnected, setBackendConnected] = useState(false);

    // ==========================================================================
    // CONTEXT - UI state from UIContext
    // ==========================================================================
    const {
        activeView,
        setActiveView,
        layoutMode,
        setLayoutMode,
        showLineNumbers,
        setShowLineNumbers,
        inlineElementValues,
        setInlineElementValues,
        hideCausalityData,
        setHideCausalityData,
        splitRatio,
        setSplitRatio,
        isResizing,
        setIsResizing,
        showSettings,
        setShowSettings,
        initialSettingsTab,
        setInitialSettingsTab,
        openSettings,
        showHelp,
        setShowHelp,
        showDevOpsModal,
        setShowDevOpsModal,
        config,
        setConfig,
        rawConfig,
        setRawConfig,
        configPath,
        setConfigPath
    } = useUI();

    // UI State (remaining)
    const [inputType, setInputType] = useState<'url' | 'file'>('url');
    const [wsdlUrl, setWsdlUrl] = useState('');

    // Derived State (must be after config is defined)
    const selectedPerformanceSuite = config?.performanceSuites?.find(s => s.id === selectedPerformanceSuiteId) || null;
    const [wsdlUrlHistory, setWsdlUrlHistory] = useState<string[]>([]);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [downloadStatus, setDownloadStatus] = useState<string[] | null>(null);
    const [wsdlUseProxy, setWsdlUseProxy] = useState<boolean>(false);

    // Breakpoint State
    const [activeBreakpoint, setActiveBreakpoint] = useState<{
        id: string;
        type: 'request' | 'response';
        content: string;
        headers?: Record<string, any>;
        breakpointName: string;
        timeoutMs: number;
        startTime: number;
    } | null>(null);

    // Performance Run State
    const [activeRunId, setActiveRunId] = useState<string | undefined>(undefined);
    const [performanceProgress, setPerformanceProgress] = useState<{ iteration: number; total: number } | null>(null);

    // Coordinator State for Distributed Workers
    const [coordinatorStatus, setCoordinatorStatus] = useState<{
        running: boolean;
        port: number;
        workers: any[];
        expectedWorkers: number;
    }>({ running: false, port: 8765, workers: [], expectedWorkers: 1 });
    console.log(coordinatorStatus);

    // NOTE: Watcher/Proxy state now comes from useWatcherProxy hook

    // NOTE: startTimeRef now comes from useRequestExecution hook

    // ==========================================================================
    // CONTEXT MENU - from useContextMenu hook
    // ==========================================================================
    const {
        contextMenu,
        renameState,
        setRenameState,
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
    } = useContextMenu({
        setProjects,
        saveProject,
        setWorkspaceDirty,
        selectedInterface,
        selectedOperation,
        setSelectedInterface,
        setSelectedOperation,
        setSelectedRequest,
        setResponse
    });

    // ==========================================================================
    // TEST CASE HANDLERS - from useTestCaseHandlers hook
    // ==========================================================================
    const {
        handleSelectTestSuite,
        handleSelectTestCase,
        handleAddAssertion,
        handleAddExistenceAssertion,
        handleGenerateTestSuite,
        handleRunTestCaseWrapper,
        handleRunTestSuiteWrapper,
        handleSaveExtractor
    } = useTestCaseHandlers({
        projects,
        setProjects,
        saveProject,
        selectedTestCase,
        selectedStep,
        setSelectedTestCase,
        setSelectedStep,
        setSelectedRequest,
        setSelectedOperation,
        setSelectedInterface,
        setSelectedPerformanceSuiteId,
        setResponse,
        setActiveView,
        closeContextMenu
    });

    // ==========================================================================
    // REQUEST EXECUTION - from useRequestExecution hook
    // ==========================================================================
    const {
        executeRequest,
        cancelRequest,
        handleRequestUpdate,
        handleResetRequest,
        startTimeRef
    } = useRequestExecution({
        selectedOperation,
        selectedRequest,
        selectedInterface,
        selectedTestCase,
        selectedStep,
        selectedProjectName,
        wsdlUrl,
        setLoading,
        setResponse,
        setSelectedRequest,
        setProjects,
        setWorkspaceDirty,
        testExecution
    });

    // ==========================================================================
    // WATCHER/PROXY/MOCK - from useWatcherProxy hook
    // ==========================================================================
    const {
        watcherHistory,
        setWatcherHistory,
        watcherRunning,
        setWatcherRunning,
        proxyHistory,
        setProxyHistory,
        proxyRunning: _proxyRunning,
        setProxyRunning,
        proxyConfig,
        setProxyConfig,
        handleSelectWatcherEvent,
        // Mock state
        mockHistory,
        setMockHistory, // Will be used in message handler
        mockRunning: _mockRunning,
        setMockRunning, // Will be used in message handler
        mockConfig,
        setMockConfig,
        handleSelectMockEvent,
        handleClearMockHistory,
        // Unified Server Mode
        serverMode,
        setServerMode
    } = useWatcherProxy({
        activeView,
        inlineElementValues,
        hideCausalityData,
        setSelectedInterface,
        setSelectedOperation,
        setSelectedRequest,
        setSelectedTestCase,
        setResponse
    });

    // ==========================================================================
    // SIDEBAR CALLBACKS - from useSidebarCallbacks hook
    // ==========================================================================
    const {
        handleAddSuite,
        handleDeleteSuite,
        handleToggleSuiteExpand,
        handleToggleCaseExpand,
        handleAddTestCase,
        handleDeleteTestCase,
        handleRenameTestCase,
        handleStartWatcher,
        handleStopWatcher,
        handleClearWatcher,
        handleStartProxy: _handleStartProxy,
        handleStopProxy: _handleStopProxy,
        handleUpdateProxyConfig: _handleUpdateProxyConfig,
        handleClearProxy,
        handleInjectProxy: _handleInjectProxy,
        handleRestoreProxy: _handleRestoreProxy,
        handleSaveUiState
    } = useSidebarCallbacks({
        projects,
        setProjects,
        deleteConfirm,
        setDeleteConfirm,
        saveProject,
        setWatcherRunning,
        setWatcherHistory,
        setProxyRunning,
        setProxyHistory,
        proxyConfig,
        setProxyConfig,
        configPath,
        config
    });

    // Performance Handlers
    const handleAddPerformanceSuite = (name: string) => {
        // Generate ID locally so we can auto-select it
        const newId = `perf-suite-${Date.now()}`;
        bridge.sendMessage({ command: 'addPerformanceSuite', name, id: newId });
        // Auto-select the new suite
        setSelectedPerformanceSuiteId(newId);
        // Clear other selections so the new suite shows in workspace
        setSelectedInterface(null);
        setSelectedOperation(null);
        setSelectedRequest(null);
        setSelectedTestCase(null);
        setSelectedStep(null);
    };
    const handleDeletePerformanceSuite = (id: string) => bridge.sendMessage({ command: 'deletePerformanceSuite', suiteId: id });
    const handleRunPerformanceSuite = (id: string) => { setActiveRunId(id); bridge.sendMessage({ command: 'runPerformanceSuite', suiteId: id }); };
    const handleStopPerformanceRun = () => { bridge.sendMessage({ command: 'abortPerformanceSuite' }); }; // Backend sends runCompleted event
    const handleSelectPerformanceSuite = (id: string) => {
        // Skip if already selected (no redraw needed)
        if (selectedPerformanceSuiteId === id) return;

        const suite = config?.performanceSuites?.find(s => s.id === id);
        if (suite) {
            // Clear other selections but set suite ID atomically (no setTimeout flash)
            setSelectedInterface(null);
            setSelectedOperation(null);
            setSelectedRequest(null);
            setSelectedTestCase(null);
            setSelectedStep(null);
            setSelectedPerformanceSuiteId(suite.id);
        }
    };
    const handleUpdatePerformanceSuite = (suite: PerformanceSuite) => bridge.sendMessage({ command: 'updatePerformanceSuite', suiteId: suite.id, updates: suite });

    const handleAddPerformanceRequest = (suiteId: string) => {
        bridge.sendMessage({ command: 'pickOperationForPerformance', suiteId });
    };

    const handleDeletePerformanceRequest = (suiteId: string, requestId: string) => {
        bridge.sendMessage({ command: 'deletePerformanceRequest', suiteId, requestId });
    };

    const handleUpdatePerformanceRequest = (suiteId: string, requestId: string, updates: Partial<PerformanceRequest>) => {
        bridge.sendMessage({ command: 'updatePerformanceRequest', suiteId, requestId, updates });
    };

    const handleSelectPerformanceRequest = (request: PerformanceRequest) => {
        console.log('[App] Selecting performance request', request.id);
        // We select it as a normal request to use the standard editor
        const soapRequest: SoapUIRequest = {
            id: request.id,
            name: request.name,
            endpoint: request.endpoint,
            method: request.method,
            request: request.requestBody, // Map requestBody to request for visibility
            headers: request.headers,
            extractors: request.extractors,
            // assertions: ... we might need to map SLA to assertions if we want visual editing, or just keep SLA separate
        };
        setSelectedRequest(soapRequest);
        // We set selectedStep to null to ensure we don't confuse the layout
        setSelectedStep(null);
    };

    // Coordinator handlers for distributed workers
    const handleStartCoordinator = (port: number, expectedWorkers: number) => {
        bridge.sendMessage({ command: 'startCoordinator', port, expectedWorkers });
    };

    const handleStopCoordinator = () => {
        bridge.sendMessage({ command: 'stopCoordinator' });
    };
    console.log(handleStartCoordinator);
    console.log(handleStopCoordinator);

    // Listen for coordinator status updates
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            if (message.command === 'coordinatorStatus') {
                setCoordinatorStatus(message.status);
            }
        };
        window.addEventListener('message', handleMessage);
        // Request initial status
        bridge.sendMessage({ command: 'getCoordinatorStatus' });
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    // Auto-select first performance suite when none is selected but suites exist
    useEffect(() => {
        const suites = config?.performanceSuites || [];
        if (suites.length > 0 && !selectedPerformanceSuiteId) {
            setSelectedPerformanceSuiteId(suites[0].id);
        }
    }, [config?.performanceSuites, selectedPerformanceSuiteId, setSelectedPerformanceSuiteId]);

    // Auto-select first test case when none is selected but test cases exist
    useEffect(() => {
        // Flatten all test cases from all projects/suites
        const allCases = projects.flatMap(p =>
            (p.testSuites || []).flatMap(s => s.testCases || [])
        );
        if (allCases.length > 0 && !selectedTestCase) {
            setSelectedTestCase(allCases[0]);
        }
    }, [projects, selectedTestCase, setSelectedTestCase]);

    const sidebarPerformanceProps = {
        suites: config?.performanceSuites || [],
        onAddSuite: handleAddPerformanceSuite,
        onDeleteSuite: handleDeletePerformanceSuite,
        onRunSuite: handleRunPerformanceSuite,
        onSelectSuite: handleSelectPerformanceSuite,
        onStopRun: handleStopPerformanceRun,
        isRunning: !!activeRunId,
        activeRunId,
        selectedSuiteId: selectedPerformanceSuite?.id,
        deleteConfirm,
        setDeleteConfirm
    };

    // Extractor Modal State (needed before useWorkspaceCallbacks)
    const [extractorModal, setExtractorModal] = React.useState<{ xpath: string, value: string, source: 'body' | 'header', variableName: string } | null>(null);

    // ==========================================================================
    // WORKSPACE CALLBACKS - from useWorkspaceCallbacks hook
    // ==========================================================================
    const {
        handleSelectStep,
        handleDeleteStep,
        handleMoveStep,
        handleAddStep,
        handleToggleLayout,
        handleToggleLineNumbers,
        handleToggleInlineElementValues,
        handleToggleHideCausalityData,
        handleAddExtractor,
        handleEditExtractor
    } = useWorkspaceCallbacks({
        selectedTestCase,
        selectedStep,
        projects,
        testExecution,
        setSelectedStep,
        setSelectedRequest,
        setResponse,
        setProjects,
        saveProject,
        layoutMode,
        setLayoutMode,
        showLineNumbers,
        setShowLineNumbers,
        inlineElementValues,
        setInlineElementValues,
        hideCausalityData,
        setHideCausalityData,
        setProxyHistory,
        setWatcherHistory,
        config,
        setExtractorModal
    });

    // Modals (remaining)
    const [confirmationModal, setConfirmationModal] = useState<ConfirmationState | null>(null);
    const [addToTestCaseModal, setAddToTestCaseModal] = React.useState<{ open: boolean, request: SoapUIRequest | null }>({ open: false, request: null });
    const [sampleModal, setSampleModal] = React.useState<{ open: boolean, schema: any | null, operationName: string }>({ open: false, schema: null, operationName: '' });
    // NOTE: extractorModal moved above useWorkspaceCallbacks
    const [replaceRuleModal, setReplaceRuleModal] = React.useState<{ open: boolean, xpath: string, matchText: string, target: 'request' | 'response' }>({ open: false, xpath: '', matchText: '', target: 'response' });
    const [importToPerformanceModal, setImportToPerformanceModal] = React.useState<{ open: boolean, suiteId: string | null }>({ open: false, suiteId: null });

    // Workspace State
    const [changelog, setChangelog] = useState<string>('');

    // NOTE: saveProject now comes from ProjectContext

    // Message Handler Hook
    useMessageHandler({
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
        setActiveView,
        setActiveBreakpoint,
        setMockHistory,
        setMockRunning,
        setMockConfig,
        setActiveRunId,
        setPerformanceProgress,
        wsdlUrl,
        projects,
        proxyConfig,
        config,
        selectedTestCase,
        selectedRequest,
        startTimeRef,
        saveProject
    });

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

    // Ctrl+S keyboard shortcut to save all dirty projects
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                // Save all dirty projects
                projects.forEach(p => {
                    if (p.dirty) {
                        saveProject(p);
                    }
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [projects, saveProject]);

    // Warn about unsaved changes on close
    useEffect(() => {
        const hasDirtyProjects = projects.some(p => p.dirty);
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasDirtyProjects) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [projects]);

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

    // (Message handling moved to useMessageHandler hook)

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
            bridge.sendMessage({ command: 'loadWsdl', url: wsdlUrl, isLocal: false, useProxy: wsdlUseProxy });
            // Add to history if not already present
            if (!wsdlUrlHistory.includes(wsdlUrl)) {
                setWsdlUrlHistory(prev => [wsdlUrl, ...prev].slice(0, 10)); // Keep last 10
            }
        } else if (inputType === 'file' && selectedFile) {
            bridge.sendMessage({ command: 'loadWsdl', url: selectedFile, isLocal: true, useProxy: false });
        }
    };

    const pickLocalWsdl = () => {
        bridge.sendMessage({ command: 'selectLocalWsdl' });
    };

    // NOTE: executeRequest, cancelRequest, handleRequestUpdate, handleResetRequest
    // now come from useRequestExecution hook

    // NOTE: handleAddAssertion, handleAddExistenceAssertion, handleGenerateTestSuite,
    // handleRunTestCaseWrapper, handleRunTestSuiteWrapper, handleSaveExtractor
    // now come from useTestCaseHandlers hook

    // NOTE: addToProject, addAllToProject, clearExplorer, removeFromExplorer,
    // toggleExplorerExpand, toggleExploredInterface, toggleExploredOperation
    // are now in useExplorer hook

    // NOTE: closeProject, loadProject, addProject now come from ProjectContext
    // Handle selection reset when closing a project (context handles the deletion)
    const handleCloseProject = (name: string) => {
        // If we're closing the selected project, clear selection
        if (deleteConfirm === name && selectedProjectName === name) {
            setSelectedInterface(null);
            setSelectedOperation(null);
            setSelectedRequest(null);
        }
        // Delegate to context
        closeProject(name);
    };

    // NOTE: toggleProjectExpand, toggleInterfaceExpand, toggleOperationExpand now come from ProjectContext

    // NOTE: handleContextMenu, closeContextMenu, handleRename, handleDeleteRequest,
    // handleCloneRequest, handleAddRequest, handleDeleteInterface, handleDeleteOperation,
    // handleViewSample are now in useContextMenu hook

    // NOTE: handleGenerateTestSuite now comes from useTestCaseHandlers hook

    // NOTE: handleSelectWatcherEvent now comes from useWatcherProxy hook

    // NOTE: handleRunTestCaseWrapper, handleRunTestSuiteWrapper, handleSaveExtractor
    // now come from useTestCaseHandlers hook

    // Breakpoint Resolution Handler
    const handleResolveBreakpoint = (modifiedContent: string, cancelled: boolean = false) => {
        if (activeBreakpoint) {
            bridge.sendMessage({
                command: 'resolveBreakpoint',
                breakpointId: activeBreakpoint.id,
                content: modifiedContent,
                cancelled
            });
            setActiveBreakpoint(null);
        }
    };

    return (
        <Container onClick={closeContextMenu}>
            {/* Sidebar with consolidated props */}
            <Sidebar
                projectProps={{
                    projects,
                    savedProjects,
                    loadProject: () => loadProject(),
                    saveProject,
                    closeProject: handleCloseProject,
                    onAddProject: addProject,
                    toggleProjectExpand,
                    toggleInterfaceExpand,
                    toggleOperationExpand,
                    onDeleteInterface: handleDeleteInterface,
                    onDeleteOperation: handleDeleteOperation
                }}
                explorerProps={{
                    exploredInterfaces,
                    explorerExpanded,
                    toggleExplorerExpand,
                    addToProject,
                    addAllToProject,
                    clearExplorer,
                    removeFromExplorer,
                    toggleExploredInterface,
                    toggleExploredOperation
                }}
                wsdlProps={{
                    inputType,
                    setInputType,
                    wsdlUrl,
                    setWsdlUrl,
                    wsdlUrlHistory,
                    selectedFile,
                    loadWsdl,
                    pickLocalWsdl,
                    downloadStatus,
                    useProxy: wsdlUseProxy,
                    setUseProxy: setWsdlUseProxy
                }}
                selectionProps={{
                    selectedProjectName,
                    setSelectedProjectName,
                    selectedInterface,
                    setSelectedInterface,
                    selectedOperation,
                    setSelectedOperation,
                    selectedRequest,
                    setSelectedRequest: (req) => {
                        setSelectedRequest(req);
                        setSelectedTestCase(null);
                    },
                    setResponse,
                    handleContextMenu,
                    onAddRequest: handleAddRequest,
                    onDeleteRequest: handleDeleteRequest,
                    deleteConfirm,
                    setDeleteConfirm
                }}
                testRunnerProps={{
                    onAddSuite: handleAddSuite,
                    onDeleteSuite: handleDeleteSuite,
                    onRunSuite: handleRunTestSuiteWrapper,
                    onAddTestCase: handleAddTestCase,
                    onRunCase: handleRunTestCaseWrapper,
                    onDeleteTestCase: handleDeleteTestCase,
                    onRenameTestCase: handleRenameTestCase,
                    onSelectSuite: handleSelectTestSuite,
                    onSelectTestCase: handleSelectTestCase,
                    onToggleSuiteExpand: handleToggleSuiteExpand,
                    onToggleCaseExpand: handleToggleCaseExpand
                }}
                watcherProps={{
                    history: watcherHistory,
                    onSelectEvent: handleSelectWatcherEvent,
                    isRunning: watcherRunning,
                    onStart: handleStartWatcher,
                    onStop: handleStopWatcher,
                    onClear: handleClearWatcher
                }}
                testsProps={{
                    projects,
                    onAddSuite: handleAddSuite,
                    onDeleteSuite: handleDeleteSuite,
                    onRunSuite: handleRunTestSuiteWrapper,
                    onAddTestCase: handleAddTestCase,
                    onDeleteTestCase: handleDeleteTestCase,
                    onRenameTestCase: handleRenameTestCase,
                    onRunCase: handleRunTestCaseWrapper,
                    onSelectSuite: handleSelectTestSuite,
                    onSelectTestCase: handleSelectTestCase,
                    onToggleSuiteExpand: handleToggleSuiteExpand,
                    onToggleCaseExpand: handleToggleCaseExpand,
                    deleteConfirm
                }}
                performanceProps={sidebarPerformanceProps}
                serverProps={{
                    serverConfig: {
                        mode: serverMode,  // Use dedicated state instead of deriving from running
                        port: proxyConfig.port || 9000,
                        targetUrl: proxyConfig.target || '',
                        mockRules: mockConfig.rules || [],
                        passthroughEnabled: mockConfig.passthroughEnabled ?? true
                    },
                    isRunning: _proxyRunning,
                    onModeChange: (mode) => {
                        // Update UI state immediately
                        setServerMode(mode);

                        // Send unified command to backend
                        bridge.sendMessage({ command: 'setServerMode', mode });
                    },
                    onStart: () => {
                        bridge.sendMessage({ command: 'startProxy' });
                    },
                    onStop: () => {
                        bridge.sendMessage({ command: 'stopProxy' });
                    },
                    onOpenSettings: () => openSettings('server'),
                    proxyHistory,
                    mockHistory,
                    onSelectProxyEvent: handleSelectWatcherEvent,
                    onSelectMockEvent: handleSelectMockEvent,
                    selectedEventId: selectedRequest?.id,
                    onClearHistory: () => {
                        handleClearProxy();
                        handleClearMockHistory();
                    },
                    // Mock Rules
                    mockRules: mockConfig.rules || [],
                    onAddMockRule: (rule) => bridge.sendMessage({ command: 'addMockRule', rule }),
                    onDeleteMockRule: (id) => bridge.sendMessage({ command: 'deleteMockRule', ruleId: id }),
                    onToggleMockRule: (id, enabled) => bridge.sendMessage({ command: 'toggleMockRule', ruleId: id, enabled }),
                    // Breakpoints
                    breakpoints: config?.breakpoints || [],
                    onUpdateBreakpoints: (bps) => {
                        if (config) {
                            const updatedConfig = { ...config, breakpoints: bps };
                            setConfig(updatedConfig);
                            bridge.sendMessage({ command: 'saveSettings', config: updatedConfig });
                        }
                    },
                    // Certificate
                    onOpenCertificate: () => bridge.sendMessage({ command: 'openCertificate' })
                }}
                activeView={activeView}
                onChangeView={setActiveView}
                backendConnected={backendConnected}
                workspaceDirty={workspaceDirty}
                showBackendStatus={!isVsCode()}
                onOpenSettings={() => setShowSettings(true)}
                onOpenHelp={() => setShowHelp(true)}
                onSaveUiState={handleSaveUiState}
                activeEnvironment={config?.activeEnvironment}
                environments={config?.environments}
                onChangeEnvironment={(env) => bridge.sendMessage({ command: 'setActiveEnvironment', env })}
            />

            {/* WorkspaceLayout with consolidated props */}
            <WorkspaceLayout
                selectionState={{
                    request: selectedRequest,
                    operation: selectedOperation,
                    testCase: selectedTestCase,
                    testStep: selectedStep,
                    performanceSuite: selectedPerformanceSuite
                }}
                requestActions={{
                    onExecute: executeRequest,
                    onCancel: cancelRequest,
                    onUpdate: (updated) => {
                        if (selectedPerformanceSuite) {
                            // Map back to PerformanceRequest for saving
                            bridge.sendMessage({
                                command: 'updatePerformanceRequest',
                                suiteId: selectedPerformanceSuite.id,
                                requestId: updated.id,
                                updates: {
                                    requestBody: updated.request, // Map request back to requestBody
                                    headers: updated.headers,
                                    endpoint: updated.endpoint,
                                    method: updated.method,
                                    name: updated.name
                                }
                            });
                            // Update local selection state to reflect changes immediately
                            setSelectedRequest(updated);
                        } else {
                            handleRequestUpdate(updated);
                        }
                    },
                    onReset: handleResetRequest,
                    response,
                    loading
                }}
                viewState={{
                    layoutMode,
                    showLineNumbers,
                    splitRatio,
                    isResizing,
                    onToggleLayout: handleToggleLayout,
                    onToggleLineNumbers: handleToggleLineNumbers,
                    onStartResizing: startResizing,
                    inlineElementValues,
                    onToggleInlineElementValues: handleToggleInlineElementValues,
                    hideCausalityData,
                    onToggleHideCausalityData: handleToggleHideCausalityData
                }}
                configState={{ config, defaultEndpoint: '', changelog, onChangeEnvironment: (env) => bridge.sendMessage({ command: 'setActiveEnvironment', env }), isReadOnly: false, backendConnected }}
                stepActions={{
                    onRunTestCase: handleRunTestCaseWrapper,
                    onOpenStepRequest: (req) => { setSelectedRequest(req); setActiveView(SidebarView.EXPLORER); console.warn('Legacy onOpenStepRequest called'); },
                    onBackToCase: () => { setSelectedStep(null); setSelectedRequest(null); },
                    onAddStep: handleAddStep,
                    testExecution,
                    onUpdateStep: (step) => bridge.sendMessage({ command: 'updateTestStep', step }),
                    onSelectStep: handleSelectStep,
                    onDeleteStep: handleDeleteStep,
                    onMoveStep: handleMoveStep
                }}
                toolsActions={{
                    onAddExtractor: handleAddExtractor,
                    onEditExtractor: handleEditExtractor,
                    onAddAssertion: handleAddAssertion,
                    onAddExistenceAssertion: handleAddExistenceAssertion,
                    onAddReplaceRule: (data) => setReplaceRuleModal({ open: true, ...data }),
                    onAddMockRule: (rule) => bridge.sendMessage({ command: 'addMockRule', rule }),
                    onOpenDevOps: () => setShowDevOpsModal(true)
                }}
                onUpdateSuite={handleUpdatePerformanceSuite}
                onAddPerformanceRequest={handleAddPerformanceRequest}
                onDeletePerformanceRequest={handleDeletePerformanceRequest}
                onSelectPerformanceRequest={handleSelectPerformanceRequest}
                onUpdatePerformanceRequest={handleUpdatePerformanceRequest}
                onImportFromWorkspace={(suiteId) => setImportToPerformanceModal({ open: true, suiteId })}
                onRunSuite={handleRunPerformanceSuite}
                onStopRun={handleStopPerformanceRun}
                performanceProgress={performanceProgress}
                performanceHistory={config?.performanceHistory || []}
                onBackToSuite={() => setSelectedRequest(null)}


                breakpointState={{
                    activeBreakpoint,
                    onResolve: handleResolveBreakpoint
                }}

                coordinatorStatus={coordinatorStatus}
                onStartCoordinator={handleStartCoordinator}
                onStopCoordinator={handleStopCoordinator}
            />

            {
                showDevOpsModal && config?.azureDevOps?.orgUrl && config?.azureDevOps?.project && selectedRequest && (
                    <AddToDevOpsModal
                        orgUrl={config.azureDevOps.orgUrl}
                        project={config.azureDevOps.project}
                        requestContent={selectedRequest.request || ''}
                        responseContent={response?.body}
                        requestName={selectedRequest.name}
                        onClose={() => setShowDevOpsModal(false)}
                    />
                )
            }

            {
                showSettings && (
                    <SettingsEditorModal
                        rawConfig={rawConfig}
                        onClose={() => {
                            setShowSettings(false);
                            setInitialSettingsTab(null);
                        }}
                        onSave={(content, config) => {
                            bridge.sendMessage({ command: 'saveSettings', raw: !config, content, config });
                            setShowSettings(false);
                            setInitialSettingsTab(null);
                        }}
                        initialTab={initialSettingsTab}
                    />
                )
            }
            {
                showHelp && (
                    <HelpModal
                        onClose={() => setShowHelp(false)}
                    />
                )
            }
            {
                contextMenu && (
                    <ContextMenu top={contextMenu.y} left={contextMenu.x}>
                        {(contextMenu.type === 'request' || contextMenu.type === 'project') && (
                            <ContextMenuItem onClick={handleRename}>Rename</ContextMenuItem>
                        )}
                        {contextMenu.type === 'project' && (
                            <ContextMenuItem onClick={() => handleExportNative(contextMenu.data)}>Export to Native Format</ContextMenuItem>
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
                )
            }



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
                                id: `step - ${Date.now()}`,
                                name: req.name,
                                type: 'request',
                                config: {
                                    request: { ...req, id: `req - ${Date.now()}` },
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
                                                id: `tc - ${Date.now()}`,
                                                name: `TestCase ${(s.testCases?.length || 0) + 1} `,
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

            {/* Import to Performance Suite Modal */}
            {importToPerformanceModal.open && importToPerformanceModal.suiteId && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{
                        background: 'var(--vscode-editor-background)',
                        border: '1px solid var(--vscode-widget-border)',
                        borderRadius: 6, padding: 20, minWidth: 400, maxWidth: 600, maxHeight: '70vh', overflow: 'auto'
                    }}>
                        <h3 style={{ margin: '0 0 15px 0' }}>Import Test Case to Performance Suite</h3>
                        <p style={{ marginBottom: 15, opacity: 0.8, fontSize: '0.9em' }}>Select a test case to import. All request steps from the test case will be added to this performance suite.</p>
                        <div style={{ maxHeight: 300, overflow: 'auto', marginBottom: 15 }}>
                            {projects.flatMap(p =>
                                (p.testSuites || []).flatMap(suite =>
                                    (suite.testCases || []).map(tc => ({
                                        projectName: p.name,
                                        suiteName: suite.name,
                                        testCase: tc,
                                        // Count the request steps
                                        stepCount: (tc.steps || []).filter(s => s.type === 'request').length
                                    }))
                                )
                            ).map((item, idx) => (
                                <div key={idx} style={{
                                    padding: '10px', marginBottom: 5, borderRadius: 4,
                                    background: 'var(--vscode-list-hoverBackground)',
                                    cursor: 'pointer', border: '1px solid var(--vscode-widget-border)'
                                }} onClick={() => {
                                    // Import all request steps from the test case
                                    const requestSteps = (item.testCase.steps || []).filter(s => s.type === 'request');
                                    if (requestSteps.length > 0) {
                                        for (const step of requestSteps) {
                                            const reqStep = step as any; // Request steps have additional properties
                                            bridge.sendMessage({
                                                command: 'addPerformanceRequest',
                                                suiteId: importToPerformanceModal.suiteId,
                                                name: step.name || 'Imported Step',
                                                endpoint: reqStep.endpoint || '',
                                                method: reqStep.method || 'POST',
                                                soapAction: reqStep.soapAction,
                                                requestBody: reqStep.request || '',
                                                headers: reqStep.headers || {},
                                                extractors: reqStep.extractors || []
                                            });
                                        }
                                    }
                                    setImportToPerformanceModal({ open: false, suiteId: null });
                                }}>
                                    <div style={{ fontWeight: 'bold' }}>{item.testCase.name}</div>
                                    <div style={{ fontSize: '0.85em', opacity: 0.7 }}>{item.projectName} → {item.suiteName}</div>
                                    <div style={{ fontSize: '0.8em', opacity: 0.5 }}>{item.stepCount} request step{item.stepCount !== 1 ? 's' : ''}</div>
                                </div>
                            ))}
                            {projects.flatMap(p => (p.testSuites || []).flatMap(s => s.testCases || [])).length === 0 && (
                                <div style={{ padding: 20, textAlign: 'center', opacity: 0.6 }}>No test cases available. Create a test suite first.</div>
                            )}
                        </div>
                        <button onClick={() => setImportToPerformanceModal({ open: false, suiteId: null })} style={{
                            background: 'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            border: 'none', padding: '8px 16px', borderRadius: 4, cursor: 'pointer'
                        }}>Cancel</button>
                    </div>
                </div>
            )}
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

            <CreateReplaceRuleModal
                isOpen={replaceRuleModal.open}
                xpath={replaceRuleModal.xpath}
                matchText={replaceRuleModal.matchText}
                initialTarget={replaceRuleModal.target}
                onCancel={() => setReplaceRuleModal({ open: false, xpath: '', matchText: '', target: 'response' })}
                onSave={(rule) => {
                    // Create rule with unique ID and save to config
                    const newRule: ReplaceRule = {
                        id: crypto.randomUUID(),
                        name: rule.name,
                        xpath: rule.xpath,
                        matchText: rule.matchText,
                        replaceWith: rule.replaceWith,
                        target: rule.target,
                        enabled: true
                    };
                    const currentRules = config?.replaceRules || [];
                    bridge.sendMessage({
                        command: 'saveSettings',
                        raw: false,
                        config: { ...config, replaceRules: [...currentRules, newRule] }
                    });
                    setReplaceRuleModal({ open: false, xpath: '', matchText: '', target: 'response' });
                }}
            />

            {/* Add to Project Modal */}
            <AddToProjectModal
                open={!!pendingAddInterface}
                onClose={() => setPendingAddInterface(null)}
                existingProjects={projects.map(p => p.name)}
                interfaceName={(pendingAddInterface as any)?._addAll ? `All ${exploredInterfaces.length} interfaces` : pendingAddInterface?.name}
                onSelectProject={(projectName) => {
                    if (pendingAddInterface) {
                        const isAddAll = (pendingAddInterface as any)._addAll;
                        if (isAddAll) {
                            // Add all explored interfaces to existing project
                            exploredInterfaces.forEach(iface => {
                                addInterfaceToNamedProject(iface, projectName, false);
                            });
                        } else {
                            addInterfaceToNamedProject(pendingAddInterface, projectName, false);
                        }
                        // Switch to workspace tab after adding
                        setActiveView(SidebarView.PROJECTS);
                    }
                }}
                onCreateProject={(projectName) => {
                    if (pendingAddInterface) {
                        const isAddAll = (pendingAddInterface as any)._addAll;
                        if (isAddAll) {
                            // Create new project with all explored interfaces
                            // First interface creates the project, rest are added
                            exploredInterfaces.forEach((iface, i) => {
                                addInterfaceToNamedProject(iface, projectName, i === 0);
                            });
                        } else {
                            addInterfaceToNamedProject(pendingAddInterface, projectName, true);
                        }
                        // Switch to workspace tab after adding
                        setActiveView(SidebarView.PROJECTS);
                    }
                }}
            />

        </Container >
    );
}

// NOTE: getInitialXml moved to utils/xmlUtils.ts

export default App;
