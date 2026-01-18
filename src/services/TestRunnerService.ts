import * as vm from 'vm';
import { TestCase, TestStep } from '../../shared/src/models';
import { SoapClient } from "../soapClient";
import { AssertionRunner } from "../utils/AssertionRunner";
import { BackendXPathEvaluator } from "../utils/BackendXPathEvaluator";
import { WildcardProcessor } from "../utils/WildcardProcessor";

export class TestRunnerService {
    private soapClient: SoapClient;
    private outputChannel: any;
    private updateCallback?: (data: any) => void;

    constructor(soapClient: SoapClient, outputChannel: any) {
        this.soapClient = soapClient;
        this.outputChannel = outputChannel;
    }

    public setCallback(cb: (data: any) => void) {
        this.updateCallback = cb;
    }

    private log(message: string) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[TestRunner] ${message}`);
        }
    }

    private notifyUi(type: string, data: any) {
        if (this.updateCallback) {
            this.updateCallback({ type, ...data });
        }
    }

    public async runTestCase(testCase: TestCase, fallbackEndpoint?: string): Promise<void> {
        this.log(`Starting Test Case: ${testCase.name}`);
        this.notifyUi('testCaseStart', { id: testCase.id });

        const context: Record<string, any> = {};
        const MAX_STEPS = 200;
        let stepCount = 0;
        let currentStepIndex = 0;

        while (currentStepIndex < testCase.steps.length) {
            if (stepCount++ > MAX_STEPS) {
                const error = `Max steps (${MAX_STEPS}) exceeded. Possible infinite loop.`;
                this.log(error);
                this.notifyUi('testCaseFail', { id: testCase.id, error });
                break;
            }

            const step = testCase.steps[currentStepIndex];
            this.log(`Running Step [${currentStepIndex + 1}/${testCase.steps.length}]: ${step.name} (${step.type})`);
            this.notifyUi('stepStart', { caseId: testCase.id, stepId: step.id });

            // Next step index logic (default is +1)
            let nextStepIndex = currentStepIndex + 1;

            try {
                if (step.type === 'delay') {
                    const ms = step.config.delayMs || 0;
                    this.log(`Delaying for ${ms}ms...`);
                    await new Promise(resolve => setTimeout(resolve, ms));
                    this.notifyUi('stepPass', { caseId: testCase.id, stepId: step.id });
                }
                else if (step.type === 'request') {
                    await this.runRequestStep(step, context, testCase.id, fallbackEndpoint);
                }
                else if (step.type === 'script') {
                    const script = step.config.scriptContent;
                    if (!script) {
                        this.log('Empty script, skipping.');
                        this.notifyUi('stepPass', { caseId: testCase.id, stepId: step.id });
                    } else {
                        // SANDBOX API
                        const stepLog = (msg: string) => this.log(`[Script] ${msg}`);
                        const fail = (reason: string) => {
                            throw new Error(reason);
                        };
                        const delay = async (ms: number) => {
                            stepLog(`Delaying ${ms}ms`);
                            await new Promise(r => setTimeout(r, ms));
                        };
                        const goto = (stepName: string) => {
                            const foundIndex = testCase.steps.findIndex(s => s.name === stepName);
                            if (foundIndex !== -1) {
                                stepLog(`Goto -> '${stepName}'`);
                                nextStepIndex = foundIndex;
                            } else {
                                stepLog(`Goto failed: Step '${stepName}' not found`);
                            }
                        };

                        const sandbox = {
                            log: stepLog,
                            context: context,
                            fail: fail,
                            delay: delay,
                            goto: goto,
                            // Safe globals
                            setTimeout,
                            console: { log: stepLog }
                        };

                        vm.createContext(sandbox);

                        // Wrap script in async IIFE to support await
                        const wrappedScript = `(async () => {
                            ${script}
                        })()`;

                        const result = vm.runInContext(wrappedScript, sandbox);

                        if (result && typeof result.then === 'function') {
                            await result;
                        }
                        this.notifyUi('stepPass', { caseId: testCase.id, stepId: step.id });
                    }
                }
                else if (step.type === 'transfer') {
                    this.log('Property Transfer not yet implemented');
                    this.notifyUi('stepPass', { caseId: testCase.id, stepId: step.id });
                }
                else {
                    this.log(`Unknown step type: ${step.type}`);
                }

            } catch (error: any) {
                this.log(`Step Failed: ${error.message}`);
                if (step.type !== 'request') {
                    this.notifyUi('stepFail', { caseId: testCase.id, stepId: step.id, error: error.message });
                }
                break; // Stop test case on failure
            }

            // Move to next step
            currentStepIndex = nextStepIndex;
        }

        this.log(`Test Case Finished: ${testCase.name}`);
        this.notifyUi('testCaseEnd', { id: testCase.id });
    }

    private async runRequestStep(step: TestStep, context: Record<string, any>, caseId: string, fallbackEndpoint?: string) {
        if (!step.config.request) {
            throw new Error("No request configuration found in step");
        }

        const req = step.config.request;
        const envVars = {};
        const globals = {};

        const resolvedXml = WildcardProcessor.process(req.request, envVars, globals, undefined, context);
        const resolvedUrl = WildcardProcessor.process(req.endpoint || fallbackEndpoint || '', envVars, globals, undefined, context);

        this.log(`Resolving Variables for Step '${step.name}'...`);
        if (resolvedXml !== req.request) this.log(`- Payload substituted`);
        if (resolvedUrl !== req.endpoint) this.log(`- URL substituted: ${resolvedUrl}`);

        const endpoint = req.endpoint || fallbackEndpoint || '';

        if (!endpoint) {
            this.log('WARNING: Endpoint is empty and no fallback provided. Request will likely fail.');
        }

        const headers = { ...(req.headers || {}) };
        if (req.contentType) {
            headers['Content-Type'] = req.contentType;
        }

        const requestType = req.requestType || 'soap';
        let result: any;

        if (requestType !== 'soap') {
            result = await this.soapClient.executeHttpRequest({
                ...req,
                endpoint: resolvedUrl,
                request: resolvedXml,
                headers,
                requestType,
                method: req.method,
                bodyType: req.bodyType,
                contentType: req.contentType,
                restConfig: req.restConfig,
                graphqlConfig: req.graphqlConfig
            } as any);
        } else {
            result = await this.soapClient.executeRequest(
                resolvedUrl,
                req.name,
                resolvedXml,
                headers
            );
        }

        let assertionResults: any[] = [];
        if (req.assertions && req.assertions.length > 0) {
            this.log(`Running ${req.assertions.length} assertions...`);
            req.assertions.forEach(a => this.log(`- Assertion: ${a.name} (${a.type})`));
            assertionResults = AssertionRunner.run(result.body, result.timeTaken, req.assertions);
            assertionResults.forEach(r => {
                this.log(`  [${r.status}] ${r.name}: ${r.message || ''}`);
            });
        }

        const hasFailures = assertionResults.some(r => r.status === 'FAIL');

        if (!result.success || hasFailures) {
            const errorMsg = !result.success ? result.error : `Assertions Failed: ${assertionResults.filter(r => r.status === 'FAIL').map(r => `${r.name}: ${r.message}`).join(', ')}`;
            this.notifyUi('stepFail', {
                caseId: caseId,
                stepId: step.id,
                error: errorMsg,
                assertionResults: assertionResults,
                response: result
            });
            throw new Error(errorMsg);
        } else {
            this.notifyUi('stepPass', {
                caseId: caseId,
                stepId: step.id,
                assertionResults: assertionResults,
                response: result
            });
            this.log(`Step Passed`);

            if (req.extractors && req.extractors.length > 0) {
                this.log(`Running ${req.extractors.length} extractors...`);
                req.extractors.forEach(ext => {
                    if (ext.source === 'body') {
                        try {
                            const rawBody = result.rawResponse || '';
                            const val = BackendXPathEvaluator.evaluate(rawBody, ext.path);
                            if (val) {
                                context[ext.variable] = val;
                                this.log(`- Extracted '${ext.variable}' = '${val}'`);
                            } else {
                                this.log(`- WARNING: Extractor '${ext.variable}' returned null`);
                            }
                        } catch (e) {
                            this.log(`- Error extracting '${ext.variable}': ${e}`);
                        }
                    }
                });
            }
        }
    }
}
