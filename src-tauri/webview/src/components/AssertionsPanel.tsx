import React from 'react';
import styled from 'styled-components';
import { Trash2, CheckCircle2, XCircle, Clock, Play } from 'lucide-react';
import { Assertion } from '@shared/models';
import { StatusCodePicker } from './StatusCodePicker';
import Editor from '@monaco-editor/react';
import { ScriptPlaygroundModal } from './modals/ScriptPlaygroundModal';

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
    assertions: Assertion[];
    onChange: (assertions: Assertion[]) => void;
    lastResult?: any[]; // Results from last run
}

export const AssertionsPanel: React.FC<AssertionsPanelProps> = ({ assertions, onChange, lastResult }) => {
    const [playgroundScript, setPlaygroundScript] = React.useState<string | null>(null);
    const [playgroundAssertionId, setPlaygroundAssertionId] = React.useState<string | null>(null);

    const handleAdd = (type: Assertion['type']) => {
        const newAssertion: Assertion = {
            id: generateId(),
            type,
            name: type,
            configuration: {}
        };
        // Set defaults
        if (type === 'Response SLA') newAssertion.configuration = { sla: '200' };
        if (type === 'Simple Contains') newAssertion.configuration = { token: '', ignoreCase: true };
        if (type === 'Simple Not Contains') newAssertion.configuration = { token: '', ignoreCase: true };
        if (type === 'XPath Match') newAssertion.configuration = { xpath: '', expectedContent: '' };
        if (type === 'SOAP Fault') newAssertion.configuration = { expectFault: false };
        if (type === 'HTTP Status') newAssertion.configuration = { expectedStatus: '200' };
        if (type === 'Script') newAssertion.configuration = { script: '// return true to pass, false to fail\n// Available: response, statusCode\nreturn response.includes("Success");' };

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
                    <option value="XPath Match">XPath Match</option>
                    <option value="SOAP Fault">SOAP Fault</option>
                    <option value="HTTP Status">HTTP Status</option>
                    <option value="Script">Script (JavaScript)</option>
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
                                <Title>{a.name || a.type}</Title>
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
                                    {a.type === 'XPath Match' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <span style={{ minWidth: 60 }}>XPath:</span>
                                                <Input
                                                    style={{ flex: 1 }}
                                                    value={a.configuration?.xpath || ''}
                                                    onChange={(e) => updateConfig(a.id!, 'xpath', e.target.value)}
                                                    placeholder="//ns:Node"
                                                />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                                <span style={{ minWidth: 60 }}>Expected:</span>
                                                <Input
                                                    style={{ flex: 1 }}
                                                    value={a.configuration?.expectedContent || ''}
                                                    onChange={(e) => updateConfig(a.id!, 'expectedContent', e.target.value)}
                                                    placeholder="Value"
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {a.type === 'SOAP Fault' && (
                                        <>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                <input
                                                    type="checkbox"
                                                    checked={a.configuration?.expectFault === true}
                                                    onChange={(e) => updateConfig(a.id!, 'expectFault', e.target.checked)}
                                                />
                                                Expect Fault
                                            </label>
                                            <div style={{ marginTop: 5, display: 'flex', alignItems: 'center' }}>
                                                <span style={{ marginRight: 5 }}>Fault Code:</span>
                                                <Input
                                                    value={a.configuration?.faultCode || ''}
                                                    onChange={(e) => updateConfig(a.id!, 'faultCode', e.target.value)}
                                                    placeholder="Optional (e.g. Client)"
                                                    style={{ width: 140 }}
                                                />
                                            </div>
                                        </>
                                    )}
                                    {a.type === 'HTTP Status' && (
                                        <div style={{ marginTop: 5 }}>
                                            <div style={{ marginBottom: 4, fontSize: 12 }}>Expected Codes:</div>
                                            <StatusCodePicker
                                                value={a.configuration?.expectedStatus || ''}
                                                onChange={(val) => updateConfig(a.id!, 'expectedStatus', val)}
                                            />
                                        </div>
                                    )}
                                    {a.type === 'Script' && (
                                        <div style={{ marginTop: 5, width: '100%' }}>
                                            <div style={{ marginBottom: 4, fontSize: 11, opacity: 0.7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>
                                                    Return <code style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '1px 4px', borderRadius: 2 }}>true</code> to pass, <code style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '1px 4px', borderRadius: 2 }}>false</code> to fail.
                                                    Available: <code style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '1px 4px', borderRadius: 2 }}>response</code>, <code style={{ background: 'var(--vscode-textCodeBlock-background)', padding: '1px 4px', borderRadius: 2 }}>statusCode</code>
                                                </span>
                                                <Button onClick={() => {
                                                    setPlaygroundScript(a.configuration?.script || '');
                                                    setPlaygroundAssertionId(a.id || null);
                                                }} title="Test in Playground" style={{ fontSize: '11px', padding: '2px 6px', height: '20px' }}>
                                                    <Play size={10} /> Test Script
                                                </Button>
                                            </div>
                                            <div style={{ border: '1px solid var(--vscode-input-border)', borderRadius: 4, overflow: 'hidden' }}>
                                                <Editor
                                                    height="100px"
                                                    defaultLanguage="javascript"
                                                    theme="vs-dark"
                                                    value={a.configuration?.script || ''}
                                                    onChange={(val) => updateConfig(a.id!, 'script', val || '')}
                                                    onMount={(editor, monaco) => {
                                                        // Fix Enter key to insert newline
                                                        editor.addAction({
                                                            id: 'insert-newline',
                                                            label: 'Insert Newline',
                                                            keybindings: [monaco.KeyCode.Enter],
                                                            run: (ed) => {
                                                                ed.trigger('keyboard', 'type', { text: '\n' });
                                                            }
                                                        });
                                                    }}
                                                    options={{
                                                        minimap: { enabled: false },
                                                        scrollBeyondLastLine: false,
                                                        fontSize: 12,
                                                        lineNumbers: 'off',
                                                        folding: false,
                                                        glyphMargin: false,
                                                        lineDecorationsWidth: 0,
                                                        lineNumbersMinChars: 0,
                                                        automaticLayout: true,
                                                        acceptSuggestionOnEnter: 'off',
                                                        quickSuggestions: false,
                                                    }}
                                                />
                                            </div>
                                        </div>
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

            {playgroundScript !== null && (
                <ScriptPlaygroundModal
                    scriptType="assertion"
                    initialScript={playgroundScript}
                    onClose={() => {
                        setPlaygroundScript(null);
                        setPlaygroundAssertionId(null);
                    }}
                    onApplyScript={(newScript) => {
                        if (playgroundAssertionId) {
                            updateConfig(playgroundAssertionId, 'script', newScript);
                        }
                    }}
                />
            )}
        </Container>
    );
};
