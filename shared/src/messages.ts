
export enum FrontendCommand {
    ExecuteRequest = 'executeRequest',
    SaveProject = 'saveProject',
    LoadProject = 'loadProject',
    Log = 'log',
    SaveOpenProjects = 'saveOpenProjects',
    SaveWorkspace = 'saveWorkspace',
    OpenWorkspace = 'openWorkspace',
    ClipboardAction = 'clipboardAction',
    CancelRequest = 'cancelRequest',
    CancelAllRequests = 'cancelAllRequests',
    SaveSettings = 'saveSettings',
    GetSettings = 'getSettings',
    SetActiveEnvironment = 'setActiveEnvironment',
    SaveUiState = 'saveUiState',
    UpdateActiveEnvironment = 'updateActiveEnvironment',
    AutoSaveWorkspace = 'autoSaveWorkspace',
    GetAutosave = 'getAutosave',
    SelectConfigFile = 'selectConfigFile',

    // Commands
    DownloadWsdl = 'downloadWsdl',
    LoadWsdl = 'loadWsdl',
    CancelWsdlLoad = 'cancelWsdlLoad',
    GetLocalWsdls = 'getLocalWsdls',
    SelectLocalWsdl = 'selectLocalWsdl',
    CloseProject = 'closeProject',
    SyncProjects = 'syncProjects', // New command for strict syncing
    RefreshWsdl = 'refreshWsdl',
    ApplyWsdlSync = 'applyWsdlSync',
    BulkImportWsdls = 'bulkImportWsdls',

    // ADO
    AdoStorePat = 'adoStorePat',
    AdoHasPat = 'adoHasPat',
    AdoDeletePat = 'adoDeletePat',
    AdoListProjects = 'adoListProjects',
    AdoTestConnection = 'adoTestConnection',
    AdoAddComment = 'adoAddComment',

    // Test Runner
    RunTestSuite = 'runTestSuite',
    RunTestCase = 'runTestCase',
    GetTestRunUpdates = 'getTestRunUpdates',
    PickOperationForTestCase = 'pickOperationForTestCase',
    UpdateTestStep = 'updateTestStep',

    // Workflow
    ExecuteWorkflow = 'executeWorkflow',
    SaveWorkflow = 'saveWorkflow',
    DeleteWorkflow = 'deleteWorkflow',
    GetWorkflows = 'getWorkflows',

    // Performance
    GetPerformanceSuites = 'getPerformanceSuites',
    AddPerformanceSuite = 'addPerformanceSuite',
    UpdatePerformanceSuite = 'updatePerformanceSuite',
    DeletePerformanceSuite = 'deletePerfomanceSuite',
    AddPerformanceRequest = 'addPerformanceRequest',
    PickOperationForPerformance = 'pickOperationForPerformance',
    UpdatePerformanceRequest = 'updatePerformanceRequest',
    DeletePerformanceRequest = 'deletePerformanceRequest',
    RunPerformanceSuite = 'runPerformanceSuite',
    AbortPerformanceSuite = 'abortPerformanceSuite',
    GetPerformanceHistory = 'getPerformanceHistory',
    GetPerformanceRunUpdates = 'getPerformanceRunUpdates',
    ImportTestSuiteToPerformance = 'importTestSuiteToPerformance',
    ExportPerformanceResults = 'exportPerformanceResults',

    // Schedule
    GetSchedules = 'getSchedules',
    AddSchedule = 'addSchedule',
    UpdateSchedule = 'updateSchedule',
    DeleteSchedule = 'deleteSchedule',
    ToggleSchedule = 'toggleSchedule',

    // Coordinator
    StartCoordinator = 'startCoordinator',
    StopCoordinator = 'stopCoordinator',
    GetCoordinatorStatus = 'getCoordinatorStatus',

    // Request History
    GetHistory = 'getHistory',
    ToggleStarHistory = 'toggleStarHistory',
    DeleteHistoryEntry = 'deleteHistoryEntry',
    ClearHistory = 'clearHistory',
    UpdateHistoryConfig = 'updateHistoryConfig',

    // Attachments
    SelectAttachment = 'selectAttachment',

    // Script Playground
    ExecutePlaygroundScript = 'executePlaygroundScript',

    // Debug/Diagnostics
    GetSidecarLogs = 'getSidecarLogs',
    ClearSidecarLogs = 'clearSidecarLogs',
    GetDebugInfo = 'getDebugInfo',
    OpenFile = 'openFile',
    CheckCertificate = 'checkCertificate',
    CheckCertificateStore = 'checkCertificateStore',
    InstallCertificateToLocalMachine = 'installCertificateToLocalMachine',
    MoveCertificateToLocalMachine = 'moveCertificateToLocalMachine',
    RegenerateCertificate = 'regenerateCertificate',
    ResetCertificates = 'resetCertificates',

    // Workspace Export/Import
    ExportWorkspace = 'exportWorkspace',
    ImportWorkspace = 'importWorkspace',
    DeleteProjectFiles = 'deleteProjectFiles',

    // Scrapbook (API Explorer Quick Requests)
    GetScrapbook = 'getScrapbook',
    AddScrapbookRequest = 'addScrapbookRequest',
    UpdateScrapbookRequest = 'updateScrapbookRequest',
    DeleteScrapbookRequest = 'deleteScrapbookRequest',
}

export enum BackendCommand {
    Log = 'log',
    TestRunnerUpdate = 'testRunnerUpdate',
    PerformanceRunComplete = 'performanceRunComplete',
    PerformanceIterationComplete = 'performanceIterationComplete',
    CoordinatorStatus = 'coordinatorStatus',
    ClipboardText = 'clipboardText',
    SettingsUpdate = 'settingsUpdate',
    Changelog = 'changelog',
    RestoreAutosave = 'restoreAutosave',
    ProjectSaved = 'projectSaved',
    WorkspaceSaved = 'workspaceSaved',
    Response = 'response',
    Error = 'error',
    AddStepToCase = 'addStepToCase',
    AddOperationToPerformance = 'addOperationToPerformance',
    ProjectLoaded = 'projectLoaded',
    WorkspaceLoaded = 'workspaceLoaded',
    EchoResponse = 'echoResponse',
    LocalWsdls = 'localWsdls',
    ConfigFileSelected = 'configFileSelected',
    WsdlRefreshResult = 'wsdlRefreshResult',
    BulkImportProgress = 'bulkImportProgress',
    BulkImportComplete = 'bulkImportComplete',

    // ADO Results
    AdoHasPatResult = 'adoHasPatResult',
    AdoProjectsResult = 'adoProjectsResult',
    AdoTestConnectionResult = 'adoTestConnectionResult',
    AdoAddCommentResult = 'adoAddCommentResult',
    AdoPatStored = 'adoPatStored',
    AdoPatDeleted = 'adoPatDeleted',

    // Performance
    PerformanceRunStarted = 'performanceRunStarted',
    ConfigSwitched = 'configSwitched',
    ConfigRestored = 'configRestored',
    UpdateProxyTarget = 'updateProxyTarget',
    ConfigUpdate = 'configUpdate',

    // Request History
    HistoryLoaded = 'historyLoaded',
    HistoryUpdate = 'historyUpdate',

    // Attachments
    AttachmentSelected = 'attachmentSelected',

    // Script Playground
    PlaygroundScriptResult = 'playgroundScriptResult',

    // UI/Nav
    ToggleSidebar = 'toggleSidebar',
    SwitchToView = 'switchToView',

    // Scrapbook
    ScrapbookLoaded = 'scrapbookLoaded',
    ScrapbookUpdated = 'scrapbookUpdated',

    // Mock/Proxy
    MockHistoryStart = 'mockHistoryStart',
    MockHistoryUpdate = 'mockHistoryUpdate',

    // Unified Explorer
    UnifiedProjectParsed = 'unifiedProjectParsed',
    UnifiedProjectRefreshed = 'unifiedProjectRefreshed',
}
