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

export interface SoapUIRequest {
    name: string;
    request: string; // The XML content
    contentType?: string;
    method?: string;
    endpoint?: string;
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
    id?: string;
}
