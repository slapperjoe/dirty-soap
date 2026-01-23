import { describe, it, expect } from 'vitest';
import { XPathGenerator } from '../../utils/xpathGenerator';

describe('XPathGenerator', () => {
    describe('getPath', () => {
        it('should return path for simple element', () => {
            const xml = '<root><child>value</child></root>';
            // Offset at "value" text
            const offset = xml.indexOf('value');
            const result = XPathGenerator.getPath(xml, offset);

            expect(result).toBe('/root[1]/child[1]');
        });

        it('should return path for nested element', () => {
            const xml = '<a><b><c>text</c></b></a>';
            const offset = xml.indexOf('text');
            const result = XPathGenerator.getPath(xml, offset);

            expect(result).toBe('/a[1]/b[1]/c[1]');
        });

        it('should handle multiple siblings with same name', () => {
            const xml = '<root><item>first</item><item>second</item></root>';

            // Get path for first item
            const offset1 = xml.indexOf('first');
            expect(XPathGenerator.getPath(xml, offset1)).toBe('/root[1]/item[1]');

            // Get path for second item
            const offset2 = xml.indexOf('second');
            expect(XPathGenerator.getPath(xml, offset2)).toBe('/root[1]/item[2]');
        });

        it('should handle self-closing tags', () => {
            const xml = '<root><empty/><value>text</value></root>';
            const offset = xml.indexOf('text');
            const result = XPathGenerator.getPath(xml, offset);

            expect(result).toBe('/root[1]/value[1]');
        });

        it('should handle offset inside tag definition', () => {
            const xml = '<root id="123"><child/></root>';
            // Offset at "id" attribute
            const offset = xml.indexOf('id');
            const result = XPathGenerator.getPath(xml, offset);

            expect(result).toBe('/root[1]');
        });

        it('should handle namespaced tags', () => {
            const xml = '<soap:Envelope><soap:Body><ns:Response>data</ns:Response></soap:Body></soap:Envelope>';
            const offset = xml.indexOf('data');
            const result = XPathGenerator.getPath(xml, offset);

            expect(result).toBe('/soap:Envelope[1]/soap:Body[1]/ns:Response[1]');
        });

        it('should return null for offset outside content', () => {
            const xml = '<root><child>value</child></root>';
            // Offset way past end
            const result = XPathGenerator.getPath(xml, 1000);

            expect(result).toBeNull();
        });

        it('should return null for empty xml', () => {
            const result = XPathGenerator.getPath('', 0);
            expect(result).toBeNull();
        });

        it('should handle offset at start of text content', () => {
            const xml = '<root>content</root>';
            const offset = xml.indexOf('content');
            const result = XPathGenerator.getPath(xml, offset);

            expect(result).toBe('/root[1]');
        });

        it('should handle offset in closing tag', () => {
            const xml = '<root><child>text</child></root>';
            // Offset at </child>
            const offset = xml.indexOf('</child>') + 2; // Inside the closing tag
            const result = XPathGenerator.getPath(xml, offset);

            expect(result).toBe('/root[1]/child[1]');
        });
    });
});
