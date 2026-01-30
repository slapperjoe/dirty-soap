import React, { useState } from 'react';
import styled from 'styled-components';
import { Clock, Save } from 'lucide-react';
import { WorkflowStep } from '@shared/models';
import { SPACING_SM, SPACING_MD, SPACING_LG } from '../../styles/spacing';
import { PrimaryButton, SecondaryButton } from '../common/Button';

const Container = styled.div`
    display: flex;
    flex-direction: column;
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
    margin-bottom: ${SPACING_LG};
    padding-bottom: ${SPACING_MD};
    border-bottom: 1px solid var(--vscode-panel-border);
`;

const Icon = styled.div`
    display: flex;
    align-items: center;
    color: var(--vscode-symbolIcon-variableForeground);
`;

const Title = styled.h2`
    margin: 0;
    color: var(--vscode-foreground);
    font-size: 18px;
    font-weight: 600;
`;

const Section = styled.div`
    margin-bottom: ${SPACING_LG};
`;

const Label = styled.label`
    display: block;
    margin-bottom: ${SPACING_SM};
    color: var(--vscode-foreground);
    font-size: 13px;
    font-weight: 500;
`;

const Input = styled.input`
    width: 100%;
    padding: ${SPACING_SM};
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 2px;
    font-size: 13px;
    font-family: inherit;

    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const Description = styled.div`
    margin-top: 4px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
`;

const Actions = styled.div`
    display: flex;
    gap: ${SPACING_SM};
    justify-content: flex-end;
    padding-top: ${SPACING_MD};
    border-top: 1px solid var(--vscode-panel-border);
`;

const PreviewBox = styled.div`
    padding: ${SPACING_MD};
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-top: ${SPACING_SM};
`;

interface DelayStepEditorProps {
    step: WorkflowStep;
    onUpdate: (step: WorkflowStep) => void;
    onCancel?: () => void;
}

export const DelayStepEditor: React.FC<DelayStepEditorProps> = ({
    step,
    onUpdate,
    onCancel
}) => {
    const [delayMs, setDelayMs] = useState(step.delayMs || 1000);
    const [name, setName] = useState(step.name || 'Delay');

    const handleSave = () => {
        onUpdate({
            ...step,
            name,
            delayMs
        });
    };

    const formatDuration = (ms: number): string => {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
        return `${(ms / 3600000).toFixed(1)}h`;
    };

    return (
        <Container>
            <Header>
                <Icon>
                    <Clock size={24} />
                </Icon>
                <Title>Delay Step</Title>
            </Header>

            <Section>
                <Label>Step Name</Label>
                <Input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Delay step name"
                />
                <Description>
                    A friendly name for this delay step
                </Description>
            </Section>

            <Section>
                <Label>Delay Duration (milliseconds)</Label>
                <Input
                    type="number"
                    value={delayMs}
                    onChange={(e) => setDelayMs(Math.max(0, parseInt(e.target.value) || 0))}
                    min="0"
                    step="100"
                />
                <Description>
                    The workflow will pause for this duration before continuing to the next step
                </Description>
                <PreviewBox>
                    ⏰ This step will wait for <strong>{formatDuration(delayMs)}</strong>
                </PreviewBox>
            </Section>

            <Section>
                <Label>Common Durations</Label>
                <div style={{ display: 'flex', gap: SPACING_SM, flexWrap: 'wrap', marginTop: SPACING_SM }}>
                    {[
                        { label: '100ms', value: 100 },
                        { label: '500ms', value: 500 },
                        { label: '1s', value: 1000 },
                        { label: '2s', value: 2000 },
                        { label: '5s', value: 5000 },
                        { label: '10s', value: 10000 },
                        { label: '30s', value: 30000 },
                        { label: '1m', value: 60000 }
                    ].map(({ label, value }) => (
                        <SecondaryButton
                            key={value}
                            onClick={() => setDelayMs(value)}
                            style={{ fontSize: '11px', padding: '4px 8px' }}
                        >
                            {label}
                        </SecondaryButton>
                    ))}
                </div>
            </Section>

            <Actions>
                {onCancel && (
                    <SecondaryButton onClick={onCancel}>
                        Cancel
                    </SecondaryButton>
                )}
                <PrimaryButton onClick={handleSave}>
                    <Save size={14} />
                    Save Changes
                </PrimaryButton>
            </Actions>
        </Container>
    );
};
