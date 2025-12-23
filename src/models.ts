export interface SoapOperation {
    name: string;
    input: any;
    output: any;
    description?: string;
    targetNamespace?: string;
    expanded?: boolean;
}

export interface SoapService {
    name: string;
    ports: string[];
    operations: SoapOperation[];
}

export interface SoapSchemaNode {
    name: string;
    type: string; // e.g. "xsd:string", "tns:CountryCode"
    kind: 'complex' | 'simple';
    minOccurs?: string;
    maxOccurs?: string;
    documentation?: string;
    children?: SoapSchemaNode[];
    options?: string[]; // Enums
    isOptional?: boolean;
}

// Assertion Types
export interface SoapUIAssertion {
    type: 'Simple Contains' | 'Simple Not Contains' | 'Response SLA' | 'XPath Match';
    name?: string;
    id?: string;
    description?: string;
    // Configuration varies by type
    configuration?: {
        token?: string; // For Contains/Not Contains
        ignoreCase?: boolean; // For Contains
        sla?: string; // For SLA (ms)
        xpath?: string; // For XPath
        expectedContent?: string; // For XPath
    };
}

export interface SoapUIRequest {
    name: string;
    request: string; // The XML content
    contentType?: string;
    method?: string;
    endpoint?: string;
    dirty?: boolean;
    assertions?: SoapUIAssertion[];
    headers?: Record<string, string>;
}

export interface SoapUIOperation {
    name: string;
    action: string;
    requests: SoapUIRequest[];
    expanded?: boolean;
    input?: any;
}

export interface SoapUIInterface {
    name: string;
    type: string;
    bindingName: string;
    soapVersion: string;
    definition: string; // WSDL URL
    operations: SoapUIOperation[];
    expanded?: boolean;
}

export interface SoapUIProject {
    name: string;
    description?: string;
    interfaces: SoapUIInterface[];
    expanded?: boolean;
    fileName?: string;
}
