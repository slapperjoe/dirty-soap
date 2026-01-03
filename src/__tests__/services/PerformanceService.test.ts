/**
 * PerformanceService Tests
 * 
 * Tests for performance suite management and execution state.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerformanceService } from '../../services/PerformanceService';
import { PerformanceSuite, PerformanceRequest } from '../../models';

// Mock SoapClient
const createMockSoapClient = () => ({
    executeRequest: vi.fn().mockResolvedValue({
        status: 200,
        body: '<response>OK</response>',
        headers: {},
        duration: 100
    })
});

// Helper to create a test suite
const createTestSuite = (overrides: Partial<PerformanceSuite> = {}): PerformanceSuite => ({
    id: `suite-${Date.now()}`,
    name: 'Test Suite',
    requests: [],
    iterations: 10,
    delayBetweenRequests: 0,
    warmupRuns: 0,
    concurrency: 1,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    ...overrides
});

// Helper to create a test request
const createTestRequest = (overrides: Partial<PerformanceRequest> = {}): PerformanceRequest => ({
    id: `req-${Date.now()}`,
    name: 'Test Request',
    endpoint: 'http://example.com/soap',
    requestBody: '<soap:Envelope/>',
    extractors: [],
    order: 0,
    ...overrides
});

describe('PerformanceService', () => {
    let performanceService: PerformanceService;
    let mockSoapClient: ReturnType<typeof createMockSoapClient>;

    beforeEach(() => {
        mockSoapClient = createMockSoapClient();
        performanceService = new PerformanceService(mockSoapClient as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Suite Management', () => {
        describe('addSuite', () => {
            it('should add suite to internal list', () => {
                const suite1 = createTestSuite({ id: 'suite-1', name: 'Suite 1' });
                const suite2 = createTestSuite({ id: 'suite-2', name: 'Suite 2' });

                performanceService.addSuite(suite1);
                performanceService.addSuite(suite2);

                const suites = performanceService.getSuites();
                expect(suites).toHaveLength(2);
            });
        });

        describe('getSuites', () => {
            it('should return all suites', () => {
                const suite1 = createTestSuite({ id: 'suite-1', name: 'Suite 1' });
                const suite2 = createTestSuite({ id: 'suite-2', name: 'Suite 2' });

                performanceService.addSuite(suite1);
                performanceService.addSuite(suite2);

                const suites = performanceService.getSuites();
                expect(suites).toHaveLength(2);
                expect(suites[0].name).toBe('Suite 1');
                expect(suites[1].name).toBe('Suite 2');
            });

            it('should return empty array when no suites', () => {
                expect(performanceService.getSuites()).toEqual([]);
            });
        });

        describe('getSuite', () => {
            it('should return suite by id', () => {
                const suite = createTestSuite({ id: 'find-me' });
                performanceService.addSuite(suite);

                const found = performanceService.getSuite('find-me');

                expect(found).toBeDefined();
                expect(found?.id).toBe('find-me');
            });

            it('should return undefined for non-existent id', () => {
                expect(performanceService.getSuite('non-existent')).toBeUndefined();
            });
        });

        describe('updateSuite', () => {
            it('should update suite properties', () => {
                const suite = createTestSuite({ id: 'update-me', name: 'Original' });
                performanceService.addSuite(suite);

                performanceService.updateSuite('update-me', {
                    name: 'Updated',
                    iterations: 20
                });

                const updated = performanceService.getSuite('update-me');
                expect(updated?.name).toBe('Updated');
                expect(updated?.iterations).toBe(20);
            });

            it('should preserve unmodified properties', () => {
                const suite = createTestSuite({ id: 'preserve-me', name: 'Test', concurrency: 5 });
                performanceService.addSuite(suite);

                performanceService.updateSuite('preserve-me', { iterations: 50 });

                const updated = performanceService.getSuite('preserve-me');
                expect(updated?.id).toBe('preserve-me');
                expect(updated?.name).toBe('Test');
                expect(updated?.concurrency).toBe(5);
            });
        });

        describe('deleteSuite', () => {
            it('should remove suite from list', () => {
                const suite = createTestSuite({ id: 'delete-me' });
                performanceService.addSuite(suite);

                performanceService.deleteSuite('delete-me');

                expect(performanceService.getSuites()).toHaveLength(0);
            });

            it('should not fail for non-existent suite', () => {
                expect(() => {
                    performanceService.deleteSuite('non-existent');
                }).not.toThrow();
            });
        });

        describe('setSuites', () => {
            it('should replace all suites with provided list', () => {
                // Add initial suite
                performanceService.addSuite(createTestSuite({ id: 'old' }));

                // Replace with new suites
                const newSuites = [
                    createTestSuite({ id: 'new-1', name: 'New 1' }),
                    createTestSuite({ id: 'new-2', name: 'New 2' })
                ];
                performanceService.setSuites(newSuites);

                const suites = performanceService.getSuites();
                expect(suites).toHaveLength(2);
                expect(suites.find(s => s.id === 'old')).toBeUndefined();
            });
        });
    });

    describe('History Management', () => {
        describe('getHistory', () => {
            it('should return all run history', () => {
                const history = performanceService.getHistory();
                expect(Array.isArray(history)).toBe(true);
            });
        });

        describe('getSuiteHistory', () => {
            it('should return history filtered by suite id', () => {
                // Initially empty
                const history = performanceService.getSuiteHistory('some-suite');
                expect(Array.isArray(history)).toBe(true);
            });
        });
    });

    describe('State Synchronization', () => {
        it('should maintain consistent state after multiple suite operations', () => {
            // Add suites
            const s1 = createTestSuite({ id: 'suite-1', name: 'Suite 1' });
            const s2 = createTestSuite({ id: 'suite-2', name: 'Suite 2' });
            const s3 = createTestSuite({ id: 'suite-3', name: 'Suite 3' });

            performanceService.addSuite(s1);
            performanceService.addSuite(s2);
            performanceService.addSuite(s3);
            expect(performanceService.getSuites()).toHaveLength(3);

            // Delete one
            performanceService.deleteSuite('suite-2');
            expect(performanceService.getSuites()).toHaveLength(2);

            // Update another
            performanceService.updateSuite('suite-1', { name: 'Updated Suite 1' });

            // Verify state
            const suites = performanceService.getSuites();
            expect(suites.find(s => s.id === 'suite-1')?.name).toBe('Updated Suite 1');
            expect(suites.find(s => s.id === 'suite-2')).toBeUndefined();
            expect(suites.find(s => s.id === 'suite-3')).toBeDefined();
        });

        it('should maintain suite-request relationship correctly', () => {
            const request1 = createTestRequest({ id: 'req-1', order: 0 });
            const request2 = createTestRequest({ id: 'req-2', order: 1 });
            const suite = createTestSuite({
                id: 'test-suite',
                requests: [request1, request2]
            });

            performanceService.addSuite(suite);

            // Verify request data preserved
            const retrieved = performanceService.getSuite('test-suite');
            expect(retrieved?.requests).toHaveLength(2);
            expect(retrieved?.requests[0].id).toBe('req-1');
            expect(retrieved?.requests[1].id).toBe('req-2');
        });

        it('should preserve request data across suite updates', () => {
            const request = createTestRequest({ name: 'Critical Request' });
            const suite = createTestSuite({
                id: 'test-suite',
                requests: [request]
            });

            performanceService.addSuite(suite);

            // Update suite (shouldn't affect requests)
            performanceService.updateSuite('test-suite', {
                iterations: 100,
                concurrency: 5
            });

            const updated = performanceService.getSuite('test-suite');
            expect(updated?.requests).toHaveLength(1);
            expect(updated?.requests[0].name).toBe('Critical Request');
        });

        it('should load suites from external data correctly via setSuites', () => {
            const externalSuites: PerformanceSuite[] = [
                {
                    id: 'ext-suite-1',
                    name: 'External Suite',
                    requests: [
                        {
                            id: 'ext-req-1',
                            name: 'External Request',
                            endpoint: 'http://external.com',
                            requestBody: '<req/>',
                            extractors: [],
                            order: 0
                        }
                    ],
                    iterations: 5,
                    delayBetweenRequests: 100,
                    warmupRuns: 1,
                    concurrency: 2,
                    createdAt: Date.now(),
                    modifiedAt: Date.now()
                }
            ];

            performanceService.setSuites(externalSuites);

            const suites = performanceService.getSuites();
            expect(suites).toHaveLength(1);
            expect(suites[0].id).toBe('ext-suite-1');
            expect(suites[0].requests).toHaveLength(1);
        });
    });

    describe('Execution State', () => {
        it('should track running state', () => {
            expect(performanceService.isExecuting()).toBe(false);
        });

        it('should allow abort when not running', () => {
            expect(() => {
                performanceService.abort();
            }).not.toThrow();
        });
    });
});
