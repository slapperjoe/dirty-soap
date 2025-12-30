import * as soap from 'soap';
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

        try {
            const client = await soap.createClientAsync(url, options);
            this.client = client;
            this.log('WSDL Client created successfully.');

            const description = client.describe();
            const services: SoapService[] = [];

            // Try to get targetNamespace from definitions
            const definitions = (client as any).wsdl.definitions;
            let targetNamespace = definitions.targetNamespace || definitions.$targetNamespace || '';

            // Explicitly check for the property if node-soap structure is quirky
            if (!targetNamespace && definitions['$targetNamespace']) {
                targetNamespace = definitions['$targetNamespace'];
            }
            if (!targetNamespace && definitions['targetNamespace']) {
                targetNamespace = definitions['targetNamespace'];
            }

            // Fallback: Check if 'tns' matches a namespace in xmlns
            if (!targetNamespace) {
                // Try to find it in attributes (keys starting with xmlns or targetNamespace)
                for (const key in definitions) {
                    if (key.toLowerCase() === 'targetnamespace') {
                        targetNamespace = definitions[key];
                        break;
                    }
                }
            }
            if (!targetNamespace) {
                // Last resort: use the definitions name if it looks like a URI? No.
                this.log('WARNING: Could not find targetNamespace in definitions.');
            }

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

                    // Attempt to find endpoint location for this port
                    let endpoint = '';
                    if (definitions.services[serviceName] && definitions.services[serviceName].ports[portName]) {
                        endpoint = definitions.services[serviceName].ports[portName].location;
                        this.log(`    Found Endpoint for ${portName}: ${endpoint}`);
                    } else {
                        this.log(`    WARNING: No endpoint found for ${portName} in definitions.`);
                        // Try to log what is available
                        if (definitions.services[serviceName]) {
                            this.log(`    Available ports in service: ${Object.keys(definitions.services[serviceName].ports)}`);
                        }
                    }

                    for (const opName in port) {
                        operations.push({
                            name: opName,
                            input: port[opName].input,
                            output: port[opName].output,
                            targetNamespace: targetNamespace,
                            portName: portName,
                            originalEndpoint: endpoint // Assigned!
                        });
                    }
                    this.log(`    Found ${operations.length} operations in port.`);
                }

                services.push({
                    name: serviceName,
                    ports: ports,
                    operations: operations,
                    targetNamespace: targetNamespace // Populate on Service
                });
                this.log(`    Service ${serviceName} TargetNamespace: ${targetNamespace}`);
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
        const buildNode = (name: string, typeName: string, doc = '', minOccurs = '1'): SoapSchemaNode => {
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
                const sequence = typeDef.sequence || typeDef.all;

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
