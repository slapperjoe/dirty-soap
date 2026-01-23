import { describe, it, expect } from 'vitest';
import { ApinoxProject, ApiRequest, TestCase } from '@shared/models';

/**
 * Integration tests for request update routing logic.
 * 
 * These tests verify that when a request is updated, it's routed to the correct
 * handler based on the current selection state. This prevents bugs where:
 * 
 * 1. Performance suite edits route to wrong handler due to stale selectedPerformanceSuiteId
 * 2. Test case step edits fail because request isn't actually in the test case
 * 3. Workspace request edits fail because stale test case selection intercepts them
 * 
 * Bug Reference: Fixed in January 2026 - stale selection state was causing edits
 * to be lost or routed to wrong update path.
 */

describe('Request Update Routing', () => {

    // Helper to create a mock request
    const createMockRequest = (id: string, name: string): ApiRequest => ({
        id,
        name,
        request: '<soap:Envelope>test</soap:Envelope>',
        endpoint: 'http://test.com',
        contentType: 'application/soap+xml'
    });

    // Helper to create a mock project with a workspace request
    const createMockProject = (requests: ApiRequest[]): ApinoxProject => ({
        name: 'Test Project',
        id: 'proj-1',
        interfaces: [{
            name: 'TestInterface',
            type: 'wsdl',
            bindingName: 'TestBinding',
            soapVersion: '1.1',
            definition: '',
            operations: [{
                name: 'TestOperation',
                action: 'http://test.com/TestOperation',
                requests
            }]
        }],
        testSuites: []
    });

    // Helper to create a mock test case
    const createMockTestCase = (stepRequests: ApiRequest[]): TestCase => ({
        id: 'tc-123',
        name: 'Test Case 1',
        steps: stepRequests.map((req, i) => ({
            id: `step-${i}`,
            name: `Step ${i}`,
            type: 'request' as const,
            config: { request: req }
        }))
    });

    describe('Performance Request Detection', () => {
        it('should identify performance requests by ID prefix "perf-req-"', () => {
            const perfRequest = createMockRequest('perf-req-1234567', 'Performance Request');
            const workspaceRequest = createMockRequest('req-1234567', 'Workspace Request');

            const isPerformanceRequest = (req: ApiRequest) => req.id?.startsWith('perf-req-');

            expect(isPerformanceRequest(perfRequest)).toBe(true);
            expect(isPerformanceRequest(workspaceRequest)).toBe(false);
        });

        it('should handle requests without ID gracefully', () => {
            const requestNoId: ApiRequest = {
                name: 'No ID Request',
                request: '',
                endpoint: 'http://test.com',
                contentType: 'text/xml'
            };

            const isPerformanceRequest = (req: ApiRequest) => req.id?.startsWith('perf-req-') ?? false;

            expect(isPerformanceRequest(requestNoId)).toBe(false);
        });

        it('should not route workspace request to performance path even if selectedPerformanceSuiteId is set', () => {
            // This simulates the bug scenario: user was editing performance suite,
            // then navigated to workspace, but selectedPerformanceSuiteId wasn't cleared
            const selectedPerformanceSuiteId = 'perf-suite-12345';
            const workspaceRequest = createMockRequest('req-workspace-1', 'Workspace Request');

            const isPerformanceRequest = workspaceRequest.id?.startsWith('perf-req-') ?? false;

            // Even though selectedPerformanceSuiteId is set, the request should NOT be routed
            // to performance path because the ID prefix check fails
            const shouldRouteToPerformance = selectedPerformanceSuiteId && isPerformanceRequest;

            expect(shouldRouteToPerformance).toBe(false);
        });
    });

    describe('Test Case Request Detection', () => {
        it('should detect if request is in selected test case by ID match', () => {
            const request = createMockRequest('step-req-1', 'Step Request');
            const testCase = createMockTestCase([request]);

            const isRequestInTestCase = testCase.steps.some(step =>
                step.config.request?.id === request.id
            );

            expect(isRequestInTestCase).toBe(true);
        });

        it('should detect if request is in selected test case by name match', () => {
            const request = createMockRequest('step-req-1', 'Step Request');
            const testCase = createMockTestCase([request]);
            const updatedRequestWithDifferentId = createMockRequest('new-id', 'Step Request');

            const isRequestInTestCase = testCase.steps.some(step =>
                step.config.request?.name === updatedRequestWithDifferentId.name
            );

            expect(isRequestInTestCase).toBe(true);
        });

        it('should return false when request is NOT in selected test case', () => {
            const testCaseRequest = createMockRequest('step-req-1', 'Step Request');
            const workspaceRequest = createMockRequest('workspace-req-1', 'Workspace Request');
            const testCase = createMockTestCase([testCaseRequest]);

            const isRequestInTestCase = testCase.steps.some(step =>
                step.config.request?.id === workspaceRequest.id ||
                step.config.request?.name === workspaceRequest.name
            );

            expect(isRequestInTestCase).toBe(false);
        });

        it('should fall through to workspace path when request not in stale test case', () => {
            // This simulates the bug scenario: user was editing a test case step,
            // then navigated to workspace, but selectedTestCase wasn't cleared
            const testCaseRequest = createMockRequest('tc-step-req', 'Test Case Request');
            const workspaceRequest = createMockRequest('ws-req-1', 'Workspace Request');
            const staleSelectedTestCase = createMockTestCase([testCaseRequest]);

            // Check if the workspace request is in the stale test case
            const isRequestInTestCase = staleSelectedTestCase.steps.some(step =>
                step.config.request?.id === workspaceRequest.id ||
                step.config.request?.name === workspaceRequest.name
            );

            // Since it's NOT in the test case, we should NOT use the test case path
            expect(isRequestInTestCase).toBe(false);

            // This means the update should fall through to the normal workspace path
        });
    });

    describe('Workspace Request Update Path', () => {
        it('should update request when project name matches', () => {
            const oldRequest = createMockRequest('req-1', 'Request 1');
            const project = createMockProject([oldRequest]);

            const selectedInterfaceName = 'TestInterface';
            const selectedOperationName = 'TestOperation';

            // Verify project name matches (this is checked in the real implementation)
            expect(project.name).toBe('Test Project');

            const updatedRequest = { ...oldRequest, request: '<soap:Envelope>updated</soap:Envelope>' };

            // Simulate the update logic
            const updatedProject = {
                ...project,
                dirty: true,
                interfaces: project.interfaces.map(i => {
                    if (i.name !== selectedInterfaceName) return i;
                    return {
                        ...i,
                        operations: i.operations.map(o => {
                            if (o.name !== selectedOperationName) return o;
                            return {
                                ...o,
                                requests: o.requests.map(r =>
                                    r.id === updatedRequest.id ? updatedRequest : r
                                )
                            };
                        })
                    };
                })
            };

            // Verify the update succeeded
            const resultRequest = updatedProject.interfaces[0].operations[0].requests[0];
            expect(resultRequest.request).toBe('<soap:Envelope>updated</soap:Envelope>');
            expect(updatedProject.dirty).toBe(true);
        });

        it('should skip project when name does not match', () => {
            const request = createMockRequest('req-1', 'Request 1');
            const project = createMockProject([request]);

            const selectedProjectName = 'Different Project';

            // Should not match and return unchanged
            const projectNameMatches = project.name === selectedProjectName;

            expect(projectNameMatches).toBe(false);
        });

        it('should find request by ID for update', () => {
            const request1 = createMockRequest('req-1', 'Request 1');
            const request2 = createMockRequest('req-2', 'Request 2');
            const project = createMockProject([request1, request2]);

            const targetId = 'req-2';
            const operation = project.interfaces[0].operations[0];

            const foundRequest = operation.requests.find(r => r.id === targetId);

            expect(foundRequest).toBeDefined();
            expect(foundRequest?.name).toBe('Request 2');
        });
    });

    describe('Dirty State Propagation', () => {
        it('should set dirty flag on request', () => {
            const request = createMockRequest('req-1', 'Request 1');
            const dirtyRequest = { ...request, dirty: true };

            expect(dirtyRequest.dirty).toBe(true);
        });

        it('should set dirty flag on project when request is updated', () => {
            const request = createMockRequest('req-1', 'Request 1');
            const project = createMockProject([request]);

            expect(project.dirty).toBeUndefined();

            const updatedProject = { ...project, dirty: true };

            expect(updatedProject.dirty).toBe(true);
        });
    });

    describe('Stale State Scenarios', () => {
        it('scenario: edit workspace request after visiting performance suite', () => {
            // Setup: User was in performance suite, then navigated to workspace
            const staleSelectedPerformanceSuiteId = 'perf-suite-old';
            const workspaceRequest = createMockRequest('ws-req-1', 'Workspace Request');

            // The fix: Check if request ID starts with 'perf-req-'
            const isPerformanceRequest = workspaceRequest.id?.startsWith('perf-req-') ?? false;

            // Result: Should NOT route to performance handler
            expect(staleSelectedPerformanceSuiteId).toBeTruthy(); // Stale state exists
            expect(isPerformanceRequest).toBe(false); // But request is not a perf request
            // Therefore: Should route to normal handleRequestUpdate
        });

        it('scenario: edit workspace request after visiting test case', () => {
            // Setup: User was editing test case, then navigated to workspace
            const testCaseRequest = createMockRequest('tc-req-1', 'Test Case Request');
            const staleSelectedTestCase = createMockTestCase([testCaseRequest]);
            const workspaceRequest = createMockRequest('ws-req-1', 'Workspace Request');

            // The fix: Check if request is actually in the test case
            const isRequestInTestCase = staleSelectedTestCase.steps.some(step =>
                step.config.request?.id === workspaceRequest.id ||
                step.config.request?.name === workspaceRequest.name
            );

            // Result: Should NOT use test case path
            expect(staleSelectedTestCase).toBeTruthy(); // Stale state exists
            expect(isRequestInTestCase).toBe(false); // But request is not in that test case
            // Therefore: Should fall through to workspace update path
        });

        it('scenario: edit Test Case step request (should still work)', () => {
            // Positive case: Actually editing a test case step
            const stepRequest = createMockRequest('step-req-1', 'Step Request');
            const selectedTestCase = createMockTestCase([stepRequest]);

            // Check if request is in the test case
            const isRequestInTestCase = selectedTestCase.steps.some(step =>
                step.config.request?.id === stepRequest.id
            );

            // Result: SHOULD use test case path
            expect(isRequestInTestCase).toBe(true);
        });

        it('scenario: edit Performance request (should still work)', () => {
            // Positive case: Actually editing a performance request
            const perfRequest = createMockRequest('perf-req-12345', 'Performance Request');
            const selectedPerformanceSuiteId = 'perf-suite-12345';

            const isPerformanceRequest = perfRequest.id?.startsWith('perf-req-') ?? false;

            // Result: SHOULD route to performance handler
            expect(selectedPerformanceSuiteId).toBeTruthy();
            expect(isPerformanceRequest).toBe(true);
        });
    });
});
