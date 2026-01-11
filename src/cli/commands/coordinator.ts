/**
 * coordinator command
 * 
 * Run as headless coordinator for distributed workers.
 */

import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');
import * as WebSocket from 'ws';
import { PerformanceSuite, PerformanceResult, PerformanceStats } from '../../../shared/src/models';
import { formatJson, formatTable } from '../output/formatters';

interface CoordinatorOptions {
    suite: string;
    port: number;
    workers: number;
    timeout: number;
    format: 'json' | 'table';
}

interface ConnectedWorker {
    id: string;
    ws: WebSocket;
    maxConcurrent: number;
    assignedWork?: { start: number; end: number };
}

export async function coordinatorCommand(options: CoordinatorOptions): Promise<void> {
    const { suite: suiteFile, port, workers: workerCount, timeout, format } = options;

    // Load suite
    const suitePath = path.resolve(suiteFile);
    if (!fs.existsSync(suitePath)) {
        console.error(chalk.red(`Suite file not found: ${suitePath}`));
        process.exit(1);
    }

    const suite: PerformanceSuite = JSON.parse(fs.readFileSync(suitePath, 'utf-8'));

    console.log(chalk.cyan(`\n🎯 APInox Coordinator`));
    console.log(chalk.gray(`   Suite: ${suite.name}`));
    console.log(chalk.gray(`   Iterations: ${suite.iterations}`));
    console.log(chalk.gray(`   Waiting for ${workerCount} workers...`));

    const connectedWorkers: Map<string, ConnectedWorker> = new Map();
    const results: PerformanceResult[] = [];
    let startTime = 0;

    // Start WebSocket server
    const wss = new WebSocket.Server({ port });

    console.log(chalk.green(`   ✓ WebSocket server listening on :${port}`));

    wss.on('connection', (ws: WebSocket) => {
        ws.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case 'register':
                        const workerId = message.workerId;
                        connectedWorkers.set(workerId, {
                            id: workerId,
                            ws,
                            maxConcurrent: message.payload?.maxConcurrent || 10
                        });
                        console.log(chalk.green(`   ✓ Worker "${workerId}" connected (${connectedWorkers.size}/${workerCount})`));

                        ws.send(JSON.stringify({ type: 'ack' }));

                        // Check if we have enough workers
                        if (connectedWorkers.size >= workerCount) {
                            startDistributedRun(suite, connectedWorkers, results);
                            startTime = Date.now();
                        }
                        break;

                    case 'result':
                        results.push(message.payload);
                        break;

                    case 'heartbeat':
                        // Acknowledge heartbeat
                        ws.send(JSON.stringify({ type: 'ack' }));
                        break;
                }
            } catch (e: any) {
                console.error(chalk.red(`Error processing message: ${e.message}`));
            }
        });

        ws.on('close', () => {
            // Find and remove worker
            for (const [id, worker] of connectedWorkers) {
                if (worker.ws === ws) {
                    console.log(chalk.yellow(`   ⚠ Worker "${id}" disconnected`));
                    connectedWorkers.delete(id);
                    break;
                }
            }
        });
    });

    // Timeout for worker connections
    setTimeout(() => {
        if (connectedWorkers.size < workerCount) {
            console.error(chalk.red(`\n❌ Timeout: Only ${connectedWorkers.size}/${workerCount} workers connected`));
            wss.close();
            process.exit(1);
        }
    }, timeout);

    // Wait for completion (simple polling approach)
    const expectedResults = suite.iterations * suite.requests.length;

    const checkInterval = setInterval(() => {
        if (results.length >= expectedResults) {
            clearInterval(checkInterval);

            const endTime = Date.now();
            const summary = calculateStats(results);

            console.log(chalk.green(`\n\n✅ Distributed run completed`));
            console.log(chalk.gray(`   Total time: ${endTime - startTime}ms`));
            console.log(chalk.gray(`   Workers: ${connectedWorkers.size}`));

            // Format and output results
            const run = {
                id: `run-${Date.now()}`,
                suiteId: suite.id,
                suiteName: suite.name,
                startTime,
                endTime,
                status: 'completed' as const,
                results,
                summary
            };

            const output = format === 'table' ? formatTable(run) : formatJson(run);
            console.log(output);

            // Cleanup
            for (const worker of connectedWorkers.values()) {
                worker.ws.send(JSON.stringify({ type: 'stop' }));
                worker.ws.close();
            }
            wss.close();
            process.exit(0);
        }
    }, 500);

    // Handle SIGINT
    process.on('SIGINT', () => {
        console.log(chalk.yellow(`\n⚠ Shutting down coordinator...`));
        for (const worker of connectedWorkers.values()) {
            worker.ws.send(JSON.stringify({ type: 'stop' }));
            worker.ws.close();
        }
        wss.close();
        process.exit(0);
    });
}

function startDistributedRun(
    suite: PerformanceSuite,
    workers: Map<string, ConnectedWorker>,
    _results: PerformanceResult[]
): void {
    console.log(chalk.cyan(`\n🚀 Starting distributed run...`));

    const workerArray = Array.from(workers.values());
    const totalIterations = suite.iterations;
    const iterationsPerWorker = Math.ceil(totalIterations / workerArray.length);

    let currentIteration = 0;

    for (const worker of workerArray) {
        const start = currentIteration;
        const end = Math.min(currentIteration + iterationsPerWorker - 1, totalIterations - 1);

        worker.assignedWork = { start, end };

        console.log(chalk.gray(`   Assigning iterations ${start}-${end} to "${worker.id}"`));

        worker.ws.send(JSON.stringify({
            type: 'work',
            payload: {
                suiteId: suite.id,
                suiteName: suite.name,
                requests: suite.requests,
                iterations: { start, end },
                config: {
                    delayBetweenRequests: suite.delayBetweenRequests,
                    concurrency: suite.concurrency
                }
            }
        }));

        currentIteration = end + 1;
    }
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
