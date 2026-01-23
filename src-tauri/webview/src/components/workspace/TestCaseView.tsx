import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Plus, FileCode, Loader2, ArrowUp, ArrowDown, Trash2, ListChecks } from 'lucide-react';
import { TestCase, TestStep, TestStepType } from '@shared/models';
import { ToolbarButton, IconButton, RunButton } from '../../styles/WorkspaceLayout.styles';
import { ContextHelpButton } from '../ContextHelpButton';
import { EmptyState } from '../common/EmptyState';

// Empty state component
interface EmptyTestCaseProps {
    onCreateTestSuite?: (projectName: string) => void;
    projectName?: string;
}

const EmptyTestCaseContainer = styled.div`
    position: relative;
    flex: 1;
`;

const EmptyHelp = styled.div`
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1;
`;

const EmptyActionButton = styled(ToolbarButton)`
    font-size: 1em;
    padding: 10px 20px;
`;

const ViewContainer = styled.div`
    padding: 20px;
    flex: 1;
    overflow: auto;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
`;

const HeaderRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const HeaderActions = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const StepsToolbar = styled.div`
    padding: 10px 0;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    gap: 10px;
`;

const StepsSection = styled.div`
    margin-top: 20px;
`;

const StepsTitle = styled.h2`
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 5px;
`;

const StepsList = styled.ul`
    list-style: none;
    padding: 0;
    margin: 0;
`;

const StepRow = styled.li<{ $clickable: boolean }>`
    padding: 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: ${props => props.$clickable ? 'pointer' : 'default'};
    background-color: var(--vscode-list-hoverBackground);
`;

const StepIndex = styled.div`
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 48px;
`;

const StepIndexNumber = styled.span`
    opacity: 0.7;
    min-width: 22px;
    display: inline-flex;
    justify-content: center;
`;

const StepStatusRunning = styled.div`
    color: var(--vscode-testing-iconQueued);
    display: inline-flex;
    align-items: center;
    
    /* Spin animation for loader icon */
    .spin {
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const StepStatusPass = styled.div`
    color: var(--vscode-testing-iconPassed);
`;

const StepStatusFail = styled.div`
    color: var(--vscode-testing-iconFailed);
`;

const StepContent = styled.div`
    flex: 1;
`;

const StepType = styled.span`
    opacity: 0.7;
`;

const StepMeta = styled.div`
    font-size: 0.8em;
    opacity: 0.6;
`;

const DelayMeta = styled(StepMeta)`
    color: var(--vscode-textLink-foreground);
`;

const ErrorText = styled.div`
    color: var(--vscode-errorForeground);
    font-size: 0.8em;
`;

const StepActions = styled.div`
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.8em;
    opacity: 0.9;
`;

const StepStat = styled.span`
    margin-right: 5px;
`;

const StepStatWide = styled.span`
    margin-right: 10px;
`;

const DeleteStepButton = styled(IconButton)`
    margin-left: 5px;
`;

const EmptyTestCase: React.FC<EmptyTestCaseProps> = ({ onCreateTestSuite, projectName }) => (
    <EmptyTestCaseContainer>
        <EmptyHelp>
            <ContextHelpButton sectionId="test-suite" />
        </EmptyHelp>
        <EmptyState
            icon={ListChecks}
            title="No Test Case Selected"
            description="Select a test case from the sidebar or create a new test suite."
        >
            {onCreateTestSuite && projectName && (
                <EmptyActionButton onClick={() => onCreateTestSuite(projectName)}>
                    <Plus size={16} /> Create Test Suite
                </EmptyActionButton>
            )}
        </EmptyState>
    </EmptyTestCaseContainer>
);

export interface TestExecutionStatus {
    status?: 'running' | 'pass' | 'fail';
    error?: string;
    response?: {
        duration?: number;
        rawResponse?: string;
    };
}

export interface TestCaseViewProps {
    testCase: TestCase;
    testExecution?: Record<string, Record<string, TestExecutionStatus>>;
    onRunTestCase?: (testCaseId: string) => void;
    onAddStep?: (testCaseId: string, stepType: TestStepType) => void;
    onSelectStep?: (step: TestStep) => void;
    onMoveStep?: (stepId: string, direction: 'up' | 'down') => void;
    onDeleteStep?: (stepId: string) => void;
    /** @deprecated Use onSelectStep */
    onOpenStepRequest?: (request: any) => void;
}

/**
 * Displays a test case with its list of steps and execution controls.
 */
export const TestCaseView: React.FC<TestCaseViewProps> = ({
    testCase,
    testExecution,
    onRunTestCase,
    onAddStep,
    onSelectStep,
    onMoveStep,
    onDeleteStep,
    onOpenStepRequest
}) => {
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    return (
        <ViewContainer>
            <HeaderRow>
                <h1>Test Case: {testCase.name}</h1>
                <HeaderActions>
                    <ContextHelpButton sectionId="test-suite" />
                    <RunButton onClick={() => onRunTestCase && onRunTestCase(testCase.id)}>
                        <Play size={14} /> Run Test Case
                    </RunButton>
                </HeaderActions>
            </HeaderRow>

            {onAddStep && (
                <StepsToolbar>
                    <ToolbarButton onClick={() => onAddStep(testCase.id, 'delay')}>
                        <Plus size={14} /> Add Delay
                    </ToolbarButton>
                    <ToolbarButton onClick={() => onAddStep(testCase.id, 'request')}>
                        <FileCode size={14} /> Add Request
                    </ToolbarButton>
                    <ToolbarButton onClick={() => onAddStep(testCase.id, 'script')}>
                        <FileCode size={14} /> Add Script
                    </ToolbarButton>
                </StepsToolbar>
            )}

            <StepsSection>
                <StepsTitle>Steps</StepsTitle>
                <StepsList>
                    {testCase.steps.map((step, index) => {
                        const status = testExecution && testExecution[testCase.id] && testExecution[testCase.id][step.id];
                        const isConfirming = deleteConfirm === step.id;
                        return (
                            <StepRow
                                key={step.id}
                                $clickable={step.type === 'request' || step.type === 'delay' || step.type === 'script'}
                                onClick={() => {
                                    if (onSelectStep) {
                                        onSelectStep(step);
                                    } else if (step.type === 'request' && step.config.request && onOpenStepRequest) {
                                        onOpenStepRequest(step.config.request);
                                    }
                                }}
                            >
                                <StepIndex>
                                    <StepIndexNumber>{index + 1}.</StepIndexNumber>
                                    {status?.status === 'running' && (
                                        <StepStatusRunning>
                                            <Loader2 size={14} className="spin" />
                                        </StepStatusRunning>
                                    )}
                                    {status?.status === 'pass' && <StepStatusPass>✔</StepStatusPass>}
                                    {status?.status === 'fail' && <StepStatusFail>✘</StepStatusFail>}
                                </StepIndex>
                                <StepContent>
                                    <strong>{step.name}</strong> <StepType>({step.type})</StepType>
                                    {step.type === 'request' && step.config.request && (
                                        <StepMeta>
                                            {step.config.request.method || 'POST'} {step.config.request.endpoint || 'No Endpoint'}
                                        </StepMeta>
                                    )}
                                    {step.type === 'delay' && (
                                        <DelayMeta>
                                            Delay: {step.config.delayMs || 0} ms
                                        </DelayMeta>
                                    )}
                                    {status?.error && (
                                        <ErrorText>Error: {status.error}</ErrorText>
                                    )}
                                </StepContent>
                                <StepActions>
                                    {status?.response?.duration !== undefined && <StepStat title="Duration">{status.response.duration.toFixed(3)}s</StepStat>}
                                    {status?.response?.rawResponse !== undefined && <StepStatWide title="Response Size">{(status.response.rawResponse.length / 1024).toFixed(2)} KB</StepStatWide>}

                                    {onMoveStep && (
                                        <>
                                            <IconButton
                                                onClick={(e) => { e.stopPropagation(); onMoveStep(step.id, 'up'); }}
                                                title="Move Up"
                                                disabled={index === 0}
                                            >
                                                <ArrowUp size={14} />
                                            </IconButton>
                                            <IconButton
                                                onClick={(e) => { e.stopPropagation(); onMoveStep(step.id, 'down'); }}
                                                title="Move Down"
                                                disabled={index === testCase.steps.length - 1}
                                            >
                                                <ArrowDown size={14} />
                                            </IconButton>
                                        </>
                                    )}

                                    {onDeleteStep && (
                                        <DeleteStepButton
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isConfirming) {
                                                    onDeleteStep(step.id);
                                                    setDeleteConfirm(null);
                                                } else {
                                                    setDeleteConfirm(step.id);
                                                    setTimeout(() => setDeleteConfirm(null), 2000);
                                                }
                                            }}
                                            shake={isConfirming}
                                            title={isConfirming ? "Click to Confirm Delete" : "Delete Step"}
                                        >
                                            <Trash2 size={14} />
                                        </DeleteStepButton>
                                    )}
                                </StepActions>
                            </StepRow>
                        );
                    })}
                </StepsList>
            </StepsSection>
        </ViewContainer>
    );
};

export { EmptyTestCase };
