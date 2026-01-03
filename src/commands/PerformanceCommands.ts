import { ICommand } from './ICommand';
import { PerformanceService } from '../services/PerformanceService';
import { SettingsManager } from '../utils/SettingsManager';
import { PerformanceSuite, PerformanceRequest, SoapRequestExtractor } from '../models';
import * as vscode from 'vscode';

/**
 * Get all performance suites
 */
export class GetPerformanceSuitesCommand implements ICommand {
    constructor(private readonly _performanceService: PerformanceService) { }

    async execute(_message: any): Promise<PerformanceSuite[]> {
        return this._performanceService.getSuites();
    }
}

/**
 * Add a new performance suite
 */
export class AddPerformanceSuiteCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<PerformanceSuite> {
        const now = Date.now();
        const suite: PerformanceSuite = {
            id: `perf-suite-${now}`,
            name: message.name || 'New Performance Suite',
            description: message.description || '',
            requests: [],
            iterations: message.iterations || 10,
            delayBetweenRequests: message.delayBetweenRequests || 0,
            warmupRuns: message.warmupRuns || 1,
            concurrency: message.concurrency || 1,
            createdAt: now,
            modifiedAt: now
        };

        this._performanceService.addSuite(suite);
        this._settingsManager.updatePerformanceSuites(this._performanceService.getSuites());
        return suite;
    }
}

/**
 * Update an existing performance suite
 */
export class UpdatePerformanceSuiteCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        const { suiteId, updates } = message;
        this._performanceService.updateSuite(suiteId, updates);
        this._settingsManager.updatePerformanceSuites(this._performanceService.getSuites());
    }
}

/**
 * Delete a performance suite
 */
export class DeletePerformanceSuiteCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        this._performanceService.deleteSuite(message.suiteId);
        this._settingsManager.updatePerformanceSuites(this._performanceService.getSuites());
    }
}

/**
 * Add a request to a performance suite
 */
export class AddPerformanceRequestCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<PerformanceRequest | null> {
        const suite = this._performanceService.getSuite(message.suiteId);
        if (!suite) return null;

        const request: PerformanceRequest = {
            id: `perf-req-${Date.now()}`,
            name: message.name || 'New Request',
            endpoint: message.endpoint || '',
            method: message.method || 'POST',
            soapAction: message.soapAction,
            requestBody: message.requestBody || '',
            headers: message.headers || {},
            extractors: message.extractors || [],
            slaThreshold: message.slaThreshold,
            order: suite.requests.length
        };

        suite.requests.push(request);
        this._performanceService.updateSuite(message.suiteId, { requests: suite.requests });
        this._settingsManager.updatePerformanceSuites(this._performanceService.getSuites());
        return request;
    }
}

/**
 * Update a request in a performance suite
 */
export class UpdatePerformanceRequestCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        const suite = this._performanceService.getSuite(message.suiteId);
        if (!suite) return;

        const idx = suite.requests.findIndex(r => r.id === message.requestId);
        if (idx !== -1) {
            suite.requests[idx] = { ...suite.requests[idx], ...message.updates };
            this._performanceService.updateSuite(message.suiteId, { requests: suite.requests });
            this._settingsManager.updatePerformanceSuites(this._performanceService.getSuites());
        }
    }
}

/**
 * Delete a request from a performance suite
 */
export class DeletePerformanceRequestCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        const suite = this._performanceService.getSuite(message.suiteId);
        if (!suite) return;

        suite.requests = suite.requests.filter(r => r.id !== message.requestId);
        // Re-order remaining requests
        suite.requests.forEach((r, i) => r.order = i);
        this._performanceService.updateSuite(message.suiteId, { requests: suite.requests });
        this._settingsManager.updatePerformanceSuites(this._performanceService.getSuites());
    }
}

/**
 * Run a performance suite
 */
export class RunPerformanceSuiteCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<any> {
        const run = await this._performanceService.runSuite(
            message.suiteId,
            message.environment,
            message.variables
        );

        if (run) {
            // Persist history
            this._settingsManager.updatePerformanceHistory(this._performanceService.getHistory());
        }

        return run;
    }
}

/**
 * Abort a running performance suite
 */
export class AbortPerformanceSuiteCommand implements ICommand {
    constructor(private readonly _performanceService: PerformanceService) { }

    async execute(_message: any): Promise<void> {
        this._performanceService.abort();
    }
}

/**
 * Get performance run history
 */
export class GetPerformanceHistoryCommand implements ICommand {
    constructor(private readonly _performanceService: PerformanceService) { }

    async execute(message: any): Promise<any[]> {
        if (message.suiteId) {
            return this._performanceService.getSuiteHistory(message.suiteId);
        }
        return this._performanceService.getHistory();
    }
}

/**
 * Import a Test Suite as a Performance Suite
 */
export class ImportTestSuiteToPerformanceCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<PerformanceSuite | null> {
        const testSuite = message.testSuite;
        if (!testSuite || !testSuite.testCases) return null;

        const now = Date.now();

        // Convert test cases to performance requests
        const requests: PerformanceRequest[] = [];
        let order = 0;
        for (const testCase of testSuite.testCases) {
            if (!testCase.steps) continue;
            for (const step of testCase.steps) {
                requests.push({
                    id: `perf-req-${now}-${order}`,
                    name: step.name || `Step ${order + 1}`,
                    endpoint: step.endpoint || testSuite.endpoint || '',
                    method: step.method || 'POST',
                    soapAction: step.soapAction,
                    requestBody: step.request || '',
                    headers: step.headers || {},
                    extractors: (step.extractors || []) as SoapRequestExtractor[],
                    slaThreshold: undefined,
                    order: order++
                });
            }
        }

        const suite: PerformanceSuite = {
            id: `perf-suite-${now}`,
            name: `Perf: ${testSuite.name || 'Imported Suite'}`,
            description: `Imported from test suite: ${testSuite.name}`,
            requests,
            iterations: 10,
            delayBetweenRequests: 0,
            warmupRuns: 1,
            concurrency: 1,
            createdAt: now,
            modifiedAt: now,
            importedFrom: {
                type: 'testSuite',
                suiteId: testSuite.id,
                suiteName: testSuite.name
            }
        };

        this._performanceService.addSuite(suite);
        this._settingsManager.updatePerformanceSuites(this._performanceService.getSuites());
        return suite;
    }
}

/**
 * Export performance results to CSV
 */
export class ExportPerformanceResultsCommand implements ICommand {
    constructor(private readonly _performanceService: PerformanceService) { }

    async execute(message: any): Promise<string | null> {
        const runId = message.runId;
        const history = this._performanceService.getHistory();
        const run = history.find(r => r.id === runId);

        if (!run) {
            vscode.window.showErrorMessage('Performance run not found');
            return null;
        }

        // Generate CSV content
        const csvLines: string[] = [];

        // Summary header
        csvLines.push('# Performance Run Summary');
        csvLines.push(`Suite,${run.suiteName}`);
        csvLines.push(`Run ID,${run.id}`);
        csvLines.push(`Start Time,${new Date(run.startTime).toISOString()}`);
        csvLines.push(`End Time,${new Date(run.endTime).toISOString()}`);
        csvLines.push(`Duration (ms),${run.endTime - run.startTime}`);
        csvLines.push(`Status,${run.status}`);
        csvLines.push('');

        // Stats
        csvLines.push('# Statistics');
        csvLines.push(`Total Requests,${run.summary.totalRequests}`);
        csvLines.push(`Success Count,${run.summary.successCount}`);
        csvLines.push(`Failure Count,${run.summary.failureCount}`);
        csvLines.push(`Success Rate,${(run.summary.successRate * 100).toFixed(2)}%`);
        csvLines.push(`Avg Response Time (ms),${run.summary.avgResponseTime.toFixed(2)}`);
        csvLines.push(`Min Response Time (ms),${run.summary.minResponseTime}`);
        csvLines.push(`Max Response Time (ms),${run.summary.maxResponseTime}`);
        csvLines.push(`P50 (ms),${run.summary.p50.toFixed(2)}`);
        csvLines.push(`P95 (ms),${run.summary.p95.toFixed(2)}`);
        csvLines.push(`P99 (ms),${run.summary.p99.toFixed(2)}`);
        csvLines.push(`SLA Breaches,${run.summary.slaBreachCount}`);
        csvLines.push('');

        // Results header
        csvLines.push('# Individual Results');
        csvLines.push('Request Name,Iteration,Duration (ms),Status,Success,SLA Breached,Timestamp,Error');

        // Results data
        for (const result of run.results) {
            csvLines.push([
                this.escapeCsv(result.requestName),
                result.iteration.toString(),
                result.duration.toString(),
                result.status.toString(),
                result.success ? 'true' : 'false',
                result.slaBreached ? 'true' : 'false',
                new Date(result.timestamp).toISOString(),
                this.escapeCsv(result.error || '')
            ].join(','));
        }

        const csv = csvLines.join('\n');

        // Show save dialog
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`performance-${run.suiteName}-${Date.now()}.csv`),
            filters: { 'CSV Files': ['csv'] }
        });

        if (uri) {
            const fs = require('fs');
            fs.writeFileSync(uri.fsPath, csv, 'utf-8');
            vscode.window.showInformationMessage(`Exported to ${uri.fsPath}`);
            return uri.fsPath;
        }

        return null;
    }

    private escapeCsv(value: string): string {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }
}
