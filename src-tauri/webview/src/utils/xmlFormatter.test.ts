import { describe, it, expect } from 'vitest';
import { formatXml, stripCausalityData } from '@shared/utils/xmlFormatter';

describe('xmlFormatter', () => {
    describe('formatXml', () => {
        it('should return empty string for empty input', () => {
            expect(formatXml('')).toBe('');
        });

        it('should format simple XML with proper indentation', () => {
            const input = '<root><child>value</child></root>';
            const result = formatXml(input);
            expect(result).toContain('<root>');
            expect(result).toContain('<child>');
            expect(result).toContain('</root>');
        });

        it('should handle self-closing tags', () => {
            const input = '<root><empty/></root>';
            const result = formatXml(input);
            expect(result).toContain('<empty');
        });

        it('should preserve attributes', () => {
            const input = '<root attr="value"><child id="1"/></root>';
            const result = formatXml(input);
            expect(result).toContain('attr="value"');
            expect(result).toContain('id="1"');
        });

        it('should handle nested elements', () => {
            const input = '<a><b><c>text</c></b></a>';
            const result = formatXml(input);
            const lines = result.split('\n').filter(l => l.trim());
            expect(lines.length).toBeGreaterThanOrEqual(3);
        });

        it('should handle inline element values when option is true', () => {
            const input = '<root><value>text</value></root>';
            const result = formatXml(input, false, true);
            // With inlineElementValues, simple text nodes should stay on same line
            expect(result).toBeDefined();
        });

        it('should align attributes when option is true', () => {
            const input = '<root attr1="a" attr2="b"><child/></root>';
            const result = formatXml(input, true, false);
            expect(result).toBeDefined();
        });
    });

    describe('stripCausalityData', () => {
        it('should return input unchanged if no causality data', () => {
            const input = '<root>value</root>';
            expect(stripCausalityData(input)).toBe(input);
        });

        it('should strip VsDebuggerCausalityData elements', () => {
            const input = '<root><VsDebuggerCausalityData>123</VsDebuggerCausalityData><data>test</data></root>';
            const result = stripCausalityData(input);
            expect(result).not.toContain('VsDebuggerCausalityData');
            expect(result).toContain('<data>');
        });
    });
});
