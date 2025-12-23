import React from 'react';
import styled from 'styled-components';
import { Trash2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { SoapUIAssertion } from '../models';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    padding: 10px;
    height: 100%;
    overflow-y: auto;
    background-color: var(--vscode-editor-background);
`;

const Toolbar = styled.div`
    display: flex;
    gap: 10px;
    margin-bottom: 10px;
`;

const Button = styled.button`
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 4px 8px;
    border-radius: 2px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    &:hover { background: var(--vscode-button-hoverBackground); }
`;

const AssertionList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 5px;
`;

const AssertionItem = styled.div`
    display: flex;
    align-items: center;
    padding: 8px;
    background: var(--vscode-list-hoverBackground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    gap: 10px;
`;

const IconWrapper = styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
`;

const Details = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
`;

const Title = styled.div`
    font-weight: bold;
`;

const ConfigText = styled.div`
    opacity: 0.8;
`;

const Input = styled.input`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 2px 4px;
    margin-left: 5px;
`;

const Select = styled.select`
    background-color: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 4px;
    outline: none;
    height: 26px;
    box-sizing: border-box;
    cursor: pointer;
    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

interface AssertionsPanelProps {
    assertions: SoapUIAssertion[];
    onChange: (assertions: SoapUIAssertion[]) => void;
    lastResult?: any[]; // Results from last run
}

export const AssertionsPanel: React.FC<AssertionsPanelProps> = ({ assertions, onChange, lastResult }) => {

    const handleAdd = (type: SoapUIAssertion['type']) => {
        const newAssertion: SoapUIAssertion = {
            id: generateId(),
            type,
            name: type,
            configuration: {}
        };
        // Set defaults
        if (type === 'Response SLA') newAssertion.configuration = { sla: '200' };
        if (type === 'Simple Contains') newAssertion.configuration = { token: '', ignoreCase: true };
        if (type === 'Simple Not Contains') newAssertion.configuration = { token: '', ignoreCase: true };

        onChange([...assertions, newAssertion]);
    };

    const handleRemove = (id: string) => {
        onChange(assertions.filter(a => a.id !== id));
    };

    const updateConfig = (id: string, key: string, value: any) => {
        onChange(assertions.map(a => {
            if (a.id === id) {
                return { ...a, configuration: { ...a.configuration, [key]: value } };
            }
            return a;
        }));
    };

    const getStatus = (id: string) => {
        if (!lastResult) return null;
        // console.log('Checking status for', id, 'in', lastResult);
        const res = lastResult.find(r => r.id === id);
        return res ? res.status : null;
    };

    return (
        <Container>
            <Toolbar>
                <Select onChange={(e) => handleAdd(e.target.value as any)} value="">
                    <option value="" disabled style={{ color: 'var(--vscode-dropdown-foreground)' }}>+ Add Assertion</option>
                    <option value="Simple Contains">Contains</option>
                    <option value="Simple Not Contains">Not Contains</option>
                    <option value="Response SLA">Response SLA</option>
                    {/* <option value="XPath Match">XPath Match</option> */}
                </Select>
            </Toolbar>

            <AssertionList>
                {assertions.length === 0 && <div style={{ opacity: 0.5, fontStyle: 'italic' }}>No assertions defined.</div>}

                {assertions.map((a, i) => {
                    const status = getStatus(a.id || '');
                    return (
                        <AssertionItem key={a.id || i}>
                            <IconWrapper title={status || 'Not Run'}>
                                {status === 'PASS' ? <CheckCircle2 size={18} color="var(--vscode-testing-iconPassed)" /> :
                                    status === 'FAIL' ? <XCircle size={18} color="var(--vscode-testing-iconFailed)" /> :
                                        <Clock size={18} style={{ opacity: 0.5 }} />}
                            </IconWrapper>
                            <Details>
                                <Title>{a.type}</Title>
                                <ConfigText>
                                    {(a.type === 'Simple Contains' || a.type === 'Simple Not Contains') && (
                                        <>
                                            Token:
                                            <Input
                                                value={a.configuration?.token || ''}
                                                onChange={(e) => updateConfig(a.id!, 'token', e.target.value)}
                                                placeholder="Text to check"
                                            />
                                            <label style={{ marginLeft: 10 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={a.configuration?.ignoreCase}
                                                    onChange={(e) => updateConfig(a.id!, 'ignoreCase', e.target.checked)}
                                                /> Ignore Case
                                            </label>
                                        </>
                                    )}
                                    {a.type === 'Response SLA' && (
                                        <>
                                            Limit (ms):
                                            <Input
                                                type="number"
                                                value={a.configuration?.sla || ''}
                                                onChange={(e) => updateConfig(a.id!, 'sla', e.target.value)}
                                                style={{ width: 60 }}
                                            />
                                        </>
                                    )}
                                </ConfigText>
                            </Details>
                            <Button onClick={() => handleRemove(a.id!)} title="Delete Assertion" style={{ background: 'transparent', color: 'var(--vscode-descriptionForeground)' }}>
                                <Trash2 size={16} />
                            </Button>
                        </AssertionItem>
                    );
                })}
            </AssertionList>
        </Container>
    );
};
