/**
 * ScheduleService
 * 
 * Manages scheduled performance runs using node-cron.
 */

import * as cron from 'node-cron';
import { EventEmitter } from 'events';
import { PerformanceSchedule, PerformanceSuite } from '../models';
import { PerformanceService } from './PerformanceService';

interface ScheduledTask {
    schedule: PerformanceSchedule;
    task: cron.ScheduledTask;
}

export class ScheduleService extends EventEmitter {
    private _schedules: Map<string, ScheduledTask> = new Map();
    private _performanceService: PerformanceService;

    constructor(performanceService: PerformanceService) {
        super();
        this._performanceService = performanceService;
    }

    /**
     * Initialize schedules from saved configuration
     */
    loadSchedules(schedules: PerformanceSchedule[]): void {
        // Stop any existing schedules
        this.stopAll();

        for (const schedule of schedules) {
            if (schedule.enabled) {
                this.startSchedule(schedule);
            }
        }
    }

    /**
     * Add a new schedule
     */
    addSchedule(
        suiteId: string,
        suiteName: string,
        cronExpression: string,
        description?: string
    ): PerformanceSchedule {
        // Validate cron expression
        if (!cron.validate(cronExpression)) {
            throw new Error(`Invalid cron expression: ${cronExpression}`);
        }

        const schedule: PerformanceSchedule = {
            id: `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            suiteId,
            suiteName,
            cronExpression,
            description,
            enabled: true,
            createdAt: Date.now(),
            nextRun: this.getNextRunTime(cronExpression)
        };

        this.startSchedule(schedule);
        this.emit('scheduleAdded', schedule);
        return schedule;
    }

    /**
     * Update an existing schedule
     */
    updateSchedule(
        scheduleId: string,
        updates: Partial<Pick<PerformanceSchedule, 'cronExpression' | 'description' | 'enabled'>>
    ): PerformanceSchedule | null {
        const existing = this._schedules.get(scheduleId);
        if (!existing) return null;

        const updated: PerformanceSchedule = {
            ...existing.schedule,
            ...updates
        };

        // Validate new cron if changed
        if (updates.cronExpression && !cron.validate(updates.cronExpression)) {
            throw new Error(`Invalid cron expression: ${updates.cronExpression}`);
        }

        // Stop old task
        existing.task.stop();
        this._schedules.delete(scheduleId);

        // Restart if enabled, otherwise just store with stopped task
        if (updated.enabled) {
            updated.nextRun = this.getNextRunTime(updated.cronExpression);
            this.startSchedule(updated);
        } else {
            // Store disabled schedule with a no-op task
            const stoppedTask = cron.schedule(updated.cronExpression, () => { });
            stoppedTask.stop();
            this._schedules.set(updated.id, { schedule: updated, task: stoppedTask });
        }

        this.emit('scheduleUpdated', updated);
        return updated;
    }

    /**
     * Delete a schedule
     */
    deleteSchedule(scheduleId: string): boolean {
        const existing = this._schedules.get(scheduleId);
        if (!existing) return false;

        existing.task.stop();
        this._schedules.delete(scheduleId);
        this.emit('scheduleDeleted', scheduleId);
        return true;
    }

    /**
     * Get all schedules
     */
    getSchedules(): PerformanceSchedule[] {
        return Array.from(this._schedules.values()).map(s => s.schedule);
    }

    /**
     * Stop all scheduled tasks
     */
    stopAll(): void {
        for (const [, task] of this._schedules) {
            task.task.stop();
        }
        this._schedules.clear();
    }

    /**
     * Start a schedule
     */
    private startSchedule(schedule: PerformanceSchedule): void {
        const task = cron.schedule(schedule.cronExpression, async () => {
            console.log(`[ScheduleService] Running scheduled suite: ${schedule.suiteName}`);

            try {
                const run = await this._performanceService.runSuite(schedule.suiteId);

                if (run) {
                    schedule.lastRun = Date.now();
                    schedule.lastRunStatus = run.status;
                    schedule.nextRun = this.getNextRunTime(schedule.cronExpression);
                    this.emit('scheduledRunComplete', schedule, run);
                }
            } catch (error: any) {
                console.error(`[ScheduleService] Error running scheduled suite: ${error.message}`);
                schedule.lastRun = Date.now();
                schedule.lastRunStatus = 'failed';
                this.emit('scheduledRunError', schedule, error);
            }
        });

        this._schedules.set(schedule.id, { schedule, task });
    }

    /**
     * Calculate next run time from cron expression
     */
    private getNextRunTime(cronExpression: string): number {
        // Simple approximation - node-cron doesn't expose this directly
        // For a proper implementation, use cron-parser
        try {
            const parts = cronExpression.split(' ');
            const now = new Date();

            // This is a simplified next-run calculation
            // A full implementation would use cron-parser library
            const nextRun = new Date(now);
            nextRun.setMinutes(nextRun.getMinutes() + 1);

            return nextRun.getTime();
        } catch {
            return Date.now() + 60000; // Default: 1 minute from now
        }
    }

    /**
     * Dispose of all resources
     */
    dispose(): void {
        this.stopAll();
        this.removeAllListeners();
    }
}
