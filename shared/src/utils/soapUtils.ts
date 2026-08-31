/**
 * soapUtils.ts — canonical copy lives here; both webview and request-editor re-export from this file.
 *
 * Generates SOAP Envelope XML from operation input schemas.
 */

import type { SchemaNode, SampleRequestMetadata, ApiRequest } from '../models';

/**
 * Returns the default Content-Type for a SOAP version.
 * Mirrors `SoapVersion::content_type()` in `src-tauri/src/soap/envelope_builder.rs`.
 *
 * - SOAP 1.1 → `text/xml; charset=utf-8`
 * - SOAP 1.2 → `application/soap+xml; charset=utf-8`
 * - unknown/missing → SOAP 1.1 default
 */
export const soapDefault = (soapVersion?: string | null): string => {
    return (soapVersion && String(soapVersion).trim() === '1.2')
        ? 'application/soap+xml; charset=utf-8'
        : 'text/xml; charset=utf-8';
};

/**
 * Resolves the effective Content-Type for a request. Single source of truth.
 *
 * Precedence (first match wins):
 *   1. Explicit request value — `request.headers["Content-Type"]` (case-insensitive,
 *      non-empty) if present; else `request.contentType` field if non-empty.
 *   2. Interface override — `iface.contentType` (unified: `project.contentType`).
 *   3. Action default — `operation.sampleMetadata?.contentType` ?? `operation.input?.contentType`
 *      ?? the operation's sample request `contentType`.
 *   4. SOAP default — `soapDefault(iface.soapVersion)`.
 *
 * No charset is auto-appended to override values; the value is used exactly as stored.
 * The `soapDefault` tier is never empty.
 */
export const resolveEffectiveContentType = (
    request: { contentType?: string; headers?: Record<string, string> } | null,
    operation: { sampleMetadata?: SampleRequestMetadata; input?: any; requests?: ApiRequest[] } | null,
    iface: { contentType?: string; soapVersion?: string } | null
): string => {
    // Tier 1: explicit request value
    if (request) {
        if (request.headers) {
            for (const [key, value] of Object.entries(request.headers)) {
                if (key.toLowerCase() === 'content-type' && typeof value === 'string' && value.trim() !== '') {
                    return value;
                }
            }
        }
        if (typeof request.contentType === 'string' && request.contentType.trim() !== '') {
            return request.contentType;
        }
    }

    // Tier 2: interface (project) override
    if (iface && typeof iface.contentType === 'string' && iface.contentType.trim() !== '') {
        return iface.contentType;
    }

    // Tier 3: action / sample default from the operation
    if (operation) {
        if (operation.sampleMetadata?.contentType) {
            return operation.sampleMetadata.contentType;
        }
        const inputContentType = operation.input && typeof operation.input === 'object'
            ? (operation.input as any).contentType
            : undefined;
        if (typeof inputContentType === 'string' && inputContentType.trim() !== '') {
            return inputContentType;
        }
        const sampleRequest = Array.isArray(operation.requests)
            ? operation.requests.find((r: any) => typeof r?.name === 'string' && r.name.startsWith('sample_'))
            : undefined;
        if (typeof sampleRequest?.contentType === 'string' && sampleRequest.contentType.trim() !== '') {
            return sampleRequest.contentType;
        }
    }

    // Tier 4: SOAP-version default (never empty)
    return soapDefault(iface?.soapVersion);
};

/**
 * Builds the SOAP envelope wrapper around body content.
 * Common helper used by both generateXmlFromSchema and generateXmlFromSchemaNode.
 * 
 * @param operationName - The name of the SOAP operation
 * @param bodyContent - The XML content for the SOAP body
 * @param targetNamespace - The target namespace URI
 * @returns Complete SOAP envelope XML string
 */
const buildSoapEnvelope = (operationName: string, bodyContent: string, targetNamespace: string): string => {
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
 * Generates a full SOAP Envelope XML from an operation's input schema.
 * 
 * Use this function when you have a **node-soap plain object schema** (Record<string, any>).
 * This is typically used for simple schemas without complex nested types.
 * 
 * @param operationName - The name of the SOAP operation
 * @param inputSchema - Plain object schema from node-soap (may contain $-prefixed metadata)
 * @param targetNamespace - The target namespace URI for the SOAP body
 * @returns Complete SOAP envelope XML string
 */
export const generateXmlFromSchema = (
    operationName: string, 
    inputSchema: Record<string, any> | undefined,
    targetNamespace: string
): string => {
    // Metadata fields to skip (added by node-soap)
    const METADATA_FIELDS = ['targetNSAlias', 'targetNamespace'];

    // Helper to recursively build body content from plain object schema
    const buildBody = (node: Record<string, any> | string | Array<any> | undefined, indent: string = ''): string => {
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

    // Build body content and wrap in SOAP envelope
    const bodyContent = buildBody(inputSchema, '         ');
    return buildSoapEnvelope(operationName, bodyContent, targetNamespace);
};

/**
 * Generates a full SOAP Envelope XML from a SchemaNode tree (deep complex types).
 * 
 * Use this function when you have a **SchemaNode tree structure** from WsdlParser.getOperationSchema().
 * This handles complex nested types, choice groups, and minOccurs/maxOccurs constraints.
 * 
 * @param operationName - The name of the SOAP operation
 * @param schemaNode - SchemaNode tree structure (with kind, children, minOccurs, etc.)
 * @param targetNamespace - The target namespace URI for the SOAP body
 * @returns Complete SOAP envelope XML string
 */
export const generateXmlFromSchemaNode = (
    operationName: string, 
    schemaNode: SchemaNode | null | undefined,
    targetNamespace: string
): string => {
    // Helper to recursively build XML from SchemaNode tree
    const buildFromNode = (node: SchemaNode, indent: string = ''): string => {
        if (!node) return '';

        // Simple type - just placeholder
        if (node.kind === 'simple') {
            return `${indent}<!--Optional:-->\n${indent}?`;
        }

        // Complex type - recursively build children
        if (node.kind === 'complex' && node.children && node.children.length > 0) {
            const childLines: string[] = [];
            let lastChoiceGroup: number | undefined = undefined;
            
            node.children.forEach((child: SchemaNode) => {
                const childName = child.name;
                const childIndent = indent + '   ';
                const optional = child.minOccurs === '0' || child.isOptional;
                
                // Handle choice group comment
                if (child.isChoice && child.choiceGroup !== lastChoiceGroup) {
                    // Count how many elements in this choice group
                    const choiceElements = node.children!.filter((c: SchemaNode) => c.isChoice && c.choiceGroup === child.choiceGroup);
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

    // Build body content and wrap in SOAP envelope
    let bodyContent = '';
    if (schemaNode) {
        // Handle simple types at root level (e.g., enums)
        if (schemaNode.kind === 'simple') {
            bodyContent = `         <${schemaNode.name}>?</${schemaNode.name}>`;
        } else if (schemaNode.children) {
            // Complex type with children
            bodyContent = buildFromNode(schemaNode, '         ');
        }
    }
    
    return buildSoapEnvelope(operationName, bodyContent, targetNamespace);
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
    
    // Prefer fullSchema (deep complex types) if available AND has children
    if (operation.fullSchema && operation.fullSchema.children && operation.fullSchema.children.length > 0) {
        // Use the schema node's name (e.g., "GetOrganisationRequest") not operation name (e.g., "GetOrganisation")
        const elementName = operation.fullSchema.name || operation.name;
        return generateXmlFromSchemaNode(elementName, operation.fullSchema, targetNs);
    }
    
    // Fallback to simple schema if available AND has meaningful content
    // Check if input has any non-metadata keys (excluding $ prefixed and metadata fields)
    const METADATA_FIELDS = ['targetNSAlias', 'targetNamespace'];
    if (operation.input && typeof operation.input === 'object') {
        const meaningfulKeys = Object.keys(operation.input).filter(key => 
            !key.startsWith('$') && !METADATA_FIELDS.includes(key)
        );
        
        if (meaningfulKeys.length > 0) {
            return generateXmlFromSchema(operation.name, operation.input, targetNs);
        }
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

/**
 * Generates initial XML and metadata for an operation.
 * Returns both the XML string and associated metadata like endpoint, SOAPAction, etc.
 *
 * @param operation - The operation with name, input, fullSchema, targetNamespace, action, originalEndpoint
 * @returns Object containing sampleXml and metadata
 */
export const generateSampleWithMetadata = (operation: any, iface?: { contentType?: string; soapVersion?: string } | null): {
    sampleXml: string;
    endpoint?: string;
    soapAction?: string;
    contentType?: string;
    targetNamespace?: string;
} => {
    const sampleRequest = Array.isArray(operation.requests)
        ? operation.requests.find((request: any) => typeof request?.name === "string" && request.name.startsWith("sample_"))
        : undefined;
    const sampleXml = operation.sampleMetadata?.sampleXml || sampleRequest?.request || generateInitialXmlForOperation(operation);

    return {
        sampleXml,
        endpoint: operation.sampleMetadata?.endpoint || sampleRequest?.endpoint || operation.originalEndpoint,
        soapAction: operation.sampleMetadata?.soapAction || operation.action,
        // Resolve via the canonical precedence chain (sample request contentType tier falls back
        // to the SOAP-version default when the sample carries no explicit value)
        contentType: resolveEffectiveContentType(
            sampleRequest || null,
            operation,
            iface || null
        ),
        targetNamespace: operation.sampleMetadata?.targetNamespace || operation.targetNamespace || "http://tempuri.org/"
    };
};
