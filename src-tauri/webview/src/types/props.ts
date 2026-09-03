import {
    ApinoxProject,
    ApiInterface,
    ApiOperation,
    ApiRequest,
    TestCase,
    TestStep,
    TestStepType,
    // WatcherEvent, // Removed - watcher features moved to APIprox
    // MockConfig, // Removed - mock features moved to APIprox
    // MockRule, // Removed - mock features moved to APIprox
    // MockEvent, // Removed - mock features moved to APIprox
    PerformanceSuite,
    RequestHistoryEntry,
    Workflow,
    WorkflowStep,
    UnifiedProject,
    // SidebarView
} from '@shared/models';

// ============================================================================
// SIDEBAR PROP GROUPS
// ============================================================================
// Phase B (t_86c34d38): SidebarProjectProps / SidebarSelectionProps (the
// PROJECTS view's ProjectList + selection state) were deleted with the view.

export interface SidebarTestsProps {
    // Phase B (t_86c34d38): the TESTS suite tree renders from the UNIFIED
    // store (test suites relocated to UnifiedProject.testSuites).
    projects: UnifiedProject[];
    selectedTestSuite?: import('@shared/models').TestSuite | null;
    selectedTestCase?: TestCase | null;
    onAddSuite: (projectName: string) => void;
    onDeleteSuite: (suiteId: string) => void;
    onRunSuite: (suiteId: string) => void;
    onAddTestCase: (suiteId: string) => void;
    onDeleteTestCase: (caseId: string) => void;
    onRenameTestCase?: (caseId: string, newName: string) => void;
    onRunCase: (caseId: string) => void;
    onSelectSuite: (suiteId: string) => void;
    onSelectTestCase: (caseId: string) => void;
    onSelectTestStep?: (caseId: string, stepId: string) => void;
    onRenameTestStep?: (caseId: string, stepId: string, newName: string) => void;
    onToggleSuiteExpand: (suiteId: string) => void;
    onToggleCaseExpand: (caseId: string) => void;
    deleteConfirm: string | null;
}

export interface SidebarWorkflowsProps {
    workflows: Workflow[];
    onAdd: () => void;
    onEdit: (workflow: Workflow) => void;
    onRun: (workflow: Workflow) => void;
    onDelete: (workflow: Workflow) => void;
    onDuplicate: (workflow: Workflow) => void;
    onSelect?: (workflow: Workflow) => void;
    onSelectStep: (workflow: Workflow, step: WorkflowStep) => void;
}

export interface SidebarPerformanceProps {
    suites: import('@shared/models').PerformanceSuite[];
    onAddSuite: (name: string) => void;
    onDeleteSuite: (id: string) => void;
    onRunSuite: (id: string) => void;
    onSelectSuite: (id: string) => void;
    onStopRun: () => void;
    isRunning: boolean;
    activeRunId?: string;
    selectedSuiteId?: string;
    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;
    // Request handlers
    onAddRequest?: (suiteId: string) => void;
    onDeleteRequest?: (suiteId: string, requestId: string) => void;
    onSelectRequest?: (req: import('@shared/models').PerformanceRequest) => void;
    onUpdateRequest?: (suiteId: string, requestId: string, updates: Partial<import('@shared/models').PerformanceRequest>) => void;
    onToggleSuiteExpand?: (suiteId: string) => void;
    expandedSuiteIds?: string[];
}

export interface SidebarHistoryProps {
    history: RequestHistoryEntry[];
    onReplay: (entry: RequestHistoryEntry) => void;
    onToggleStar: (id: string) => void;
    onDelete: (id: string) => void;
}

export interface SidebarUnifiedProps {
    projects: UnifiedProject[];
    selectedNode: { type: string; id: string } | null;
    onSelectNode: (type: string, id: string) => void;
    onRefreshProject: (projectName: string) => void;
    onDeleteProject: (projectName: string) => void;
    onDeleteOperation: (projectName: string, operationName: string) => void;
    onDeleteRequest: (projectName: string, operationName: string, requestName: string) => void;
    onNewRequest: (projectName: string, operationName: string) => void;
    /** R-10 (F-17): context-menu rename (display-only `displayName` override). */
    onRenameProject?: (projectName: string, displayName: string) => Promise<void>;
    onRenameOperation?: (projectName: string, operationName: string, displayName: string) => Promise<void>;
    onRenameRequest?: (projectName: string, operationName: string, requestName: string, displayName: string) => Promise<void>;
    onExportProject: (projectName: string) => void;
    /**
     * Phase B (t_86c34d38): relocated from the deleted PROJECTS view
     * (ProjectList "Import & Export" header menu) onto the unified sidebar
     * context menu. The flows still write the legacy nested model (a follow-up
     * card converts them to the flat unified model).
     */
    onExportWorkspace?: () => void;
    onBulkImport?: () => void;
    onImportSoapUI?: () => void;
    /** Phase B (t_86c34d38): relocated "Generate Test Suite" (PROJECTS-view context menu). */
    onGenerateTestSuite?: (target: import('@shared/models').ApiOperation) => void;
    /** Phase B (t_86c34d38): relocated "Add to Test Case" (legacy shared context menu). */
    onAddRequestToTestCase?: (request: import('@shared/models').ApiRequest) => void;
    onReorderOperation: (projectName: string, fromIndex: number, toIndex: number) => void;
    onReorderRequest: (projectName: string, operationName: string, fromIndex: number, toIndex: number) => void;
    /** F-01 / R-05 — Quick Requests (scrapbook) bottom section (Q1(a)). */
    scrapbook?: {
        requests: import('@shared/models').ScrapbookRequest[];
        selectedRequest: import('@shared/models').ScrapbookRequest | null;
        loading: boolean;
        onCreateRequest: () => void;
        onSelectRequest: (request: import('@shared/models').ScrapbookRequest) => void;
        onDeleteRequest: (id: string) => void;
        onExecuteRequest: (request: import('@shared/models').ScrapbookRequest) => void;
    };
}

// ============================================================================
// WORKSPACE PROP GROUPS
// ============================================================================

export interface WorkspaceSelectionState {
    project?: import('@shared/models').ApinoxProject | null;
    interface?: import('@shared/models').ApiInterface | null;
    request: ApiRequest | null;
    operation: ApiOperation | null;
    testSuite?: import('@shared/models').TestSuite | null;
    testCase?: TestCase | null;
    testStep?: TestStep | null;
    performanceSuite?: PerformanceSuite | null;
    workflowStep?: { workflow: import('@shared/models').Workflow; step: import('@shared/models').WorkflowStep } | null;
}

export interface WorkspaceRequestActions {
    onExecute: (xml: string) => void;
    onCancel: () => void;
    onUpdate: (req: ApiRequest) => void;
    onReset: () => void;
    response: any;
    loading: boolean;
}

export interface WorkspaceViewState {
    activeView: import('@shared/models').SidebarView;
    layoutMode: 'vertical' | 'horizontal';
    showLineNumbers: boolean;
    splitRatio: number;
    isResizing: boolean;
    onToggleLayout: () => void;
    onToggleLineNumbers: () => void;
    onStartResizing: () => void;
    inlineElementValues?: boolean;
    onToggleInlineElementValues?: () => void;
    hideCausalityData?: boolean;
    onToggleHideCausalityData?: () => void;
}

export interface WorkspaceConfigState {
    config?: any;
    defaultEndpoint?: string;
    changelog?: string;
    onChangeEnvironment?: (env: string) => void;
    isReadOnly?: boolean;
    backendConnected?: boolean;
}

export interface WorkspaceStepActions {
    onRunTestCase?: (caseId: string) => void;
    onOpenStepRequest?: (req: ApiRequest) => void;
    onBackToCase?: () => void;
    onAddStep?: (caseId: string, type: TestStepType) => void;
    testExecution?: Record<string, Record<string, { status: 'running' | 'pass' | 'fail', error?: string, response?: any }>>;
    onUpdateStep?: (step: TestStep) => void;
    onSelectStep?: (step: TestStep | null) => void;
    onDeleteStep?: (stepId: string) => void;
    onMoveStep?: (stepId: string, direction: 'up' | 'down') => void;
}

export interface WorkspaceToolsActions {
    onAddExtractor?: (data: { xpath: string, value: string, source: 'body' | 'header' }) => void;
    onEditExtractor?: (extractor: import('@shared/models').RequestExtractor, index: number) => void;
    onAddAssertion?: (data: { xpath: string, expectedContent: string }) => void;
    onAddExistenceAssertion?: (data: { xpath: string }) => void;
    // onAddReplaceRule?: (data: { xpath: string, matchText: string, target: 'request' | 'response' }) => void; // Removed - proxy features
    // onAddMockRule?: (rule: import('@shared/models').MockRule) => void; // Removed - mock features
    onOpenDevOps?: () => void;
    // onOpenCodeSnippet?: (request: ApiRequest) => void; // Temporarily disabled during package migration
}

export interface WorkspacePerformanceActions {
    onUpdateSuite?: (suite: import('@shared/models').PerformanceSuite) => void;
    onAddPerformanceRequest?: (suiteId: string) => void;
    onDeletePerformanceRequest?: (suiteId: string, requestId: string) => void;
    onSelectPerformanceRequest?: (request: import('@shared/models').PerformanceRequest) => void;
    onUpdatePerformanceRequest?: (suiteId: string, requestId: string, updates: Partial<import('@shared/models').PerformanceRequest>) => void;
    onImportFromWorkspace?: (suiteId: string) => void;
    onRunSuite?: (id: string) => void;
    onStopRun?: () => void;
    performanceProgress?: { iteration: number; total: number } | null;
    performanceHistory?: import('@shared/models').PerformanceRun[];
    onBackToSuite?: () => void;
}

export interface WorkspaceBreakpointState {
    activeBreakpoint: {
        id: string;
        type: 'request' | 'response';
        content: string;
        headers?: Record<string, any>;
        breakpointName: string;
        timeoutMs: number;
        startTime: number;
    } | null;
    onResolve: (modifiedContent: string, cancelled?: boolean) => void;
}

export interface NavigationActions {
    onSelectProject: (project: import('@shared/models').ApinoxProject) => void;
    onSelectInterface: (iface: import('@shared/models').ApiInterface) => void;
    onSelectOperation: (operation: import('@shared/models').ApiOperation) => void;
    onSelectRequest: (request: ApiRequest) => void;
    onSelectTestCase: (testCase: TestCase) => void;
    onSelectWorkflowStep?: (workflow: Workflow, step: WorkflowStep) => void;
    onUpdateWorkflowStep?: (workflow: Workflow, step: WorkflowStep) => void;
    onUpdateWorkflow?: (workflow: Workflow) => void;
    onRunWorkflow?: (workflow: Workflow) => void;
    onEditWorkflow?: (workflow: Workflow) => void;
}

// Explorer state for the main view is now owned by the unified explorer (F-31)
export interface WorkspaceLayoutProps extends WorkspacePerformanceActions {
    selectionState: WorkspaceSelectionState;
    requestActions: WorkspaceRequestActions;
    viewState: WorkspaceViewState;
    configState: WorkspaceConfigState;
    stepActions: WorkspaceStepActions;
    toolsActions: WorkspaceToolsActions;
    breakpointState?: WorkspaceBreakpointState;
    navigationActions?: NavigationActions;
    // Coordinator props for distributed workers
    coordinatorStatus?: import('@shared/models').CoordinatorStatus;
    onStartCoordinator?: (port: number, expectedWorkers: number) => void;
    onStopCoordinator?: () => void;
    // For breadcrumb resolution
    projects?: import('@shared/models').ApinoxProject[];
    setProjects?: React.Dispatch<React.SetStateAction<import('@shared/models').ApinoxProject[]>>;
}
