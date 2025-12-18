import * as soap from 'soap';
import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export interface SoapOperation {
    name: string;
    input: any;
    output: any;
    description?: string;
    targetNamespace?: string;
}

export interface SoapService {
    name: string;
    ports: string[];
    operations: SoapOperation[];
}

export class SoapClient {
    private client: soap.Client | null = null;
    private currentRequest: any = null;
    private cancelTokenSource: any = null;
    private outputChannel: any = null;

    constructor(outputChannel?: any) {
        this.outputChannel = outputChannel;
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
        this.log(`Attempting to parse WSDL: ${url}`);

        const options: any = {};
        if (localWsdlDir) {
            this.log(`Local WSDL directory enabled: ${localWsdlDir}`);
            options.request = (requestUrl: string, data: any, callback: any, exheaders: any, exoptions: any) => {
                this.log(`Intercepted request: ${requestUrl}`);

                // 1. Try Local File
                try {
                    // Naive filename extraction: take last part of URL, remove query params
                    const filename = requestUrl.split('/').pop()?.split('?')[0] || '';
                    if (filename) {
                        let localPath = path.join(localWsdlDir, filename);

                        // Check if file exists in root wsdl_files
                        if (!fs.existsSync(localPath)) {
                            // Check in 'imports' subdirectory
                            localPath = path.join(localWsdlDir, 'imports', filename);
                        }

                        if (fs.existsSync(localPath)) {
                            this.log(`Serving local file: ${localPath}`);
                            const fileContent = fs.readFileSync(localPath, 'utf8');
                            const response = {
                                statusCode: 200,
                                headers: {},
                                body: fileContent // node-soap sometimes checks response.body
                            };
                            callback(null, response, fileContent);
                            return;
                        } else {
                            this.log(`Local file not found: ${filename} (checked root and imports)`);
                        }
                    }
                } catch (e) {
                    this.log('Error checking local file:', e);
                }

                // 2. Fallback to Network (Axios)
                this.log('Falling back to network request...');
                const method = data ? 'POST' : 'GET';
                const headers = { ...exheaders };

                axios({
                    method: method,
                    url: requestUrl,
                    data: data,
                    headers: headers,
                    ...exoptions
                }).then((response) => {
                    this.log(`Network request success: ${response.status}`);
                    // Ensure response structure matches what node-soap expects
                    // node-soap often expects response object + body
                    callback(null, response, response.data);
                }).catch((error) => {
                    this.log(`Network request failed: ${error.message}`);
                    callback(error, error.response, error.response ? error.response.data : null);
                });
            };
        }

        try {
            const client = await soap.createClientAsync(url, options);
            this.client = client;
            this.log('WSDL Client created successfully.');

            const description = client.describe();
            const services: SoapService[] = [];

            // Try to get targetNamespace from definitions
            const definitions = (client as any).wsdl.definitions;
            const targetNamespace = definitions.targetNamespace || definitions.$targetNamespace || '';

            this.log(`Target Namespace: ${targetNamespace}`);

            // Detailed Debugging for Imports and Schemas
            if (definitions.imports) {
                const importKeys = Object.keys(definitions.imports);
                this.log(`Found ${importKeys.length} Imports.`);
                this.log('Import Namespaces:', importKeys);
            } else {
                this.log('No imports found in definitions.');
            }

            if (definitions.schemas) {
                const schemaKeys = Object.keys(definitions.schemas);
                this.log(`Found ${schemaKeys.length} Schemas.`);
                schemaKeys.forEach(ns => {
                    this.log(`- Schema NS: ${ns}`);
                });
            } else {
                this.log('No schemas found in definitions.');
            }

            for (const serviceName in description) {
                this.log(`Processing Service: ${serviceName}`);
                const service = description[serviceName];
                const ports: string[] = [];
                const operations: SoapOperation[] = [];

                for (const portName in service) {
                    this.log(`  Processing Port: ${portName}`);
                    ports.push(portName);
                    const port = service[portName];
                    for (const opName in port) {
                        operations.push({
                            name: opName,
                            input: port[opName].input,
                            output: port[opName].output,
                            targetNamespace: targetNamespace // Pass it down
                        });
                    }
                    this.log(`    Found ${operations.length} operations in port.`);
                }

                services.push({
                    name: serviceName,
                    ports: ports,
                    operations: operations
                });
            }

            this.log(`Successfully parsed ${services.length} services.`);
            return services;
        } catch (error: any) {
            console.error('Error parsing WSDL:', error);
            this.log('CRITICAL ERROR parsing WSDL:', error.message);
            if (error.stack) {
                this.log('Stack Trace:', error.stack);
            }
            // Log additional properties if available (e.g. from axios or soap lib)
            if (error.response) {
                this.log('Error Response Body:', error.response.data);
            }
            throw error;
        }
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
            return this.executeRawRequest(operation, args, headers);
        }

        return new Promise((resolve, reject) => {
            if (!this.client) return reject('Client not initialized');

            const service = Object.keys(this.client.describe())[0]; // Naive assumption: first service
            const port = Object.keys(this.client.describe()[service])[0]; // Naive assumption: first port

            const method = this.client[operation];
            if (typeof method !== 'function') {
                return reject(`Operation ${operation} not found on client`);
            }

            if (headers) {
                this.client.addSoapHeader(headers);
            }

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

    private async executeRawRequest(operation: string, xml: string, headers: any): Promise<any> {
        if (!this.client) {
            throw new Error("Client not initialized");
        }

        // 1. Find Endpoint
        // Try to find the service/port definitions to locate the address
        let endpoint = '';
        const definitions = (this.client as any).wsdl.definitions;
        // Naive iteration to find first matching port location
        // Improvements: use selected service/port if available
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

        if (!endpoint) {
            // Fallback to WSDL options endpoint
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

        this.log(`Methods: POST ${endpoint}`);
        this.log('Headers:', requestHeaders);
        this.log('Body:', xml);

        try {
            const response = await axios.post(endpoint, xml, {
                headers: requestHeaders,
                cancelToken: this.cancelTokenSource.token,
                transformResponse: [(data) => data] // Do not parse JSON automatically, define raw
            });

            this.log('Response Status:', response.status);
            this.log('Response Body:', response.data);

            this.cancelTokenSource = null;
            return {
                success: true,
                result: null, // Raw mode doesn't parse to JSON result automatically
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
