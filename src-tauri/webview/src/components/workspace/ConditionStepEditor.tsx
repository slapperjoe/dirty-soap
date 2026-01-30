import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { WorkflowStep } from '@shared/models';
import { SPACING_SM, SPACING_MD } from '../../styles/spacing';
import { AlertCircle } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '../common/Button';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: ${SPACING_MD};
    padding: ${SPACING_MD};
    width: 100%;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
`;

const Header = styled.div`
    display: flex;
    align-items: center;
    gap: ${SPACING_SM};
    padding-bottom: ${SPACING_SM};
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const IconContainer = styled.div`
    color: var(--vscode-charts-yellow);
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

const PreviewBox = styled.div`
    padding: ${SPACING_MD};
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12px;
    color: var(--vscode-editor-foreground);
    white-space: pre-wrap;
    word-break: break-word;
`;

const ButtonContainer = styled.div`
    display: flex;
    gap: ${SPACING_SM};
    margin-top: auto;
`;

interface ConditionStepEditorProps {
    step: WorkflowStep;
    onUpdate: (step: WorkflowStep) => void;
}

export const ConditionStepEditor: React.FC<ConditionStepEditorProps> = ({ step, onUpdate }) => {
    const [name, setName] = useState(step.name);
    const [expression, setExpression] = useState(step.condition?.expression || '');
    const [operator, setOperator] = useState(step.condition?.operator || 'equals');
    const [value, setValue] = useState(step.condition?.expectedValue || '');

    useEffect(() => {
        setName(step.name);
        setExpression(step.condition?.expression || '');
        setOperator(step.condition?.operator || 'equals');
        setValue(step.condition?.expectedValue || '');
    }, [step]);

    const handleSave = () => {
        onUpdate({
            ...step,
            name,
            condition: {
                id: step.condition?.id || step.id,
                expression,
                operator: operator as any,
                expectedValue: value
            }
        });
    };

    const getPreviewText = () => {
        if (!expression) return 'No condition configured';
        
        const operatorText = {
            equals: '==',
            notEquals: '!=',
            contains: 'contains',
            notContains: 'does not contain',
            greaterThan: '>',
            lessThan: '<',
            exists: 'exists',
            notExists: 'does not exist'
        };

        if (operator === 'exists' || operator === 'notExists') {
            return `if (${expression} ${operatorText[operator]}) { continue } else { skip remaining steps }`;
        }

        return `if (${expression} ${operatorText[operator]} "${value}") { continue } else { skip remaining steps }`;
    };

    return (
        <Container>
            <Header>
                <IconContainer>
                    <AlertCircle size={20} />
                </IconContainer>
                <Title>Condition Step</Title>
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
                <Label>Expression / Variable</Label>
                <Input
                    type="text"
                    value={expression}
                    onChange={(e) => setExpression(e.target.value)}
                    placeholder="e.g., {{status}} or {{responseCode}}"
                />
                <InfoBox>
                    Reference workflow variables using {`{{variableName}}`} syntax
                </InfoBox>
            </Section>

            <Section>
                <Label>Operator</Label>
                <Select value={operator} onChange={(e) => setOperator(e.target.value as any)}>
                    <option value="equals">Equals</option>
                    <option value="notEquals">Not Equals</option>
                    <option value="contains">Contains</option>
                    <option value="notContains">Not Contains</option>
                    <option value="greaterThan">Greater Than</option>
                    <option value="lessThan">Less Than</option>
                    <option value="exists">Exists</option>
                    <option value="notExists">Not Exists</option>
                </Select>
            </Section>

            {operator !== 'exists' && operator !== 'notExists' && (
                <Section>
                    <Label>Compare Value</Label>
                    <Input
                        type="text"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="Value to compare against"
                    />
                </Section>
            )}

            <Section>
                <Label>Preview</Label>
                <PreviewBox>{getPreviewText()}</PreviewBox>
                <InfoBox>
                    Note: Branching to specific steps not yet fully implemented. If condition is false, remaining steps will be skipped.
                </InfoBox>
            </Section>

            <ButtonContainer>
                <PrimaryButton onClick={handleSave}>Save Changes</PrimaryButton>
            </ButtonContainer>
        </Container>
    );
};
