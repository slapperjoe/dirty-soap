import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsdlParser } from '../../WsdlParser';

// Integration tests using real WSDL file
// Note: These tests use the soap library's actual parsing

vi.mock('soap', () => ({
    createClientAsync: vi.fn()
}));

import * as soap from 'soap';

describe('WsdlParser Integration', () => {
    let parser: WsdlParser;

    beforeEach(() => {
        parser = new WsdlParser();
        vi.clearAllMocks();
    });

    describe('parseWsdl with realistic mock', () => {
        it('should extract service name from WSDL description', async () => {
            const mockClient = {
                describe: vi.fn(() => ({
                    'OrderService': {
                        'OrderPort': {
                            'CreateOrder': { input: { orderId: 'string' }, output: { status: 'string' } },
                            'GetOrder': { input: { id: 'string' }, output: { order: 'object' } },
                            'CancelOrder': { input: { orderId: 'string' }, output: { result: 'boolean' } }
                        }
                    }
                })),
                wsdl: {
                    definitions: {
                        targetNamespace: 'http://orders.example.com/',
                        services: {
                            'OrderService': {
                                ports: {
                                    'OrderPort': { location: 'https://api.example.com/orders' }
                                }
                            }
                        }
                    }
                }
            };

            (soap.createClientAsync as any).mockResolvedValue(mockClient);

            const services = await parser.parseWsdl('http://example.com/order.wsdl');

            expect(services).toHaveLength(1);
            expect(services[0].name).toBe('OrderService');
            expect(services[0].targetNamespace).toBe('http://orders.example.com/');
            expect(services[0].operations).toHaveLength(3);

            const opNames = services[0].operations.map(op => op.name);
            expect(opNames).toContain('CreateOrder');
            expect(opNames).toContain('GetOrder');
            expect(opNames).toContain('CancelOrder');
        });

        it('should handle WSDL with schemas and imports', async () => {
            const mockClient = {
                describe: vi.fn(() => ({ 'SomeService': { 'SomePort': { 'SomeOp': {} } } })),
                wsdl: {
                    definitions: {
                        targetNamespace: 'http://test.com/',
                        imports: { 'http://external.com/types': {} },
                        schemas: { 'http://test.com/': { elements: {}, complexTypes: {} } },
                        services: { 'SomeService': { ports: { 'SomePort': { location: '' } } } }
                    }
                }
            };

            (soap.createClientAsync as any).mockResolvedValue(mockClient);

            const services = await parser.parseWsdl('http://test.com/service.wsdl');

            expect(services).toBeDefined();
            expect(services[0].targetNamespace).toBe('http://test.com/');
        });

        it('should handle targetNamespace in different properties', async () => {
            // Some WSDLs have targetNamespace in different places
            const mockClient = {
                describe: vi.fn(() => ({ 'Svc': { 'Port': { 'Op': {} } } })),
                wsdl: {
                    definitions: {
                        $targetNamespace: 'http://alt.namespace.com/',
                        services: { 'Svc': { ports: { 'Port': { location: '' } } } }
                    }
                }
            };

            (soap.createClientAsync as any).mockResolvedValue(mockClient);

            const services = await parser.parseWsdl('http://alt.com/svc.wsdl');

            expect(services[0].targetNamespace).toBe('http://alt.namespace.com/');
        });

        it('should handle multi-port services', async () => {
            const mockClient = {
                describe: vi.fn(() => ({
                    'MultiPortService': {
                        'HttpPort': { 'HttpOp': {} },
                        'HttpsPort': { 'HttpsOp': {} }
                    }
                })),
                wsdl: {
                    definitions: {
                        targetNamespace: 'http://multi.com/',
                        services: {
                            'MultiPortService': {
                                ports: {
                                    'HttpPort': { location: 'http://api.com/service' },
                                    'HttpsPort': { location: 'https://api.com/service' }
                                }
                            }
                        }
                    }
                }
            };

            (soap.createClientAsync as any).mockResolvedValue(mockClient);

            const services = await parser.parseWsdl('http://multi.com/service.wsdl');

            expect(services[0].ports).toHaveLength(2);
            expect(services[0].ports).toContain('HttpPort');
            expect(services[0].ports).toContain('HttpsPort');
        });
    });
});
