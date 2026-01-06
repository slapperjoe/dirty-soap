import * as soap from 'soap';
import axios from 'axios';
import { SoapService, SoapSchemaNode } from '@shared/models';
import { WsdlParser } from './WsdlParser';
import { DiagnosticService } from './services/DiagnosticService';
import { SettingsManager } from './utils/SettingsManager';

import * as vscode from 'vscode'; // Need to import vscode to read settings

export class SoapClient {
    private client: soap.Client | null = null;
    private currentRequest: any = null;
    private cancelTokenSource: any = null;
    private outputChannel: any = null;
    private settingsManager: SettingsManager;
    private wsdlParser: WsdlParser;

    constructor(settingsManager: SettingsManager, outputChannel?: any) {
        this.outputChannel = outputChannel;
        this.settingsManager = settingsManager;
        // Initial setup - settings will be refreshed on parseWsdl
        this.wsdlParser = new WsdlParser(outputChannel);
    }

    public log(message: string, data?: any) {
        // Also pipe to diagnostic service
        DiagnosticService.getInstance().log('BACKEND', `[SoapClient] ${message} `, data);

        if (this.outputChannel) {
            this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message} `);
            if (data) {
                this.outputChannel.appendLine(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
            }
        }
    }

    private getProxySettings() {
        // 1. Check Extension Config
        const config = this.settingsManager.getConfig();
        let proxyUrl = config.network?.proxy;
        let strictSSL = config.network?.strictSSL;

        // 2. Check VS Code Config
        const httpConfig = vscode.workspace.getConfiguration('http');
        if (!proxyUrl) {
            proxyUrl = httpConfig.get<string>('proxy');
        }

        // If extension setting is undefined, fall back to vscode setting. 
        // If that is undefined, default true.
        if (strictSSL === undefined) {
            strictSSL = httpConfig.get<boolean>('proxyStrictSSL', true);
        }

        return { proxyUrl, strictSSL };
    }

    async parseWsdl(url: string, localWsdlDir?: string): Promise<SoapService[]> {
        // Refresh settings
        const { proxyUrl, strictSSL } = this.getProxySettings();

        this.log(`Configuring WSDL Parser - Proxy: ${proxyUrl || 'None'}, StrictSSL: ${strictSSL} `);

        // Re-create parser with latest settings
        this.wsdlParser = new WsdlParser(this.outputChannel, {
            proxyUrl,
            strictSSL
        });

        const services = await this.wsdlParser.parseWsdl(url, localWsdlDir);
        this.client = this.wsdlParser.getClient();
        return services;
    }

    public getOperationSchema(operationName: string, portName?: string): SoapSchemaNode | null {
        return this.wsdlParser.getOperationSchema(operationName, portName);
    }

    cancelRequest() {
        // Cancel axios request
        if (this.cancelTokenSource) {
            this.cancelTokenSource.cancel('Operation canceled by the user.');
            this.cancelTokenSource = null;
        }

        // Cancel node-soap request
        if (this.currentRequest) {
            try {
                if (typeof this.currentRequest.abort === 'function') {
                    this.currentRequest.abort();
                }
            } catch (e) {
                console.error('Error cancelling request:', e);
            }
            this.currentRequest = null;
        }
    }

    async executeRequest(url: string, operation: string, args: any, headers?: any): Promise<any> {
        // Check if we are in "Raw XML" mode (args is string)
        const isRawMode = typeof args === 'string' && args.trim().startsWith('<');

        if (!this.client && !isRawMode) {
            this.client = await soap.createClientAsync(url);
        }

        // Check if we are in "Raw XML" mode (args is string)
        if (typeof args === 'string' && args.trim().startsWith('<')) {
            // Treat the passed 'url' as the target endpoint override
            return this.executeRawRequest(operation, args, headers, url);
        }

        return new Promise((resolve, reject) => {
            if (!this.client) return reject('Client not initialized');

            const method = this.client[operation];
            if (typeof method !== 'function') {
                return reject(`Operation ${operation} not found on client`);
            }

            if (headers) {
                this.client.addSoapHeader(headers);
            }

            const startTime = Date.now();
            const req = method(args, (err: any, result: any, rawResponse: any, soapHeader: any, rawRequest: any) => {
                const endTime = Date.now();
                const timeTaken = endTime - startTime;
                this.currentRequest = null;
                if (err) {
                    return resolve({
                        success: false,
                        error: err,
                        rawResponse: rawResponse,
                        rawRequest: rawRequest,
                        timeTaken: timeTaken
                    });
                }
                resolve({
                    success: true,
                    result: result,
                    rawResponse: rawResponse,
                    rawRequest: rawRequest,
                    timeTaken: timeTaken
                });
            });

            this.currentRequest = req;
        });
    }

    private async executeRawRequest(operation: string, xml: string, headers: any, endpointOverride?: string): Promise<any> {
        let endpoint = endpointOverride || '';
        let soapAction = '';

        if (this.client) {
            // 1. Find Endpoint from WSDL if missing
            const definitions = (this.client as any).wsdl.definitions;
            if (!endpoint) {
                for (const serviceName in definitions.services) {
                    const service = definitions.services[serviceName];
                    for (const portName in service.ports) {
                        const port = service.ports[portName];
                        if (port.location) {
                            endpoint = port.location;
                            break;
                        }
                    }
                    if (endpoint) break;
                }
            }
            if (!endpoint) {
                endpoint = (this.client as any).wsdl.options.endpoint;
            }

            // 2. Find SOAPAction from WSDL
            for (const bindingName in definitions.bindings) {
                const binding = definitions.bindings[bindingName];
                if (binding.operations && binding.operations[operation]) {
                    soapAction = binding.operations[operation].soapAction;
                    break;
                }
            }
        }

        if (!endpoint) {
            return {
                success: false,
                error: "Invalid URL: Endpoint is missing. Please set the Endpoint in the request configuration.",
                rawResponse: null,
                rawRequest: xml,
                timeTaken: 0
            };
        }

        // 3. Prepare Headers
        const requestHeaders: any = {
            'Content-Type': 'text/xml;charset=UTF-8',
            ...headers
        };
        if (soapAction) {
            requestHeaders['SOAPAction'] = soapAction;
        }

        // 4. Send Request with Axios
        const CancelToken = axios.CancelToken;
        this.cancelTokenSource = CancelToken.source();

        const { proxyUrl, strictSSL } = this.getProxySettings();
        const agentOptions = { keepAlive: false, rejectUnauthorized: strictSSL };

        let httpsAgent: any;
        let httpAgent: any;

        if (proxyUrl) {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            const { HttpProxyAgent } = require('http-proxy-agent');
            const isHttps = endpoint.toLowerCase().startsWith('https');

            // If we are proxying, the agent needs to be proxy aware
            // Note: HttpsProxyAgent handles CONNECT for https, HttpProxyAgent for http
            // But if we are sending to https, we need HttpsProxyAgent
            // If sending to http via proxy, usually HttpProxyAgent (or standard http proxy behavior)

            if (isHttps) {
                httpsAgent = new HttpsProxyAgent(proxyUrl, agentOptions);
            } else {
                httpsAgent = new HttpProxyAgent(proxyUrl);
            }
            httpAgent = httpsAgent; // Reuse
        } else {
            // No Proxy
            httpsAgent = new (require('https').Agent)(agentOptions);
            httpAgent = new (require('http').Agent)(agentOptions);
        }

        this.log(`Methods: POST ${endpoint} `);
        this.log('Headers:', requestHeaders);
        this.log('Body:', xml);

        const startTime = Date.now();
        try {
            const response = await axios.post(endpoint, xml, {
                headers: requestHeaders,
                httpsAgent: httpsAgent,
                httpAgent: httpAgent,
                cancelToken: this.cancelTokenSource.token,
                transformResponse: [(data) => data] // Do not parse JSON automatically, define raw
            });
            const endTime = Date.now();
            const timeTaken = endTime - startTime;

            this.log('Response Status:', response.status);
            this.log('Response Body:', response.data);

            this.cancelTokenSource = null;
            return {
                success: true,
                result: null, // Raw mode doesn't parse to JSON result automatically
                headers: response.headers,
                rawResponse: response.data,
                rawRequest: xml,
                timeTaken: timeTaken
            };

        } catch (error: any) {
            const endTime = Date.now();
            const timeTaken = endTime - startTime;
            this.cancelTokenSource = null;
            if (axios.isCancel(error)) {
                this.log('Request canceled by user');
                return {
                    success: false,
                    error: "Request Canceled",
                    rawResponse: null,
                    rawRequest: xml,
                    timeTaken: timeTaken
                };
            }
            this.log('Request failed:', error.message);
            if (error.response) {
                this.log('Error Response:', error.response.data);
            }
            return {
                success: false,
                error: error.message,
                rawResponse: error.response ? error.response.data : null,
                rawRequest: xml,
                timeTaken: timeTaken
            };
        }
    }

    /**
     * Execute a multipart SOAP request with attachments (SwA)
     */
    async executeMultipartRequest(
        endpoint: string,
        operation: string,
        xml: string,
        formData: any,
        headers?: any
    ): Promise<any> {
        if (!endpoint) {
            return {
                success: false,
                error: "Invalid URL: Endpoint is missing.",
                rawResponse: null,
                rawRequest: xml,
                timeTaken: 0
            };
        }

        // Get SOAPAction from WSDL if client exists
        let soapAction = '';
        if (this.client) {
            const definitions = (this.client as any).wsdl.definitions;
            for (const bindingName in definitions.bindings) {
                const binding = definitions.bindings[bindingName];
                if (binding.operations && binding.operations[operation]) {
                    soapAction = binding.operations[operation].soapAction;
                    break;
                }
            }
        }

        // Prepare Headers - FormData sets its own Content-Type with boundary
        const requestHeaders: any = {
            ...formData.getHeaders(),
            ...headers
        };
        if (soapAction) {
            requestHeaders['SOAPAction'] = soapAction;
        }

        // Cancel token
        const CancelToken = axios.CancelToken;
        this.cancelTokenSource = CancelToken.source();

        // Proxy/SSL settings
        const { proxyUrl, strictSSL } = this.getProxySettings();
        const agentOptions = { keepAlive: false, rejectUnauthorized: strictSSL };

        let httpsAgent: any;
        let httpAgent: any;

        if (proxyUrl) {
            const { HttpsProxyAgent } = require('https-proxy-agent');
            const { HttpProxyAgent } = require('http-proxy-agent');
            const isHttps = endpoint.toLowerCase().startsWith('https');

            if (isHttps) {
                httpsAgent = new HttpsProxyAgent(proxyUrl, agentOptions);
            } else {
                httpsAgent = new HttpProxyAgent(proxyUrl);
            }
            httpAgent = httpsAgent;
        } else {
            httpsAgent = new (require('https').Agent)(agentOptions);
            httpAgent = new (require('http').Agent)(agentOptions);
        }

        this.log(`Multipart POST ${endpoint}`);
        this.log('Headers:', requestHeaders);

        const startTime = Date.now();
        try {
            const response = await axios.post(endpoint, formData, {
                headers: requestHeaders,
                httpsAgent: httpsAgent,
                httpAgent: httpAgent,
                cancelToken: this.cancelTokenSource.token,
                transformResponse: [(data) => data],
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });
            const endTime = Date.now();
            const timeTaken = endTime - startTime;

            this.log('Response Status:', response.status);
            this.log('Response Body:', response.data);

            this.cancelTokenSource = null;
            return {
                success: true,
                result: null,
                headers: response.headers,
                rawResponse: response.data,
                rawRequest: xml,
                timeTaken: timeTaken
            };

        } catch (error: any) {
            const endTime = Date.now();
            const timeTaken = endTime - startTime;
            this.cancelTokenSource = null;

            if (axios.isCancel(error)) {
                this.log('Request canceled by user');
                return {
                    success: false,
                    error: "Request Canceled",
                    rawResponse: null,
                    rawRequest: xml,
                    timeTaken: timeTaken
                };
            }

            this.log('Multipart request failed:', error.message);
            if (error.response) {
                this.log('Error Response:', error.response.data);
            }
            return {
                success: false,
                error: error.message,
                rawResponse: error.response ? error.response.data : null,
                rawRequest: xml,
                timeTaken: timeTaken
            };
        }
    }
}
