
/**
 * Helper function to generate initial XML from operation input schema
 */
/**
 * Generates a full SOAP Envelope XML from an operation's input schema.
 */
export const generateXmlFromSchema = (operationName: string, inputSchema: any, targetNamespace: string): string => {
    // Metadata fields to skip (added by node-soap)
    const METADATA_FIELDS = ['targetNSAlias', 'targetNamespace'];

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
            const entries = Object.entries(node).filter(([key]) => 
                !key.startsWith('$') && !METADATA_FIELDS.includes(key)
            );
            
            return entries.map(([key, value]) => {
                // Check if this is an array notation (e.g., "tLanguage[]")
                if (key.endsWith('[]')) {
                    const elementName = key.slice(0, -2);
                    if (typeof value === 'object' && value !== null) {
                        const childContent = buildBody(value, indent + '   ');
                        return `${indent}<${elementName}>\n${childContent}\n${indent}</${elementName}>`;
                    } else {
                        return `${indent}<${elementName}>?</${elementName}>`;
                    }
                }
                
                const childContent = buildBody(value, indent + '   ');
                // Check if value suggests it's a simple type or complex
                if (typeof value === 'object' && value !== null && Object.keys(value).filter(k => !k.startsWith('$') && !METADATA_FIELDS.includes(k)).length > 0) {
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
 * Generates a full SOAP Envelope XML from a SchemaNode tree (deep complex types).
 * This is used when operation.fullSchema is available from WsdlParser.getOperationSchema().
 */
export const generateXmlFromSchemaNode = (operationName: string, schemaNode: any, targetNamespace: string): string => {
    // Helper to recursively build XML from SchemaNode tree
    const buildFromNode = (node: any, indent: string = ''): string => {
        if (!node) return '';

        // Simple type - just placeholder
        if (node.kind === 'simple') {
            return `${indent}<!--Optional:-->\n${indent}?`;
        }

        // Complex type - recursively build children
        if (node.kind === 'complex' && node.children && node.children.length > 0) {
            const childLines: string[] = [];
            let lastChoiceGroup: number | undefined = undefined;
            let currentChoiceGroupElements: string[] = [];
            
            node.children.forEach((child: any, index: number) => {
                const childName = child.name;
                const childIndent = indent + '   ';
                const optional = child.minOccurs === '0' || child.minOccurs === 0;
                
                // Handle choice group comment
                if (child.isChoice && child.choiceGroup !== lastChoiceGroup) {
                    // Count how many elements in this choice group
                    const choiceElements = node.children.filter((c: any) => c.isChoice && c.choiceGroup === child.choiceGroup);
                    if (choiceElements.length > 1) {
                        childLines.push(`${indent}<!--You have a CHOICE of the next ${choiceElements.length} items at this level-->`);
                    }
                    lastChoiceGroup = child.choiceGroup;
                }
                
                if (optional && !child.isChoice) {
                    childLines.push(`${indent}<!--Optional:-->`);
                }
                
                if (child.kind === 'complex' && child.children && child.children.length > 0) {
                    // Complex child with nested elements
                    childLines.push(`${indent}<${childName}>`);
                    const nestedContent = buildFromNode(child, childIndent);
                    if (nestedContent) {
                        childLines.push(nestedContent);
                    }
                    childLines.push(`${indent}</${childName}>`);
                } else {
                    // Simple child
                    childLines.push(`${indent}<${childName}>?</${childName}>`);
                }
            });
            
            return childLines.join('\n');
        }

        return `${indent}?`;
    };

    // Build the body content from the schema node
    let bodyContent = '';
    if (schemaNode && schemaNode.children) {
        bodyContent = buildFromNode(schemaNode, '         ');
    }

    const namespaceDeclaration = targetNamespace ? ` xmlns:web="${targetNamespace}"` : '';

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

    // Metadata fields to skip (added by node-soap)
    const METADATA_FIELDS = ['targetNSAlias', 'targetNamespace'];

    // Recursively build XML for each parameter
    const buildXml = (obj: any, currentIndent: string): void => {
        for (const [key, value] of Object.entries(obj)) {
            // Skip special properties that start with $ or are metadata fields
            if (key.startsWith('$') || METADATA_FIELDS.includes(key)) {
                continue;
            }

            // Check if this is an array notation (e.g., "tLanguage[]")
            if (key.endsWith('[]')) {
                // Extract the element name without the []
                const elementName = key.slice(0, -2);
                
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    // Array of complex types - generate one sample element
                    lines.push(`${currentIndent}<tem:${elementName}>`);
                    buildXml(value, currentIndent + '   ');
                    lines.push(`${currentIndent}</tem:${elementName}>`);
                } else {
                    // Array of simple types - generate one sample element
                    lines.push(`${currentIndent}<tem:${elementName}>?</tem:${elementName}>`);
                }
                continue;
            }

            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Check if this object only contains array notation or metadata
                const childKeys = Object.keys(value).filter(k => !k.startsWith('$') && !METADATA_FIELDS.includes(k));
                const hasOnlyArrayChild = childKeys.length === 1 && childKeys[0].endsWith('[]');
                
                if (hasOnlyArrayChild) {
                    // Don't create wrapper element, just process the array child directly
                    buildXml(value, currentIndent);
                } else {
                    // Complex type - create element with nested children
                    lines.push(`${currentIndent}<tem:${key}>`);
                    buildXml(value, currentIndent + '   ');
                    lines.push(`${currentIndent}</tem:${key}>`);
                }
            } else {
                // Simple type - create element with placeholder value
                lines.push(`${currentIndent}<tem:${key}>?</tem:${key}>`);
            }
        }
    };

    buildXml(input, indent);
    return lines.join('\n');
};

/**
 * Generates initial XML for an operation, automatically choosing the best method.
 * Prefers fullSchema (deep complex types) if available, falls back to simple input schema.
 * 
 * @param operation - The operation with name, input, fullSchema, and targetNamespace
 * @returns Complete SOAP envelope with generated XML
 */
export const generateInitialXmlForOperation = (operation: any): string => {
    const targetNs = operation.targetNamespace || 'http://tempuri.org/';
    
    // Prefer fullSchema (deep complex types) if available
    if (operation.fullSchema) {
        // Use the schema node's name (e.g., "GetOrganisationRequest") not operation name (e.g., "GetOrganisation")
        const elementName = operation.fullSchema.name || operation.name;
        return generateXmlFromSchemaNode(elementName, operation.fullSchema, targetNs);
    }
    
    // Fallback to simple schema if available
    if (operation.input && typeof operation.input === 'object') {
        return generateXmlFromSchema(operation.name, operation.input, targetNs);
    }
    
    // Final fallback: empty template
    return `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:web="${targetNs}">
   <soapenv:Header/>
   <soapenv:Body>
      <web:${operation.name}>
         <!--Optional:-->
      </web:${operation.name}>
   </soapenv:Body>
</soapenv:Envelope>`;
};
