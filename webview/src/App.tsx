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
import { SoapUIRequest, SoapTestCase, SoapTestStep, SidebarView, ReplaceRule } from './models';
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
        setLoading
    } = useSelection();

    // ==========================================================================
    // EXPLORER - from useExplorer hook
    // ==========================================================================
    const {
        exploredInterfaces,
        setExploredInterfaces,
        explorerExpanded,
        setExplorerExpanded,
        addToProject,
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
    const [wsdlUrl, setWsdlUrl] = useState('http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL');
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [downloadStatus, setDownloadStatus] = useState<string[] | null>(null);

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
        handleViewSample
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
        setExploredInterfaces,
        setWorkspaceDirty,
        testExecution,
        saveProject
    });

    // ==========================================================================
    // WATCHER/PROXY - from useWatcherProxy hook
    // ==========================================================================
    const {
        watcherHistory,
        setWatcherHistory,
        watcherRunning,
        setWatcherRunning,
        proxyHistory,
        setProxyHistory,
        proxyRunning,
        setProxyRunning,
        proxyConfig,
        setProxyConfig,
        handleSelectWatcherEvent
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
        handleStartWatcher,
        handleStopWatcher,
        handleClearWatcher,
        handleStartProxy,
        handleStopProxy,
        handleUpdateProxyConfig,
        handleClearProxy,
        handleInjectProxy,
        handleRestoreProxy,
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

    // Extractor Modal State (needed before useWorkspaceCallbacks)
    const [extractorModal, setExtractorModal] = React.useState<{ xpath: string, value: string, source: 'body' | 'header', variableName: string } | null>(null);

    // ==========================================================================
    // WORKSPACE CALLBACKS - from useWorkspaceCallbacks hook
    // ==========================================================================
    const {
        handleSelectStep,
        handleDeleteStep,
        handleMoveStep,
        handleUpdateStep,
        handleBackToCase,
        handleAddStep,
        handleToggleLayout,
        handleToggleLineNumbers,
        handleToggleInlineElementValues,
        handleToggleHideCausalityData,
        handleAddExtractor
    } = useWorkspaceCallbacks({
        selectedTestCase,
        selectedStep,
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
        wsdlUrl,
        projects,
        proxyConfig,
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
            bridge.sendMessage({ command: 'loadWsdl', url: wsdlUrl, isLocal: false });
        } else if (inputType === 'file' && selectedFile) {
            bridge.sendMessage({ command: 'loadWsdl', url: selectedFile, isLocal: true });
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
                    selectedFile,
                    loadWsdl,
                    pickLocalWsdl,
                    downloadStatus
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
                proxyProps={{
                    isRunning: proxyRunning,
                    onStart: handleStartProxy,
                    onStop: handleStopProxy,
                    config: proxyConfig,
                    onUpdateConfig: handleUpdateProxyConfig,
                    history: proxyHistory,
                    onClear: handleClearProxy,
                    configPath,
                    onSelectConfigFile: () => bridge.sendMessage({ command: 'selectConfigFile' }),
                    onOpenCertificate: () => bridge.sendMessage({ command: 'installCertificate' }),
                    onSaveHistory: (content) => bridge.sendMessage({ command: 'saveProxyHistory', content }),
                    onInject: handleInjectProxy,
                    onRestore: handleRestoreProxy,
                    breakpoints: config?.breakpoints || [],
                    onUpdateBreakpoints: (bps) => {
                        if (config) {
                            const updatedConfig = { ...config, breakpoints: bps };
                            setConfig(updatedConfig);
                            bridge.sendMessage({ command: 'saveSettings', config: updatedConfig });
                        }
                    }
                }}
                activeView={activeView}
                onChangeView={setActiveView}
                backendConnected={backendConnected}
                workspaceDirty={workspaceDirty}
                showBackendStatus={!isVsCode()}
                onOpenSettings={() => setShowSettings(true)}
                onOpenHelp={() => setShowHelp(true)}
                onSaveUiState={handleSaveUiState}
            />

            {/* WorkspaceLayout with consolidated props */}
            <WorkspaceLayout
                selectionState={{
                    request: selectedRequest,
                    operation: selectedOperation,
                    testCase: selectedTestCase,
                    testStep: selectedStep
                }}
                requestActions={{
                    onExecute: executeRequest,
                    onCancel: cancelRequest,
                    onUpdate: handleRequestUpdate,
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
                configState={{
                    config,
                    defaultEndpoint: selectedInterface?.definition || wsdlUrl,
                    changelog,
                    onChangeEnvironment: (env) => bridge.sendMessage({ command: 'updateActiveEnvironment', envName: env }),
                    isReadOnly: activeView === SidebarView.WATCHER || activeView === SidebarView.PROXY
                }}
                stepActions={{
                    onRunTestCase: handleRunTestCaseWrapper,
                    onOpenStepRequest: (req) => setSelectedRequest(req),
                    onBackToCase: handleBackToCase,
                    onAddStep: handleAddStep,
                    testExecution,
                    onUpdateStep: handleUpdateStep,
                    onSelectStep: handleSelectStep,
                    onDeleteStep: handleDeleteStep,
                    onMoveStep: handleMoveStep
                }}
                toolsActions={{
                    onAddExtractor: handleAddExtractor,
                    onAddAssertion: handleAddAssertion,
                    onAddExistenceAssertion: handleAddExistenceAssertion,
                    onAddReplaceRule: (data) => setReplaceRuleModal({ open: true, ...data }),
                    onOpenDevOps: () => setShowDevOpsModal(true)
                }}
                breakpointState={{
                    activeBreakpoint,
                    onResolve: handleResolveBreakpoint
                }}
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
                        onClose={() => setShowSettings(false)}
                        onSave={(content, config) => {
                            bridge.sendMessage({ command: 'saveSettings', raw: !config, content, config });
                            setShowSettings(false);
                        }}
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

        </Container >
    );
}

// NOTE: getInitialXml moved to utils/xmlUtils.ts

export default App;
