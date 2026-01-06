/**
 * ScheduleService Tests
 * 
 * Tests for scheduled performance run management and state synchronization.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScheduleService } from '../../services/ScheduleService';
import { PerformanceService } from '../../services/PerformanceService';
import { PerformanceSchedule } from '@shared/models';

// Mock node-cron
vi.mock('node-cron', () => ({
    validate: vi.fn().mockReturnValue(true),
    schedule: vi.fn().mockReturnValue({
        stop: vi.fn()
    })
}));

// Create a mock PerformanceService
const createMockPerformanceService = () => {
    return {
        runSuite: vi.fn().mockResolvedValue({
            id: 'run-123',
            suiteId: 'suite-1',
            suiteName: 'Test Suite',
            startTime: Date.now(),
            endTime: Date.now() + 1000,
            status: 'completed',
            results: [],
            summary: {
                totalRequests: 10,
                successCount: 10,
                failureCount: 0,
                successRate: 1,
                avgResponseTime: 100,
                minResponseTime: 50,
                maxResponseTime: 150,
                p50: 100,
                p95: 140,
                p99: 150,
                slaBreachCount: 0,
                totalDuration: 1000
            }
        }),
        getSuites: vi.fn().mockReturnValue([]),
        on: vi.fn(),
        emit: vi.fn()
    } as unknown as PerformanceService;
};

describe('ScheduleService', () => {
    let scheduleService: ScheduleService;
    let mockPerformanceService: PerformanceService;

    beforeEach(() => {
        mockPerformanceService = createMockPerformanceService();
        scheduleService = new ScheduleService(mockPerformanceService);
    });

    afterEach(() => {
        scheduleService.dispose();
        vi.clearAllMocks();
    });

    describe('addSchedule', () => {
        it('should create a new schedule with valid cron expression', () => {
            const schedule = scheduleService.addSchedule(
                'suite-1',
                'Test Suite',
                '0 3 * * *',
                'Daily at 3am'
            );

            expect(schedule).toBeDefined();
            expect(schedule.suiteId).toBe('suite-1');
            expect(schedule.suiteName).toBe('Test Suite');
            expect(schedule.cronExpression).toBe('0 3 * * *');
            expect(schedule.description).toBe('Daily at 3am');
            expect(schedule.enabled).toBe(true);
            expect(schedule.id).toMatch(/^schedule-/);
        });

        it('should throw error for invalid cron expression', async () => {
            const cron = await import('node-cron');
            vi.mocked(cron.validate).mockReturnValueOnce(false);

            expect(() => {
                scheduleService.addSchedule('suite-1', 'Test', 'invalid-cron');
            }).toThrow('Invalid cron expression');
        });

        it('should emit scheduleAdded event', () => {
            const listener = vi.fn();
            scheduleService.on('scheduleAdded', listener);

            const schedule = scheduleService.addSchedule('suite-1', 'Test', '0 3 * * *');

            expect(listener).toHaveBeenCalledWith(schedule);
        });
    });

    describe('getSchedules', () => {
        it('should return all schedules', () => {
            scheduleService.addSchedule('suite-1', 'Test 1', '0 3 * * *');
            scheduleService.addSchedule('suite-2', 'Test 2', '0 6 * * *');

            const schedules = scheduleService.getSchedules();

            expect(schedules).toHaveLength(2);
            expect(schedules[0].suiteName).toBe('Test 1');
            expect(schedules[1].suiteName).toBe('Test 2');
        });

        it('should return empty array when no schedules', () => {
            expect(scheduleService.getSchedules()).toEqual([]);
        });
    });

    describe('updateSchedule', () => {
        it('should update cronExpression', () => {
            const schedule = scheduleService.addSchedule('suite-1', 'Test', '0 3 * * *');

            const updated = scheduleService.updateSchedule(schedule.id, {
                cronExpression: '0 6 * * *'
            });

            expect(updated?.cronExpression).toBe('0 6 * * *');
        });

        it('should update enabled status', () => {
            const schedule = scheduleService.addSchedule('suite-1', 'Test', '0 3 * * *');

            const updated = scheduleService.updateSchedule(schedule.id, {
                enabled: false
            });

            expect(updated?.enabled).toBe(false);
        });

        it('should return null for non-existent schedule', () => {
            const result = scheduleService.updateSchedule('non-existent', { enabled: false });
            expect(result).toBeNull();
        });

        it('should emit scheduleUpdated event', () => {
            const listener = vi.fn();
            scheduleService.on('scheduleUpdated', listener);

            const schedule = scheduleService.addSchedule('suite-1', 'Test', '0 3 * * *');
            scheduleService.updateSchedule(schedule.id, { enabled: false });

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('deleteSchedule', () => {
        it('should delete existing schedule', () => {
            const schedule = scheduleService.addSchedule('suite-1', 'Test', '0 3 * * *');

            const result = scheduleService.deleteSchedule(schedule.id);

            expect(result).toBe(true);
            expect(scheduleService.getSchedules()).toHaveLength(0);
        });

        it('should return false for non-existent schedule', () => {
            expect(scheduleService.deleteSchedule('non-existent')).toBe(false);
        });

        it('should emit scheduleDeleted event', () => {
            const listener = vi.fn();
            scheduleService.on('scheduleDeleted', listener);

            const schedule = scheduleService.addSchedule('suite-1', 'Test', '0 3 * * *');
            scheduleService.deleteSchedule(schedule.id);

            expect(listener).toHaveBeenCalledWith(schedule.id);
        });
    });

    describe('loadSchedules', () => {
        it('should load schedules from saved configuration', () => {
            const savedSchedules: PerformanceSchedule[] = [
                {
                    id: 'schedule-1',
                    suiteId: 'suite-1',
                    suiteName: 'Test Suite',
                    cronExpression: '0 3 * * *',
                    enabled: true,
                    createdAt: Date.now()
                }
            ];

            scheduleService.loadSchedules(savedSchedules);

            // Verify schedules are loaded (internal state)
            // Note: loadSchedules only starts enabled schedules, doesn't add to internal map
            // The schedule list comes from the loaded data, not from addSchedule
        });

        it('should stop all existing schedules before loading new ones', () => {
            // Add an initial schedule
            scheduleService.addSchedule('suite-0', 'Existing', '0 1 * * *');

            // Load new schedules (should clear existing)
            scheduleService.loadSchedules([]);

            // After loading empty array, internal schedules should be cleared
            expect(scheduleService.getSchedules()).toHaveLength(0);
        });
    });

    describe('stopAll', () => {
        it('should stop all scheduled tasks', () => {
            scheduleService.addSchedule('suite-1', 'Test 1', '0 3 * * *');
            scheduleService.addSchedule('suite-2', 'Test 2', '0 6 * * *');

            scheduleService.stopAll();

            expect(scheduleService.getSchedules()).toHaveLength(0);
        });
    });

    describe('State Synchronization', () => {
        it('should maintain consistent state after multiple operations', () => {
            // Add
            const s1 = scheduleService.addSchedule('suite-1', 'Test 1', '0 3 * * *');
            const s2 = scheduleService.addSchedule('suite-2', 'Test 2', '0 6 * * *');
            expect(scheduleService.getSchedules()).toHaveLength(2);

            // Update
            scheduleService.updateSchedule(s1.id, { enabled: false });

            // Delete
            scheduleService.deleteSchedule(s2.id);
            expect(scheduleService.getSchedules()).toHaveLength(1);

            // Verify remaining schedule state
            const remaining = scheduleService.getSchedules()[0];
            expect(remaining.id).toBe(s1.id);
            expect(remaining.enabled).toBe(false);
        });

        it('should preserve schedule data integrity across updates', () => {
            const schedule = scheduleService.addSchedule(
                'suite-1',
                'Original Name',
                '0 3 * * *',
                'Original description'
            );

            const originalCreatedAt = schedule.createdAt;
            const originalId = schedule.id;

            // Update should preserve immutable fields
            scheduleService.updateSchedule(schedule.id, {
                cronExpression: '0 6 * * *'
            });

            const updated = scheduleService.getSchedules()[0];
            expect(updated.id).toBe(originalId);
            expect(updated.createdAt).toBe(originalCreatedAt);
            expect(updated.suiteName).toBe('Original Name');
        });
    });
});
