import { describe, it, expect } from 'vitest';
import { formatXml, stripCausalityData } from '@shared/utils/xmlFormatter';

describe('xmlFormatter', () => {
    describe('stripCausalityData', () => {
        it('should remove VsDebuggerCausalityData comments', () => {
            const xml = `<root>
                <!--VsDebuggerCausalityData some data here-->
                <data>value</data>
            </root>`;

            const result = stripCausalityData(xml);

            expect(result).not.toContain('VsDebuggerCausalityData');
            expect(result).toContain('<data>value</data>');
        });

        it('should remove VsDebuggerCausalityData elements', () => {
            const xml = `<root>
                <s:VsDebuggerCausalityData>some data</s:VsDebuggerCausalityData>
                <data>value</data>
            </root>`;

            const result = stripCausalityData(xml);

            expect(result).not.toContain('VsDebuggerCausalityData');
            expect(result).toContain('<data>value</data>');
        });

        it('should handle empty string', () => {
            expect(stripCausalityData('')).toBe('');
        });

        it('should return unchanged xml if no causality data present', () => {
            const xml = '<root><data>value</data></root>';
            expect(stripCausalityData(xml)).toBe(xml);
        });
    });

    describe('formatXml', () => {
        it('should format simple xml with proper indentation', () => {
            const xml = '<root><child>value</child></root>';
            const result = formatXml(xml);

            expect(result).toContain('<root>');
            expect(result).toContain('  <child>');
            expect(result).toContain('</root>');
        });

        it('should handle self-closing tags', () => {
            const xml = '<root><empty/></root>';
            const result = formatXml(xml);

            expect(result).toContain('<empty/>');
        });

        it('should handle xml declaration', () => {
            const xml = '<?xml version="1.0"?><root/>';
            const result = formatXml(xml);

            expect(result).toContain('<?xml version="1.0"?>');
        });

        it('should preserve text content', () => {
            const xml = '<root><name>John Doe</name></root>';
            const result = formatXml(xml);

            expect(result).toContain('John Doe');
        });

        it('should handle attributes', () => {
            const xml = '<root id="1" name="test"><child/></root>';
            const result = formatXml(xml);

            expect(result).toContain('id="1"');
            expect(result).toContain('name="test"');
        });

        it('should align attributes when alignAttributes is true', () => {
            const xml = '<root attr1="value1" attr2="value2" attr3="value3"><child/></root>';
            const result = formatXml(xml, true);

            // Multiple attributes should be on separate lines when aligned
            const lines = result.split('\n');
            const attrLines = lines.filter(l => l.includes('attr'));
            expect(attrLines.length).toBeGreaterThan(1);
        });

        it('should inline element values when inlineElementValues is true', () => {
            const xml = '<root><name>John</name></root>';
            const result = formatXml(xml, false, true);

            // With inline values, <name>John</name> should be on one line
            expect(result).toMatch(/<name>John<\/name>/);
        });

        it('should strip causality data when hideCausalityData is true', () => {
            const xml = '<root><!--VsDebuggerCausalityData data--><data>value</data></root>';
            const result = formatXml(xml, false, false, true);

            expect(result).not.toContain('VsDebuggerCausalityData');
        });

        it('should handle SOAP envelope', () => {
            const soapXml = `
                <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
                    <soap:Body>
                        <GetUserResponse>
                            <Name>John</Name>
                        </GetUserResponse>
                    </soap:Body>
                </soap:Envelope>
            `;
            const result = formatXml(soapXml);

            expect(result).toContain('soap:Envelope');
            expect(result).toContain('soap:Body');
            expect(result).toContain('GetUserResponse');
        });

        it('should return empty string for non-string input', () => {
            expect(formatXml(null as any)).toBe('');
            expect(formatXml(undefined as any)).toBe('');
            expect(formatXml(123 as any)).toBe('');
        });

        it('should handle deeply nested xml', () => {
            const xml = '<a><b><c><d><e>deep</e></d></c></b></a>';
            const result = formatXml(xml);

            const lines = result.trim().split('\n');
            expect(lines.length).toBeGreaterThan(5);
            // Each level should be indented more
            expect(result).toContain('        <e>'); // 4 levels = 8 spaces
        });

        it('should handle empty elements', () => {
            const xml = '<root><empty></empty></root>';
            const result = formatXml(xml, false, true);

            expect(result).toContain('empty');
        });
    });
});
