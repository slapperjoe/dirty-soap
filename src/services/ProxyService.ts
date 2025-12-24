import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios, { AxiosRequestConfig, Method } from 'axios';
// import * as vscode from 'vscode'; // Removed
import { EventEmitter } from 'events';
import * as selfsigned from 'selfsigned';

// Mock VSCode
const vscode = {
    window: {
        showErrorMessage: (msg: string) => console.error(`[VSCode Error] ${msg}`),
        showInformationMessage: (msg: string) => console.log(`[VSCode Info] ${msg}`)
    }
};

export interface ProxyConfig {
    port: number;
    targetUrl: string;
}

export interface ProxyEvent {
    id: string;
    timestamp: number;
    timestampLabel: string;
    method: string;
    url: string;
    requestHeaders: Record<string, any>;
    requestBody: string;
    status?: number;
    responseHeaders?: Record<string, any>;
    responseBody?: string;
    duration?: number;
    success?: boolean;
    error?: string;
}

export class ProxyService extends EventEmitter {
    private server: http.Server | https.Server | null = null;
    private config: ProxyConfig;
    private isRunning: boolean = false;
    private certPath: string | null = null;
    private keyPath: string | null = null;

    constructor(initialConfig: ProxyConfig = { port: 9000, targetUrl: 'http://localhost:8080' }) {
        super();
        this.config = initialConfig;
    }

    public updateConfig(newConfig: Partial<ProxyConfig>) {
        this.config = { ...this.config, ...newConfig };
        if (this.isRunning) {
            this.stop();
            this.start();
        }
    }

    private ensureCert(): Promise<{ key: string, cert: string }> {
        return new Promise((resolve, reject) => {
            const tempDir = os.tmpdir();
            this.certPath = path.join(tempDir, 'dirty-soap-proxy.cer');
            this.keyPath = path.join(tempDir, 'dirty-soap-proxy.key');

            if (fs.existsSync(this.certPath) && fs.existsSync(this.keyPath)) {
                try {
                    const key = fs.readFileSync(this.keyPath, 'utf8');
                    const cert = fs.readFileSync(this.certPath, 'utf8');
                    resolve({ key, cert });
                    return;
                } catch (e) {
                    console.warn('Failed to read existing certs, regenerating...');
                }
            }

            const attrs = [{ name: 'commonName', value: 'localhost' }];
            const opts = { days: 365, keySize: 2048, extensions: [{ name: 'basicConstraints', cA: true }] };

            (selfsigned as any).generate(attrs, opts, (err: any, pems: any) => {
                if (err) {
                    reject(err);
                    return;
                }
                try {
                    fs.writeFileSync(this.certPath!, pems.cert);
                    fs.writeFileSync(this.keyPath!, pems.private);
                    resolve({ key: pems.private, cert: pems.cert });
                } catch (writeErr) {
                    reject(writeErr);
                }
            });
        });
    }

    public async start() {
        if (this.isRunning) return;

        try {
            const isHttpsTarget = this.config.targetUrl.trim().toLowerCase().startsWith('https');

            if (isHttpsTarget) {
                const pems = await this.ensureCert();
                this.server = https.createServer({ key: pems.key, cert: pems.cert }, this.handleRequest.bind(this));
            } else {
                this.server = http.createServer(this.handleRequest.bind(this));
            }

            this.server.listen(this.config.port, () => {
                console.log(`Dirty Proxy listening on port ${this.config.port} (${isHttpsTarget ? 'HTTPS' : 'HTTP'})`);
                this.isRunning = true;
                this.emit('status', true);
            });

            this.server.on('error', (err: any) => {
                console.error('Dirty Proxy Server Error:', err);
                vscode.window.showErrorMessage(`Dirty Proxy Error: ${err.message}`);
                this.stop();
            });

        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to start Proxy: ${err.message}`);
            this.stop();
        }
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const startTime = Date.now();
        const eventId = `proxy-${startTime}-${Math.random().toString(36).substr(2, 9)}`;

        let reqBody = '';
        req.on('data', chunk => reqBody += chunk);

        req.on('end', async () => {
            const event: ProxyEvent = {
                id: eventId,
                timestamp: startTime,
                timestampLabel: new Date(startTime).toLocaleTimeString(),
                method: req.method || 'GET',
                url: req.url || '/',
                requestHeaders: req.headers,
                requestBody: reqBody
            };

            this.emit('log', { ...event, type: 'request' });

            try {
                const targetBase = this.config.targetUrl.replace(/\/$/, '');
                const requestPath = (req.url || '/').replace(/^\//, '');
                const fullTargetUrl = `${targetBase}/${requestPath}`;

                // Handle upstream self-signed certs
                const agent = this.config.targetUrl.startsWith('https')
                    ? new https.Agent({ rejectUnauthorized: false })
                    : undefined;

                const axiosConfig: AxiosRequestConfig = {
                    method: req.method as Method,
                    url: fullTargetUrl,
                    headers: {
                        ...req.headers,
                        host: new URL(this.config.targetUrl).host
                    },
                    data: reqBody,
                    validateStatus: () => true,
                    httpsAgent: agent
                };

                const response = await axios(axiosConfig);
                const endTime = Date.now();

                event.status = response.status;
                event.responseHeaders = response.headers;
                event.responseBody = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
                event.duration = (endTime - startTime) / 1000;
                event.success = response.status >= 200 && response.status < 300;

                res.writeHead(response.status, response.headers as any);
                const responseData = typeof response.data === 'object' ? JSON.stringify(response.data) : response.data;
                res.end(responseData);

                this.emit('log', event);

            } catch (error: any) {
                const endTime = Date.now();
                event.duration = (endTime - startTime) / 1000;
                event.success = false;
                event.error = error.message;
                event.status = error.response?.status || 500;

                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'text/plain' });
                    res.end(`Dirty Proxy Error: ${error.message}`);
                }

                this.emit('log', event);
            }
        });
    }

    public stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.isRunning = false;
        this.emit('status', false);
    }

    public getConfig() {
        return this.config;
    }

    public getCertPath() {
        return this.certPath;
    }
}
