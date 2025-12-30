import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as dns from 'dns';
import * as net from 'net';
import * as tls from 'tls';
import axios, { AxiosRequestConfig, Method } from 'axios';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import * as selfsigned from 'selfsigned';
import { ReplaceRuleApplier, ReplaceRule } from '../utils/ReplaceRuleApplier';

export interface ProxyConfig {
    port: number;
    targetUrl: string;
    systemProxyEnabled?: boolean;
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

export interface Breakpoint {
    id: string;
    name?: string;
    enabled: boolean;
    pattern: string;        // regex or string match
    isRegex?: boolean;
    target: 'request' | 'response' | 'both';
    matchOn: 'url' | 'body' | 'header';
    headerName?: string;    // if matchOn === 'header'
}

interface PendingBreakpoint {
    id: string;
    eventId: string;
    type: 'request' | 'response';
    content: string;
    headers?: Record<string, any>;
    resolve: (result: { content: string, cancelled: boolean }) => void;
    timeoutId: NodeJS.Timeout;
}

export class ProxyService extends EventEmitter {
    private server: http.Server | https.Server | null = null;
    private config: ProxyConfig;
    private isRunning = false;
    private certPath: string | null = null;
    private keyPath: string | null = null;
    private replaceRules: ReplaceRule[] = [];
    private breakpoints: Breakpoint[] = [];
    private pendingBreakpoints: Map<string, PendingBreakpoint> = new Map();
    private static BREAKPOINT_TIMEOUT_MS = 45000; // 45 seconds

    constructor(initialConfig: ProxyConfig = { port: 9000, targetUrl: 'http://localhost:8080', systemProxyEnabled: true }) {
        super();
        this.config = initialConfig;
    }

    private logger: (msg: string) => void = console.log;

    public setLogger(logger: (msg: string) => void) {
        this.logger = logger;
    }

    private logDebug(msg: string) {
        this.logger(msg);
        this.emit('debugLog', msg); // Also emit for other listeners if needed
    }

    public updateConfig(newConfig: Partial<ProxyConfig>) {
        this.logDebug(`[ProxyService] updateConfig called with: ${JSON.stringify(newConfig)}`);
        this.config = { ...this.config, ...newConfig };
        this.logDebug(`[ProxyService] New config is: ${JSON.stringify(this.config)}`);
        if (this.isRunning) {
            this.logDebug('[ProxyService] Restarting proxy with new config...');
            this.stop();
            this.start();
        }
    }

    public setReplaceRules(rules: ReplaceRule[]) {
        this.replaceRules = rules;
        this.logDebug(`[ProxyService] Updated replace rules: ${rules.length} rules`);
    }

    public setBreakpoints(breakpoints: Breakpoint[]) {
        this.breakpoints = breakpoints;
        this.logDebug(`[ProxyService] Updated breakpoints: ${breakpoints.length} breakpoints`);
    }

    /**
     * Resolve a pending breakpoint with modified content
     */
    public resolveBreakpoint(breakpointId: string, modifiedContent: string, cancelled = false) {
        const pending = this.pendingBreakpoints.get(breakpointId);
        if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingBreakpoints.delete(breakpointId);
            pending.resolve({ content: modifiedContent, cancelled });
            this.logDebug(`[ProxyService] Breakpoint ${breakpointId} resolved (cancelled: ${cancelled})`);
        }
    }

    /**
     * Check if content matches any breakpoint
     */
    private checkBreakpoints(url: string, content: string, headers: Record<string, any>, target: 'request' | 'response'): Breakpoint | null {
        for (const bp of this.breakpoints) {
            if (!bp.enabled) continue;
            if (bp.target !== target && bp.target !== 'both') continue;

            let textToMatch = '';
            if (bp.matchOn === 'url') {
                textToMatch = url;
            } else if (bp.matchOn === 'body') {
                textToMatch = content;
            } else if (bp.matchOn === 'header' && bp.headerName) {
                textToMatch = String(headers[bp.headerName.toLowerCase()] || '');
            }

            const matched = bp.isRegex
                ? new RegExp(bp.pattern).test(textToMatch)
                : textToMatch.includes(bp.pattern);

            if (matched) {
                this.logDebug(`[ProxyService] Breakpoint hit: ${bp.name || bp.id} on ${target}`);
                return bp;
            }
        }
        return null;
    }

    /**
     * Wait for user to edit content at breakpoint
     */
    private async waitForBreakpoint(
        eventId: string,
        type: 'request' | 'response',
        content: string,
        headers: Record<string, any>,
        breakpoint: Breakpoint
    ): Promise<{ content: string, cancelled: boolean }> {
        const breakpointId = `bp-${eventId}-${type}`;

        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this.pendingBreakpoints.delete(breakpointId);
                this.emit('breakpointTimeout', { breakpointId });
                this.logDebug(`[ProxyService] Breakpoint ${breakpointId} timed out after ${ProxyService.BREAKPOINT_TIMEOUT_MS}ms`);
                resolve({ content, cancelled: false }); // Continue with original
            }, ProxyService.BREAKPOINT_TIMEOUT_MS);

            this.pendingBreakpoints.set(breakpointId, {
                id: breakpointId,
                eventId,
                type,
                content,
                headers,
                resolve,
                timeoutId
            });

            // Emit to webview
            this.emit('breakpointHit', {
                breakpointId,
                eventId,
                type,
                content,
                headers,
                breakpointName: breakpoint.name || breakpoint.id,
                timeoutMs: ProxyService.BREAKPOINT_TIMEOUT_MS
            });
        });
    }

    private async ensureCert(): Promise<{ key: string, cert: string }> {
        this.logDebug('[ProxyService] ensureCert called');

        const tempDir = os.tmpdir();
        this.certPath = path.join(tempDir, 'dirty-soap-proxy.cer');
        this.keyPath = path.join(tempDir, 'dirty-soap-proxy.key');

        if (fs.existsSync(this.certPath) && fs.existsSync(this.keyPath)) {
            try {
                const key = fs.readFileSync(this.keyPath, 'utf8');
                const cert = fs.readFileSync(this.certPath, 'utf8');
                this.logDebug('[ProxyService] Found existing certs.');
                return { key, cert };
            } catch (e) {
                this.logDebug('[ProxyService] Failed to read existing certs, regenerating...');
            }
        }

        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const opts = { days: 365, keySize: 2048, extensions: [{ name: 'basicConstraints', cA: true }] };

        this.logDebug('[ProxyService] Generating new certificate (this may take a moment)...');
        try {
            // Version 5+ of selfsigned uses async/await
            const pems = await (selfsigned as any).generate(attrs, opts);

            this.logDebug('[ProxyService] Certificate generation successful. Writing files...');
            fs.writeFileSync(this.certPath!, pems.cert);
            fs.writeFileSync(this.keyPath!, pems.private);
            this.logDebug(`[ProxyService] Wrote cert to: ${this.certPath}`);
            return { key: pems.private, cert: pems.cert };
        } catch (err: any) {
            this.logDebug('[ProxyService] selfsigned.generate threw: ' + err.message);
            throw err;
        }
    }

    public async prepareCert() {
        return this.ensureCert();
    }

    public async start() {
        if (this.isRunning) return;

        try {
            const isHttpsTarget = this.config.targetUrl.trim().toLowerCase().startsWith('https');
            this.logDebug(`[ProxyService] Starting... Target: ${this.config.targetUrl}, isHttpsTarget: ${isHttpsTarget}`);

            if (isHttpsTarget) {
                this.logDebug('[ProxyService] Waiting for certs...');
                const pems = await this.ensureCert();
                this.logDebug('[ProxyService] Certs loaded. Creating HTTPS server.');
                this.server = https.createServer({ key: pems.key, cert: pems.cert }, this.handleRequest.bind(this));
            } else {
                this.server = http.createServer(this.handleRequest.bind(this));
            }

            this.server.listen(this.config.port, () => {
                this.logDebug(`Dirty Proxy listening on port ${this.config.port} (${isHttpsTarget ? 'HTTPS' : 'HTTP'})`);
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

                // Detect VS Code Proxy Settings
                const httpConfig = vscode.workspace.getConfiguration('http');
                const proxyUrl = httpConfig.get<string>('proxy') || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
                const strictSSL = httpConfig.get<boolean>('proxyStrictSSL', false);

                let agent: any;

                if (proxyUrl && this.config.systemProxyEnabled !== false) {
                    this.logDebug(`[Proxy] Using System Proxy: ${proxyUrl}`);
                    const { HttpsProxyAgent } = require('https-proxy-agent');
                    // Enable support for self-signed certs in corporate proxies
                    agent = new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: strictSSL });
                } else {
                    if (proxyUrl) {
                        this.logDebug(`[Proxy] IGNORING System Proxy (${proxyUrl}) - Direct Connection requested.`);
                    }
                    // Handle upstream self-signed certs directly if no proxy
                    agent = this.config.targetUrl.startsWith('https')
                        ? new https.Agent({ rejectUnauthorized: strictSSL, keepAlive: true })
                        : undefined;
                }

                // Strip conflicting headers
                const { 'transfer-encoding': te, 'connection': conn, 'content-length': cl, host, ...forwardHeaders } = req.headers;

                const axiosConfig: AxiosRequestConfig = {
                    method: req.method as Method,
                    url: fullTargetUrl,
                    headers: {
                        ...forwardHeaders,
                        host: new URL(this.config.targetUrl).host,
                        // Force close to avoid NTLM connection reuse issues? 
                        // Actually, let's let axios/agent handle it.
                        // But WCF might send 'Expect: 100-continue'. Axios handles that?
                        // Safe default:
                        connection: 'keep-alive'
                    },
                    data: reqBody,
                    validateStatus: () => true,
                    httpsAgent: agent,
                    maxBodyLength: Infinity,
                    maxContentLength: Infinity,
                    proxy: false // Critical: Prevent Axios from using process.env.HTTP_PROXY automatically
                };

                // Apply replace rules to request before forwarding
                let requestData = reqBody;
                if (this.replaceRules.length > 0) {
                    const originalReq = requestData;
                    requestData = ReplaceRuleApplier.apply(requestData, this.replaceRules, 'request');
                    if (requestData !== originalReq) {
                        const applicableRules = this.replaceRules.filter(r => r.enabled && (r.target === 'request' || r.target === 'both'));
                        const ruleNames = applicableRules.map(r => r.name || r.id).join(', ');
                        this.logDebug(`[Proxy] ✓ Applied replace rules to request: ${ruleNames}`);
                        axiosConfig.data = requestData;
                    }
                }

                // Check for REQUEST breakpoint (before forwarding)
                const requestBreakpoint = this.checkBreakpoints(fullTargetUrl, requestData, req.headers as Record<string, any>, 'request');
                if (requestBreakpoint) {
                    const result = await this.waitForBreakpoint(eventId, 'request', requestData, req.headers as Record<string, any>, requestBreakpoint);
                    if (!result.cancelled) {
                        requestData = result.content;
                        axiosConfig.data = requestData;
                    }
                }

                this.logDebug(`[Proxy] Sending Request to: ${axiosConfig.url}`);
                // Ensure correct Host header and Content-Length
                // Add User-Agent in case WAF requires it
                const headersToSend = {
                    ...forwardHeaders,
                    host: new URL(this.config.targetUrl).host,
                    'content-length': Buffer.byteLength(requestData),
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    connection: 'keep-alive'
                };
                axiosConfig.headers = headersToSend;

                this.logDebug(`[Proxy] Outgoing Headers: ${JSON.stringify(axiosConfig.headers)}`);

                const response = await axios(axiosConfig);
                const endTime = Date.now();

                event.status = response.status;
                event.responseHeaders = response.headers;
                event.responseBody = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
                event.duration = (endTime - startTime) / 1000;
                event.success = response.status >= 200 && response.status < 300;
                if (response.status === 503) {
                    this.logDebug('[Proxy] 503 Detected. Running diagnostics...');
                    // Fire and forget diagnostics
                    this.runDiagnostics(fullTargetUrl, axiosConfig).catch(err => this.logDebug(`[Diagnostics] Error running probes: ${err}`));
                }

                // Apply replace rules to response before forwarding
                let responseData = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
                if (this.replaceRules.length > 0) {
                    const originalData = responseData;
                    const applicableRules = this.replaceRules.filter(r => r.enabled && (r.target === 'response' || r.target === 'both'));
                    responseData = ReplaceRuleApplier.apply(responseData, this.replaceRules, 'response');
                    if (responseData !== originalData) {
                        const ruleNames = applicableRules.map(r => r.name || r.id).join(', ');
                        this.logDebug(`[Proxy] ✓ Applied replace rules: ${ruleNames}`);
                        // Update event for logging to show modified response
                        event.responseBody = responseData;
                    }
                }

                // Check for RESPONSE breakpoint (before returning to client)
                const responseBreakpoint = this.checkBreakpoints(fullTargetUrl, responseData, response.headers as Record<string, any>, 'response');
                if (responseBreakpoint) {
                    const result = await this.waitForBreakpoint(eventId, 'response', responseData, response.headers as Record<string, any>, responseBreakpoint);
                    if (!result.cancelled) {
                        responseData = result.content;
                        event.responseBody = responseData;
                    }
                }

                res.writeHead(response.status, response.headers as any);
                res.end(responseData);

                this.emit('log', event);

            } catch (error: any) {
                const endTime = Date.now();
                event.duration = (endTime - startTime) / 1000;
                event.success = false;
                event.error = error.message;
                event.status = error.response?.status || 500;

                // Capture error response body if available
                if (error.response?.data) {
                    event.responseBody = typeof error.response.data === 'object'
                        ? JSON.stringify(error.response.data)
                        : String(error.response.data);
                }

                if (!res.headersSent) {
                    res.writeHead(event.status || 500, { 'Content-Type': 'text/plain' });
                    // Forward backend error if available, else generic
                    res.end(event.responseBody || `Dirty Proxy Error: ${error.message}`);
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
    private async runDiagnostics(targetUrl: string, originalConfig: AxiosRequestConfig) {
        const u = new URL(targetUrl);
        const log = (msg: string) => this.logDebug(`[Diagnostic] ${msg}`);

        log(`---------------------------------------------------`);
        log(`DEEP DIAGNOSTICS for ${targetUrl}`);

        try {
            // 1. Environment and Config
            log(`Proxy Config: System=${this.config.systemProxyEnabled !== false}, URL=${process.env.HTTP_PROXY || process.env.http_proxy || 'None'}`);

            // 2. DNS Resolution
            log(`Step 1: DNS Resolution for ${u.hostname}...`);
            try {
                const addresses = await dns.promises.resolve(u.hostname);
                log(`DNS Success: ${JSON.stringify(addresses)}`);
            } catch (err: any) {
                log(`DNS FAILED: ${err.message}`);
            }

            // 3. TCP Connectivity
            const port = u.port || (u.protocol === 'https:' ? 443 : 80);
            log(`Step 2: TCP Connect to ${u.hostname}:${port}...`);
            try {
                await new Promise<void>((resolve, reject) => {
                    const socket = net.createConnection(Number(port), u.hostname);
                    socket.setTimeout(3000);
                    socket.on('connect', () => { log('TCP Connection ESTABLISHED'); socket.end(); resolve(); });
                    socket.on('error', (err) => { log(`TCP Connection FAILED: ${err.message}`); reject(err); });
                    socket.on('timeout', () => { log('TCP Connection TIMEOUT'); socket.destroy(); reject(new Error('Timeout')); });
                });
            } catch (e) {
                // Ignore TCP error to continue probes
            }

            // 4. TLS Inspection (Identify Middleboxes)
            if (u.protocol === 'https:') {
                log(`Step 3: TLS Handshake & Cert Inspection...`);
                try {
                    await new Promise<void>((resolve) => {
                        const options = { servername: u.hostname, rejectUnauthorized: false };
                        const socket = tls.connect(Number(port), u.hostname, options, () => {
                            const cert = socket.getPeerCertificate();
                            if (cert && cert.subject) {
                                log(`Server Cert Subject: ${cert.subject.CN} / ${cert.subject.O}`);
                                log(`Server Cert Issuer:  ${cert.issuer.CN} / ${cert.issuer.O}`);
                                if (cert.issuer.O && (cert.issuer.O.toLowerCase().includes('zscaler') || cert.issuer.O.toLowerCase().includes('fortinet'))) {
                                    log(`(!) ALERT: You are behind a Corporate Proxy/Firewall (${cert.issuer.O})`);
                                }
                            } else {
                                log('TLS Handshake success, but no cert returned or empty subject.');
                            }
                            socket.end();
                            resolve();
                        });
                        socket.on('error', (err) => { log(`TLS Handshake FAILED: ${err.message}`); resolve(); });
                    });
                } catch (e) {
                    log(`TLS Probe Error: ${e}`);
                }
            }

            // 5. HTTP Probes
            log(`Step 4: Application Layer Probes...`);

            const probe = async (label: string, config: AxiosRequestConfig) => {
                try {
                    const res = await axios({ ...config, validateStatus: () => true, timeout: 5000 });
                    log(`${label}: ${res.status} ${res.statusText} (Type: ${typeof res.data === 'string' ? 'String' : 'Object'})`);
                    if (res.status !== 200) {
                        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                        log(`  > Body Preview: ${body.slice(0, 150)}...`);
                    }
                } catch (err: any) {
                    log(`${label}: FAILED - ${err.message}`);
                }
            };

            // Clean headers for probes
            const { data, ...baseConfig } = originalConfig;
            const headers = { ...baseConfig.headers } as any;
            delete headers['content-length'];
            delete headers['Content-Length'];

            await probe('GET Root', { ...baseConfig, method: 'GET', headers, data: undefined });
            await probe('GET WSDL', { ...baseConfig, method: 'GET', url: `${targetUrl}?wsdl`, headers, data: undefined });
            await probe('OPTIONS', { ...baseConfig, method: 'OPTIONS', headers, data: undefined });

            // Empty POST probe (Is it the payload?)
            await probe('POST (Empty)', { ...baseConfig, method: 'POST', headers, data: '' });

        } catch (err: any) {
            log(`Diagnostics CRASHED: ${err.message}`);
        }
        log(`---------------------------------------------------`);
    }
}
