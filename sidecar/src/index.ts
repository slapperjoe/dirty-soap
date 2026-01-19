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

// Log buffer for diagnostics
const logBuffer: Array<{ timestamp: string; level: string; message: string }> = [];
const MAX_LOGS = 500;

function addLog(level: string, ...args: any[]) {
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    
    logBuffer.push({
        timestamp: new Date().toISOString(),
        level,
        message
    });
    
    if (logBuffer.length > MAX_LOGS) {
        logBuffer.shift();
    }
}

// Override console methods to capture logs
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
    addLog('info', ...args);
    originalConsoleLog(...args);
};

console.error = (...args: any[]) => {
    addLog('error', ...args);
    originalConsoleError(...args);
};

console.warn = (...args: any[]) => {
    addLog('warn', ...args);
    originalConsoleWarn(...args);
};

// Parse command-line arguments for config dir
const args = process.argv.slice(2);
const configDirIndex = args.indexOf('--config-dir');
if (configDirIndex !== -1 && args[configDirIndex + 1]) {
    const configDir = args[configDirIndex + 1];
    process.env.APINOX_CONFIG_DIR = configDir;
    console.log(`[Sidecar] Config dir from CLI arg: ${configDir}`);
} else {
    console.log('[Sidecar] No --config-dir argument provided');
}

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

// Debug endpoint - minimal diagnostic info
app.get('/debug', (_req: Request, res: Response) => {
    res.json({
        message: 'Sidecar is running',
        configDir: services.settingsManager?.getConfigDir() || 'error'
    });
});

// Logs endpoint - show captured console logs
app.get('/logs', (_req: Request, res: Response) => {
    res.json({
        logs: logBuffer,
        count: logBuffer.length,
        maxSize: MAX_LOGS
    });
});

// Clear logs endpoint
app.post('/logs/clear', (_req: Request, res: Response) => {
    logBuffer.length = 0;
    res.json({ success: true, message: 'Logs cleared' });
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
