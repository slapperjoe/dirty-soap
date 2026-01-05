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
    /** Default value to use when extraction fails or step hasn't been run */
    defaultValue?: string;
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
    SERVER = 'server',  // Unified server tab (replaces PROXY + MOCK)
    PERFORMANCE = 'performance'
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

export interface DirtySoapConfig {
    version: number;
    network?: {
        defaultTimeout?: number;
        retryCount?: number;
        proxy?: string;
        strictSSL?: boolean;
        proxyRules?: ProxyRule[];
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
    extractors: SoapRequestExtractor[];
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
