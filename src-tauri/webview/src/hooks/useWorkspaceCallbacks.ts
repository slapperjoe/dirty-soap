/**
 * useWorkspaceCallbacks.ts
 * 
 * Hook that provides callbacks for WorkspaceLayout test step operations.
 * Extracted from App.tsx to reduce inline handler complexity.
 */

import { useCallback, useMemo } from 'react';
import { UnifiedProject, TestStep, TestCase, TestStepType, RequestExtractor } from '@shared/models';
import { bridge } from '../utils/bridge';
import {
    deleteTestStep,
    reorderTestStep,
    updateTestStep,
    addTestStep,
} from '../utils/projectUpdateHelpers';

interface UseWorkspaceCallbacksParams {
    // Test case state
    selectedTestCase: TestCase | null;
    selectedStep: TestStep | null;
    testExecution: Record<string, Record<string, any>>;
    // Phase B (t_86c34d38): test-step CRUD now operates on the UNIFIED store
    // (test suites were relocated to UnifiedProject.testSuites). The pure
    // projectUpdateHelpers are model-agnostic (ProjectLike), so the same
    // functions work on UnifiedProject[].
    projects: UnifiedProject[];
    setSelectedStep: React.Dispatch<React.SetStateAction<TestStep | null>>;
    setSelectedRequest: React.Dispatch<React.SetStateAction<any>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;

    // Project state
    setProjects: React.Dispatch<React.SetStateAction<UnifiedProject[]>>;
    saveProject: (project: UnifiedProject) => void;

    // UI State
    layoutMode: 'vertical' | 'horizontal';
    setLayoutMode: React.Dispatch<React.SetStateAction<'vertical' | 'horizontal'>>;
    showLineNumbers: boolean;
    setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>;
    inlineElementValues: boolean;
    setInlineElementValues: React.Dispatch<React.SetStateAction<boolean>>;
    hideCausalityData: boolean;
    setHideCausalityData: React.Dispatch<React.SetStateAction<boolean>>;
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
    config,
    setExtractorModal,
    onPickRequestForTestCase
}: UseWorkspaceCallbacksParams): UseWorkspaceCallbacksReturn {

    // Flat step index — rebuilt only when `projects` changes.
    // Replaces the O(projects × suites × cases × steps) nested loop in handleSelectStep.
    const stepIndex = useMemo(() => {
        const index = new Map<string, TestStep>();
        for (const proj of projects) {
            for (const suite of proj.testSuites ?? []) {
                for (const tc of suite.testCases ?? []) {
                    for (const s of tc.steps ?? []) {
                        index.set(s.id, s);
                    }
                }
            }
        }
        return index;
    }, [projects]);

    const handleSelectStep = useCallback((step: TestStep | null) => {
        if (step) {
            // Look up the current step from the pre-built index to get latest edits (e.g., assertions).
            const found = stepIndex.get(step.id);
            let currentStep: TestStep;
            if (found) {
                // Preserve scriptContent from the incoming step if the indexed copy lacks it
                // (can happen when projects state is restored from cache without scriptContent).
                if (step.type === 'script' && step.config.scriptContent && !found.config.scriptContent) {
                    currentStep = { ...found, config: { ...found.config, scriptContent: step.config.scriptContent } };
                } else {
                    currentStep = found;
                }
            } else {
                currentStep = step;
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
    }, [selectedTestCase, testExecution, stepIndex, setSelectedStep, setSelectedRequest, setResponse]);

    const handleDeleteStep = useCallback((stepId: string) => {
        if (!selectedTestCase) return;
        setProjects(prev => deleteTestStep(prev, selectedTestCase.id, stepId));
        if (selectedStep?.id === stepId) {
            setSelectedStep(null);
            setSelectedRequest(null);
            setResponse(null);
        }
    }, [selectedTestCase, selectedStep, setProjects, setSelectedStep, setSelectedRequest, setResponse]);

    const handleMoveStep = useCallback((stepId: string, direction: 'up' | 'down') => {
        if (!selectedTestCase) return;
        setProjects(prev => reorderTestStep(prev, selectedTestCase.id, stepId, direction));
    }, [selectedTestCase, setProjects]);

    const handleUpdateStep = useCallback((updatedStep: TestStep) => {
        if (!selectedTestCase) return;
        setProjects(prev => {
            const updated = updateTestStep(prev, selectedTestCase.id, updatedStep.id, () => updatedStep);
            const project = updated.find(p => p.testSuites?.some(s => s.testCases?.some(tc => tc.id === selectedTestCase.id)));
            if (project) setTimeout(() => saveProject(project), 0);
            return updated;
        });
        setSelectedStep(updatedStep);
    }, [selectedTestCase, setProjects, saveProject, setSelectedStep]);

    const handleBackToCase = useCallback(() => {
        setSelectedRequest(null);
        setSelectedStep(null);
        setResponse(null);
    }, [setSelectedRequest, setSelectedStep, setResponse]);

    const handleAddStep = useCallback((caseId: string, type: TestStepType) => {
        const newStepsByType: Record<string, TestStep | null> = {
            delay: { id: `step-${Date.now()}`, name: 'Delay', type: 'delay', config: { delayMs: 1000 } },
            script: {
                id: `step-${Date.now()}`,
                name: 'Script',
                type: 'script',
                config: { scriptContent: "// Script Step\n// Available: context, log(msg), goto(stepName), fail(reason), delay(ms)\n\nlog('Script started');\n" },
            },
            workflow: { id: `step-${Date.now()}`, name: 'Workflow Step', type: 'workflow', config: { workflowId: '', workflowVariables: {} } },
            request: null,
        };

        if (type === 'request') {
            if (false) {
                bridge.sendMessage({ command: 'pickOperationForTestCase', caseId });
            } else {
                onPickRequestForTestCase?.(caseId);
            }
            return;
        }

        const newStep = newStepsByType[type];
        if (!newStep) return;

        setProjects(prev => {
            const updated = addTestStep(prev, caseId, newStep);
            const project = updated.find(p => p.testSuites?.some(s => s.testCases?.some(tc => tc.id === caseId)));
            if (project) setTimeout(() => saveProject(project), 0);
            return updated;
        });
    }, [setProjects, saveProject, onPickRequestForTestCase]);

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
        bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, inlineElementValues: newState } });
    }, [inlineElementValues, setInlineElementValues, config]);

    const handleToggleHideCausalityData = useCallback(() => {
        const newState = !hideCausalityData;
        setHideCausalityData(newState);
        bridge.sendMessage({ command: 'saveUiState', ui: { ...config?.ui, hideCausalityData: newState } });
    }, [hideCausalityData, setHideCausalityData, config]);

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
