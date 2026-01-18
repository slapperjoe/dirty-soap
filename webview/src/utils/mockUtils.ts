import { MockRule } from '@shared/models';

interface MockSourceData {
    url: string;
    statusCode: number;
    responseBody: string;
    responseHeaders?: Record<string, any>;
    requestBody?: string;  // Optional request body for SOAP operation extraction
}

/**
 * Extract SOAP operation name from request body.
 * Looks for elements ending in "Request" within the Body element.
 * E.g., <GetEmployeeDetailsRequest> -> "GetEmployeeDetailsRequest"
 */
const extractSoapOperationName = (requestBody: string): string | null => {
    if (!requestBody) return null;

    try {
        // Look for element names ending in "Request" or common SOAP patterns
        // Pattern: <ns:OperationRequest or <OperationRequest
        const operationMatch = requestBody.match(/<(?:\w+:)?(\w+Request)\b[^>]*>/i);
        if (operationMatch) {
            return operationMatch[1];
        }

        // Also look for elements that might be operations (first element after Body)
        const bodyMatch = requestBody.match(/<(?:\w+:)?Body[^>]*>\s*<(?:\w+:)?(\w+)[^>]*>/i);
        if (bodyMatch) {
            return bodyMatch[1];
        }
    } catch (e) {
        console.warn('[mockUtils] Failed to parse SOAP operation name:', e);
    }

    return null;
};

/**
 * Extract the content inside the operation element only.
 * This excludes common headers like MessageProperties that are outside the main operation.
 * E.g., for <GetEmployeeDetailsRequest>...<GetEmployeeDetailsInput>...</GetEmployeeDetailsInput></GetEmployeeDetailsRequest>
 * it will return only the content inside GetEmployeeDetailsRequest.
 */
const extractOperationContent = (requestBody: string, operationName: string): string | null => {
    if (!requestBody || !operationName) return null;

    try {
        // Match the operation element and its content
        // Pattern: <ns:OperationName...>content</ns:OperationName>
        const opRegex = new RegExp(
            `<(?:\\w+:)?${operationName}[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${operationName}>`,
            'i'
        );
        const match = requestBody.match(opRegex);
        if (match) {
            return match[1];
        }
    } catch (e) {
        console.warn('[mockUtils] Failed to extract operation content:', e);
    }

    return null;
};

/**
 * Extract all text parameter values from a portion of SOAP request body.
 * Finds simple text content within elements (not nested elements).
 * E.g., <LoginUser>BLDEV_MP744508</LoginUser> -> "BLDEV_MP744508"
 * E.g., <PositionStatus>Active</PositionStatus> -> "Active"
 */
const extractSoapTextParameters = (content: string): string[] => {
    if (!content) return [];

    const params: string[] = [];
    const seen = new Set<string>();

    try {
        // Match elements with simple text content (no nested elements)
        // Pattern: <ElementName>text content</ElementName>
        // Excludes elements that contain child elements (< after >)
        const paramRegex = /<(?:\w+:)?(\w+)[^>]*>([^<]+)<\/(?:\w+:)?\1>/g;
        let match;

        while ((match = paramRegex.exec(content)) !== null) {
            // match[1] is element name (used for backreference in regex), match[2] is text content
            const textContent = match[2].trim();

            // Skip empty values, namespaces, and very short values
            if (!textContent || textContent.length < 2) continue;

            // Skip numeric-only values and common noise
            if (/^\d+$/.test(textContent)) continue;
            if (['true', 'false', 'null', 'undefined'].includes(textContent.toLowerCase())) continue;

            // Avoid duplicate values
            if (seen.has(textContent)) continue;
            seen.add(textContent);

            params.push(textContent);
        }
    } catch (e) {
        console.warn('[mockUtils] Failed to extract SOAP parameters:', e);
    }

    return params;
};

export const createMockRuleFromSource = (data: MockSourceData): MockRule => {
    let name = 'Recorded Rule';
    let operationName: string | null = null;
    const conditions: { type: 'operation' | 'url' | 'soapAction' | 'xpath' | 'header' | 'contains' | 'templateName'; pattern: string; isRegex?: boolean }[] = [];

    // Always add URL condition first
    conditions.push({ type: 'url', pattern: data.url || '', isRegex: false });

    // Extract SOAP operation name and parameters from request body
    if (data.requestBody) {
        operationName = extractSoapOperationName(data.requestBody);
        if (operationName) {
            name = operationName;
            // Add operation name as an 'operation' condition
            conditions.push({ type: 'operation', pattern: operationName, isRegex: false });

            // Special case: Also extract TemplateName from MessageProperties if present
            // Uses specialized 'templateName' condition type for XPath-style matching
            const templateNameMatch = data.requestBody.match(/<Property[^>]*Name="TemplateName"[^>]*>([^<]+)<\/Property>/i);
            if (templateNameMatch) {
                const templateName = templateNameMatch[1].trim();
                if (templateName) {
                    conditions.push({ type: 'templateName', pattern: templateName, isRegex: false });
                }
            }

            // Extract text parameters ONLY from within the operation element
            const operationContent = extractOperationContent(data.requestBody, operationName);
            if (operationContent) {
                const textParams = extractSoapTextParameters(operationContent);
                for (const param of textParams) {
                    conditions.push({ type: 'contains', pattern: param, isRegex: false });
                }
            }
        }
    }

    // Fallback: extract name from URL path if no operation found
    if (!operationName) {
        try {
            if (data.url) {
                const urlStr = data.url.includes('://')
                    ? data.url
                    : `http://${data.url}`;
                const urlObj = new URL(urlStr);
                const pathParts = urlObj.pathname.split('/').filter(Boolean);
                if (pathParts.length > 0) {
                    name = pathParts[pathParts.length - 1];
                }
            }
        } catch (e) {
            console.warn('[mockUtils] Failed to parse URL for mock name:', e);
        }
    }

    return {
        id: `imported-${Date.now()}`,
        name: `Mock: ${name}`,
        enabled: true,
        conditions,
        statusCode: data.statusCode || 200,
        responseBody: data.responseBody || '',
        responseHeaders: (data.responseHeaders as Record<string, string>) || {},
        contentType: data.responseHeaders?.['content-type'] || 'text/xml',
        recordedFrom: data.url,
        recordedAt: Date.now(),
        hitCount: 0
    };
};
