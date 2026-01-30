import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { WorkflowStep } from '@shared/models';
import { SPACING_SM, SPACING_MD } from '../../styles/spacing';
import { Code } from 'lucide-react';
import { PrimaryButton } from '../common/Button';
import Editor from '@monaco-editor/react';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: ${SPACING_MD};
    padding: ${SPACING_MD};
    width: 100%;
    height: 100%;
    overflow: hidden;
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
    color: var(--vscode-charts-purple);
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
    
    code {
        background: var(--vscode-textPreformat-background);
        padding: 2px 4px;
        border-radius: 2px;
        font-family: 'Consolas', 'Courier New', monospace;
    }
`;

const EditorContainer = styled.div`
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    overflow: hidden;
    flex: 1;
    min-height: 300px;
`;

const ButtonContainer = styled.div`
    display: flex;
    gap: ${SPACING_SM};
`;

interface ScriptStepEditorProps {
    step: WorkflowStep;
    onUpdate: (step: WorkflowStep) => void;
}

export const ScriptStepEditor: React.FC<ScriptStepEditorProps> = ({ step, onUpdate }) => {
    const [name, setName] = useState(step.name);
    const [script, setScript] = useState(step.script || '// Your JavaScript code here\n// Available: variables, console.log\n');

    useEffect(() => {
        setName(step.name);
        setScript(step.script || '// Your JavaScript code here\n// Available: variables, console.log\n');
    }, [step]);

    const handleSave = () => {
        onUpdate({
            ...step,
            name,
            script
        });
    };

    return (
        <Container>
            <Header>
                <IconContainer>
                    <Code size={20} />
                </IconContainer>
                <Title>Script Step</Title>
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

            <FlexSection>
                <Label>JavaScript Code</Label>
                <EditorContainer>
                    <Editor
                        language="javascript"
                        theme="vs-dark"
                        value={script}
                        onChange={(value) => setScript(value || '')}
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
                    <strong>Available objects:</strong><br />
                    • <code>variables</code> - Read/write workflow variables: <code>variables.myVar = "value"</code><br />
                    • <code>console.log()</code> - Write to workflow execution log<br />
                    • <code>response</code> - Access previous step's response (if applicable)<br />
                    <br />
                    <strong>Example:</strong><br />
                    <code>
                        const userId = variables.userId || "default";<br />
                        console.log("Processing user:", userId);<br />
                        variables.processed = true;
                    </code>
                </InfoBox>
            </FlexSection>

            <ButtonContainer>
                <PrimaryButton onClick={handleSave}>Save Changes</PrimaryButton>
            </ButtonContainer>
        </Container>
    );
};
