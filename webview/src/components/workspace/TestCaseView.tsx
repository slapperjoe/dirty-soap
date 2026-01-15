import React, { useState } from 'react';
import { Play, Plus, FileCode, Loader2, ArrowUp, ArrowDown, Trash2 } from 'lucide-react';
import { TestCase, TestStep, TestStepType } from '@shared/models';
import { ToolbarButton, IconButton } from '../../styles/WorkspaceLayout.styles';
import { ContextHelpButton } from '../ContextHelpButton';

// Empty state component
interface EmptyTestCaseProps {
    onCreateTestSuite?: (projectName: string) => void;
    projectName?: string;
}

const EmptyTestCase: React.FC<EmptyTestCaseProps> = ({ onCreateTestSuite, projectName }) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--vscode-descriptionForeground)', padding: 20, textAlign: 'center', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
            <ContextHelpButton sectionId="test-suite" />
        </div>
        <h2 style={{ marginBottom: 10, color: 'var(--vscode-foreground)' }}>No Test Case Selected</h2>
        <p style={{ marginBottom: 20 }}>Select a test case from the sidebar or create a new test suite.</p>
        {onCreateTestSuite && projectName && (
            <ToolbarButton onClick={() => onCreateTestSuite(projectName)} style={{ fontSize: '1em', padding: '10px 20px' }}>
                <Plus size={16} /> Create Test Suite
            </ToolbarButton>
        )}
    </div>
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
        <div style={{ padding: 20, flex: 1, overflow: 'auto', color: 'var(--vscode-editor-foreground)', fontFamily: 'var(--vscode-font-family)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Test Case: {testCase.name}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ContextHelpButton sectionId="test-suite" />
                    <ToolbarButton onClick={() => onRunTestCase && onRunTestCase(testCase.id)} style={{ color: 'var(--vscode-testing-iconPassed)' }}>
                        <Play size={14} /> Run Test Case
                    </ToolbarButton>
                </div>
            </div>

            {onAddStep && (
                <div style={{ padding: '10px 0', borderBottom: '1px solid var(--vscode-panel-border)', display: 'flex', gap: 10 }}>
                    <ToolbarButton onClick={() => onAddStep(testCase.id, 'delay')}>
                        <Plus size={14} /> Add Delay
                    </ToolbarButton>
                    <ToolbarButton onClick={() => onAddStep(testCase.id, 'request')}>
                        <FileCode size={14} /> Add Request
                    </ToolbarButton>
                    <ToolbarButton onClick={() => onAddStep(testCase.id, 'script')}>
                        <FileCode size={14} /> Add Script
                    </ToolbarButton>
                </div>
            )}

            <div style={{ marginTop: 20 }}>
                <h2 style={{ borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: 5 }}>Steps</h2>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {testCase.steps.map((step, index) => {
                        const status = testExecution && testExecution[testCase.id] && testExecution[testCase.id][step.id];
                        const isConfirming = deleteConfirm === step.id;
                        return (
                            <li key={step.id} style={{
                                padding: '10px',
                                borderBottom: '1px solid var(--vscode-panel-border)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                cursor: step.type === 'request' || step.type === 'delay' || step.type === 'script' ? 'pointer' : 'default',
                                backgroundColor: 'var(--vscode-list-hoverBackground)'
                            }}
                                onClick={() => {
                                    if (onSelectStep) {
                                        onSelectStep(step);
                                    } else if (step.type === 'request' && step.config.request && onOpenStepRequest) {
                                        onOpenStepRequest(step.config.request);
                                    }
                                }}
                            >
                                <div style={{ opacity: 0.7, width: 24, display: 'flex', justifyContent: 'center' }}>
                                    {status?.status === 'running' && <Loader2 size={14} className="spin" />}
                                    {status?.status === 'pass' && <div style={{ color: 'var(--vscode-testing-iconPassed)' }}>✔</div>}
                                    {status?.status === 'fail' && <div style={{ color: 'var(--vscode-testing-iconFailed)' }}>✘</div>}
                                    {!status && <span>{index + 1}.</span>}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <strong>{step.name}</strong> <span style={{ opacity: 0.7 }}>({step.type})</span>
                                    {step.type === 'request' && step.config.request && (
                                        <div style={{ fontSize: '0.8em', opacity: 0.6 }}>
                                            {step.config.request.method || 'POST'} {step.config.request.endpoint || 'No Endpoint'}
                                        </div>
                                    )}
                                    {step.type === 'delay' && (
                                        <div style={{ fontSize: '0.8em', opacity: 0.6, color: 'var(--vscode-textLink-foreground)' }}>
                                            Delay: {step.config.delayMs || 0} ms
                                        </div>
                                    )}
                                    {status?.error && (
                                        <div style={{ color: 'var(--vscode-errorForeground)', fontSize: '0.8em' }}>Error: {status.error}</div>
                                    )}
                                </div>
                                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.8em', opacity: 0.9 }}>
                                    {status?.response?.duration !== undefined && <span title="Duration" style={{ marginRight: 5 }}>{status.response.duration.toFixed(3)}s</span>}
                                    {status?.response?.rawResponse !== undefined && <span title="Response Size" style={{ marginRight: 10 }}>{(status.response.rawResponse.length / 1024).toFixed(2)} KB</span>}

                                    {onMoveStep && (
                                        <>
                                            <IconButton
                                                onClick={(e) => { e.stopPropagation(); onMoveStep(step.id, 'up'); }}
                                                title="Move Up"
                                                disabled={index === 0}
                                                style={{ opacity: index === 0 ? 0.3 : 1 }}
                                            >
                                                <ArrowUp size={14} />
                                            </IconButton>
                                            <IconButton
                                                onClick={(e) => { e.stopPropagation(); onMoveStep(step.id, 'down'); }}
                                                title="Move Down"
                                                disabled={index === testCase.steps.length - 1}
                                                style={{ opacity: index === testCase.steps.length - 1 ? 0.3 : 1 }}
                                            >
                                                <ArrowDown size={14} />
                                            </IconButton>
                                        </>
                                    )}

                                    {onDeleteStep && (
                                        <IconButton
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
                                            style={{
                                                color: isConfirming ? 'var(--vscode-errorForeground)' : 'inherit',
                                                animation: isConfirming ? 'shake 0.5s' : 'none',
                                                marginLeft: 5
                                            }}
                                            title={isConfirming ? "Click to Confirm Delete" : "Delete Step"}
                                        >
                                            <Trash2 size={14} />
                                        </IconButton>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>
    );
};

export { EmptyTestCase };
