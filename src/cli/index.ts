#!/usr/bin/env node
/**
 * APInox CLI
 * 
 * Standalone command-line interface for:
 * - Running performance suites locally
 * - Connecting as a distributed worker
 * - Acting as a headless coordinator
 * - Parsing WSDLs and sending requests (for AI/agent integration)
 */

import { Command } from 'commander';
import { runSuiteCommand } from './commands/run-suite';
import { workerCommand } from './commands/worker';
import { coordinatorCommand } from './commands/coordinator';
import { parseWsdlCommand } from './commands/parse-wsdl';
import { sendRequestCommand } from './commands/send-request';

const program = new Command();

program
    .name('apinox')
    .description('SOAP API testing and performance analysis CLI')
    .version('0.8.1');

// Run a performance suite locally
program
    .command('run-suite <suite-file>')
    .description('Run a performance suite locally')
    .option('-i, --iterations <n>', 'Override iteration count', parseInt)
    .option('-c, --concurrency <n>', 'Override concurrency level', parseInt)
    .option('-f, --format <type>', 'Output format: json, table, csv', 'json')
    .option('-o, --output <file>', 'Write results to file')
    .option('-q, --quiet', 'Suppress progress, output only final result')
    .action(runSuiteCommand);

// Connect as a distributed worker
program
    .command('worker')
    .description('Connect to a coordinator as a distributed worker')
    .requiredOption('--connect <url>', 'WebSocket URL of coordinator (ws://host:port)')
    .option('--name <name>', 'Worker identifier', process.env.HOSTNAME || 'worker')
    .option('--max-concurrent <n>', 'Max concurrent requests', parseInt, 10)
    .action(workerCommand);

// Run as headless coordinator
program
    .command('coordinator')
    .description('Run as headless coordinator for distributed workers')
    .requiredOption('--suite <file>', 'Suite file to run')
    .option('-p, --port <port>', 'WebSocket port', parseInt, 8080)
    .option('-w, --workers <n>', 'Wait for N workers before starting', parseInt, 1)
    .option('-t, --timeout <ms>', 'Worker connection timeout', parseInt, 30000)
    .option('-f, --format <type>', 'Output format: json, table', 'json')
    .action(coordinatorCommand);

// Parse WSDL (useful for AI agents)
program
    .command('parse-wsdl <url>')
    .description('Parse WSDL and output schema')
    .option('-f, --format <type>', 'Output format: json, yaml', 'json')
    .option('-o, --output <file>', 'Write to file')
    .action(parseWsdlCommand);

// Send a single request (useful for AI agents)
program
    .command('send-request')
    .description('Send a single SOAP request')
    .requiredOption('-e, --endpoint <url>', 'SOAP endpoint URL')
    .option('-a, --action <action>', 'SOAPAction header')
    .option('-b, --body <xml>', 'Request body (inline XML or @file.xml)')
    .option('-H, --header <k=v>', 'Additional headers', (val, acc: string[]) => [...acc, val], [])
    .option('-f, --format <type>', 'Output format: json, xml', 'json')
    .action(sendRequestCommand);

program.parse();
