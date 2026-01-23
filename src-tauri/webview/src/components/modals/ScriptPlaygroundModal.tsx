import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Editor from '@monaco-editor/react';
import { X, Play, Loader2, HelpCircle } from 'lucide-react';
import { bridge, isTauri, isStandalone } from '../../utils/bridge';
import { useTheme } from '../../contexts/ThemeContext';

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.75);
    z-index: 2000;
    display: flex;
    justify-content: center;
    align-items: center;
`;

const ModalContainer = styled.div`
    width: 95vw;
    height: 95vh;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
`;

const Header = styled.div`
    height: 40px;
    background: var(--vscode-editorGroupHeader-tabsBackground);
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 15px;
    font-weight: bold;
`;

const CloseButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    border-radius: 4px;
    &:hover { background: var(--vscode-toolbar-hoverBackground); }
`;

const Content = styled.div`
    flex: 1;
    display: flex;
    overflow: hidden;
`;

const LeftPanel = styled.div`
    width: 40%;
    min-width: 300px;
    border-right: 1px solid var(--vscode-panel-border);
    display: flex;
    flex-direction: column;
    background: var(--vscode-sideBar-background);
`;

const RightPanel = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
`;

const SectionTitle = styled.div`
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const Section = styled.div<{ $flex?: number }>`
    flex: ${props => props.$flex || 'none'};
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid var(--vscode-panel-border);
    &:last-child { border-bottom: none; }
`;

const InputRow = styled.div`
    display: flex;
    align-items: center;
    padding: 5px 10px;
    gap: 10px;
    font-size: 12px;
    
    label { min-width: 80px; }
    input {
        background: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        padding: 4px;
        flex: 1;
    }
`;

const Footer = styled.div`
    height: 50px;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    padding: 0 20px;
    justify-content: flex-end;
    gap: 15px;
    background: var(--vscode-editor-background);
`;

const RunButton = styled.button`
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 8px 16px;
    border-radius: 2px;
    cursor: pointer;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;

    &:hover { background: var(--vscode-button-hoverBackground); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const ApplyButton = styled.button`
    background: var(--vscode-button-secondaryBackground, var(--vscode-button-background));
    color: var(--vscode-button-secondaryForeground, var(--vscode-button-foreground));
    border: 1px solid var(--vscode-button-border, transparent);
    padding: 8px 16px;
    border-radius: 2px;
    cursor: pointer;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;

    &:hover { 
        background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-hoverBackground)); 
    }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
`;

const OutputConsole = styled.div`
    flex: 1;
    background: var(--vscode-terminal-background, #1e1e1e);
    color: var(--vscode-terminal-foreground, #cccccc);
    padding: 10px;
    font-family: monospace;
    font-size: 12px;
    overflow-y: auto;
    white-space: pre-wrap;
`;

const SectionToolbar = styled.div`
    display: flex;
    justify-content: flex-end;
    padding: 2px 5px;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    gap: 5px;
`;

const MiniButton = styled.button`
    background: transparent;
    border: 1px solid var(--vscode-panel-border);
    color: var(--vscode-descriptionForeground);
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 2px;
    cursor: pointer;
    &:hover {
        background: var(--vscode-list-hoverBackground);
        color: var(--vscode-foreground);
    }
`;

const HelpOverlay = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    max-width: 90%;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-focusBorder);
    box-shadow: 0 8px 16px rgba(0,0,0,0.5);
    z-index: 2001;
    padding: 20px;
    border-radius: 4px;

    h3 { margin-top: 0; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 5px; }
    code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; borderRadius: 3px; font-family: monospace; }
`;

interface ScriptPlaygroundModalProps {
    onClose: () => void;
    initialScript: string;
    scriptType: 'assertion' | 'step';
    onApplyScript?: (script: string) => void;
}

export const ScriptPlaygroundModal: React.FC<ScriptPlaygroundModalProps> = ({ onClose, initialScript, scriptType, onApplyScript }) => {
    const [script, setScript] = useState(initialScript);
    const [responseBody, setResponseBody] = useState('<root>Hello World</root>');
    const [statusCode, setStatusCode] = useState(200);
    const [variables, setVariables] = useState('{\n  "env": "dev"\n}');
    const [logs, setLogs] = useState<string[]>([]);
    const [result, setResult] = useState<any>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const { monacoTheme } = useTheme();

    const runScriptLocally = async (contextVars: Record<string, any>) => {
        const logs: string[] = [];
        const log = (msg: any) => logs.push(String(msg));

        const sandbox = {
            console: {
                log: (...args: any[]) => log(args.map(a => String(a)).join(' ')),
                warn: (...args: any[]) => log('[WARN] ' + args.map(a => String(a)).join(' ')),
                error: (...args: any[]) => log('[ERROR] ' + args.map(a => String(a)).join(' '))
            },
            JSON,
            parseInt,
            parseFloat,
            String,
            Number,
            Boolean,
            Array,
            Object,
            RegExp,
            Date,
            Math,
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval
        } as Record<string, any>;

        try {
            if (scriptType === 'assertion') {
                const assertionSandbox = {
                    ...sandbox,
                    response: responseBody || '',
                    statusCode: Number(statusCode) || 200,
                    status: Number(statusCode) || 200,
                    pass: () => ({ status: 'PASS' }),
                    fail: (msg?: string) => ({ status: 'FAIL', message: msg })
                };

                const fn = new Function('sandbox', `
                    return (async () => {
                        with (sandbox) {
                            ${script}
                        }
                    })();
                `);

                const result = await fn(assertionSandbox);

                let status: 'PASS' | 'FAIL' | 'ERROR' = 'FAIL';
                let message = 'Script finished without explicit result';

                if (result === true) {
                    status = 'PASS';
                    message = 'returned true';
                } else if (result === false) {
                    status = 'FAIL';
                    message = 'returned false';
                } else if (result && typeof result === 'object' && result.status) {
                    status = result.status;
                    message = result.message;
                } else if (typeof result === 'string') {
                    status = 'PASS';
                    message = result;
                }

                setLogs(logs);
                setResult({ status, message });
                setIsRunning(false);
                return;
            }

            const stepSandbox = {
                ...sandbox,
                context: contextVars,
                responseLines: responseBody ? responseBody.split('\n') : [],
                response: responseBody || '',
                statusCode: Number(statusCode) || 200,
                status: Number(statusCode) || 200,
                log: sandbox.console.log,
                fail: (reason: string) => { throw new Error(reason); },
                delay: async (ms: number) => {
                    logs.push(`[Mock] Delayed for ${ms}ms`);
                    await new Promise(r => setTimeout(r, Math.min(ms, 1000)));
                },
                goto: (stepName: string) => {
                    logs.push(`[Mock] goto('${stepName}') called`);
                }
            };

            const fn = new Function('sandbox', `
                return (async () => {
                    with (sandbox) {
                        ${script}
                    }
                })();
            `);

            await fn(stepSandbox);
            setLogs(logs);
            setResult({ status: 'PASS', message: 'Script executed successfully' });
            setIsRunning(false);
        } catch (e: any) {
            logs.push(`[Runtime Error] ${e?.message || e}`);
            setLogs(logs);
            setResult({ status: 'ERROR', message: e?.message || String(e) });
            setIsRunning(false);
        }
    };

    const handleRun = () => {
        setIsRunning(true);
        setLogs([]);
        setResult(null);

        let parsedVars = {};
        try {
            parsedVars = JSON.parse(variables);
        } catch (e) {
            setLogs(['[System] Error parsing context variables JSON.']);
            setIsRunning(false);
            return;
        }

        if (isTauri() || isStandalone()) {
            void runScriptLocally(parsedVars as Record<string, any>);
            return;
        }

        bridge.sendMessage({
            command: 'executePlaygroundScript',
            scriptType,
            script,
            context: {
                responseBody,
                statusCode: Number(statusCode),
                variables: parsedVars
            }
        });
    };

    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const message = event.data;
            if (message.command === 'playgroundScriptResult') {
                setIsRunning(false);
                setLogs(message.logs || []);
                setResult({ status: message.status, message: message.message });
            }
        };

        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    return (
        <Overlay onClick={(e) => e.target === e.currentTarget && onClose()}>
            <ModalContainer>
                <Header>
                    <span>Script Playground ({scriptType === 'assertion' ? 'Assertion' : 'Test Step'})</span>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <CloseButton onClick={() => setShowHelp(!showHelp)} title="Help">
                            <HelpCircle size={18} />
                        </CloseButton>
                        <CloseButton onClick={onClose}><X size={20} /></CloseButton>
                    </div>
                </Header>
                <Content>
                    {showHelp && (
                        <HelpOverlay>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0, border: 'none' }}>Script Reference</h3>
                                <CloseButton onClick={() => setShowHelp(false)}><X size={16} /></CloseButton>
                            </div>

                            <h4>Available Objects</h4>
                            <ul>
                                <li><code>response</code> (string): The raw response body (Assertion only).</li>
                                <li><code>statusCode</code> (number): The HTTP status code (Assertion only).</li>
                                <li><code>context</code> (object): Shared variables accessible across steps.</li>
                            </ul>

                            <h4>Helper Functions</h4>
                            <ul>
                                <li><code>log(message)</code>: Log a message to the console.</li>
                                <li><code>fail(reason)</code>: Explicitly fail the test step/assertion.</li>
                                <li><code>delay(ms)</code>: Pause execution for specified milliseconds.</li>
                                <li><code>goto(stepName)</code>: Jump to a specific step (mocked in playground).</li>
                            </ul>
                        </HelpOverlay>
                    )}
                    <LeftPanel>
                        <SectionTitle>Context Inputs</SectionTitle>

                        <Section $flex={1} style={{ minHeight: '200px' }}>
                            <div style={{ padding: '5px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Response Body (accessible as <code>response</code>)</span>
                            </div>
                            <SectionToolbar>
                                <MiniButton onClick={() => setResponseBody('<root>\n  <status>success</status>\n  <data>\n    <id>123</id>\n    <name>Test Item</name>\n  </data>\n</root>')}>Sample XML</MiniButton>
                                <MiniButton onClick={() => setResponseBody('{\n  "status": "success",\n  "data": {\n    "id": 123,\n    "name": "Test Item"\n  }\n}')}>Sample JSON</MiniButton>
                                <MiniButton onClick={() => setResponseBody('')}>Clear</MiniButton>
                            </SectionToolbar>
                            <Editor
                                height="100%"
                                defaultLanguage="xml"
                                theme={monacoTheme}
                                value={responseBody}
                                onChange={(v) => setResponseBody(v || '')}
                                options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12 }}
                            />
                        </Section>
                        <InputRow>
                            <label>Status Code:</label>
                            <input
                                type="number"
                                value={statusCode}
                                onChange={(e) => setStatusCode(Number(e.target.value))}
                            />
                            <select
                                style={{ background: 'var(--vscode-dropdown-background)', color: 'var(--vscode-dropdown-foreground)', border: '1px solid var(--vscode-dropdown-border)' }}
                                onChange={(e) => setStatusCode(Number(e.target.value))}
                                value={statusCode}
                            >
                                <option value="200">200 OK</option>
                                <option value="201">201 Created</option>
                                <option value="400">400 Bad Request</option>
                                <option value="401">401 Unauthorized</option>
                                <option value="403">403 Forbidden</option>
                                <option value="404">404 Not Found</option>
                                <option value="500">500 Server Error</option>
                            </select>
                        </InputRow>

                        <Section $flex={1}>
                            <div style={{ padding: '5px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>Context Variables (JSON - accessible as <code>context</code>)</div>
                            <SectionToolbar>
                                <MiniButton onClick={() => setVariables('{\n  "env": "dev",\n  "userId": 101,\n  "token": "abc-123"\n}')}>Default</MiniButton>
                                <MiniButton onClick={() => setVariables('{}')}>Clear</MiniButton>
                            </SectionToolbar>
                            <Editor
                                height="100%"
                                defaultLanguage="json"
                                theme={monacoTheme}
                                value={variables}
                                onChange={(v) => setVariables(v || '')}
                                options={{ minimap: { enabled: false }, scrollBeyondLastLine: false, fontSize: 12 }}
                            />
                        </Section>
                    </LeftPanel>

                    <RightPanel>
                        <Section $flex={2}>
                            <SectionTitle>Script</SectionTitle>
                            <Editor
                                height="100%"
                                defaultLanguage="javascript"
                                theme={monacoTheme}
                                value={script}
                                onChange={(v) => setScript(v || '')}
                                options={{
                                    minimap: { enabled: false },
                                    fontSize: 14,
                                    scrollBeyondLastLine: false
                                }}
                            />
                        </Section>
                        <Section $flex={1} style={{ minHeight: '150px' }}>
                            <SectionTitle>Console & Output</SectionTitle>
                            <OutputConsole>
                                {result && (
                                    <div style={{
                                        color: result.status === 'PASS' ? '#4caf50' : '#f44336',
                                        marginBottom: '10px',
                                        fontWeight: 'bold'
                                    }}>
                                        [{result.status}] {result.message}
                                    </div>
                                )}
                                {logs.map((log, i) => (
                                    <div key={i}>{log}</div>
                                ))}
                            </OutputConsole>
                        </Section>
                    </RightPanel>

                </Content>
                <Footer>
                    {onApplyScript && (
                        <ApplyButton 
                            onClick={() => {
                                onApplyScript(script);
                                onClose();
                            }}
                            title="Copy script to original editor and close playground"
                        >
                            Apply to Script
                        </ApplyButton>
                    )}
                    <RunButton onClick={handleRun} disabled={isRunning}>
                        {isRunning ? <Loader2 className="spin" size={16} /> : <Play size={16} />}
                        Run Script
                    </RunButton>
                </Footer>
            </ModalContainer>
        </Overlay>
    );
};
