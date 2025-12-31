/**
 * useRequestExecution.ts
 * 
 * Hook for managing SOAP request execution, updates, and related operations.
 * Extracted from App.tsx to reduce complexity.
 */

import { useRef, useCallback } from 'react';
import { bridge } from '../utils/bridge';
import { CustomXPathEvaluator } from '../utils/xpathEvaluator';
import { getInitialXml } from '../utils/xmlUtils';
import {
    SoapUIProject,
    SoapUIInterface,
    SoapUIOperation,
    SoapUIRequest,
    SoapTestCase,
    SoapTestStep
} from '../models';

interface UseRequestExecutionParams {
    // Selection state
    selectedOperation: SoapUIOperation | null;
    selectedRequest: SoapUIRequest | null;
    selectedInterface: SoapUIInterface | null;
    selectedTestCase: SoapTestCase | null;
    selectedStep: SoapTestStep | null;
    selectedProjectName: string | null;
    wsdlUrl: string;

    // State setters
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;
    setSelectedRequest: React.Dispatch<React.SetStateAction<SoapUIRequest | null>>;
    setProjects: React.Dispatch<React.SetStateAction<SoapUIProject[]>>;
    setExploredInterfaces: React.Dispatch<React.SetStateAction<SoapUIInterface[]>>;
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;

    // Other
    testExecution: Record<string, Record<string, { response?: any }>>;
    saveProject: (project: SoapUIProject) => void;
}

interface UseRequestExecutionReturn {
    executeRequest: (xml: string) => void;
    cancelRequest: () => void;
    handleRequestUpdate: (updated: SoapUIRequest) => void;
    handleResetRequest: () => void;
    startTimeRef: React.MutableRefObject<number>;
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
    setExploredInterfaces,
    setWorkspaceDirty,
    testExecution,
    saveProject
}: UseRequestExecutionParams): UseRequestExecutionReturn {

    const startTimeRef = useRef<number>(0);

    const executeRequest = useCallback((xml: string) => {
        console.log('[App] executeRequest called');
        console.log('[App] Context - Operation:', selectedOperation?.name, 'Request:', selectedRequest?.name);

        setLoading(true);
        setResponse(null);
        startTimeRef.current = Date.now();

        // Allow execution if we have a request context, even if not fully in an Operation content (e.g. Test Step)
        if (selectedOperation || selectedRequest) {
            const url = selectedRequest?.endpoint || selectedInterface?.definition || wsdlUrl;
            const opName = selectedOperation?.name || selectedRequest?.name || 'Unknown Operation';

            console.log('[App] Sending executeRequest message. URL:', url, 'Op:', opName);

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
                                                console.warn('[App] Extractor failed for variable ' + ext.variable, e);
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

            console.log('[App] Context Variables:', contextVariables);
            if (Object.keys(contextVariables).length > 0) {
                logToOutput(`[Context] Sending ${Object.keys(contextVariables).length} context variables to backend.`);
            }

            bridge.sendMessage({
                command: 'executeRequest',
                url,
                operation: opName,
                xml,
                contentType: selectedRequest?.contentType,
                assertions: selectedRequest?.assertions,
                headers: selectedRequest?.headers,
                contextVariables
            });
        } else {
            console.error('[App] executeRequest aborted: No selectedOperation or selectedRequest');
            setLoading(false);
        }
    }, [selectedOperation, selectedRequest, selectedInterface, selectedTestCase, selectedStep, wsdlUrl, testExecution, setLoading, setResponse]);

    const cancelRequest = useCallback(() => {
        bridge.sendMessage({ command: 'cancelRequest' });
        setLoading(false);
    }, [setLoading]);

    const handleRequestUpdate = useCallback((updated: SoapUIRequest) => {
        const dirtyUpdated = { ...updated, dirty: true };
        setSelectedRequest(dirtyUpdated);
        setWorkspaceDirty(true);

        // Update in Project/Explorer
        if (selectedProjectName) {
            setProjects(prev => prev.map(p => {
                if (p.name !== selectedProjectName) return p;

                // 1. Is it a Test Case modification?
                if (selectedTestCase) {
                    console.log('[handleRequestUpdate] Updating within Test Case:', selectedTestCase.name);
                    let caseUpdated = false;
                    const updatedSuites = p.testSuites?.map(s => {
                        const tcIndex = s.testCases?.findIndex(tc => tc.id === selectedTestCase.id) ?? -1;
                        if (tcIndex === -1) return s;

                        const updatedCases = [...(s.testCases || [])];
                        // Find step containing this request - Prefer ID match, fallback to Name
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
                                        // Ensure ID exists on the saved request (Heal legacy data)
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
                    })
                };
                // No longer auto-saving - user must click Save button
                return updatedProject;
            }));
        } else {
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
    }, [selectedProjectName, selectedTestCase, selectedInterface, selectedOperation, selectedRequest, setProjects, setExploredInterfaces, setSelectedRequest, setWorkspaceDirty, saveProject]);

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
        startTimeRef
    };
}
