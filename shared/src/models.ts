export interface ServiceOperation {
    name: string;
    input?: any;
    output: any;
    description?: string;
    targetNamespace?: string;
    expanded?: boolean;
    portName?: string;
    originalEndpoint?: string;
    fullSchema?: SchemaNode | null; // Deep complex type tree for XML generation
    action?: string; // SOAP action from binding operation
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
    isChoice?: boolean; // Mark elements that are part of a choice group
    choiceGroup?: number; // Group ID to identify which choice alternatives belong together
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

export interface BasicAuthConfig {
    username: string;
    password: string;
}

export interface BearerAuthConfig {
    token: string;
}

export interface ApiKeyAuthConfig {
    key: string;
    value: string;
    addTo: 'header' | 'query';
}

export interface OAuth2Config {
    accessToken: string;
    tokenType?: string;
}

/** REST authentication configuration (union-typed: each auth variant has its own nested object) */
export interface RestAuthConfig {
    type: RestAuthType;
    basic?: BasicAuthConfig;
    bearer?: BearerAuthConfig;
    apiKey?: ApiKeyAuthConfig;
    oauth2?: OAuth2Config;
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
    type: 'XPath' | 'JSONPath' | 'Regex' | 'Header';
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

// Form Data Types (for multipart/form-data and application/x-www-form-urlencoded)
export type FormFieldType = 'text' | 'file';

export interface FormField {
    name: string;
    value: string;  // For text fields: the value; For file fields: base64 content
    type: FormFieldType;
    enabled: boolean;
    // File-specific fields (only when type === 'file')
    fileName?: string;
    contentType?: string;
    size?: number;
}

// Binary Body Type (for raw binary uploads)
export interface BinaryFile {
    name: string;
    content: string;  // base64-encoded binary data
    contentType: string;
    size: number;
}

/** Stored response from the last execution of a request */
export interface RequestResponse {
    rawResponse?: string;
    status?: number;
    statusText?: string;
    time?: number;
    size?: number;
    headers?: Record<string, string>;
    contentType?: string;
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
    /** Response from the last execution, persisted across restarts */
    lastResponse?: RequestResponse;

    // REST/GraphQL Support (Phase 1)
    /** Request type discriminator - defaults to 'soap' for backward compatibility */
    requestType?: RequestType;
    /** Body content type - defaults based on requestType */
    bodyType?: BodyType;
    /** Query parameters for REST requests */
    queryParams?: Record<string, string>;
    /** REST-specific configuration (query params, path params, auth) */
    restConfig?: RestConfig;
    /** GraphQL-specific configuration (variables, operation name) */
    graphqlConfig?: GraphQLConfig;
    /** Marks the request as read-only (e.g. within Samples project) */
    readOnly?: boolean;
    
    // Form Data & Binary Body Support
    /** Form fields for multipart/form-data or application/x-www-form-urlencoded */
    formFields?: FormField[];
    /** Binary file for raw binary body uploads */
    binaryFile?: BinaryFile;
}

// ============================================================================
// SCRAPBOOK TYPES (API Explorer Quick Requests)
// ============================================================================

/** Scrapbook request - standalone request in API Explorer for quick testing */
export interface ScrapbookRequest extends ApiRequest {
    id: string;           // Required unique identifier
    createdAt: string;    // ISO timestamp
    lastModified: string; // ISO timestamp
}

/** Scrapbook state for managing collection of scrapbook requests */
export interface ScrapbookState {
    requests: ScrapbookRequest[];
}

// ============================================================================
// NOTES TYPES (Hybrid markdown / code / binary scratchpad)
// ============================================================================

/** Language type detected or chosen for a note */
export type NoteLanguage =
    | 'markdown'
    | 'xml'
    | 'json'
    | 'typescript'
    | 'javascript'
    | 'csharp'
    | 'python'
    | 'html'
    | 'css'
    | 'rust'
    | 'plaintext'
    | 'binary';

/** A single entry in the notes index */
export interface NoteEntry {
    id: string;               // UUID
    name: string;             // Display name (filename without path for managed notes)
    filePath: string;         // Absolute path on disk
    language: NoteLanguage;   // Detected or user-overridden language
    isBinary: boolean;        // True if file is binary (use hex editor)
    isManaged: boolean;       // True if stored under ~/.apinox/notes/
    lastModified: string;     // ISO timestamp of last known disk state
    createdAt: string;        // ISO timestamp
}

/** Notes index stored in ~/.apinox/notes/index.json */
export interface NotesIndex {
    entries: NoteEntry[];
    recentPaths: string[];    // Paths of recently opened external files
}

export interface SampleRequestMetadata {
    endpoint?: string;
    soapAction?: string;
    contentType?: string;
    targetNamespace?: string;
    sampleXml?: string;
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
    fullSchema?: SchemaNode | null; // Deep complex type tree for XML generation
    displayName?: string; // For display-only renaming in UI (preserves original name for WSDL binding)
    sampleMetadata?: SampleRequestMetadata;
}

export interface ApiInterface {
    name: string;
    type: string;
    bindingName: string;
    soapVersion: string;
    /** Optional Content-Type override for all requests in this interface (e.g. "text/xml", "application/soap+xml"). Empty/undefined = use SOAP-version default. */
    contentType?: string;
    definition: string; // WSDL URL
    operations: ApiOperation[];
    expanded?: boolean;
    id?: string;
    displayName?: string; // For display-only renaming in UI (preserves original name for WSDL binding)
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

// ============================================================================
// UNIFIED EXPLORER TYPES
// ============================================================================

/** Project type for the unified API explorer (WSDL/OpenAPI as top-level entities) */
export interface UnifiedProject {
    name: string;
    description?: string;
    /** Source type that created this project */
    source: 'wsdl' | 'openapi' | 'manual';
    /** URL of the WSDL/OpenAPI source (for refresh/sync) */
    sourceUrl?: string;
    /** Timestamp when the WSDL/OpenAPI was first parsed */
    parsedAt: Date;
    /** Timestamp of the last refresh/sync */
    lastRefreshedAt?: Date;
    /** SOAP version (1.1 or 1.2) */
    soapVersion?: string;
    /** Optional Content-Type override for all requests in this project (e.g. "text/xml", "application/soap+xml"). Empty/undefined = use SOAP-version default. */
    contentType?: string;
    /** Binding name derived from the WSDL service */
    bindingName?: string;
    /** Operations (which contain requests) */
    operations: ApiOperation[];
    id?: string;
}

// Test Runner Types
export type TestStepType = 'request' | 'delay' | 'transfer' | 'script' | 'workflow';

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

        // For 'workflow' - reusable workflow execution
        workflowId?: string; // Reference to a workflow in project.workflows
        workflowVariables?: Record<string, string>; // Override workflow variables
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

export enum SidebarView {
    HOME = 'home',
    PROJECTS = 'projects',
    COLLECTIONS = 'collections', // REST/GraphQL collections
    EXPLORER = 'explorer',
    UNIFIED_EXPLORER = 'unified_explorer', // Merged projects + explorer
    TESTS = 'tests',
    WORKFLOWS = 'workflows', // NEW: Request chaining workflows
    PERFORMANCE = 'performance',
    HISTORY = 'history',
    PROXY = 'proxy',     // Proxy/traffic interceptor (from APIprox)
    MOCK = 'mock',       // Mock server (from APIprox)
    WATCHER = 'watcher', // File watcher / SOAP pair viewer (from APIprox)
    NOTES = 'notes',     // Notes / markdown scratchpad
}

export interface ApinoxConfig {
    version: number;
    network?: {
        defaultTimeout?: number;
        proxy?: string;
        strictSSL?: boolean;
    };
    ui?: {
        layoutMode?: 'vertical' | 'horizontal';
        showLineNumbers?: boolean;
        alignAttributes?: boolean;
        inlineElementValues?: boolean;
        showDebugIndicator?: boolean;
        splashscreenEnabled?: boolean;
        splitRatio?: number;
        autoFoldElements?: string[];
        editorFontSize?: number;
        editorFontFamily?: string;
        uiFontFamily?: string;
    };
    activeEnvironment?: string;
    lastConfigPath?: string;
    lastProxyTarget?: string;
    openProjects?: string[];
    environments?: Record<string, {
        endpoint_url?: string;
        env?: string;
        color?: string;
        _secretFields?: string[];
        [key: string]: string | string[] | undefined;
    }>;
    globals?: Record<string, string>;
    recentWorkspaces?: string[];
    /** Azure DevOps integration settings */
    azureDevOps?: {
        orgUrl?: string;
        project?: string;
    };
    /** Performance testing suites */
    performanceSuites?: PerformanceSuite[];
    /** Performance run history (last 5 per suite) */
    performanceHistory?: PerformanceRun[];
    /** Scheduled performance runs */
    performanceSchedules?: PerformanceSchedule[];
    /** Workflows for request chaining */
    workflows?: Workflow[];
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
    /** Request type discriminator - defaults to 'soap' for backward compatibility */
    requestType?: RequestType;
    /** Body content type - defaults based on requestType */
    bodyType?: BodyType;
    /** REST-specific configuration (query params, path params, auth) */
    restConfig?: RestConfig;
    /** GraphQL-specific configuration (variables, operation name) */
    graphqlConfig?: GraphQLConfig;
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

// ============================================
// Workflow / Request Chaining Types
// ============================================

/** Type of variable extractor */
export type ExtractorType = 'xpath' | 'jsonpath' | 'regex' | 'header';

/** Variable extractor configuration for workflow steps */
export interface WorkflowExtractor {
    id: string;
    /** Variable name to store extracted value */
    variable: string;
    /** Extraction type */
    type: ExtractorType;
    /** Extraction pattern/path */
    pattern: string;
    /** Source to extract from */
    source: 'body' | 'header' | 'status';
    /** Default value if extraction fails */
    defaultValue?: string;
    /** For header extraction */
    headerName?: string;
}

/** Conditional branching configuration */
export interface WorkflowCondition {
    id: string;
    /** Variable or expression to evaluate */
    expression: string;
    /** Comparison operator */
    operator: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'greaterThan' | 'lessThan' | 'exists' | 'notExists';
    /** Expected value (not needed for exists/notExists) */
    expectedValue?: string;
    /** Step to execute if condition is true */
    trueStepId?: string;
    /** Step to execute if condition is false */
    falseStepId?: string;
}

/** Loop configuration */
export interface WorkflowLoop {
    /** Loop type */
    type: 'count' | 'list' | 'while';
    /** For count type: number of iterations */
    count?: number;
    /** For list type: variable containing array to iterate */
    listVariable?: string;
    /** For while type: condition to check */
    condition?: WorkflowCondition;
    /** Maximum iterations (safety limit) */
    maxIterations: number;
    /** Current iteration variable name */
    iteratorVariable?: string;
}

/** Single step in a workflow */
export interface WorkflowStep {
    id: string;
    name: string;
    /** Step type */
    type: 'request' | 'delay' | 'condition' | 'loop' | 'script';
    /** Order in workflow */
    order: number;
    
    // Request reference (can reference any project)
    projectName?: string;
    interfaceName?: string;
    operationName?: string;
    
    // Legacy: Direct request reference (deprecated, use projectName/interfaceName/operationName)
    /** @deprecated Use projectName/interfaceName/operationName instead */
    requestId?: string;
    /** @deprecated Use projectName/interfaceName/operationName + customization fields */
    request?: ApiRequest;
    
    // Request customization (store custom body/headers for this step)
    requestBody?: string;  // Custom XML body for this step
    endpoint?: string;     // Override endpoint
    headers?: Record<string, string>; // Custom headers
    contentType?: string;  // Content type for request
    requestType?: RequestType; // SOAP, REST, GraphQL
    bodyType?: BodyType;   // XML, JSON, Form Data, etc.
    httpMethod?: HttpMethod; // POST, GET, PUT, DELETE, etc.
    method?: string;       // HTTP method (legacy compat)
    
    /** For delay type: milliseconds to wait */
    delayMs?: number;
    
    /** For condition type: branching logic */
    condition?: WorkflowCondition;
    
    /** For loop type: loop configuration */
    loop?: WorkflowLoop;
    /** For loop type: steps to execute in loop */
    loopSteps?: WorkflowStep[];
    
    /** For script type: JavaScript code */
    script?: string;
    
    /** Variable extractors for this step */
    extractors?: WorkflowExtractor[];
    
    /** Whether step execution failed */
    failed?: boolean;
    /** Error message if failed */
    error?: string;
    /** Response from this step (runtime) */
    response?: any;
    /** Extracted variables from this step (runtime) */
    extractedValues?: Record<string, string>;
}

/** Complete workflow definition */
export interface Workflow {
    id: string;
    name: string;
    description?: string;
    /** Steps in this workflow */
    steps: WorkflowStep[];
    /** Workflow-level variables (initial values) */
    variables?: Record<string, string>;
    /** Created timestamp */
    createdAt: number;
    /** Last modified timestamp */
    modifiedAt: number;
    /** Expanded state in UI */
    expanded?: boolean;
}

/** Result of a workflow execution */
export interface WorkflowExecutionResult {
    workflowId: string;
    workflowName: string;
    startTime: number;
    endTime: number;
    status: 'completed' | 'failed' | 'aborted';
    /** Results for each step */
    stepResults: WorkflowStepResult[];
    /** Final variable state */
    variables: Record<string, string>;
    /** Error message if failed */
    error?: string;
}

/** Result of a single workflow step execution */
export interface WorkflowStepResult {
    stepId: string;
    stepName: string;
    startTime: number;
    endTime: number;
    duration: number;
    status: 'success' | 'failed' | 'skipped';
    /** Response data */
    response?: any;
    /** Status code (for request steps) */
    statusCode?: number;
    /** Extracted variables */
    extractedValues?: Record<string, string>;
    /** Error message if failed */
    error?: string;
    /** For loop steps: iteration count */
    iterations?: number;
    /** For condition steps: which branch was taken */
    branchTaken?: 'true' | 'false';
}

// ─────────────────────────────────────────────────────────────────────────────
// Proxy / Mock / Cert models (from APIprox integration)
// ─────────────────────────────────────────────────────────────────────────────

export interface TrafficEvent {
    id: string;
    timestamp: number;
    timestampLabel: string;
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody: string;
    status?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    durationMs?: number;
    matchedRule?: string;
    passthrough?: boolean;
    /** 'proxy' | 'mock' */
    source: string;
}

export interface ProxyServerConfig {
    enabled: boolean;
    port: number;
    targetUrl: string;
    /** 'proxy' | 'mock' | 'both' */
    mode: string;
}

export interface MockMatchCondition {
    /** 'url' | 'operation' | 'soapAction' | 'header' | 'contains' | 'xpath' | 'templateName' */
    type: string;
    pattern: string;
    isRegex?: boolean;
    headerName?: string;
}

export interface MockRule {
    id: string;
    name: string;
    enabled: boolean;
    conditions: MockMatchCondition[];
    statusCode: number;
    responseBody: string;
    contentType?: string;
    responseHeaders?: Record<string, string>;
    delayMs?: number;
    hitCount?: number;
    recordedAt?: number;
    recordedFrom?: string;
    tags?: string[];
}

export interface MockRuleCollection {
    name: string;
    description: string;
    version: string;
    exportedAt: number;
    rules: MockRule[];
}

export interface MockServerConfig {
    enabled: boolean;
    port: number;
    targetUrl: string;
    rules: MockRule[];
    passthroughEnabled: boolean;
    routeThroughProxy: boolean;
    recordMode: boolean;
}

export interface ReplaceRule {
    id: string;
    name: string;
    enabled: boolean;
    /** 'request' | 'response' | 'both' */
    target: string;
    matchText: string;
    replaceWith: string;
    isRegex?: boolean;
    xpath?: string;
}

export interface BreakpointCondition {
    /** 'url' | 'method' | 'statusCode' | 'header' | 'contains' */
    type: string;
    pattern: string;
    isRegex?: boolean;
    headerName?: string;
}

export interface BreakpointRule {
    id: string;
    name: string;
    enabled: boolean;
    /** 'request' | 'response' | 'both' */
    target: string;
    conditions: BreakpointCondition[];
}

export interface PausedTraffic {
    id: string;
    timestamp: number;
    /** 'request' | 'response' */
    pauseType: string;
    method: string;
    url: string;
    requestHeaders: Record<string, string>;
    requestBody: string;
    statusCode?: number;
    responseHeaders?: Record<string, string>;
    responseBody?: string;
    matchedRule: string;
}

export interface BreakpointResolution {
    /** 'continue' | 'drop' */
    action: string;
    modifiedHeaders?: Record<string, string>;
    modifiedBody?: string;
    modifiedStatusCode?: number;
}

export interface FileWatch {
    id: string;
    name: string;
    enabled: boolean;
    requestFile: string;
    responseFile: string;
    correlationIdElements: string[];
}

export interface SoapMessage {
    id: string;
    watchId: string;
    timestamp: number;
    /** 'request' | 'response' */
    messageType: string;
    filePath: string;
    content: string;
    operationName?: string;
    correlationId?: string;
}

export interface SoapPair {
    id: string;
    watchId: string;
    operationName?: string;
    request?: SoapMessage;
    response?: SoapMessage;
    /** 'pending' | 'matched' */
    status: string;
    createdAt: number;
    updatedAt: number;
}

export interface WatcherSoapEvent {
    /** 'new_request' | 'pair_matched' | 'orphan_response' */
    eventType: string;
    pair: SoapPair;
}

export interface CertInfo {
    exists: boolean;
    certPath: string;
    keyPath: string;
    subject: string;
    issuer: string;
    validFrom: string;
    validTo: string;
    fingerprint: string;
    isTrusted: boolean;
}

export interface SystemProxyStatus {
    enabled: boolean;
    host: string;
    port?: number;
    /** 'windows' | 'macos' | 'linux' | 'unknown' */
    platform: string;
    automationSupported: boolean;
    requiresElevation: boolean;
    networkServices: string[];
}
