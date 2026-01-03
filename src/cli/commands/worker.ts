/**
 * worker command
 * 
 * Connects to a coordinator as a distributed worker.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');
import * as WebSocket from 'ws';

interface WorkerOptions {
    connect: string;
    name: string;
    maxConcurrent: number;
}

export async function workerCommand(options: WorkerOptions): Promise<void> {
    const { connect, name, maxConcurrent } = options;

    console.log(chalk.cyan(`\n🔧 Dirty SOAP Worker: ${name}`));
    console.log(chalk.gray(`   Connecting to: ${connect}`));
    console.log(chalk.gray(`   Max concurrent: ${maxConcurrent}`));

    try {
        const ws = new WebSocket(connect);

        ws.on('open', () => {
            console.log(chalk.green(`✓ Connected to coordinator`));

            // Register with coordinator
            ws.send(JSON.stringify({
                type: 'register',
                workerId: name,
                timestamp: Date.now(),
                payload: {
                    maxConcurrent,
                    platform: process.platform,
                    nodeVersion: process.version
                }
            }));

            console.log(chalk.gray(`   Waiting for work...`));
        });

        ws.on('message', async (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());

                switch (message.type) {
                    case 'work':
                        console.log(chalk.yellow(`\n📦 Received work: iterations ${message.payload.iterations.start}-${message.payload.iterations.end}`));
                        await executeWork(ws, name, message.payload);
                        break;

                    case 'stop':
                        console.log(chalk.red(`\n🛑 Stop signal received`));
                        ws.close();
                        process.exit(0);
                        break;

                    case 'ack':
                        console.log(chalk.gray(`   Coordinator acknowledged`));
                        break;

                    default:
                        console.log(chalk.gray(`   Unknown message type: ${message.type}`));
                }
            } catch (e: any) {
                console.error(chalk.red(`Error processing message: ${e.message}`));
            }
        });

        ws.on('close', () => {
            console.log(chalk.yellow(`\n⚠ Disconnected from coordinator`));
            process.exit(0);
        });

        ws.on('error', (error: Error) => {
            console.error(chalk.red(`\n❌ WebSocket error: ${error.message}`));
            process.exit(1);
        });

        // Keep process alive
        process.on('SIGINT', () => {
            console.log(chalk.yellow(`\n⚠ Shutting down worker...`));
            ws.close();
            process.exit(0);
        });

    } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
    }
}

async function executeWork(ws: WebSocket, workerId: string, work: any): Promise<void> {
    const axios = (await import('axios')).default;
    const { requests, iterations, config } = work;

    for (let i = iterations.start; i <= iterations.end; i++) {
        console.log(chalk.gray(`   Iteration ${i}...`));

        for (const request of requests) {
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
                    validateStatus: () => true
                });

                status = response.status;
                success = status >= 200 && status < 300;
            } catch (e: any) {
                error = e.message;
            }

            const duration = Date.now() - startTime;

            // Stream result back to coordinator
            ws.send(JSON.stringify({
                type: 'result',
                workerId,
                timestamp: Date.now(),
                payload: {
                    requestId: request.id,
                    requestName: request.name,
                    iteration: i,
                    duration,
                    status,
                    success,
                    slaBreached: request.slaThreshold ? duration > request.slaThreshold : false,
                    error
                }
            }));

            // Delay between requests
            if (config.delayBetweenRequests > 0) {
                await new Promise(r => setTimeout(r, config.delayBetweenRequests));
            }
        }
    }

    console.log(chalk.green(`   ✓ Work completed`));
}
