/**
 * useWorkspaceCallbacks.ts
 * 
 * Hook that provides callbacks for WorkspaceLayout test step operations.
 * Extracted from App.tsx to reduce inline handler complexity.
 */

import { useCallback } from 'react';
import { ApinoxProject, TestStep, TestCase, TestStepType, RequestExtractor } from '@shared/models';
import { bridge, isVsCode } from '../utils/bridge';

interface UseWorkspaceCallbacksParams {
    // Test case state
    selectedTestCase: TestCase | null;
    selectedStep: TestStep | null;
    testExecution: Record<string, Record<string, any>>;
    projects: ApinoxProject[];
    setSelectedStep: React.Dispatch<React.SetStateAction<TestStep | null>>;
    setSelectedRequest: React.Dispatch<React.SetStateAction<any>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;

    // Project state
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    saveProject: (project: ApinoxProject) => void;

    // UI State
    layoutMode: 'vertical' | 'horizontal';
    setLayoutMode: React.Dispatch<React.SetStateAction<'vertical' | 'horizontal'>>;
    showLineNumbers: boolean;
    setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>;
    inlineElementValues: boolean;
    setInlineElementValues: React.Dispatch<React.SetStateAction<boolean>>;
    hideCausalityData: boolean;
    setHideCausalityData: React.Dispatch<React.SetStateAction<boolean>>;
    setProxyHistory: React.Dispatch<React.SetStateAction<any[]>>;
    setWatcherHistory: React.Dispatch<React.SetStateAction<any[]>>;
    config: any;

    // Modal state
    setExtractorModal: React.Dispatch<React.SetStateAction<any>>;
    onPickRequestForTestCase?: (caseId: string) => void;
}

interface UseWorkspaceCallbacksReturn {
    handleSelectStep: (step: TestStep | null) => void;
    handleDeleteStep: (stepId: string) => void;
    handleMoveStep: (stepId: string, direction: 'up' | 'down') => void;
    handleUpdateStep: (updatedStep: TestStep) => void;
    handleBackToCase: () => void;
    handleAddStep: (caseId: string, type: TestStepType) => void;
    handleToggleLayout: () => void;
    handleToggleLineNumbers: () => void;
    handleToggleInlineElementValues: () => void;
    handleToggleHideCausalityData: () => void;
    handleAddExtractor: (data: { xpath: string; value: string; source: 'body' | 'header' }) => void;
    handleEditExtractor: (extractor: RequestExtractor, index: number) => void;
}

export function useWorkspaceCallbacks({
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
    setProxyHistory,
    setWatcherHistory,
    config,
    setExtractorModal,
    onPickRequestForTestCase
}: UseWorkspaceCallbacksParams): UseWorkspaceCallbacksReturn {

    const handleSelectStep = useCallback((step: TestStep | null) => {
        if (step) {
            // Look up the current step from projects state to get latest edits (e.g., assertions)
            // Search ALL test cases for the step by ID to avoid relying on stale selectedTestCase
            let currentStep = step;
            let foundInProjects = false;
            outer: for (const proj of projects) {
                for (const suite of (proj.testSuites || [])) {
                    for (const tc of (suite.testCases || [])) {
                        const foundStep = tc.steps.find(s => s.id === step.id);
                        if (foundStep) {
                            // Merge: Use foundStep but preserve scriptContent from incoming step if foundStep lacks it
                            // This handles the case where projects state was restored from cache without scriptContent
                            if (step.type === 'script' && step.config.scriptContent && !foundStep.config.scriptContent) {
                                currentStep = { ...foundStep, config: { ...foundStep.config, scriptContent: step.config.scriptContent } };
                            } else {
                                currentStep = foundStep;
                            }
                            foundInProjects = true;
                            break outer;
                        }
                    }
                }
            }
            if (!foundInProjects) {
                // Step not found in projects, using passed-in step
            }

            // Update selectedStep with the fresh version found in projects (or the passed one if not found)
            setSelectedStep(currentStep);

            if (currentStep.type === 'request' && currentStep.config.request) {
                setSelectedRequest(currentStep.config.request);
                // Update Response Panel Logic
                if (selectedTestCase) {
                    const result = testExecution[selectedTestCase.id]?.[step.id];
                    if (result && result.response) {
                        setResponse({
                            ...result.response,
                            assertionResults: result.assertionResults
                        });
                    } else {
                        setResponse(null);
                    }
                }
            } else {
                setSelectedRequest(null);
                setResponse(null);
            }
        } else {
            setSelectedRequest(null);
            setResponse(null);
        }
    }, [selectedTestCase, testExecution, projects, setSelectedStep, setSelectedRequest, setResponse]);

    const handleDeleteStep = useCallback((stepId: string) => {
        if (!selectedTestCase) return;
        setProjects(prev => prev.map(p => {
            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
            if (!suite) return p;

            const updatedSuite = {
                ...suite,
                testCases: suite.testCases?.map(tc => {
                    if (tc.id !== selectedTestCase.id) return tc;
                    return {
                        ...tc,
                        steps: tc.steps.filter(s => s.id !== stepId)
                    };
                })
            };
            const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
            // setTimeout(() => saveProject(updatedProject), 0);
            return updatedProject;
        }));

        if (selectedStep?.id === stepId) {
            setSelectedStep(null);
            setSelectedRequest(null);
            setResponse(null);
        }
    }, [selectedTestCase, selectedStep, setProjects, saveProject, setSelectedStep, setSelectedRequest, setResponse]);

    const handleMoveStep = useCallback((stepId: string, direction: 'up' | 'down') => {
        if (!selectedTestCase) return;
        setProjects(prev => prev.map(p => {
            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
            if (!suite) return p;

            const updatedSuite = {
                ...suite,
                testCases: suite.testCases?.map(tc => {
                    if (tc.id !== selectedTestCase.id) return tc;
                    const steps = [...tc.steps];
                    const index = steps.findIndex(s => s.id === stepId);
                    if (index === -1) return tc;

                    if (direction === 'up' && index > 0) {
                        [steps[index], steps[index - 1]] = [steps[index - 1], steps[index]];
                    } else if (direction === 'down' && index < steps.length - 1) {
                        [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
                    } else {
                        return tc; // No change
                    }

                    return { ...tc, steps };
                })
            };
            const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
            // setTimeout(() => saveProject(updatedProject), 0);
            return updatedProject;
        }));
    }, [selectedTestCase, setProjects, saveProject]);

    const handleUpdateStep = useCallback((updatedStep: TestStep) => {
        bridge.sendMessage({ command: 'log', message: `[handleUpdateStep] Called with: ${updatedStep.id} Script len: ${updatedStep.config.scriptContent?.length}` });
        if (!selectedTestCase) {
            bridge.sendMessage({ command: 'log', message: '[handleUpdateStep] No selectedTestCase!' });
            return;
        }
        setProjects(prev => prev.map(p => {
            const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === selectedTestCase.id));
            if (!suite) return p;

            const updatedSuite = {
                ...suite,
                testCases: suite.testCases?.map(tc => {
                    if (tc.id !== selectedTestCase.id) return tc;
                    bridge.sendMessage({ command: 'log', message: `[handleUpdateStep] Updating step in TC: ${tc.id}` });
                    return {
                        ...tc,
                        steps: tc.steps.map(s => s.id === updatedStep.id ? updatedStep : s)
                    };
                })
            };

            const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
            // setTimeout(() => saveProject(updatedProject), 0);
            return updatedProject;
        }));
        setSelectedStep(updatedStep);
    }, [selectedTestCase, setProjects, saveProject, setSelectedStep]);

    const handleBackToCase = useCallback(() => {
        setSelectedRequest(null);
        setSelectedStep(null);
        setResponse(null);
    }, [setSelectedRequest, setSelectedStep, setResponse]);

    const handleAddStep = useCallback((caseId: string, type: TestStepType) => {
        if (type === 'delay') {
            setProjects(prev => prev.map(p => {
                const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                if (!suite) return p;

                const updatedSuite = {
                    ...suite,
                    testCases: suite.testCases?.map(tc => {
                        if (tc.id !== caseId) return tc;
                        const newStep: TestStep = {
                            id: `step-${Date.now()}`,
                            name: 'Delay',
                            type: 'delay',
                            config: { delayMs: 1000 }
                        };
                        return { ...tc, steps: [...tc.steps, newStep] };
                    }) || []
                };

                const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
                setTimeout(() => saveProject(updatedProject), 0);
                return updatedProject;
            }));
        } else if (type === 'script') {
            setProjects(prev => prev.map(p => {
                const suite = p.testSuites?.find(s => s.testCases?.some(tc => tc.id === caseId));
                if (!suite) return p;

                const updatedSuite = {
                    ...suite,
                    testCases: suite.testCases?.map(tc => {
                        if (tc.id !== caseId) return tc;
                        const newStep: TestStep = {
                            id: `step-${Date.now()}`,
                            name: 'Script',
                            type: 'script',
                            config: {
                                scriptContent: "// Script Step\n// Available: context, log(msg), goto(stepName), fail(reason), delay(ms)\n\nlog('Script started');\n"
                            }
                        };
                        return { ...tc, steps: [...tc.steps, newStep] };
                    }) || []
                };

                const updatedProject = { ...p, testSuites: p.testSuites!.map(s => s.id === suite.id ? updatedSuite : s), dirty: true };
                setTimeout(() => saveProject(updatedProject), 0);
                return updatedProject;
            }));
        } else if (type === 'request') {
            if (isVsCode()) {
                bridge.sendMessage({ command: 'pickOperationForTestCase', caseId });
            } else {
                onPickRequestForTestCase?.(caseId);
            }
        }
    }, [setProjects, saveProject]);

    const handleToggleLayout = useCallback(() => {
        const newMode = layoutMode === 'vertical' ? 'horizontal' : 'vertical';
        setLayoutMode(newMode);
        bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, layoutMode: newMode } });
    }, [layoutMode, setLayoutMode, config]);

    const handleToggleLineNumbers = useCallback(() => {
        const newState = !showLineNumbers;
        setShowLineNumbers(newState);
        bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, showLineNumbers: newState } });
    }, [showLineNumbers, setShowLineNumbers, config]);

    const handleToggleInlineElementValues = useCallback(() => {
        const newState = !inlineElementValues;
        setInlineElementValues(newState);
        // Invalidate formatted body cache
        setProxyHistory(prev => prev.map(e => ({ ...e, formattedBody: undefined })));
        setWatcherHistory(prev => prev.map(e => ({ ...e, formattedBody: undefined })));
        bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, inlineElementValues: newState } });
    }, [inlineElementValues, setInlineElementValues, setProxyHistory, setWatcherHistory, config]);

    const handleToggleHideCausalityData = useCallback(() => {
        const newState = !hideCausalityData;
        setHideCausalityData(newState);
        // Invalidate formatted body cache
        setProxyHistory(prev => prev.map(e => ({ ...e, formattedBody: undefined })));
        setWatcherHistory(prev => prev.map(e => ({ ...e, formattedBody: undefined })));
        bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, hideCausalityData: newState } });
    }, [hideCausalityData, setHideCausalityData, setProxyHistory, setWatcherHistory, config]);

    const handleAddExtractor = useCallback((data: { xpath: string; value: string; source: 'body' | 'header' }) => {
        if (!selectedStep) return;
        setExtractorModal({ ...data, variableName: '' });
    }, [selectedStep, setExtractorModal]);

    const handleEditExtractor = useCallback((extractor: RequestExtractor, _index: number) => {
        if (!selectedStep) return;
        setExtractorModal({
            xpath: extractor.path,
            value: '', // Value will be shown from preview if available
            source: extractor.source,
            variableName: extractor.variable,
            defaultValue: extractor.defaultValue || '',
            editingId: extractor.id
        });
    }, [selectedStep, setExtractorModal]);

    return {
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
        handleAddExtractor,
        handleEditExtractor
    };
}
