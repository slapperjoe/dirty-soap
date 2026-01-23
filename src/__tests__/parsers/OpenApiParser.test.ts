import { describe, it, expect, beforeEach } from 'vitest';
import { OpenApiParser } from '../../OpenApiParser';

describe('OpenApiParser', () => {
    let parser: OpenApiParser;

    beforeEach(() => {
        parser = new OpenApiParser();
    });

    describe('parse', () => {
        it('should generate request bodies for POST operations', async () => {
            // Mock a simple OpenAPI v3 spec
            const mockSpec = {
                openapi: '3.0.0',
                info: { title: 'Test API', version: '1.0.0' },
                servers: [{ url: 'https://api.example.com' }],
                paths: {
                    '/pets': {
                        post: {
                            operationId: 'addPet',
                            summary: 'Add a new pet',
                            requestBody: {
                                content: {
                                    'application/json': {
                                        schema: {
                                            type: 'object',
                                            required: ['name'],
                                            properties: {
                                                name: { type: 'string', example: 'Fluffy' },
                                                age: { type: 'integer', example: 3 }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            };

            // Mock SwaggerParser
            const SwaggerParser = require('@apidevtools/swagger-parser');
            SwaggerParser.validate = async () => mockSpec;

            const result = await parser.parse('test.json');

            expect(result.interfaces).toBeDefined();
            expect(result.interfaces.length).toBeGreaterThan(0);
            
            const operation = result.interfaces[0].operations?.[0];
            expect(operation).toBeDefined();
            expect(operation.requests).toBeDefined();
            expect(operation.requests.length).toBeGreaterThan(0);
            
            const request = operation.requests[0];
            expect(request.request).toBeTruthy();
            expect(request.request).toContain('Fluffy');
            expect(request.headers?.['Content-Type']).toBe('application/json');
        });

        it('should not generate bodies for GET operations', async () => {
            const mockSpec = {
                openapi: '3.0.0',
                info: { title: 'Test API', version: '1.0.0' },
                servers: [{ url: 'https://api.example.com' }],
                paths: {
                    '/pets': {
                        get: {
                            operationId: 'getPets',
                            summary: 'List all pets'
                        }
                    }
                }
            };

            const SwaggerParser = require('@apidevtools/swagger-parser');
            SwaggerParser.validate = async () => mockSpec;

            const result = await parser.parse('test.json');

            const operation = result.interfaces[0].operations?.[0];
            const request = operation.requests[0];
            expect(request.request).toBe('');
        });

        it('should add query parameters to endpoint', async () => {
            const mockSpec = {
                openapi: '3.0.0',
                info: { title: 'Test API', version: '1.0.0' },
                servers: [{ url: 'https://api.example.com' }],
                paths: {
                    '/pets': {
                        get: {
                            operationId: 'getPets',
                            summary: 'List all pets',
                            parameters: [
                                {
                                    name: 'limit',
                                    in: 'query',
                                    schema: { type: 'integer', example: 10 }
                                },
                                {
                                    name: 'offset',
                                    in: 'query',
                                    schema: { type: 'integer', example: 0 }
                                }
                            ]
                        }
                    }
                }
            };

            const SwaggerParser = require('@apidevtools/swagger-parser');
            SwaggerParser.validate = async () => mockSpec;

            const result = await parser.parse('test.json');

            const operation = result.interfaces[0].operations?.[0];
            const request = operation.requests[0];
            expect(request.endpoint).toContain('limit=');
            expect(request.endpoint).toContain('offset=');
        });
    });
});
