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
 * Quick pick to select an operation and add to performance suite
 */
export class PickOperationForPerformanceCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _loadedProjects: any[]
    ) { }

    async execute(message: any): Promise<void> {
        const items: vscode.QuickPickItem[] = [];

        for (const project of this._loadedProjects) {
            for (const iface of project.interfaces) {
                for (const op of iface.operations) {
                    items.push({
                        label: op.name,
                        description: `${project.name} - ${iface.name}`,
                        detail: op.soapAction,
                        // @ts-ignore
                        operation: op,
                        suiteId: message.suiteId
                    });
                }
            }
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select an operation to add to the performance suite'
        });

        if (selected) {
            this._panel.webview.postMessage({
                type: 'addOperationToPerformance',
                suiteId: (selected as any).suiteId,
                operation: (selected as any).operation
            });
        }
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
        this._settingsManager.updatePerformanceHistory(this._performanceService.getHistory());
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
 * Get performance history
 */
export class GetPerformanceHistoryCommand implements ICommand {
    constructor(private readonly _performanceService: PerformanceService) { }

    async execute(_message: any): Promise<any[]> {
        return this._performanceService.getHistory();
    }
}

/**
 * Export performance results to CSV/JSON
 */
export class ExportPerformanceResultsCommand implements ICommand {
    constructor(private readonly _performanceService: PerformanceService) { }

    async execute(message: any): Promise<void> {
        const results = message.results;
        const format = message.format || 'json';

        const uri = await vscode.window.showSaveDialog({
            filters: format === 'csv' ? { 'CSV': ['csv'] } : { 'JSON': ['json'] },
            defaultUri: vscode.Uri.file(`performance-results.${format}`)
        });

        if (uri) {
            let content = '';
            if (format === 'csv') {
                const headers = ['Request', 'Method', 'Status', 'Duration (ms)', 'SLA (ms)', 'Timestamp'];
                const rows = results.map((r: any) => [
                    r.requestName,
                    r.method,
                    r.status,
                    r.duration,
                    r.slaThreshold || 'N/A',
                    new Date(r.timestamp).toISOString()
                ]);
                content = [headers, ...rows].map(row => row.join(',')).join('\n');
            } else {
                content = JSON.stringify(results, null, 2);
            }

            await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from(content)));
            vscode.window.showInformationMessage(`Results exported to ${uri.fsPath}`);
        }
    }
}

/**
 * Import a TestSuite as a PerformanceSuite
 */
export class ImportTestSuiteToPerformanceCommand implements ICommand {
    constructor(
        private readonly _performanceService: PerformanceService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<PerformanceSuite | null> {
        const testSuite = message.testSuite;
        if (!testSuite) return null;

        const now = Date.now();

        // Convert test cases to performance requests
        const requests: PerformanceRequest[] = [];
        let order = 0;
        for (const testCase of testSuite.testCases) {
            if (!testCase.steps) continue;
            for (const step of testCase.steps) {
                if (step.type === 'request' && step.config.request) {
                    requests.push({
                        id: `perf-req-${now}-${order}`,
                        name: step.name || `Step ${order + 1}`,
                        endpoint: step.config.request.endpoint || testSuite.endpoint || '',
                        method: step.config.request.method || 'POST',
                        soapAction: step.config.request.soapAction,
                        requestBody: step.config.request.request || '',
                        headers: step.config.request.headers || {},
                        extractors: (step.config.request.extractors || []) as SoapRequestExtractor[],
                        slaThreshold: undefined,
                        order: order++
                    });
                }
            }
        }

        const suite: PerformanceSuite = {
            id: `perf-suite-${now}`,
            name: `Performance: ${testSuite.name || 'Test Suite'}`,
            description: `Imported from Test Suite ${testSuite.name}`,
            requests,
            iterations: 10,
            delayBetweenRequests: 0,
            warmupRuns: 1,
            concurrency: 1,
            createdAt: now,
            modifiedAt: now
        };

        this._performanceService.addSuite(suite);
        this._settingsManager.updatePerformanceSuites(this._performanceService.getSuites());
        return suite;
    }
}
