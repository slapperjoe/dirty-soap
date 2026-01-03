import { EventEmitter } from 'events';
import {
    PerformanceSuite,
    PerformanceRequest,
    PerformanceRun,
    PerformanceResult,
    PerformanceStats,
    SoapRequestExtractor
} from '../models';
import { SoapClient } from '../soapClient';
import * as xpath from 'xpath';
import { DOMParser } from '@xmldom/xmldom';

const MAX_HISTORY_PER_SUITE = 5;

export class PerformanceService extends EventEmitter {
    private suites: PerformanceSuite[] = [];
    private history: PerformanceRun[] = [];
    private soapClient: SoapClient;
    private isRunning = false;
    private shouldAbort = false;
    private logger: (msg: string) => void = console.log;

    constructor(soapClient: SoapClient) {
        super();
        this.soapClient = soapClient;
    }

    public setLogger(logger: (msg: string) => void) {
        this.logger = logger;
    }

    private log(msg: string) {
        this.logger(`[PerformanceService] ${msg}`);
        this.emit('log', msg);
    }

    // ========================================
    // Suite CRUD Operations
    // ========================================

    public getSuites(): PerformanceSuite[] {
        return this.suites;
    }

    public setSuites(suites: PerformanceSuite[]) {
        this.suites = suites;
    }

    public getSuite(id: string): PerformanceSuite | undefined {
        return this.suites.find(s => s.id === id);
    }

    public addSuite(suite: PerformanceSuite) {
        this.suites.push(suite);
        this.emit('suitesUpdated', this.suites);
    }

    public updateSuite(id: string, updates: Partial<PerformanceSuite>) {
        const idx = this.suites.findIndex(s => s.id === id);
        if (idx !== -1) {
            this.suites[idx] = { ...this.suites[idx], ...updates, modifiedAt: Date.now() };
            this.emit('suitesUpdated', this.suites);
        }
    }

    public deleteSuite(id: string) {
        this.suites = this.suites.filter(s => s.id !== id);
        this.history = this.history.filter(r => r.suiteId !== id);
        this.emit('suitesUpdated', this.suites);
    }

    // ========================================
    // History Management
    // ========================================

    public getHistory(): PerformanceRun[] {
        return this.history;
    }

    public setHistory(history: PerformanceRun[]) {
        this.history = history;
    }

    public getSuiteHistory(suiteId: string): PerformanceRun[] {
        return this.history.filter(r => r.suiteId === suiteId);
    }

    private addToHistory(run: PerformanceRun) {
        this.history.push(run);
        const suiteRuns = this.history.filter(r => r.suiteId === run.suiteId);
        if (suiteRuns.length > MAX_HISTORY_PER_SUITE) {
            const oldestToRemove = suiteRuns[0];
            this.history = this.history.filter(r => r.id !== oldestToRemove.id);
            this.emit('runExpired', oldestToRemove);
        }
        this.emit('historyUpdated', this.history);
    }

    // ========================================
    // Suite Execution
    // ========================================

    public isExecuting(): boolean {
        return this.isRunning;
    }

    public abort() {
        this.shouldAbort = true;
        this.log('Abort requested');
    }

    public async runSuite(
        suiteId: string,
        environment?: string,
        variables?: Record<string, string>
    ): Promise<PerformanceRun | null> {
        const suite = this.getSuite(suiteId);
        if (!suite) {
            this.log(`Suite not found: ${suiteId}`);
            return null;
        }

        if (this.isRunning) {
            this.log('Another run is already in progress');
            return null;
        }

        this.isRunning = true;
        this.shouldAbort = false;
        const runId = `run-${Date.now()}`;
        const startTime = Date.now();
        const results: PerformanceResult[] = [];
        const extractedVars: Record<string, string> = { ...variables };

        this.log(`Starting performance run: ${suite.name}`);
        this.emit('runStarted', { runId, suiteId, suiteName: suite.name });

        try {
            const totalIterations = suite.iterations + suite.warmupRuns;

            for (let iteration = 0; iteration < totalIterations; iteration++) {
                if (this.shouldAbort) {
                    this.log('Run aborted by user');
                    break;
                }

                const isWarmup = iteration < suite.warmupRuns;
                this.log(`Iteration ${iteration + 1}/${totalIterations}${isWarmup ? ' (warmup)' : ''}`);

                if (suite.concurrency <= 1) {
                    await this.executeSequential(suite, iteration, isWarmup, extractedVars, results);
                } else {
                    await this.executeParallel(suite, iteration, isWarmup, extractedVars, results, suite.concurrency);
                }

                this.emit('iterationComplete', { iteration, total: totalIterations });
            }
        } catch (error: any) {
            this.log(`Run failed: ${error.message}`);
        }

        const endTime = Date.now();
        const run: PerformanceRun = {
            id: runId,
            suiteId: suite.id,
            suiteName: suite.name,
            startTime,
            endTime,
            status: this.shouldAbort ? 'aborted' : 'completed',
            results,
            summary: this.calculateStats(results),
            environment
        };

        this.addToHistory(run);
        this.isRunning = false;
        this.emit('runCompleted', run);
        this.log(`Run completed: ${results.length} results, avg ${run.summary.avgResponseTime.toFixed(0)}ms`);

        return run;
    }

    private async executeSequential(
        suite: PerformanceSuite,
        iteration: number,
        isWarmup: boolean,
        variables: Record<string, string>,
        results: PerformanceResult[]
    ) {
        const sortedRequests = [...suite.requests].sort((a, b) => a.order - b.order);

        for (const req of sortedRequests) {
            if (this.shouldAbort) break;

            const result = await this.executeSingleRequest(req, iteration, variables);

            if (!isWarmup) {
                results.push(result);
            }

            if (result.extractedValues) {
                Object.assign(variables, result.extractedValues);
            }

            if (suite.delayBetweenRequests > 0) {
                await this.delay(suite.delayBetweenRequests);
            }
        }
    }

    private async executeParallel(
        suite: PerformanceSuite,
        iteration: number,
        isWarmup: boolean,
        variables: Record<string, string>,
        results: PerformanceResult[],
        concurrency: number
    ) {
        const sortedRequests = [...suite.requests].sort((a, b) => a.order - b.order);

        for (let i = 0; i < sortedRequests.length; i += concurrency) {
            if (this.shouldAbort) break;

            const chunk = sortedRequests.slice(i, i + concurrency);
            const chunkResults = await Promise.all(
                chunk.map(req => this.executeSingleRequest(req, iteration, { ...variables }))
            );

            if (!isWarmup) {
                results.push(...chunkResults);
            }

            for (const result of chunkResults) {
                if (result.extractedValues) {
                    for (const [key, value] of Object.entries(result.extractedValues)) {
                        if (!variables[key]) {
                            variables[key] = value;
                        }
                    }
                }
            }

            if (suite.delayBetweenRequests > 0) {
                await this.delay(suite.delayBetweenRequests);
            }
        }
    }

    private async executeSingleRequest(
        req: PerformanceRequest,
        iteration: number,
        variables: Record<string, string>
    ): Promise<PerformanceResult> {
        const startTime = performance.now();
        let status = 0;
        let success = false;
        let error: string | undefined;
        let responseBody = '';
        const extractedValues: Record<string, string> = {};

        try {
            let body = req.requestBody;
            for (const [key, value] of Object.entries(variables)) {
                body = body.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), value);
            }

            const response = await this.soapClient.executeRequest(
                req.endpoint,
                req.name,
                body,
                req.headers
            );

            status = response.success ? 200 : 500;
            success = response.success;
            responseBody = response.rawResponse || '';

            for (const extractor of req.extractors) {
                try {
                    const value = this.extractValue(responseBody, extractor);
                    if (value) {
                        extractedValues[extractor.variable] = value;
                    }
                } catch (e: any) {
                    this.log(`Extractor failed: ${extractor.variable} - ${e.message}`);
                }
            }

        } catch (e: any) {
            error = e.message;
            success = false;
        }

        const duration = performance.now() - startTime;

        return {
            requestId: req.id,
            requestName: req.name,
            iteration,
            duration,
            status,
            success,
            slaBreached: req.slaThreshold ? duration > req.slaThreshold : false,
            error,
            extractedValues: Object.keys(extractedValues).length > 0 ? extractedValues : undefined,
            timestamp: Date.now()
        };
    }

    private extractValue(responseBody: string, extractor: SoapRequestExtractor): string | null {
        if (extractor.type === 'XPath') {
            try {
                const doc = new DOMParser().parseFromString(responseBody, 'text/xml');
                const result = xpath.select(extractor.path, doc, true);
                if (result) {
                    if (typeof result === 'string') return result;
                    if (typeof result === 'object' && result !== null) {
                        if ('textContent' in result) return (result as any).textContent || null;
                        if ('nodeValue' in result) return (result as any).nodeValue || null;
                    }
                }
            } catch {
                return null;
            }
        }
        return null;
    }

    // ========================================
    // Statistics Calculation
    // ========================================

    private calculateStats(results: PerformanceResult[]): PerformanceStats {
        if (results.length === 0) {
            return {
                totalRequests: 0,
                successCount: 0,
                failureCount: 0,
                successRate: 0,
                avgResponseTime: 0,
                minResponseTime: 0,
                maxResponseTime: 0,
                p50: 0,
                p95: 0,
                p99: 0,
                slaBreachCount: 0,
                totalDuration: 0
            };
        }

        const durations = results.map(r => r.duration).sort((a, b) => a - b);
        const successCount = results.filter(r => r.success).length;
        const slaBreachCount = results.filter(r => r.slaBreached).length;

        return {
            totalRequests: results.length,
            successCount,
            failureCount: results.length - successCount,
            successRate: (successCount / results.length) * 100,
            avgResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
            minResponseTime: Math.min(...durations),
            maxResponseTime: Math.max(...durations),
            p50: this.percentile(durations, 50),
            p95: this.percentile(durations, 95),
            p99: this.percentile(durations, 99),
            slaBreachCount,
            totalDuration: results[results.length - 1]?.timestamp - results[0]?.timestamp || 0
        };
    }

    private percentile(arr: number[], p: number): number {
        if (arr.length === 0) return 0;
        const index = (p / 100) * (arr.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        if (lower === upper) return arr[lower];
        return arr[lower] * (upper - index) + arr[upper] * (index - lower);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
