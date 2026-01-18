export interface ServiceOperation {
    name: string;
    input?: any;
    output: any;
    description?: string;
    targetNamespace?: string;
    expanded?: boolean;
    portName?: string;
    originalEndpoint?: string;
}

export interface WsdlDiff {
    projectId: string;
    interfaceId: string;
    interfaceName: string;
    newWsdlUrl: string;
    addedOperations: ServiceOperation[];
    removedOperations: ServiceOperation[];
    // We could track modified, but for now we might just support Add/Remove
    // or treat modified as Remove + Add? 
    // Let's stick to Add/Remove for simplicity first, as modifying operation signatures 
    // in-place is complex for the user to understand what broke.
    // If we want to support modifications, we can add it later.
    // Actually, "Modified" usually means arguments changed.
    modifiedOperations: {
        operation: ServiceOperation;
        changes: string[];
    }[];
}

export interface ApiService {
    name: string;
    ports: string[];
    operations: ServiceOperation[];
    targetNamespace?: string;
}

export interface SchemaNode {
    name: string;
    type: string; // e.g. "xsd:string", "tns:CountryCode"
    kind: 'complex' | 'simple';
    minOccurs?: string;
    maxOccurs?: string;
    documentation?: string;
    children?: SchemaNode[];
    options?: string[]; // Enums
    isOptional?: boolean;
}

// ============================================================================
// REQUEST TYPE DISCRIMINATORS (REST/GraphQL Support)
// ============================================================================

/** Type of API request */
export type RequestType = 'soap' | 'rest' | 'graphql';

/** HTTP methods supported */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

/** Body content type */
export type BodyType = 'xml' | 'json' | 'graphql' | 'text' | 'form-data' | 'binary' | 'none';

/** REST authentication type */
export type RestAuthType = 'none' | 'basic' | 'bearer' | 'apiKey' | 'oauth2';

/** REST authentication configuration */
export interface RestAuthConfig {
    type: RestAuthType;
    // Basic Auth
    username?: string;
    password?: string;
    // Bearer Token / API Key
    token?: string;
    // API Key specifics
    apiKeyIn?: 'header' | 'query';
    apiKeyName?: string;
    // OAuth2 (future)
    oauth2Config?: {
        authUrl?: string;
        tokenUrl?: string;
        clientId?: string;
        clientSecret?: string;
        scope?: string;
    };
}

/** REST-specific request configuration */
export interface RestConfig {
    queryParams?: Record<string, string>;
    pathParams?: Record<string, string>;
    auth?: RestAuthConfig;
}

/** GraphQL-specific request configuration */
export interface GraphQLConfig {
    variables?: Record<string, any>;
    operationName?: string;
}

// Assertion Types
export interface Assertion {
    type: 'Simple Contains' | 'Simple Not Contains' | 'Response SLA' | 'XPath Match' | 'SOAP Fault' | 'HTTP Status' | 'Script';
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
        // SOAP Fault
        expectFault?: boolean; // true = expect fault, false = expect success
        faultCode?: string; // Optional: e.g. "Client", "Server"
        // HTTP Status
        expectedStatus?: string; // Comma-separated, e.g. "200,201"
        // Script
        script?: string; // JavaScript code
    };
}

export interface RequestExtractor {
    type: 'XPath' | 'JSONPath';
    source: 'body' | 'header';
    path: string;
    variable: string;
    id: string;
    /** Default value to use when extraction fails or step hasn't been run */
    defaultValue?: string;
}

// ============================================================================
// WS-SECURITY TYPES
// ============================================================================

export enum WSSecurityType {
    None = 'none',
    UsernameToken = 'usernameToken',
    Certificate = 'certificate'
}

export enum PasswordType {
    PasswordText = 'PasswordText',
    PasswordDigest = 'PasswordDigest'
}

export interface WSSecurityConfig {
    type: WSSecurityType;
    // UsernameToken Fields
    username?: string;
    password?: string;
    passwordType?: PasswordType;
    hasNonce?: boolean;
    hasCreated?: boolean; // For Timestamp
    // Certificate Fields
    privateKeyPath?: string;
    publicCertPath?: string;
}

// SOAP Attachments
export type AttachmentType = 'Base64' | 'MTOM' | 'SwA';

export interface RequestAttachment {
    id: string;          // UUID
    name: string;        // "document.pdf"
    fsPath: string;      // Absolute path to file
    contentId: string;   // "part1" (used for cid:part1 reference)
    contentType: string; // "application/pdf"
    type: AttachmentType; // Optimization intent
    size?: number;       // File size in bytes for UI display
}

export interface ApiRequest {
    name: string;
    request: string; // The body content (XML, JSON, GraphQL query, etc.)
    contentType?: string;
    method?: HttpMethod | string;
    endpoint?: string;
    dirty?: boolean;
    assertions?: Assertion[];
    extractors?: RequestExtractor[];
    headers?: Record<string, string>;
    id?: string;
    wsSecurity?: WSSecurityConfig;
    attachments?: RequestAttachment[];

    // REST/GraphQL Support (Phase 1)
    /** Request type discriminator - defaults to 'soap' for backward compatibility */
    requestType?: RequestType;
    /** Body content type - defaults based on requestType */
    bodyType?: BodyType;
    /** REST-specific configuration (query params, path params, auth) */
    restConfig?: RestConfig;
    /** GraphQL-specific configuration (variables, operation name) */
    graphqlConfig?: GraphQLConfig;
    /** Marks the request as read-only (e.g. within Samples project) */
    readOnly?: boolean;
}

export interface ApiOperation {
    name: string;
    action: string;
    requests: ApiRequest[];
    expanded?: boolean;
    input?: any;
    targetNamespace?: string;
    originalEndpoint?: string;
    id?: string;
}

export interface ApiInterface {
    name: string;
    type: string;
    bindingName: string;
    soapVersion: string;
    definition: string; // WSDL URL
    operations: ApiOperation[];
    expanded?: boolean;
    id?: string;
}

// ============================================================================
// FOLDER TYPES (Unified Structure)
// ============================================================================

/** Universal folder for organizing requests of any type */
export interface ApinoxFolder {
    id: string;
    name: string;
    requests: ApiRequest[];
    folders?: ApinoxFolder[];
    expanded?: boolean;
}

/** @deprecated Use ApinoxFolder instead */
export type RestFolder = ApinoxFolder;

/** REST API collection (deprecated - use folders on ApinoxProject) */
export interface RestCollection {
    id: string;
    name: string;
    description?: string;
    /** Base URL for all requests (can use variables like {{baseUrl}}) */
    baseUrl?: string;
    /** Collection-level variables */
    variables?: Record<string, string>;
    /** Top-level requests */
    requests: ApiRequest[];
    /** Nested folders */
    folders?: ApinoxFolder[];
    expanded?: boolean;
}

// ============================================================================
// PROJECT TYPES
// ============================================================================

export interface ApinoxProject {
    name: string;
    description?: string;
    /** WSDL-imported interfaces (read-only structure) */
    interfaces: ApiInterface[];
    /** User-created folders (can contain any request type) */
    folders?: ApinoxFolder[];
    expanded?: boolean;
    fileName?: string;
    id?: string;
    dirty?: boolean;
    testSuites?: TestSuite[];
    /** @deprecated Use folders instead */
    collections?: RestCollection[];
    /** Marks the project as read-only (e.g. Samples) */
    readOnly?: boolean;
}

/** @deprecated Use ApinoxProject instead - kept for backward compatibility */
export type SoapUIProject = ApinoxProject;

// Test Runner Types
export type TestStepType = 'request' | 'delay' | 'transfer' | 'script';

export interface TestStep {
    id: string;
    name: string;
    type: TestStepType;
    // Common configuration
    config: {
        // For 'request'
        requestId?: string; // Reference to a project request (if linked)
        request?: ApiRequest; // Standalone request copy

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
        scriptContent?: string;
    };
}

export interface TestCase {
    id: string;
    name: string;
    steps: TestStep[];
    expanded?: boolean;
}

export interface TestSuite {
    id: string;
    name: string;
    testCases: TestCase[];
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

export type ProxyEvent = WatcherEvent;

export interface MockEvent extends WatcherEvent {
    ruleId?: string;
    matchedRule?: string;
}

export enum SidebarView {
    HOME = 'home',
    PROJECTS = 'projects',
    COLLECTIONS = 'collections', // REST/GraphQL collections
    EXPLORER = 'explorer',
    TESTS = 'tests',
    WATCHER = 'watcher',
    SERVER = 'server',  // Unified server tab (replaces PROXY + MOCK)
    PERFORMANCE = 'performance',
    HISTORY = 'history'
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

// ============================================
// Unified Server Types
// ============================================

/** Server operating mode */
export type ServerMode = 'off' | 'proxy' | 'mock' | 'both';

/** Unified server configuration */
export interface ServerConfig {
    mode: ServerMode;
    port: number;
    targetUrl: string;

    /** Use system proxy for outgoing requests */
    useSystemProxy?: boolean;

    /** Mock rules (active when mode is 'mock' or 'both') */
    mockRules: MockRule[];

    /** Forward unmatched requests to target */
    passthroughEnabled: boolean;

    /** Auto-capture real responses as mocks */
    recordMode?: boolean;
}

// ============================================
// Mock Server Types
// ============================================

/** Single match condition within a mock rule */
export interface MockMatchCondition {
    type: 'operation' | 'url' | 'soapAction' | 'xpath' | 'header' | 'contains' | 'templateName';
    pattern: string;
    isRegex?: boolean;
    /** For header matching */
    headerName?: string;
}

/** Mock rule with multiple conditions (AND logic) */
export interface MockRule {
    id: string;
    name: string;
    enabled: boolean;

    /** All conditions must match (AND logic) */
    conditions: MockMatchCondition[];

    /** Response configuration */
    statusCode: number;
    responseBody: string;
    responseHeaders?: Record<string, string>;
    contentType?: string;
    /** Simulate latency (ms) */
    delayMs?: number;

    /** Metadata for recorded mocks */
    recordedFrom?: string;
    recordedAt?: number;
    /** How many times this rule has been matched */
    hitCount?: number;
}

/** Mock server configuration */
export interface MockConfig {
    enabled: boolean;
    port: number;

    /** Where to forward unmatched requests */
    targetUrl: string;

    /** Mock rules */
    rules: MockRule[];

    /** Forward unmatched requests to target (true) or return 404 (false) */
    passthroughEnabled: boolean;
    /** Route passthrough through Dirty Proxy instead of direct */
    routeThroughProxy: boolean;

    /** Auto-capture real responses as mocks */
    recordMode?: boolean;
}

/** Mock event for traffic log */
export interface MockEvent {
    id: string;
    timestamp: number;
    timestampLabel: string;
    method: string;
    url: string;
    requestHeaders: Record<string, any>;
    requestBody: string;
    status?: number;
    responseHeaders?: Record<string, any>;
    responseBody?: string;
    duration?: number;
    matchedRule?: string;
    passthrough?: boolean;
}

/** Rule for proxy routing */
export interface ProxyRule {
    id: string; // valid UUID
    pattern: string; // e.g. "*.local", "api.google.com"
    useProxy: boolean; // true = use configured/system proxy, false = direct
    enabled: boolean;
}

export interface ApinoxConfig {
    version: number;
    network?: {
        defaultTimeout?: number;
        retryCount?: number;
        proxy?: string;
        strictSSL?: boolean;
        proxyRules?: ProxyRule[];
    };
    fileWatcher?: {
        requestPath?: string;
        responsePath?: string;
    };
    ui?: {
        layoutMode?: 'vertical' | 'horizontal';
        showLineNumbers?: boolean;
        alignAttributes?: boolean;
        inlineElementValues?: boolean;
        splitRatio?: number;
        autoFoldElements?: string[];
    };
    activeEnvironment?: string;
    lastConfigPath?: string;
    lastProxyTarget?: string;
    openProjects?: string[];
    environments?: Record<string, {
        endpoint_url?: string;
        env?: string;
        color?: string;
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
    /** Mock server configuration (legacy, use server instead) */
    mockServer?: MockConfig;
    /** Performance testing suites */
    performanceSuites?: PerformanceSuite[];
    /** Performance run history (last 5 per suite) */
    performanceHistory?: PerformanceRun[];
    /** Scheduled performance runs */
    performanceSchedules?: PerformanceSchedule[];
    /** Unified server configuration */
    server?: ServerConfig;
}

// ============================================
// Performance Testing Types
// ============================================

/** Configuration for a performance test suite */
export interface PerformanceSuite {
    id: string;
    name: string;
    description?: string;
    requests: PerformanceRequest[];
    /** How many times to run the full sequence */
    iterations: number;
    /** Delay between requests in ms (0 for sequential, no delay) */
    delayBetweenRequests: number;
    /** Number of warmup runs to discard before measuring */
    warmupRuns: number;
    /** Concurrency level for parallel execution (1 = sequential) */
    concurrency: number;
    /** Created timestamp */
    createdAt: number;
    /** Last modified timestamp */
    modifiedAt: number;
    /** Source if imported from test suite */
    importedFrom?: {
        type: 'testSuite';
        suiteId: string;
        suiteName: string;
    };
    /** Collapsed sections state for UI persistence */
    collapsedSections?: string[];
}

/** Single request within a performance suite */
export interface PerformanceRequest {
    id: string;
    name: string;
    endpoint: string;
    method?: string;
    soapAction?: string;
    interfaceName?: string;
    operationName?: string;
    requestBody: string;
    headers?: Record<string, string>;
    /** Extractors for passing values between requests */
    extractors: RequestExtractor[];
    /** Expected max response time in ms */
    slaThreshold?: number;
    /** Order in the sequence */
    order: number;
}

/** Result of a single performance run */
export interface PerformanceRun {
    id: string;
    suiteId: string;
    suiteName: string;
    startTime: number;
    endTime: number;
    status: 'completed' | 'aborted' | 'failed';
    results: PerformanceResult[];
    summary: PerformanceStats;
    /** Environment used if any */
    environment?: string;
}

/** Result for a single request execution */
export interface PerformanceResult {
    requestId: string;
    requestName: string;
    interfaceName?: string;
    operationName?: string;
    iteration: number;
    duration: number;
    status: number;
    success: boolean;
    slaBreached: boolean;
    error?: string;
    extractedValues?: Record<string, string>;
    timestamp: number;
}

/** Aggregate statistics for a performance run */
export interface PerformanceStats {
    totalRequests: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    /** Median response time */
    p50: number;
    /** 95th percentile */
    p95: number;
    /** 99th percentile */
    p99: number;
    slaBreachCount: number;
    totalDuration: number;
}

// ============================================
// Performance Scheduling Types
// ============================================

/** Scheduled performance run configuration */
export interface PerformanceSchedule {
    id: string;
    /** Reference to the suite to run */
    suiteId: string;
    suiteName: string;
    /** Cron expression (e.g., "0 3 * * *" for daily at 3am) */
    cronExpression: string;
    /** Human-readable description */
    description?: string;
    /** Whether this schedule is active */
    enabled: boolean;
    /** Timestamp of last run */
    lastRun?: number;
    /** Result status of last run */
    lastRunStatus?: 'completed' | 'failed' | 'aborted';
    /** Next scheduled run time */
    nextRun?: number;
    /** Creation timestamp */
    createdAt: number;
}

// ============================================
// Distributed Worker Types
// ============================================

/** Status of a connected distributed worker */
export interface DistributedWorker {
    id: string;
    status: 'connected' | 'working' | 'idle' | 'disconnected';
    maxConcurrent: number;
    platform?: string;
    nodeVersion?: string;
    connectedAt: number;
    lastHeartbeat?: number;
    assignedIterations?: { start: number; end: number };
    completedIterations?: number;
}

/** Status of the performance test coordinator */
export interface CoordinatorStatus {
    running: boolean;
    port: number;
    workers: DistributedWorker[];
    expectedWorkers: number;
}

// ============================================
// Request History Types
// ============================================

/** Entry in request history tracking manual executions */
export interface RequestHistoryEntry {
    id: string;
    timestamp: number;
    projectName: string;
    projectId?: string;
    interfaceName: string;
    operationName: string;
    requestName: string;
    endpoint: string;

    /** Request details */
    requestBody: string;
    headers: Record<string, string>;

    /** Response details */
    statusCode?: number;
    duration?: number;
    responseSize?: number;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    success?: boolean;
    error?: string;

    /** User metadata */
    starred: boolean;
    notes?: string;
    color?: string;
}

/** Configuration for request history */
export interface HistoryConfig {
    maxEntries: number;
    groupBy: 'time' | 'project' | 'flat';
    autoClear: boolean;
    clearAfterDays?: number;
}
