/**
 * Output formatters for CLI results
 */

import { PerformanceRun } from '../../models';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Table = require('cli-table3');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');

/**
 * Format run as JSON (default for AI agents)
 */
export function formatJson(run: PerformanceRun): string {
    return JSON.stringify({
        status: run.status,
        suiteId: run.suiteId,
        suiteName: run.suiteName,
        duration: run.endTime - run.startTime,
        summary: run.summary,
        results: run.results.map(r => ({
            requestName: r.requestName,
            iteration: r.iteration,
            duration: r.duration,
            status: r.status,
            success: r.success,
            slaBreached: r.slaBreached,
            error: r.error
        }))
    }, null, 2);
}

/**
 * Format run as table (human-readable)
 */
export function formatTable(run: PerformanceRun): string {
    const lines: string[] = [];

    // Summary table
    const summaryTable = new Table({
        head: [chalk.cyan('Metric'), chalk.cyan('Value')],
        style: { head: [], border: [] }
    });

    summaryTable.push(
        ['Suite', run.suiteName],
        ['Status', run.status === 'completed' ? chalk.green('✓ Completed') : chalk.red('✗ ' + run.status)],
        ['Duration', `${run.endTime - run.startTime}ms`],
        ['Total Requests', run.summary.totalRequests.toString()],
        ['Success Rate', `${(run.summary.successRate * 100).toFixed(1)}%`],
        ['Avg Response', `${run.summary.avgResponseTime.toFixed(1)}ms`],
        ['Min Response', `${run.summary.minResponseTime}ms`],
        ['Max Response', `${run.summary.maxResponseTime}ms`],
        ['P50', `${run.summary.p50.toFixed(1)}ms`],
        ['P95', `${run.summary.p95.toFixed(1)}ms`],
        ['P99', `${run.summary.p99.toFixed(1)}ms`],
        ['SLA Breaches', run.summary.slaBreachCount.toString()]
    );

    lines.push('\n' + chalk.bold('📊 Summary'));
    lines.push(summaryTable.toString());

    // Request breakdown
    if (run.results.length > 0) {
        const requestStats = new Map<string, { count: number; totalDuration: number; failures: number }>();

        for (const result of run.results) {
            const existing = requestStats.get(result.requestName) || { count: 0, totalDuration: 0, failures: 0 };
            existing.count++;
            existing.totalDuration += result.duration;
            if (!result.success) existing.failures++;
            requestStats.set(result.requestName, existing);
        }

        const requestTable = new Table({
            head: [chalk.cyan('Request'), chalk.cyan('Calls'), chalk.cyan('Avg (ms)'), chalk.cyan('Failures')],
            style: { head: [], border: [] }
        });

        for (const [name, stats] of requestStats) {
            requestTable.push([
                name,
                stats.count.toString(),
                (stats.totalDuration / stats.count).toFixed(1),
                stats.failures > 0 ? chalk.red(stats.failures.toString()) : chalk.green('0')
            ]);
        }

        lines.push('\n' + chalk.bold('📋 Request Breakdown'));
        lines.push(requestTable.toString());
    }

    return lines.join('\n');
}

/**
 * Format run as CSV
 */
export function formatCsv(run: PerformanceRun): string {
    const lines: string[] = [];

    // Header
    lines.push('request_name,iteration,duration_ms,status,success,sla_breached,error');

    // Data rows
    for (const result of run.results) {
        lines.push([
            escapeCsv(result.requestName),
            result.iteration,
            result.duration,
            result.status,
            result.success,
            result.slaBreached,
            escapeCsv(result.error || '')
        ].join(','));
    }

    return lines.join('\n');
}

function escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
