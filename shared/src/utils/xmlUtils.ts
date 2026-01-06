/**
 * xmlUtils.ts
 * 
 * Utility functions for XML generation and manipulation.
 */

/**
 * Generate initial XML placeholder content from WSDL input definition
 */
export function getInitialXml(input: any): string {
    if (!input) return '';
    let xml = '';
    for (const key in input) {
        xml += `<${key}>?</${key}>\n`;
    }
    return xml;
}
