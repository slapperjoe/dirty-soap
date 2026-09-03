import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
    ArrowRight,
    Server,
    Code2,
    Calendar,
    FileCode,
    Play,
    RefreshCw,
    FolderOpen,
    X,
} from 'lucide-react';
import { debugLog } from '../../utils/logger';
import { useScrapbookOptional } from '../../contexts/ScrapbookContext';
import { UnifiedProject, ApiOperation, ApiRequest, ScrapbookRequest } from '@shared/models';
import { soapDefault, resolveEffectiveContentType } from '../../utils/soapUtils';
import { invokeTauriCommand } from '../../utils/bridge';
import { buildExecuteOperation } from '../../utils/executeOperation';
import { detectLoadFormat } from '../../utils/loadRouting';
import { isScrapbookNode } from '../../utils/unifiedScrapbookCapture';
import { saveUnifiedHistoryEntry } from '../../utils/unifiedHistory';
import {
    resolveRequestType,
    buildRestGraphQlInvokeArgs,
    normalizeRestGraphQlResponse,
    editorLanguageForRequest,
    findOwnerRequest,
    ExecuteRestResponse,
} from '../../utils/unifiedExecute';
import { MonacoRequestEditorWithToolbar as MonacoRequestEditor, MonacoResponseViewer, HeadersPanel, AssertionsPanel, ExtractorsPanel } from '@apinox/request-editor/monaco';
import { ExecutionResponse } from '@apinox/request-editor/monaco';
import { EmptyState } from '../common/EmptyState';
import { SampleRequestPanel } from '../workspace/SampleRequestPanel';

export interface UnifiedExplorerMainProps {
    projects: UnifiedProject[];
    selectedNode: { type: string; id: string } | null;
    onSelectNode: (type: string, id: string) => void;
    onRefreshProject: (projectName: string) => void;
    /**
     * Load a WSDL / OpenAPI / GraphQL source. `opts` (R-11 / R-12) only
     * applies to the WSDL path: `useProxy` routes the fetch through the app
     * proxy (force-off for local files in Rust), `loadId` makes the in-flight
     * load cancellable via `cancel_unified_load`.
     */
    onLoadWsdl: (url: string, opts?: { useProxy?: boolean; loadId?: string }) => void;
    onNewRequest: (projectName: string, operationName: string) => void;
    /** Interface-level (project) Content-Type override change — propagates to all existing requests and persists the project. */
    onProjectContentTypeChange?: (projectName: string, contentType: string) => void;
    /**
     * F-02 (Q4(c)) — quick-request auto-capture hook. Called with the executed
     * request and its owning operation name (if any) after every *successful*
     * unified execution; the provider persists the entry via
     * `ScrapbookContext.captureExecution` (update keyed by
     * endpoint+operation, else append). Phase 2: the SOAP execute path is the
     * only execution path (REST/GraphQL land in phase 4 with R-09).
     */
    onAfterExecute?: (request: ApiRequest, operationName?: string | null) => void | Promise<void>;
    /**
     * F-01 — registration callback for the *current* unified execute function.
     * The Quick Requests panel lives in `UnifiedExplorerView` (a sibling of
     * `UnifiedExplorerMain`), so the sidebar's execute button registers
     * here and calls back into this component's real execute path.
     */
    onRegisterExecute?: (execute: (req: ApiRequest) => Promise<void>) => void;
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
    onAfterExecute,
    onRegisterExecute,
}) => {
    const [urlInput, setUrlInput] = useState<UrlInputState>({ url: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL', loading: false, error: null });
    /** R-12 (F-23): route the WSDL load through the app proxy (force-off for local files). */
    const [useProxy, setUseProxy] = useState<boolean>(false);
    /** R-11 (F-10): the loadId of the in-flight WSDL load (set while `urlInput.loading`). */
    const activeLoadIdRef = useRef<string | null>(null);
    /** Response cache keyed by request ID — persists across request switches */
    const [responses, setResponses] = useState<Record<string, ExecutionResponse>>({});
    const [editingRequest, setEditingRequest] = useState<ApiRequest | null>(null);
    const [editingXml, setEditingXml] = useState<string>('');
    const [envVariables, setEnvVariables] = useState<Record<string, string>>({});
    /** R-01: last execution failure, surfaced as a banner above the response viewer. */
    const [executeError, setExecuteError] = useState<string | null>(null);
    /** R-11 (F-11): in-flight request execution — enables the Cancel button next to Run. */
    const [isExecuting, setIsExecuting] = useState(false);
    /** R-11 (F-11): the Rust-side cancel token id for the in-flight request (SOAP `cancel_request` / REST/GraphQL `cancel_rest_request`). */
    const activeRequestIdRef = useRef<string | null>(null);
    /** F-01: the selected quick (scrapbook) request, kept in sync with the app-level ScrapbookContext. */
    const [selectedScrapbook, setSelectedScrapbook] = useState<ScrapbookRequest | null>(null);
    /** F-01: endpoint text for the selected quick request (editable; committed on Run/Save). */
    const [scrapbookEndpoint, setScrapbookEndpoint] = useState<string>('');

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

    // F-01: keep the selected quick request in sync with the app-level
    // ScrapbookContext (selection is owned by the provider; this only mirrors
    // it so the editor can render the selected entry's data). A deleted
    // selected entry clears local state (the provider prunes its own selection
    // on `scrapbookUpdated`).
    //
    // `scrapbookSyncRef` tracks the last-seeded (id, endpoint, body) so a
    // reference-only re-sync (e.g. a headers save-back triggering
    // `scrapbookUpdated`) never clobbers in-progress local edits — the editor
    // is only re-seeded when switching entries or when the stored entry's
    // data actually changed (save / auto-capture).
    const scrapbookSyncRef = useRef<{ id: string | null; endpoint: string; body: string }>({ id: null, endpoint: '', body: '' });
    const contextScrapbook = useScrapbookOptional()?.selectedScrapbookRequest ?? null;
    const updateScrapbookRequest = useScrapbookOptional()?.updateRequest;
    useEffect(() => {
        const s = scrapbookSyncRef.current;
        if (contextScrapbook && contextScrapbook.id !== s.id) {
            scrapbookSyncRef.current = {
                id: contextScrapbook.id,
                endpoint: contextScrapbook.endpoint || '',
                body: contextScrapbook.request || '',
            };
        } else if (!contextScrapbook && s.id !== null) {
            scrapbookSyncRef.current = { id: null, endpoint: '', body: '' };
        }
        setSelectedScrapbook(contextScrapbook);
    }, [contextScrapbook]);

    // F-01: sync the quick-request editor when a `scrapbook` node is selected.
    // The node id is the scrapbook request id (selection contract from
    // `unifiedScrapbookCapture.isScrapbookNode`); the request data comes from
    // the app-level ScrapbookContext via `selectedScrapbook` (kept in sync by
    // the effect above). When no scrapbook is selected the editor is cleared.
    useEffect(() => {
        if (!isScrapbookNode(selectedNode) || !selectedNode) {
            return;
        }
        if (selectedScrapbook && selectedScrapbook.id === selectedNode.id) {
            const s = scrapbookSyncRef.current;
            const changed =
                s.id !== selectedScrapbook.id ||
                selectedScrapbook.request !== s.body ||
                (selectedScrapbook.endpoint || '') !== s.endpoint;
            setEditingRequest(selectedScrapbook);
            if (changed) {
                // Switching entries, or the stored entry changed on the
                // server side (save / auto-capture): re-seed the editor.
                setEditingXml(selectedScrapbook.request || '');
                setScrapbookEndpoint(selectedScrapbook.endpoint || '');
                scrapbookSyncRef.current = {
                    id: selectedScrapbook.id,
                    endpoint: selectedScrapbook.endpoint || '',
                    body: selectedScrapbook.request || '',
                };
            }
        } else {
            setEditingRequest(null);
            setEditingXml('');
            setScrapbookEndpoint('');
            scrapbookSyncRef.current = { id: null, endpoint: '', body: '' };
        }
    }, [selectedNode, selectedScrapbook]);

    // Find selected entity
    const findSelected = () => {
        if (!selectedNode) return null;
        // F-01: quick requests live outside the project tree — a
        // `scrapbook` node is resolved against the app-level ScrapbookContext
        // (mirrored in `selectedScrapbook`), not against `projects`.
        if (selectedNode.type === 'scrapbook') {
            if (selectedScrapbook && selectedScrapbook.id === selectedNode.id) {
                return { type: 'scrapbook' as const, request: selectedScrapbook };
            }
            // Selection is known but the entry isn't loaded (or was deleted):
            // still report the node so the main area renders the quick-request
            // editor frame (empty until the data arrives), not the empty state.
            return { type: 'scrapbook' as const, request: null };
        }
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
        // R-03: load routing decision (URL/file extension → WSDL vs OpenAPI vs
        // GraphQL). Phase 0 surfaces the decision in the debug log; Phase 1
        // routes 'openapi'/'graphql' to parse_spec_as_project.
        const loadUrl = urlInput.url.trim();
        const loadFormat = detectLoadFormat(loadUrl);
        debugLog('[UnifiedExplorerMain] Load routing', { url: loadUrl, format: loadFormat, useProxy });
        setUrlInput(prev => ({ ...prev, loading: true, error: null }));
        // R-11 (F-10): a webview-generated loadId lets the Cancel button abort
        // the in-flight WSDL load (the Rust side registers the load under this
        // id and checks a shared cancel flag between fetches).
        const loadId = crypto.randomUUID();
        activeLoadIdRef.current = loadId;
        try {
            await onLoadWsdl(loadUrl, { useProxy, loadId });
            setUrlInput({ url: '', loading: false, error: null });
        } catch (e: any) {
            setUrlInput({ ...urlInput, loading: false, error: e?.message || 'Failed to load WSDL' });
        } finally {
            activeLoadIdRef.current = null;
        }
    }, [urlInput.url, urlInput, useProxy, onLoadWsdl]);

    const handleLoadFile = useCallback(async () => {
        try {
            const { open } = await import('@tauri-apps/plugin-dialog');
            const selectedPath = await open({
                multiple: false,
                filters: [
                    { name: 'API Definition Files', extensions: ['wsdl', 'xml', 'json', 'yaml', 'yml'] },
                ],
            });
            if (!selectedPath) return;
            const fileUrl = `file://${selectedPath}`;
            setUrlInput(prev => ({ ...prev, loading: true, error: null }));
            // R-12: the Rust side force-disables the proxy for local files
            // (file:// URLs), matching the legacy `useProxy: false` behaviour.
            const loadId = crypto.randomUUID();
            activeLoadIdRef.current = loadId;
            try {
                await onLoadWsdl(fileUrl, { useProxy, loadId });
            } finally {
                activeLoadIdRef.current = null;
            }
            setUrlInput(prev => ({ ...prev, loading: false, error: null }));
        } catch (e: any) {
            setUrlInput(prev => ({ ...prev, loading: false, error: e?.message || 'Failed to load WSDL file' }));
        }
    }, [onLoadWsdl, useProxy]);

    /** R-11 (F-10): abort the in-flight WSDL load (Cancel button on the Load bar). */
    const handleCancelLoad = useCallback(async () => {
        const loadId = activeLoadIdRef.current;
        if (!loadId) return;
        try {
            const res = await invokeTauriCommand<{ cancelled: boolean; found: boolean }>(
                'cancel_unified_load', { loadId },
            );
            debugLog('[UnifiedExplorerMain] Load cancel', res);
        } catch (e) {
            debugLog('[UnifiedExplorerMain] Load cancel failed', String(e));
        }
    }, []);

    const handleExecuteRequest = useCallback(async (req: ApiRequest, currentXml: string) => {
        setEditingRequest(req);
        const reqId = req.id || req.name || 'unknown';
        // Phase 4 (R-09): quick requests are executed through this same
        // unified path, which now dispatches by request type — SOAP
        // requests (including quick requests, whose type is undeclared in
        // the frozen scrapbook.json schema) take the byte-identical R-02
        // SOAP baseline; REST and GraphQL requests route to
        // `execute_rest_request` (legacy bridge.ts:433–505 semantics).
        const isQuickRequest = isScrapbookNode(selectedNode);
        const requestType = resolveRequestType(req);

        // Locate the owning project/operation. For SOAP this resolves the
        // *effective* Content-Type (interface override > stored value > SOAP
        // default — the UI must send exactly what it displays,
        // SOAP_INTERFACE_CONTENT_TYPE_SPEC.md); for REST/GraphQL it supplies
        // the history entry's project/operation names.
        const owner = findOwnerRequest(projects, reqId);
        const ownerProject = owner?.project;
        const ownerOperation = owner?.operation;
        const effectiveContentType = resolveEffectiveContentType(req, ownerOperation ?? null, {
            contentType: ownerProject?.contentType,
            soapVersion: ownerProject?.soapVersion,
        });

        // R-01: clear any previous failure; a new execution starts clean.
        setExecuteError(null);

        // R-11 (F-11): the UI passes its own request id so the Cancel button
        // can target exactly this in-flight request (SOAP → `cancel_request`,
        // REST/GraphQL → `cancel_rest_request`).
        const executionId = crypto.randomUUID();
        activeRequestIdRef.current = executionId;
        setIsExecuting(true);

        const startTime = Date.now();
        try {
            if (requestType !== 'soap') {
                // ── REST / GraphQL (R-09, F-06/F-07) ─────────────────────────
                // `execute_rest_request` with the legacy bridge's flat-arg
                // semantics: body only for GraphQL or body methods; raw
                // GraphQL queries wrapped as {"query": …} (util keeps the
                // rule in one testable place).
                const invokeArgs = buildRestGraphQlInvokeArgs({
                    method: req.method || (requestType === 'graphql' ? 'POST' : 'GET'),
                    url: req.endpoint || '',
                    headers: req.headers || {},
                    body: currentXml || req.request || null,
                    variables: req.graphqlConfig?.variables,
                    isGraphQL: requestType === 'graphql',
                });
                // R-11: `requestId` registers a cancel token in Rust (the
                // token races the send AND the body read in `execute_internal`).
                const result = await invokeTauriCommand<ExecuteRestResponse>(
                    'execute_rest_request',
                    { ...invokeArgs, requestId: executionId },
                );
                const duration = Date.now() - startTime;
                const headers = result.headers || {};
                const normalizedResponse: ExecutionResponse = {
                    ...normalizeRestGraphQlResponse(result, req.contentType),
                    time: result.time_taken_ms,
                };
                setResponses(prev => ({ ...prev, [reqId]: normalizedResponse }));

                // F-13 / R-08 (phase 4 extension): every REST/GraphQL
                // execution writes an entry to the SAME single global
                // history store (doc §10.4 / Q6), mirroring the legacy
                // `saveRequestHistory` call at bridge.ts:475–489.
                const responseBody = normalizedResponse.rawResponse || '';
                saveUnifiedHistoryEntry({
                    requestName: req.name || 'Request',
                    endpoint: req.endpoint || '',
                    method: invokeArgs.method,
                    projectName: ownerProject?.name || '',
                    interfaceName: ownerProject?.name || '',
                    operationName: ownerOperation?.name || (isQuickRequest ? '' : req.name),
                    requestBody: invokeArgs.body || '',
                    headers: req.headers || {},
                    statusCode: result.status ?? 0,
                    duration,
                    responseBody,
                    responseHeaders: headers,
                    success: !!result.success,
                    error: result.success ? undefined : (result.error || undefined),
                });

                // Persist response to disk (project requests only — quick
                // requests persist via the scrapbook store).
                if (!isQuickRequest) {
                    (req as any).lastResponse = {
                        rawResponse: normalizedResponse.rawResponse,
                        status: normalizedResponse.status,
                        statusText: normalizedResponse.statusText,
                        headers: normalizedResponse.headers,
                        contentType: normalizedResponse.contentType,
                    };
                    await persistRequestUpdate(req, currentXml);
                }

                // F-02 / R-05 (Q4(c)): auto-capture every successful
                // execution into the scrapbook (endpoint+operation keyed,
                // else append). Best-effort: failures never break the run.
                if (result.success && onAfterExecute) {
                    try {
                        await onAfterExecute(req, ownerOperation?.name ?? null);
                    } catch (e: any) {
                        console.error('[UnifiedExplorerMain] Auto-capture failed:', e);
                    }
                }

                debugLog('[UnifiedExplorerMain] Request executed', req.name);
                setExecuteError(null);
                return;
            }

            // ── SOAP (R-02 faithful baseline — byte-identical; do not change
            //     the payload) ───────────────────────────────────────────────
            // R-02: send the real resolved operation (action/input/
            // targetNamespace/fullSchema) instead of a hardcoded nulled stub.
            // Falls back to the stub shape only when ownerOperation is
            // genuinely absent.
            const operation = buildExecuteOperation(ownerOperation, req);

            const result = await invokeTauriCommand<ExecuteSoapResponse>('execute_soap_request', {
                request: {
                    operation,
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
                    // R-11 (F-11): register a cancel token for this execution
                    // (the Rust `ExecuteSoapRequest.request_id` field).
                    requestId: executionId,
                },
            });
            const duration = Date.now() - startTime;

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

            // F-13 / R-08 (phase 2, SOAP path): every unified SOAP execution
            // writes an entry to the single global history store (parity with
            // the legacy `saveRequestHistory` at bridge.ts:1232–1254).
            const responseBody = normalizedResponse.rawResponse || '';
            saveUnifiedHistoryEntry({
                requestName: req.name || 'Request',
                endpoint: req.endpoint || '',
                method: req.method || 'POST',
                projectName: ownerProject?.name || '',
                interfaceName: ownerProject?.name || '',
                operationName: ownerOperation?.name || (isQuickRequest ? '' : req.name),
                requestBody: currentXml || req.request || '',
                headers: req.headers || {},
                statusCode: result.statusCode || (result.success ? 200 : 500),
                duration,
                responseBody,
                responseHeaders: headers,
                success: !!result.success,
                error: result.success ? undefined : (result.error || undefined),
            });

            // Persist response to disk so it survives app restarts (project
            // requests only — quick requests persist via the scrapbook store).
            if (!isQuickRequest) {
                (req as any).lastResponse = {
                    rawResponse: normalizedResponse.rawResponse,
                    status: normalizedResponse.status,
                    statusText: normalizedResponse.statusText,
                    headers: normalizedResponse.headers,
                    contentType: normalizedResponse.contentType,
                };
                await persistRequestUpdate(req, currentXml);
            }

            // F-02 / R-05 (Q4(c)): auto-capture every successful execution into
            // the scrapbook — update the entry keyed by endpoint+operation,
            // else append. Best-effort: failures never break the execution.
            if (result.success && onAfterExecute) {
                try {
                    await onAfterExecute(req, ownerOperation?.name ?? null);
                } catch (e: any) {
                    console.error('[UnifiedExplorerMain] Auto-capture failed:', e);
                }
            }

            debugLog('[UnifiedExplorerMain] Request executed', req.name);
            setExecuteError(null);
        } catch (e: any) {
            debugLog('[UnifiedExplorerMain] Request execution failed', String(e));
            // R-01: surface the failure to the user (previously debugLog-only —
            // a failed request gave zero feedback in the unified view).
            setExecuteError(e?.message || String(e) || 'Request execution failed');
        } finally {
            // R-11: execution finished (success, error, or early return) —
            // release the in-flight marker so the Cancel button re-enables
            // for the next Run.
            setIsExecuting(false);
            activeRequestIdRef.current = null;
        }
    }, [envVariables, persistRequestUpdate, projects, selectedNode, onAfterExecute]);

    /**
     * R-11 (F-11): cancel the in-flight request from the Cancel button.
     * Routes by the request's type: SOAP → `cancel_request` (existing Rust
     * registry), REST/GraphQL → `cancel_rest_request`. The Rust side signals
     * its `CancelToken`; the in-flight call then fails at its next await point
     * (send or body read) and surfaces here as a normal error.
     */
    const handleCancelRequest = useCallback(async () => {
        const requestId = activeRequestIdRef.current;
        if (!requestId || !editingRequest) return;
        const requestType = resolveRequestType(editingRequest);
        try {
            const command = requestType === 'soap' ? 'cancel_request' : 'cancel_rest_request';
            const res = await invokeTauriCommand<{ cancelled?: boolean; found?: boolean }>(
                command, { requestId },
            );
            debugLog('[UnifiedExplorerMain] Request cancel', { command, res });
        } catch (e) {
            debugLog('[UnifiedExplorerMain] Request cancel failed', String(e));
        }
    }, [editingRequest]);

    // F-01: Run button for the quick-request editor. Executes the selected
    // scrapbook entry (with the current endpoint text) through the unified
    // SOAP path; the response renders in the same response viewer.
    const handleExecuteQuickRequest = useCallback(async () => {
        if (!selectedScrapbook) return;
        const req: ApiRequest = {
            ...selectedScrapbook,
            endpoint: scrapbookEndpoint || selectedScrapbook.endpoint,
        };
        const bodyXml = editingXml || req.request || '';
        await handleExecuteRequest({ ...req, request: bodyXml }, bodyXml);
    }, [selectedScrapbook, scrapbookEndpoint, editingXml, handleExecuteRequest]);

    const handleSaveRequest = useCallback(async () => {
        if (!editingRequest) return;
        // F-01: quick requests save back through the app-level ScrapbookContext
        // (updateRequest → `update_scrapbook_request` → scrapbook.json).
        if (isScrapbookNode(selectedNode) && selectedScrapbook?.id) {
            const sbReq = selectedScrapbook;
            const updated: ScrapbookRequest = {
                ...sbReq,
                request: editingXml,
                endpoint: scrapbookEndpoint,
                lastModified: new Date().toISOString(),
            };
            setEditingRequest(updated);
            try {
                if (updateScrapbookRequest) {
                    await updateScrapbookRequest(sbReq.id, {
                        request: editingXml,
                        endpoint: scrapbookEndpoint,
                    });
                }
                debugLog('[UnifiedExplorerMain] Quick request saved', sbReq.name);
            } catch (e: any) {
                setExecuteError(`Failed to save quick request: ${e?.message || String(e)}`);
            }
            return;
        }
        editingRequest.request = editingXml;
        await persistRequestUpdate(editingRequest, editingXml);
        debugLog('[UnifiedExplorerMain] Request body saved', editingRequest.name);
    }, [editingRequest, editingXml, persistRequestUpdate, selectedNode, selectedScrapbook, scrapbookEndpoint, updateScrapbookRequest]);

    // F-01: expose the current unified execute path to the Quick Requests
    // panel (lives in UnifiedExplorerView, a sibling of this component).
    // Re-registered whenever the handler changes (env vars / selection /
    // projects).
    useEffect(() => {
        if (onRegisterExecute) {
            onRegisterExecute(async (req: ApiRequest) => {
                await handleExecuteRequest(req, req.request || '');
            });
        }
    }, [onRegisterExecute, handleExecuteRequest]);

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
                    data-testid="unified-load-cancel"
                    onClick={handleCancelLoad}
                    disabled={!urlInput.loading}
                    title="Cancel in-flight WSDL load"
                    style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--apinox-button-secondary-background)',
                        color: 'var(--apinox-button-secondary-foreground)',
                        border: '1px solid var(--apinox-button-secondary-border)',
                        borderRadius: 4,
                        cursor: urlInput.loading ? 'pointer' : 'not-allowed',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        opacity: urlInput.loading ? 1 : 0.5,
                    }}
                >
                    <X size={14} />
                    Cancel
                </button>
                {/* R-12 (F-23): route the WSDL load through the app proxy.
                    Force-off for local files is enforced in Rust (file://
                    URLs), matching the legacy `useProxy` behaviour. */}
                <label
                    data-testid="unified-load-proxy-toggle"
                    title="Route the WSDL load through the app proxy (ignored for local files)"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 12,
                        color: 'var(--apinox-foreground)',
                        opacity: 0.85,
                        cursor: 'pointer',
                        userSelect: 'none',
                    }}
                >
                    <input
                        type="checkbox"
                        checked={useProxy}
                        onChange={(e) => setUseProxy(e.target.checked)}
                        style={{ margin: 0, accentColor: 'var(--apinox-primary)' }}
                    />
                    Proxy
                </label>
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
                                    {resolveEffectiveContentType(
                                        (selected.operation.requests || []).find(r => r.name.startsWith('sample_')) || null,
                                        selected.operation,
                                        { contentType: selected.project.contentType, soapVersion: selected.project.soapVersion }
                                    )}{selected.project.contentType ? ' (interface override)' : ''}
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
                ) : selected.type === 'scrapbook' ? (
                    /* Quick Request (scrapbook) editor — F-01 / R-05.
                       Endpoint + headers + body, with Run/Save-back via the
                       app-level ScrapbookContext. Execution routes through the
                       unified SOAP path (phase 2); response renders in the
                       same response viewer as project requests. */
                    <div data-testid="quick-request-editor" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                        {/* Quick request header + editable endpoint */}
                        <div style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--apinox-border)',
                            backgroundColor: 'var(--apinox-panel-background)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <FileCode size={18} />
                                <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selected.request?.name || 'Quick Request'}
                                </span>
                                {selected.request && (
                                    <span style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'nowrap' }}>
                                        {selected.request.method || 'POST'} • {selected.request.contentType || 'application/soap+xml'}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <label htmlFor="quick-request-endpoint" style={{ fontSize: 12, opacity: 0.7, flexShrink: 0 }}>
                                    Endpoint
                                </label>
                                <input
                                    id="quick-request-endpoint"
                                    data-testid="quick-request-endpoint"
                                    type="text"
                                    value={scrapbookEndpoint}
                                    onChange={(e) => setScrapbookEndpoint(e.target.value)}
                                    placeholder="https://example.com/soap/service"
                                    style={{
                                        flex: 1,
                                        padding: '6px 10px',
                                        backgroundColor: 'var(--apinox-input-background)',
                                        color: 'var(--apinox-input-foreground)',
                                        border: '1px solid var(--apinox-input-border)',
                                        borderRadius: 4,
                                        outline: 'none',
                                        fontSize: 13,
                                    }}
                                />
                                <button
                                    data-testid="quick-request-run"
                                    onClick={handleExecuteQuickRequest}
                                    disabled={!editingRequest}
                                    style={{
                                        padding: '6px 14px',
                                        backgroundColor: 'var(--apinox-button-primary-background)',
                                        color: 'var(--apinox-button-primary-foreground)',
                                        border: 'none',
                                        borderRadius: 4,
                                        cursor: editingRequest ? 'pointer' : 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        opacity: editingRequest ? 1 : 0.5,
                                    }}
                                >
                                    <Play size={14} />
                                    Run
                                </button>
                                {isExecuting && (
                                    <button
                                        data-testid="unified-request-cancel"
                                        onClick={handleCancelRequest}
                                        title="Cancel in-flight request"
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
                                        <X size={14} />
                                        Cancel
                                    </button>
                                )}
                                <button
                                    data-testid="quick-request-save"
                                    onClick={handleSaveRequest}
                                    disabled={!editingRequest}
                                    style={{
                                        padding: '6px 14px',
                                        backgroundColor: 'var(--apinox-button-secondary-background)',
                                        color: 'var(--apinox-button-secondary-foreground)',
                                        border: '1px solid var(--apinox-button-secondary-border)',
                                        borderRadius: 4,
                                        cursor: editingRequest ? 'pointer' : 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        opacity: editingRequest ? 1 : 0.5,
                                    }}
                                >
                                    <Calendar size={14} />
                                    Save
                                </button>
                            </div>
                        </div>
                        {executeError && (
                            <div
                                role="alert"
                                data-testid="execute-error-banner"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    padding: '6px 12px',
                                    backgroundColor: 'var(--apinox-error-background, rgba(192, 57, 43, 0.15))',
                                    color: 'var(--apinox-errorForeground, #f48771)',
                                    borderBottom: '1px solid var(--apinox-error-border, var(--apinox-errorForeground))',
                                    fontSize: 12,
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{executeError}</span>
                                <button
                                    onClick={() => setExecuteError(null)}
                                    aria-label="Dismiss error"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'inherit',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        lineHeight: 1,
                                        padding: '0 4px',
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        )}
                        <div style={{ flex: currentResponse ? '0 0 50%' : 1, minHeight: 0, overflow: 'hidden' }}>
                            <MonacoRequestEditor
                                value={editingXml}
                                requestId={editingRequest?.id || editingRequest?.name}
                                language={editorLanguageForRequest(editingRequest)}
                                onChange={(value: string) => setEditingXml(value)}
                                headers={editingRequest?.headers || {}}
                                contentType={editingRequest?.contentType || 'application/soap+xml'}
                                onHeadersChange={(headers) => {
                                    const updated = { ...editingRequest!, headers };
                                    setEditingRequest(updated);
                                    // Save-back through the scrapbook store (headers
                                    // persist on change, matching the project-request
                                    // editor behaviour).
                                    if (updated.id && updateScrapbookRequest) {
                                        updateScrapbookRequest(updated.id, { headers }).catch((e: any) => {
                                            console.error('[UnifiedExplorerMain] Failed to save quick request headers:', e);
                                        });
                                    }
                                }}
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
                            {isExecuting && (
                                <button
                                    data-testid="unified-request-cancel"
                                    onClick={handleCancelRequest}
                                    title="Cancel in-flight request"
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
                                    <X size={13} />
                                    Cancel
                                </button>
                            )}
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
                        {/* R-01: execution error surface — inline banner above the
                            editor/response pane so a failed request is visible
                            (previously a failure produced no user feedback). */}
                        {executeError && (
                            <div
                                role="alert"
                                data-testid="execute-error-banner"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    padding: '6px 12px',
                                    backgroundColor: 'var(--apinox-error-background, rgba(192, 57, 43, 0.15))',
                                    color: 'var(--apinox-errorForeground, #f48771)',
                                    borderBottom: '1px solid var(--apinox-error-border, var(--apinox-errorForeground))',
                                    fontSize: 12,
                                }}
                            >
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {executeError}
                                </span>
                                <button
                                    onClick={() => setExecuteError(null)}
                                    aria-label="Dismiss error"
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'inherit',
                                        cursor: 'pointer',
                                        fontSize: 14,
                                        lineHeight: 1,
                                        padding: '0 4px',
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        )}
                        <div style={{ flex: currentResponse ? '0 0 50%' : 1, minHeight: 0, overflow: 'hidden' }}>
                            <MonacoRequestEditor
                                value={editingXml}
                                requestId={editingRequest?.id || editingRequest?.name}
                                language={editorLanguageForRequest(editingRequest)}
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
