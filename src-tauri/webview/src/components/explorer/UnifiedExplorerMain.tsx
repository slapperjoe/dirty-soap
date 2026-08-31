import React, { useState, useCallback, useEffect } from 'react';
import {
    ArrowRight,
    Server,
    Code2,
    Calendar,
    FileCode,
    Play,
    RefreshCw,
    FolderOpen,
} from 'lucide-react';
import { debugLog } from '../../utils/logger';
import { UnifiedProject, ApiOperation, ApiRequest } from '@shared/models';
import { soapDefault, resolveEffectiveContentType } from '../../utils/soapUtils';
import { invokeTauriCommand } from '../../utils/bridge';
import { MonacoRequestEditorWithToolbar as MonacoRequestEditor, MonacoResponseViewer, HeadersPanel, AssertionsPanel, ExtractorsPanel } from '@apinox/request-editor/monaco';
import { ExecutionResponse } from '@apinox/request-editor/monaco';
import { EmptyState } from '../common/EmptyState';
import { SampleRequestPanel } from '../workspace/SampleRequestPanel';

export interface UnifiedExplorerMainProps {
    projects: UnifiedProject[];
    selectedNode: { type: string; id: string } | null;
    onSelectNode: (type: string, id: string) => void;
    onRefreshProject: (projectName: string) => void;
    onLoadWsdl: (url: string) => void;
    onNewRequest: (projectName: string, operationName: string) => void;
    /** Interface-level (project) Content-Type override change — propagates to all existing requests and persists the project. */
    onProjectContentTypeChange?: (projectName: string, contentType: string) => void;
}

interface UrlInputState {
    url: string;
    loading: boolean;
    error: string | null;
}

interface ExecuteSoapResponse {
    success: boolean;
    statusCode: number;
    headers?: Array<[string, string]>;
    body?: string | null;
    rawXml: string;
    error?: string | null;
}

export const UnifiedExplorerMain: React.FC<UnifiedExplorerMainProps> = ({
    projects,
    selectedNode,
    onSelectNode,
    onRefreshProject,
    onLoadWsdl,
    onNewRequest,
    onProjectContentTypeChange,
}) => {
    const [urlInput, setUrlInput] = useState<UrlInputState>({ url: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL', loading: false, error: null });
    /** Response cache keyed by request ID — persists across request switches */
    const [responses, setResponses] = useState<Record<string, ExecutionResponse>>({});
    const [editingRequest, setEditingRequest] = useState<ApiRequest | null>(null);
    const [editingXml, setEditingXml] = useState<string>('');
    const [envVariables, setEnvVariables] = useState<Record<string, string>>({});

    // Load resolved environment variables on mount
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const cfg: any = await invokeTauriCommand('get_settings', {});
                const activeEnv: string | undefined = cfg?.config?.activeEnvironment || cfg?.activeEnvironment;
                if (activeEnv) {
                    const resolved = await invokeTauriCommand<Record<string, string>>('get_resolved_environment', { envName: activeEnv });
                    if (!cancelled) setEnvVariables(resolved || {});
                }
            } catch {
                // Non-fatal — proceed without env variables
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // Hydrate response cache from persisted lastResponse data when projects load
    useEffect(() => {
        setResponses(prev => {
            const next = { ...prev };
            for (const project of projects) {
                for (const op of (project.operations || [])) {
                    for (const req of (op.requests || [])) {
                        const reqId = req.id || req.name;
                        // Only hydrate from disk if we don't already have a response for this request
                        if (next[reqId]) continue;
                        const lr = (req as any).lastResponse;
                        if (lr && (lr.rawResponse || lr.status !== undefined)) {
                            next[reqId] = {
                                rawResponse: lr.rawResponse || '',
                                status: lr.status,
                                statusText: lr.statusText,
                                headers: lr.headers,
                                contentType: lr.contentType,
                                time: lr.time,
                                size: lr.size,
                            };
                        }
                    }
                }
            }
            return next;
        });
    }, [projects]);

    // Persist an update to the current request (headers, assertions, extractors, body)
    const persistRequestUpdate = useCallback(async (updatedReq: ApiRequest, newXml?: string) => {
        for (const project of projects) {
            for (const op of (project.operations || [])) {
                for (const req of (op.requests || [])) {
                    if ((req.id || req.name) === (updatedReq.id || updatedReq.name)) {
                        Object.assign(req, updatedReq);
                        if (newXml !== undefined) req.request = newXml;
                        try {
                            await invokeTauriCommand('save_unified_project', {
                                dirPath: project.name,
                                project: JSON.parse(JSON.stringify(project)),
                            });
                        } catch (e: any) {
                            debugLog('[UnifiedExplorerMain] Failed to persist request update', String(e));
                        }
                        return;
                    }
                }
            }
        }
    }, [projects]);

    // Sync editor state when a request node is selected from the sidebar
    useEffect(() => {
        if (!selectedNode || selectedNode.type !== 'request') {
            setEditingRequest(null);
            setEditingXml('');
            return;
        }
        for (const project of projects) {
            for (const op of (project.operations || [])) {
                for (const req of (op.requests || [])) {
                    if ((req.id || req.name) === selectedNode.id) {
                        setEditingRequest(req);
                        setEditingXml(req.request || '');
                        return;
                    }
                }
            }
        }
    }, [selectedNode, projects]);

    // Find selected entity
    const findSelected = () => {
        if (!selectedNode) return null;
        for (const project of projects) {
            if (selectedNode.type === 'project' && (project.id || project.name) === selectedNode.id) {
                return { type: 'project' as const, project };
            }
            if (project.operations) {
                for (const op of project.operations) {
                    const opId = op.id || op.name;
                    if (selectedNode.type === 'operation' && opId === selectedNode.id) {
                        return { type: 'operation' as const, project, operation: op };
                    }
                    if (op.requests) {
                        for (const req of op.requests) {
                            const reqId = req.id || req.name;
                            if (selectedNode.type === 'request' && reqId === selectedNode.id) {
                                return { type: 'request' as const, project, operation: op, request: req };
                            }
                        }
                    }
                }
            }
        }
        return null;
    };

    const handleLoadWsdl = useCallback(async () => {
        if (!urlInput.url.trim()) {
            setUrlInput(prev => ({ ...prev, error: 'Please enter a URL' }));
            return;
        }
        setUrlInput(prev => ({ ...prev, loading: true, error: null }));
        try {
            await onLoadWsdl(urlInput.url.trim());
            setUrlInput({ url: '', loading: false, error: null });
        } catch (e: any) {
            setUrlInput({ ...urlInput, loading: false, error: e?.message || 'Failed to load WSDL' });
        }
    }, [urlInput.url, onLoadWsdl]);

    const handleLoadFile = useCallback(async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selectedPath = await open({
                multiple: false,
                filters: [{ name: 'WSDL/XML Files', extensions: ['wsdl', 'xml'] }],
            });
            if (!selectedPath) return;
            const fileUrl = `file://${selectedPath}`;
            setUrlInput(prev => ({ ...prev, loading: true, error: null }));
            await onLoadWsdl(fileUrl);
            setUrlInput(prev => ({ ...prev, loading: false, error: null }));
        } catch (e: any) {
            setUrlInput(prev => ({ ...prev, loading: false, error: e?.message || 'Failed to load WSDL file' }));
        }
    }, [onLoadWsdl]);

    const handleExecuteRequest = useCallback(async (req: ApiRequest, currentXml: string) => {
        setEditingRequest(req);
        const reqId = req.id || req.name || 'unknown';

        // Locate the owning project/operation so we can resolve the *effective*
        // Content-Type (interface override > stored value > SOAP default) — the UI
        // must send exactly what it displays (SOAP_INTERFACE_CONTENT_TYPE_SPEC.md).
        let ownerProject: UnifiedProject | undefined;
        let ownerOperation: ApiOperation | undefined;
        for (const project of projects) {
            for (const op of (project.operations || [])) {
                if ((op.requests || []).some(r => (r.id || r.name) === reqId)) {
                    ownerProject = project;
                    ownerOperation = op;
                    break;
                }
            }
            if (ownerProject) break;
        }
        const effectiveContentType = resolveEffectiveContentType(req, ownerOperation ?? null, {
            contentType: ownerProject?.contentType,
            soapVersion: ownerProject?.soapVersion,
        });

        try {
            const result = await invokeTauriCommand<ExecuteSoapResponse>('execute_soap_request', {
                request: {
                    operation: {
                        name: req.name,
                        action: null,
                        input: null,
                        output: {},
                        targetNamespace: null,
                        originalEndpoint: req.endpoint || null,
                        fullSchema: null,
                        description: null,
                        portName: null,
                    },
                    soapVersion: ownerProject?.soapVersion || '1.1',
                    endpoint: req.endpoint || null,
                    rawXml: currentXml || req.request || '',
                    contentType: effectiveContentType,
                    headers: req.headers || {},
                    envVariables,
                    contextVariables: {},
                    username: null,
                    password: null,
                    passwordType: null,
                    addTimestamp: false,
                    proxyUrl: null,
                },
            });

            const headers = Object.fromEntries(result.headers || []);
            const contentType = headers['content-type'] || headers['Content-Type'] || effectiveContentType;
            const normalizedResponse: ExecutionResponse = {
                rawResponse: result.rawXml || result.body || '',
                status: result.statusCode,
                statusText: result.success ? 'OK' : (result.error || 'Error'),
                headers,
                contentType,
            };

            // Store in response cache so switching requests preserves it
            setResponses(prev => ({ ...prev, [reqId]: normalizedResponse }));

            // Persist response to disk so it survives app restarts
            (req as any).lastResponse = {
                rawResponse: normalizedResponse.rawResponse,
                status: normalizedResponse.status,
                statusText: normalizedResponse.statusText,
                headers: normalizedResponse.headers,
                contentType: normalizedResponse.contentType,
            };
            await persistRequestUpdate(req, currentXml);

            debugLog('[UnifiedExplorerMain] Request executed', req.name);
        } catch (e: any) {
            debugLog('[UnifiedExplorerMain] Request execution failed', String(e));
        }
    }, [envVariables, persistRequestUpdate]);

    const handleSaveRequest = useCallback(async () => {
        if (!editingRequest) return;
        editingRequest.request = editingXml;
        await persistRequestUpdate(editingRequest, editingXml);
        debugLog('[UnifiedExplorerMain] Request body saved', editingRequest.name);
    }, [editingRequest, editingXml, persistRequestUpdate]);

    const selected = findSelected();
    const currentReqId = editingRequest?.id || editingRequest?.name;
    const currentResponse = currentReqId ? responses[currentReqId] : null;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Top bar with URL input */}
            <div style={{
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderBottom: '1px solid var(--apinox-border)',
                backgroundColor: 'var(--apinox-panel-background)',
            }}>
                <input
                    type="text"
                    value={urlInput.url}
                    onChange={(e) => setUrlInput(prev => ({ ...prev, url: e.target.value, error: null }))}
                    placeholder="Enter WSDL URL and press Load"
                    style={{
                        flex: 1,
                        padding: '6px 10px',
                        backgroundColor: 'var(--apinox-input-background)',
                        color: 'var(--apinox-input-foreground)',
                        border: '1px solid var(--apinox-input-border)',
                        borderRadius: 4,
                        outline: 'none',
                    }}
                />
                <button
                    onClick={handleLoadWsdl}
                    disabled={urlInput.loading}
                    style={{
                        padding: '6px 14px',
                        backgroundColor: 'var(--apinox-button-primary-background)',
                        color: 'var(--apinox-button-primary-foreground)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: urlInput.loading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    {urlInput.loading ? (
                        <RefreshCw size={14} />
                    ) : (
                        <ArrowRight size={14} />
                    )}
                    {urlInput.loading ? 'Loading...' : 'Load'}
                </button>
                <button
                    onClick={handleLoadFile}
                    disabled={urlInput.loading}
                    style={{
                        padding: '6px 14px',
                        backgroundColor: 'var(--apinox-button-secondary-background)',
                        color: 'var(--apinox-button-secondary-foreground)',
                        border: '1px solid var(--apinox-button-secondary-border)',
                        borderRadius: 4,
                        cursor: urlInput.loading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                    }}
                >
                    <FolderOpen size={14} />
                    File
                </button>
            </div>

            {urlInput.error && (
                <div style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--apinox-error-background)',
                    color: 'var(--apinox-error-foreground)',
                    fontSize: 13,
                }}>
                    {urlInput.error}
                </div>
            )}

            {/* Main content area */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
                {!selected ? (
                    <EmptyState
                        title="Unified Explorer"
                        description="Load a WSDL URL above to get started, or select a project from the sidebar."
                        icon={Server}
                    />
                ) : selected.type === 'project' ? (
                    /* WSDL Project Summary */
                    <div style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <Server size={32} color="var(--apinox-icon-primary)" />
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>{selected.project.name}</h2>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                    Source: {selected.project.source || 'manual'}
                                    {selected.project.sourceUrl ? ` • ${selected.project.sourceUrl}` : ''}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr)', gap: 12 }}>
                            <div style={{ padding: '12px', background: 'var(--apinox-card-background)', borderRadius: 6, border: '1px solid var(--apinox-card-border)' }}>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>Operations</div>
                                <div style={{ fontSize: 24, fontWeight: 600 }}>{(selected.project.operations || []).length}</div>
                            </div>
                            <div style={{ padding: '12px', background: 'var(--apinox-card-background)', borderRadius: 6, border: '1px solid var(--apinox-card-border)' }}>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>Total Requests</div>
                                <div style={{ fontSize: 24, fontWeight: 600 }}>
                                    {(selected.project.operations || []).reduce((sum, op) => sum + (op.requests || []).length, 0)}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: 'var(--apinox-card-background)', borderRadius: 6, border: '1px solid var(--apinox-card-border)' }}>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>Source URL</div>
                                <div style={{ fontSize: 13, wordBreak: 'break-all', marginTop: 4 }}>
                                    {selected.project.sourceUrl || 'N/A'}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: 'var(--apinox-card-background)', borderRadius: 6, border: '1px solid var(--apinox-card-border)' }}>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>First Parsed</div>
                                <div style={{ fontSize: 13, marginTop: 4 }}>
                                    {selected.project.parsedAt ? new Date(selected.project.parsedAt).toLocaleDateString() : 'N/A'}
                                </div>
                            </div>
                            <div style={{ padding: '12px', background: 'var(--apinox-card-background)', borderRadius: 6, border: '1px solid var(--apinox-card-border)' }}>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>Content-Type {selected.project.contentType ? '(override)' : `— SOAP ${selected.project.soapVersion || '1.1'} default: ${soapDefault(selected.project.soapVersion)}`}</div>
                                <select
                                    value={selected.project.contentType || ''}
                                    onChange={(e) => onProjectContentTypeChange?.(selected.project.name, e.target.value)}
                                    disabled={!onProjectContentTypeChange}
                                    style={{
                                        marginTop: 4,
                                        width: '100%',
                                        padding: '4px 6px',
                                        backgroundColor: 'var(--apinox-input-background)',
                                        color: 'var(--apinox-input-foreground)',
                                        border: '1px solid var(--apinox-input-border)',
                                        borderRadius: 4,
                                        fontSize: 13,
                                        cursor: onProjectContentTypeChange ? 'pointer' : 'not-allowed',
                                    }}
                                >
                                    <option value="">SOAP default ({soapDefault(selected.project.soapVersion)})</option>
                                    <option value="text/xml">text/xml</option>
                                    <option value="application/soap+xml">application/soap+xml</option>
                                    <option value="application/xml">application/xml</option>
                                </select>
                            </div>
                        </div>

                        {selected.project.sourceUrl && (
                            <div style={{ marginTop: 16 }}>
                                <button
                                    onClick={() => onRefreshProject(selected.project.name)}
                                    style={{
                                        padding: '6px 14px',
                                        backgroundColor: 'var(--apinox-button-secondary-background)',
                                        color: 'var(--apinox-button-secondary-foreground)',
                                        border: '1px solid var(--apinox-button-secondary-border)',
                                        borderRadius: 4,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                    }}
                                >
                                    <RefreshCw size={14} />
                                    Refresh WSDL
                                </button>
                            </div>
                        )}

                        <div style={{ marginTop: 24 }}>
                            <h3 style={{ fontSize: 16, marginBottom: 12 }}>Operations</h3>
                            {(selected.project.operations || []).map((op: ApiOperation) => (
                                <div
                                    key={op.id || op.name}
                                    style={{
                                        padding: '10px 12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: 'var(--apinox-card-background)',
                                        borderRadius: 6,
                                        border: '1px solid var(--apinox-card-border)',
                                        marginBottom: 8,
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => onSelectNode('operation', op.id || op.name)}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <FileCode size={16} />
                                        <span>{op.name}</span>
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                        {(op.requests || []).filter(req => !req.name.startsWith('sample_')).length} request{(op.requests || []).filter(req => !req.name.startsWith('sample_')).length === 1 ? '' : 's'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : selected.type === 'operation' ? (
                    /* Operation Summary */
                    <div style={{ padding: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <Code2 size={32} color="var(--apinox-icon-primary)" />
                            <div>
                                <h2 style={{ margin: 0, fontSize: 22 }}>{selected.operation.name}</h2>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                    Endpoint: {selected.operation.originalEndpoint || 'N/A'}
                                    {selected.operation.targetNamespace ? ` • Namespace: ${selected.operation.targetNamespace}` : ''}
                                </div>
                            </div>
                        </div>

                        {/* Operation Details Grid */}
                        <div style={{
                            padding: 15,
                            backgroundColor: 'var(--apinox-editor-background)',
                            border: '1px solid var(--apinox-widget-border)',
                            borderRadius: 6,
                            marginBottom: 20,
                        }}>
                            <h3 style={{ marginTop: 0, marginBottom: 15, fontSize: 14, fontWeight: 500 }}>
                                Operation Details
                            </h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 10, fontSize: 13 }}>
                                <div style={{ opacity: 0.7 }}>SOAP Action:</div>
                                <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{selected.operation.action || '(uses endpoint)'}</div>

                                <div style={{ opacity: 0.7 }}>Input:</div>
                                {selected.operation.fullSchema ? (
                                    <div style={{ fontFamily: 'monospace' }}>
                                        <div style={{ marginBottom: 5 }}>{selected.operation.fullSchema.name} ({selected.operation.fullSchema.type})</div>
                                        {selected.operation.fullSchema.children && selected.operation.fullSchema.children.length > 0 && (
                                            <div style={{ marginLeft: 15, opacity: 0.8 }}>
                                                {selected.operation.fullSchema.children.map((child: any, idx: number) => (
                                                    <div key={idx}>• {child.name}: {child.type}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div style={{ fontFamily: 'monospace', opacity: 0.5 }}>None</div>
                                )}

                                <div style={{ opacity: 0.7 }}>SOAP Version:</div>
                                <div style={{ fontFamily: 'monospace' }}>{selected.project.soapVersion || '1.1'}</div>

                                <div style={{ opacity: 0.7 }}>Content-Type:</div>
                                <div style={{ fontFamily: 'monospace' }}>
                                    {selected.project.contentType
                                        ? `${selected.project.contentType} (interface override)`
                                        : soapDefault(selected.project.soapVersion)}
                                </div>

                                <div style={{ opacity: 0.7 }}>Binding:</div>
                                <div style={{ fontFamily: 'monospace' }}>{selected.project.bindingName || '(not available)'}</div>

                                <div style={{ opacity: 0.7 }}>Target Namespace:</div>
                                <div style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{selected.operation.targetNamespace || '(not available)'}</div>
                            </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <SampleRequestPanel
                                operation={selected.operation}
                                interfaceContext={{ contentType: selected.project.contentType, soapVersion: selected.project.soapVersion }}
                                onCreateRequest={() => onNewRequest(selected.project.name, selected.operation.name)}
                            />
                        </div>

                        <h3 style={{ fontSize: 16, marginBottom: 12 }}>Requests</h3>
                        {(selected.operation.requests || []).filter(req => !req.name.startsWith('sample_')).map((req: ApiRequest) => (
                            <div
                                key={req.id || req.name}
                                style={{
                                    padding: '10px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'var(--apinox-card-background)',
                                    borderRadius: 6,
                                    border: '1px solid var(--apinox-card-border)',
                                    marginBottom: 8,
                                    cursor: 'pointer',
                                }}
                                onClick={() => onSelectNode('request', req.id || req.name)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <FileCode size={16} />
                                    <span>{req.name}</span>
                                </div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>
                                    {req.method || 'POST'} {resolveEffectiveContentType(req, selected.operation, { contentType: selected.project.contentType, soapVersion: selected.project.soapVersion })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : selected.type === 'request' ? (
                    /* Request Editor - uses MonacoRequestEditorWithToolbar which has built-in Body + Headers tabs */
                    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        {/* Action bar */}
                        <div style={{
                            padding: '6px 12px',
                            display: 'flex',
                            gap: 8,
                            borderBottom: '1px solid var(--apinox-border)',
                            backgroundColor: 'var(--apinox-panel-background)',
                        }}>
                            <button
                                onClick={() => handleExecuteRequest(editingRequest!, editingXml)}
                                style={{
                                    padding: '4px 12px',
                                    backgroundColor: 'var(--apinox-button-primary-background)',
                                    color: 'var(--apinox-button-primary-foreground)',
                                    border: 'none',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    fontSize: 12,
                                }}
                            >
                                <Play size={13} />
                                Run
                            </button>
                            <button
                                onClick={handleSaveRequest}
                                style={{
                                    padding: '4px 12px',
                                    backgroundColor: 'var(--apinox-button-secondary-background)',
                                    color: 'var(--apinox-button-secondary-foreground)',
                                    border: '1px solid var(--apinox-button-secondary-border)',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5,
                                    fontSize: 12,
                                }}
                            >
                                <Calendar size={13} />
                                Save
                            </button>
                        </div>
                        <div style={{ flex: currentResponse ? '0 0 50%' : 1, minHeight: 0, overflow: 'hidden' }}>
                            <MonacoRequestEditor
                                value={editingXml}
                                requestId={editingRequest?.id || editingRequest?.name}
                                language="xml"
                                onChange={(value: string) => setEditingXml(value)}
                                headers={editingRequest?.headers || {}}
                                contentType={resolveEffectiveContentType(selected.request, selected.operation, { contentType: selected.project.contentType, soapVersion: selected.project.soapVersion })}
                                onHeadersChange={(headers) => {
                                    const updated = { ...editingRequest!, headers };
                                    setEditingRequest(updated);
                                    persistRequestUpdate(updated);
                                }}
                                extraTabs={[
                                    {
                                        id: 'assertions',
                                        label: 'Assertions',
                                        render: () => (
                                            <AssertionsPanel
                                                assertions={(editingRequest as any)?.assertions || []}
                                                onChange={(assertions) => {
                                                    const updated = { ...editingRequest!, assertions } as any;
                                                    setEditingRequest(updated);
                                                    persistRequestUpdate(updated);
                                                }}
                                            />
                                        ),
                                    },
                                    {
                                        id: 'extractors',
                                        label: 'Extractors',
                                        render: () => (
                                            <ExtractorsPanel
                                                extractors={(editingRequest as any)?.extractors || []}
                                                onChange={(extractors) => {
                                                    const updated = { ...editingRequest!, extractors } as any;
                                                    setEditingRequest(updated);
                                                    persistRequestUpdate(updated);
                                                }}
                                                rawResponse={currentResponse?.rawResponse}
                                            />
                                        ),
                                    },
                                ]}
                            />
                        </div>
                        {currentResponse && (
                            <div style={{ flex: '0 0 50%', minHeight: 0, overflow: 'hidden', borderTop: '1px solid var(--apinox-border)' }}>
                                <MonacoResponseViewer
                                    value={currentResponse.rawResponse || ''}
                                    language={currentResponse.contentType?.includes('json') ? 'json' : 'xml'}
                                />
                            </div>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
};
