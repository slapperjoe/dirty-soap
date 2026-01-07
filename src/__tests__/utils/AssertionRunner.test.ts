import { AssertionRunner } from '../../utils/AssertionRunner';
import { SoapUIAssertion } from '@shared/models';

describe('AssertionRunner', () => {
    describe('Simple Contains', () => {
        it('should pass when response contains token', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a1',
                name: 'Contains Check',
                type: 'Simple Contains',
                configuration: { token: 'success' }
            }];

            const results = AssertionRunner.run('<response>success</response>', 100, assertions);

            expect(results).toHaveLength(1);
            expect(results[0].status).toBe('PASS');
            expect(results[0].id).toBe('a1');
        });

        it('should fail when response does not contain token', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a2',
                name: 'Contains Check',
                type: 'Simple Contains',
                configuration: { token: 'missing' }
            }];

            const results = AssertionRunner.run('<response>success</response>', 100, assertions);

            expect(results).toHaveLength(1);
            expect(results[0].status).toBe('FAIL');
            expect(results[0].message).toContain('missing');
        });

        it('should handle case-insensitive matching', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a3',
                name: 'Case Insensitive',
                type: 'Simple Contains',
                configuration: { token: 'SUCCESS', ignoreCase: true }
            }];

            const results = AssertionRunner.run('<response>success</response>', 100, assertions);

            expect(results[0].status).toBe('PASS');
        });
    });

    describe('Simple Not Contains', () => {
        it('should pass when response does not contain token', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a4',
                name: 'Not Contains Check',
                type: 'Simple Not Contains',
                configuration: { token: 'error' }
            }];

            const results = AssertionRunner.run('<response>success</response>', 100, assertions);

            expect(results[0].status).toBe('PASS');
        });

        it('should fail when response contains token', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a5',
                name: 'Not Contains Check',
                type: 'Simple Not Contains',
                configuration: { token: 'success' }
            }];

            const results = AssertionRunner.run('<response>success</response>', 100, assertions);

            expect(results[0].status).toBe('FAIL');
        });
    });

    describe('Response SLA', () => {
        it('should pass when response time is within SLA', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a6',
                name: 'SLA Check',
                type: 'Response SLA',
                configuration: { sla: '500' }
            }];

            const results = AssertionRunner.run('<response/>', 200, assertions);

            expect(results[0].status).toBe('PASS');
            expect(results[0].message).toContain('200 ms');
        });

        it('should fail when response time exceeds SLA', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a7',
                name: 'SLA Check',
                type: 'Response SLA',
                configuration: { sla: '100' }
            }];

            const results = AssertionRunner.run('<response/>', 200, assertions);

            expect(results[0].status).toBe('FAIL');
            expect(results[0].message).toContain('200 ms');
        });
    });

    describe('XPath Match', () => {
        const soapResponse = `
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                <soap:Body>
                    <GetUserResponse>
                        <Name>John Doe</Name>
                        <Age>30</Age>
                    </GetUserResponse>
                </soap:Body>
            </soap:Envelope>
        `;

        it('should pass when XPath matches expected value', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a8',
                name: 'XPath Check',
                type: 'XPath Match',
                configuration: {
                    xpath: '//Name/text()',
                    expectedContent: 'John Doe'
                }
            }];

            const results = AssertionRunner.run(soapResponse, 100, assertions);

            expect(results[0].status).toBe('PASS');
        });

        it('should fail when XPath value does not match', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a9',
                name: 'XPath Check',
                type: 'XPath Match',
                configuration: {
                    xpath: '//Name/text()',
                    expectedContent: 'Jane Doe'
                }
            }];

            const results = AssertionRunner.run(soapResponse, 100, assertions);

            expect(results[0].status).toBe('FAIL');
            expect(results[0].message).toContain('John Doe');
            expect(results[0].message).toContain('Jane Doe');
        });

        it('should fail when no XPath configured', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a10',
                name: 'XPath Check',
                type: 'XPath Match',
                configuration: {}
            }];

            const results = AssertionRunner.run(soapResponse, 100, assertions);

            expect(results[0].status).toBe('FAIL');
            expect(results[0].message).toContain('No XPath');
        });
    });

    describe('Edge cases', () => {
        it('should return empty array for empty assertions', () => {
            const results = AssertionRunner.run('<response/>', 100, []);
            expect(results).toHaveLength(0);
        });

        it('should handle null response', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a11',
                name: 'Contains Check',
                type: 'Simple Contains',
                configuration: { token: 'test' }
            }];

            const results = AssertionRunner.run(null, 100, assertions);

            expect(results[0].status).toBe('FAIL');
        });

        it('should handle undefined response', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a12',
                name: 'Contains Check',
                type: 'Simple Contains',
                configuration: { token: 'test' }
            }];

            const results = AssertionRunner.run(undefined, 100, assertions);

            expect(results[0].status).toBe('FAIL');
        });

        it('should handle unknown assertion type', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'a13',
                name: 'Unknown',
                type: 'Unknown Type' as any,
                configuration: {}
            }];

            const results = AssertionRunner.run('<response/>', 100, assertions);

            expect(results[0].status).toBe('FAIL');
            expect(results[0].message).toContain('Unknown assertion type');
        });
    });

    describe('Multiple assertions', () => {
        it('should run all assertions and return all results', () => {
            const assertions: SoapUIAssertion[] = [
                {
                    id: 'a14',
                    name: 'Contains',
                    type: 'Simple Contains',
                    configuration: { token: 'success' }
                },
                {
                    id: 'a15',
                    name: 'SLA',
                    type: 'Response SLA',
                    configuration: { sla: '500' }
                },
                {
                    id: 'a16',
                    name: 'Not Contains',
                    type: 'Simple Not Contains',
                    configuration: { token: 'error' }
                }
            ];

            const results = AssertionRunner.run('<response>success</response>', 100, assertions);

            expect(results).toHaveLength(3);
            expect(results.every(r => r.status === 'PASS')).toBe(true);
        });
    });

    describe('SOAP Fault', () => {
        const faultResponse = `
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                <soap:Body>
                    <soap:Fault>
                        <faultcode>soap:Client</faultcode>
                        <faultstring>Invalid request</faultstring>
                    </soap:Fault>
                </soap:Body>
            </soap:Envelope>
        `;

        const successResponse = `
            <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                <soap:Body>
                    <GetUserResponse>
                        <Name>John</Name>
                    </GetUserResponse>
                </soap:Body>
            </soap:Envelope>
        `;

        it('should pass when expecting fault and fault exists', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sf1',
                name: 'Fault Check',
                type: 'SOAP Fault',
                configuration: { expectFault: true }
            }];

            const results = AssertionRunner.run(faultResponse, 100, assertions);
            expect(results[0].status).toBe('PASS');
        });

        it('should fail when expecting fault but no fault', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sf2',
                name: 'Fault Check',
                type: 'SOAP Fault',
                configuration: { expectFault: true }
            }];

            const results = AssertionRunner.run(successResponse, 100, assertions);
            expect(results[0].status).toBe('FAIL');
        });

        it('should pass when not expecting fault and no fault', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sf3',
                name: 'Success Check',
                type: 'SOAP Fault',
                configuration: { expectFault: false }
            }];

            const results = AssertionRunner.run(successResponse, 100, assertions);
            expect(results[0].status).toBe('PASS');
        });

        it('should fail when not expecting fault but fault exists', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sf4',
                name: 'Success Check',
                type: 'SOAP Fault',
                configuration: { expectFault: false }
            }];

            const results = AssertionRunner.run(faultResponse, 100, assertions);
            expect(results[0].status).toBe('FAIL');
        });

        it('should check fault code when specified', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sf5',
                name: 'Fault Code Check',
                type: 'SOAP Fault',
                configuration: { expectFault: true, faultCode: 'Client' }
            }];

            const results = AssertionRunner.run(faultResponse, 100, assertions);
            expect(results[0].status).toBe('PASS');
        });
    });

    describe('HTTP Status', () => {
        it('should pass when status matches', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'hs1',
                name: 'Status Check',
                type: 'HTTP Status',
                configuration: { expectedStatus: '200' }
            }];

            const results = AssertionRunner.run('<response/>', 100, assertions, 200);
            expect(results[0].status).toBe('PASS');
        });

        it('should fail when status does not match', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'hs2',
                name: 'Status Check',
                type: 'HTTP Status',
                configuration: { expectedStatus: '200' }
            }];

            const results = AssertionRunner.run('<response/>', 100, assertions, 500);
            expect(results[0].status).toBe('FAIL');
        });

        it('should allow multiple status codes', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'hs3',
                name: 'Status Check',
                type: 'HTTP Status',
                configuration: { expectedStatus: '200,201,202' }
            }];

            const results = AssertionRunner.run('<response/>', 100, assertions, 201);
            expect(results[0].status).toBe('PASS');
        });

        it('should fail when status code not available', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'hs4',
                name: 'Status Check',
                type: 'HTTP Status',
                configuration: { expectedStatus: '200' }
            }];

            const results = AssertionRunner.run('<response/>', 100, assertions);
            expect(results[0].status).toBe('FAIL');
            expect(results[0].message).toContain('not available');
        });
    });

    describe('Script', () => {
        it('should pass when script returns true', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sc1',
                name: 'Script True',
                type: 'Script',
                configuration: { script: 'return true;' }
            }];

            const results = AssertionRunner.run('<response>OK</response>', 100, assertions, 200);
            expect(results[0].status).toBe('PASS');
        });

        it('should fail when script returns false', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sc2',
                name: 'Script False',
                type: 'Script',
                configuration: { script: 'return false;' }
            }];

            const results = AssertionRunner.run('<response>OK</response>', 100, assertions, 200);
            expect(results[0].status).toBe('FAIL');
        });

        it('should have access to response variable', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sc3',
                name: 'Script Response',
                type: 'Script',
                configuration: { script: 'return response.includes("Success");' }
            }];

            const results = AssertionRunner.run('<response>Success!</response>', 100, assertions, 200);
            expect(results[0].status).toBe('PASS');
        });

        it('should have access to statusCode variable', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sc4',
                name: 'Script Status',
                type: 'Script',
                configuration: { script: 'return statusCode === 200;' }
            }];

            const results = AssertionRunner.run('<response/>', 100, assertions, 200);
            expect(results[0].status).toBe('PASS');
        });

        it('should fail on script error', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sc5',
                name: 'Script Error',
                type: 'Script',
                configuration: { script: 'throw new Error("Test error");' }
            }];

            const results = AssertionRunner.run('<response/>', 100, assertions, 200);
            expect(results[0].status).toBe('FAIL');
            expect(results[0].message).toContain('Script error');
        });

        it('should fail when no script configured', () => {
            const assertions: SoapUIAssertion[] = [{
                id: 'sc6',
                name: 'No Script',
                type: 'Script',
                configuration: {}
            }];

            const results = AssertionRunner.run('<response/>', 100, assertions, 200);
            expect(results[0].status).toBe('FAIL');
            expect(results[0].message).toContain('No script configured');
        });
    });
});
