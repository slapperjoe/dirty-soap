import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { WorkflowStep } from '@shared/models';
import { SPACING_SM, SPACING_MD } from '../../styles/spacing';
import { GitBranch, AlertCircle, Plus } from 'lucide-react';
import { PrimaryButton, SecondaryButton } from '../common/Button';
import Editor from '@monaco-editor/react';

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
    color: var(--vscode-charts-green);
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

const FlexSection = styled(Section)`
    flex: 1;
    min-height: 0;
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

const InfoBox = styled.div`
    padding: ${SPACING_SM};
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    font-size: 11px;
    opacity: 0.8;
    line-height: 1.4;
    display: flex;
    align-items: center;
    gap: ${SPACING_SM};
`;

const RequestDetails = styled.div`
    padding: ${SPACING_SM};
    background: var(--vscode-textCodeBlock-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    font-size: 12px;
    
    div {
        margin-bottom: 4px;
        
        &:last-child {
            margin-bottom: 0;
        }
    }
`;

const EditorContainer = styled.div`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    flex: 1;
    min-height: 200px;
`;

const ButtonContainer = styled.div`
    display: flex;
    gap: ${SPACING_SM};
`;

interface RequestStepEditorProps {
    step: WorkflowStep;
    onUpdate: (step: WorkflowStep) => void;
    onPickRequest?: () => void;
}

export const RequestStepEditor: React.FC<RequestStepEditorProps> = ({ step, onUpdate, onPickRequest }) => {
    const [name, setName] = useState(step.name);
    const [requestBody, setRequestBody] = useState(step.requestBody || '');
    const [endpoint, setEndpoint] = useState(step.endpoint || '');

    useEffect(() => {
        setName(step.name);
        setRequestBody(step.requestBody || '');
        setEndpoint(step.endpoint || '');
    }, [step]);

    const handleSave = () => {
        onUpdate({
            ...step,
            name,
            requestBody,
            endpoint
        });
    };

    const hasRequest = step.projectName && step.interfaceName && step.operationName;

    return (
        <Container>
            <Header>
                <IconContainer>
                    <GitBranch size={20} />
                </IconContainer>
                <Title>Request Step</Title>
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

            {hasRequest ? (
                <>
                    <Section>
                        <Label>Request Details</Label>
                        <RequestDetails>
                            <div><strong>Project:</strong> {step.projectName}</div>
                            <div><strong>Interface:</strong> {step.interfaceName}</div>
                            <div><strong>Operation:</strong> {step.operationName}</div>
                        </RequestDetails>
                        {onPickRequest && (
                            <SecondaryButton onClick={onPickRequest} style={{ marginTop: SPACING_SM }}>
                                Change Request
                            </SecondaryButton>
                        )}
                    </Section>

                    <Section>
                        <Label>Endpoint URL</Label>
                        <Input
                            type="text"
                            value={endpoint}
                            onChange={(e) => setEndpoint(e.target.value)}
                            placeholder="Endpoint URL"
                        />
                        <InfoBox>
                            Leave empty to use the default endpoint from the WSDL
                        </InfoBox>
                    </Section>

                    <FlexSection>
                        <Label>Request Body (use {`{{varName}}`} for variables)</Label>
                        <EditorContainer>
                            <Editor
                                height="100%"
                                language="xml"
                                theme="vs-dark"
                                value={requestBody}
                                onChange={(value) => setRequestBody(value || '')}
                                options={{
                                    minimap: { enabled: false },
                                    lineNumbers: 'on',
                                    scrollBeyondLastLine: false,
                                    wordWrap: 'on',
                                    fontSize: 12,
                                    tabSize: 2,
                                    automaticLayout: true
                                }}
                            />
                        </EditorContainer>
                        <InfoBox>
                            Use workflow variables in the body: {`{{variableName}}`}
                        </InfoBox>
                    </FlexSection>
                </>
            ) : (
                <Section>
                    <InfoBox>
                        <AlertCircle size={16} />
                        <div>No request selected. {onPickRequest ? 'Pick a request from any project.' : 'Select a request in the workflow builder.'}</div>
                    </InfoBox>
                    {onPickRequest && (
                        <PrimaryButton onClick={onPickRequest} style={{ width: '100%' }}>
                            <Plus size={14} />
                            Pick Request
                        </PrimaryButton>
                    )}
                </Section>
            )}

            <ButtonContainer>
                <PrimaryButton onClick={handleSave}>Save Changes</PrimaryButton>
            </ButtonContainer>
        </Container>
    );
};
