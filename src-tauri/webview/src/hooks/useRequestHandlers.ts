/**
 * useRequestHandlers.ts
 * 
 * Extracted from App.tsx - handles SOAP request execution, cancellation, and updates.
 */

import { useCallback, useRef } from 'react';
import { bridge } from '../utils/bridge';
import { FrontendCommand } from '@shared/messages';
import { CustomXPathEvaluator } from '../utils/xpathEvaluator';
import { useProject } from '../contexts/ProjectContext';
import { ApiRequest, ApiOperation, ApiInterface, TestCase } from '@shared/models';

interface UseRequestHandlersProps {
    selectedRequest: ApiRequest | null;
    setSelectedRequest: (req: ApiRequest | null) => void;
    selectedOperation: ApiOperation | null;
    selectedInterface: ApiInterface | null;
    selectedTestCase: TestCase | null;
    selectedStep: any;
    testExecution: Record<string, Record<string, any>>;
    wsdlUrl: string;
    setLoading: (loading: boolean) => void;
    setResponse: (response: any) => void;
    setWorkspaceDirty: (dirty: boolean) => void;
    setExploredInterfaces: React.Dispatch<React.SetStateAction<ApiInterface[]>>;
}

interface UseRequestHandlersReturn {
    executeRequest: (xml: string) => void;
    cancelRequest: () => void;
    handleRequestUpdate: (updated: ApiRequest) => void;
    handleResetRequest: () => void;
    startTimeRef: React.MutableRefObject<number>;
}

export function useRequestHandlers({
    selectedRequest,
    setSelectedRequest,
    selectedOperation,
    selectedInterface,
    selectedTestCase,
    selectedStep,
    testExecution,
    wsdlUrl,
    setLoading,
    setResponse,
    setWorkspaceDirty,
    setExploredInterfaces,
}: UseRequestHandlersProps): UseRequestHandlersReturn {
    const { setProjects, saveProject, selectedProjectName } = useProject();
    const startTimeRef = useRef<number>(0);

    const executeRequest = useCallback((xml: string) => {
        console.log('[useRequestHandlers] executeRequest called');
        console.log('[useRequestHandlers] Context - Operation:', selectedOperation?.name, 'Request:', selectedRequest?.name);

        setLoading(true);
        setResponse(null);
        startTimeRef.current = Date.now();

        if (selectedOperation || selectedRequest) {
            const url = selectedRequest?.endpoint || selectedInterface?.definition || wsdlUrl;
            const opName = selectedOperation?.name || selectedRequest?.name || 'Unknown Operation';

            console.log('[useRequestHandlers] Sending executeRequest message. URL:', url, 'Op:', opName);

            const logToOutput = (msg: string) => bridge.sendMessage({ command: 'log', message: msg });
            logToOutput(`Starting execution of step: ${selectedStep?.name || selectedRequest?.name}`);

            // Calculate context variables if running a test step
            const contextVariables: Record<string, string> = {};
            if (selectedTestCase && selectedStep) {
                const currentIndex = selectedTestCase.steps.findIndex(s => s.id === selectedStep.id);
                if (currentIndex > 0) {
                    const priorSteps = selectedTestCase.steps.slice(0, currentIndex);
                    priorSteps.forEach(step => {
                        if (step.type === 'request' && step.config.request?.extractors) {
                            const stepExec = testExecution[selectedTestCase.id]?.[step.id];
                            if (stepExec?.response) {
                                const rawResp = stepExec.response.rawResponse || (typeof stepExec.response.result === 'string'
                                    ? stepExec.response.result
                                    : JSON.stringify(stepExec.response.result));

                                if (rawResp) {
                                    step.config.request.extractors.forEach(ext => {
                                        if (ext.source === 'body') {
                                            try {
                                                const val = CustomXPathEvaluator.evaluate(rawResp, ext.path);
                                                if (val) {
                                                    contextVariables[ext.variable] = val;
                                                    logToOutput(`[Context] Extracted '${ext.variable}' = '${val}' from step '${step.name}'`);
                                                } else {
                                                    logToOutput(`[Context] Warning: Extractor for '${ext.variable}' in step '${step.name}' returned null.`);
                                                }
                                            } catch (e) {
                                                console.warn('[useRequestHandlers] Extractor failed for variable ' + ext.variable, e);
                                                logToOutput(`[Context] Error evaluating extractor for '${ext.variable}': ${e}`);
                                            }
                                        }
                                    });
                                }
                            }
                        }
                    });
                }
            }

            console.log('[useRequestHandlers] Context Variables:', contextVariables);
            if (Object.keys(contextVariables).length > 0) {
                logToOutput(`[Context] Sending ${Object.keys(contextVariables).length} context variables to backend.`);
            }

            bridge.sendMessage({
                command: FrontendCommand.ExecuteRequest,
                url,
                operation: opName,
                xml,
                contentType: selectedRequest?.contentType,
                assertions: selectedRequest?.assertions,
                headers: selectedRequest?.headers,
                contextVariables,
                // History context fields
                projectName: selectedProjectName || undefined,
                interfaceName: selectedInterface?.name || undefined,
                requestName: selectedRequest?.name || undefined,
                // WS-Security
                wsSecurity: selectedRequest?.wsSecurity,
                // Attachments
                attachments: selectedRequest?.attachments
            });
        } else {
            console.error('[useRequestHandlers] executeRequest aborted: No selectedOperation or selectedRequest');
            setLoading(false);
        }
    }, [selectedOperation, selectedRequest, selectedInterface, selectedTestCase, selectedStep, testExecution, wsdlUrl, setLoading, setResponse]);

    const cancelRequest = useCallback(() => {
        bridge.sendMessage({ command: FrontendCommand.CancelRequest });
        setLoading(false);
    }, [setLoading]);

    const handleRequestUpdate = useCallback((updated: ApiRequest) => {
        if (selectedRequest?.readOnly) {
            console.log('[useRequestHandlers] Blocked update on read-only request:', updated.id);
            return;
        }

        const dirtyUpdated = { ...updated, dirty: true };
        setWorkspaceDirty(true);

        if (selectedProjectName) {
            setProjects(prev => {
                const updatedProjects = prev.map(p => {
                    if (p.name !== selectedProjectName) return p;

                    // 1. Is it a Test Case modification?
                    if (selectedTestCase) {
                        console.log('[handleRequestUpdate] Updating within Test Case:', selectedTestCase.name);
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

                            console.log('[handleRequestUpdate] Step Search Result:', stepIndex, 'for request:', updated.name);

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
                            const updatedProject = { ...p, testSuites: updatedSuites, dirty: true };
                            // No longer auto-saving - user must click Save button
                            return updatedProject;
                        }
                    }

                    // 2. Normal Request Modification
                    const updatedProject = {
                        ...p,
                        dirty: true,
                        interfaces: p.interfaces.map(i => {
                            if (i.name !== selectedInterface?.name) return i;
                            return {
                                ...i,
                                operations: i.operations.map(o => {
                                    if (o.name !== selectedOperation?.name) return o;
                                    return {
                                        ...o,
                                        requests: o.requests.map(r => r.name === selectedRequest?.name ? dirtyUpdated : r)
                                    };
                                })
                            };
                        }),
                        // 3. Check folder requests (user-created/REST/GraphQL)
                        folders: p.folders ? updateFolderRequest(p.folders, updated.id || updated.name, dirtyUpdated) : p.folders
                    };
                    // No longer auto-saving - user must click Save button
                    return updatedProject;
                });

                // After updating projects, find and re-select the updated request to maintain correct reference
                const updatedProject = updatedProjects.find(p => p.name === selectedProjectName);
                if (updatedProject && selectedRequest) {
                    // Search for updated request in folders
                    const findInFolders = (folders: any[]): any => {
                        for (const folder of folders) {
                            const found = folder.requests.find((r: any) => {
                                if (selectedRequest.id) {
                                    return r.id === selectedRequest.id;
                                }
                                return r.name === selectedRequest.name;
                            });

                            if (found) return found;
                            if (folder.folders) {
                                const nested = findInFolders(folder.folders);
                                if (nested) return nested;
                            }
                        }
                        return null;
                    };

                    const foundInFolders = updatedProject.folders ? findInFolders(updatedProject.folders) : null;
                    if (foundInFolders) {
                        setSelectedRequest(foundInFolders);
                        return updatedProjects;
                    }

                    // Search in interfaces if not in folders
                    const foundInInterface = updatedProject.interfaces
                        .find(i => i.name === selectedInterface?.name)
                        ?.operations.find(o => o.name === selectedOperation?.name)
                        ?.requests.find(r => r.name === selectedRequest.name);

                    if (foundInInterface) {
                        setSelectedRequest(foundInInterface);
                    }
                }

                return updatedProjects;
            });
        } else {
            // WSDL Explorer path (no project selected)
            setSelectedRequest(dirtyUpdated);
            setExploredInterfaces(prev => prev.map(i => {
                if (i.name !== selectedInterface?.name) return i;
                return {
                    ...i,
                    operations: i.operations.map(o => {
                        if (o.name !== selectedOperation?.name) return o;
                        return {
                            ...o,
                            requests: o.requests.map(r => r.name === selectedRequest?.name ? dirtyUpdated : r)
                        };
                    })
                };
            }));
        }
    }, [selectedProjectName, selectedTestCase, selectedRequest, selectedInterface, selectedOperation, setSelectedRequest, setWorkspaceDirty, setProjects, setExploredInterfaces, saveProject]);

    const handleResetRequest = useCallback(() => {
        if (selectedRequest && selectedOperation) {
            const xml = getInitialXml(selectedOperation.input);
            const updated = { ...selectedRequest, request: xml };
            handleRequestUpdate(updated);
        }
    }, [selectedRequest, selectedOperation, handleRequestUpdate]);

    return {
        executeRequest,
        cancelRequest,
        handleRequestUpdate,
        handleResetRequest,
        startTimeRef,
    };
}

// Helper function to recursively update a request in folder structure
function updateFolderRequest(folders: any[], requestId: string, updated: ApiRequest): any[] {
    return folders.map(folder => ({
        ...folder,
        requests: folder.requests.map((r: any) =>
            (r.id === requestId || r.name === requestId) ? updated : r
        ),
        folders: folder.folders ? updateFolderRequest(folder.folders, requestId, updated) : folder.folders
    }));
}

// Utility function (also used by App.tsx)
export function getInitialXml(input: any): string {
    if (!input) return '';
    if (typeof input === 'string') return input;
    if (input.body && typeof input.body === 'string') return input.body;
    try {
        return JSON.stringify(input, null, 2);
    } catch {
        return '';
    }
}
