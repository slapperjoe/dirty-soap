import * as vscode from 'vscode';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as soap from 'soap';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { SoapService, SoapOperation, SoapSchemaNode } from './models';

export class WsdlParser {
    private client: soap.Client | null = null;
    private outputChannel: any = null;

    constructor(outputChannel?: any) {
        this.outputChannel = outputChannel;
    }

    private log(message: string, data?: any) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
            if (data) {
                this.outputChannel.appendLine(typeof data === 'string' ? data : JSON.stringify(data, null, 2));
            }
        }
    }

    public getClient(): soap.Client | null {
        return this.client;
    }

    public async parseWsdl(url: string, localWsdlDir?: string): Promise<SoapService[]> {
        this.log(`Attempting to parse WSDL: ${url}`);

        const options: any = {};

        // Always use our custom request handler to ensure Axios is used (better proxy/header support)
        // Always use our custom request handler to ensure Axios is used (better proxy/header support)
        options.request = (requestUrl: any, data: any, callback: any, exheaders: any, exoptions: any) => {
            // Check if requestUrl is an object (some soap versions/calls pass an object)
            let actualUrl = requestUrl;
            if (typeof requestUrl !== 'string') {
                actualUrl = requestUrl.url || requestUrl.href || JSON.stringify(requestUrl);
                this.log(`Intercepted request object. Resolved URL: ${actualUrl}`);
            } else {
                this.log(`Intercepted request: ${requestUrl}`);
            }

            // 1. Try Local File (if enabled)
            if (localWsdlDir) {
                try {
                    // Naive filename extraction: take last part of URL, remove query params
                    const filename = actualUrl.split('/').pop()?.split('?')[0] || '';
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
                                body: fileContent
                            };
                            callback(null, response, fileContent);
                            return Promise.resolve(response);
                        } else {
                            this.log(`Local file not found: ${filename} (checked root and imports)`);
                        }
                    }
                } catch (e) {
                    this.log('Error checking local file:', e);
                }
            }

            // 2. Fallback to Network (Axios)
            this.log('Performing network request via Axios (SSL verification disabled)...');

            // 2. Fallback to Network (Axios)
            this.log('Performing network request via Axios (SSL verification disabled)...');

            // --- PROXY DETECTION ---
            const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
            const vscodeProxy = vscode.workspace.getConfiguration('http').get<string>('proxy');
            const proxyUrl = vscodeProxy || envProxy;

            let httpsAgent: any;

            if (proxyUrl) {
                this.log(`Detected Proxy Configuration: ${proxyUrl}`);
                try {
                    // Use https-proxy-agent to correctly tunnel HTTPS over the proxy
                    // AND allow us to set rejectUnauthorized: false
                    httpsAgent = new HttpsProxyAgent(proxyUrl, {
                        rejectUnauthorized: false
                    } as any);
                    this.log('Using HttpsProxyAgent for tunneling.');
                } catch (e) {
                    this.log(`Failed to create proxy agent: ${e}`);
                    // Fallback to standard agent
                    httpsAgent = new (require('https').Agent)({
                        rejectUnauthorized: false
                    });
                }
            } else {
                this.log('No explicit proxy configuration found. Using direct connection (SSL check disabled).');
                httpsAgent = new (require('https').Agent)({
                    rejectUnauthorized: false
                });
            }

            const method = data ? 'POST' : 'GET';
            // Mimic a standard browser to avoid WAF 503s
            const headers = {
                ...exheaders,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive'
            };

            return axios({
                method: method,
                url: actualUrl,
                data: data,
                headers: headers,
                httpsAgent: httpsAgent,
                proxy: false, // Important: Disable axios proxy handling, let the Agent handle tunneling
                ...exoptions
            }).then((response) => {
                this.log(`Network request success: ${response.status}`);
                if (typeof callback === 'function') {
                    callback(null, response, response.data);
                }
                return response;
            }).catch((error) => {
                this.log(`Network request failed: ${error.message}`);
                // Log detailed error for 503/403 etc
                if (error.response) {
                    this.log(`Status: ${error.response.status}`);
                    this.log(`Data: ${typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)}`);
                }
                if (typeof callback === 'function') {
                    callback(error, error.response, error.response ? error.response.data : null);
                }
                throw error;
            });
        };

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
            if (error.response) {
                this.log('Error Response Body:', error.response.data);
            }
            throw error;
        }
    }

    public getOperationSchema(operationName: string, portName?: string): SoapSchemaNode | null {
        if (!this.client) return null;

        const definitions = (this.client as any).wsdl.definitions;

        // Let's try to find the operation in definitions.portTypes to get the input message name.
        const portTypes = definitions.portTypes;
        let inputMessageName = '';

        for (const ptName in portTypes) {
            const pt = portTypes[ptName];
            if (pt.methods && pt.methods[operationName]) {
                inputMessageName = pt.methods[operationName].input['$name'];
                break;
            }
        }

        if (!inputMessageName) {
            inputMessageName = operationName;
        }

        // Helper to find Type/Element in schemas
        const schemas = definitions.schemas;
        const findDefinition = (qname: string, kind: 'element' | 'type') => {
            const localName = qname.split(':').pop() || qname;
            for (const sKey in schemas) {
                const s = schemas[sKey];
                if (kind === 'element' && s.elements && s.elements[localName]) return s.elements[localName];
                if (kind === 'type' && s.complexTypes && s.complexTypes[localName]) return s.complexTypes[localName];
                if (kind === 'type' && s.types && s.types[localName]) return s.types[localName];
            }
            return null;
        };

        // Recursive Build
        const buildNode = (name: string, typeName: string, doc: string = '', minOccurs: string = '1'): SoapSchemaNode => {
            const node: SoapSchemaNode = {
                name,
                type: typeName,
                kind: 'simple',
                minOccurs,
                documentation: doc
            };

            const typeDef = findDefinition(typeName, 'type');
            if (typeDef) {
                node.kind = 'complex';
                node.documentation = typeDef.annotation?.documentation || doc;

                const children: SoapSchemaNode[] = [];
                let sequence = typeDef.sequence || typeDef.all;

                if (sequence) {
                    sequence.forEach((child: any) => {
                        children.push(buildNode(
                            child.$name,
                            child.$type || child.type,
                            child.annotation?.documentation,
                            child.minOccurs
                        ));
                    });
                }
                if (children.length > 0) node.children = children;
            }

            return node;
        };

        return buildNode(operationName, operationName);
    }
}
