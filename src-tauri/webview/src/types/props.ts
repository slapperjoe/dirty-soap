import {
    ApinoxProject,
    ApiInterface,
    ApiOperation,
    ApiRequest,
    TestCase,
    TestStep,
    TestStepType,
    WatcherEvent,
    MockConfig,
    MockRule,
    MockEvent,
    PerformanceSuite,
    RequestHistoryEntry
    // SidebarView
} from '@shared/models';

// ============================================================================
// SIDEBAR PROP GROUPS
// ============================================================================

export interface SidebarProjectProps {
    projects: ApinoxProject[];
    savedProjects: Set<string>;
    loadProject: () => void;
    saveProject: (project: ApinoxProject) => void;
    onUpdateProject: (oldProject: ApinoxProject, newProject: ApinoxProject) => void;
    closeProject: (name: string) => void;
    onAddProject: () => void;
    toggleProjectExpand: (name: string) => void;
    toggleInterfaceExpand: (projName: string, ifaceName: string) => void;
    toggleOperationExpand: (projName: string, ifaceName: string, opName: string) => void;
    expandAll: () => void;
    collapseAll: () => void;
    onDeleteInterface?: (iface: ApiInterface) => void;
    onDeleteOperation?: (op: ApiOperation, iface: ApiInterface) => void;
    // Folder handlers
    onAddFolder?: (projectName: string, parentFolderId?: string) => void;
    onAddRequestToFolder?: (projectName: string, folderId: string) => void;
    onDeleteFolder?: (projectName: string, folderId: string) => void;
    onToggleFolderExpand?: (projectName: string, folderId: string) => void;
    onRefreshInterface?: (projectName: string, iface: ApiInterface) => void;
    onExportWorkspace?: () => void;
}

export interface SidebarExplorerProps {
    exploredInterfaces: ApiInterface[];
    explorerExpanded: boolean;
    toggleExplorerExpand: () => void;
    addToProject: (iface: ApiInterface) => void;
    addAllToProject: () => void;
    clearExplorer: () => void;
    removeFromExplorer: (iface: ApiInterface) => void;
    toggleExploredInterface: (iName: string) => void;
    toggleExploredOperation: (iName: string, oName: string) => void;
}

export interface SidebarWsdlProps {
    inputType: 'url' | 'file';
    setInputType: (type: 'url' | 'file') => void;
    wsdlUrl: string;
    setWsdlUrl: (url: string) => void;
    wsdlUrlHistory?: string[];
    selectedFile: string | null;
    loadWsdl: () => void;
    pickLocalWsdl: () => void;
    downloadStatus: string[] | null;
    useProxy?: boolean;
    setUseProxy?: (useProxy: boolean) => void;
}

export interface SidebarSelectionProps {
    selectedProjectName: string | null;
    setSelectedProjectName: (name: string | null) => void;
    selectedInterface: ApiInterface | null;
    setSelectedInterface: (iface: ApiInterface | null) => void;
    selectedOperation: ApiOperation | null;
    setSelectedOperation: (op: ApiOperation | null) => void;
    selectedRequest: ApiRequest | null;
    setSelectedRequest: (req: ApiRequest | null) => void;
    setResponse: (res: any) => void;
    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
    onAddRequest?: (op: ApiOperation) => void;
    onDeleteRequest?: (req: ApiRequest) => void;
    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;
}

export interface SidebarTestRunnerProps {
    onAddSuite: (projectName: string) => void;
    onDeleteSuite: (suiteId: string) => void;
    onRunSuite: (suiteId: string) => void;
    onAddTestCase: (suiteId: string) => void;
    onRunCase: (caseId: string) => void;
    onDeleteTestCase: (caseId: string) => void;
    onRenameTestCase?: (caseId: string, newName: string) => void;
    onSelectSuite?: (suiteId: string) => void;
    onSelectTestCase?: (caseId: string) => void;
    onToggleSuiteExpand?: (suiteId: string) => void;
    onToggleCaseExpand?: (caseId: string) => void;
}

export interface SidebarWatcherProps {
    history: WatcherEvent[];
    onSelectEvent: (event: WatcherEvent) => void;
    isRunning: boolean;
    onStart: () => void;
    onStop: () => void;
    onClear: () => void;
}

export interface SidebarProxyProps {
    isRunning: boolean;
    onStart: () => void;
    onStop: () => void;
    config: { port: number, target: string, systemProxyEnabled?: boolean };
    onUpdateConfig: (config: { port: number, target: string, systemProxyEnabled?: boolean }) => void;
    history: any[]; // ProxyEvent type
    onClear: () => void;
    configPath: string | null;
    onSelectConfigFile: () => void;
    onOpenCertificate: () => void;
    onSaveHistory: (content: string) => void;
    onInject: () => void;
    onRestore: () => void;
    // Breakpoints
    breakpoints?: any[]; // Breakpoint[]
    onUpdateBreakpoints?: (breakpoints: any[]) => void;
}

export interface SidebarTestsProps {
    projects: ApinoxProject[];
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

export interface SidebarMockProps {
    isRunning: boolean;
    config: MockConfig;
    history: MockEvent[];
    onStart: () => void;
    onStop: () => void;
    onUpdateConfig: (config: Partial<MockConfig>) => void;
    onClear: () => void;
    onSelectEvent: (event: MockEvent) => void;

    // Rule management
    rules: MockRule[];
    onAddRule: (rule: MockRule) => void;
    onUpdateRule: (id: string, updates: Partial<MockRule>) => void;
    onDeleteRule: (id: string) => void;
    onToggleRule: (id: string, enabled: boolean) => void;
    onEditRule?: (rule: MockRule) => void;
}

export interface SidebarServerProps {
    serverConfig: import('@shared/models').ServerConfig;
    isRunning: boolean;

    onModeChange: (mode: import('@shared/models').ServerMode) => void;
    onStart: () => void;
    onStop: () => void;
    onOpenSettings: () => void;

    // Combined traffic
    proxyHistory: WatcherEvent[];
    mockHistory: MockEvent[];
    onSelectProxyEvent: (event: WatcherEvent) => void;
    onSelectMockEvent: (event: MockEvent) => void;
    selectedEventId?: string;
    onClearHistory: () => void;

    // Mock Rules (mode = mock or both)
    mockRules?: MockRule[];
    onAddMockRule?: (rule: MockRule) => void;
    onDeleteMockRule?: (id: string) => void;
    onToggleMockRule?: (id: string, enabled: boolean) => void;

    // Breakpoints (mode = proxy or both)
    breakpoints?: import('../components/modals/BreakpointModal').Breakpoint[];
    onUpdateBreakpoints?: (breakpoints: import('../components/modals/BreakpointModal').Breakpoint[]) => void;

    // Certificate
    onOpenCertificate?: () => void;
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
    onAddReplaceRule?: (data: { xpath: string, matchText: string, target: 'request' | 'response' }) => void;
    onAddMockRule?: (rule: import('@shared/models').MockRule) => void;
    onOpenDevOps?: () => void;
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
}

// Explorer State for Main View
export interface WorkspaceExplorerState {
    inputType: 'url' | 'file';
    setInputType: (type: 'url' | 'file') => void;
    wsdlUrl: string;
    setWsdlUrl: (url: string) => void;
    loadWsdl: (url: string, type: 'url' | 'file') => Promise<void>;
    downloadStatus: 'idle' | 'loading' | 'success' | 'error'; // simplified from string array
    onClearSelection: () => void;
}

export interface WorkspaceLayoutProps extends WorkspacePerformanceActions {
    selectionState: WorkspaceSelectionState;
    requestActions: WorkspaceRequestActions;
    viewState: WorkspaceViewState;
    configState: WorkspaceConfigState;
    explorerState?: WorkspaceExplorerState;
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
}
