import { SoapUIAssertion } from '@shared/models';
import { BackendXPathEvaluator } from "./BackendXPathEvaluator";

export interface AssertionResult {
    id?: string;
    name: string;
    status: 'PASS' | 'FAIL';
    message?: string;
}

export class AssertionRunner {

    public static run(responseVal: string | null | undefined, timeTakenMs: number, assertions: SoapUIAssertion[], statusCode?: number): AssertionResult[] {
        if (!assertions || assertions.length === 0) return [];

        const safeResponse = responseVal || '';
        return assertions.map(a => this.evaluate(safeResponse, timeTakenMs, a, statusCode));
    }

    private static evaluate(response: string, timeTaken: number, assertion: SoapUIAssertion, statusCode?: number): AssertionResult {
        const config = assertion.configuration || {};

        switch (assertion.type) {
            case 'Simple Contains': {
                const token = config.token || '';
                const ignoreCase = config.ignoreCase === true;

                let haystack = response;
                let needle = token;

                if (ignoreCase) {
                    haystack = haystack.toLowerCase();
                    needle = needle.toLowerCase();
                }

                if (haystack.includes(needle)) {
                    return { id: assertion.id, name: assertion.name || 'Contains', status: 'PASS' };
                } else {
                    return { id: assertion.id, name: assertion.name || 'Contains', status: 'FAIL', message: `Token [${token}] not found in response.` };
                }
            }

            case 'Simple Not Contains': {
                const token = config.token || '';
                const ignoreCase = config.ignoreCase === true;

                let haystack = response;
                let needle = token;

                if (ignoreCase) {
                    haystack = haystack.toLowerCase();
                    needle = needle.toLowerCase();
                }

                if (!haystack.includes(needle)) {
                    return { id: assertion.id, name: assertion.name || 'Not Contains', status: 'PASS' };
                } else {
                    return { id: assertion.id, name: assertion.name || 'Not Contains', status: 'FAIL', message: `Token [${token}] found in response.` };
                }
            }

            case 'Response SLA': {
                const limit = parseInt(config.sla || '0', 10);
                if (timeTaken <= limit) {
                    return { id: assertion.id, name: assertion.name || 'Response SLA', status: 'PASS', message: `${timeTaken} ms < ${limit} ms` };
                } else {
                    return { id: assertion.id, name: assertion.name || 'Response SLA', status: 'FAIL', message: `Response time ${timeTaken} ms > ${limit} ms` };
                }
            }

            case 'XPath Match': {
                const xpath = config.xpath;
                const expected = config.expectedContent;

                if (!xpath) {
                    return { id: assertion.id, name: assertion.name || 'XPath Match', status: 'FAIL', message: 'No XPath expression configured.' };
                }

                try {
                    const actual = BackendXPathEvaluator.evaluate(response, xpath);
                    if (actual === expected) {
                        return { id: assertion.id, name: assertion.name || 'XPath Match', status: 'PASS', message: `Value matched: ${actual}` };
                    } else {
                        return {
                            id: assertion.id,
                            name: assertion.name || 'XPath Match',
                            status: 'FAIL',
                            message: `Expected [${expected}] but got [${actual}]`
                        };
                    }
                } catch (error) {
                    return { id: assertion.id, name: assertion.name || 'XPath Match', status: 'FAIL', message: `XPath evaluation failed: ${error}` };
                }
            }

            case 'SOAP Fault': {
                const expectFault = config.expectFault === true;
                const faultCode = config.faultCode;

                // Check for SOAP Fault in response
                const hasFault = /<(soap|SOAP-ENV):Fault/i.test(response) || /<Fault[^>]*>/i.test(response);

                if (expectFault) {
                    if (hasFault) {
                        // If faultCode specified, check it matches
                        if (faultCode) {
                            const faultCodeMatch = response.match(/<faultcode[^>]*>([^<]+)<\/faultcode>/i);
                            const actualCode = faultCodeMatch ? faultCodeMatch[1] : '';
                            if (actualCode.includes(faultCode)) {
                                return { id: assertion.id, name: assertion.name || 'SOAP Fault', status: 'PASS', message: `Fault detected with code: ${actualCode}` };
                            } else {
                                return { id: assertion.id, name: assertion.name || 'SOAP Fault', status: 'FAIL', message: `Expected fault code [${faultCode}] but got [${actualCode}]` };
                            }
                        }
                        return { id: assertion.id, name: assertion.name || 'SOAP Fault', status: 'PASS', message: 'SOAP Fault detected as expected' };
                    } else {
                        return { id: assertion.id, name: assertion.name || 'SOAP Fault', status: 'FAIL', message: 'Expected SOAP Fault but response was successful' };
                    }
                } else {
                    if (hasFault) {
                        return { id: assertion.id, name: assertion.name || 'SOAP Fault', status: 'FAIL', message: 'Unexpected SOAP Fault in response' };
                    } else {
                        return { id: assertion.id, name: assertion.name || 'SOAP Fault', status: 'PASS', message: 'No SOAP Fault (success)' };
                    }
                }
            }

            case 'HTTP Status': {
                const expectedStr = config.expectedStatus || '200';
                const allowedCodes = expectedStr.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));

                if (statusCode === undefined) {
                    return { id: assertion.id, name: assertion.name || 'HTTP Status', status: 'FAIL', message: 'HTTP status code not available' };
                }

                if (allowedCodes.includes(statusCode)) {
                    return { id: assertion.id, name: assertion.name || 'HTTP Status', status: 'PASS', message: `Status ${statusCode} is allowed` };
                } else {
                    return { id: assertion.id, name: assertion.name || 'HTTP Status', status: 'FAIL', message: `Status ${statusCode} not in allowed list [${expectedStr}]` };
                }
            }

            case 'Script': {
                const script = config.script;
                if (!script) {
                    return { id: assertion.id, name: assertion.name || 'Script', status: 'FAIL', message: 'No script configured' };
                }

                try {
                    const vm = require('vm');

                    // Create a sandboxed context with useful variables
                    const context = {
                        response,
                        statusCode,
                        // Allow accessing status code in multiple ways
                        status: statusCode,
                        // Provide basic assertion helpers
                        pass: () => ({ status: 'PASS' as const }),
                        fail: (msg?: string) => ({ status: 'FAIL' as const, message: msg }),
                        // Provide console for debugging (won't show but won't crash)
                        console: { log: () => { }, warn: () => { }, error: () => { } },
                        // Common utilities
                        JSON,
                        parseInt,
                        parseFloat,
                        String,
                        Number,
                        Boolean,
                        Array,
                        Object,
                        RegExp,
                    };

                    vm.createContext(context);

                    // Wrap script in an IIFE that returns result
                    const wrappedScript = `
                        (function() {
                            ${script}
                        })()
                    `;

                    const result = vm.runInContext(wrappedScript, context, { timeout: 5000 });

                    // Handle different return types
                    if (result === true) {
                        return { id: assertion.id, name: assertion.name || 'Script', status: 'PASS', message: 'Script returned true' };
                    } else if (result === false) {
                        return { id: assertion.id, name: assertion.name || 'Script', status: 'FAIL', message: 'Script returned false' };
                    } else if (result && typeof result === 'object' && result.status) {
                        return { id: assertion.id, name: assertion.name || 'Script', status: result.status, message: result.message };
                    } else if (typeof result === 'string') {
                        // If string returned, treat as truthy/pass with message
                        return { id: assertion.id, name: assertion.name || 'Script', status: 'PASS', message: result };
                    } else {
                        return { id: assertion.id, name: assertion.name || 'Script', status: result ? 'PASS' : 'FAIL' };
                    }
                } catch (error: any) {
                    return { id: assertion.id, name: assertion.name || 'Script', status: 'FAIL', message: `Script error: ${error.message}` };
                }
            }

            default:
                return { id: assertion.id, name: assertion.name || assertion.type, status: 'FAIL', message: 'Unknown assertion type' };
        }
    }
}
