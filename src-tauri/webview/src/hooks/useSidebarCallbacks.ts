/**
 * useSidebarCallbacks.ts
 * 
 * Hook that provides callbacks for Sidebar test suite/case operations.
 * Extracted from App.tsx to reduce inline handler complexity.
 */

import { useCallback } from 'react';
import { ApinoxProject, TestCase, TestSuite } from '@shared/models';
import { BackendCommand } from '@shared/messages';
import { bridge } from '../utils/bridge';
import { debugLog } from '../utils/logger';

interface UseSidebarCallbacksParams {
    projects: ApinoxProject[];
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    deleteConfirm: string | null;
    setDeleteConfirm: React.Dispatch<React.SetStateAction<string | null>>;
    saveProject: (project: ApinoxProject) => void;
    config: any;
}

interface UseSidebarCallbacksReturn {
    handleAddSuite: (projName: string, suiteName?: string) => void;
    handleDeleteSuite: (suiteId: string) => void;
    handleToggleSuiteExpand: (suiteId: string) => void;
    handleToggleCaseExpand: (caseId: string) => void;
    handleAddTestCase: (suiteId: string) => void;
    handleDeleteTestCase: (caseId: string) => void;
    handleRenameTestCase: (caseId: string, newName: string) => void;
    handleRenameTestStep: (caseId: string, stepId: string, newName: string) => void;
    handleSaveUiState: () => void;
}

export function useSidebarCallbacks({
    projects,
    setProjects,
    deleteConfirm,
    setDeleteConfirm,
    saveProject,
    config
}: UseSidebarCallbacksParams): UseSidebarCallbacksReturn {

    const handleAddSuite = useCallback((projName: string, suiteName?: string) => {
        const project = projects.find(p => p.name === projName);
        if (!project) return;

        // Prevent creating suites when project/workspace is read-only
        if (project.readOnly || config?.isReadOnly) {
            bridge.emit({ command: BackendCommand.Error, error: 'Cannot create test suites in a read-only workspace.', message: 'Cannot create test suites in a read-only workspace.' });
            return;
        }

        const name = suiteName || `TestSuite ${((project.testSuites || []).length + 1)}`;
        const newSuite: TestSuite = {
            id: `suite-${Date.now()}`,
            name,
            testCases: [],
            expanded: true
        };
        const updatedProject = {
            ...project,
            testSuites: [...(project.testSuites || []), newSuite],
            dirty: true
        };
        setProjects(projects.map(p => p.name === projName ? updatedProject : p));
        // saveProject(updatedProject);
    }, [projects, setProjects, saveProject, config]);

    const handleDeleteSuite = useCallback((suiteId: string) => {
        if (deleteConfirm === suiteId) {
            setProjects(prev => prev.map(p => {
                if (!p.testSuites || !p.testSuites.some(s => s.id === suiteId)) return p;
                const remaining = p.testSuites.filter(s => s.id !== suiteId);
                const updated = { ...p, testSuites: remaining, dirty: true };
                // setTimeout(() => saveProject(updated), 0);
                return updated;
            }));
            setDeleteConfirm(null);
        } else {
            setDeleteConfirm(suiteId);
            setTimeout(() => setDeleteConfirm(null), 2000);
        }
    }, [deleteConfirm, setProjects, setDeleteConfirm, saveProject]);

    const handleToggleSuiteExpand = useCallback((suiteId: string) => {
        setProjects(prev => prev.map(p => {
            if (!p.testSuites?.some(s => s.id === suiteId)) return p;
            const updatedSuites = p.testSuites.map(s => {
                if (s.id !== suiteId) return s;
                return { ...s, expanded: s.expanded === false ? true : false };
            });
            const updatedProject = { ...p, testSuites: updatedSuites, dirty: true };
            // setTimeout(() => saveProject(updatedProject), 0);
            return updatedProject;
        }));
    }, [setProjects, saveProject]);

    const handleToggleCaseExpand = useCallback((caseId: string) => {
        setProjects(prev => prev.map(p => {
            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
            if (!suite) return p;
            const updatedSuite = {
                ...suite,
                testCases: suite.testCases?.map(tc => {
                    if (tc.id !== caseId) return tc;
                    return { ...tc, expanded: tc.expanded === false ? true : false };
                })
            };
            const updatedProject = {
                ...p,
                testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s),
                dirty: true
            };
            // setTimeout(() => saveProject(updatedProject), 0);
            return updatedProject;
        }));
    }, [setProjects, saveProject]);

    const handleAddTestCase = useCallback((suiteId: string) => {
        setProjects(prev => prev.map(p => {
            const suite = p.testSuites?.find(s => s.id === suiteId);
            if (!suite) return p;
            const newCase: TestCase = {
                id: `tc-${Date.now()}`,
                name: `TestCase ${(suite.testCases?.length || 0) + 1}`,
                expanded: true,
                steps: []
            };
            const updatedSuite = { ...suite, testCases: [...(suite.testCases || []), newCase] };
            const updatedProject = {
                ...p,
                testSuites: p.testSuites!.map(s => s.id === suiteId ? updatedSuite : s),
                dirty: true
            };
            // setTimeout(() => saveProject(updatedProject), 0);
            return updatedProject;
        }));
    }, [setProjects, saveProject]);

    const handleDeleteTestCase = useCallback((caseId: string) => {
        if (deleteConfirm === caseId) {
            setProjects(prev => prev.map(p => {
                const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                if (!suite) return p;
                const updatedSuite = { ...suite, testCases: suite.testCases?.filter(tc => tc.id !== caseId) || [] };
                const updatedProject = {
                    ...p,
                    testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s),
                    dirty: true
                };
                // setTimeout(() => saveProject(updatedProject), 0);
                return updatedProject;
            }));
            setDeleteConfirm(null);
        } else {
            setDeleteConfirm(caseId);
            setTimeout(() => setDeleteConfirm(null), 2000);
        }
    }, [deleteConfirm, setProjects, setDeleteConfirm, saveProject]);

    const handleRenameTestCase = useCallback((caseId: string, newName: string) => {
        debugLog('[useSidebarCallbacks] handleRenameTestCase called', { caseId, newName });
        setProjects(prev => {
            return prev.map(p => {
                const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                if (!suite) {
                    return p;
                }
                debugLog('[useSidebarCallbacks] Found suite', { suite: suite.name, project: p.name });
                const updatedSuite = {
                    ...suite,
                    testCases: suite.testCases?.map(tc =>
                        tc.id === caseId ? { ...tc, name: newName } : tc
                    ) || []
                };
                const updatedProject = {
                    ...p,
                    testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s),
                    dirty: true
                };
                // setTimeout(() => saveProject(updatedProject), 0);
                return updatedProject;
            });
        });
    }, [setProjects, saveProject]);

    const handleRenameTestStep = useCallback((caseId: string, stepId: string, newName: string) => {
        setProjects(prev => {
            return prev.map(p => {
                const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                if (!suite) return p;

                const updatedSuite = {
                    ...suite,
                    testCases: suite.testCases?.map(tc => {
                        if (tc.id !== caseId) return tc;
                        return {
                            ...tc,
                            steps: tc.steps.map(step =>
                                step.id === stepId ? { ...step, name: newName } : step
                            )
                        };
                    })
                };

                const updatedProject = {
                    ...p,
                    testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s),
                    dirty: true
                };
                // setTimeout(() => saveProject(updatedProject), 0);
                return updatedProject;
            });
        });
    }, [setProjects, saveProject]);

    const handleSaveUiState = useCallback(() => {
        if (config) {
            bridge.sendMessage({ command: 'saveUiState', ui: config.ui });
        }
    }, [config]);

    return {
        handleAddSuite,
        handleDeleteSuite,
        handleToggleSuiteExpand,
        handleToggleCaseExpand,
        handleAddTestCase,
        handleDeleteTestCase,
        handleRenameTestCase,
        handleRenameTestStep,
        handleSaveUiState
    };
}
