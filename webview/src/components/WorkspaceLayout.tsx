import React from 'react';
import styled from 'styled-components';
import { RequestEditor } from './RequestEditor';
import { ResponseViewer } from './ResponseViewer';
import { Layout, ListOrdered, Play, Loader2, RotateCcw, Code as CodeIcon, AlignLeft } from 'lucide-react';
import { SoapUIRequest, SoapUIOperation } from '../models';
import { MonacoRequestEditor } from './MonacoRequestEditor';
import { MonacoResponseViewer } from './MonacoResponseViewer';
import { formatXml } from '../utils/xmlFormatter';

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
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
  &:hover {
    background: var(--vscode-button-hoverBackground);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const ToolbarInput = styled.input`
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 4px;
    flex: 1;
    outline: none;
    min-width: 150px;
    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

const ToolbarSelect = styled.select`
    background-color: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 4px;
    outline: none;
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
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
    selectedRequest, selectedOperation, response, loading, layoutMode, showLineNumbers, splitRatio, isResizing,
    onExecute, onCancel, onUpdateRequest, onReset, onToggleLayout, onToggleLineNumbers, onStartResizing, defaultEndpoint
}) => {
    const [useMonaco, setUseMonaco] = React.useState(false);
    const [alignAttributes, setAlignAttributes] = React.useState(false);

    if (!selectedRequest) {
        return (
            <div style={{ padding: 20, flex: 1 }}>
                <h1>Welcome to Dirty SOAP</h1>
                <p>Load a WSDL to see available operations.</p>
            </div>
        );
    }

    return (
        <Content>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Toolbar */}
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
                    <ToolbarInput
                        value={selectedRequest.endpoint || defaultEndpoint || ''}
                        onChange={(e) => onUpdateRequest({ ...selectedRequest, endpoint: e.target.value })}
                        placeholder="Endpoint URL"
                        title="Endpoint URL"
                    />

                    {/* Content Type */}
                    <ToolbarSelect
                        value={selectedRequest.contentType || 'text/xml'}
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
                        <div style={{ display: 'flex', gap: 10, marginLeft: 10 }}>
                            <ToolbarButton onClick={() => onExecute(selectedRequest.request)} title="Run Request" style={{ color: 'var(--vscode-testing-iconPassed)' }}>
                                <Play size={14} /> Run
                            </ToolbarButton>
                        </div>
                    )}
                </Toolbar>

                <div style={{ flex: 1, display: 'flex', flexDirection: layoutMode === 'vertical' ? 'column' : 'row', overflow: 'hidden' }}>
                    <div style={{
                        flex: `0 0 ${splitRatio * 100}%`,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        height: 'auto',
                        width: 'auto'
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
                            <span>Request: {selectedOperation?.name} - {selectedRequest.name}</span>
                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <span style={{ opacity: 0.8 }}>Lines: {selectedRequest.request ? selectedRequest.request.split('\n').length : 0}</span>
                                <span style={{ opacity: 0.8 }}>Size: {selectedRequest.request ? (selectedRequest.request.length / 1024).toFixed(2) : 0} KB</span>
                            </div>
                        </div>
                        {useMonaco ? (
                            <MonacoRequestEditor
                                value={selectedRequest.request}
                                onChange={(val) => onUpdateRequest({ ...selectedRequest, request: val })}
                                readOnly={loading}
                                language="xml"
                            />
                        ) : (
                            <RequestEditor
                                operation={selectedOperation}
                                initialXml={selectedRequest.request}
                                onChange={(xml) => onUpdateRequest({ ...selectedRequest, request: xml })}
                                showLineNumbers={showLineNumbers}
                                onExecute={onExecute}
                            />
                        )}
                    </div>

                    {/* Resizer */}
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

                    {/* Response Section */}
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
                            {response && (
                                <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center' }}>
                                    <span style={{ opacity: 0.8 }}>Lines: {response.lineCount || 0}</span>
                                    <span style={{ opacity: 0.8 }}>Time: {(response.duration || 0).toFixed(1)}s</span>
                                    <span style={{ opacity: 0.8 }}>Size: {(response.rawResponse ? response.rawResponse.length / 1024 : 0).toFixed(2)} KB</span>
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
                        {useMonaco ? (
                            <MonacoResponseViewer
                                value={response ? (alignAttributes && response.rawResponse ? formatXml(response.rawResponse, true) : (response.rawResponse || '')) : ''}
                                showLineNumbers={showLineNumbers}
                            />
                        ) : (
                            <ResponseViewer
                                response={response ? { ...response, rawResponse: alignAttributes && response.rawResponse ? formatXml(response.rawResponse, true) : response.rawResponse } : null}
                                error={response?.error}
                                loading={loading}
                                showLineNumbers={showLineNumbers}
                            />
                        )}
                    </div>
                </div>
            </div>

            <MainFooter>
                <IconButton onClick={() => setUseMonaco(!useMonaco)} active={useMonaco} title="Toggle Editor Mode (Monaco)">
                    <CodeIcon size={16} />
                </IconButton>
                <IconButton onClick={onToggleLineNumbers} active={showLineNumbers} title="Toggle Line Numbers">
                    <ListOrdered size={16} />
                </IconButton>
                <IconButton onClick={() => {
                    const newValue = !alignAttributes;
                    setAlignAttributes(newValue);
                    if (selectedRequest.request) {
                        onUpdateRequest({ ...selectedRequest, request: formatXml(selectedRequest.request, newValue) });
                    }
                }} active={alignAttributes} title="Toggle Attribute Alignment">
                    <AlignLeft size={16} />
                </IconButton>
                <IconButton onClick={onToggleLayout} title="Toggle Layout (Vertical/Horizontal)">
                    <Layout size={16} />
                </IconButton>
            </MainFooter>
        </Content>
    );
};
