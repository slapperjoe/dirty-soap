/**
 * WorkspaceContext - Composite context for workspace components
 * 
 * This context combines state from multiple existing contexts (Project, Selection, UI, TestRunner, Performance)
 * into a single unified interface for workspace components. This eliminates the need to pass 80-120 props
 * through component trees when children can access the context directly.
 * 
 * @module WorkspaceContext
 */

import { createContext, useContext } from 'react';
import type {
    ApinoxProject,
    ApiInterface,
    ApiOperation,
    ApiRequest,
    TestSuite,
    TestCase,
    TestStep,
    TestStepType,
    ApinoxConfig,
    SidebarView,
    PerformanceRun,
    Workflow,
    WorkflowStep
} from '@shared/models';

/**
 * Workspace context value interface
 * 
 * Combines state and actions from:
 * - ProjectContext (projects, dirty state, project CRUD)
 * - SelectionContext (selected interface/operation/request/test case)
 * - UIContext (layout mode, editor settings, modals)
 * - TestRunnerContext (test execution handlers)
 * - PerformanceContext (performance suite management)
 */
interface WorkspaceContextValue {
    // ==================== PROJECT STATE ====================
    /** List of all loaded projects */
    projects: ApinoxProject[];
    /** Set of dirty project names (unsaved changes) */
    dirtyProjects: Set<string>;
    /** Currently selected project name */
    selectedProjectName: string | null;

    // ==================== SELECTION STATE - Interface/Operation/Request ====================
    /** Currently selected API interface */
    selectedInterface: ApiInterface | null;
    /** Currently selected operation */
    selectedOperation: ApiOperation | null;
    /** Currently selected request */
    selectedRequest: ApiRequest | null;

    // ==================== SELECTION STATE - Test Cases ====================
    /** Currently selected test suite */
    selectedTestSuite: TestSuite | null;
    /** Currently selected test case */
    selectedTestCase: TestCase | null;
    /** Currently selected test step */
    selectedTestStep: TestStep | null;

    // ==================== SELECTION STATE - Workflows ====================
    /** Currently selected workflow step */
    selectedWorkflowStep: { workflow: any; step: any } | null;

    // ==================== SELECTION STATE - Performance ====================
    /** Currently selected performance suite ID */
    selectedPerformanceSuiteId: string | null;
    /** Performance run history from config */
    performanceHistory: PerformanceRun[];
    /** Current performance progress */
    performanceProgress: { iteration: number; total: number } | null;
    /** Coordinator status for distributed testing */
    coordinatorStatus: { running: boolean; port: number; workers: any[]; expectedWorkers: number };

    // ==================== NAVIGATION STATE ====================
    /** Currently active view in the sidebar */
    activeView: SidebarView;

    // ==================== REQUEST/RESPONSE STATE ====================
    /** Current HTTP response data */
    response: any;
    /** Whether request is currently loading */
    loading: boolean;

    // ==================== UI STATE - Layout & Editor ====================
    /** Layout mode: 'vertical' or 'horizontal' */
    layoutMode: 'vertical' | 'horizontal';
    /** Whether to show line numbers in editor */
    showLineNumbers: boolean;
    /** Split ratio for resizable panels (0.0 to 1.0) */
    splitRatio: number;
    /** Whether resize operation is in progress */
    isResizing: boolean;
    /** Whether to show inline element values */
    inlineElementValues: boolean;
    /** Set inline element values state */
    setInlineElementValues: React.Dispatch<React.SetStateAction<boolean>>;
    /** Whether to hide causality data */
    hideCausalityData: boolean;
    /** Set hide causality data state */
    setHideCausalityData: React.Dispatch<React.SetStateAction<boolean>>;

    // ==================== CONFIG STATE ====================
    /** Application configuration */
    config: ApinoxConfig | null;
    /** Default endpoint from config */
    defaultEndpoint: string;
    /** Whether workspace is in read-only mode */
    isReadOnly: boolean;
    /** Whether backend connection is active */
    backendConnected: boolean;

    // ==================== ACTIONS - Project Management ====================
    /** Add a new project to the workspace */
    addProject: (project: ApinoxProject) => void;
    /** Update an existing project (replaces old with new) */
    updateProject: (oldProject: ApinoxProject, newProject: ApinoxProject) => void;
    /** Low-level setter for projects array (use sparingly) */
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    /** Close a project and remove from workspace */
    closeProject: (projectName: string) => void;
    /** Mark a project as dirty (has unsaved changes) */
    setDirty: (projectName: string, isDirty: boolean) => void;
    /** Save a project to disk */
    saveProject: (projectName: string) => Promise<void>;

    // ==================== ACTIONS - Selection ====================
    /** Select an API interface */
    selectInterface: (apiInterface: ApiInterface | null) => void;
    /** Select an operation */
    selectOperation: (operation: ApiOperation | null) => void;
    /** Select a request */
    selectRequest: (request: ApiRequest | null) => void;
    /** Select a test suite */
    selectTestSuite: (suite: TestSuite | null) => void;
    /** Select a test case */
    selectTestCase: (testCase: TestCase | null) => void;
    /** Select a test step */
    selectTestStep: (step: TestStep | null) => void;
    
    // ==================== ACTIONS - Workflow ====================
    /** Select a workflow step */
    selectWorkflowStep: (step: { workflow: any; step: any } | null) => void;
    /** Execute an HTTP/SOAP request */
    executeRequest: (xml: string) => void;
    /** Cancel a running request */
    cancelRequest: () => void;
    /** Update request data */
    updateRequest: (updated: ApiRequest) => void;
    /** Reset request to default state */
    resetRequest: () => void;

    // ==================== ACTIONS - UI ====================
    /** Toggle between vertical and horizontal layout */
    toggleLayout: () => void;
    /** Set layout mode explicitly */
    setLayoutMode: (mode: 'vertical' | 'horizontal') => void;
    /** Toggle line numbers visibility */
    toggleLineNumbers: () => void;
    /** Set line numbers visibility */
    setShowLineNumbers: (show: boolean) => void;
    /** Update split ratio for resizable panels */
    setSplitRatio: (ratio: number) => void;
    /** Set resize in-progress state */
    setIsResizing: (resizing: boolean) => void;

    // ==================== ACTIONS - Test Runner ====================
    /** Add assertion to test step */
    handleAddAssertion: (data: { xpath: string, expectedContent: string }) => void;
    /** Run a single test case */
    handleRunTestCase: (caseId: string) => void;
    /** Run all test cases in a suite */
    handleRunTestSuite: (suiteId: string) => void;
    
    // ==================== ACTIONS - Test Step Management ====================
    /** Update a test step */
    updateTestStep: (step: TestStep) => void;
    /** Delete a test step */
    deleteTestStep: (stepId: string) => void;
    /** Move a test step up or down */
    moveTestStep: (stepId: string, direction: 'up' | 'down') => void;
    /** Add a new step to test case */
    addTestStep: (testCaseId: string, type: TestStepType) => void;
    /** Navigate back to test case view */
    backToTestCase: () => void;
    /** Open step request in editor */
    openStepRequest: (request: ApiRequest) => void;
    // ==================== ACTIONS - Performance ====================
    /** Add a new performance suite */
    handleAddPerformanceSuite: (suiteName: string) => void;
    /** Delete a performance suite */
    handleDeletePerformanceSuite: (id: string) => void;
    /** Add a request to performance suite (opens picker UI in Tauri mode) */
    handleAddPerformanceRequest: (suiteId: string) => void;
    /** Delete a request from performance suite */
    handleDeletePerformanceRequest: (suiteId: string, requestId: string) => void;
    /** Update a performance request */
    handleUpdatePerformanceRequest: (suiteId: string, requestId: string, updates: Partial<any>) => void;
    /** Select a performance request */
    handleSelectPerformanceRequest: (request: any) => void;
    /** Run a performance suite */
    handleRunPerformanceSuite: (suiteId: string) => Promise<void>;
    /** Stop a performance run */
    handleStopPerformanceRun: () => void;
    /** Select a performance suite */
    handleSelectPerformanceSuite: (id: string) => void;
    /** Update a performance suite */
    handleUpdatePerformanceSuite: (suite: any) => void;
    /** Start coordinator for distributed testing */
    handleStartCoordinator: (port: number, expectedWorkers: number) => void;
    /** Stop coordinator */
    handleStopCoordinator: () => void;

    // ==================== STATE - Test Execution ====================
    /** Test execution state tracking */
    testExecution: Record<string, Record<string, any>>;
    // ==================== ACTIONS - Extractor & Assertion ====================
    /** Add an extractor from response selection */
    handleAddExtractor: (data: { xpath: string; value: string; source: 'body' | 'header' }) => void;
    /** Add an existence assertion from response selection */
    handleAddExistenceAssertion: (data: { xpath: string }) => void;
    /** Open import-from-workspace dialog for a performance suite */
    onImportFromWorkspace: (suiteId: string) => void;
    // ==================== ACTIONS - Workflow ====================
    /** Update an entire workflow */
    updateWorkflow: (workflow: Workflow) => void;
    /** Update a single step within a workflow */
    updateWorkflowStep: (workflow: Workflow, step: WorkflowStep) => void;
}

// Create the context
const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

/**
 * Custom hook for consuming WorkspaceContext
 * 
 * @returns WorkspaceContextValue with all workspace state and actions
 * @throws Error if used outside WorkspaceProvider
 * 
 * @example
 * ```typescript
 * function MyComponent() {
 *     const { projects, selectedInterface, executeRequest } = useWorkspace();
 *     // Use workspace state directly without props
 * }
 * ```
 */
export const useWorkspace = (): WorkspaceContextValue => {
    const context = useContext(WorkspaceContext);
    if (!context) {
        throw new Error('useWorkspace must be used within a WorkspaceProvider');
    }
    return context;
};

export { WorkspaceContext };
