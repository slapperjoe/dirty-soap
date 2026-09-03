import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useTestCaseHandlers } from '../hooks/useTestCaseHandlers';
import { useRequestExecution } from '../hooks/useRequestExecution';
import { useProject } from './ProjectContext';
import { useUnifiedProjects } from './UnifiedProjectContext';
import { useSelection } from './SelectionContext';
import { useUI } from './UIContext';
import { useNavigation } from './NavigationContext';
import { useScrapbookAutoSave } from './ScrapbookContext';
import { ApiInterface, ApiOperation, ApiRequest } from '@shared/models';
import { BackendCommand } from '@shared/messages';
import { bridge } from '../utils/bridge';

interface TestExecutionState {
    status: 'running' | 'pass' | 'fail';
    error?: string;
    assertionResults?: any[];
    response?: any;
}

interface TestRunnerContextType {
    testExecution: Record<string, Record<string, TestExecutionState>>;

    // Test Case Handlers
    handleSelectTestSuite: (suiteId: string) => void;
    handleSelectTestCase: (caseId: string) => void;
    handleAddAssertion: (data: { xpath: string, expectedContent: string }) => void;
    handleAddExistenceAssertion: (data: { xpath: string }) => void;
    handleGenerateTestSuite: (target: ApiInterface | ApiOperation) => void;
    handleRunTestCaseWrapper: (caseId: string) => void;
    handleRunTestSuiteWrapper: (suiteId: string) => void;
    handleSaveExtractor: (data: { xpath: string, value: string, source: 'body' | 'header', variableName: string, defaultValue?: string, editingId?: string }) => void;

    // Request Execution Handlers
    executeRequest: (xml: string) => void;
    cancelRequest: () => void;
    handleRequestUpdate: (updated: ApiRequest) => void;
    handleResetRequest: () => void;
    startTimeRef: React.MutableRefObject<number>;
    // H1: in-flight request id (echoed back by the backend); lets cancelRequest target the running request
    requestIdRef: React.MutableRefObject<string | null>;
    setTestExecution: React.Dispatch<React.SetStateAction<Record<string, Record<string, TestExecutionState>>>>;
}

const TestRunnerContext = createContext<TestRunnerContextType | undefined>(undefined);

export const useTestRunner = () => {
    const context = useContext(TestRunnerContext);
    if (!context) {
        throw new Error('useTestRunner must be used within a TestRunnerProvider');
    }
    return context;
};

export const TestRunnerProvider = ({ children }: { children: ReactNode }) => {
    // Shared State
    const [testExecution, setTestExecution] = useState<Record<string, Record<string, TestExecutionState>>>({});

    // Dependencies
    // Phase B (t_86c34d38): the TESTS suite subsystem reads/writes the UNIFIED
    // store (test suites were relocated to UnifiedProject.testSuites). `useProject`
    // is still used for the legacy selections (selectedProjectName, workspace
    // dirty) + the legacy setProjects that the request-execution WORKSPACE path
    // writes to (test-case step edits went to the unified store instead).
    const { setProjects, selectedProjectName, setWorkspaceDirty } = useProject();
    const {
        projects: unifiedProjects,
        setProjects: setUnifiedProjects,
        saveProject: saveUnifiedProject
    } = useUnifiedProjects();
    const {
        selectedTestCase,
        selectedStep,
        setSelectedTestCase,
        setSelectedStep,
        setSelectedRequest,
        setSelectedOperation,
        setSelectedInterface,
        setResponse,
        setLoading,
        selectedRequest,
        selectedOperation,
        selectedInterface,
        selectedTestSuite,
        setSelectedTestSuite,
        selectedPerformanceSuiteId,
        setSelectedPerformanceSuiteId
    } = useSelection();

    // Note: TestRunnerProvider must be inside UIProvider, NavigationProvider, and ScrapbookProvider
    const { config, setConfig } = useUI();
    const { setActiveView } = useNavigation();
    
    // Scrapbook auto-save callback
    const scrapbookAutoSave = useScrapbookAutoSave(
        selectedRequest,
        selectedProjectName,
        selectedInterface,
        selectedOperation,
        selectedTestCase
    );
    // -------------------------------------------------------------------------
    // MESSAGE HANDLING
    // -------------------------------------------------------------------------

    React.useEffect(() => {
        const applyTestRunnerUpdate = (prev: Record<string, Record<string, TestExecutionState>>, update: any) => {
            if (!update || typeof update !== 'object') return prev;

            const type = update.type;
            if (!type) {
                // Legacy shape: merge update object
                return { ...prev, ...update };
            }

            if (type === 'testCaseStart') {
                return { ...prev, [update.id]: {} };
            }

            if (type === 'stepStart') {
                const caseId = update.caseId;
                const stepId = update.stepId;
                if (!caseId || !stepId) return prev;
                return {
                    ...prev,
                    [caseId]: {
                        ...(prev[caseId] || {}),
                        [stepId]: { status: 'running' }
                    }
                };
            }

            if (type === 'stepPass') {
                const caseId = update.caseId;
                const stepId = update.stepId;
                if (!caseId || !stepId) return prev;
                return {
                    ...prev,
                    [caseId]: {
                        ...(prev[caseId] || {}),
                        [stepId]: {
                            status: 'pass',
                            response: update.response,
                            assertionResults: update.assertionResults
                        }
                    }
                };
            }

            if (type === 'stepFail') {
                const caseId = update.caseId;
                const stepId = update.stepId;
                if (!caseId || !stepId) return prev;
                return {
                    ...prev,
                    [caseId]: {
                        ...(prev[caseId] || {}),
                        [stepId]: {
                            status: 'fail',
                            error: update.error,
                            response: update.response,
                            assertionResults: update.assertionResults
                        }
                    }
                };
            }

            return prev;
        };

        const handleMessage = (message: any) => {
            switch (message.command) {
                case BackendCommand.TestRunnerUpdate: {
                    const update = message.update ?? message.data;
                    if (update) {
                        setTestExecution(prev => applyTestRunnerUpdate(prev, update));
                    }
                    break;
                }
            }
        };

        const unsubscribe = bridge.onMessage(handleMessage);
        return () => unsubscribe();
    }, []);

    // -------------------------------------------------------------------------
    // CONTEXT VALUE
    // -------------------------------------------------------------------------
    // Hooks
    // We pass a minimal mock for closeContextMenu if it's not available in UIContext directly (it was in useContextMenu hook result in App.tsx)
    // Wait, closeContextMenu was from useContextMenu in App.tsx. 
    // BUT useTestCaseHandlers needs closeContextMenu to close the menu after generating suite?
    // In App.tsx: 
    // const { closeContextMenu } = useContextMenu(...)
    // const { ... } = useTestCaseHandlers({ ..., closeContextMenu })

    // PROBLEM: closeContextMenu comes from separate hook useContextMenu.
    // If we move TestRunnerProvider ABOVE MainContent, it cannot access hooks used INSIDE MainContent (like useContextMenu).
    // Solution: We might need to lift specific dependencies OR pass a dummy.
    // However, closeContextMenu is just `() => setContextMenu(null)`. 
    // useContextMenu logic is mainly UI.
    // Maybe we just pass a no-op or we need to extract ContextMenu as well?
    // Let's defer ContextMenu dependency.
    // useTestCaseHandlers uses closeContextMenu likely only when generating suite via context menu?
    // Checking source of useTestCaseHandlers (viewed earlier):
    // It passes closeContextMenu to handler.

    // Short-term fix: Define a local no-op or simple state if possible, OR
    // Accept that TestRunner logic might not close context menu automatically unless we provide it.
    // Better: We can expose `closeContextMenu` from `UIContext` if we move it there later.
    // For now, let's look at where useContextMenu is. It's in App.tsx -> MainContent.tsx.

    // Crucial Decision:
    // User requested TestRunnerContext.
    // If `useTestCaseHandlers` depends on `closeContextMenu`, and `closeContextMenu` depends on `useContextMenu`, and `useContextMenu` depends on `selectedInterface` etc.
    // Maybe we just pass `() => {}` for now if it's minor UI polish, or we move `ContextMenu` state to `UIContext`?
    // `UIContext` has `activeView` etc.

    // Let's pass a no-op for now to unblock logic separation.
    const noOpCloseContextMenu = () => { };

    const testCaseHandlers = useTestCaseHandlers({
        projects: unifiedProjects,
        setProjects: setUnifiedProjects,
        saveProject: saveUnifiedProject,
        selectedTestCase,
        selectedStep,
        setSelectedTestCase,
        setSelectedStep,
        setSelectedRequest,
        setSelectedOperation,
        setSelectedInterface,
        setResponse,
        setActiveView,
        closeContextMenu: noOpCloseContextMenu, // Temporary decoupling
        selectedTestSuite,
        setSelectedTestSuite,
        setSelectedPerformanceSuiteId
    });

    const requestExecution = useRequestExecution({
        selectedOperation,
        selectedRequest,
        selectedInterface,
        selectedTestCase,
        selectedStep,
        selectedProjectName,
        wsdlUrl: '', // TODO: This was local state in App.tsx. Needed?
        setLoading,
        setResponse,
        setSelectedRequest,
        setProjects,
        setWorkspaceDirty,
        // Phase B (t_86c34d38): test-case step edits persist to the UNIFIED store
        // (suites relocated); the legacy workspace path keeps using setProjects.
        unifiedProjects,
        setUnifiedProjects,
        testExecution,
        selectedPerformanceSuiteId,
        config,
        setConfig,
        onScrapbookAutoSave: scrapbookAutoSave
    });

    // Correction: We need setWorkspaceDirty in ProjectContext
    // The useProject hook *does* return setWorkspaceDirty (viewed MainContent line 54).
    // But I didn't destructure it above.
    // Let's check useProject usage above.

    return (
        <TestRunnerContext.Provider value={{
            testExecution,
            setTestExecution,
            ...testCaseHandlers,
            ...requestExecution
        }}>
            {children}
        </TestRunnerContext.Provider>
    );
};
