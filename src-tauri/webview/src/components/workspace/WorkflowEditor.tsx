import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { Workflow, WorkflowStep, ApinoxProject } from '@shared/models';
import { SPACING_SM, SPACING_MD, SPACING_XS } from '../../styles/spacing';
import { GripVertical, Trash2, Plus, ChevronRight, ChevronDown, Clock, AlertCircle, Repeat, Code, FileText } from 'lucide-react';
import { PrimaryButton, SecondaryButton, IconButton } from '../common/Button';
import { v4 as uuidv4 } from 'uuid';
import { DelayStepEditor } from './DelayStepEditor';
import { ConditionStepEditor } from './ConditionStepEditor';
import { LoopStepEditor } from './LoopStepEditor';
import { ScriptStepEditor } from './ScriptStepEditor';
import { RequestStepEditor } from './RequestStepEditor';
import { WorkflowPropertiesPanel } from './WorkflowPropertiesPanel';
import { PickRequestModal, PickRequestItem } from '../modals/PickRequestModal';

const Container = styled.div`
    display: flex;
    height: 100%;
    overflow: hidden;
    width:100%
`;

const StepsPanel = styled.div`
    flex: 0 0 350px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
    overflow: hidden;
`;

const StepsPanelHeader = styled.div`
    padding: ${SPACING_MD};
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
`;

const StepsPanelTitle = styled.h2`
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    opacity: 0.8;
`;

const StepsList = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: ${SPACING_SM};
`;

const StepItem = styled.div<{ $selected?: boolean; $dragging?: boolean; $nested?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${SPACING_XS};
    padding: ${SPACING_SM};
    margin-bottom: ${SPACING_XS};
    margin-left: ${props => props.$nested ? '24px' : '0'};
    background: ${props => props.$selected 
        ? 'var(--vscode-list-activeSelectionBackground)' 
        : 'var(--vscode-sideBar-background)'};
    border: 1px solid ${props => props.$selected 
        ? 'var(--vscode-list-activeSelectionForeground)' 
        : 'var(--vscode-panel-border)'};
    border-left: ${props => props.$nested ? '2px solid var(--vscode-charts-blue)' : 'inherit'};
    border-radius: 4px;
    cursor: ${props => props.$dragging ? 'grabbing' : 'pointer'};
    opacity: ${props => props.$dragging ? '0.5' : '1'};
    user-select: none;
    
    &:hover {
        background: ${props => props.$selected 
            ? 'var(--vscode-list-activeSelectionBackground)' 
            : 'var(--vscode-list-hoverBackground)'};
        
        .delete-icon {
            opacity: 1;
        }
    }
`;

const DragHandle = styled.div`
    color: var(--vscode-foreground);
    opacity: 0.5;
    cursor: grab;
    display: flex;
    align-items: center;
    
    &:active {
        cursor: grabbing;
    }
`;

const StepNumber = styled.span`
    font-size: 11px;
    opacity: 0.6;
    min-width: 30px;
`;

const StepIcon = styled.div`
    color: var(--vscode-charts-blue);
    display: flex;
    align-items: center;
`;

const StepInfo = styled.div`
    flex: 1;
    min-width: 0;
`;

const StepName = styled.div`
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const StepType = styled.div`
    font-size: 11px;
    opacity: 0.6;
`;

const DeleteIcon = styled.div`
    opacity: 0;
    color: var(--vscode-errorForeground);
    cursor: pointer;
    transition: opacity 0.2s;
    display: flex;
    align-items: center;
    
    &:hover {
        opacity: 1 !important;
    }
`;

const ExpandIcon = styled.div`
    cursor: pointer;
    display: flex;
    align-items: center;
    color: var(--vscode-foreground);
    opacity: 0.6;
    
    &:hover {
        opacity: 1;
    }
`;

const AddStepContainer = styled.div`
    padding: ${SPACING_SM};
    border-top: 1px solid var(--vscode-panel-border);
    position: relative;
`;

const AddStepButton = styled.button`
    width: 100%;
    padding: ${SPACING_SM};
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px solid var(--vscode-button-border);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${SPACING_XS};
    font-size: 13px;
    font-family: var(--vscode-font-family);
    
    &:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }
`;

const Dropdown = styled.div`
    position: absolute;
    bottom: 100%;
    left: ${SPACING_SM};
    right: ${SPACING_SM};
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    margin-bottom: 4px;
`;

const DropdownItem = styled.div`
    padding: ${SPACING_SM};
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: ${SPACING_SM};
    font-size: 13px;
    
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
    
    &:first-child {
        border-radius: 4px 4px 0 0;
    }
    
    &:last-child {
        border-radius: 0 0 4px 4px;
    }
`;

const EditorPanel = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--vscode-editor-background);
`;

interface WorkflowEditorProps {
    workflow: Workflow;
    projects: ApinoxProject[];
    onUpdate: (workflow: Workflow) => void;
    onSelectStep?: (step: WorkflowStep) => void;
}

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({
    workflow,
    projects,
    onUpdate
}) => {
    const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const [addStepDropdownOpen, setAddStepDropdownOpen] = useState(false);
    const [collapsedLoops, setCollapsedLoops] = useState<Set<string>>(new Set());
    const [showRequestPicker, setShowRequestPicker] = useState(false);

    // Build request picker items from all projects
    const pickRequestItems = useMemo<PickRequestItem[]>(() => {
        const items: PickRequestItem[] = [];
        
        projects.forEach(project => {
            if (!project.interfaces) return;
            
            project.interfaces.forEach(iface => {
                if (!iface.operations) return;
                
                iface.operations.forEach(operation => {
                    if (!operation.requests) return;
                    
                    operation.requests.forEach(request => {
                        items.push({
                            projectName: project.name,
                            interfaceName: iface.name,
                            operationName: operation.name,
                            requestName: request.name,
                            request
                        });
                    });
                });
            });
        });
        
        return items;
    }, [projects]);

    const handleUpdateWorkflow = (updates: Partial<Workflow>) => {
        onUpdate({ ...workflow, ...updates });
    };

    const handleUpdateSteps = (newSteps: WorkflowStep[]) => {
        // Renumber steps
        const numberedSteps = newSteps.map((step, index) => ({
            ...step,
            order: index
        }));
        onUpdate({ ...workflow, steps: numberedSteps });
    };

    const handleAddStep = (type: WorkflowStep['type']) => {
        const newStep: WorkflowStep = {
            id: uuidv4(),
            name: `New ${type} Step`,
            type,
            order: workflow.steps.length,
            extractors: []
        };

        // Initialize based on type
        switch (type) {
            case 'delay':
                newStep.delayMs = 1000;
                break;
            case 'condition':
                newStep.condition = {
                    id: uuidv4(),
                    expression: '',
                    operator: 'equals',
                    expectedValue: ''
                };
                break;
            case 'loop':
                newStep.loop = {
                    type: 'count',
                    count: 1,
                    maxIterations: 100,
                    iteratorVariable: 'i'
                };
                newStep.loopSteps = [];
                break;
            case 'script':
                newStep.script = '// Your JavaScript code here\n';
                break;
        }

        const newSteps = [...workflow.steps, newStep];
        handleUpdateSteps(newSteps);
        setSelectedStepIndex(newSteps.length - 1);
        setAddStepDropdownOpen(false);
    };

    const handleDeleteStep = (index: number) => {
        const newSteps = workflow.steps.filter((_, i) => i !== index);
        handleUpdateSteps(newSteps);
        if (selectedStepIndex === index) {
            setSelectedStepIndex(null);
        } else if (selectedStepIndex !== null && selectedStepIndex > index) {
            setSelectedStepIndex(selectedStepIndex - 1);
        }
    };

    const handleUpdateStep = (index: number, updates: Partial<WorkflowStep>) => {
        const newSteps = [...workflow.steps];
        newSteps[index] = { ...newSteps[index], ...updates };
        handleUpdateSteps(newSteps);
    };

    const handleSelectRequest = (item: PickRequestItem) => {
        if (selectedStepIndex === null) return;
        
        const requestData: Partial<WorkflowStep> = {
            projectName: item.projectName,
            interfaceName: item.interfaceName,
            operationName: item.operationName,
            requestName: item.request.name,
            endpoint: item.request.endpoint,
            requestBody: item.request.request,
            headers: item.request.headers || {},
            contentType: item.request.contentType,
            requestType: item.request.requestType,
            bodyType: item.request.bodyType,
            httpMethod: item.request.httpMethod,
            method: item.request.method,
            name: `Request: ${item.request.name}`
        };
        
        handleUpdateStep(selectedStepIndex, requestData);
        setShowRequestPicker(false);
    };

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedIndex === null || draggedIndex === index) return;

        const newSteps = [...workflow.steps];
        const draggedItem = newSteps[draggedIndex];
        newSteps.splice(draggedIndex, 1);
        newSteps.splice(index, 0, draggedItem);

        handleUpdateSteps(newSteps);
        setDraggedIndex(index);
    };

    const handleDragEnd = () => {
        setDraggedIndex(null);
    };

    const toggleLoopCollapse = (stepId: string) => {
        const newCollapsed = new Set(collapsedLoops);
        if (newCollapsed.has(stepId)) {
            newCollapsed.delete(stepId);
        } else {
            newCollapsed.add(stepId);
        }
        setCollapsedLoops(newCollapsed);
    };

    const getStepIcon = (type: WorkflowStep['type']) => {
        switch (type) {
            case 'request': return <FileText size={16} />;
            case 'delay': return <Clock size={16} />;
            case 'condition': return <AlertCircle size={16} />;
            case 'loop': return <Repeat size={16} />;
            case 'script': return <Code size={16} />;
            default: return null;
        }
    };

    const getStepNumber = (index: number, nestedIndex?: number) => {
        if (nestedIndex !== undefined) {
            return `#${index + 1}.${nestedIndex + 1}`;
        }
        return `#${index + 1}`;
    };

    const renderStep = (step: WorkflowStep, index: number, nested: boolean = false) => {
        const isCollapsed = collapsedLoops.has(step.id);
        const hasNestedSteps = step.type === 'loop' && step.loopSteps && step.loopSteps.length > 0;

        return (
            <React.Fragment key={step.id}>
                <StepItem
                    $selected={!nested && selectedStepIndex === index}
                    $dragging={draggedIndex === index}
                    $nested={nested}
                    draggable={!nested}
                    onDragStart={() => !nested && handleDragStart(index)}
                    onDragOver={(e) => !nested && handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    onClick={() => !nested && setSelectedStepIndex(index)}
                >
                    {!nested && (
                        <DragHandle>
                            <GripVertical size={16} />
                        </DragHandle>
                    )}
                    {hasNestedSteps && (
                        <ExpandIcon onClick={(e) => {
                            e.stopPropagation();
                            toggleLoopCollapse(step.id);
                        }}>
                            {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        </ExpandIcon>
                    )}
                    <StepNumber>{getStepNumber(index)}</StepNumber>
                    <StepIcon>{getStepIcon(step.type)}</StepIcon>
                    <StepInfo>
                        <StepName>{step.name}</StepName>
                        <StepType>{step.type}</StepType>
                    </StepInfo>
                    <DeleteIcon 
                        className="delete-icon"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteStep(index);
                        }}
                    >
                        <Trash2 size={14} />
                    </DeleteIcon>
                </StepItem>
                {hasNestedSteps && !isCollapsed && step.loopSteps!.map((nestedStep, nestedIndex) => (
                    <div key={nestedStep.id} style={{ marginLeft: '24px' }}>
                        <StepItem $nested>
                            <StepNumber>{getStepNumber(index, nestedIndex)}</StepNumber>
                            <StepIcon>{getStepIcon(nestedStep.type)}</StepIcon>
                            <StepInfo>
                                <StepName>{nestedStep.name}</StepName>
                                <StepType>{nestedStep.type}</StepType>
                            </StepInfo>
                        </StepItem>
                    </div>
                ))}
            </React.Fragment>
        );
    };

    const renderEditor = () => {
        if (selectedStepIndex === null) {
            return (
                <WorkflowPropertiesPanel
                    workflow={workflow}
                    onUpdate={handleUpdateWorkflow}
                />
            );
        }

        const step = workflow.steps[selectedStepIndex];
        if (!step) return null;

        switch (step.type) {
            case 'delay':
                return (
                    <DelayStepEditor
                        step={step}
                        onUpdate={(updates) => handleUpdateStep(selectedStepIndex, updates)}
                    />
                );
            case 'condition':
                return (
                    <ConditionStepEditor
                        step={step}
                        onUpdate={(updates) => handleUpdateStep(selectedStepIndex, updates)}
                    />
                );
            case 'loop':
                return (
                    <LoopStepEditor
                        step={step}
                        onUpdate={(updates) => handleUpdateStep(selectedStepIndex, updates)}
                    />
                );
            case 'script':
                return (
                    <ScriptStepEditor
                        step={step}
                        onUpdate={(updates) => handleUpdateStep(selectedStepIndex, updates)}
                    />
                );
            case 'request':
                return (
                    <RequestStepEditor
                        step={step}
                        onUpdate={(updates) => handleUpdateStep(selectedStepIndex, updates)}
                        onPickRequest={() => setShowRequestPicker(true)}
                    />
                );
            default:
                return <div>Unknown step type</div>;
        }
    };

    return (
        <>
            <Container>
            <StepsPanel>
                <StepsPanelHeader>
                    <StepsPanelTitle>Workflow Steps</StepsPanelTitle>
                </StepsPanelHeader>
                <StepsList>
                    {workflow.steps.map((step, index) => renderStep(step, index))}
                </StepsList>
                <AddStepContainer>
                    {addStepDropdownOpen && (
                        <Dropdown>
                            <DropdownItem onClick={() => handleAddStep('request')}>
                                <FileText size={16} /> Request
                            </DropdownItem>
                            <DropdownItem onClick={() => handleAddStep('delay')}>
                                <Clock size={16} /> Delay
                            </DropdownItem>
                            <DropdownItem onClick={() => handleAddStep('condition')}>
                                <AlertCircle size={16} /> Condition
                            </DropdownItem>
                            <DropdownItem onClick={() => handleAddStep('loop')}>
                                <Repeat size={16} /> Loop
                            </DropdownItem>
                            <DropdownItem onClick={() => handleAddStep('script')}>
                                <Code size={16} /> Script
                            </DropdownItem>
                        </Dropdown>
                    )}
                    <AddStepButton onClick={() => setAddStepDropdownOpen(!addStepDropdownOpen)}>
                        <Plus size={16} /> Add Step
                    </AddStepButton>
                </AddStepContainer>
            </StepsPanel>
            <EditorPanel>
                {renderEditor()}
            </EditorPanel>
        </Container>
        <PickRequestModal
            isOpen={showRequestPicker}
            onClose={() => setShowRequestPicker(false)}
            onSelect={handleSelectRequest}
            items={pickRequestItems}
            title="Pick Request for Workflow Step"
        />
        </>
    );
};
