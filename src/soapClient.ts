import * as soap from 'soap';
import axios from 'axios';
import { SoapService, SoapSchemaNode } from './models';
import { WsdlParser } from './WsdlParser';

export class SoapClient {
    private client: soap.Client | null = null;
    private currentRequest: any = null;
    private cancelTokenSource: any = null;
    private outputChannel: any = null;
    private wsdlParser: WsdlParser;

    constructor(outputChannel?: any) {
        this.outputChannel = outputChannel;
        this.wsdlParser = new WsdlParser(outputChannel);
    }

    public log(message: string, data?: any) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
            if (data) {
                this.outputChannel.appendLine(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
            }
        }
    }

    async parseWsdl(url: string, localWsdlDir?: string): Promise<SoapService[]> {
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
        if (!this.client) {
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

            // node-soap doesn't easily support overriding endpoint per-request in this mode without changing client options
            // But we mostly use Raw XML mode. 
            // If we need to support it here, we'd need to set client.setEndpoint(url) but that persists.
            // For now, only applying to Raw logic.

            const req = method(args, (err: any, result: any, rawResponse: any, soapHeader: any, rawRequest: any) => {
                this.currentRequest = null;
                if (err) {
                    return resolve({
                        success: false,
                        error: err,
                        rawResponse: rawResponse,
                        rawRequest: rawRequest
                    });
                }
                resolve({
                    success: true,
                    result: result,
                    rawResponse: rawResponse,
                    rawRequest: rawRequest
                });
            });

            this.currentRequest = req;
        });
    }

    private async executeRawRequest(operation: string, xml: string, headers: any, endpointOverride?: string): Promise<any> {
        if (!this.client) {
            throw new Error("Client not initialized");
        }

        // 1. Find Endpoint
        let endpoint = endpointOverride || '';
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

        if (!endpoint) {
            return {
                success: false,
                error: "Could not determine service endpoint URL.",
                rawResponse: null,
                rawRequest: xml
            };
        }

        // 2. Find SOAPAction
        let soapAction = '';
        for (const bindingName in definitions.bindings) {
            const binding = definitions.bindings[bindingName];
            if (binding.operations && binding.operations[operation]) {
                soapAction = binding.operations[operation].soapAction;
                break;
            }
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

        const agentOptions = { keepAlive: false, rejectUnauthorized: false };
        const httpsAgent = new (require('https').Agent)(agentOptions);
        const httpAgent = new (require('http').Agent)(agentOptions);

        this.log(`Methods: POST ${endpoint}`);
        this.log('Headers:', requestHeaders);
        this.log('Body:', xml);

        try {
            const response = await axios.post(endpoint, xml, {
                headers: requestHeaders,
                httpsAgent: httpsAgent,
                httpAgent: httpAgent,
                cancelToken: this.cancelTokenSource.token,
                transformResponse: [(data) => data] // Do not parse JSON automatically, define raw
            });

            this.log('Response Status:', response.status);
            this.log('Response Body:', response.data);

            this.cancelTokenSource = null;
            return {
                success: true,
                result: null, // Raw mode doesn't parse to JSON result automatically
                headers: response.headers,
                rawResponse: response.data,
                rawRequest: xml
            };

        } catch (error: any) {
            this.cancelTokenSource = null;
            if (axios.isCancel(error)) {
                this.log('Request canceled by user');
                return {
                    success: false,
                    error: "Request Canceled",
                    rawResponse: null,
                    rawRequest: xml
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
                rawRequest: xml
            };
        }
    }
}
