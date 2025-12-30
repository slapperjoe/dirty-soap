import {
    SoapUIProject,
    SoapUIInterface,
    SoapUIOperation,
    SoapUIRequest,
    SoapTestCase,
    SoapTestStep,
    TestStepType,
    WatcherEvent,
    // SidebarView
} from '../models';

// ============================================================================
// SIDEBAR PROP GROUPS
// ============================================================================

export interface SidebarProjectProps {
    projects: SoapUIProject[];
    savedProjects: Set<string>;
    loadProject: () => void;
    saveProject: (proj: SoapUIProject) => void;
    closeProject: (name: string) => void;
    onAddProject: () => void;
    toggleProjectExpand: (name: string) => void;
    toggleInterfaceExpand: (projName: string, ifaceName: string) => void;
    toggleOperationExpand: (projName: string, ifaceName: string, opName: string) => void;
    onDeleteInterface?: (iface: SoapUIInterface) => void;
    onDeleteOperation?: (op: SoapUIOperation, iface: SoapUIInterface) => void;
}

export interface SidebarExplorerProps {
    exploredInterfaces: SoapUIInterface[];
    explorerExpanded: boolean;
    toggleExplorerExpand: () => void;
    addToProject: (iface: SoapUIInterface) => void;
    addAllToProject: () => void;
    clearExplorer: () => void;
    removeFromExplorer: (iface: SoapUIInterface) => void;
    toggleExploredInterface: (iName: string) => void;
    toggleExploredOperation: (iName: string, oName: string) => void;
}

export interface SidebarWsdlProps {
    inputType: 'url' | 'file';
    setInputType: (type: 'url' | 'file') => void;
    wsdlUrl: string;
    setWsdlUrl: (url: string) => void;
    selectedFile: string | null;
    loadWsdl: () => void;
    pickLocalWsdl: () => void;
    downloadStatus: string[] | null;
}

export interface SidebarSelectionProps {
    selectedProjectName: string | null;
    setSelectedProjectName: (name: string | null) => void;
    selectedInterface: SoapUIInterface | null;
    setSelectedInterface: (iface: SoapUIInterface | null) => void;
    selectedOperation: SoapUIOperation | null;
    setSelectedOperation: (op: SoapUIOperation | null) => void;
    selectedRequest: SoapUIRequest | null;
    setSelectedRequest: (req: SoapUIRequest | null) => void;
    setResponse: (res: any) => void;
    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
    onAddRequest?: (op: SoapUIOperation) => void;
    onDeleteRequest?: (req: SoapUIRequest) => void;
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

// ============================================================================
// WORKSPACE PROP GROUPS
// ============================================================================

export interface WorkspaceSelectionState {
    request: SoapUIRequest | null;
    operation: SoapUIOperation | null;
    testCase?: SoapTestCase | null;
    testStep?: SoapTestStep | null;
}

export interface WorkspaceRequestActions {
    onExecute: (xml: string) => void;
    onCancel: () => void;
    onUpdate: (req: SoapUIRequest) => void;
    onReset: () => void;
    response: any;
    loading: boolean;
}

export interface WorkspaceViewState {
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
    onOpenStepRequest?: (req: SoapUIRequest) => void;
    onBackToCase?: () => void;
    onAddStep?: (caseId: string, type: TestStepType) => void;
    testExecution?: Record<string, Record<string, { status: 'running' | 'pass' | 'fail', error?: string, response?: any }>>;
    onUpdateStep?: (step: SoapTestStep) => void;
    onSelectStep?: (step: SoapTestStep | null) => void;
    onDeleteStep?: (stepId: string) => void;
    onMoveStep?: (stepId: string, direction: 'up' | 'down') => void;
}

export interface WorkspaceToolsActions {
    onAddExtractor?: (data: { xpath: string, value: string, source: 'body' | 'header' }) => void;
    onAddAssertion?: (data: { xpath: string, expectedContent: string }) => void;
    onAddExistenceAssertion?: (data: { xpath: string }) => void;
    onAddReplaceRule?: (data: { xpath: string, matchText: string, target: 'request' | 'response' }) => void;
    onOpenDevOps?: () => void;
}
