import * as soap from 'soap';
import { ApiService, ServiceOperation, SchemaNode } from '../shared/src/models';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as fs from 'fs';
import * as path from 'path';

export interface WsdlParserOptions {
    proxyUrl?: string;
    strictSSL?: boolean;
}

export class WsdlParser {
    private client: soap.Client | null = null;
    private outputChannel: any = null;
    private options: WsdlParserOptions;

    constructor(outputChannel?: any, options: WsdlParserOptions = {}) {
        this.outputChannel = outputChannel;
        this.options = options;
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

    public async parseWsdl(url: string, localWsdlDir?: string): Promise<ApiService[]> {
        this.log(`Attempting to parse WSDL: ${url}`);
        if (localWsdlDir) {
            this.log(`Using local WSDL directory for schema imports: ${localWsdlDir}`);
        }

        const soapOptions: any = {};

        // Default strictSSL to true if undefined
        const strictSSL = this.options.strictSSL !== false;

        // Determine Proxy URL: Options > Env Vars
        const proxyUrl = this.options.proxyUrl ||
            process.env.HTTPS_PROXY || process.env.https_proxy ||
            process.env.HTTP_PROXY || process.env.http_proxy;

        let agent: any = undefined;
        
        if (proxyUrl) {
            this.log(`Using proxy: ${proxyUrl}`);
            this.log(`Strict SSL: ${strictSSL}`);

            const isHttps = url.toLowerCase().startsWith('https');
            const agentOptions = { rejectUnauthorized: strictSSL };

            agent = isHttps
                ? new HttpsProxyAgent(proxyUrl, agentOptions)
                : new HttpProxyAgent(proxyUrl);

            // node-soap accepts http/https agents directly via wsdl_options
            soapOptions.wsdl_options = {
                agent: agent
            };
        } else {
            // No Proxy
            if (!strictSSL) {
                this.log(`No proxy set, but Strict SSL is DISABLED.`);
                agent = new (require('https').Agent)({ rejectUnauthorized: false });
                soapOptions.wsdl_options = {
                    agent: agent
                };
            }
        }

        // If localWsdlDir is provided, override import locations to use local files
        if (localWsdlDir && fs.existsSync(localWsdlDir)) {
            this.log(`Setting up local file interceptor for directory: ${localWsdlDir}`);
            
            // Build a namespace cache from local XSD files
            const namespaceCache = new Map<string, string>();
            try {
                const files = fs.readdirSync(localWsdlDir);
                for (const file of files) {
                    if (file.endsWith('.xsd') || file.endsWith('.wsdl')) {
                        const fullPath = path.join(localWsdlDir, file);
                        const content = fs.readFileSync(fullPath, 'utf8');
                        const targetNsMatch = content.match(/targetNamespace=["']([^"']+)["']/);
                        if (targetNsMatch) {
                            namespaceCache.set(targetNsMatch[1], fullPath);
                            this.log(`  Cached: ${file} -> ${targetNsMatch[1]}`);
                        }
                    }
                }
                this.log(`Built cache with ${namespaceCache.size} schemas`);
            } catch (err) {
                this.log(`Error building cache: ${err}`);
            }

            // Override import locations to redirect remote URLs to local files
            if (!soapOptions.wsdl_options) {
                soapOptions.wsdl_options = {};
            }
            
            // Store original agent if it exists
            const originalAgent = soapOptions.wsdl_options.agent;
            
            soapOptions.wsdl_options.overrideImportLocation = (includePath: string, _currentWsdl: string, originalLocation: string) => {
                this.log(`Import request: ${originalLocation}`);
                
                // If it's a remote URL (starts with http/https), redirect to local directory
                if (originalLocation && /^https?:\/\//i.test(originalLocation)) {
                    // Check if we have any local XSD files
                    if (namespaceCache.size > 0) {
                        // Return any local XSD file from the directory
                        // node-soap will load it and use namespace matching to resolve imports
                        const firstFile = Array.from(namespaceCache.values())[0];
                        this.log(`  -> Redirecting to local directory: ${path.dirname(firstFile)}`);
                        
                        // Return a placeholder file in the local directory
                        // node-soap will scan the directory and match by namespace
                        return firstFile;
                    } else {
                        // No local files - suppress remote fetch to avoid ENOTFOUND errors
                        this.log(`  -> No local files found, suppressing remote fetch`);
                        // Return a non-existent file to prevent axios from trying to fetch
                        return '';
                    }
                }
                
                // For non-remote imports, use the default includePath
                return includePath;
            };
            
            // Restore agent if it was set
            if (originalAgent) {
                soapOptions.wsdl_options.agent = originalAgent;
            }
        }

        try {
            const client = await soap.createClientAsync(url, soapOptions);
            this.client = client;
            this.log('WSDL Client created successfully.');

            const description = client.describe();
            const services: ApiService[] = [];

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
                const operations: ServiceOperation[] = [];

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
                        // Get the full schema for this operation
                        const fullSchema = this.getOperationSchema(opName, portName);
                        
                        operations.push({
                            name: opName,
                            input: port[opName].input,
                            output: port[opName].output,
                            targetNamespace: targetNamespace,
                            portName: portName,
                            originalEndpoint: endpoint, // Assigned!
                            fullSchema: fullSchema // Include deep schema tree
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
            // Suppress verbose axios error logging (config, request objects, etc.)
            // Only log essential error information
            this.log('CRITICAL ERROR parsing WSDL:', error.message || error);
            
            // Check if this looks like a JSON/OpenAPI file being parsed as XML (fallback detection)
            const errorMessage = error.message || String(error);
            if (errorMessage.includes('Text data outside of root node') || 
                errorMessage.includes('Unexpected token')) {
                // Check if URL suggests it might be an OpenAPI spec
                if (url.toLowerCase().match(/\.(json|yaml|yml)$/)) {
                    const enhancedError = new Error(
                        `Failed to parse as WSDL/XML. This appears to be a JSON/YAML file. ` +
                        `If this is an OpenAPI/Swagger specification, please ensure it's being parsed correctly.`
                    );
                    this.log('Detected possible JSON/YAML file with XML parsing error:', url);
                    throw enhancedError;
                }
            }
            
            // If it's an axios error, log only the essential details
            if (error.code) {
                this.log(`Error Code: ${error.code}`);
            }
            if (error.hostname) {
                this.log(`Hostname: ${error.hostname}`);
            }
            if (error.response) {
                this.log('HTTP Status:', error.response.status || 'N/A');
                this.log('Response Body:', error.response.data || 'N/A');
            }
            
            // Log stack trace for debugging (but not the full axios config)
            if (error.stack && !error.config) {
                this.log('Stack Trace:', error.stack);
            }
            
            throw error;
        }
    }

    public getOperationSchema(operationName: string, _portName?: string): SchemaNode | null {
        if (!this.client) return null;

        const definitions = (this.client as any).wsdl.definitions;

        // Log available schemas
        const schemas = definitions.schemas;
        if (schemas) {
            const schemaKeys = Object.keys(schemas);
            this.log(`[getOperationSchema] Available schemas: ${schemaKeys.length} namespaces`);
            schemaKeys.forEach(key => {
                const s = schemas[key];
                const elemCount = s.elements ? Object.keys(s.elements).length : 0;
                const typeCount = (s.complexTypes ? Object.keys(s.complexTypes).length : 0) + (s.types ? Object.keys(s.types).length : 0);
                this.log(`  - ${key}: ${elemCount} elements, ${typeCount} types`);
            });
        } else {
            this.log(`[getOperationSchema] WARNING: No schemas found in definitions!`);
        }

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

        this.log(`[getOperationSchema] Operation: ${operationName}, Input message: ${inputMessageName}`);
        
        // Now resolve the message to find the actual element
        const messages = definitions.messages;
        let inputElementName = inputMessageName;
        
        // Debug: Log the messages structure
        this.log(`[getOperationSchema] DEBUG: messages object exists: ${!!messages}`);
        if (messages) {
            this.log(`[getOperationSchema] DEBUG: messages keys: ${Object.keys(messages).join(', ')}`);
            if (messages[inputMessageName]) {
                this.log(`[getOperationSchema] DEBUG: Found message, structure: ${JSON.stringify(Object.keys(messages[inputMessageName]))}`);
            }
        }
        
        // CRITICAL: Extract element name from message
        this.log(`[getOperationSchema] TRACE: Starting message resolution for: ${inputMessageName}`);
        this.log(`[getOperationSchema] TRACE: messages type: ${typeof messages}, exists: ${!!messages}`);
        this.log(`[getOperationSchema] TRACE: messages[inputMessageName] type: ${typeof messages?.[inputMessageName]}, exists: ${!!messages?.[inputMessageName]}`);
        
        if (messages && messages[inputMessageName]) {
            const message = messages[inputMessageName];
            this.log(`[getOperationSchema] TRACE: message object retrieved, keys: ${JSON.stringify(Object.keys(message))}`);
            
            // Log the full message structure (shallow)
            this.log(`[getOperationSchema] DEBUG: message content: ${JSON.stringify(message, (key, value) => {
                if (typeof value === 'function') return '[Function]';
                if (typeof value === 'object' && value !== null && key !== '') return '[Object]';
                return value;
            })}`);
            
            // Messages have parts that reference elements
            const parts = message.parts;
            this.log(`[getOperationSchema] DEBUG: parts object exists: ${!!parts}, type: ${typeof parts}`);
            
            if (parts) {
                this.log(`[getOperationSchema] DEBUG: parts keys: ${Object.keys(parts).join(', ')}`);
                // CRITICAL FIX: Filter out undefined/null part keys
                const partKeys = Object.keys(parts).filter(key => key !== 'undefined' && key !== 'null' && parts[key] != null);
                if (partKeys.length > 0) {
                    const firstPartKey = partKeys[0];
                    const firstPart = parts[firstPartKey];
                    this.log(`[getOperationSchema] DEBUG: firstPart keys: ${JSON.stringify(Object.keys(firstPart))}`);
                    this.log(`[getOperationSchema] DEBUG: firstPart.element: ${firstPart.element}, firstPart.$element: ${firstPart.$element}`);
                    
                    const elementRef = firstPart.element || firstPart.$element;
                    if (elementRef) {
                        // Remove namespace prefix if present (e.g., "tns:GetOrganisationRequest" -> "GetOrganisationRequest")
                        inputElementName = elementRef.split(':').pop() || elementRef;
                        this.log(`[getOperationSchema]   Message resolves to element: ${inputElementName}`);
                    } else {
                        this.log(`[getOperationSchema] WARNING: No element found in part, checking for type...`);
                        const typeRef = firstPart.type || firstPart.$type;
                        if (typeRef) {
                            inputElementName = typeRef.split(':').pop() || typeRef;
                            this.log(`[getOperationSchema]   Message part has type (not element): ${inputElementName}`);
                        }
                    }
                }
            } else {
                this.log(`[getOperationSchema] DEBUG: No parts found, message might be document/literal wrapped`);
                
                // Try to use the element directly from the message if it exists
                const elementRef = message.element || message.$element;
                if (elementRef) {
                    inputElementName = elementRef.split(':').pop() || elementRef;
                    this.log(`[getOperationSchema]   Message has direct element: ${inputElementName}`);
                } else if (message.children && Array.isArray(message.children) && message.children.length > 0) {
                    // Document/literal wrapped style: element reference is in children[0].$element
                    this.log(`[getOperationSchema] DEBUG: message.children exists, length=${message.children.length}`);
                    this.log(`[getOperationSchema] DEBUG: children[0] keys: ${JSON.stringify(Object.keys(message.children[0]))}`);
                    this.log(`[getOperationSchema] DEBUG: children[0] content: ${JSON.stringify(message.children[0], (key, value) => {
                        if (typeof value === 'function') return '[Function]';
                        if (typeof value === 'object' && value !== null && key !== '') return '[Object]';
                        return value;
                    })}`);
                    
                    const childRef = message.children[0].$element || message.children[0].element;
                    if (childRef) {
                        inputElementName = childRef.split(':').pop() || childRef;
                        this.log(`[getOperationSchema]   Message resolves via children[0].$element to: ${inputElementName}`);
                    } else {
                        this.log(`[getOperationSchema] WARNING: children[0] has no $element or element property`);
                    }
                } else {
                    this.log(`[getOperationSchema] WARNING: No children array found in message`);
                }
            }
        } else {
            this.log(`[getOperationSchema]   WARNING: Message not found in definitions.messages, using name as-is`);
        }
        
        this.log(`[getOperationSchema] TRACE: Final inputElementName: ${inputElementName}`);
        
        // Log all available schemas
        this.log(`[getOperationSchema] TRACE: Available schemas: ${Object.keys(schemas).join(', ')}`);
        Object.keys(schemas).forEach(sKey => {
            const s = schemas[sKey];
            const elemKeys = s.elements ? Object.keys(s.elements) : [];
            const typeKeys = s.complexTypes ? Object.keys(s.complexTypes) : [];
            const simpleTypeKeys = s.types ? Object.keys(s.types) : [];
            this.log(`[getOperationSchema] TRACE:   Schema ${sKey}:`);
            this.log(`[getOperationSchema] TRACE:     elements: ${elemKeys.join(', ') || '(none)'}`);
            this.log(`[getOperationSchema] TRACE:     complexTypes: ${typeKeys.join(', ') || '(none)'}`);
            this.log(`[getOperationSchema] TRACE:     types: ${simpleTypeKeys.join(', ') || '(none)'}`);
        });

        // Helper to find Type/Element in schemas (reuse schemas from above)
        const findDefinition = (qname: string, kind: 'element' | 'type') => {
            const localName = qname.split(':').pop() || qname;
            this.log(`[findDefinition] Looking for ${kind} '${qname}' (localName: '${localName}')`);
            
            for (const sKey in schemas) {
                const s = schemas[sKey];
                if (kind === 'element' && s.elements && s.elements[localName]) {
                    this.log(`[findDefinition] FOUND element '${localName}' in schema '${sKey}'`);
                    return s.elements[localName];
                }
                if (kind === 'type' && s.complexTypes && s.complexTypes[localName]) {
                    this.log(`[findDefinition] FOUND complexType '${localName}' in schema '${sKey}'`);
                    return s.complexTypes[localName];
                }
                if (kind === 'type' && s.types && s.types[localName]) {
                    this.log(`[findDefinition] FOUND type '${localName}' in schema '${sKey}'`);
                    return s.types[localName];
                }
            }
            this.log(`[findDefinition] NOT FOUND: ${kind} '${localName}'`);
            return null;
        };

        // Recursive Build
        const buildNode = (name: string, typeOrElementName: string, doc = '', minOccurs = '1', isElement = false, depth = 0): SchemaNode => {
            const indent = '  '.repeat(depth);
            this.log(`${indent}[buildNode] name=${name}, type=${typeOrElementName}, isElement=${isElement}`);
            
            const node: SchemaNode = {
                name,
                type: typeOrElementName,
                kind: 'simple' as const,
                minOccurs,
                documentation: doc
            };

            // First check if this is an element reference
            let typeDef = null;
            let actualTypeName = typeOrElementName;
            
            if (isElement) {
                const elementDef = findDefinition(typeOrElementName, 'element');
                this.log(`${indent}[buildNode] Looking for element '${typeOrElementName}': ${elementDef ? 'FOUND' : 'NOT FOUND'}`);
                if (elementDef) {
                    // Element found - get its type
                    actualTypeName = elementDef.$type || elementDef.type || typeOrElementName;
                    this.log(`${indent}[buildNode] Element type resolved to: ${actualTypeName}`);
                    node.documentation = elementDef.annotation?.documentation || doc;
                    node.type = actualTypeName;
                }
            }
            
            // Now look up the type definition
            typeDef = findDefinition(actualTypeName, 'type');
            this.log(`${indent}[buildNode] Looking for type '${actualTypeName}': ${typeDef ? 'FOUND' : 'NOT FOUND'}`);
            
            if (typeDef) {
                node.kind = 'complex';
                node.documentation = typeDef.annotation?.documentation || node.documentation;

                const children: SchemaNode[] = [];
                
                // node-soap structure can be complex:
                // - typeDef.sequence: array of elements (standard XSD structure)
                // - typeDef.all: array of elements (XSD all group)
                // - typeDef.children: array that may contain a sequence/all/choice/complexContent wrapper
                let sequence: any[] | null = null;
                
                if (typeDef.sequence && Array.isArray(typeDef.sequence)) {
                    sequence = typeDef.sequence;
                    this.log(`${indent}[buildNode] Using typeDef.sequence with ${sequence?.length ?? 0} elements`);
                } else if (typeDef.all && Array.isArray(typeDef.all)) {
                    sequence = typeDef.all;
                    this.log(`${indent}[buildNode] Using typeDef.all with ${sequence?.length ?? 0} elements`);
                } else if (typeDef.children && Array.isArray(typeDef.children)) {
                    // node-soap may wrap the sequence in a children array
                    // Check if children[0] is a sequence/all/choice/complexContent wrapper
                    if (typeDef.children.length === 1 && 
                        typeDef.children[0].name === 'sequence' && 
                        typeDef.children[0].children && 
                        Array.isArray(typeDef.children[0].children)) {
                        sequence = typeDef.children[0].children;
                        this.log(`${indent}[buildNode] Unwrapped sequence from typeDef.children[0], found ${sequence?.length ?? 0} elements`);
                    } else if (typeDef.children.length === 1 && 
                               typeDef.children[0].name === 'all' && 
                               typeDef.children[0].children && 
                               Array.isArray(typeDef.children[0].children)) {
                        sequence = typeDef.children[0].children;
                        this.log(`${indent}[buildNode] Unwrapped all from typeDef.children[0], found ${sequence?.length ?? 0} elements`);
                    } else if (typeDef.children.length === 1 && 
                               typeDef.children[0].name === 'complexContent' && 
                               typeDef.children[0].children && 
                               Array.isArray(typeDef.children[0].children)) {
                        // complexContent contains extension or restriction
                        const complexContent = typeDef.children[0];
                        if (complexContent.children.length === 1 && 
                            (complexContent.children[0].name === 'extension' || complexContent.children[0].name === 'restriction') &&
                            complexContent.children[0].children && 
                            Array.isArray(complexContent.children[0].children)) {
                            // extension/restriction contains sequence
                            const extOrRestr = complexContent.children[0];
                            if (extOrRestr.children.length === 1 && 
                                extOrRestr.children[0].name === 'sequence' &&
                                extOrRestr.children[0].children &&
                                Array.isArray(extOrRestr.children[0].children)) {
                                sequence = extOrRestr.children[0].children;
                                this.log(`${indent}[buildNode] Unwrapped sequence from complexContent/${extOrRestr.name}, found ${sequence?.length ?? 0} elements`);
                            }
                        }
                    } else {
                        // Children are the elements themselves
                        sequence = typeDef.children;
                        this.log(`${indent}[buildNode] Using typeDef.children directly with ${sequence?.length ?? 0} elements`);
                    }
                }

                if (sequence && Array.isArray(sequence) && sequence.length > 0) {
                    this.log(`${indent}[buildNode] Processing ${sequence.length} child elements`);
                    let choiceGroupCounter = 0;
                    sequence.forEach((child: any, index: number) => {
                        const childName = child.$name || child.name;
                        const childType = child.$type || child.type;
                        const childRef = child.$ref || child.ref;
                        const childMinOccurs = child.$minOccurs || child.minOccurs || '1';
                        const childDoc = child.annotation?.documentation || '';
                        
                        this.log(`${indent}[buildNode]   [${index}] child: name=${childName}, type=${childType}, ref=${childRef}`);
                        
                        // Handle choice elements - unwrap and add all alternatives
                        if (childName === 'choice' && child.children && Array.isArray(child.children)) {
                            choiceGroupCounter++;
                            const currentChoiceGroup = choiceGroupCounter;
                            this.log(`${indent}[buildNode]   Found choice group ${currentChoiceGroup} with ${child.children.length} alternatives`);
                            child.children.forEach((choiceChild: any, choiceIndex: number) => {
                                const choiceName = choiceChild.$name || choiceChild.name;
                                const choiceType = choiceChild.$type || choiceChild.type;
                                const choiceRef = choiceChild.$ref || choiceChild.ref;
                                const choiceMinOccurs = choiceChild.$minOccurs || choiceChild.minOccurs || '0';
                                const choiceDoc = choiceChild.annotation?.documentation || '';
                                
                                this.log(`${indent}[buildNode]     [choice ${choiceIndex}]: name=${choiceName}, type=${choiceType}`);
                                
                                if (choiceRef) {
                                    const refLocalName = choiceRef.split(':').pop() || choiceRef;
                                    const choiceNode = buildNode(
                                        refLocalName,
                                        choiceRef,
                                        choiceDoc,
                                        choiceMinOccurs,
                                        true,
                                        depth + 1
                                    );
                                    choiceNode.isChoice = true;
                                    choiceNode.choiceGroup = currentChoiceGroup;
                                    children.push(choiceNode);
                                } else if (choiceName && choiceType) {
                                    const choiceNode = buildNode(
                                        choiceName,
                                        choiceType,
                                        choiceDoc,
                                        choiceMinOccurs,
                                        false,
                                        depth + 1
                                    );
                                    choiceNode.isChoice = true;
                                    choiceNode.choiceGroup = currentChoiceGroup;
                                    children.push(choiceNode);
                                }
                            });
                        }
                        // If child has a 'ref' attribute, it references an element
                        else if (childRef) {
                            const refLocalName = childRef.split(':').pop() || childRef;
                            children.push(buildNode(
                                refLocalName,
                                childRef,
                                childDoc,
                                childMinOccurs,
                                true, // This is an element reference
                                depth + 1
                            ));
                        } else if (childName && childType) {
                            children.push(buildNode(
                                childName,
                                childType,
                                childDoc,
                                childMinOccurs,
                                false,
                                depth + 1
                            ));
                        } else {
                            this.log(`${indent}[buildNode]   WARNING: Child has no name/type/ref, skipping`);
                        }
                    });
                } else {
                    this.log(`${indent}[buildNode] WARNING: No sequence/all/children found in complexType or empty`);
                }
                
                if (children.length > 0) {
                    node.children = children;
                    this.log(`${indent}[buildNode] Added ${children.length} children to node`);
                } else {
                    this.log(`${indent}[buildNode] WARNING: No children added to node`);
                }
            }

            return node;
        };

        // Check if we have a message with parts (RPC/literal style)
        const message = messages && messages[inputMessageName];
        let result: SchemaNode;
        
        // CRITICAL FIX: node-soap sometimes populates message.parts with the element's children
        // instead of the actual WSDL message parts. We need to detect this and use element-based
        // building instead.
        // 
        // Heuristic: If parts exist but don't have element/type references, they're probably
        // the element's children, not actual message parts. Check if any part has $element or element property.
        let hasRealParts = false;
        if (message && message.parts) {
            const parts = message.parts;
            const partKeys = Object.keys(parts).filter(key => key !== 'undefined' && key !== 'null' && parts[key] != null);
            // Check if at least one part looks like a real WSDL part (has element or type reference)
            hasRealParts = partKeys.some(key => {
                const part = parts[key];
                return part && (part.element || part.$element || part.type || part.$type);
            });
            this.log(`[getOperationSchema] DEBUG: hasRealParts check: ${hasRealParts}, partKeys: ${partKeys.join(', ')}`);
        }
        
        if (message && message.parts && hasRealParts) {
            // RPC/literal: Build from parts
            this.log(`[getOperationSchema] Building from message parts (RPC/literal style)`);
            const parts = message.parts;
            const partKeys = Object.keys(parts).filter(key => key !== 'undefined' && key !== 'null' && parts[key] != null);
            
            if (partKeys.length === 1) {
                // Single part - build directly from that part
                const partName = partKeys[0];
                const part = parts[partName];
                const elementRef = part.element || part.$element;
                const typeRef = part.type || part.$type;
                
                if (elementRef) {
                    const elemName = elementRef.split(':').pop() || elementRef;
                    result = buildNode(elemName, elemName, '', '1', true);
                } else if (typeRef) {
                    const typeName = typeRef.split(':').pop() || typeRef;
                    result = buildNode(partName, typeName, '', '1', false);
                } else {
                    result = buildNode(inputElementName, inputElementName, '', '1', true);
                }
            } else {
                // Multiple parts - create wrapper node
                result = {
                    name: inputElementName,
                    type: inputElementName,
                    kind: 'complex',
                    minOccurs: '1',
                    children: partKeys.map(partName => {
                        const part = parts[partName];
                        const elementRef = part.element || part.$element;
                        const typeRef = part.type || part.$type;
                        
                        if (elementRef) {
                            const elemName = elementRef.split(':').pop() || elementRef;
                            return buildNode(partName, elemName, '', '1', true);
                        } else if (typeRef) {
                            const typeName = typeRef.split(':').pop() || typeRef;
                            return buildNode(partName, typeName, '', '1', false);
                        } else {
                            return buildNode(partName, 'string', '', '1', false);
                        }
                    })
                };
            }
        } else {
            // Document/literal: Single element
            this.log(`[getOperationSchema] Building from single element (document/literal style)`);
            result = buildNode(inputElementName, inputElementName, '', '1', true);
        }
        
        // Log the result
        const countNodes = (node: SchemaNode): number => {
            let count = 1;
            if (node.children) {
                node.children.forEach(child => count += countNodes(child));
            }
            return count;
        };
        
        const totalNodes = countNodes(result);
        this.log(`[getOperationSchema] Built schema tree: ${totalNodes} nodes (root: ${result.name}, kind: ${result.kind})`);
        if (result.children) {
            this.log(`[getOperationSchema] Root has ${result.children.length} children`);
        } else {
            this.log(`[getOperationSchema] WARNING: Root has no children - schema may be incomplete!`);
        }
        
        return result;
    }
}
