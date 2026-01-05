/**
 * CoordinatorService
 * 
 * Manages the WebSocket server for distributed performance testing.
 * Workers connect to this coordinator to receive work assignments.
 */

import { EventEmitter } from 'events';
import * as WebSocket from 'ws';
import { DistributedWorker, CoordinatorStatus } from '../models';

export class CoordinatorService extends EventEmitter {
    private wss: WebSocket.Server | null = null;
    private workers: Map<string, { worker: DistributedWorker; ws: WebSocket }> = new Map();
    private port = 8765;
    private expectedWorkers = 1;

    constructor() {
        super();
    }

    /**
     * Start the coordinator WebSocket server
     */
    public start(port = 8765, expectedWorkers = 1): void {
        if (this.wss) {
            this.emit('log', 'Coordinator already running');
            return;
        }

        this.port = port;
        this.expectedWorkers = expectedWorkers;

        try {
            this.wss = new WebSocket.Server({ port });
            this.emit('log', `Coordinator started on port ${port}`);

            this.wss.on('connection', (ws: WebSocket) => {
                this.handleConnection(ws);
            });

            this.wss.on('error', (error: Error) => {
                this.emit('log', `Coordinator error: ${error.message}`);
                this.emit('error', error);
            });

            this.emitStatus();
        } catch (error: any) {
            this.emit('log', `Failed to start coordinator: ${error.message}`);
            this.emit('error', error);
        }
    }

    /**
     * Stop the coordinator server
     */
    public stop(): void {
        if (!this.wss) {
            return;
        }

        // Notify all workers to stop
        for (const { ws } of this.workers.values()) {
            try {
                ws.send(JSON.stringify({ type: 'stop' }));
                ws.close();
            } catch {
                // Ignore errors on close
            }
        }

        this.workers.clear();
        this.wss.close();
        this.wss = null;
        this.emit('log', 'Coordinator stopped');
        this.emitStatus();
    }

    /**
     * Check if coordinator is running
     */
    public isRunning(): boolean {
        return this.wss !== null;
    }

    /**
     * Get current status
     */
    public getStatus(): CoordinatorStatus {
        return {
            running: this.isRunning(),
            port: this.port,
            workers: Array.from(this.workers.values()).map(w => w.worker),
            expectedWorkers: this.expectedWorkers
        };
    }

    /**
     * Get list of connected workers
     */
    public getWorkers(): DistributedWorker[] {
        return Array.from(this.workers.values()).map(w => w.worker);
    }

    /**
     * Handle new WebSocket connection
     */
    private handleConnection(ws: WebSocket): void {
        ws.on('message', (data: Buffer) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(ws, message);
            } catch (e: any) {
                this.emit('log', `Error parsing message: ${e.message}`);
            }
        });

        ws.on('close', () => {
            this.handleDisconnect(ws);
        });

        ws.on('error', (error: Error) => {
            this.emit('log', `Worker WebSocket error: ${error.message}`);
        });
    }

    /**
     * Handle message from worker
     */
    private handleMessage(ws: WebSocket, message: any): void {
        switch (message.type) {
            case 'register':
                this.registerWorker(ws, message);
                break;

            case 'heartbeat':
                this.handleHeartbeat(message.workerId);
                ws.send(JSON.stringify({ type: 'ack' }));
                break;

            case 'result':
                this.handleResult(message.workerId, message.payload);
                break;

            case 'workComplete':
                this.handleWorkComplete(message.workerId);
                break;
        }
    }

    /**
     * Register a new worker
     */
    private registerWorker(ws: WebSocket, message: any): void {
        const workerId = message.workerId;
        const payload = message.payload || {};

        const worker: DistributedWorker = {
            id: workerId,
            status: 'connected',
            maxConcurrent: payload.maxConcurrent || 10,
            platform: payload.platform,
            nodeVersion: payload.nodeVersion,
            connectedAt: Date.now(),
            lastHeartbeat: Date.now()
        };

        this.workers.set(workerId, { worker, ws });
        this.emit('log', `Worker "${workerId}" registered (${this.workers.size}/${this.expectedWorkers})`);

        // Acknowledge registration
        ws.send(JSON.stringify({ type: 'ack' }));

        this.emitStatus();
        this.emit('workerRegistered', worker);

        // Check if we have enough workers
        if (this.workers.size >= this.expectedWorkers) {
            this.emit('workersReady');
        }
    }

    /**
     * Handle worker heartbeat
     */
    private handleHeartbeat(workerId: string): void {
        const entry = this.workers.get(workerId);
        if (entry) {
            entry.worker.lastHeartbeat = Date.now();
        }
    }

    /**
     * Handle result from worker
     */
    private handleResult(workerId: string, result: any): void {
        this.emit('result', { workerId, result });
    }

    /**
     * Handle work complete notification
     */
    private handleWorkComplete(workerId: string): void {
        const entry = this.workers.get(workerId);
        if (entry) {
            entry.worker.status = 'idle';
            this.emitStatus();
        }
        this.emit('workComplete', workerId);
    }

    /**
     * Handle worker disconnect
     */
    private handleDisconnect(ws: WebSocket): void {
        for (const [id, entry] of this.workers) {
            if (entry.ws === ws) {
                entry.worker.status = 'disconnected';
                this.emit('log', `Worker "${id}" disconnected`);
                this.workers.delete(id);
                this.emitStatus();
                this.emit('workerDisconnected', id);
                break;
            }
        }
    }

    /**
     * Emit current status to listeners
     */
    private emitStatus(): void {
        this.emit('statusUpdate', this.getStatus());
    }

    /**
     * Send work to all connected workers (for distributed run)
     */
    public distributeWork(work: any): void {
        const workerArray = Array.from(this.workers.values());
        const totalIterations = work.iterations || 1;
        const iterationsPerWorker = Math.ceil(totalIterations / workerArray.length);

        let currentIteration = 0;

        for (const { worker, ws } of workerArray) {
            const start = currentIteration;
            const end = Math.min(currentIteration + iterationsPerWorker - 1, totalIterations - 1);

            worker.status = 'working';
            worker.assignedIterations = { start, end };

            ws.send(JSON.stringify({
                type: 'work',
                payload: {
                    ...work,
                    iterations: { start, end }
                }
            }));

            currentIteration = end + 1;
        }

        this.emitStatus();
    }
}
