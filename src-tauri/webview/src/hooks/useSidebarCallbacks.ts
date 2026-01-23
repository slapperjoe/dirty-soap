/**
 * useSidebarCallbacks.ts
 * 
 * Hook that provides callbacks for Sidebar test suite/case operations.
 * Extracted from App.tsx to reduce inline handler complexity.
 */

import { useCallback } from 'react';
import { ApinoxProject, TestCase, TestSuite } from '@shared/models';
import { bridge } from '../utils/bridge';

interface UseSidebarCallbacksParams {
    projects: ApinoxProject[];
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    deleteConfirm: string | null;
    setDeleteConfirm: React.Dispatch<React.SetStateAction<string | null>>;
    saveProject: (project: ApinoxProject) => void;
    setWatcherRunning: React.Dispatch<React.SetStateAction<boolean>>;
    setWatcherHistory: React.Dispatch<React.SetStateAction<any[]>>;
    setProxyRunning: React.Dispatch<React.SetStateAction<boolean>>;
    setProxyHistory: React.Dispatch<React.SetStateAction<any[]>>;
    proxyConfig: { port: number; target: string; systemProxyEnabled: boolean };
    setProxyConfig: React.Dispatch<React.SetStateAction<{ port: number; target: string; systemProxyEnabled: boolean }>>;
    configPath: string | null;
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
    handleStartWatcher: () => void;
    handleStopWatcher: () => void;
    handleClearWatcher: () => void;
    handleStartProxy: () => void;
    handleStopProxy: () => void;
    handleUpdateProxyConfig: (config: { port: number; target: string; systemProxyEnabled?: boolean }) => void;
    handleClearProxy: () => void;
    handleInjectProxy: () => void;
    handleRestoreProxy: () => void;
    handleSaveUiState: () => void;
}

export function useSidebarCallbacks({
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
}: UseSidebarCallbacksParams): UseSidebarCallbacksReturn {

    const handleAddSuite = useCallback((projName: string, suiteName?: string) => {
        const project = projects.find(p => p.name === projName);
        if (!project) return;

        // Prevent creating suites when project/workspace is read-only
        if (project.readOnly || config?.isReadOnly) {
            bridge.sendMessage({ command: 'error', message: 'Cannot create test suites in a read-only workspace.' });
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
        console.log('[useSidebarCallbacks] handleRenameTestCase called:', { caseId, newName });
        setProjects(prev => {
            console.log('[useSidebarCallbacks] Previous projects count:', prev.length);
            return prev.map(p => {
                const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                if (!suite) {
                    console.log('[useSidebarCallbacks] Suite not found in project:', p.name);
                    return p;
                }
                console.log('[useSidebarCallbacks] Found suite:', suite.name, 'in project:', p.name);
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
                console.log('[useSidebarCallbacks] Calling saveProject for:', updatedProject.name);
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

    // Watcher handlers
    const handleStartWatcher = useCallback(() => {
        setWatcherRunning(true);
        bridge.sendMessage({ command: 'startWatcher' });
    }, [setWatcherRunning]);

    const handleStopWatcher = useCallback(() => {
        setWatcherRunning(false);
        bridge.sendMessage({ command: 'stopWatcher' });
    }, [setWatcherRunning]);

    const handleClearWatcher = useCallback(() => {
        setWatcherHistory([]);
        bridge.sendMessage({ command: 'clearWatcherHistory' });
    }, [setWatcherHistory]);

    // Proxy handlers
    const handleStartProxy = useCallback(() => {
        bridge.sendMessage({ command: 'startProxy' });
        setProxyRunning(true);
    }, [setProxyRunning]);

    const handleStopProxy = useCallback(() => {
        bridge.sendMessage({ command: 'stopProxy' });
        setProxyRunning(false);
    }, [setProxyRunning]);

    const handleUpdateProxyConfig = useCallback((newConfig: { port: number; target: string; systemProxyEnabled?: boolean }) => {
        const fullConfig = { ...newConfig, systemProxyEnabled: newConfig.systemProxyEnabled ?? true };
        setProxyConfig(fullConfig);
        bridge.sendMessage({ command: 'updateProxyConfig', config: fullConfig });
    }, [setProxyConfig]);

    const handleClearProxy = useCallback(() => {
        setProxyHistory([]);
    }, [setProxyHistory]);

    const handleInjectProxy = useCallback(() => {
        if (configPath) {
            const proxyUrl = `http://localhost:${proxyConfig.port}`;
            bridge.sendMessage({ command: 'injectProxy', path: configPath, proxyUrl });
        }
    }, [configPath, proxyConfig.port]);

    const handleRestoreProxy = useCallback(() => {
        if (configPath) {
            bridge.sendMessage({ command: 'restoreProxy', path: configPath });
        }
    }, [configPath]);

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
    };
}
