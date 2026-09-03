
import React, { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { Container, ContextMenu, ContextMenuItem } from '../styles/App.styles';
import { bridge, isTauri } from '../utils/bridge';
import { updateProjectWithRename } from '../utils/projectUtils';
import { captureLog } from '../utils/logger';
import { generateInitialXmlForOperation, soapDefault, rewriteRequestsForContentTypeChange } from '../utils/soapUtils';
import { Sidebar } from './Sidebar';
import { WorkspaceContext } from '../contexts/WorkspaceContext';
import { SidebarContext } from '../contexts/SidebarContext';
import type { AddToProjectDestination } from './proxy/AddToProjectDialog';
import type { TrafficLog } from './proxy/TrafficViewer';
import type { PickRequestItem } from './modals/PickRequestModal';
import type { BulkImportResult } from './modals/BulkImportModal';
import { ApiRequest, TestCase, TestStep, SidebarView, RequestHistoryEntry, WsdlDiff, ApiInterface, ApiOperation, Workflow, WorkflowStep, ApinoxProject, UnifiedProject, ScrapbookRequest } from '@shared/models';
import { BackendCommand, FrontendCommand } from '@shared/messages';
import { PERF_REQUEST_ID_PREFIX } from '../constants';
import { useMessageHandler } from '../hooks/useMessageHandler';
import { useProject } from '../contexts/ProjectContext';
import { useSelection } from '../contexts/SelectionContext';
import { useUI } from '../contexts/UIContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useUnifiedProjects } from '../contexts/UnifiedProjectContext';
import { usePerformance } from '../contexts/PerformanceContext';
import { useTestRunner } from '../contexts/TestRunnerContext';
import { useScrapbook } from '../contexts/ScrapbookContext';
import { useContextMenu } from '../hooks/useContextMenu';
import { useSidebarCallbacks } from '../hooks/useSidebarCallbacks';
import { useWorkspaceCallbacks } from '../hooks/useWorkspaceCallbacks';
import { useAppLifecycle } from '../hooks/useAppLifecycle';
import { useLayoutHandler } from '../hooks/useLayoutHandler';
import { useFolderManager } from '../hooks/useFolderManager';
import { useMobileLayout } from '../hooks/useMobileLayout';
import { useWorkflowHandlers } from '../hooks/useWorkflowHandlers';
import { NotesProvider } from '../notes/NotesContext';

const NotesEditorLazy = React.lazy(() =>
    import('../notes/NotesEditor').then(module => ({ default: module.NotesEditor }))
);

interface ConfirmationState {
    title: string;
    message: string;
    onConfirm: () => void;
}

const WorkspaceLayout = React.lazy(() =>
    import('./WorkspaceLayout').then(module => ({ default: module.WorkspaceLayout }))
);
const ProxyPanel = React.lazy(() =>
    import('./proxy/ProxyPanel').then(module => ({ default: module.ProxyPanel }))
);
const RulesAndMockPage = React.lazy(() =>
    import('./proxy/RulesAndMockPage').then(module => ({ default: module.RulesAndMockPage }))
);
const FileWatcherPage = React.lazy(() =>
    import('./proxy/FileWatcherPage').then(module => ({ default: module.FileWatcherPage }))
);
const UnifiedExplorerView = React.lazy(() =>
    import('./explorer/UnifiedExplorerView').then(module => ({ default: module.UnifiedExplorerView }))
);
const HelpModal = React.lazy(() =>
    import('./HelpModal').then(module => ({ default: module.HelpModal }))
);
const AddToProjectDialog = React.lazy(() =>
    import('./proxy/AddToProjectDialog').then(module => ({ default: module.AddToProjectDialog }))
);
const AddToTestCaseModal = React.lazy(() =>
    import('./modals/AddToTestCaseModal').then(module => ({ default: module.AddToTestCaseModal }))
);
const ConfirmationModal = React.lazy(() =>
    import('./modals/ConfirmationModal').then(module => ({ default: module.ConfirmationModal }))
);
const RenameModal = React.lazy(() =>
    import('./modals/RenameModal').then(module => ({ default: module.RenameModal }))
);
const ExtractorModal = React.lazy(() =>
    import('./modals/ExtractorModal').then(module => ({ default: module.ExtractorModal }))
);
const SettingsEditorModal = React.lazy(() =>
    import('./modals/SettingsEditorModal').then(module => ({ default: module.SettingsEditorModal }))
);
const AddToDevOpsModal = React.lazy(() =>
    import('./modals/AddToDevOpsModal').then(module => ({ default: module.AddToDevOpsModal }))
);
const WsdlSyncModal = React.lazy(() =>
    import('./modals/WsdlSyncModal').then(module => ({ default: module.WsdlSyncModal }))
);
const DebugModal = React.lazy(() =>
    import('./modals/DebugModal').then(module => ({ default: module.DebugModal }))
);
const PickRequestModal = React.lazy(() =>
    import('./modals/PickRequestModal').then(module => ({ default: module.PickRequestModal }))
);
const ExportWorkspaceModal = React.lazy(() =>
    import('./modals/ExportWorkspaceModal').then(module => ({ default: module.ExportWorkspaceModal }))
);
const WorkflowBuilderModal = React.lazy(() =>
    import('./modals/WorkflowBuilderModal').then(module => ({ default: module.WorkflowBuilderModal }))
);
const BulkImportModal = React.lazy(() =>
    import('./modals/BulkImportModal').then(module => ({ default: module.BulkImportModal }))
);
const ImportTestCaseModal = React.lazy(() =>
    import('./ImportTestCaseModal').then(module => ({ default: module.ImportTestCaseModal }))
);

const DangerMenuItem = styled(ContextMenuItem)`
    color: var(--apinox-errorForeground);
`;

const MainContent: React.FC = () => {
    // ==========================================================================
    // PLATFORM DETECTION
    // ==========================================================================
    const [platformOS, setPlatformOS] = useState<'macos' | 'windows' | 'linux' | 'android' | 'ios' | 'unknown'>('unknown');
    const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
    const { isMobile } = useMobileLayout();

    useEffect(() => {
        async function detectPlatform() {
            try {
                if (window.__TAURI__) {
                    const { invoke } = await import('@tauri-apps/api/core');
                    const os = await invoke<string>('get_platform_os');
                    setPlatformOS(os as any);
                }
            } catch (err) {
                console.error('Failed to detect platform:', err);
            }
        }
        detectPlatform();
    }, []);
    
    const isMobilePlatform = platformOS === 'android' || platformOS === 'ios';
    const showCustomTitleBar = platformOS !== 'macos' && !isMobilePlatform;
    
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
        saveErrors,
        setSaveErrors,
        deleteConfirm,
        setDeleteConfirm,
        addProject,
        closeProject,
        loadProject,
        saveProject,
        toggleProjectExpand,
        toggleInterfaceExpand,
        toggleOperationExpand,
        expandAll,
        collapseAll,
        reorderItems,
        reorderOperations,
        reorderRequests
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
        selectedWorkflowStep,
        setSelectedWorkflowStep,
        selectedPerformanceSuiteId,
        setSelectedPerformanceSuiteId,
        response,
        setResponse,
        loading,
        setLoading,
        selectedTestSuite,
        setSelectedTestSuite
    } = useSelection();

    // Notify backend that the Webview is ready and load initial data
    useEffect(() => {
        console.log('[MainContent] App initialized');
    }, []);

    // ==========================================================================
    // WSDL -> project (shared by Bulk Import; legacy EXPLORER staging retired)
    // ==========================================================================
    const addInterfaceToNamedProject = useCallback((iface: ApiInterface, projectName: string, isNew: boolean) => {
        const normalizedIface = {
            ...iface,
            expanded: false,
            operations: (iface.operations || []).map(op => ({
                ...op,
                expanded: false,
                requests: op.requests.filter(req => req.name !== 'Sample')
            }))
        };
        if (isNew) {
            const newProject: ApinoxProject = {
                name: projectName,
                interfaces: [normalizedIface],
                expanded: true,
                dirty: true,
                id: Date.now().toString()
            };
            setProjects(prev => [...prev, newProject]);
            saveProject(newProject);
        } else {
            setProjects(prev => prev.map(p =>
                p.name === projectName
                    ? { ...p, interfaces: [...(p.interfaces || []), normalizedIface], dirty: true }
                    : p
            ));
        }
        setWorkspaceDirty(true);
    }, [setProjects, saveProject, setWorkspaceDirty]);

    // ==========================================================================
    // LOCAL STATE - Remaining state that stays in App
    // ==========================================================================
    
    // Unified Explorer State
    // Phase B (t_86c34d38): the unified project list is centralized in
    // UnifiedProjectContext (single source of truth for the unified store). It
    // migrates any legacy APInox-v1 dirs to unified on mount (idempotent,
    // non-destructive) then loads the unified list. The names below are aliased
    // from the context so the ~16 call sites in this component are unchanged.
    const { projects: unifiedProjects, setProjects: setUnifiedProjects } = useUnifiedProjects();
    const [unifiedSelectedNode, setUnifiedSelectedNode] = useState<{ type: string; id: string } | null>(null);
    
    // Unified Explorer Handlers
    const handleUnifiedSelectNode = useCallback((type: string, id: string) => {
        setUnifiedSelectedNode({ type, id });
    }, []);
    
    // ──────────────────────────────────────────────────────────────────────────
    // F-01 / R-05 — Quick Requests (scrapbook) for the unified explorer.
    //
    // State lives in the app-level ScrapbookProvider (shared with the legacy
    // view — R4: the legacy `useScrapbookAutoSave` hook and legacy scrapbook
    // CRUD are untouched; this is the NEW unified surface reusing the same
    // store). The sidebar Quick Requests section (UnifiedExplorerSidebar's
    // bottom section, Q1(a)) receives these handlers via `unifiedProps`;
    // execution routes through UnifiedExplorerMain's unified SOAP path
    // (registered via `unifiedExecuteRef`), which also performs the history
    // write (F-13) and auto-capture (F-02, Q4(c)).
    // ──────────────────────────────────────────────────────────────────────────
    const {
        scrapbookRequests,
        selectedScrapbookRequest,
        loading: scrapbookLoading,
        createRequest: createScrapbookRequest,
        selectRequest: selectScrapbookRequest,
        deleteRequest: deleteScrapbookRequest,
    } = useScrapbook();
    /** F-01: the unified execute function, registered by UnifiedExplorerMain. */
    const [unifiedExecuteFn, setUnifiedExecuteFn] = useState<((req: ApiRequest) => Promise<void>) | null>(null);
    const registerUnifiedExecute = useCallback((execute: (req: ApiRequest) => Promise<void>) => {
        setUnifiedExecuteFn(execute);
    }, []);

    const handleUnifiedScrapbookCreate = useCallback(async () => {
        try {
            const created = await createScrapbookRequest();
            if (created) {
                selectScrapbookRequest(created);
                setUnifiedSelectedNode({ type: 'scrapbook', id: created.id });
            }
        } catch (e) {
            console.error('[UnifiedExplorer] Failed to create quick request:', e);
        }
    }, [createScrapbookRequest, selectScrapbookRequest]);

    const handleUnifiedScrapbookSelect = useCallback((request: ScrapbookRequest) => {
        selectScrapbookRequest(request);
        setUnifiedSelectedNode({ type: 'scrapbook', id: request.id });
    }, [selectScrapbookRequest]);

    const handleUnifiedScrapbookDelete = useCallback((id: string) => {
        deleteScrapbookRequest(id).catch((e) => {
            console.error('[UnifiedExplorer] Failed to delete quick request:', e);
        });
        // If the deleted entry is the selected node, clear the unified
        // selection so the main view leaves the quick-request editor.
        setUnifiedSelectedNode(prev => (prev && prev.type === 'scrapbook' && prev.id === id) ? null : prev);
    }, [deleteScrapbookRequest]);

    const handleUnifiedScrapbookExecute = useCallback((request: ScrapbookRequest) => {
        selectScrapbookRequest(request);
        setUnifiedSelectedNode({ type: 'scrapbook', id: request.id });
        if (unifiedExecuteFn) {
            unifiedExecuteFn(request).catch((e) => {
                console.error('[UnifiedExplorer] Quick request execution failed:', e);
            });
        }
    }, [unifiedExecuteFn, selectScrapbookRequest]);
    
    const handleUnifiedRefresh = useCallback(async (projectName: string) => {
        const project = unifiedProjects.find(p => p.name === projectName);
        if (!project?.sourceUrl) return;
        try {
            const existingRequests = project.operations?.flatMap(op => op.requests || []) || [];
            const refreshed: UnifiedProject = await bridge.invokeTauriCommand('refresh_project_wsdl', {
                sourceUrl: project.sourceUrl,
                existingRequests,
            });
            // Enrich refreshed project: add XML bodies for any sample requests missing them
            const enrichedProject: UnifiedProject = {
                ...refreshed,
                operations: (refreshed.operations || []).map(op => {
                    const enrichedRequests = (op.requests || []).map(req => {
                        if (!req.request && op.input && op.targetNamespace) {
                            return { ...req, request: generateInitialXmlForOperation(op) };
                        }
                        return req;
                    });
                    return { ...op, requests: enrichedRequests };
                }),
            };
            setUnifiedProjects(prev => prev.map(p => p.name === projectName ? enrichedProject : p));
        } catch (e) {
            console.error('[UnifiedExplorer] Refresh failed:', e);
        }
    }, [unifiedProjects]);
    
    const handleUnifiedDeleteProject = useCallback(async (projectName: string) => {
        try {
            await bridge.invokeTauriCommand('delete_unified_project', { name: projectName });
            setUnifiedProjects(prev => prev.filter(p => p.name !== projectName));
        } catch (e) {
            console.error('[UnifiedExplorer] Delete project failed:', e);
        }
    }, []);
    
    const handleUnifiedDeleteOperation = useCallback(async (projectName: string, operationName: string) => {
        try {
            await bridge.invokeTauriCommand('delete_unified_operation', { projectName, operationName });
            setUnifiedProjects(prev => prev.map(p => {
                if (p.name !== projectName) return p;
                return { ...p, operations: p.operations.filter(op => op.name !== operationName) };
            }));
        } catch (e) {
            console.error('[UnifiedExplorer] Delete operation failed:', e);
        }
    }, []);
    
    const handleUnifiedDeleteRequest = useCallback(async (projectName: string, operationName: string, requestName: string) => {
        try {
            await bridge.invokeTauriCommand('delete_unified_request', { projectName, operationName, requestName });
            setUnifiedProjects(prev => prev.map(p => {
                if (p.name !== projectName) return p;
                return {
                    ...p,
                    operations: p.operations.map(op => {
                        if (op.name !== operationName) return op;
                        return { ...op, requests: op.requests?.filter(r => r.name !== requestName) || [] };
                    })
                };
            }));
        } catch (e) {
            console.error('[UnifiedExplorer] Delete request failed:', e);
        }
    }, []);
    
    // ── R-10 (F-17): context-menu rename (display-only `displayName`) ──────
    // Each rename command loads the project, sets/clears the additive
    // `displayName` field, persists it, and returns the FULL updated project —
    // so we replace the in-memory copy verbatim. The stable `name` (on-disk
    // directory, WSDL binding, refresh merge key, selection identity) is
    // untouched, so selection survives the rename.

    const handleUnifiedRenameProject = useCallback(async (projectName: string, displayName: string) => {
        const updated = await bridge.invokeTauriCommand<UnifiedProject>('rename_unified_project', { projectName, displayName });
        setUnifiedProjects(prev => prev.map(p => (p.name === projectName ? updated : p)));
    }, []);

    const handleUnifiedRenameOperation = useCallback(async (projectName: string, operationName: string, displayName: string) => {
        const updated = await bridge.invokeTauriCommand<UnifiedProject>('rename_unified_operation', { projectName, operationName, displayName });
        setUnifiedProjects(prev => prev.map(p => (p.name === projectName ? updated : p)));
    }, []);

    const handleUnifiedRenameRequest = useCallback(async (projectName: string, operationName: string, requestName: string, displayName: string) => {
        const updated = await bridge.invokeTauriCommand<UnifiedProject>('rename_unified_request', { projectName, operationName, requestName, displayName });
        setUnifiedProjects(prev => prev.map(p => (p.name === projectName ? updated : p)));
    }, []);
    
    const handleUnifiedNewRequest = useCallback(async (projectName: string, operationName: string) => {
        const project = unifiedProjects.find(p => p.name === projectName);
        const operation = project?.operations.find(op => op.name === operationName);
        if (!project || !operation) return;

        const existingRequests = operation.requests || [];
        const existingNames = new Set(existingRequests.map(req => req.name));
        const sampleRequest = existingRequests.find(req => req.name.startsWith("sample_"));

        let requestNumber = existingRequests.filter(req => !req.name.startsWith("sample_")).length + 1;
        let requestName = `Request${requestNumber}.xml`;
        while (existingNames.has(requestName)) {
            requestNumber += 1;
            requestName = `Request${requestNumber}.xml`;
        }

        // Precedence (SOAP_INTERFACE_CONTENT_TYPE_SPEC.md §5.2): project
        // contentType override ?? op.input.contentType ?? SOAP-version
        // default. No bare "application/soap+xml" fallback.
        const newContentType: string = project.contentType || operation.input?.contentType || soapDefault(project.soapVersion);

        const newReq: ApiRequest = {
            ...(sampleRequest || {}),
            id: crypto.randomUUID(),
            name: requestName,
            request: sampleRequest?.request || generateInitialXmlForOperation(operation),
            endpoint: sampleRequest?.endpoint || operation.originalEndpoint || "",
            method: sampleRequest?.method || "POST",
            contentType: newContentType,
            dirty: true,
            readOnly: false,
        };
        // Invariant (spec §6): keep the header in sync with the field so the
        // locked Content-Type row shows exactly what will be sent.
        newReq.headers = { ...(sampleRequest?.headers || {}), "Content-Type": newContentType };

        const updatedProject: UnifiedProject = {
            ...project,
            operations: project.operations.map(op => {
                if (op.name !== operationName) return op;
                return { ...op, requests: [...(op.requests || []), newReq] };
            }),
        };

        try {
            await bridge.invokeTauriCommand("save_unified_project", {
                dirPath: project.name,
                project: JSON.parse(JSON.stringify(updatedProject)),
            });
            setUnifiedProjects(prev => prev.map(p => p.name === projectName ? updatedProject : p));
            setUnifiedSelectedNode({ type: "request", id: newReq.id || newReq.name });
        } catch (e) {
            console.error("[UnifiedExplorer] New request failed:", e);
        }
    }, [unifiedProjects]);
    
    const handleUnifiedProjectContentTypeChange = useCallback(async (projectName: string, contentType: string) => {
        const project = unifiedProjects.find(p => p.name === projectName);
        if (!project) return;
        const oldValue = project.contentType || "";
        if (oldValue === contentType) return;

        // Propagate in place (SOAP_INTERFACE_CONTENT_TYPE_SPEC.md §5.4): sample
        // requests and inheriting requests are rewritten to the new effective
        // value (field + Content-Type header); user-customized requests are
        // untouched. Then persist immediately.
        const updatedProject: UnifiedProject = {
            ...project,
            contentType: contentType || undefined,
            operations: rewriteRequestsForContentTypeChange(project.operations, project.contentType, contentType, project.soapVersion),
        };

        try {
            await bridge.invokeTauriCommand("save_unified_project", {
                dirPath: project.name,
                project: JSON.parse(JSON.stringify(updatedProject)),
            });
            setUnifiedProjects(prev => prev.map(p => p.name === projectName ? updatedProject : p));
        } catch (e) {
            console.error("[UnifiedExplorer] Content-type change failed:", e);
        }
    }, [unifiedProjects]);
    
    const handleUnifiedExport = useCallback(async (projectName: string) => {
        const project = unifiedProjects.find(p => p.name === projectName);
        if (!project) return;
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const filePath = await save({
                defaultPath: `${projectName}.apinox`,
                filters: [{ name: 'APInox Project', extensions: ['apinox', 'json'] }]
            });
            if (!filePath) return;
            await bridge.invokeTauriCommand('export_unified_project', { projectName, filePath });
        } catch (e) {
            console.error('[UnifiedExplorer] Export failed:', e);
        }
    }, [unifiedProjects]);
    
    const handleUnifiedWsdlLoaded = useCallback((project: UnifiedProject) => {
        // Enrich sample requests with generated XML bodies
        const enrichedProject: UnifiedProject = {
            ...project,
            operations: project.operations.map(op => {
                const enrichedRequests = (op.requests || []).map(req => {
                    // If the request has no 'request' field (no body), generate one
                    if (!req.request && op.input && op.targetNamespace) {
                        return {
                            ...req,
                            request: generateInitialXmlForOperation(op),
                        };
                    }
                    return req;
                });
                return { ...op, requests: enrichedRequests };
            }),
        };
        setUnifiedProjects(prev => [...prev, enrichedProject]);
    }, []);
    
    const handleUnifiedReorderOperation = useCallback(async (projectName: string, fromIndex: number, toIndex: number) => {
        const project = unifiedProjects.find(p => p.name === projectName);
        if (!project) return;
        const ops = [...project.operations];
        const [moved] = ops.splice(fromIndex, 1);
        // When moving down (fromIndex < original toIndex), removal shifts all later indices left
        const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
        ops.splice(adjustedTo, 0, moved);
        const updated = { ...project, operations: ops };
        try {
            await bridge.invokeTauriCommand("save_unified_project", {
                dirPath: project.name,
                project: JSON.parse(JSON.stringify(updated)),
            });
            setUnifiedProjects(prev => prev.map(p => p.name === projectName ? updated : p));
        } catch (e) {
            console.error("[UnifiedExplorer] Reorder operation failed:", e);
        }
    }, [unifiedProjects]);

    const handleUnifiedReorderRequest = useCallback(async (projectName: string, operationName: string, fromIndex: number, toIndex: number) => {
        const project = unifiedProjects.find(p => p.name === projectName);
        if (!project) return;
        const updated = {
            ...project,
            operations: project.operations.map(op => {
                if (op.name !== operationName) return op;
                const reqs = [...(op.requests || [])];
                const [moved] = reqs.splice(fromIndex, 1);
                // When moving down (fromIndex < original toIndex), removal shifts all later indices left
                const adjustedTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
                reqs.splice(adjustedTo, 0, moved);
                return { ...op, requests: reqs };
            }),
        };
        try {
            await bridge.invokeTauriCommand("save_unified_project", {
                dirPath: project.name,
                project: JSON.parse(JSON.stringify(updated)),
            });
            setUnifiedProjects(prev => prev.map(p => p.name === projectName ? updated : p));
        } catch (e) {
            console.error("[UnifiedExplorer] Reorder request failed:", e);
        }
    }, [unifiedProjects]);
    
    // Backend Connection
    const [backendConnected, setBackendConnected] = useState(false);

    // ==========================================================================
    // UI state from UIContext
    // ==========================================================================
    const {
        activeView,
        setActiveView,
        sidebarExpanded,
        setSidebarExpanded
    } = useNavigation();
    const [hasOpenedProxyView, setHasOpenedProxyView] = useState(activeView === SidebarView.PROXY);
    const [hasOpenedUnifiedExplorer, setHasOpenedUnifiedExplorer] = useState(activeView === SidebarView.UNIFIED_EXPLORER);

    useEffect(() => {
        if (activeView === SidebarView.PROXY) {
            setHasOpenedProxyView(true);
        }
        if (activeView === SidebarView.UNIFIED_EXPLORER) {
            setHasOpenedUnifiedExplorer(true);
        }
    }, [activeView]);

    const {
        layoutMode,
        setLayoutMode,
        showLineNumbers,
        setShowLineNumbers,
        inlineElementValues,
        setInlineElementValues,
        hideCausalityData,
        setHideCausalityData,

        showSettings,
        setShowSettings,
        initialSettingsTab,
        setInitialSettingsTab,
        openSettings,
        showHelp,
        setShowHelp,
        helpSection,
        setHelpSection,
        showDevOpsModal,
        setShowDevOpsModal,
        showDebugModal,
        setShowDebugModal,
        openDebugModal,
        config,
        setConfig,
        rawConfig,
        setRawConfig,
        configPath,
        setConfigPath,
        setConfigDir
    } = useUI();

    // ── Startup update check ─────────────────────────────────────────────────
    const [hasUpdate, setHasUpdate] = useState(false);
    useEffect(() => {
        bridge.invokeTauriCommand<{ has_update: boolean }>('check_for_updates')
            .then((res) => { if (res?.has_update) setHasUpdate(true); })
            .catch((err) => { captureLog('warn', '[Updates] check_for_updates failed (offline or backend unavailable)', err); });
    }, []);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                openDebugModal();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [openDebugModal]);

    // Keyboard shortcut: Ctrl+Shift+D to open debug modal
    useEffect(() => {
        // If we switch TO Projects/Explorer view, and have a perf request selected -> Clear it
        if (activeView === SidebarView.PROJECTS && selectedRequest?.id && selectedRequest.id.startsWith(PERF_REQUEST_ID_PREFIX)) {
            setSelectedRequest(null);
        }

        // Tests view handles its own selection logic via useTestCaseHandlers usually, but safely:
        if (activeView === SidebarView.TESTS && selectedRequest?.id && selectedRequest.id.startsWith(PERF_REQUEST_ID_PREFIX)) {
            setSelectedRequest(null);
        }
    }, [activeView, selectedRequest, setSelectedRequest]);

    // If we switch TO Performance view, and have a non-perf request selected -> Clear it
    useEffect(() => {
        if (activeView === SidebarView.PERFORMANCE && selectedRequest?.id && !selectedRequest.id.startsWith(PERF_REQUEST_ID_PREFIX)) {
            setSelectedRequest(null);
        }
    }, [activeView, selectedRequest, setSelectedRequest]);

    // Auto-select first performance suite when available
    useEffect(() => {
        const suites = config?.performanceSuites || [];
        if (suites.length > 0 && !selectedPerformanceSuiteId) {
            setSelectedPerformanceSuiteId(suites[0].id);
        }
    }, [config?.performanceSuites, selectedPerformanceSuiteId, setSelectedPerformanceSuiteId]);

    // WSDL sync-diff state (Projects view "refresh WSDL")
    const [wsdlDiff, setWsdlDiff] = useState<WsdlDiff | null>(null);

    // ==========================================================================
    // FOLDER HANDLERS - Work with project.folders for unified structure
    // ==========================================================================
    const {
        handleAddFolder,
        handleAddRequestToFolder,
        handleDeleteFolder,
        handleToggleFolderExpand
    } = useFolderManager({
        setProjects,
        setWorkspaceDirty,
        setSelectedRequest
    });

    // Log unused handlers temporarily


    // Bulk Import Modal State
    const [showBulkImportModal, setShowBulkImportModal] = useState(false);

    // Add-traffic-to-project dialog state
    const [addTrafficLog, setAddTrafficLog] = useState<TrafficLog | null>(null);

    const handleAddTrafficToProject = useCallback((log: TrafficLog) => {
        setAddTrafficLog(log);
    }, []);

    const handleConfirmAddTrafficToProject = useCallback((
        projectName: string,
        destination: AddToProjectDestination,
        requestName: string,
        includeAllHeaders: boolean,
    ) => {
        if (!addTrafficLog) return;
        const log = addTrafficLog;
        setAddTrafficLog(null);

        setProjects(prev => prev.map(p => {
            if (p.name !== projectName) return p;

            // Extract the bare Content-Type (e.g. "application/soap+xml") from the raw header value.
            // SOAP Content-Type headers often carry extra directives like
            //   application/soap+xml; charset=utf-8; action="..."
            // We want to preserve charset but drop action= and other non-standard params so
            // they don't bleed into the request's Content-Type field.
            const rawContentType = log.requestHeaders?.['Content-Type'] || log.requestHeaders?.['content-type'] || '';
            const parsedContentType = (() => {
                if (!rawContentType) return 'text/xml; charset=utf-8';
                const parts = rawContentType.split(';').map((s: string) => s.trim());
                const mimeType = parts[0] || 'text/xml';
                const charset = parts.slice(1).find((p: string) => p.toLowerCase().startsWith('charset='));
                return charset ? `${mimeType}; ${charset}` : mimeType;
            })();

            // Build headers: either everything from the traffic log, or just Content-Type.
            const derivedHeaders: Record<string, string> = includeAllHeaders
                ? { ...log.requestHeaders }
                : {};

            const newReq: import('@shared/models').ApiRequest = {
                id: crypto.randomUUID(),
                name: requestName,
                request: log.requestBody || '',
                endpoint: log.url,
                method: (log.method as any) || 'POST',
                contentType: parsedContentType,
                headers: derivedHeaders,
                dirty: true,
            };

            if (destination.type === 'operation') {
                const { interfaceName, operationName } = destination;
                const newInterfaces = p.interfaces.map(iface => {
                    if (iface.name !== interfaceName) return iface;
                    const soapContentType = parsedContentType
                        || (iface.soapVersion === '1.2' ? 'application/soap+xml' : 'text/xml; charset=utf-8');
                    const newOps = iface.operations.map(op => {
                        if (op.name !== operationName) return op;
                        const req = { ...newReq, contentType: soapContentType, requestType: 'soap' as const, bodyType: 'xml' as const };
                        return { ...op, requests: [...op.requests, req], expanded: true };
                    });
                    return { ...iface, operations: newOps };
                });
                const updated = { ...p, interfaces: newInterfaces, dirty: true };
                setTimeout(() => saveProject(updated), 0);
                return updated;
            } else {
                // folder destination — create folder if it doesn't exist
                const { folderName } = destination;
                const existingFolders = p.folders ?? [];
                const folderExists = existingFolders.some(f => f.name === folderName);
                const newFolders = folderExists
                    ? existingFolders.map(f =>
                        f.name === folderName
                            ? { ...f, requests: [...f.requests, newReq], expanded: true }
                            : f
                    )
                    : [...existingFolders, {
                        id: crypto.randomUUID(),
                        name: folderName,
                        requests: [newReq],
                        expanded: true,
                    }];
                const updated = { ...p, folders: newFolders, dirty: true };
                setTimeout(() => saveProject(updated), 0);
                return updated;
            }
        }));
    }, [addTrafficLog, setProjects, saveProject]);



    const handleUpdateProject = useCallback((oldProject: import('@shared/models').ApinoxProject, newProject: import('@shared/models').ApinoxProject) => {
        setProjects(prev => prev.map(p => p === oldProject ? newProject : p));
        // All projects are persisted to ~/.apinox/projects/{name}/ — always save
        saveProject(newProject);
    }, [setProjects, saveProject]);

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
        handleDeleteRequest: _handleDeleteRequest,
        handleCloneRequest,
        handleAddRequest,
        handleDeleteInterface: _handleDeleteInterface,
        handleDeleteOperation: _handleDeleteOperation,
        handleExportNative,
        handleCopyUrl,
        handleCopyRequestXml,
        handleCopyResponseXml
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

    // Cleanup wrappers for Project structure
    const handleDeleteInterface = (iface: import('@shared/models').ApiInterface) => {
        _handleDeleteInterface(iface);
        // If selected interface matches, or selected operation/request belongs to it
        if (selectedInterface?.name === iface.name) {
            setSelectedInterface(null);
            // Operations and requests will be cleared by cascading logic or explicitly?
            // Safer to clear all if we are viewing the deleted interface's subtree
            setSelectedOperation(null);
            setSelectedRequest(null);
        }
        // Also check if selected operation belongs to this interface (if we didn't have interface selected directly)
        // ... (Checking strictly by name might be risky if duplicates allowed, but names are usually unique per project)
    };

    const handleDeleteOperation = (op: import('@shared/models').ApiOperation, iface: import('@shared/models').ApiInterface) => {
        _handleDeleteOperation(op, iface);
        if (selectedOperation?.name === op.name) {
            setSelectedOperation(null);
            setSelectedRequest(null);
        }
        // If a request of this operation is selected
        if (selectedRequest && op.requests.some(r => r.id === selectedRequest.id)) {
            setSelectedRequest(null);
        }
    };

    const handleDeleteRequest = (req?: import('@shared/models').ApiRequest) => {
        const target = req || (contextMenu?.type === 'request' ? contextMenu.data as import('@shared/models').ApiRequest : null);
        _handleDeleteRequest(req);

        if (target && selectedRequest?.id === target.id) {
            setSelectedRequest(null);
        }
    };

    // ==========================================================================
    // CONTEXT - Test Runner state from TestRunnerContext
    // ==========================================================================
    const {
        testExecution,
        handleSelectTestSuite,
        handleSelectTestCase,
        handleAddAssertion,
        handleAddExistenceAssertion,
        handleGenerateTestSuite,
        handleRunTestCaseWrapper,
        handleRunTestSuiteWrapper,
        handleSaveExtractor,
        executeRequest,
        cancelRequest,
        handleRequestUpdate,
        handleResetRequest,
        startTimeRef,
        requestIdRef
    } = useTestRunner();

    const {
        activeRunId,
        performanceProgress,
        coordinatorStatus,
        expandedPerformanceSuiteIds,
        handleAddPerformanceSuite,
        handleDeletePerformanceSuite,
        handleRunPerformanceSuite,
        handleStopPerformanceRun,
        handleSelectPerformanceSuite,
        handleUpdatePerformanceSuite,
        handleAddPerformanceRequest,
        handleDeletePerformanceRequest,
        handleUpdatePerformanceRequest,
        handleSelectPerformanceRequest,
        handleStartCoordinator,
        handleStopCoordinator,
        handleTogglePerformanceSuiteExpand
    } = usePerformance();

    const selectedPerformanceSuite = config?.performanceSuites?.find((s: any) => s.id === selectedPerformanceSuiteId) || null;

    // ==========================================================================
    // SIDEBAR CALLBACKS - from useSidebarCallbacks hook
    // ==========================================================================
    const {
        handleAddSuite,
        handleDeleteSuite: _handleDeleteSuite,
        handleToggleSuiteExpand,
        handleToggleCaseExpand,
        handleAddTestCase,
        handleDeleteTestCase: _handleDeleteTestCase,
        handleRenameTestCase,
        handleRenameTestStep,
        handleSaveUiState
    } = useSidebarCallbacks({
        projects,
        setProjects,
        deleteConfirm,
        setDeleteConfirm,
        saveProject,
        config
    });

    // Wrapped Handlers for State Cleanup

    const handleDeleteSuite = (suiteId: string) => {
        // Call original handler
        _handleDeleteSuite(suiteId);

        // Cleanup selection if needed
        // If selected test case belongs to this suite, clear it.
        if (selectedTestCase) {
            // Find parent suite of selectedTestCase
            const project = projects.find(p => p.testSuites?.some(s => s.testCases?.some(tc => tc.id === selectedTestCase.id)));
            const suite = project?.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
            if (suite?.id === suiteId) {
                setSelectedTestCase(null);
                setSelectedStep(null);
            }
        }
    };

    const handleDeleteTestCase = (caseId: string) => {
        _handleDeleteTestCase(caseId);
        if (selectedTestCase?.id === caseId) {
            setSelectedTestCase(null);
            setSelectedStep(null);
        }
    };

    // Performance Handlers
    // ==========================================================================

    // Auto-select first test case when none is selected but test cases exist
    // ONLY in Tests view to avoid re-selecting after user clears selection for navigation
    useEffect(() => {
        if (activeView !== SidebarView.TESTS) return;
        // Flatten all test cases from all projects/suites
        const allCases = projects.flatMap(p =>
            (p.testSuites || []).flatMap(s => s.testCases || [])
        );
        if (allCases.length > 0 && !selectedTestCase) {
            setSelectedTestCase(allCases[0]);
        }
    }, [projects, selectedTestCase, setSelectedTestCase, activeView]);

    // Sync selectedTestCase with authoritative projects state when projects changes
    // This fixes stale data (e.g. scriptContent) after projectLoaded updates projects
    useEffect(() => {
        if (!selectedTestCase) return;

        // Find the matching test case in the current projects state
        for (const proj of projects) {
            for (const suite of (proj.testSuites || [])) {
                const freshTestCase = suite.testCases?.find(tc => tc.id === selectedTestCase.id);
                if (freshTestCase && freshTestCase !== selectedTestCase) {
                    // Update selectedTestCase with fresh data from projects
                    setSelectedTestCase(freshTestCase);
                    return;
                }
            }
        }
    }, [projects, selectedTestCase, setSelectedTestCase]);

    const handleReplayRequest = (entry: RequestHistoryEntry) => {
        const req: ApiRequest = {
            id: entry.id,
            name: entry.requestName || 'Replayed Request',
            endpoint: entry.endpoint,
            request: entry.requestBody,
            headers: entry.headers,
            contentType: 'application/soap+xml', // Default content type
            readOnly: true // Mark as read-only since it's from history
        };
        setSelectedRequest(req);

        // Also restore the response if available
        if (entry.responseBody) {
            setResponse({
                rawResponse: entry.responseBody,
                status: entry.statusCode,
                headers: entry.responseHeaders || {},
                success: entry.success,
                error: entry.error,
                timeTaken: entry.duration
            });
        } else {
            setResponse(null);
        }
    };

    const handleToggleHistoryStar = async (id: string) => {
        try {
            await bridge.invokeTauriCommand('toggle_star_history', { id });
            // Refresh history
            const updatedHistory = await bridge.invokeTauriCommand('get_history', {});
            setRequestHistory(updatedHistory);
        } catch (error) {
            console.error('[MainContent] Failed to toggle star:', error);
        }
    };

    const handleDeleteHistory = async (id: string) => {
        try {
            await bridge.invokeTauriCommand('delete_history_entry', { id });
            // Refresh history
            const updatedHistory = await bridge.invokeTauriCommand('get_history', {});
            setRequestHistory(updatedHistory);
        } catch (error) {
            console.error('[MainContent] Failed to delete history entry:', error);
        }
    };

    // Extractor Modal State (needed before useWorkspaceCallbacks)
    const [extractorModal, setExtractorModal] = React.useState<{ xpath: string, value: string, source: 'body' | 'header', variableName: string } | null>(null);

    // ==========================================================================
    // SYNC SELECTED REQUEST FROM PROJECTS
    // ==========================================================================
    // When projects updates, re-sync selectedRequest to point to the updated object reference
    // ONLY if the current selectedRequest is stale (not found in projects anymore)
    React.useEffect(() => {
        if (!selectedRequest || !selectedProjectName) return;

        const project = projects.find(p => p.name === selectedProjectName);
        if (!project) return;

        // Check if selectedRequest is stale by searching for it in projects
        let isStale = true;

        // Search in folders
        const checkInFolders = (folders: any[]): boolean => {
            for (const folder of folders) {
                // Check if selectedRequest object reference exists in this folder
                if (folder.requests.some((r: any) => r === selectedRequest)) {
                    return false; // Not stale, found the exact object
                }
                if (folder.folders && !checkInFolders(folder.folders)) {
                    return false;
                }
            }
            return true; // Stale, not found
        };

        if (project.folders) {
            isStale = checkInFolders(project.folders);
        }

        // If not stale in folders, check interfaces
        if (!isStale) return; // selectedRequest is still valid, don't re-sync

        if (selectedInterface && selectedOperation) {
            const foundInInterface = project.interfaces
                .find(i => i.name === selectedInterface.name)
                ?.operations.find(o => o.name === selectedOperation.name)
                ?.requests.find(r => r === selectedRequest);

            if (foundInInterface) {
                isStale = false; // Not stale
            }
        }

        // Only re-sync if selectedRequest is stale
        if (!isStale) return;

        // Find the updated request by ID
        const findInFolders = (folders: any[]): any => {
            for (const folder of folders) {
                // STRICT MATCHING: If we have an ID, we MUST match by ID.
                const found = folder.requests.find((r: any) => {
                    if (selectedRequest.id) {
                        return r.id === selectedRequest.id;
                    }
                    return r.name === selectedRequest.name;
                });
                if (found) return found;
                if (folder.folders) {
                    const nested = findInFolders(folder.folders);
                    if (nested) return nested;
                }
            }
            return null;
        };

        const foundInFolders = project.folders ? findInFolders(project.folders) : null;
        if (foundInFolders) {
            setSelectedRequest(foundInFolders);
            return;
        }

        // Search in interfaces
        if (selectedInterface && selectedOperation) {
            const foundInInterface = project.interfaces
                .find(i => i.name === selectedInterface.name)
                ?.operations.find(o => o.name === selectedOperation.name)
                ?.requests.find(r => {
                    if (selectedRequest.id) {
                        return r.id === selectedRequest.id;
                    }
                    return r.name === selectedRequest.name;
                });

            if (foundInInterface) {
                setSelectedRequest(foundInInterface);
            }
        }
    }, [projects]); // Only run when projects changes, NOT when selectedRequest changes


    // ==========================================================================
    // WORKSPACE CALLBACKS - from useWorkspaceCallbacks hook
    // ==========================================================================
    const {
        handleSelectStep,
        handleDeleteStep,
        handleMoveStep,
        handleUpdateStep,
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
        config,
        setExtractorModal,
        onPickRequestForTestCase: (caseId) => {
            setPickRequestModal({ open: true, mode: 'testcase', caseId, suiteId: null });
        }
    });

    // Modals (remaining)
    const [confirmationModal, setConfirmationModal] = useState<ConfirmationState | null>(null);
    const [addToTestCaseModal, setAddToTestCaseModal] = React.useState<{ open: boolean, request: ApiRequest | null }>({ open: false, request: null });
    const [pickRequestModal, setPickRequestModal] = React.useState<{ open: boolean, mode: 'testcase' | 'performance', caseId: string | null, suiteId: string | null }>({ open: false, mode: 'testcase', caseId: null, suiteId: null });
    const [importToPerformanceModal, setImportToPerformanceModal] = React.useState<{ open: boolean, suiteId: string | null }>({ open: false, suiteId: null });
    const [exportWorkspaceModal, setExportWorkspaceModal] = React.useState(false);
    // const [codeSnippetModal, setCodeSnippetModal] = React.useState<{ open: boolean, request: ApiRequest | null }>({ open: false, request: null });

    const handleExportWorkspace = useCallback(async (selectedProjects: ApinoxProject[]) => {
        try {
            // Use Tauri dialog to choose save location first
            const { save } = await import('@tauri-apps/plugin-dialog');
            const filePath = await save({
                defaultPath: 'workspace.apinox',
                filters: [{
                    name: 'APInox Workspace',
                    extensions: ['apinox', 'json']
                }]
            });

            if (!filePath) {
                // User cancelled
                setExportWorkspaceModal(false);
                return;
            }

            // Send export command to backend
            console.log('[Export] Sending export command:', {
                command: FrontendCommand.ExportWorkspace,
                projectCount: selectedProjects.length,
                projectNames: selectedProjects.map(p => p.name),
                filePath
            });
            await bridge.sendMessageAsync({
                command: FrontendCommand.ExportWorkspace,
                projects: selectedProjects,
                filePath
            });

            console.log(`[Export] Workspace exported to ${filePath}`);
            alert(`Workspace exported successfully to ${filePath}`);
        } catch (error: any) {
            console.error('[Export] Failed to export workspace:', error);
            alert(`Failed to export workspace: ${error.message || 'Unknown error'}`);
        }
        setExportWorkspaceModal(false);
    }, []);

    // ==========================================================================
    // WORKFLOW HANDLERS - extracted to useWorkflowHandlers hook
    // ==========================================================================
    const {
        workflowBuilderModal,
        setWorkflowBuilderModal,
        handleAddWorkflow,
        handleEditWorkflow,
        handleSaveWorkflow,
        handleRunWorkflow,
        handleDeleteWorkflow,
        handleDuplicateWorkflow,
        handleSelectWorkflow,
        handleSelectWorkflowStep,
        handleUpdateWorkflowStep,
        handleUpdateWorkflow,
    } = useWorkflowHandlers({
        config,
        setConfig,
        setWorkspaceDirty,
        selectedWorkflowStep,
        setSelectedWorkflowStep: setSelectedWorkflowStep as (step: { workflow: Workflow; step: WorkflowStep | null } | null) => void,
        setSelectedRequest,
        setActiveView,
        setLoading,
    });

    const pickRequestItems = useMemo<PickRequestItem[]>(() => {
        const items: PickRequestItem[] = [];

        const addOperationItems = (project: any) => {
            if (!project.interfaces) return;
            project.interfaces.forEach((iface: any) => {
                iface.operations?.forEach((op: any) => {
                    // If operation has multiple requests, add each one separately
                    if (op.requests && op.requests.length > 0) {
                        op.requests.forEach((req: any, idx: number) => {
                            items.push({
                                id: `${project.id || project.name}-op-${op.name}-req-${idx}`,
                                label: op.requests.length > 1 ? `${(op as any).displayName || op.name} [${idx + 1}/${op.requests.length}]` : ((op as any).displayName || op.name),
                                description: `${project.name} > ${(iface as any).displayName || iface.name} > ${req.name}`,
                                detail: req.endpoint || op.originalEndpoint || 'WSDL Operation',
                                type: 'request',
                                data: req
                            });
                        });
                    } else {
                        // No requests - add operation for SOAP XML generation
                        items.push({
                            id: `${project.id || project.name}-op-${op.name}`,
                            label: (op as any).displayName || op.name,
                            description: `${project.name} > ${(iface as any).displayName || iface.name}`,
                            detail: op.originalEndpoint || 'WSDL Operation',
                            type: 'operation',
                            data: op,
                            warning: true
                        });
                    }
                });
            });
        };

        const traverseFolders = (project: any, folders: any[], parentPath: string) => {
            folders.forEach(folder => {
                const currentPath = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
                if (folder.requests) {
                    folder.requests.forEach((req: any) => {
                        if (!req) return;
                        items.push({
                            id: `${project.id || project.name}-req-${req.id || req.name}`,
                            label: req.name,
                            description: `${project.name} > ${currentPath}`,
                            detail: req.endpoint || 'Request',
                            type: 'request',
                            data: req
                        });
                    });
                }
                if (folder.folders) {
                    traverseFolders(project, folder.folders, currentPath);
                }
            });
        };

        projects.forEach((project: any) => {
            addOperationItems(project);
            if (project.folders) {
                traverseFolders(project, project.folders, '');
            }
        });

        return items;
    }, [projects]);

    // Workspace State
    const [changelog, setChangelog] = useState<string>('');
    const [requestHistory, setRequestHistory] = useState<RequestHistoryEntry[]>([]);

    useEffect(() => {
        if (!isTauri()) return;
        try {
            localStorage.setItem('apinox_history_cache', JSON.stringify(requestHistory));
        } catch (e) {
            console.warn('[History] Failed to cache history:', e);
        }
    }, [requestHistory]);

    const handleRefreshWsdl = useCallback((projectName: string, iface: ApiInterface) => {
        bridge.sendMessage({
            command: FrontendCommand.RefreshWsdl,
            projectId: projectName,
            // Use interface ID if available, fallback to definition (WSDL URL) for matching
            interfaceId: iface.id || iface.definition,
            interfaceName: iface.name // Keep for backward compatibility
        });
    }, []);

    const handleApplyWsdlSync = useCallback((diff: WsdlDiff) => {
        // Find project dirPath from projects context
        const project = projects.find(p => p.id === diff.projectId);
        const dirPath = project?.fileName || '';
        
        bridge.sendMessage({
            command: FrontendCommand.ApplyWsdlSync,
            projectId: diff.projectId,
            diff,
            dirPath
        });
        setWsdlDiff(null);
    }, [projects]);



    // Message Handler Hook
    // ==========================================================================
    // LAYOUT & VIEW SWITCHING
    // ==========================================================================

    const handleAddPerformanceRequestForUi = useCallback((suiteId: string) => {
        if (isTauri()) {
            setPickRequestModal({ open: true, mode: 'performance', caseId: null, suiteId });
            return;
        }
        handleAddPerformanceRequest(suiteId);
    }, [handleAddPerformanceRequest]);

    const {
        isResizing,
        splitRatio,
        startResizing,
        handleSetActiveViewWrapper,
        setSplitRatio
    } = useLayoutHandler({
        config,
        setConfig,
        layoutMode,
        activeView,
        sidebarExpanded,
        setSidebarExpanded,
        setActiveView,
        selectedRequest,
        setSelectedInterface,
        setSelectedOperation,
        setSelectedRequest,
        setSelectedTestCase,
        selectedPerformanceSuiteId,
        setSelectedPerformanceSuiteId
    });
    useMessageHandler({
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
        // setProxyConfig, // Handled in MockProxyContext
        setSelectedProjectName,
        setWorkspaceDirty,
        setSavedProjects,
        setSaveErrors,
        setChangelog,
        // Mock/Proxy setters moved to MockProxyContext but kept for useSidebarCallbacks via MainContent state
        setActiveView,
        setRequestHistory,

        // Current values
        projects,
        config,
        selectedTestCase,
        selectedRequest,
        startTimeRef,
        requestIdRef,

        // Callbacks
        saveProject,
        setWsdlDiff
    });

    // ==========================================================================
    // LIFECYCLE - Initial Load, Autosave, Shortcuts
    // ==========================================================================
    useAppLifecycle({
        projects,
        selectedProjectName,
        saveProject,
        setSelectedProjectName,
        setRequestHistory
    });

    // Sync selectedTestCase with latest projects state

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

    // Sync selectedStep with latest projects state
    useEffect(() => {
        if (selectedStep && selectedTestCase) {
            // Re-hydrate stale selectedStep from the current testCase
            for (const p of projects) {
                if (p.testSuites) {
                    for (const s of p.testSuites) {
                        const updatedCase = s.testCases?.find(tc => tc.id === selectedTestCase.id);
                        if (updatedCase) {
                            const updatedStep = updatedCase.steps.find(step => step.id === selectedStep.id);
                            if (updatedStep && updatedStep !== selectedStep) {
                                // console.log('[sync] Re-hydrating selectedStep', updatedStep.name);
                                setSelectedStep(updatedStep);
                            }
                            return;
                        }
                    }
                }
            }
        }
    }, [projects, selectedStep, selectedTestCase]);

    // Sync selectedTestSuite - clear if deleted
    useEffect(() => {
        if (selectedTestSuite) {
            // Check if the selected test suite still exists in projects
            let suiteExists = false;
            for (const p of projects) {
                if (p.testSuites) {
                    const foundSuite = p.testSuites.find(s => s.id === selectedTestSuite.id);
                    if (foundSuite) {
                        suiteExists = true;
                        // Re-hydrate if suite has updated
                        if (foundSuite !== selectedTestSuite) {
                            setSelectedTestSuite(foundSuite);
                        }
                        break;
                    }
                }
            }
            // If suite no longer exists, clear selection
            if (!suiteExists) {
                setSelectedTestSuite(null);
            }
        }
    }, [projects, selectedTestSuite]);

    // Auto-save projects when workspace becomes dirty
    useEffect(() => {
        if (!workspaceDirty) return;

        console.log('[MainContent] Workspace dirty, scheduling auto-save');
        
        const timer = setTimeout(() => {
            console.log('[MainContent] Auto-save executing for', projects.length, 'projects');

            // All projects are always persisted to ~/.apinox/projects/{name}/
            projects.forEach(project => {
                console.log('[MainContent] Auto-saving project:', project.name);
                saveProject(project);
            });

            // Clear dirty flag after save
            setWorkspaceDirty(false);
        }, 1000); // Debounce 1 second

        return () => clearTimeout(timer);
    }, [workspaceDirty, projects, saveProject, setWorkspaceDirty]);


    // Handlers







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

    // ==========================================================================
    // WORKSPACE CONTEXT VALUE - Aggregates all state for WorkspaceLayout subtree
    // ==========================================================================
    const workspaceContextValue = useMemo(() => ({
        // PROJECT STATE
        projects,
        dirtyProjects: new Set<string>(),
        selectedProjectName,
        setProjects,
        // SELECTION STATE
        selectedInterface,
        selectedOperation,
        selectedRequest,
        selectedTestSuite,
        selectedTestCase,
        selectedTestStep: selectedStep,
        selectedWorkflowStep,
        selectedPerformanceSuiteId,
        performanceHistory: config?.performanceHistory || [],
        performanceProgress,
        coordinatorStatus,
        // NAVIGATION
        activeView,
        // REQUEST/RESPONSE STATE
        response,
        loading,
        // UI STATE
        layoutMode,
        showLineNumbers,
        splitRatio,
        isResizing,
        inlineElementValues,
        setInlineElementValues,
        hideCausalityData,
        setHideCausalityData,
        // CONFIG STATE
        config,
        defaultEndpoint: '',
        isReadOnly: false,
        backendConnected,
        // PROJECT ACTIONS
        addProject,
        updateProject: handleUpdateProject,
        closeProject: handleCloseProject,
        setDirty: (_name: string, _isDirty: boolean) => { /* managed by workspaceDirty flag */ },
        saveProject: (name: string): Promise<void> => {
            const p = projects.find(x => x.name === name);
            if (p) return Promise.resolve(saveProject(p)).then(() => {});
            return Promise.resolve();
        },
        // SELECTION ACTIONS
        selectInterface: setSelectedInterface,
        selectOperation: setSelectedOperation,
        selectRequest: setSelectedRequest,
        selectTestSuite: setSelectedTestSuite,
        selectTestCase: setSelectedTestCase,
        selectTestStep: handleSelectStep,
        selectWorkflowStep: (ws: any) => setSelectedWorkflowStep(ws),
        // REQUEST ACTIONS
        executeRequest,
        cancelRequest,
        updateRequest: handleRequestUpdate,
        resetRequest: handleResetRequest,
        // UI ACTIONS
        toggleLayout: handleToggleLayout,
        setLayoutMode,
        toggleLineNumbers: handleToggleLineNumbers,
        setShowLineNumbers,
        setSplitRatio,
        setIsResizing: startResizing,
        // TEST RUNNER
        handleAddAssertion,
        handleRunTestCase: handleRunTestCaseWrapper,
        handleRunTestSuite: handleRunTestSuiteWrapper,
        // TEST STEP
        updateTestStep: handleUpdateStep,
        deleteTestStep: handleDeleteStep,
        moveTestStep: handleMoveStep,
        addTestStep: handleAddStep,
        backToTestCase: () => { setSelectedStep(null); setSelectedRequest(null); },
        openStepRequest: (req: ApiRequest) => { setSelectedRequest(req); setActiveView(SidebarView.PROJECTS); },
        // PERFORMANCE
        handleAddPerformanceSuite,
        handleDeletePerformanceSuite,
        handleAddPerformanceRequest: handleAddPerformanceRequestForUi,
        handleDeletePerformanceRequest,
        handleUpdatePerformanceRequest,
        handleSelectPerformanceRequest,
        handleRunPerformanceSuite: handleRunPerformanceSuite as (suiteId: string) => Promise<void>,
        handleStopPerformanceRun,
        handleSelectPerformanceSuite,
        handleUpdatePerformanceSuite,
        handleStartCoordinator,
        handleStopCoordinator,
        // TEST EXECUTION
        testExecution,
        // EXTRACTOR & EXISTENCE ASSERTION
        handleAddExtractor,
        handleAddExistenceAssertion,
        // PERFORMANCE - import from workspace
        onImportFromWorkspace: (suiteId: string) => setImportToPerformanceModal({ open: true, suiteId }),
        // WORKFLOW UPDATE
        updateWorkflow: handleUpdateWorkflow,
        updateWorkflowStep: handleUpdateWorkflowStep,
    }), [
        projects, selectedProjectName, selectedInterface, selectedOperation, selectedRequest,
        selectedTestSuite, selectedTestCase, selectedStep, selectedWorkflowStep,
        selectedPerformanceSuiteId, config, performanceProgress, coordinatorStatus,
        activeView,
        response, loading, layoutMode, showLineNumbers, splitRatio, isResizing,
        inlineElementValues, hideCausalityData, backendConnected, testExecution,
        handleUpdateProject, handleCloseProject, handleSelectStep, handleToggleLayout,
        handleToggleLineNumbers, handleUpdateStep, handleDeleteStep, handleMoveStep,
        handleAddStep, handleRunTestCaseWrapper, handleRunTestSuiteWrapper,
        handleAddAssertion, handleAddPerformanceSuite, handleDeletePerformanceSuite,
        handleRunPerformanceSuite, handleStopPerformanceRun, handleSelectPerformanceSuite,
        handleUpdatePerformanceSuite, handleAddPerformanceRequestForUi,
        handleDeletePerformanceRequest, handleUpdatePerformanceRequest,
        handleSelectPerformanceRequest, handleStartCoordinator, handleStopCoordinator,
        executeRequest, cancelRequest, handleRequestUpdate, handleResetRequest,
        setSelectedInterface, setSelectedOperation, setSelectedRequest, setSelectedTestSuite,
        setSelectedTestCase, setSelectedWorkflowStep, setLayoutMode, setShowLineNumbers,
        setSplitRatio, startResizing, setInlineElementValues, setHideCausalityData,
        addProject, saveProject, setProjects, setSelectedStep, setActiveView,
        handleAddExtractor, handleAddExistenceAssertion,
        handleUpdateWorkflow, handleUpdateWorkflowStep, setImportToPerformanceModal,
    ]);

    // ==========================================================================
    // SIDEBAR CONTEXT VALUE - Aggregates all state for the Sidebar subtree
    // ==========================================================================
    const sidebarContextValue = useMemo(() => ({
        projectProps: {
            projects,
            savedProjects,
            saveErrors,
            setSaveErrors,
            loadProject: () => loadProject(),
            saveProject,
            onUpdateProject: handleUpdateProject,
            closeProject: handleCloseProject,
            onAddProject: addProject,
            toggleProjectExpand,
            toggleInterfaceExpand,
            toggleOperationExpand,
            expandAll,
            collapseAll,
            reorderItems,
            reorderOperations,
            reorderRequests,
            onDeleteInterface: handleDeleteInterface,
            onDeleteOperation: handleDeleteOperation,
            onAddFolder: handleAddFolder,
            onAddRequestToFolder: handleAddRequestToFolder,
            onDeleteFolder: handleDeleteFolder,
            onToggleFolderExpand: handleToggleFolderExpand,
            onRefreshInterface: handleRefreshWsdl,
            onExportWorkspace: () => setExportWorkspaceModal(true),
            onBulkImport: () => setShowBulkImportModal(true),
            onImportSoapUI: async () => {
                if (bridge.isTauri()) {
                    const { open } = await import('@tauri-apps/plugin-dialog');
                    const selected = await open({
                        multiple: false,
                        directory: false,
                        filters: [{ name: 'SoapUI Workspace or Project', extensions: ['xml'] }],
                        title: 'Import SoapUI Workspace or Project',
                    });
                    if (selected) {
                        await loadProject(selected as string);
                    }
                }
            },
        },
        selectionProps: {
            selectedProjectName,
            setSelectedProjectName,
            selectedInterface,
            setSelectedInterface,
            selectedOperation,
            setSelectedOperation,
            selectedRequest,
            setSelectedRequest: (req: import('@shared/models').ApiRequest | null) => {
                setSelectedRequest(req);
                setSelectedTestCase(null);
            },
            setResponse,
            handleContextMenu,
            onAddRequest: handleAddRequest,
            onDeleteRequest: handleDeleteRequest,
            deleteConfirm,
            setDeleteConfirm,
        },
        testsProps: {
            projects,
            selectedTestSuite,
            selectedTestCase,
            onAddSuite: handleAddSuite,
            onDeleteSuite: handleDeleteSuite,
            onRunSuite: handleRunTestSuiteWrapper,
            onAddTestCase: handleAddTestCase,
            onDeleteTestCase: handleDeleteTestCase,
            onRenameTestCase: handleRenameTestCase,
            onRunCase: handleRunTestCaseWrapper,
            onSelectSuite: handleSelectTestSuite,
            onSelectTestCase: handleSelectTestCase,
            onSelectTestStep: (caseId: string, stepId: string) => {
                const project = projects.find(p => p.testSuites?.some(s => s.testCases?.some(tc => tc.id === caseId)));
                const suite = project?.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                const testCase = suite?.testCases?.find(tc => tc.id === caseId);
                const step = testCase?.steps?.find(s => s.id === stepId);
                if (step) handleSelectStep(step);
            },
            onRenameTestStep: handleRenameTestStep,
            onToggleSuiteExpand: handleToggleSuiteExpand,
            onToggleCaseExpand: handleToggleCaseExpand,
            deleteConfirm,
        },
        workflowsProps: {
            workflows: config?.workflows || [],
            onAdd: handleAddWorkflow,
            onEdit: handleEditWorkflow,
            onRun: handleRunWorkflow,
            onDelete: handleDeleteWorkflow,
            onDuplicate: handleDuplicateWorkflow,
            onSelect: handleSelectWorkflow,
            onSelectStep: handleSelectWorkflowStep,
        },
        performanceProps: {
            suites: config?.performanceSuites || [],
            onAddSuite: handleAddPerformanceSuite,
            onDeleteSuite: handleDeletePerformanceSuite,
            onRunSuite: handleRunPerformanceSuite,
            onSelectSuite: handleSelectPerformanceSuite,
            onStopRun: handleStopPerformanceRun,
            isRunning: !!activeRunId,
            activeRunId,
            selectedSuiteId: selectedPerformanceSuiteId ?? undefined,
            deleteConfirm,
            setDeleteConfirm,
            onAddRequest: handleAddPerformanceRequestForUi,
        },
        historyProps: {
            history: requestHistory,
            onReplay: handleReplayRequest,
            onToggleStar: handleToggleHistoryStar,
            onDelete: handleDeleteHistory,
        },
        unifiedProps: {
            projects: unifiedProjects,
            selectedNode: unifiedSelectedNode,
            onSelectNode: handleUnifiedSelectNode,
            onRefreshProject: handleUnifiedRefresh,
            onDeleteProject: handleUnifiedDeleteProject,
            onDeleteOperation: handleUnifiedDeleteOperation,
            onDeleteRequest: handleUnifiedDeleteRequest,
            onNewRequest: handleUnifiedNewRequest,
            onRenameProject: handleUnifiedRenameProject,
            onRenameOperation: handleUnifiedRenameOperation,
            onRenameRequest: handleUnifiedRenameRequest,
            onExportProject: handleUnifiedExport,
            onReorderOperation: handleUnifiedReorderOperation,
            onReorderRequest: handleUnifiedReorderRequest,
            // F-01 / R-05 — Quick Requests bottom section (Q1(a))
            scrapbook: {
                requests: scrapbookRequests,
                selectedRequest: selectedScrapbookRequest,
                loading: scrapbookLoading,
                onCreateRequest: handleUnifiedScrapbookCreate,
                onSelectRequest: handleUnifiedScrapbookSelect,
                onDeleteRequest: handleUnifiedScrapbookDelete,
                onExecuteRequest: handleUnifiedScrapbookExecute,
            },
        },
        activeView,
        onChangeView: handleSetActiveViewWrapper,
        sidebarExpanded,
        backendConnected,
        workspaceDirty,
        showBackendStatus: true,
        onOpenSettings: () => setShowSettings(true),
        onOpenHelp: () => setShowHelp(true),
        onSaveUiState: handleSaveUiState,
        activeEnvironment: config?.activeEnvironment,
        environments: config?.environments,
        onChangeEnvironment: (env: string) => bridge.sendMessage({ command: 'setActiveEnvironment', env }),
        isMobileOpen: isMobileDrawerOpen,
        onMobileClose: isMobilePlatform ? () => setIsMobileDrawerOpen(false) : undefined,
        hasUpdate,
    }), [
        projects, savedProjects, saveErrors, setSaveErrors, loadProject, saveProject,
        handleUpdateProject, handleCloseProject, addProject,
        toggleProjectExpand, toggleInterfaceExpand, toggleOperationExpand,
        expandAll, collapseAll, reorderItems,
        handleDeleteInterface, handleDeleteOperation,
        handleAddFolder, handleAddRequestToFolder, handleDeleteFolder, handleToggleFolderExpand,
        handleRefreshWsdl, setExportWorkspaceModal, setShowBulkImportModal,
        selectedProjectName, setSelectedProjectName,
        selectedInterface, setSelectedInterface,
        selectedOperation, setSelectedOperation,
        selectedRequest, setSelectedRequest, setSelectedTestCase, setResponse,
        handleContextMenu, handleAddRequest, handleDeleteRequest, deleteConfirm, setDeleteConfirm,
        handleAddSuite, handleDeleteSuite, handleRunTestSuiteWrapper,
        handleAddTestCase, handleDeleteTestCase, handleRenameTestCase,
        handleRunTestCaseWrapper, handleSelectTestSuite, handleSelectTestCase,
        handleToggleSuiteExpand, handleToggleCaseExpand, handleSelectStep, handleRenameTestStep,
        selectedTestSuite, selectedTestCase,
        config, activeRunId, selectedPerformanceSuiteId,
        handleAddWorkflow, handleEditWorkflow, handleRunWorkflow,
        handleDeleteWorkflow, handleDuplicateWorkflow, handleSelectWorkflow, handleSelectWorkflowStep,
        handleAddPerformanceSuite, handleDeletePerformanceSuite, handleRunPerformanceSuite,
        handleSelectPerformanceSuite, handleStopPerformanceRun, handleAddPerformanceRequestForUi,
        requestHistory, handleReplayRequest, handleToggleHistoryStar, handleDeleteHistory,
        unifiedProjects, unifiedSelectedNode,
        handleUnifiedSelectNode, handleUnifiedRefresh, handleUnifiedDeleteProject,
        handleUnifiedDeleteOperation, handleUnifiedDeleteRequest, handleUnifiedNewRequest,
        handleUnifiedRenameProject, handleUnifiedRenameOperation, handleUnifiedRenameRequest,
        handleUnifiedProjectContentTypeChange,
        handleUnifiedExport, handleUnifiedReorderOperation, handleUnifiedReorderRequest,
        scrapbookRequests, selectedScrapbookRequest, scrapbookLoading,
        handleUnifiedScrapbookCreate, handleUnifiedScrapbookSelect,
        handleUnifiedScrapbookDelete, handleUnifiedScrapbookExecute,
        registerUnifiedExecute,
        activeView, handleSetActiveViewWrapper, sidebarExpanded, backendConnected,
        workspaceDirty, handleSaveUiState, setShowSettings, setShowHelp,
        isMobileDrawerOpen, isMobilePlatform, setIsMobileDrawerOpen, hasUpdate,
    ]);

    return (
        <Container onClick={closeContextMenu} $showCustomTitleBar={showCustomTitleBar} $isMacOS={platformOS === 'macos'} $isMobile={isMobilePlatform} $isAndroid={platformOS === 'android'}>
            {/* Mobile header bar — replaces desktop TitleBar on Android/iOS */}
            {isMobilePlatform && (
                <div className="mobile-header">
                    <button
                        className="mobile-hamburger"
                        onClick={(e) => { e.stopPropagation(); setIsMobileDrawerOpen(prev => !prev); }}
                        title={isMobileDrawerOpen ? "Close sidebar" : "Open sidebar"}
                        aria-label={isMobileDrawerOpen ? "Close sidebar" : "Open sidebar"}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2 4h16v2H2zM2 9h16v2H2zM2 14h16v2H2z"/>
                        </svg>
                    </button>
                    <span className="mobile-header-title">APInox</span>
                </div>
            )}

            {/* Narrow-desktop hamburger — fixed overlay in TitleBar area, only on non-mobile platforms */}
            {isMobile && !isMobilePlatform && (
                <button
                    className="narrow-desktop-hamburger"
                    onClick={(e) => { e.stopPropagation(); setIsMobileDrawerOpen(prev => !prev); }}
                    title={isMobileDrawerOpen ? "Close sidebar" : "Open sidebar"}
                    aria-label={isMobileDrawerOpen ? "Close sidebar" : "Open sidebar"}
                >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 4h16v2H2zM2 9h16v2H2zM2 14h16v2H2z"/>
                    </svg>
                </button>
            )}

            {/* Backdrop — closes sidebar on mobile when tapping outside */}
            {isMobile && isMobileDrawerOpen && (
                <div
                    className="sidebar-backdrop"
                    onClick={() => setIsMobileDrawerOpen(false)}
                />
            )}

            {/* Content row: sidebar + main workspace side by side */}
            <NotesProvider>
            <div className="content-row">

            {/* Sidebar — all props supplied via SidebarContext */}
            <SidebarContext.Provider value={sidebarContextValue}>
                <Sidebar />
            </SidebarContext.Provider>

            {hasOpenedProxyView && (
                <div style={{ display: activeView === SidebarView.PROXY ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column', minHeight: 0 }}>
                    <Suspense fallback={<div style={{ flex: 1, background: 'var(--apinox-editor-background)' }} />}>
                        <ProxyPanel
                            onNavigateTo={(view) => handleSetActiveViewWrapper(view as SidebarView)}
                            onAddToApinoxProject={handleAddTrafficToProject}
                        />
                    </Suspense>
                </div>
            )}
            {activeView === SidebarView.MOCK && (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <Suspense fallback={<div style={{ flex: 1, background: 'var(--apinox-editor-background)' }} />}>
                        <RulesAndMockPage />
                    </Suspense>
                </div>
            )}
            {activeView === SidebarView.WATCHER && (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <Suspense fallback={<div style={{ flex: 1, background: 'var(--apinox-editor-background)' }} />}>
                        <FileWatcherPage />
                    </Suspense>
                </div>
            )}
            {/* WorkspaceLayout using WorkspaceContext - no props needed */}
            {activeView !== SidebarView.PROXY && activeView !== SidebarView.MOCK && activeView !== SidebarView.WATCHER && activeView !== SidebarView.NOTES && activeView !== SidebarView.UNIFIED_EXPLORER && (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <WorkspaceContext.Provider value={workspaceContextValue}>
                        <Suspense fallback={<div style={{ flex: 1, background: 'var(--apinox-editor-background)' }} />}>
                            <WorkspaceLayout />
                    </Suspense>
                </WorkspaceContext.Provider>
                </div>
            )}
            {hasOpenedUnifiedExplorer && (
                <div style={{ display: activeView === SidebarView.UNIFIED_EXPLORER ? 'flex' : 'none', flex: 1, overflow: 'hidden', flexDirection: 'column', minHeight: 0 }}>
                    <UnifiedExplorerView
                        projects={unifiedProjects}
                        selectedNode={unifiedSelectedNode}
                        onSelectNode={handleUnifiedSelectNode}
                        onRefreshProject={handleUnifiedRefresh}
                        onNewRequest={handleUnifiedNewRequest}
                        onProjectContentTypeChange={handleUnifiedProjectContentTypeChange}
                        onWsdlLoaded={handleUnifiedWsdlLoaded}
                        onRegisterExecute={registerUnifiedExecute}
                    />
                </div>
            )}
            {activeView === SidebarView.NOTES && (
                <Suspense fallback={<div style={{ flex: 1, background: 'var(--apinox-editor-background)' }} />}>
                    <NotesEditorLazy />
                </Suspense>
            )}
            <Suspense fallback={null}>
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
                            onSave={async (content, config) => {
                                if (isTauri()) {
                                    try {
                                        await bridge.sendMessageAsync({
                                            command: FrontendCommand.SaveSettings,
                                            raw: !config,
                                            content,
                                            config
                                        });
                                        const data: any = await bridge.sendMessageAsync({
                                            command: FrontendCommand.GetSettings
                                        });
                                        bridge.emit({
                                            command: BackendCommand.SettingsUpdate,
                                            config: data?.config ?? data ?? null,
                                            raw: data?.raw,
                                            configDir: data?.configDir,
                                            configPath: data?.configPath
                                        } as any);
                                    } catch (e) {
                                        // fallback to fire-and-forget
                                        bridge.sendMessage({ command: FrontendCommand.SaveSettings, raw: !config, content, config });
                                    }
                                    return;
                                }

                                bridge.sendMessage({ command: 'saveSettings', raw: !config, content, config });
                            }}
                            initialTab={initialSettingsTab}
                        />
                    )
                }
                {
                    showHelp && (
                        <HelpModal
                            initialSectionId={helpSection}
                            onClose={() => {
                                setShowHelp(false);
                                setHelpSection(null);
                            }}
                        />
                    )
                }
                {
                    showDebugModal && (
                        <DebugModal
                            isOpen={showDebugModal}
                            onClose={() => setShowDebugModal(false)}
                        />
                    )
                }
                {
                    addTrafficLog && (
                        <AddToProjectDialog
                            log={addTrafficLog}
                            projects={projects}
                            onConfirm={handleConfirmAddTrafficToProject}
                            onClose={() => setAddTrafficLog(null)}
                        />
                    )
                }
                {
                    exportWorkspaceModal && (
                        <ExportWorkspaceModal
                            isOpen={exportWorkspaceModal}
                            onClose={() => setExportWorkspaceModal(false)}
                            projects={projects}
                            onExport={handleExportWorkspace}
                        />
                    )
                }
                {/* Code snippet modal temporarily disabled during package migration
                    codeSnippetModal.open && codeSnippetModal.request && (
                        <CodeSnippetModal
                            isOpen={codeSnippetModal.open}
                            onClose={() => setCodeSnippetModal({ open: false, request: null })}
                            request={codeSnippetModal.request}
                            environment={config?.activeEnvironment && config?.environments
                                ? config.environments[config.activeEnvironment]
                                : undefined}
                        />
                    )
                */}
                {
                    workflowBuilderModal.open && (
                        <WorkflowBuilderModal
                            isOpen={workflowBuilderModal.open}
                            onClose={() => {
                                console.log('[Workflows] Closing modal');
                                setWorkflowBuilderModal({ open: false, workflow: null, projectPath: null });
                            }}
                            workflow={workflowBuilderModal.workflow || undefined}
                            onSave={handleSaveWorkflow}
                            projects={projects}
                        />
                    )
                }
            </Suspense>
            {
                contextMenu && (
                    <ContextMenu top={contextMenu.y} left={contextMenu.x}>
                        {(contextMenu.type === 'request' || contextMenu.type === 'project' || contextMenu.type === 'folder') && (
                            <ContextMenuItem onClick={handleRename}>Rename</ContextMenuItem>
                        )}
                        {!contextMenu.isExplorer && contextMenu.type === 'request' && (
                            <>
                                <ContextMenuItem onClick={handleCopyUrl}>Copy URL</ContextMenuItem>
                                <ContextMenuItem onClick={handleCopyRequestXml}>Copy Request XML</ContextMenuItem>
                                <ContextMenuItem onClick={handleCopyResponseXml}>Copy Response XML</ContextMenuItem>
                                <ContextMenuItem onClick={handleCloneRequest}>Clone Request</ContextMenuItem>
                                {/* Code snippet temporarily disabled during package migration
                                <ContextMenuItem onClick={() => {
                                    if (contextMenu) {
                                        setCodeSnippetModal({ open: true, request: contextMenu.data as ApiRequest });
                                        closeContextMenu();
                                    }
                                }}>Copy as Code...</ContextMenuItem>
                                */}
                                <ContextMenuItem onClick={() => {
                                    if (contextMenu) {
                                        setAddToTestCaseModal({ open: true, request: contextMenu.data as ApiRequest });
                                        closeContextMenu();
                                    }
                                }}>Add to Test Case</ContextMenuItem>
                                <DangerMenuItem onClick={() => handleDeleteRequest()}>Delete</DangerMenuItem>
                            </>
                        )}
                        {(contextMenu.type === 'operation') && (
                            <>
                                <ContextMenuItem onClick={handleCopyRequestXml}>Copy Request XML</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleGenerateTestSuite(contextMenu.data)}>Generate Test Suite</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleAddRequest()}>Add Request</ContextMenuItem>
                            </>
                        )}
                        {(contextMenu.type === 'interface') && (
                            <>
                                <ContextMenuItem onClick={handleRename}>Rename</ContextMenuItem>
                                <ContextMenuItem onClick={() => handleGenerateTestSuite(contextMenu.data)}>Generate Test Suite</ContextMenuItem>
                            </>
                        )}
                    </ContextMenu>
                )
            }



            {/* Rename Modal */}
            {renameState && (
                <Suspense fallback={null}>
                    <RenameModal
                        isOpen={!!renameState}
                        title={`Rename ${renameState?.type} `}
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
                                            interfaces: p.interfaces.map(i => i === renameState.data ? { ...i, name: value } : i),
                                            dirty: true
                                        };
                                    }
                                    return p;
                                }));
                            } else if (renameState.type === 'folder' || renameState.type === 'request') {
                                // Use helper to handle deep recursion for folders and requests within them
                                setProjects(prev => updateProjectWithRename(
                                    prev,
                                    renameState.data.id || renameState.data.name, // Use ID if available, else name
                                    renameState.type as 'folder' | 'request',
                                    value,
                                    renameState.data
                                ));

                            }

                            setRenameState(null);
                        }}
                    />
                </Suspense>
            )}

            {/* Add to Test Case Modal */}
            {
                addToTestCaseModal.open && addToTestCaseModal.request && (
                    <Suspense fallback={null}>
                        <AddToTestCaseModal
                            projects={projects}
                            onClose={() => setAddToTestCaseModal({ open: false, request: null })}
                            onAdd={(target) => {
                                const req = addToTestCaseModal.request!;
                                const newStep: TestStep = {
                                    id: `step-${Date.now()}`,
                                    name: req.name,
                                    type: 'request',
                                    config: {
                                        request: {
                                            ...req,
                                            id: `req-${Date.now()}`,
                                            // Explicitly preserve requestType and bodyType to prevent defaulting to soap
                                            requestType: req.requestType || 'soap',
                                            bodyType: req.bodyType
                                        },
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
                                                const newCase: TestCase = {
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
                    </Suspense>
                )
            }

            {pickRequestModal.open && (
                <Suspense fallback={null}>
                    <PickRequestModal
                        isOpen={pickRequestModal.open}
                        items={pickRequestItems}
                        title="Add Request to Test Case"
                        onClose={() => setPickRequestModal({ open: false, mode: 'testcase', caseId: null, suiteId: null })}
                        onSelect={(item) => {
                            if (pickRequestModal.mode === 'performance') {
                                const suiteId = pickRequestModal.suiteId;
                                if (!suiteId) return;
                                bridge.emit({
                                    command: BackendCommand.AddOperationToPerformance,
                                    suiteId,
                                    ...(item.type === 'request' ? { request: item.data } : { operation: item.data })
                                });
                                setPickRequestModal({ open: false, mode: 'testcase', caseId: null, suiteId: null });
                                return;
                            }
                            const caseId = pickRequestModal.caseId;
                            if (!caseId) return;
                            bridge.emit({
                                command: BackendCommand.AddStepToCase,
                                caseId,
                                ...(item.type === 'request' ? { request: item.data } : { operation: item.data })
                            });
                            setPickRequestModal({ open: false, mode: 'testcase', caseId: null, suiteId: null });
                        }}
                    />
                </Suspense>
            )}

            {/* Confirmation Modal */}
            {confirmationModal && (
                <Suspense fallback={null}>
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
                </Suspense>
            )}

            {/* Extractor Modal */}
            {extractorModal && (
                <Suspense fallback={null}>
                    <ExtractorModal
                        isOpen={!!extractorModal}
                        data={extractorModal}
                        onClose={() => setExtractorModal(null)}
                        onSave={(data) => {
                            handleSaveExtractor(data);
                            setExtractorModal(null);
                        }}
                    />
                </Suspense>
            )}

            {/* Bulk Import Modal */}
            {showBulkImportModal && (
                <Suspense fallback={null}>
                    <BulkImportModal
                        open={showBulkImportModal}
                        onClose={() => setShowBulkImportModal(false)}
                        existingProjects={projects.filter(p => !p.readOnly).map(p => p.name)}
                        onImportComplete={(results: BulkImportResult[], projectName: string, isNew: boolean) => {
                            // Collect all successful interfaces
                            const successfulInterfaces = results
                                .filter(r => r.success && r.interfaces)
                                .flatMap(r => r.interfaces || []);

                            if (successfulInterfaces.length === 0) return;

                            // Add all interfaces to the project
                            successfulInterfaces.forEach((iface, i) => {
                                addInterfaceToNamedProject(iface, projectName, isNew && i === 0);
                            });

                            // Switch to workspace view
                            setActiveView(SidebarView.PROJECTS);
                        }}
                        onParseUrl={async (url: string) => {
                            const response = await bridge.sendMessageAsync({
                                command: FrontendCommand.LoadWsdl,
                                url
                            });

                            // Convert ApiService[] to ApiInterface[] (same logic as useMessageHandler.ts)
                            const data = response as any[];
                            const newInterfaces: ApiInterface[] = [];

                            if (Array.isArray(data)) {
                                // WSDL Handling: Convert SoapService[] to ApiInterface[]
                                data.forEach((svc: any) => {
                                    // Group operations by Port
                                    const operationsByPort = new Map<string, any[]>();
                                    (svc.operations || []).forEach((op: any) => {
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
                                            definition: url,
                                            expanded: false,
                                            operations: ops.map((op: any) => ({
                                                id: crypto.randomUUID(),
                                                name: op.name,
                                                action: '',
                                                input: op.input,
                                                fullSchema: op.fullSchema,
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
                                                    requestType: 'soap' as const,
                                                    bodyType: 'xml' as const
                                                }]
                                            }))
                                        });
                                    });
                                });
                            } else if (data && (data as any).interfaces) {
                                // OpenAPI Handling: Already correctly formatted
                                newInterfaces.push(...(data as any).interfaces);
                            }

                            return newInterfaces;
                        }}
                    />
                </Suspense>
            )}

            </div>{/* end content-row */}
            </NotesProvider>

            {wsdlDiff && (
                <Suspense fallback={null}>
                    <WsdlSyncModal
                        diff={wsdlDiff}
                        onClose={() => setWsdlDiff(null)}
                        onSync={handleApplyWsdlSync}
                    />
                </Suspense>
            )}

            {/* Import to Performance Suite Modal */}
            {importToPerformanceModal.open && (
                <Suspense fallback={null}>
                    <ImportTestCaseModal
                        open={importToPerformanceModal.open}
                        suiteId={importToPerformanceModal.suiteId}
                        projects={projects}
                        onClose={() => setImportToPerformanceModal({ open: false, suiteId: null })}
                    />
                </Suspense>
            )}
        </Container >
    );
}

export default MainContent;
