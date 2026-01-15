
/**
 * Helper function to generate initial XML from operation input schema
 */
/**
 * Generates a full SOAP Envelope XML from an operation's input schema.
 */
export const generateXmlFromSchema = (operationName: string, inputSchema: any, targetNamespace: string): string => {
    // Helper to recursively build body content
    const buildBody = (node: any, indent: string = ''): string => {
        if (!node) return '';

        // Handle simple types (strings, or schema definitions like "xsd:int")
        if (typeof node === 'string') {
            return `${indent}?`;
        }

        if (Array.isArray(node)) {
            // If it's an array, we might need to know the element name from the parent context,
            // but usually schema objects are { fieldName: Type }. 
            // If we hit an array here without a key, it's tricky. 
            // But usually we iterate keys of an object.
            return node.map(n => buildBody(n, indent)).join('\n');
        }

        if (typeof node === 'object') {
            const entries = Object.entries(node);
            return entries.map(([key, value]) => {
                const childContent = buildBody(value, indent + '   ');
                // Check if value suggests it's a simple type or complex
                if (typeof value === 'object' && value !== null && Object.keys(value).length > 0) {
                    return `${indent}<${key}>\n${childContent}\n${indent}</${key}>`;
                } else {
                    return `${indent}<${key}>?</${key}>`;
                }
            }).join('\n');
        }
        return '';
    };

    // Construct the full Envelope
    // We use a prefix 'web' for the target namespace for simplicity
    const namespaceDeclaration = targetNamespace ? ` xmlns:web="${targetNamespace}"` : '';
    const bodyContent = buildBody(inputSchema, '         ');

    return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"${namespaceDeclaration}>
   <soapenv:Header/>
   <soapenv:Body>
      <web:${operationName}>
${bodyContent}
      </web:${operationName}>
   </soapenv:Body>
</soapenv:Envelope>`;
};

/**
 * Generate XML parameter elements from WSDL operation input schema
 * Used to populate the body of sample SOAP requests
 * @param input - The input schema object from the WSDL parser (e.g., { intA: 'xsd:int', intB: 'xsd:int' })
 * @param indent - Indentation string for proper XML formatting
 * @returns XML string with parameter elements
 */
export const getInitialXml = (input: any, indent: string = '         '): string => {
    if (!input || typeof input !== 'object') {
        return '';
    }

    const lines: string[] = [];

    // Recursively build XML for each parameter
    const buildXml = (obj: any, currentIndent: string): void => {
        for (const [key, value] of Object.entries(obj)) {
            // Skip special properties that start with $
            if (key.startsWith('$')) {
                continue;
            }

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Complex type - create element with nested children
                lines.push(`${currentIndent}<tem:${key}>`);
                buildXml(value, currentIndent + '   ');
                lines.push(`${currentIndent}</tem:${key}>`);
            } else {
                // Simple type - create element with placeholder value
                lines.push(`${currentIndent}<tem:${key}>?</tem:${key}>`);
            }
        }
    };

    buildXml(input, indent);
    return lines.join('\n');
};
