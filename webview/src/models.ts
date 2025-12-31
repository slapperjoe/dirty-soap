export interface SoapOperation {
    name: string;
    input: any;
    output: any;
    description?: string;
    targetNamespace?: string;
    expanded?: boolean;
    portName?: string;
    originalEndpoint?: string;
}

export interface SoapService {
    name: string;
    ports: string[];
    operations: SoapOperation[];
    targetNamespace?: string;
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

export interface SoapRequestExtractor {
    type: 'XPath' | 'JSONPath';
    source: 'body' | 'header';
    path: string;
    variable: string;
    id: string;
}

export interface SoapUIRequest {
    name: string;
    request: string; // The XML content
    contentType?: string;
    method?: string;
    endpoint?: string;
    dirty?: boolean;
    assertions?: SoapUIAssertion[];
    extractors?: SoapRequestExtractor[];
    headers?: Record<string, string>;
    id?: string;
}

export interface SoapUIOperation {
    name: string;
    action: string;
    requests: SoapUIRequest[];
    expanded?: boolean;
    input?: any;
    targetNamespace?: string;
    originalEndpoint?: string;
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
    dirty?: boolean;
    testSuites?: SoapTestSuite[];
}

// Test Runner Types
export type TestStepType = 'request' | 'delay' | 'transfer' | 'script';

export interface SoapTestStep {
    id: string;
    name: string;
    type: TestStepType;
    // Common configuration
    config: {
        // For 'request'
        requestId?: string; // Reference to a project request (if linked)
        request?: SoapUIRequest; // Standalone request copy

        // For 'delay'
        delayMs?: number;

        // For 'transfer'
        sourceStepId?: string;
        sourceProperty?: 'Response' | 'Headers' | 'Status';
        sourcePath?: string; // XPath or Regex
        targetStepId?: string;
        targetProperty?: 'Request' | 'Header' | 'Endpoint';
        targetPath?: string; // Where to inject (e.g. replace token)

        // For 'script'
        scriptName?: string;
    };
}

export interface SoapTestCase {
    id: string;
    name: string;
    steps: SoapTestStep[];
    expanded?: boolean;
}

export interface SoapTestSuite {
    id: string;
    name: string;
    testCases: SoapTestCase[];
    expanded?: boolean;
}

export interface WatcherEvent {
    id: string;
    timestamp: number;
    timestampLabel: string;
    requestFile?: string;
    responseFile?: string;
    requestContent?: string;
    responseContent?: string;
    requestOperation?: string;
    responseOperation?: string;

    // Proxy Fields
    method?: string;
    url?: string;
    status?: number;
    duration?: number;
    success?: boolean;
    error?: string;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;

    // Compatibility with ProxyEvent
    requestBody?: string;
    responseBody?: string;
    formattedBody?: string;
}

export enum SidebarView {
    PROJECTS = 'projects',
    EXPLORER = 'explorer',
    TESTS = 'tests',
    WATCHER = 'watcher',
    PROXY = 'proxy'
}

/**
 * Rule for automatically replacing text in proxy request/response XML.
 * Used for masking sensitive data or normalizing responses.
 */
export interface ReplaceRule {
    /** Unique identifier */
    id: string;
    /** Optional friendly name */
    name?: string;
    /** XPath expression to target element */
    xpath: string;
    /** Text to find within the element */
    matchText: string;
    /** Replacement text */
    replaceWith: string;
    /** Apply to request, response, or both */
    target: 'request' | 'response' | 'both';
    /** Treat matchText as regex */
    isRegex?: boolean;
    /** Rule is active */
    enabled: boolean;
}

export interface DirtySoapConfig {
    version: number;
    network?: {
        defaultTimeout?: number;
        retryCount?: number;
        proxy?: string;
    };
    ui?: {
        layoutMode?: 'vertical' | 'horizontal';
        showLineNumbers?: boolean;
        alignAttributes?: boolean;
        inlineElementValues?: boolean;
        splitRatio?: number;
    };
    activeEnvironment?: string;
    lastConfigPath?: string;
    lastProxyTarget?: string;
    openProjects?: string[];
    environments?: Record<string, {
        endpoint_url?: string;
        env?: string;
        [key: string]: string | undefined;
    }>;
    globals?: Record<string, string>;
    recentWorkspaces?: string[];
    /** Auto-replace rules for proxy view */
    replaceRules?: ReplaceRule[];
    /** Breakpoints for proxy - pause on matching requests/responses */
    breakpoints?: any[];
    /** Azure DevOps integration settings */
    azureDevOps?: {
        orgUrl?: string;
        project?: string;
    };
}

