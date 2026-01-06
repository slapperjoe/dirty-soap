/**
 * Schedule Commands
 * 
 * Commands for managing scheduled performance runs.
 */

import { ICommand } from './ICommand';
import { ScheduleService } from '../services/ScheduleService';
import { SettingsManager } from '../utils/SettingsManager';
import { PerformanceSchedule } from '@shared/models';

/**
 * Get all schedules
 */
export class GetSchedulesCommand implements ICommand {
    constructor(private readonly _scheduleService: ScheduleService) { }

    async execute(_message: any): Promise<PerformanceSchedule[]> {
        return this._scheduleService.getSchedules();
    }
}

/**
 * Add a new schedule
 */
export class AddScheduleCommand implements ICommand {
    constructor(
        private readonly _scheduleService: ScheduleService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<PerformanceSchedule> {
        const schedule = this._scheduleService.addSchedule(
            message.suiteId,
            message.suiteName,
            message.cronExpression,
            message.description
        );

        // Persist schedules
        this._settingsManager.updatePerformanceSchedules(this._scheduleService.getSchedules());
        return schedule;
    }
}

/**
 * Update an existing schedule
 */
export class UpdateScheduleCommand implements ICommand {
    constructor(
        private readonly _scheduleService: ScheduleService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<PerformanceSchedule | null> {
        const schedule = this._scheduleService.updateSchedule(
            message.scheduleId,
            message.updates
        );

        if (schedule) {
            this._settingsManager.updatePerformanceSchedules(this._scheduleService.getSchedules());
        }
        return schedule;
    }
}

/**
 * Delete a schedule
 */
export class DeleteScheduleCommand implements ICommand {
    constructor(
        private readonly _scheduleService: ScheduleService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<boolean> {
        const result = this._scheduleService.deleteSchedule(message.scheduleId);
        if (result) {
            this._settingsManager.updatePerformanceSchedules(this._scheduleService.getSchedules());
        }
        return result;
    }
}

/**
 * Toggle schedule enabled/disabled
 */
export class ToggleScheduleCommand implements ICommand {
    constructor(
        private readonly _scheduleService: ScheduleService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<PerformanceSchedule | null> {
        const schedule = this._scheduleService.updateSchedule(
            message.scheduleId,
            { enabled: message.enabled }
        );

        if (schedule) {
            this._settingsManager.updatePerformanceSchedules(this._scheduleService.getSchedules());
        }
        return schedule;
    }
}
