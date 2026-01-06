import { SoapUIAssertion } from '@shared/models';
import { BackendXPathEvaluator } from "./BackendXPathEvaluator";

export interface AssertionResult {
    id?: string;
    name: string;
    status: 'PASS' | 'FAIL';
    message?: string;
}

export class AssertionRunner {

    public static run(responseVal: string | null | undefined, timeTakenMs: number, assertions: SoapUIAssertion[]): AssertionResult[] {
        if (!assertions || assertions.length === 0) return [];

        const safeResponse = responseVal || '';
        return assertions.map(a => this.evaluate(safeResponse, timeTakenMs, a));
    }

    private static evaluate(response: string, timeTaken: number, assertion: SoapUIAssertion): AssertionResult {
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

            default:
                return { id: assertion.id, name: assertion.name || assertion.type, status: 'FAIL', message: 'Unknown assertion type' };
        }
    }
}
