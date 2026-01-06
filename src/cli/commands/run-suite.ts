/**
 * run-suite command
 * 
 * Runs a performance suite locally and outputs results.
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');
import { PerformanceSuite, PerformanceRun, PerformanceResult, PerformanceStats } from '@shared/models';
import { formatJson, formatTable, formatCsv } from '../output/formatters';

// Minimal SoapClient for CLI (no VS Code dependencies)
import axios from 'axios';

interface RunSuiteOptions {
    iterations?: number;
    concurrency?: number;
    format: 'json' | 'table' | 'csv';
    output?: string;
    quiet?: boolean;
}

export async function runSuiteCommand(suiteFile: string, options: RunSuiteOptions): Promise<void> {
    try {
        // Load suite from file
        const suitePath = path.resolve(suiteFile);
        if (!fs.existsSync(suitePath)) {
            console.error(chalk.red(`Suite file not found: ${suitePath}`));
            process.exit(1);
        }

        const suiteContent = fs.readFileSync(suitePath, 'utf-8');
        const suite: PerformanceSuite = JSON.parse(suiteContent);

        // Override options if provided
        const iterations = options.iterations ?? suite.iterations;
        const concurrency = options.concurrency ?? suite.concurrency;

        if (!options.quiet) {
            console.error(chalk.cyan(`\n📊 Running suite: ${suite.name}`));
            console.error(chalk.gray(`   Iterations: ${iterations}, Concurrency: ${concurrency}`));
            console.error(chalk.gray(`   Requests: ${suite.requests.length}`));
            console.error('');
        }

        // Execute suite
        const startTime = Date.now();
        const results: PerformanceResult[] = [];
        const sortedRequests = [...suite.requests].sort((a, b) => a.order - b.order);

        for (let iteration = 0; iteration < iterations; iteration++) {
            if (!options.quiet) {
                process.stderr.write(chalk.gray(`\r   Iteration ${iteration + 1}/${iterations}...`));
            }

            // Execute requests in sequence (or parallel based on concurrency)
            if (concurrency <= 1) {
                // Sequential
                for (const request of sortedRequests) {
                    const result = await executeRequest(request, iteration);
                    results.push(result);
                }
            } else {
                // Parallel with concurrency limit
                const chunks = chunkArray(sortedRequests, concurrency);
                for (const chunk of chunks) {
                    const chunkResults = await Promise.all(
                        chunk.map(req => executeRequest(req, iteration))
                    );
                    results.push(...chunkResults);
                }
            }

            // Delay between iterations
            if (iteration < iterations - 1 && suite.delayBetweenRequests > 0) {
                await sleep(suite.delayBetweenRequests);
            }
        }

        const endTime = Date.now();

        if (!options.quiet) {
            console.error(chalk.green(`\n\n✅ Suite completed in ${endTime - startTime}ms`));
        }

        // Calculate stats
        const summary = calculateStats(results);

        // Build run result
        const run: PerformanceRun = {
            id: `run-${Date.now()}`,
            suiteId: suite.id,
            suiteName: suite.name,
            startTime,
            endTime,
            status: 'completed',
            results,
            summary
        };

        // Format output
        let output: string;
        switch (options.format) {
            case 'table':
                output = formatTable(run);
                break;
            case 'csv':
                output = formatCsv(run);
                break;
            case 'json':
            default:
                output = formatJson(run);
                break;
        }

        // Write output
        if (options.output) {
            fs.writeFileSync(options.output, output, 'utf-8');
            if (!options.quiet) {
                console.error(chalk.gray(`   Results written to: ${options.output}`));
            }
        } else {
            console.log(output);
        }

    } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
    }
}

async function executeRequest(request: any, iteration: number): Promise<PerformanceResult> {
    const startTime = Date.now();
    let status = 0;
    let success = false;
    let error: string | undefined;

    try {
        const response = await axios.post(request.endpoint, request.requestBody, {
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': request.soapAction || '',
                ...request.headers
            },
            timeout: 30000,
            validateStatus: () => true // Accept any status
        });

        status = response.status;
        success = status >= 200 && status < 300;
    } catch (e: any) {
        error = e.message;
        success = false;
    }

    const duration = Date.now() - startTime;

    return {
        requestId: request.id,
        requestName: request.name,
        iteration,
        duration,
        status,
        success,
        slaBreached: request.slaThreshold ? duration > request.slaThreshold : false,
        error,
        timestamp: startTime
    };
}

function calculateStats(results: PerformanceResult[]): PerformanceStats {
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

    const percentile = (arr: number[], p: number) => {
        const idx = Math.ceil((p / 100) * arr.length) - 1;
        return arr[Math.max(0, idx)];
    };

    return {
        totalRequests: results.length,
        successCount,
        failureCount: results.length - successCount,
        successRate: successCount / results.length,
        avgResponseTime: durations.reduce((a, b) => a + b, 0) / durations.length,
        minResponseTime: durations[0],
        maxResponseTime: durations[durations.length - 1],
        p50: percentile(durations, 50),
        p95: percentile(durations, 95),
        p99: percentile(durations, 99),
        slaBreachCount,
        totalDuration: durations.reduce((a, b) => a + b, 0)
    };
}

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
