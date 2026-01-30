import { RequestHistoryService } from '../../services/RequestHistoryService';
import { RequestHistoryEntry } from '../../../shared/src/models';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('RequestHistoryService', () => {
    let service: RequestHistoryService;
    let testConfigDir: string;

    beforeEach(() => {
        // Create a temporary test directory
        testConfigDir = path.join(os.tmpdir(), `APInox-test-${Date.now()}`);
        fs.mkdirSync(testConfigDir, { recursive: true });

        service = new RequestHistoryService(testConfigDir);
    });

    afterEach(() => {
        // Clean up test directory
        const historyFile = path.join(testConfigDir, 'history.json');
        if (fs.existsSync(historyFile)) {
            fs.unlinkSync(historyFile);
        }
        if (fs.existsSync(testConfigDir)) {
            fs.rmdirSync(testConfigDir);
        }
    });

    describe('addEntry', () => {
        it('should add a new entry to history', () => {
            const entry: RequestHistoryEntry = {
                id: 'test-1',
                timestamp: Date.now(),
                projectName: 'Test Project',
                interfaceName: 'TestService',
                operationName: 'TestOperation',
                requestName: 'Test Request',
                endpoint: 'https://example.com/soap',
                requestBody: '<soap:Envelope/>',
                headers: { 'Content-Type': 'text/xml' },
                statusCode: 200,
                duration: 150,
                success: true,
                starred: false
            };

            service.addEntry(entry);
            const all = service.getAll();

            expect(all).toHaveLength(1);
            expect(all[0]).toEqual(entry);
        });

        it('should add entries in reverse chronological order (newest first)', () => {
            const entry1: RequestHistoryEntry = {
                id: 'test-1',
                timestamp: 1000,
                projectName: 'Test',
                interfaceName: 'Service',
                operationName: 'Op',
                requestName: 'Request 1',
                endpoint: 'https://example.com',
                requestBody: '<soap/>',
                headers: {},
                starred: false
            };

            const entry2: RequestHistoryEntry = {
                ...entry1,
                id: 'test-2',
                timestamp: 2000,
                requestName: 'Request 2'
            };

            service.addEntry(entry1);
            service.addEntry(entry2);

            const all = service.getAll();
            expect(all[0].id).toBe('test-2'); // Newest first
            expect(all[1].id).toBe('test-1');
        });

        it('should limit entries to maxEntries config', () => {
            // Add 105 entries when max is 100
            for (let i = 0; i < 105; i++) {
                service.addEntry({
                    id: `test-${i}`,
                    timestamp: Date.now() + i,
                    projectName: 'Test',
                    interfaceName: 'Service',
                    operationName: 'Op',
                    requestName: `Request ${i}`,
                    endpoint: 'https://example.com',
                    requestBody: '<soap/>',
                    headers: {},
                    starred: false
                });
            }

            const all = service.getAll();
            expect(all).toHaveLength(100);
            expect(all[0].id).toBe('test-104'); // Most recent
            expect(all[99].id).toBe('test-5'); // Oldest kept (test-0 to test-4 removed)
        });
    });

    describe('getStarred', () => {
        it('should return only starred entries', () => {
            const entry1: RequestHistoryEntry = {
                id: 'test-1',
                timestamp: Date.now(),
                projectName: 'Test',
                interfaceName: 'Service',
                operationName: 'Op',
                requestName: 'Request 1',
                endpoint: 'https://example.com',
                requestBody: '<soap/>',
                headers: {},
                starred: true
            };

            const entry2: RequestHistoryEntry = {
                ...entry1,
                id: 'test-2',
                requestName: 'Request 2',
                starred: false
            };

            service.addEntry(entry1);
            service.addEntry(entry2);

            const starred = service.getStarred();
            expect(starred).toHaveLength(1);
            expect(starred[0].id).toBe('test-1');
        });
    });

    describe('toggleStar', () => {
        it('should toggle starred status', () => {
            const entry: RequestHistoryEntry = {
                id: 'test-1',
                timestamp: Date.now(),
                projectName: 'Test',
                interfaceName: 'Service',
                operationName: 'Op',
                requestName: 'Request',
                endpoint: 'https://example.com',
                requestBody: '<soap/>',
                headers: {},
                starred: false
            };

            service.addEntry(entry);
            service.toggleStar('test-1');

            const all = service.getAll();
            expect(all[0].starred).toBe(true);

            service.toggleStar('test-1');
            expect(service.getAll()[0].starred).toBe(false);
        });

        it('should handle non-existent id gracefully', () => {
            expect(() => service.toggleStar('non-existent')).not.toThrow();
        });
    });

    describe('deleteEntry', () => {
        it('should remove entry by id', () => {
            const entry: RequestHistoryEntry = {
                id: 'test-1',
                timestamp: Date.now(),
                projectName: 'Test',
                interfaceName: 'Service',
                operationName: 'Op',
                requestName: 'Request',
                endpoint: 'https://example.com',
                requestBody: '<soap/>',
                headers: {},
                starred: false
            };

            service.addEntry(entry);
            expect(service.getAll()).toHaveLength(1);

            service.deleteEntry('test-1');
            expect(service.getAll()).toHaveLength(0);
        });
    });

    describe('clearAll', () => {
        it('should remove all entries', () => {
            for (let i = 0; i < 5; i++) {
                service.addEntry({
                    id: `test-${i}`,
                    timestamp: Date.now(),
                    projectName: 'Test',
                    interfaceName: 'Service',
                    operationName: 'Op',
                    requestName: `Request ${i}`,
                    endpoint: 'https://example.com',
                    requestBody: '<soap/>',
                    headers: {},
                    starred: false
                });
            }

            expect(service.getAll()).toHaveLength(5);
            service.clearAll();
            expect(service.getAll()).toHaveLength(0);
        });
    });

    describe('clearOlderThan', () => {
        it('should remove entries older than specified days', () => {
            const now = Date.now();
            const fiveDaysAgo = now - (5 * 24 * 60 * 60 * 1000);

            service.addEntry({
                id: 'recent',
                timestamp: now,
                projectName: 'Test',
                interfaceName: 'Service',
                operationName: 'Op',
                requestName: 'Recent',
                endpoint: 'https://example.com',
                requestBody: '<soap/>',
                headers: {},
                starred: false
            });

            service.addEntry({
                id: 'old',
                timestamp: fiveDaysAgo,
                projectName: 'Test',
                interfaceName: 'Service',
                operationName: 'Op',
                requestName: 'Old',
                endpoint: 'https://example.com',
                requestBody: '<soap/>',
                headers: {},
                starred: false
            });

            service.clearOlderThan(3); // Clear older than 3 days

            const all = service.getAll();
            expect(all).toHaveLength(1);
            expect(all[0].id).toBe('recent');
        });
    });

    describe('persistence', () => {
        it('should save and load history from disk', () => {
            const entry: RequestHistoryEntry = {
                id: 'test-1',
                timestamp: Date.now(),
                projectName: 'Test Project',
                interfaceName: 'TestService',
                operationName: 'TestOp',
                requestName: 'Test Request',
                endpoint: 'https://example.com/soap',
                requestBody: '<soap:Envelope/>',
                headers: { 'Content-Type': 'text/xml' },
                statusCode: 200,
                duration: 150,
                success: true,
                starred: false
            };

            service.addEntry(entry);

            // Create new service instance with same config dir
            const service2 = new RequestHistoryService(testConfigDir);
            const loaded = service2.getAll();

            expect(loaded).toHaveLength(1);
            expect(loaded[0].id).toBe('test-1');
            expect(loaded[0].projectName).toBe('Test Project');
        });
    });

    describe('updateConfig', () => {
        it('should update configuration', () => {
            const config = service.getConfig();
            expect(config.maxEntries).toBe(100);

            service.updateConfig({ maxEntries: 50 });
            expect(service.getConfig().maxEntries).toBe(50);
        });

        it('should trim entries when maxEntries is reduced', () => {
            for (let i = 0; i < 100; i++) {
                service.addEntry({
                    id: `test-${i}`,
                    timestamp: Date.now() + i,
                    projectName: 'Test',
                    interfaceName: 'Service',
                    operationName: 'Op',
                    requestName: `Request ${i}`,
                    endpoint: 'https://example.com',
                    requestBody: '<soap/>',
                    headers: {},
                    starred: false
                });
            }

            expect(service.getAll()).toHaveLength(100);

            service.updateConfig({ maxEntries: 10 });
            expect(service.getAll()).toHaveLength(10);
            expect(service.getAll()[0].id).toBe('test-99'); // Keep most recent
        });
    });
});
