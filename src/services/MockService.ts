import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios, { AxiosRequestConfig, Method } from 'axios';
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import * as selfsigned from 'selfsigned';
import { MockConfig, MockRule, MockMatchCondition } from '../models';
import { DOMParser } from '@xmldom/xmldom';
import * as xpath from 'xpath';

export interface MockEvent {
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
    matchedRule?: string;
    passthrough?: boolean;
}

const DEFAULT_CONFIG: MockConfig = {
    enabled: false,
    port: 9001,
    targetUrl: 'http://localhost:8080',
    rules: [],
    passthroughEnabled: true,
    routeThroughProxy: false
};

export class MockService extends EventEmitter {
    private server: http.Server | https.Server | null = null;
    private config: MockConfig;
    private isRunning = false;
    private certPath: string | null = null;
    private keyPath: string | null = null;
    private proxyPort = 9000; // Default Dirty Proxy port

    constructor(initialConfig: Partial<MockConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...initialConfig };
    }

    private logger: (msg: string) => void = console.log;

    public setLogger(logger: (msg: string) => void) {
        this.logger = logger;
    }

    public setProxyPort(port: number) {
        this.proxyPort = port;
    }

    private logDebug(msg: string) {
        this.logger(msg);
        this.emit('debugLog', msg);
    }

    public updateConfig(newConfig: Partial<MockConfig>) {
        this.logDebug(`[MockService] updateConfig called with: ${JSON.stringify(newConfig)}`);
        this.config = { ...this.config, ...newConfig };
        this.logDebug(`[MockService] New config is: ${JSON.stringify(this.config)}`);
        if (this.isRunning) {
            this.logDebug('[MockService] Restarting mock server with new config...');
            this.stop();
            this.start();
        }
    }

    public getConfig(): MockConfig {
        return this.config;
    }

    public getRules(): MockRule[] {
        return this.config.rules;
    }

    public addRule(rule: MockRule) {
        this.config.rules.push(rule);
        this.logDebug(`[MockService] Added rule: ${rule.name}`);
        this.emit('rulesUpdated', this.config.rules);
    }

    public updateRule(id: string, updates: Partial<MockRule>) {
        const index = this.config.rules.findIndex(r => r.id === id);
        if (index !== -1) {
            this.config.rules[index] = { ...this.config.rules[index], ...updates };
            this.logDebug(`[MockService] Updated rule: ${id}`);
            this.emit('rulesUpdated', this.config.rules);
        }
    }

    public removeRule(id: string) {
        this.config.rules = this.config.rules.filter(r => r.id !== id);
        this.logDebug(`[MockService] Removed rule: ${id}`);
        this.emit('rulesUpdated', this.config.rules);
    }

    public setRules(rules: MockRule[]) {
        this.config.rules = rules;
        this.logDebug(`[MockService] Set ${rules.length} rules`);
        this.emit('rulesUpdated', this.config.rules);
    }

    /**
     * Records a filtered proxy request/response pair into a new mock rule
     */
    public recordRequest(data: {
        method: string,
        url: string,
        requestHeaders: Record<string, any>,
        requestBody: string,
        status: number,
        responseHeaders: Record<string, any>,
        responseBody: string
    }) {
        if (!this.config.recordMode) return;

        this.logDebug(`[MockService] Recording request to: ${data.url}`);

        // Try to find SOAP operation
        let operationName = 'Recorded Rule';
        try {
            const soapAction = data.requestHeaders['soapaction'] || data.requestHeaders['SoapAction'];
            if (typeof soapAction === 'string' && soapAction) {
                operationName = soapAction.replace(/"/g, '').split('/').pop() || 'Operation';
            } else {
                // Try to parse body for operation name
                const match = data.requestBody.match(/<(?:\w+:)?Body(?:\s+[^>]*?)?>\s*<(?:\w+:)?(\w+)/i);
                if (match && match[1]) {
                    operationName = match[1];
                }
            }
        } catch (e) {
            this.logDebug(`[MockService] Failed to extract operation name: ${e}`);
        }

        const ruleId = `recorded-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        // Filter headers to strings
        const headers: Record<string, string> = {};
        Object.entries(data.responseHeaders).forEach(([k, v]) => {
            if (v !== undefined && v !== null && k.toLowerCase() !== 'content-length' && k.toLowerCase() !== 'connection' && k.toLowerCase() !== 'transfer-encoding') {
                headers[k] = String(v);
            }
        });

        const newRule: MockRule = {
            id: ruleId,
            name: `${operationName} (Recorded)`,
            enabled: true,
            conditions: [
                // For simplicity, record by URL and Operation if found
                { type: 'url', pattern: data.url, isRegex: false }
            ],
            statusCode: data.status,
            responseBody: data.responseBody,
            responseHeaders: headers,
            recordedAt: Date.now(),
            recordedFrom: data.url,
            hitCount: 0
        };

        // If we found an operation name, add a condition for it too
        if (operationName !== 'Recorded Rule' && operationName !== 'Operation') {
            newRule.conditions.push({ type: 'operation', pattern: operationName, isRegex: false });
        }

        this.addRule(newRule);
        this.emit('mockRecorded', { ruleId, name: newRule.name });
    }

    private async ensureCert(): Promise<{ key: string, cert: string }> {
        this.logDebug('[MockService] ensureCert called');

        const tempDir = os.tmpdir();
        this.certPath = path.join(tempDir, 'dirty-soap-mock.cer');
        this.keyPath = path.join(tempDir, 'dirty-soap-mock.key');

        if (fs.existsSync(this.certPath) && fs.existsSync(this.keyPath)) {
            try {
                const key = fs.readFileSync(this.keyPath, 'utf8');
                const cert = fs.readFileSync(this.certPath, 'utf8');
                this.logDebug('[MockService] Found existing certs.');
                return { key, cert };
            } catch {
                this.logDebug('[MockService] Failed to read existing certs, regenerating...');
            }
        }

        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const opts = { days: 365, keySize: 2048, extensions: [{ name: 'basicConstraints', cA: true }] };

        this.logDebug('[MockService] Generating new certificate...');
        try {
            const pems = await (selfsigned as any).generate(attrs, opts);
            fs.writeFileSync(this.certPath!, pems.cert);
            fs.writeFileSync(this.keyPath!, pems.private);
            this.logDebug(`[MockService] Wrote cert to: ${this.certPath}`);
            return { key: pems.private, cert: pems.cert };
        } catch (err: any) {
            this.logDebug('[MockService] selfsigned.generate threw: ' + err.message);
            throw err;
        }
    }

    public async start() {
        if (this.isRunning) return;

        try {
            const isHttpsTarget = this.config.targetUrl.trim().toLowerCase().startsWith('https');
            this.logDebug(`[MockService] Starting... Port: ${this.config.port}, Target: ${this.config.targetUrl}`);

            if (isHttpsTarget) {
                this.logDebug('[MockService] Target is HTTPS, creating HTTPS server...');
                const pems = await this.ensureCert();
                this.server = https.createServer({ key: pems.key, cert: pems.cert }, this.handleRequest.bind(this));
            } else {
                this.server = http.createServer(this.handleRequest.bind(this));
            }

            this.server.listen(this.config.port, () => {
                this.logDebug(`Mock Server listening on port ${this.config.port}`);
                this.isRunning = true;
                this.emit('status', true);
            });

            this.server.on('error', (err: any) => {
                console.error('Mock Server Error:', err);
                vscode.window.showErrorMessage(`Mock Server Error: ${err.message}`);
                this.stop();
            });

        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to start Mock Server: ${err.message}`);
            this.stop();
        }
    }

    public stop() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.isRunning = false;
        this.emit('status', false);
        this.logDebug('[MockService] Stopped');
    }

    public isActive(): boolean {
        return this.isRunning;
    }

    /**
     * Send a mock response for a matched rule. Used by ProxyService in 'both' mode.
     * Returns true if response was sent, false otherwise.
     */
    public async sendMockResponse(
        res: http.ServerResponse,
        rule: MockRule,
        eventInfo: { eventId: string; startTime: number; method: string; url: string; requestHeaders: any; requestBody: string }
    ): Promise<boolean> {
        try {
            // Increment hit count
            rule.hitCount = (rule.hitCount || 0) + 1;

            this.logDebug(`[MockService] Sending mock response for rule: ${rule.name}`);

            // Apply delay if configured
            if (rule.delayMs && rule.delayMs > 0) {
                await this.delay(rule.delayMs);
            }

            // Send mock response
            const headers: Record<string, string> = {
                'Content-Type': rule.contentType || 'text/xml; charset=utf-8',
                ...rule.responseHeaders
            };

            res.writeHead(rule.statusCode, headers);
            res.end(rule.responseBody);

            // Emit mock hit event
            const event: MockEvent = {
                id: eventInfo.eventId,
                timestamp: eventInfo.startTime,
                timestampLabel: new Date(eventInfo.startTime).toLocaleTimeString(),
                method: eventInfo.method,
                url: eventInfo.url,
                requestHeaders: eventInfo.requestHeaders,
                requestBody: eventInfo.requestBody,
                status: rule.statusCode,
                responseHeaders: headers,
                responseBody: rule.responseBody,
                duration: (Date.now() - eventInfo.startTime) / 1000,
                matchedRule: rule.name
            };

            this.emit('log', event);
            this.emit('mockHit', { rule, event });

            return true;
        } catch (error: any) {
            this.logDebug(`[MockService] Error sending mock response: ${error.message}`);
            return false;
        }
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const startTime = Date.now();
        const eventId = `mock-${startTime}-${Math.random().toString(36).substr(2, 9)}`;

        let reqBody = '';
        req.on('data', chunk => reqBody += chunk);

        req.on('end', async () => {
            const event: MockEvent = {
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
                // Find matching rule
                const matchedRule = this.findMatchingRule(req, reqBody);

                if (matchedRule) {
                    // Increment hit count
                    matchedRule.hitCount = (matchedRule.hitCount || 0) + 1;

                    this.logDebug(`[MockService] Rule matched: ${matchedRule.name}`);
                    event.matchedRule = matchedRule.name;

                    // Apply delay if configured
                    if (matchedRule.delayMs && matchedRule.delayMs > 0) {
                        await this.delay(matchedRule.delayMs);
                    }

                    // Send mock response
                    const headers: Record<string, string> = {
                        'Content-Type': matchedRule.contentType || 'text/xml; charset=utf-8',
                        ...matchedRule.responseHeaders
                    };

                    res.writeHead(matchedRule.statusCode, headers);
                    res.end(matchedRule.responseBody);

                    event.status = matchedRule.statusCode;
                    event.responseHeaders = headers;
                    event.responseBody = matchedRule.responseBody;
                    event.duration = (Date.now() - startTime) / 1000;

                    this.emit('log', event);
                    this.emit('mockHit', { rule: matchedRule, event });
                    return;
                }

                // No match - passthrough or 404
                if (this.config.passthroughEnabled) {
                    event.passthrough = true;
                    await this.forwardRequest(req, res, reqBody, event);
                } else {
                    this.logDebug('[MockService] No matching rule, returning 404');
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('No matching mock rule');

                    event.status = 404;
                    event.responseBody = 'No matching mock rule';
                    event.duration = (Date.now() - startTime) / 1000;
                    this.emit('log', event);
                }

            } catch (error: any) {
                this.logDebug(`[MockService] Error: ${error.message}`);
                if (!res.headersSent) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end(`Mock Server Error: ${error.message}`);
                }
                event.status = 500;
                event.responseBody = error.message;
                event.duration = (Date.now() - startTime) / 1000;
                this.emit('log', event);
            }
        });
    }

    public findMatchingRule(req: http.IncomingMessage, body: string): MockRule | null {
        for (const rule of this.config.rules) {
            if (!rule.enabled) continue;

            if (this.allConditionsMatch(rule.conditions, req, body)) {
                return rule;
            }
        }
        return null;
    }

    private allConditionsMatch(conditions: MockMatchCondition[], req: http.IncomingMessage, body: string): boolean {
        if (conditions.length === 0) return false;

        for (const condition of conditions) {
            if (!this.conditionMatches(condition, req, body)) {
                return false;
            }
        }
        return true;
    }

    private conditionMatches(condition: MockMatchCondition, req: http.IncomingMessage, body: string): boolean {
        let textToMatch = '';

        switch (condition.type) {
            case 'url':
                textToMatch = req.url || '/';
                break;
            case 'operation':
            case 'soapAction':
                // Extract SOAPAction from header
                textToMatch = String(req.headers['soapaction'] || '');
                break;
            case 'header':
                if (condition.headerName) {
                    textToMatch = String(req.headers[condition.headerName.toLowerCase()] || '');
                }
                break;
            case 'contains':
                textToMatch = body;
                break;
            case 'xpath':
                // XPath matching on body
                try {
                    const doc = new DOMParser().parseFromString(body, 'text/xml');
                    const nodes = xpath.select(condition.pattern, doc);
                    // xpath.select returns Node[] | string | number | boolean
                    if (Array.isArray(nodes)) {
                        return nodes.length > 0;
                    }
                    return Boolean(nodes);
                } catch (e) {
                    this.logDebug(`[MockService] XPath error: ${e}`);
                    return false;
                }
            default:
                return false;
        }

        // Pattern matching
        if (condition.isRegex) {
            try {
                return new RegExp(condition.pattern).test(textToMatch);
            } catch {
                return false;
            }
        } else {
            return textToMatch.includes(condition.pattern);
        }
    }

    private async forwardRequest(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        body: string,
        event: MockEvent
    ) {
        const startTime = Date.now();

        // Determine target: Dirty Proxy or direct
        let targetBase: string;
        if (this.config.routeThroughProxy) {
            targetBase = `http://localhost:${this.proxyPort}`;
            this.logDebug(`[MockService] Forwarding through Dirty Proxy (port ${this.proxyPort})`);
        } else {
            targetBase = this.config.targetUrl.replace(/\/$/, '');
            this.logDebug(`[MockService] Forwarding direct to: ${targetBase}`);
        }

        const requestPath = (req.url || '/').replace(/^\//, '');
        const fullTargetUrl = `${targetBase}/${requestPath}`;

        try {
            // Strip conflicting headers
            const { 'transfer-encoding': _te, 'connection': _conn, 'content-length': _cl, host: _host, ...forwardHeaders } = req.headers;

            const axiosConfig: AxiosRequestConfig = {
                method: req.method as Method,
                url: fullTargetUrl,
                headers: {
                    ...forwardHeaders,
                    host: new URL(targetBase).host,
                    'content-length': Buffer.byteLength(body),
                    connection: 'keep-alive'
                },
                data: body,
                validateStatus: () => true,
                httpsAgent: new https.Agent({ rejectUnauthorized: false }),
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                proxy: false
            };

            const response = await axios(axiosConfig);

            event.status = response.status;
            event.responseHeaders = response.headers as Record<string, any>;
            event.responseBody = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
            event.duration = (Date.now() - startTime) / 1000;

            // If record mode is on, create a new mock rule from this response
            if (this.config.recordMode) {
                this.recordResponse(req, event);
            }

            res.writeHead(response.status, response.headers as any);
            res.end(event.responseBody);

            this.emit('log', event);
            this.emit('passthrough', { event });

        } catch (error: any) {
            this.logDebug(`[MockService] Forward error: ${error.message}`);
            event.status = 502;
            event.responseBody = `Mock Passthrough Error: ${error.message}`;
            event.duration = (Date.now() - startTime) / 1000;

            if (!res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' });
                res.end(event.responseBody);
            }
            this.emit('log', event);
        }
    }

    private recordResponse(req: http.IncomingMessage, event: MockEvent) {
        const soapAction = String(req.headers['soapaction'] || '');
        const operationName = soapAction.split('/').pop() || 'RecordedMock';

        const newRule: MockRule = {
            id: `recorded-${Date.now()}`,
            name: `${operationName} (Recorded)`,
            enabled: false, // Don't enable automatically
            conditions: [
                {
                    type: 'soapAction',
                    pattern: soapAction
                }
            ],
            statusCode: event.status || 200,
            responseBody: event.responseBody || '',
            contentType: String(event.responseHeaders?.['content-type'] || 'text/xml'),
            recordedFrom: req.url,
            recordedAt: Date.now()
        };

        this.addRule(newRule);
        this.logDebug(`[MockService] Recorded new mock: ${newRule.name}`);
        this.emit('mockRecorded', newRule);
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public getCertPath(): string | null {
        return this.certPath;
    }
}
