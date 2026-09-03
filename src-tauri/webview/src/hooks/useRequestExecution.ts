/**
 * useRequestExecution.ts
 * 
 * Hook for managing SOAP request execution, updates, and related operations.
 * Extracted from App.tsx to reduce complexity.
 */

import { useRef, useCallback } from 'react';
import { bridge } from '../utils/bridge';
import { debugLog } from '../utils/logger';
import { CustomXPathEvaluator } from '../utils/xpathEvaluator';
import { FrontendCommand } from '@shared/messages';
import { getInitialXml } from '@shared/utils/xmlUtils';
import { PERF_REQUEST_ID_PREFIX, DEBOUNCE_MS } from '../constants';
import {
    ApinoxProject,
    UnifiedProject,
    ApiInterface,
    ApiOperation,
    ApiRequest,
    TestCase,
    TestStep,
    BodyType
} from '@shared/models';

/**
 * Get Content-Type header based on body type
 * Mirrors backend logic in HttpClient.ts
 */
function getContentTypeForBodyType(bodyType: BodyType): string {
    switch (bodyType) {
        case 'json':
            return 'application/json';
        case 'xml':
            return 'application/xml';
        case 'graphql':
            return 'application/json';
        case 'text':
            return 'text/plain';
        case 'form-data':
            return 'multipart/form-data';
        case 'none':
            return '';
        default:
            return 'application/json';
    }
}

/**
 * Fix legacy content-type mismatches
 * If we detect old default content-types that don't match the body type, fix them
 */
function fixContentType(request: ApiRequest): { contentType: string; headers: Record<string, string> } {
    const legacyDefaults = ['text/xml; charset=utf-8', 'text/xml', 'application/soap+xml'];
    const currentContentType = request.contentType || '';
    const currentHeaderContentType = request.headers?.['Content-Type'] || '';
    
    // For REST/GraphQL requests with a body type, ensure content type matches
    if (request.requestType === 'rest' || request.requestType === 'graphql') {
        if (request.bodyType) {
            const expectedContentType = getContentTypeForBodyType(request.bodyType);
            
            // If current content type is a legacy SOAP default, fix it
            if (legacyDefaults.includes(currentContentType) || currentContentType === '') {
                return {
                    contentType: expectedContentType,
                    headers: {
                        ...(request.headers || {}),
                        'Content-Type': expectedContentType
                    }
                };
            }
            
            // If header doesn't match content type field, fix header
            if (currentHeaderContentType !== currentContentType) {
                return {
                    contentType: currentContentType,
                    headers: {
                        ...(request.headers || {}),
                        'Content-Type': currentContentType
                    }
                };
            }
        }
    }
    
    // For SOAP requests: ensure header matches the contentType field (dropdown is authoritative)
    if (request.requestType === 'soap' && currentContentType) {
        // If header doesn't match the contentType field, fix it
        if (currentHeaderContentType !== currentContentType) {
            return {
                contentType: currentContentType,
                headers: {
                    ...(request.headers || {}),
                    'Content-Type': currentContentType
                }
            };
        }
    }
    
    // No fix needed - header already matches
    return {
        contentType: currentContentType,
        headers: request.headers || {}
    };
}

interface UseRequestExecutionParams {
    // Selection state
    selectedOperation: ApiOperation | null;
    selectedRequest: ApiRequest | null;
    selectedInterface: ApiInterface | null;
    selectedTestCase: TestCase | null;
    selectedStep: TestStep | null;
    selectedProjectName: string | null;
    wsdlUrl: string;

    // State setters
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;
    setSelectedRequest: React.Dispatch<React.SetStateAction<ApiRequest | null>>;
    setProjects: React.Dispatch<React.SetStateAction<ApinoxProject[]>>;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;
    // Phase B (t_86c34d38): the UNIFIED store — test-case step edits persist here
    // (test suites were relocated to UnifiedProject.testSuites). Absent in the
    // non-decoupled path; falls back to the legacy projects when not provided.
    unifiedProjects?: UnifiedProject[];
    setUnifiedProjects?: React.Dispatch<React.SetStateAction<UnifiedProject[]>>;

    // Other
    testExecution: Record<string, Record<string, { response?: any }>>;

    // Config support (for environment variables)
    // Performance Support
    selectedPerformanceSuiteId?: string | null;
    config?: any;
    setConfig?: React.Dispatch<React.SetStateAction<any>>;

    // Scrapbook auto-save callback
    onScrapbookAutoSave?: (updated: ApiRequest) => Promise<boolean>;
}

interface UseRequestExecutionReturn {
    executeRequest: (xml: string) => void;
    cancelRequest: () => void;
    handleRequestUpdate: (updated: ApiRequest) => void;
    handleResetRequest: () => void;
    startTimeRef: React.MutableRefObject<number>;
    // H1: shared with useMessageHandler so cancelRequest can target the in-flight request
    requestIdRef: React.MutableRefObject<string | null>;
}

export function useRequestExecution({
    selectedOperation,
    selectedRequest,
    selectedInterface,
    selectedTestCase,
    selectedStep,
    selectedProjectName,
    wsdlUrl,
    setLoading,
    setResponse,
    setSelectedRequest,
    setProjects,
    setWorkspaceDirty,
    setUnifiedProjects,
    testExecution,
    selectedPerformanceSuiteId,
    config,
    setConfig,
    onScrapbookAutoSave
}: UseRequestExecutionParams): UseRequestExecutionReturn {

    const startTimeRef = useRef<number>(0);
    // H1: id of the in-flight request, echoed back by the backend in the
    // Response/Error event (set by useMessageHandler); used by cancelRequest.
    const requestIdRef = useRef<string | null>(null);

    const executeRequest = useCallback(async (xml: string) => {
        debugLog('[App] executeRequest called');
        // H1: clear the previous execution's id; the backend echoes the new
        // execution's id back in the Response/Error event.
        requestIdRef.current = null;
        // Auto-save scrapbook request before execution (captures manual edits to URL/body)
        if (onScrapbookAutoSave && selectedRequest && !selectedProjectName && !selectedInterface && !selectedOperation && !selectedTestCase) {
            try {
                // Capture the current state including the xml being executed
                await onScrapbookAutoSave({ ...selectedRequest, request: xml });
            } catch (err) {
                debugLog('[executeRequest] Failed to auto-save scrapbook', err);
            }
        }

        setLoading(true);
        setResponse(null);
        startTimeRef.current = Date.now();

        // Allow execution if we have a request context, even if not fully in an Operation content (e.g. Test Step)
        if (selectedOperation || selectedRequest) {
            const url = selectedRequest?.endpoint || selectedInterface?.definition || wsdlUrl;
            const opName = selectedOperation?.name || selectedRequest?.name || 'Unknown Operation';
            debugLog('[App] Sending executeRequest message', { url, opName });

            // Calculate context variables if running a test step
            const contextVariables: Record<string, string> = {};
            if (selectedTestCase && selectedStep) {
                const currentIndex = selectedTestCase.steps.findIndex(s => s.id === selectedStep.id);
                if (currentIndex > 0) {
                    const priorSteps = selectedTestCase.steps.slice(0, currentIndex);
                    priorSteps.forEach(step => {
                        if (step.type === 'request' && step.config.request?.extractors) {
                            const stepExec = testExecution[selectedTestCase.id]?.[step.id];

                            step.config.request.extractors.forEach(ext => {
                                // Check if we already have a value for this variable
                                if (contextVariables[ext.variable]) return;

                                if (stepExec?.response) {
                                    // Step has been run, try to extract value
                                    const rawResp = stepExec.response.rawResponse || (typeof stepExec.response.result === 'string'
                                        ? stepExec.response.result
                                        : JSON.stringify(stepExec.response.result));

                                    if (ext.type === 'Header' || ext.source === 'header') {
                                        const responseHeaders: Record<string, string> = stepExec.response.headers || {};
                                        const headerValue = Object.entries(responseHeaders)
                                            .find(([k]) => k.toLowerCase() === (ext.path || '').toLowerCase())?.[1];
                                        if (headerValue) {
                                            contextVariables[ext.variable] = headerValue;
                                            debugLog(`[Context] Extracted header '${ext.variable}' from step '${step.name}'`, headerValue);
                                        } else if (ext.defaultValue) {
                                            contextVariables[ext.variable] = ext.defaultValue;
                                        }
                                    } else if (rawResp && ext.source === 'body') {
                                        try {
                                            const val = CustomXPathEvaluator.evaluate(rawResp, ext.path);
                                            if (val) {
                                                contextVariables[ext.variable] = val;
                                                debugLog(`[Context] Extracted '${ext.variable}' from step '${step.name}'`, val);
                                            } else if (ext.defaultValue) {
                                                // Extraction returned null, use default
                                                contextVariables[ext.variable] = ext.defaultValue;
                                            }
                                        } catch (e) {
                                            console.warn('[App] Extractor failed for variable ' + ext.variable, e);
                                            if (ext.defaultValue) {
                                                contextVariables[ext.variable] = ext.defaultValue;
                                            }
                                        }
                                    }
                                } else if (ext.defaultValue) {
                                    // Step hasn't been run yet, use default value
                                    contextVariables[ext.variable] = ext.defaultValue;
                                }
                                
                            });
                        }
                    });
                }
            }

            const { contentType: fixedContentType, headers: fixedHeaders } = selectedRequest 
                ? fixContentType(selectedRequest) 
                : { contentType: 'application/soap+xml', headers: {} };

            debugLog('[App] Context Variables', { count: Object.keys(contextVariables).length, vars: contextVariables });

            bridge.sendMessage({
                command: FrontendCommand.ExecuteRequest,
                url,
                operation: opName,
                xml,
                contentType: fixedContentType,
                assertions: selectedRequest?.assertions,
                headers: fixedHeaders,
                contextVariables,
                // SOAP metadata from operation
                targetNamespace: selectedOperation?.targetNamespace || '',
                soapAction: selectedOperation?.action || '',
                soapVersion: selectedInterface?.soapVersion || '1.1',
                // Environment for variable resolution
                environment: config?.activeEnvironment,
                // History context fields
                projectName: selectedProjectName || undefined,
                interfaceName: selectedInterface?.name || undefined,
                requestName: selectedRequest?.name || undefined,
                // WS-Security
                wsSecurity: selectedRequest?.wsSecurity,
                // Attachments
                attachments: selectedRequest?.attachments,
                // REST/GraphQL Support
                requestType: selectedRequest?.requestType,
                method: selectedRequest?.method,
                bodyType: selectedRequest?.bodyType,
                queryParams: selectedRequest?.queryParams,
                restConfig: selectedRequest?.restConfig,
                graphqlConfig: selectedRequest?.graphqlConfig
            });
        } else {
            console.error('[App] executeRequest aborted: No selectedOperation or selectedRequest');
            setLoading(false);
        }
    }, [selectedOperation, selectedRequest, selectedInterface, selectedTestCase, selectedStep, wsdlUrl, testExecution, setLoading, setResponse, onScrapbookAutoSave, selectedProjectName]);

    const cancelRequest = useCallback(() => {
        // H1: cancel exactly the in-flight request (id echoed back by the backend
        // in the Response/Error event). If no id is known yet (execution still
        // dispatching, or no id ever returned), fall back to the explicit bulk
        // command rather than silently no-op'ing the user's Cancel click.
        const inFlightId = requestIdRef.current;
        if (inFlightId) {
            bridge.sendMessage({ command: FrontendCommand.CancelRequest, requestId: inFlightId });
        } else {
            bridge.sendMessage({ command: FrontendCommand.CancelAllRequests });
        }
        setLoading(false);
    }, [setLoading]);

    // Ref for debouncing project updates
    const projectUpdateTimer = useRef<NodeJS.Timeout | null>(null);

    const handleRequestUpdate = useCallback(async (updated: ApiRequest) => {
        const logContext = {
            requestName: updated.name,
            requestId: updated.id,
            assertionCount: updated.assertions?.length || 0,
            selectedProjectName,
            selectedInterfaceName: selectedInterface?.name,
            selectedOperationName: selectedOperation?.name,
            selectedTestCaseName: selectedTestCase?.name,
            selectedTestCaseId: selectedTestCase?.id,
            selectedPerformanceSuiteId
        };


        if (selectedRequest?.readOnly) {
            debugLog('[handleRequestUpdate] Blocked update on read-only request', selectedRequest.id);
            return;
        }

        const dirtyUpdated = { ...updated, dirty: true };

        // 1. Immediate Local Update (Crucial for typing performance)
        setSelectedRequest(dirtyUpdated);
        setWorkspaceDirty(true);


        // 0. Scrapbook Request Modification (via callback)
        if (onScrapbookAutoSave) {
            const savedToScrapbook = await onScrapbookAutoSave(updated);
            if (savedToScrapbook) {
                return;
            }
        }

        // PERFORMANCE REMOVED: Performance functionality moved to APIprox

        // 1. Performance Request Modification
        if (selectedPerformanceSuiteId && updated.id?.startsWith(PERF_REQUEST_ID_PREFIX)) {
            bridge.sendMessage({ command: 'log', message: '[handleRequestUpdate] PERF PATH - updating perf request', data: JSON.stringify({ suiteId: selectedPerformanceSuiteId, requestId: updated.id }) });

            bridge.sendMessage({
                command: FrontendCommand.UpdatePerformanceRequest,
                suiteId: selectedPerformanceSuiteId,
                requestId: updated.id!,
                updates: {
                    name: updated.name,
                    requestBody: updated.request,
                    headers: updated.headers,
                    method: updated.method,
                    endpoint: updated.endpoint
                }
            });

            if (setConfig && config) {
                setConfig((prev: any) => {
                    const suites = prev.performanceSuites || [];
                    const suiteIndex = suites.findIndex((s: any) => s.id === selectedPerformanceSuiteId);
                    if (suiteIndex === -1) return prev;
                    const suite = { ...suites[suiteIndex] };
                    const reqIndex = suite.requests.findIndex((r: any) => r.id === updated.id);
                    if (reqIndex !== -1) {
                        const updatedReq = {
                            ...suite.requests[reqIndex],
                            name: updated.name,
                            requestBody: updated.request,
                            headers: updated.headers,
                            method: updated.method,
                            endpoint: updated.endpoint
                        };
                        const newRequests = [...suite.requests];
                        newRequests[reqIndex] = updatedReq;
                        const newSuites = [...suites];
                        newSuites[suiteIndex] = { ...suite, requests: newRequests };
                        return { ...prev, performanceSuites: newSuites };
                    }
                    return prev;
                });
            }
            return;
        }

        // 2. Project/Explorer Update - DEBOUNCED
        // This prevents the race condition where `setProjects` triggers a MainContent re-render
        // which inadvertently "re-syncs" selectedRequest to a slightly stale version from projects.

        if (projectUpdateTimer.current) {
            clearTimeout(projectUpdateTimer.current);
        }

        projectUpdateTimer.current = setTimeout(() => {

            // Phase B (t_86c34d38): test-case step edits persist to the UNIFIED
            // store (test suites were relocated to UnifiedProject.testSuites).
            // The unified store is the source of truth for test steps, so the
            // legacy `setProjects` path below must NOT also rewrite them (it
            // would race the unified save with a stale in-memory copy).
            let testStepHandled = false;
            if (selectedTestCase && setUnifiedProjects) {
                setUnifiedProjects(prev => {
                    const updatedProjects = prev.map(p => {
                        let caseUpdated = false;
                        const updatedSuites = p.testSuites?.map(s => {
                            const tcIndex = s.testCases?.findIndex(tc => tc.id === selectedTestCase.id) ?? -1;
                            if (tcIndex === -1) return s;

                            const updatedCases = [...(s.testCases || [])];
                            const stepIndex = updatedCases[tcIndex].steps.findIndex(step =>
                                (updated.id && step.config.request?.id === updated.id) ||
                                step.config.request?.name === updated.name ||
                                (selectedRequest && step.config.request?.name === selectedRequest.name)
                            );

                            if (stepIndex !== -1) {
                                caseUpdated = true;
                                updatedCases[tcIndex] = {
                                    ...updatedCases[tcIndex],
                                    steps: updatedCases[tcIndex].steps.map((st, i) => {
                                        if (i === stepIndex) {
                                            const finalRequest = {
                                                ...dirtyUpdated,
                                                id: dirtyUpdated.id || `req-${Date.now()}-healed`
                                            };
                                            return { ...st, config: { ...st.config, request: finalRequest } };
                                        }
                                        return st;
                                    })
                                };
                            }
                            return { ...s, testCases: updatedCases };
                        });

                        if (caseUpdated) {
                            testStepHandled = true;
                            // `dirty: true` triggers the UnifiedProjectContext
                            // auto-save (debounced) — no explicit save here,
                            // matching the legacy handleRequestUpdate pattern.
                            return { ...p, testSuites: updatedSuites, dirty: true };
                        }
                        return p;
                    });
                    return updatedProjects;
                });
            }

            // Legacy path: standard project request modification. Skipped for
            // handled test-step edits (the unified store owns them).
            if (!testStepHandled) {
                setProjects(prev => {

                    const updatedProjects = prev.map(p => {
                        // 2. Standard Project Request Modification
                        let requestFound = false;
                        const updatedProject = {
                            ...p,
                            dirty: true,
                            interfaces: p.interfaces.map(i => {
                                // Optimization: Only scan relevant interface if known? 
                                // Just scan all for correctness.
                                return {
                                    ...i,
                                    operations: i.operations.map(o => {
                                        return {
                                            ...o,
                                            requests: o.requests.map(r => {
                                                if (r.id === updated.id) {
                                                    requestFound = true;
                                                    return dirtyUpdated;
                                                }
                                                return r;
                                            })
                                        };
                                    })
                                };
                            }),
                            folders: p.folders ? updateFolderRequestInExecution(p.folders, updated.id || updated.name, dirtyUpdated, (found) => { requestFound = requestFound || found; }) : p.folders
                        };

                        return updatedProject;
                    });

                    return updatedProjects;
                });
            }
        }, DEBOUNCE_MS);

    }, [selectedProjectName, selectedTestCase, selectedInterface, selectedOperation, selectedRequest, setProjects, setUnifiedProjects, setSelectedRequest, setWorkspaceDirty, selectedPerformanceSuiteId, config, setConfig]);

    const handleResetRequest = useCallback(() => {
        if (selectedRequest && selectedOperation) {
            // Get the original request template from the operation
            // The first request in the operation contains the original full SOAP envelope
            const originalTemplate = selectedOperation.requests?.[0]?.request;

            if (originalTemplate) {
                // Use the original template which has the full SOAP envelope
                const updated = { ...selectedRequest, request: originalTemplate };
                handleRequestUpdate(updated);
            } else {
                // Fallback to generating from input if no template exists
                const xml = getInitialXml(selectedOperation.input);
                const updated = { ...selectedRequest, request: xml };
                handleRequestUpdate(updated);
            }
        }
    }, [selectedRequest, selectedOperation, handleRequestUpdate]);

    return {
        executeRequest,
        cancelRequest,
        handleRequestUpdate,
        handleResetRequest,
        startTimeRef,
        requestIdRef
    };
}

// Helper function to recursively update a request in folder structure
function updateFolderRequestInExecution(folders: any[], requestId: string, updated: any, onFound: (found: boolean) => void): any[] {
    return folders.map(folder => {
        let foundInThis = false;
        const updatedRequests = folder.requests.map((r: any) => {
            if (r.id === requestId || r.name === requestId) {
                foundInThis = true;
                return updated;
            }
            return r;
        });

        if (foundInThis) onFound(true);

        return {
            ...folder,
            requests: updatedRequests,
            folders: folder.folders ? updateFolderRequestInExecution(folder.folders, requestId, updated, onFound) : folder.folders
        };
    });
}
