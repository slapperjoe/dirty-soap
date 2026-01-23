import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsdlParser } from '../../WsdlParser';

// Mock the soap module
vi.mock('soap', () => ({
    createClientAsync: vi.fn()
}));

import * as soap from 'soap';

describe('WsdlParser', () => {
    let parser: WsdlParser;
    let mockOutputChannel: any;

    beforeEach(() => {
        mockOutputChannel = {
            appendLine: vi.fn()
        };
        parser = new WsdlParser(mockOutputChannel);
        vi.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create parser without output channel', () => {
            const p = new WsdlParser();
            expect(p).toBeDefined();
            expect(p.getClient()).toBeNull();
        });

        it('should create parser with output channel', () => {
            const p = new WsdlParser(mockOutputChannel);
            expect(p).toBeDefined();
        });
    });

    describe('getClient', () => {
        it('should return null before parsing', () => {
            expect(parser.getClient()).toBeNull();
        });
    });

    describe('parseWsdl', () => {
        it('should parse a simple WSDL and return services', async () => {
            const mockClient = {
                describe: vi.fn(() => ({
                    'TestService': {
                        'TestPort': {
                            'GetData': {
                                input: { param: 'string' },
                                output: { result: 'string' }
                            }
                        }
                    }
                })),
                wsdl: {
                    definitions: {
                        targetNamespace: 'http://example.com/test',
                        services: {
                            'TestService': {
                                ports: {
                                    'TestPort': {
                                        location: 'http://localhost/service'
                                    }
                                }
                            }
                        }
                    }
                }
            };

            (soap.createClientAsync as any).mockResolvedValue(mockClient);

            const services = await parser.parseWsdl('http://example.com/test.wsdl');

            expect(services).toHaveLength(1);
            expect(services[0].name).toBe('TestService');
            expect(services[0].targetNamespace).toBe('http://example.com/test');
            expect(services[0].ports).toContain('TestPort');
            expect(services[0].operations).toHaveLength(1);
            expect(services[0].operations[0].name).toBe('GetData');
            expect(services[0].operations[0].originalEndpoint).toBe('http://localhost/service');
        });

        it('should store client after parsing', async () => {
            const mockClient = {
                describe: vi.fn(() => ({})),
                wsdl: { definitions: {} }
            };

            (soap.createClientAsync as any).mockResolvedValue(mockClient);

            await parser.parseWsdl('http://example.com/test.wsdl');

            expect(parser.getClient()).toBe(mockClient);
        });

        it('should throw error when WSDL parsing fails', async () => {
            (soap.createClientAsync as any).mockRejectedValue(new Error('Network error'));

            await expect(parser.parseWsdl('http://invalid.com/test.wsdl'))
                .rejects.toThrow('Network error');
        });

        it('should detect and provide helpful error for JSON files parsed as XML', async () => {
            // This is a fallback - normally OpenAPI files are detected by extension before reaching WsdlParser
            // But if they do reach here, provide a helpful error
            const jsonParseError = new Error('Text data outside of root node.\nLine: 0\nColumn: 13843\nChar: }');
            (soap.createClientAsync as any).mockRejectedValue(jsonParseError);

            await expect(parser.parseWsdl('https://petstore.swagger.io/v2/swagger.json'))
                .rejects.toThrow(/JSON\/YAML file/);
        });

        it('should detect and provide helpful error for YAML files parsed as XML', async () => {
            const yamlParseError = new Error('Text data outside of root node');
            (soap.createClientAsync as any).mockRejectedValue(yamlParseError);

            await expect(parser.parseWsdl('https://example.com/api.yaml'))
                .rejects.toThrow(/JSON\/YAML file/);
        });

        it('should handle WSDL with multiple services and ports', async () => {
            const mockClient = {
                describe: vi.fn(() => ({
                    'ServiceA': {
                        'PortA1': { 'OpA1': { input: {}, output: {} } },
                        'PortA2': { 'OpA2': { input: {}, output: {} } }
                    },
                    'ServiceB': {
                        'PortB1': { 'OpB1': { input: {}, output: {} } }
                    }
                })),
                wsdl: {
                    definitions: {
                        targetNamespace: 'http://multi.example.com',
                        services: {
                            'ServiceA': { ports: { 'PortA1': { location: '' }, 'PortA2': { location: '' } } },
                            'ServiceB': { ports: { 'PortB1': { location: '' } } }
                        }
                    }
                }
            };

            (soap.createClientAsync as any).mockResolvedValue(mockClient);

            const services = await parser.parseWsdl('http://multi.example.com/test.wsdl');

            expect(services).toHaveLength(2);
            expect(services[0].ports).toHaveLength(2);
        });

        it('should log parsing progress', async () => {
            const mockClient = {
                describe: vi.fn(() => ({})),
                wsdl: { definitions: { targetNamespace: 'http://test.com' } }
            };

            (soap.createClientAsync as any).mockResolvedValue(mockClient);

            await parser.parseWsdl('http://test.com/test.wsdl');

            expect(mockOutputChannel.appendLine).toHaveBeenCalled();
        });
    });

    describe('getOperationSchema', () => {
        it('should return null when no client is set', () => {
            expect(parser.getOperationSchema('TestOp')).toBeNull();
        });
    });
});
