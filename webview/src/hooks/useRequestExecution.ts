/**
 * useRequestExecution.ts
 * 
 * Hook for managing SOAP request execution, updates, and related operations.
 * Extracted from App.tsx to reduce complexity.
 */

import { useRef, useCallback } from 'react';
import { bridge } from '../utils/bridge';
import { CustomXPathEvaluator } from '../utils/xpathEvaluator';
import { FrontendCommand } from '../messages';
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
    setWorkspaceDirty: React.Dispatch<React.SetStateAction<boolean>>;

    // Other
    testExecution: Record<string, Record<string, { response?: any }>>;
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
    setWorkspaceDirty,
    testExecution
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

                            step.config.request.extractors.forEach(ext => {
                                // Check if we already have a value for this variable
                                if (contextVariables[ext.variable]) return;

                                if (stepExec?.response) {
                                    // Step has been run, try to extract value
                                    const rawResp = stepExec.response.rawResponse || (typeof stepExec.response.result === 'string'
                                        ? stepExec.response.result
                                        : JSON.stringify(stepExec.response.result));

                                    if (rawResp && ext.source === 'body') {
                                        try {
                                            const val = CustomXPathEvaluator.evaluate(rawResp, ext.path);
                                            if (val) {
                                                contextVariables[ext.variable] = val;
                                                logToOutput(`[Context] Extracted '${ext.variable}' = '${val}' from step '${step.name}'`);
                                            } else if (ext.defaultValue) {
                                                // Extraction returned null, use default
                                                contextVariables[ext.variable] = ext.defaultValue;
                                                logToOutput(`[Context] Using default value for '${ext.variable}' = '${ext.defaultValue}' (extraction returned null)`);
                                            } else {
                                                logToOutput(`[Context] Warning: Extractor for '${ext.variable}' in step '${step.name}' returned null.`);
                                            }
                                        } catch (e) {
                                            console.warn('[App] Extractor failed for variable ' + ext.variable, e);
                                            if (ext.defaultValue) {
                                                contextVariables[ext.variable] = ext.defaultValue;
                                                logToOutput(`[Context] Using default value for '${ext.variable}' = '${ext.defaultValue}' (extraction error)`);
                                            } else {
                                                logToOutput(`[Context] Error evaluating extractor for '${ext.variable}': ${e}`);
                                            }
                                        }
                                    }
                                } else if (ext.defaultValue) {
                                    // Step hasn't been run yet, use default value
                                    contextVariables[ext.variable] = ext.defaultValue;
                                    logToOutput(`[Context] Using default value for '${ext.variable}' = '${ext.defaultValue}' (step '${step.name}' not run)`);
                                }
                            });
                        }
                    });
                }
            }

            console.log('[App] Context Variables:', contextVariables);
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
                requestName: selectedRequest?.name || undefined
            });
        } else {
            console.error('[App] executeRequest aborted: No selectedOperation or selectedRequest');
            setLoading(false);
        }
    }, [selectedOperation, selectedRequest, selectedInterface, selectedTestCase, selectedStep, wsdlUrl, testExecution, setLoading, setResponse]);

    const cancelRequest = useCallback(() => {
        bridge.sendMessage({ command: FrontendCommand.CancelRequest });
        setLoading(false);
    }, [setLoading]);

    const handleRequestUpdate = useCallback((updated: SoapUIRequest) => {
        console.log('[handleRequestUpdate] Called with:', {
            requestName: updated.name,
            requestId: updated.id,
            assertionCount: updated.assertions?.length || 0,
            selectedProjectName,
            selectedTestCaseName: selectedTestCase?.name,
            selectedTestCaseId: selectedTestCase?.id
        });

        const dirtyUpdated = { ...updated, dirty: true };
        setSelectedRequest(dirtyUpdated);
        setWorkspaceDirty(true);

        // Update in Project/Explorer
        // IMPORTANT: When updating test case steps, search ALL projects for the test case
        // because selectedProjectName may be stale/wrong
        setProjects(prev => prev.map(p => {
            // 1. Is it a Test Case modification? Search ALL projects for the test case
            if (selectedTestCase) {
                let caseUpdated = false;
                const updatedSuites = p.testSuites?.map(s => {
                    const tcIndex = s.testCases?.findIndex(tc => tc.id === selectedTestCase.id) ?? -1;
                    if (tcIndex === -1) return s;

                    console.log('[handleRequestUpdate] Found test case in project:', p.name, 'suite:', s.name);

                    const updatedCases = [...(s.testCases || [])];

                    // Find step containing this request - Prefer ID match, fallback to Name
                    const stepIndex = updatedCases[tcIndex].steps.findIndex(step =>
                        (updated.id && step.config.request?.id === updated.id) ||
                        step.config.request?.name === updated.name ||
                        (selectedRequest && step.config.request?.name === selectedRequest.name)
                    );

                    console.log('[handleRequestUpdate] Step Search:', stepIndex, 'for request:', updated.name);

                    if (stepIndex !== -1) {
                        caseUpdated = true;
                        console.log('[handleRequestUpdate] Updating step with assertions:', updated.assertions?.length || 0);
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
                    console.log('[handleRequestUpdate] Updated project:', p.name);
                    return { ...p, testSuites: updatedSuites, dirty: true };
                }
                // Test case not in this project, continue to next
                return p;
            }

            // 2. Normal Request Modification - requires selectedProjectName match
            if (!selectedProjectName || p.name !== selectedProjectName) return p;

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
    }, [selectedProjectName, selectedTestCase, selectedInterface, selectedOperation, selectedRequest, setProjects, setSelectedRequest, setWorkspaceDirty]);

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
