import React from 'react';
import styled from 'styled-components';
import { Layout, ListOrdered, Play, Loader2, RotateCcw, WrapText, FoldVertical } from 'lucide-react';
import { SoapUIRequest, SoapUIOperation } from '../models';
import { MonacoRequestEditor } from './MonacoRequestEditor';
import { MonacoResponseViewer } from './MonacoResponseViewer';
import { AssertionsPanel } from './AssertionsPanel';
import { HeadersPanel } from './HeadersPanel';
import ReactMarkdown from 'react-markdown';
import { MonacoSingleLineInput } from './MonacoSingleLineInput';
import { formatXml } from '../utils/xmlFormatter';
import mascotImg from '../assets/mascot.png';

const Mascot = styled.img`
    position: absolute;
    top: 20px;
    right: 20px;
    width: 200px;
    height: auto;
    opacity: 0.8;
    pointer-events: none;
    mix-blend-mode: multiply;

    body.vscode-dark &, body.vscode-high-contrast & {
        filter: invert(1);
        mix-blend-mode: screen;
    }
`;

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const MarkdownContainer = styled.div`
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px solid var(--vscode-panel-border);
    
    h1, h2, h3 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; margin-top: 1.5em; }
    p { margin-bottom: 1px; }
    ul { padding-left: 20px; }
    code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; font-family: monospace; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 5px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; }
`;

const Toolbar = styled.div`
  display: flex;
  padding: 5px 10px;
  background-color: var(--vscode-editor-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  align-items: center;
  gap: 10px;
  height: 40px;
`;

const ToolbarButton = styled.button`
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 4px 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  border-radius: 2px;
  white-space: nowrap;
  height: 26px;
  box-sizing: border-box;
  &:hover {
    background: var(--vscode-button-hoverBackground);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;



const ToolbarSelect = styled.select`
    background-color: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 4px;
    outline: none;
    height: 26px;
    box-sizing: border-box;
    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

const MainFooter = styled.div`
  padding: 5px 10px;
  border-top: 1px solid var(--vscode-panel-border);
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  background-color: var(--vscode-editor-background);
`;

const IconButton = styled.button<{ active?: boolean }>`
    background: ${props => props.active ? 'var(--vscode-button-background)' : 'transparent'};
    color: ${props => props.active ? 'var(--vscode-button-foreground)' : 'var(--vscode-icon-foreground)'};
    border: 1px solid transparent;
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    height: 26px;
    width: 26px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    &:hover {
        background-color: ${props => props.active ? 'var(--vscode-button-hoverBackground)' : 'var(--vscode-toolbar-hoverBackground)'};
    }
`;

interface WorkspaceLayoutProps {
    selectedRequest: SoapUIRequest | null;
    selectedOperation: SoapUIOperation | null;
    response: any;
    loading: boolean;
    layoutMode: 'vertical' | 'horizontal';
    showLineNumbers: boolean;
    splitRatio: number;
    isResizing: boolean;

    onExecute: (xml: string) => void;
    onCancel: () => void;
    onUpdateRequest: (req: SoapUIRequest) => void;
    onReset: () => void;
    onToggleLayout: () => void;
    onToggleLineNumbers: () => void;
    onStartResizing: () => void;
    defaultEndpoint?: string;
    changelog?: string;

    // Config options passed from App for formatting
    inlineElementValues?: boolean;
    onToggleInlineElementValues?: () => void;

    // Config
    config?: any;
    onChangeEnvironment?: (env: string) => void;
    isReadOnly?: boolean;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
    selectedRequest, selectedOperation, response, loading, layoutMode, showLineNumbers, splitRatio, isResizing,
    onExecute, onCancel, onUpdateRequest, onReset, onToggleLayout, onToggleLineNumbers, onStartResizing, defaultEndpoint,
    changelog,
    config, onChangeEnvironment,
    inlineElementValues, onToggleInlineElementValues,
    isReadOnly
}) => {
    const [alignAttributes, setAlignAttributes] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<'request' | 'headers' | 'assertions' | 'auth'>('request');






    if (!selectedRequest) {
        return (
            <div style={{ padding: 20, flex: 1, overflow: 'auto', color: 'var(--vscode-editor-foreground)', fontFamily: 'var(--vscode-font-family)', position: 'relative' }}>
                <Mascot src={mascotImg} alt="Dirty Soap Mascot" />
                <h1>Welcome to Dirty SOAP</h1>
                <p>Load a WSDL to see available operations.</p>
                {changelog && (
                    <MarkdownContainer>
                        <ReactMarkdown>{changelog}</ReactMarkdown>
                    </MarkdownContainer>
                )}
            </div>
        );
    }

    return (
        <Content>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Toolbar */}
                {!isReadOnly && (
                    <Toolbar>
                        {/* Method */}
                        <ToolbarSelect
                            value={selectedRequest.method || 'POST'}
                            onChange={(e) => onUpdateRequest({ ...selectedRequest, method: e.target.value })}
                            title="HTTP Method"
                        >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                        </ToolbarSelect>


                        {/* URL */}
                        <div style={{ flex: 1, minWidth: '150px' }}>
                            <MonacoSingleLineInput
                                value={selectedRequest.endpoint || defaultEndpoint || ''}
                                onChange={(val) => onUpdateRequest({ ...selectedRequest, endpoint: val })}
                                placeholder="Endpoint URL"
                            />
                        </div>

                        {/* Content Type */}
                        <ToolbarSelect
                            value={selectedRequest.contentType || 'application/soap+xml'}
                            onChange={(e) => onUpdateRequest({ ...selectedRequest, contentType: e.target.value })}
                            title="Content Type"
                        >
                            <option value="text/xml">text/xml</option>
                            <option value="application/soap+xml">application/soap+xml</option>
                            <option value="application/xml">application/xml</option>
                        </ToolbarSelect>

                        {/* Actions */}
                        <IconButton onClick={onReset} title="Revert to Default XML">
                            <RotateCcw size={16} />
                        </IconButton>

                        {loading ? (
                            <ToolbarButton onClick={onCancel} style={{ backgroundColor: 'var(--vscode-errorForeground)' }}>
                                <Loader2 size={14} className="spin" /> Cancel
                            </ToolbarButton>
                        ) : (
                            <ToolbarButton onClick={() => onExecute(selectedRequest.request)} title="Run Request" style={{ color: 'var(--vscode-testing-iconPassed)' }}>
                                <Play size={14} /> Run
                            </ToolbarButton>
                        )}

                        <div style={{ width: 1, height: 20, background: 'var(--vscode-panel-border)', margin: '0 5px' }} />

                        {/* Environment Selector */}
                        {config && config.environments && (
                            <ToolbarSelect
                                value={config.activeEnvironment}
                                onChange={(e) => onChangeEnvironment && onChangeEnvironment(e.target.value)}
                                title="Active Environment"
                                style={{ minWidth: 100 }}
                            >
                                {Object.keys(config.environments).map(env => (
                                    <option key={env} value={env}>{env}</option>
                                ))}
                            </ToolbarSelect>
                        )}
                    </Toolbar>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: layoutMode === 'vertical' ? 'column' : 'row', overflow: 'hidden' }}>
                    <div style={{
                        flex: (response || loading) ? `0 0 ${splitRatio * 100}%` : '1 1 auto',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        height: 'auto',
                        width: 'auto'
                    }}>
                        {/* Title Section (Moved above tabs) */}
                        <div style={{
                            padding: '10px 15px',
                            backgroundColor: 'var(--vscode-editor-background)',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 5
                        }}>
                            <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{selectedOperation?.name}</div>
                            <div style={{ fontSize: '0.9em', opacity: 0.7 }}>{selectedRequest.name}</div>
                        </div>

                        {/* Tabs Header */}
                        <div style={{
                            padding: '0 10px',
                            backgroundColor: 'var(--vscode-editor-background)',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 20,
                            flexShrink: 0,
                            height: 35
                        }}>
                            <div
                                style={{
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'request' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                    padding: '5px 0',
                                    color: activeTab === 'request' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                }}
                                onClick={() => setActiveTab('request')}
                            >
                                Body
                            </div>
                            <div
                                style={{
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'headers' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                    padding: '5px 0',
                                    color: activeTab === 'headers' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                }}
                                onClick={() => setActiveTab('headers')}
                            >
                                Headers
                                {selectedRequest.headers && Object.keys(selectedRequest.headers).length > 0 && ` (${Object.keys(selectedRequest.headers).length})`}
                            </div>
                            <div
                                style={{
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'assertions' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                    padding: '5px 0',
                                    color: activeTab === 'assertions' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                }}
                                onClick={() => setActiveTab('assertions')}
                            >
                                Assertions
                                {selectedRequest.assertions && selectedRequest.assertions.length > 0 && ` (${selectedRequest.assertions.length})`}
                                {response && response.assertionResults && (
                                    <span style={{ marginLeft: 5, fontSize: '0.8em' }}>
                                        {response.assertionResults.every((r: any) => r.status === 'PASS') ? '✔' : '❌'}
                                    </span>
                                )}
                            </div>
                            <div
                                style={{
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'auth' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                    padding: '5px 0',
                                    color: activeTab === 'auth' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)',
                                    opacity: 0.6
                                }}
                                title="Coming Soon"
                            // onClick={() => setActiveTab('auth')} 
                            >
                                Auth
                            </div>

                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center', fontSize: '0.9em' }}>
                                <span style={{ opacity: 0.8 }}>Lines: {typeof selectedRequest.request === 'string' ? selectedRequest.request.split('\n').length : 0}</span>
                                <span style={{ opacity: 0.8 }}>Size: {typeof selectedRequest.request === 'string' ? (selectedRequest.request.length / 1024).toFixed(2) : 0} KB</span>
                            </div>
                        </div>

                        {activeTab === 'request' && (
                            <MonacoRequestEditor
                                value={selectedRequest.request || ''}
                                onChange={(val) => onUpdateRequest({ ...selectedRequest, request: val })}
                                readOnly={loading || isReadOnly}
                                language="xml"
                            />
                        )}
                        {activeTab === 'headers' && (
                            <HeadersPanel
                                headers={selectedRequest.headers || {}}
                                onChange={(newHeaders) => onUpdateRequest({ ...selectedRequest, headers: newHeaders })}
                            />
                        )}
                        {activeTab === 'assertions' && (
                            <AssertionsPanel
                                assertions={selectedRequest.assertions || []}
                                onChange={(newAssertions) => onUpdateRequest({ ...selectedRequest, assertions: newAssertions })}
                                lastResult={response?.assertionResults}
                            />
                        )}
                    </div>

                    {/* Resizer */}
                    {(response || loading) && (
                        <div
                            onMouseDown={onStartResizing}
                            style={{
                                width: layoutMode === 'horizontal' ? 5 : '100%',
                                height: layoutMode === 'vertical' ? 5 : '100%',
                                cursor: layoutMode === 'horizontal' ? 'col-resize' : 'row-resize',
                                backgroundColor: isResizing ? 'var(--vscode-focusBorder)' : 'var(--vscode-widget-shadow)',
                                zIndex: 10,
                                flex: '0 0 auto',
                                transition: 'background-color 0.2s'
                            }}
                        />
                    )}

                    {/* Response Section */}
                    {(response || loading) && (
                        <div style={{
                            flex: 1,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            borderLeft: layoutMode === 'horizontal' ? '1px solid var(--vscode-panel-border)' : 'none',
                            borderTop: layoutMode === 'vertical' ? '1px solid var(--vscode-panel-border)' : 'none',
                        }}>
                            <div style={{
                                padding: '5px 10px',
                                backgroundColor: 'var(--vscode-editor-background)',
                                borderBottom: '1px solid var(--vscode-panel-border)',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexShrink: 0
                            }}>
                                <span>Response</span>
                                {response && !isReadOnly && (
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center' }}>
                                        <span style={{ opacity: 0.8 }}>Lines: {response.lineCount || 0}</span>
                                        <span style={{ opacity: 0.8 }}>Time: {(response.duration || 0).toFixed(1)}s</span>
                                        <span style={{ opacity: 0.8 }}>Size: {typeof response.rawResponse === 'string' ? (response.rawResponse.length / 1024).toFixed(2) : 0} KB</span>
                                        {response.headers && response.headers['content-type'] && (
                                            <span title="Content-Type" style={{ opacity: 0.8, borderLeft: '1px solid var(--vscode-panel-border)', paddingLeft: '10px' }}>
                                                {response.headers['content-type'].split(';')[0]}
                                            </span>
                                        )}
                                        <span style={{
                                            color: response.success ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)',
                                            marginLeft: 10
                                        }}>
                                            {response.success ? '200 OK' : 'Error'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <MonacoResponseViewer
                                value={response ? (response.rawResponse ? formatXml(response.rawResponse, alignAttributes, inlineElementValues) : (response.error || '')) : ''}
                                showLineNumbers={showLineNumbers}
                            />
                        </div>
                    )}
                </div>
            </div >

            <MainFooter>
                <IconButton onClick={onToggleLineNumbers} active={showLineNumbers} title="Toggle Line Numbers">
                    <ListOrdered size={16} />
                </IconButton>
                <IconButton onClick={() => {
                    const newValue = !alignAttributes;
                    setAlignAttributes(newValue);
                    if (selectedRequest.request) {
                        onUpdateRequest({ ...selectedRequest, request: formatXml(selectedRequest.request, newValue, inlineElementValues) });
                    }
                }} active={alignAttributes} title="Toggle Attribute Alignment">
                    <WrapText size={16} />
                </IconButton>
                <IconButton onClick={() => {
                    // Toggle Inline Values
                    if (onToggleInlineElementValues) onToggleInlineElementValues();
                    // Trigger reformat of Request immediately if desired?
                    // The prop update usually triggers re-render, but does logic re-run?
                    // The Request Editor manages its own state via 'selectedRequest'. 
                    // We should force update the request text if we want it to apply immediately to the Request Editor.
                    // IMPORTANT: Since 'inlineElementValues' is a prop, we don't have the NEW value here immediately unless we calculate it.
                    const nextVal = !inlineElementValues;
                    if (selectedRequest.request) {
                        onUpdateRequest({ ...selectedRequest, request: formatXml(selectedRequest.request, alignAttributes, nextVal) });
                    }
                }} active={inlineElementValues} title="Toggle Inline Values (Compact Elements)">
                    <FoldVertical size={16} />
                </IconButton>
                <IconButton onClick={onToggleLayout} title="Toggle Layout (Vertical/Horizontal)">
                    <Layout size={16} />
                </IconButton>
            </MainFooter>
        </Content >
    );
};
