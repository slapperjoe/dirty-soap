import SwaggerParser = require('@apidevtools/swagger-parser');
import { OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import { ApiService, ServiceOperation, ApinoxProject, ApinoxFolder, ApiRequest, HttpMethod, RequestType, BodyType, ApiInterface, ApiOperation } from '../shared/src/models';
import { v4 as uuidv4 } from 'uuid';

export class OpenApiParser {
    private outputChannel: any = null;

    constructor(outputChannel?: any) {
        this.outputChannel = outputChannel;
    }

    private log(message: string, data?: any) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] [OpenApiParser] ${message}`);
            if (data) {
                this.outputChannel.appendLine(JSON.stringify(data, null, 2));
            }
        } else {
            console.log(`[OpenApiParser] ${message}`, data || '');
        }
    }

    public async parse(urlOrPath: string): Promise<ApinoxProject> {
        this.log(`Attempting to parse OpenAPI spec: ${urlOrPath}`);

        try {
            const api = await SwaggerParser.validate(urlOrPath);
            this.log('OpenAPI spec validated successfully.');

            const title = api.info.title || 'Untitled API';
            const version = api.info.version || '1.0.0';
            const description = api.info.description || '';

            // Common base URL detection
            let baseUrl = '';
            if (this.isOpenApiV3(api)) {
                if (api.servers && api.servers.length > 0) {
                    baseUrl = api.servers[0].url;
                }
            } else if (this.isOpenApiV2(api)) {
                const scheme = (api.schemes && api.schemes[0]) ? api.schemes[0] : 'http';
                const host = api.host || '';
                const basePath = api.basePath || '';
                if (host) {
                    baseUrl = `${scheme}://${host}${basePath}`;
                } else {
                    baseUrl = basePath;
                }
            }

            // Map standard HTTP methods
            const methods: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

            // We will map Tags to Folders AND Interfaces
            const folders: Record<string, ApinoxFolder> = {};
            const interfaces: Record<string, ApiInterface> = {};

            // Default folder/interface for untagged ops
            const defaultId = uuidv4();
            folders['default'] = {
                id: defaultId,
                name: 'Default',
                requests: [],
            };
            interfaces['default'] = {
                id: defaultId,
                name: 'Default',
                type: 'openapi',
                definition: urlOrPath,
                bindingName: 'REST',
                soapVersion: 'N/A',
                operations: []
            };

            const paths = api.paths || {};
            for (const pathKey of Object.keys(paths)) {
                const pathItem = paths[pathKey];

                for (const method of methods) {
                    const opKey = method.toLowerCase();
                    if (pathItem && (pathItem as any)[opKey]) {
                        const operation = (pathItem as any)[opKey] as OpenAPIV2.OperationObject | OpenAPIV3.OperationObject;

                        const reqName = operation.summary || operation.operationId || `${method} ${pathKey}`;
                        const reqId = operation.operationId || uuidv4();

                        // Determine Target Group (Folder & Interface)
                        let targetKey = 'default';
                        if (operation.tags && operation.tags.length > 0) {
                            const tagName = operation.tags[0]; // Just take first tag for now
                            if (!folders[tagName]) {
                                const tagId = uuidv4();
                                folders[tagName] = {
                                    id: tagId,
                                    name: tagName,
                                    requests: [],
                                };
                                interfaces[tagName] = {
                                    id: tagId,
                                    name: tagName,
                                    type: 'openapi',
                                    definition: urlOrPath,
                                    bindingName: 'REST',
                                    soapVersion: 'N/A',
                                    operations: []
                                };
                            }
                            targetKey = tagName;
                        }

                        // Generate sample request body
                        const sampleBody = this.generateRequestBody(operation, method);
                        
                        // Build endpoint with query parameters
                        let fullEndpoint = baseUrl ? `${baseUrl}${pathKey}` : pathKey;
                        fullEndpoint = this.addSampleQueryParams(fullEndpoint, operation);

                        // Create Request Object (For folders)
                        const request: ApiRequest = {
                            id: reqId,
                            name: reqName,
                            requestType: 'rest',
                            method: method,
                            endpoint: fullEndpoint,
                            headers: sampleBody ? { 'Content-Type': 'application/json' } : {},
                            bodyType: 'json',
                            request: sampleBody,
                            // restConfig: { auth: { type: 'inherit' } } 
                        };

                        // Create Operation Object (For interfaces)
                        const apiOperation: ApiOperation = {
                            id: reqId,
                            name: reqName,
                            action: method,
                            targetNamespace: baseUrl,
                            originalEndpoint: fullEndpoint,
                            requests: [{ ...request }]
                        };

                        folders[targetKey].requests.push(request);
                        interfaces[targetKey].operations.push(apiOperation);
                    }
                }
            }

            // Convert map to array, excluding empty default if unused
            const finalFolders = Object.values(folders).filter(f => f.name !== 'Default' || f.requests.length > 0);
            const finalInterfaces = Object.values(interfaces).filter(i => i.name !== 'Default' || i.operations.length > 0);

            // Construct Project
            const project: ApinoxProject = {
                id: uuidv4(),
                name: title,
                description: `${version} - ${description}`,
                interfaces: finalInterfaces,
                folders: finalFolders,
                testSuites: [],
                // settings: {}, // Removed
                dirty: false
            };

            return project;
        } catch (err: any) {
            this.log('Error parsing OpenAPI spec:', err);
            throw err;
        }
    }

    private isOpenApiV3(api: any): api is OpenAPIV3.Document {
        return !!api.openapi;
    }

    private isOpenApiV2(api: any): api is OpenAPIV2.Document {
        return !!api.swagger;
    }

    /**
     * Generate a sample JSON body from an OpenAPI schema object
     */
    private generateSampleFromSchema(schema: any, depth: number = 0): any {
        if (!schema || depth > 5) return null; // Prevent infinite recursion

        // Handle $ref (simplified - would need full resolution in production)
        if (schema.$ref) {
            return `<reference: ${schema.$ref}>`;
        }

        // Handle examples
        if (schema.example !== undefined) {
            return schema.example;
        }

        // Handle type-based generation
        switch (schema.type) {
            case 'string':
                if (schema.enum && schema.enum.length > 0) return schema.enum[0];
                if (schema.format === 'date') return '2024-01-01';
                if (schema.format === 'date-time') return '2024-01-01T00:00:00Z';
                if (schema.format === 'email') return 'user@example.com';
                if (schema.format === 'uri') return 'https://example.com';
                return schema.default || 'string';

            case 'number':
            case 'integer':
                return schema.default !== undefined ? schema.default : 0;

            case 'boolean':
                return schema.default !== undefined ? schema.default : false;

            case 'array':
                if (schema.items) {
                    return [this.generateSampleFromSchema(schema.items, depth + 1)];
                }
                return [];

            case 'object':
                const obj: any = {};
                if (schema.properties) {
                    for (const propName of Object.keys(schema.properties)) {
                        const propSchema = schema.properties[propName];
                        const isRequired = schema.required && schema.required.includes(propName);
                        // Only include required properties or first 5 properties
                        if (isRequired || Object.keys(obj).length < 5) {
                            obj[propName] = this.generateSampleFromSchema(propSchema, depth + 1);
                        }
                    }
                }
                return obj;

            default:
                return null;
        }
    }

    /**
     * Generate sample request body from OpenAPI operation
     */
    private generateRequestBody(operation: OpenAPIV2.OperationObject | OpenAPIV3.OperationObject, method: string): string {
        // For methods that typically don't have bodies
        if (['GET', 'DELETE', 'HEAD'].includes(method.toUpperCase())) {
            return '';
        }

        // OpenAPI v3 requestBody
        if ('requestBody' in operation && operation.requestBody) {
            const requestBody = operation.requestBody as OpenAPIV3.RequestBodyObject;
            if (requestBody.content) {
                // Prefer application/json
                const jsonContent = requestBody.content['application/json'];
                if (jsonContent && jsonContent.schema) {
                    const sample = this.generateSampleFromSchema(jsonContent.schema);
                    return sample ? JSON.stringify(sample, null, 2) : '';
                }
                // Fallback to first available content type
                const firstContentType = Object.keys(requestBody.content)[0];
                if (firstContentType && requestBody.content[firstContentType].schema) {
                    const sample = this.generateSampleFromSchema(requestBody.content[firstContentType].schema);
                    return sample ? JSON.stringify(sample, null, 2) : '';
                }
            }
        }

        // OpenAPI v2 body parameter
        if ('parameters' in operation && operation.parameters) {
            const bodyParam = operation.parameters.find((p: any) => p.in === 'body');
            if (bodyParam && 'schema' in bodyParam) {
                const sample = this.generateSampleFromSchema(bodyParam.schema);
                return sample ? JSON.stringify(sample, null, 2) : '';
            }
        }

        return '';
    }

    /**
     * Add sample query parameters to endpoint URL
     */
    private addSampleQueryParams(endpoint: string, operation: OpenAPIV2.OperationObject | OpenAPIV3.OperationObject): string {
        if (!('parameters' in operation) || !operation.parameters) {
            return endpoint;
        }

        const queryParams: string[] = [];
        for (const param of operation.parameters) {
            if ('in' in param && param.in === 'query' && param.name) {
                let value = 'value';
                if ('schema' in param && param.schema) {
                    const sample = this.generateSampleFromSchema(param.schema);
                    value = sample !== null ? String(sample) : 'value';
                } else if ('example' in param) {
                    value = String(param.example);
                } else if ('type' in param) {
                    // OpenAPI v2 parameter
                    if (param.type === 'string') value = 'string';
                    else if (param.type === 'number' || param.type === 'integer') value = '0';
                    else if (param.type === 'boolean') value = 'false';
                }
                queryParams.push(`${param.name}=${encodeURIComponent(value)}`);
            }
        }

        if (queryParams.length > 0) {
            const separator = endpoint.includes('?') ? '&' : '?';
            return `${endpoint}${separator}${queryParams.join('&')}`;
        }

        return endpoint;
    }
}
