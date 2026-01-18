/**
 * APInox Sidecar - Node.js backend for Tauri desktop application
 * 
 * This runs as a separate process spawned by Tauri.
 * It hosts all the existing Node.js services and communicates
 * via localhost HTTP (JSON-RPC style).
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { createCommandRouter } from './router';
import { ServiceContainer } from './services';

const app = express();

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));

// Initialize services
const services = new ServiceContainer();

// Create command router
const commandRouter = createCommandRouter(services);

// Health check
app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '0.9.0' });
});

// Main command endpoint
app.post('/command', async (req: Request, res: Response) => {
    const { command, payload } = req.body;

    if (!command) {
        return res.status(400).json({
            success: false,
            error: 'Missing command'
        });
    }

    try {
        const result = await commandRouter.handle(command, payload);
        res.json({ success: true, data: result });
    } catch (error: any) {
        console.error(`[Sidecar] Command error: ${command}`, error.message);
        res.json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Start server on random available port
const server = app.listen(0, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' ? address?.port : 0;

    // Output port for Tauri to read from stdout
    console.log(`SIDECAR_PORT:${port}`);
    console.log(`[Sidecar] APInox sidecar running on http://127.0.0.1:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Sidecar] Shutting down...');
    services.dispose();
    server.close(() => {
        console.log('[Sidecar] Goodbye!');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('[Sidecar] Interrupted, shutting down...');
    services.dispose();
    server.close(() => process.exit(0));
});
