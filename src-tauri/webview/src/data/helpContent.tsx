import { MonitorPlay, Eye, FileJson, Network, Radio, Layout, FlaskConical, Activity, Compass, FolderOpen, Settings, Cloud, Clock, ListChecks } from 'lucide-react';

const normalizeContent = (text: string) => {
    const trimmed = text.replace(/^\n/, '').replace(/\n\s*$/, '');
    const lines = trimmed.split('\n');
    const indents = lines
        .filter(line => line.trim().length > 0)
        .map(line => (line.match(/^\s*/) || [''])[0].length);
    const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
    return lines.map(line => line.slice(minIndent)).join('\n');
};

const HELP_SECTIONS_RAW = [
    {
        id: 'core',
        label: 'Core',
        icon: Layout,
        order: 1,
        content: `
    # Core

    Start by loading a WSDL or OpenAPI file, add items to a project, then build and run requests in the editor.
    `,
        children: [
            {
                id: 'wsdl-editor',
                label: 'Request Editor',
                icon: FileJson,
                order: 1,
                content: `
    # Request Editor

    The Request Editor is where you build SOAP requests and inspect responses.

    ## Editing

    - **Default XML** is generated from the WSDL and is fully editable.
    - **Headers**: Use the Headers tab to view/edit request headers and view response headers.
    - **Assertions**: Use the Assertions tab to add checks for a request.

    ## Toolbar Actions

    - **Run / Cancel**: Execute or stop the current request.
    - **Reset**: Restore the default XML template.
    - **Format XML**: Reformat the current XML.
    - **Toggle Attribute Alignment**: Align attributes vertically.
    - **Toggle Inline Values**: Compact simple element values onto one line.
    - **Hide Debugger Causality Data**: Remove VS debugger markers from the XML (when available).
    - **Code**: Generate a code snippet for the request.

    ## Variables & Environments

    - Use \`{{variable}}\` syntax in XML or headers.
    - Environments are managed in **Settings → Environments** and switched from the sidebar ENV selector.

    ## User Scripts

    Place custom scripts in \`~/.apinox/scripts\` and export functions. Use them as \`{{functionName}}\`.
    `
            },
            {
                id: 'workspace',
                label: 'Workspace',
                icon: Layout,
                order: 2,
                content: `
    # Workspace & Projects

    APInox organizes your work into a structured hierarchy so you can save and reuse requests.

    ## Structure

    - **Project**: Top-level container stored in your workspace (folder-based format).
    - **Interface**: A WSDL service/port definition.
    - **Operation**: A single SOAP action.
    - **Request**: A saved request instance for an operation.

    ## Context Actions

    Use right-click menus in the Explorer to clone, rename, or delete items.
    `
            },
            {
                id: 'interface',
                label: 'Interfaces',
                icon: Layout,
                order: 3,
                content: `
    # Interfaces

    An **Interface** represents a WSDL service/port definition and groups related operations.

    ## Summary

    The Interface summary shows key details when available:

    - **WSDL URL/File**
    - **SOAP Version**
    - **Binding**
    - **Endpoint**

    ## Navigation

    Expand/collapse the interface in the sidebar to see operations. Re-import the WSDL when the definition changes.
    `
            },
            {
                id: 'operation',
                label: 'Operations',
                icon: Layout,
                order: 4,
                content: `
    # Operations

    An **Operation** is a single SOAP action defined in the WSDL.

    ## Requests

    Each operation can have multiple saved requests. Use context actions in the sidebar to clone, rename, or delete a request.
    `
            }
        ]
    },
    {
        id: 'explorer',
        label: 'Explorer',
        icon: Compass,
        order: 2,
        content: `
    # Explorer

    Use the Explorer to load WSDL/OpenAPI definitions and inspect operations before saving them into projects.
    `,
        children: [
            {
                id: 'wsdl-explorer',
                label: 'WSDL / OpenAPI',
                icon: Compass,
                order: 1,
                content: `
    # WSDL / OpenAPI Explorer

    Load a WSDL or OpenAPI (JSON/YAML) from URL or file, then browse interfaces and operations.

    ## Actions

    - **Load API** to fetch a definition.
    - Use **Add to Project** to import selected items.
    - **Add All** imports everything currently loaded.
    - **Clear Explorer** removes the loaded definitions.
    `
            },
            {
                id: 'collections',
                label: 'Collections (REST/GraphQL)',
                icon: FolderOpen,
                order: 2,
                content: `
    # Collections

    Collections organize REST and GraphQL requests.

    ## Actions

    - Create collections from the Collections sidebar.
    - Add requests and folders to organize APIs.
    - Select a request to edit it in the Request Editor.
    - Use delete/rename actions from the collection list.
    `
            }
        ]
    },
    {
        id: 'testing',
        label: 'Testing',
        icon: FlaskConical,
        order: 3,
        content: `
    # Testing

    Build automated tests with suites, cases, assertions, and performance runs.
    `,
        children: [
            {
                id: 'test-suite',
                label: 'Test Suites',
                icon: FlaskConical,
                order: 1,
                content: `
    # Test Suites

    A **Test Suite** groups automated tests for a service or feature.

    ## Suite Actions

    - **Create**: Click the **+** icon in the Tests sidebar header.
    - **Run**: Click the **Play** icon on a suite row to run all cases.
    - **Delete**: Click the trash icon to remove a suite.

    ## Test Cases

    Suites contain **Test Cases** with ordered steps. Add cases from the suite row, then add steps inside each case.
    `
            },
            {
                id: 'tests-assertions',
                label: 'Assertions',
                icon: ListChecks,
                order: 2,
                content: `
    # Tests & Assertions

    APInox includes a test runner for automated SOAP validation.

    ## Hierarchy

    - **Test Suite**: Container for related test cases.
    - **Test Case**: A scenario composed of ordered steps.
    - **Test Step**: Typically a request step, but can include other step types.

    ## Creating Tests

    1. Create a suite from the Tests sidebar.
    2. Add cases to the suite.
    3. Add steps by dragging operations from the Explorer or using the add button inside a case.

    ## Assertions

    Assertions validate response content and status.

    ### Adding Assertions

    1. Run a request step.
    2. Open the **Assertions** tab.
    3. Use the **Add Assertion** dropdown to select a type.

    ### Assertion Types

    - **Simple Contains** / **Simple Not Contains**
    - **Response SLA**
    - **XPath Match**
    - **SOAP Fault**
    - **HTTP Status**
    - **Script (JavaScript)**

    ### Smart Assertions

    Select text in the Response viewer, then use **Match** or **Exists** in the response toolbar to create assertions.

    ## Variables & Extractors

    Select text in the Response viewer and click **Extract** to save it as a variable. Use \`{{variableName}}\` in XML or headers.
    `
            },
            {
                id: 'performance-suite',
                label: 'Performance',
                icon: Activity,
                order: 3,
                content: `
    # Performance Suites

    Performance suites run a sequence of requests repeatedly to measure latency and reliability.

    ## Create & Run

    1. Add a suite from the Performance sidebar.
    2. Add requests to the suite (use **Add Request**).
    3. Click **Run Suite** to execute.

    ## Configuration

    - **Delay (ms)**: Pause between requests in sequence.
    - **Iterations**: How many times to run the full request list.
    - **Concurrency**: Parallelism (1 = sequential).
    - **Warmup Runs**: Runs excluded from stats.

    ## Requests

    - Drag to reorder.
    - Use the context menu to rename or delete.

    ## Scheduling

    Add cron-based schedules to run suites automatically.

    ## Distributed Workers

    Optionally start a coordinator and connect workers for distributed execution.

    ## Results

    - Summary stats (avg, p50/p95/p99, success rate).
    - Run history with per-run details.
    - Export results to CSV.
    `
            }
        ]
    },
    {
        id: 'server-group',
        label: 'Server',
        icon: Network,
        order: 4,
        content: `
    # Server

    The unified Server tab combines proxy and mock features in one view.
    `,
        children: [
            {
                id: 'server',
                label: 'Unified Server',
                icon: Network,
                order: 1,
                content: `
    # Unified Server

    The **Server** tab combines Proxy and Mock in one place.

    ## Modes

    | Mode | Description |
    |------|-------------|
    | **Off** | Server stopped |
    | **Moxy** | Mock responses from rules (sidebar label) |
    | **Proxy** | Traffic logging with breakpoints + replace rules |
    | **Both** | Mock + Proxy combined |

    ## Using the Server Tab

    1. Choose a mode.
    2. Click **Play** to start or **Square** to stop.
    3. Traffic history shows combined Proxy + Mock events.

    ## Mode-Specific Sections

    - **Moxy/Both**: Mock Rules section (add, edit, toggle, delete).
    - **Proxy/Both**: Breakpoints section (add, edit, toggle, delete).

    ## Controls

    - **Gear** opens Server settings.
    - **Trash** clears traffic history.
    - **Plus** adds a rule or breakpoint in the active section.
    - **Record Mode** is configured in Server settings.
    `
            },
            {
                id: 'proxy',
                label: 'APInox Proxy',
                icon: MonitorPlay,
                order: 2,
                content: `
    # APInox Proxy

    The proxy intercepts HTTP/S traffic for inspection and modification.

    ## Getting Started

    1. Configure **Port** and **Target URL** in **Settings → Server**.
    2. Select **Proxy** or **Both** and click **Play**.
    3. Point your client at the proxy URL (e.g., \`http://localhost:9000\`).
    4. Inspect events in **Traffic**.

    ## Breakpoints

    Breakpoints pause requests/responses so you can edit them:

    - **Match On**: URL, body, or header (regex optional).
    - **Target**: request, response, or both.
    - **Timeout**: Auto-resumes after 45s.

    ## Replace Rules

    Replace Rules apply automatic replacements in-flight:

    - Configure in **Settings → Replace Rules**.
    - XPath-scoped and can target request, response, or both.

    ## HTTPS Support

    The proxy generates a local certificate for HTTPS traffic. Trust it in your client if needed.
    `
            },
            {
                id: 'mock-server',
                label: 'APInox Mock',
                icon: Radio,
                order: 3,
                content: `
    # APInox Mock

    The mock server returns predefined responses without hitting a real backend.

    ## Getting Started

    1. Select **Moxy** or **Both** mode in the Server tab.
    2. Add mock rules.
    3. Start the server.

    ## Mock Rules

    Rules match requests and return canned responses. Supported match conditions include:

    - **URL Path**
    - **SOAPAction**
    - **Operation Name**
    - **Body Contains**
    - **XPath**
    - **Header**

    Response configuration includes status code, body, headers, and optional delay.

    ## Record Mode & Passthrough

    - **Record Mode** (Settings → Server) captures real responses as rules.
    - **Forward unmatched requests** sends misses to the target server.
    `
            }
        ]
    },
    {
        id: 'tools',
        label: 'Tools & Logs',
        icon: Clock,
        order: 5,
        content: `
    # Tools & Logs

    Utility views for monitoring traffic and reviewing request history.
    `,
        children: [
            {
                id: 'file-watcher',
                label: 'File Watcher',
                icon: Eye,
                order: 1,
                content: `
    # File Watcher

    The File Watcher monitors request/response files written by external tools.

    ## Setup

    1. Configure file paths in **Settings → JSON (Advanced)** under \`fileWatcher.requestPath\` and \`fileWatcher.responsePath\`.
    2. Defaults are OS temp paths with \`requestXML.xml\` and \`responseXML.xml\` (Windows defaults to \`C:\\temp\`).
    3. Click **Start Watcher** in the sidebar.

    ## Functionality

    - **Real-time Updates**: New file changes appear in the history list.
    - **Smart Naming**: Events are labeled from the SOAP body root when possible.
    - **Read-Only View**: Watcher items can be inspected but not edited.
    - **Export**: Export history to CSV from the watcher header.
    `
            },
            {
                id: 'history',
                label: 'History',
                icon: Clock,
                order: 2,
                content: `
    # Request History

    History stores recent manual executions so you can replay or inspect them.

    ## Actions

    - **Search** to filter entries.
    - **Star** important requests.
    - **Replay** to load a request/response into the editor.
    - **Delete** to remove entries.
    `
            }
        ]
    },
    {
        id: 'settings',
        label: 'Settings',
        icon: Settings,
        order: 6,
        content: `
    # Settings

    The Settings modal provides UI preferences, environments, replace rules, and integrations.
    `,
        children: [
            {
                id: 'settings-general',
                label: 'General',
                icon: Settings,
                order: 1,
                content: `
    # Settings → General

    Control UI behavior such as layout mode, line numbers, attribute alignment, and auto-folding.
    `
            },
            {
                id: 'settings-environments',
                label: 'Environments',
                icon: Compass,
                order: 2,
                content: `
    # Settings → Environments

    Manage environment profiles used in \`{{variable}}\` substitution.

    - Set **Endpoint URL**, **Short Code**, and **Color**.
    - Mark a profile as **Active**.
    - Import/export environments as JSON.
    `
            },
            {
                id: 'settings-globals',
                label: 'Globals',
                icon: Cloud,
                order: 3,
                content: `
    # Settings → Globals

    Define global variables available to all requests via \`{{variable}}\`.
    `
            },
            {
                id: 'settings-replace-rules',
                label: 'Replace Rules',
                icon: ListChecks,
                order: 4,
                content: `
    # Settings → Replace Rules

    Configure automatic replacements in proxy traffic.

    - Target request, response, or both.
    - XPath-scoped replacements for specific elements.
    - Regex or plain-text matching.
    `
            },
            {
                id: 'settings-server',
                label: 'Server',
                icon: Network,
                order: 5,
                content: `
    # Settings → Server

    Configure server port, target URL, and mock options like passthrough and record mode.
    `
            },
            {
                id: 'settings-json',
                label: 'JSON (Advanced)',
                icon: FileJson,
                order: 6,
                content: `
    # Settings → JSON (Advanced)

    Edit the raw JSONC config directly. Useful for advanced tweaks and file watcher paths.
    `
            }
        ]
    },
    {
        id: 'integrations',
        label: 'Integrations',
        icon: Cloud,
        order: 7,
        content: `
    # Integrations

    Connect external services such as Azure DevOps.
    `,
        children: [
            {
                id: 'integrations-azure-devops',
                label: 'Azure DevOps',
                icon: Cloud,
                order: 1,
                content: `
    # Azure DevOps

    Configure org URL, store a PAT, and select a project in **Settings → Integrations**.

    When configured, use the **Add to Azure DevOps** action in the request toolbar to post request/response data to a work item.
    `
            }
        ]
    }
];

const normalizeSection = (section: any) => ({
    ...section,
    content: normalizeContent(section.content),
    children: section.children
        ? [...section.children]
            .sort((a: any, b: any) => (a.order ?? 999) - (b.order ?? 999))
            .map(normalizeSection)
        : undefined
});

export const HELP_SECTIONS = [...HELP_SECTIONS_RAW]
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    .map(normalizeSection);
