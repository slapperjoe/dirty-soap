import { describe, it, expect } from 'vitest';
import { WildcardProcessor } from '../utils/WildcardProcessor';

describe('WildcardProcessor', () => {
    describe('process', () => {
        it('should return empty text unchanged', () => {
            expect(WildcardProcessor.process('', {}, {})).toBe('');
        });

        it('should return text without wildcards unchanged', () => {
            const text = 'Hello World';
            expect(WildcardProcessor.process(text, {}, {})).toBe(text);
        });

        it('should replace {{uuid}} with a valid UUID', () => {
            const result = WildcardProcessor.process('id: {{uuid}}', {}, {});
            expect(result).toMatch(/id: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        });

        it('should replace {{newguid}} with a valid UUID', () => {
            const result = WildcardProcessor.process('id: {{newguid}}', {}, {});
            expect(result).toMatch(/id: [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        });

        it('should replace {{now}} with ISO date', () => {
            const result = WildcardProcessor.process('time: {{now}}', {}, {});
            expect(result).toMatch(/time: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('should replace {{epoch}} with a number', () => {
            const result = WildcardProcessor.process('ts: {{epoch}}', {}, {});
            expect(result).toMatch(/ts: \d+/);
        });

        it('should replace {{randomInt(1,10)}} with number in range', () => {
            for (let i = 0; i < 10; i++) {
                const result = WildcardProcessor.process('num: {{randomInt(1,10)}}', {}, {});
                const match = result.match(/num: (\d+)/);
                expect(match).not.toBeNull();
                const num = parseInt(match?.[1] ?? '0');
                expect(num).toBeGreaterThanOrEqual(1);
                expect(num).toBeLessThanOrEqual(10);
            }
        });

        it('should replace {{name}} with a name', () => {
            const result = WildcardProcessor.process('{{name}}', {}, {});
            expect(result).toMatch(/\w+ \w+/);
        });

        it('should replace {{country}} with a country', () => {
            const result = WildcardProcessor.process('{{country}}', {}, {});
            expect(result.length).toBeGreaterThan(0);
        });

        it('should replace {{state}} with a state', () => {
            const result = WildcardProcessor.process('{{state}}', {}, {});
            expect(result.length).toBeGreaterThan(0);
        });

        it('should replace {{lorem(5)}} with 5 words', () => {
            const result = WildcardProcessor.process('{{lorem(5)}}', {}, {});
            const words = result.split(' ');
            expect(words.length).toBe(5);
        });

        it('should replace {{url}} with endpoint_url from env', () => {
            const env = { endpoint_url: 'https://api.example.com' };
            const result = WildcardProcessor.process('url: {{url}}', env, {});
            expect(result).toBe('url: https://api.example.com');
        });

        it('should replace custom env variables', () => {
            const env = { myVar: 'myValue' };
            const result = WildcardProcessor.process('val: {{myVar}}', env, {});
            expect(result).toBe('val: myValue');
        });

        it('should replace global variables', () => {
            const globals = { apiKey: 'secret123' };
            const result = WildcardProcessor.process('key: {{apiKey}}', {}, globals);
            expect(result).toBe('key: secret123');
        });

        it('should replace context variables in SoapUI format', () => {
            const contextVariables = { 'OrderId': '12345' };
            const result = WildcardProcessor.process('id: ${#TestCase#OrderId}', {}, {}, undefined, contextVariables);
            expect(result).toBe('id: 12345');
        });

        it('should handle date math {{now+1d}}', () => {
            const result = WildcardProcessor.process('{{now+1d}}', {}, {});
            expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('should handle date math {{now-2m}}', () => {
            const result = WildcardProcessor.process('{{now-2m}}', {}, {});
            expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        });

        it('should handle multiple wildcards in same text', () => {
            const result = WildcardProcessor.process('{{name}} from {{country}}', {}, {});
            expect(result).not.toContain('{{');
        });
    });
});
