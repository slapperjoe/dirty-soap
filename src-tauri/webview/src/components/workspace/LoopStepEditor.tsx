import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { WorkflowStep } from '@shared/models';
import { SPACING_SM, SPACING_MD, SPACING_XS } from '../../styles/spacing';
import { Repeat, Clock, AlertCircle, Code, GitBranch, Plus } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '../common/Button';
import { DelayStepEditor } from './DelayStepEditor';
import { ConditionStepEditor } from './ConditionStepEditor';
import { ScriptStepEditor } from './ScriptStepEditor';
import { RequestStepEditor } from './RequestStepEditor';
import { v4 as uuidv4 } from 'uuid';

const Container = styled.div`
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
    box-sizing: border-box;
`;

const LeftPanel = styled.div`
    flex: 0 0 300px;
    display: flex;
    flex-direction: column;
    gap: ${SPACING_MD};
    padding: ${SPACING_MD};
    border-right: 1px solid var(--vscode-panel-border);
    overflow-y: auto;
`;

const RightPanel = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: ${SPACING_SM};
    padding-bottom: ${SPACING_SM};
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const IconContainer = styled.div`
    color: var(--vscode-charts-blue);
`;

const Title = styled.h2`
    margin: 0;
    font-size: 16px;
    font-weight: 600;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: ${SPACING_SM};
`;

const Label = styled.label`
    font-size: 12px;
    font-weight: 600;
    opacity: 0.8;
    display: block;
`;

const Input = styled.input`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    width: 100%;
    
    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }
`;

const Select = styled.select`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 6px 8px;
    border-radius: 4px;
    font-size: 13px;
    font-family: var(--vscode-font-family);
    width: 100%;
    cursor: pointer;
    
    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }
`;

const InfoBox = styled.div`
    padding: ${SPACING_SM};
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    font-size: 11px;
    opacity: 0.8;
    line-height: 1.4;
`;

const StepsList = styled.div`
    display: flex;
    flex-direction: column;
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    max-height: 300px;
    overflow-y: auto;
`;

const StepItem = styled.div<{ $isSelected?: boolean }>`
    display: flex;
    align-items: center;
    gap: ${SPACING_SM};
    padding: ${SPACING_SM};
    border-bottom: 1px solid var(--vscode-panel-border);
    cursor: pointer;
    background: ${props => props.$isSelected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};

    &:hover {
        background: ${props => props.$isSelected ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }

    &:last-child {
        border-bottom: none;
    }
`;

const StepIcon = styled.div`
    display: flex;
    align-items: center;
    opacity: 0.7;
`;

const StepDetails = styled.div`
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
    text-transform: uppercase;
`;

const EmptySteps = styled.div`
    padding: ${SPACING_MD};
    text-align: center;
    opacity: 0.6;
    font-size: 12px;
`;

const ButtonContainer = styled.div`
    display: flex;
    gap: ${SPACING_SM};
`;

const AddStepDropdown = styled.div`
    position: relative;
    width: 100%;
`;

const DropdownButton = styled.button`
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: 1px dashed var(--vscode-panel-border);
    cursor: pointer;
    font-size: 13px;
    width: 100%;
    justify-content: center;

    &:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }
`;

const DropdownMenu = styled.div`
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--vscode-dropdown-background);
    border: 1px solid var(--vscode-dropdown-border);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    z-index: 1000;
    margin-top: 2px;
`;

const DropdownItem = styled.div`
    padding: 8px 12px;
    font-size: 13px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--vscode-dropdown-foreground);

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const EmptyStateContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: ${SPACING_MD};
    text-align: center;
    gap: ${SPACING_MD};
`;

const EmptyStateText = styled.div`
    opacity: 0.6;
    font-size: 13px;
`;

interface LoopStepEditorProps {
    step: WorkflowStep;
    onUpdate: (step: WorkflowStep) => void;
}

export const LoopStepEditor: React.FC<LoopStepEditorProps> = ({ step, onUpdate }) => {
    const [name, setName] = useState(step.name);
    const [loopType, setLoopType] = useState(step.loop?.type || 'count');
    const [count, setCount] = useState(step.loop?.count || 1);
    const [listVariable, setListVariable] = useState(step.loop?.listVariable || '');
    const [iteratorVariable, setIteratorVariable] = useState(step.loop?.iteratorVariable || 'i');
    const [maxIterations, setMaxIterations] = useState(step.loop?.maxIterations || 100);
    const [selectedNestedStepIndex, setSelectedNestedStepIndex] = useState<number | null>(null);
    const [addStepDropdownOpen, setAddStepDropdownOpen] = useState(false);

    useEffect(() => {
        setName(step.name);
        setLoopType(step.loop?.type || 'count');
        setCount(step.loop?.count || 1);
        setListVariable(step.loop?.listVariable || '');
        setIteratorVariable(step.loop?.iteratorVariable || 'i');
        setMaxIterations(step.loop?.maxIterations || 100);
        setSelectedNestedStepIndex(null);
    }, [step]);

    const handleSave = () => {
        onUpdate({
            ...step,
            name,
            loop: {
                type: loopType as any,
                count: loopType === 'count' ? count : undefined,
                listVariable: loopType === 'list' ? listVariable : undefined,
                iteratorVariable,
                maxIterations
            }
        });
    };

    const handleAddNestedStep = (type: WorkflowStep['type']) => {
        const newStep: WorkflowStep = {
            id: uuidv4(),
            name: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Step`,
            type,
            order: (step.loopSteps?.length || 0),
            extractors: []
        };

        if (type === 'delay') {
            newStep.delayMs = 1000;
        } else if (type === 'condition') {
            newStep.condition = {
                id: uuidv4(),
                expression: '',
                operator: 'equals',
                expectedValue: ''
            };
        } else if (type === 'loop') {
            newStep.loop = {
                type: 'count',
                count: 1,
                maxIterations: 100,
                iteratorVariable: 'i'
            };
            newStep.loopSteps = [];
        } else if (type === 'script') {
            newStep.script = '// Your JavaScript code here\n';
        }

        onUpdate({
            ...step,
            loopSteps: [...(step.loopSteps || []), newStep]
        });
        
        setAddStepDropdownOpen(false);
        setSelectedNestedStepIndex((step.loopSteps?.length || 0)); // Select the newly added step
    };

    const handleUpdateNestedStep = (updatedNestedStep: WorkflowStep) => {
        if (selectedNestedStepIndex === null) return;
        
        const updatedLoopSteps = [...(step.loopSteps || [])];
        updatedLoopSteps[selectedNestedStepIndex] = updatedNestedStep;
        
        onUpdate({
            ...step,
            loopSteps: updatedLoopSteps
        });
    };

    const getStepIcon = (stepType: string) => {
        switch (stepType) {
            case 'delay': return <Clock size={14} />;
            case 'condition': return <AlertCircle size={14} />;
            case 'loop': return <Repeat size={14} />;
            case 'script': return <Code size={14} />;
            default: return <GitBranch size={14} />;
        }
    };

    const renderNestedStepEditor = () => {
        if (selectedNestedStepIndex === null || !step.loopSteps) return null;
        
        const nestedStep = step.loopSteps[selectedNestedStepIndex];
        if (!nestedStep) return null;

        switch (nestedStep.type) {
            case 'request':
                return <RequestStepEditor step={nestedStep} onUpdate={handleUpdateNestedStep} />;
            case 'delay':
                return <DelayStepEditor step={nestedStep} onUpdate={handleUpdateNestedStep} />;
            case 'condition':
                return <ConditionStepEditor step={nestedStep} onUpdate={handleUpdateNestedStep} />;
            case 'loop':
                return <LoopStepEditor step={nestedStep} onUpdate={handleUpdateNestedStep} />;
            case 'script':
                return <ScriptStepEditor step={nestedStep} onUpdate={handleUpdateNestedStep} />;
            default:
                return null;
        }
    };

    return (
        <Container>
            <LeftPanel>
                <Header>
                    <IconContainer>
                        <Repeat size={20} />
                    </IconContainer>
                    <Title>Loop Configuration</Title>
                </Header>

                <Section>
                    <Label>Step Name</Label>
                    <Input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter step name"
                    />
                </Section>

                <Section>
                    <Label>Loop Type</Label>
                    <Select value={loopType} onChange={(e) => setLoopType(e.target.value as any)}>
                        <option value="count">Fixed Count</option>
                        <option value="list">Iterate List</option>
                        <option value="while">While Condition</option>
                    </Select>
                </Section>

                {loopType === 'count' && (
                    <Section>
                        <Label>Number of Iterations</Label>
                        <Input
                            type="number"
                            min="1"
                            value={count}
                            onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                            placeholder="Number of times to loop"
                        />
                    </Section>
                )}

                {loopType === 'list' && (
                    <Section>
                        <Label>List Variable</Label>
                        <Input
                            type="text"
                            value={listVariable}
                            onChange={(e) => setListVariable(e.target.value)}
                            placeholder="e.g., {{items}} or {{users}}"
                        />
                        <InfoBox>
                            Specify a workflow variable containing an array to iterate over
                        </InfoBox>
                    </Section>
                )}

                {loopType === 'while' && (
                    <InfoBox>
                        While loops require condition configuration. This will be available in a future update.
                    </InfoBox>
                )}

                <Section>
                    <Label>Iterator Variable Name</Label>
                    <Input
                        type="text"
                        value={iteratorVariable}
                        onChange={(e) => setIteratorVariable(e.target.value)}
                        placeholder="Variable name for current iteration"
                    />
                    <InfoBox>
                        This variable will be available in subsequent steps: {`{{${iteratorVariable}}}`}
                    </InfoBox>
                </Section>

                <Section>
                    <Label>Maximum Iterations (Safety Limit)</Label>
                    <Input
                        type="number"
                        min="1"
                        max="10000"
                        value={maxIterations}
                        onChange={(e) => setMaxIterations(parseInt(e.target.value) || 100)}
                        placeholder="Maximum iterations allowed"
                    />
                    <InfoBox>
                        Loop will stop after this many iterations to prevent infinite loops
                    </InfoBox>
                </Section>

                <Section>
                    <Label>Steps in Loop ({(step.loopSteps || []).length})</Label>
                    <StepsList>
                        {(!step.loopSteps || step.loopSteps.length === 0) ? (
                            <EmptySteps>
                                No steps in loop yet.<br />
                                Add steps in the workflow builder.
                            </EmptySteps>
                        ) : (
                            step.loopSteps.map((nestedStep, index) => (
                                <StepItem
                                    key={nestedStep.id}
                                    $isSelected={selectedNestedStepIndex === index}
                                    onClick={() => setSelectedNestedStepIndex(index)}
                                >
                                    <StepIcon>{getStepIcon(nestedStep.type)}</StepIcon>
                                    <StepDetails>
                                        <StepName>{nestedStep.name}</StepName>
                                        <StepType>{nestedStep.type}</StepType>
                                    </StepDetails>
                                </StepItem>
                            ))
                        )}
                    </StepsList>
                    <InfoBox>
                        Click a step to view/edit it on the right. Add/remove steps in the workflow builder.
                    </InfoBox>
                </Section>

                <ButtonContainer>
                    <PrimaryButton onClick={handleSave}>Save Loop Config</PrimaryButton>
                </ButtonContainer>
            </LeftPanel>

            <RightPanel>
                {selectedNestedStepIndex !== null && step.loopSteps && step.loopSteps[selectedNestedStepIndex] ? (
                    renderNestedStepEditor()
                ) : (
                    <EmptyStateContainer>
                        <EmptyStateText>
                            Select a step from the list to view and edit it,<br />
                            or add a new step to the loop
                        </EmptyStateText>
                        <AddStepDropdown>
                            <DropdownButton 
                                onClick={() => setAddStepDropdownOpen(!addStepDropdownOpen)}
                            >
                                <Plus size={14} />
                                Add Step to Loop
                            </DropdownButton>
                            {addStepDropdownOpen && (
                                <DropdownMenu>
                                    <DropdownItem onClick={() => handleAddNestedStep('request')}>
                                        <Plus size={12} />
                                        Request
                                    </DropdownItem>
                                    <DropdownItem onClick={() => handleAddNestedStep('delay')}>
                                        <Plus size={12} />
                                        Delay
                                    </DropdownItem>
                                    <DropdownItem onClick={() => handleAddNestedStep('condition')}>
                                        <Plus size={12} />
                                        Condition
                                    </DropdownItem>
                                    <DropdownItem onClick={() => handleAddNestedStep('loop')}>
                                        <Plus size={12} />
                                        Nested Loop
                                    </DropdownItem>
                                    <DropdownItem onClick={() => handleAddNestedStep('script')}>
                                        <Plus size={12} />
                                        Script
                                    </DropdownItem>
                                </DropdownMenu>
                            )}
                        </AddStepDropdown>
                    </EmptyStateContainer>
                )}
            </RightPanel>
        </Container>
    );
};
