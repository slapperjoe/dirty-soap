# APInox - Agent Context

## Project Overview
This is a **VS Code Extension** for exploring SOAP Web Services (WSDL). It mimics the UI/UX of tools like Bruno or Postman but for SOAP.

## Architecture

The project generates a VSIX extension that runs in VS Code's Extension Host, which spawns a React-based Webview.

### 1. Extension Host (`src/`)
-   **Runtime**: Node.js
-   **Key Libraries**: `soap` (node-soap), `axios`
-   **Responsibilities**:
    -   Parsing WSDLs (`soapClient.ts`).
    -   Executing Requests to avoid CORS issues in the webview.
    -   Managing the Webview panel (`extension.ts`).
    -   Logging to VS Code Output Channel.

### 2. Webview (`webview/`)
-   **Runtime**: Browser (Chromium) within VS Code
-   **Framework**: React + Vite
-   **Styling**: `styled-components` + VS Code CSS Variables (`var(--vscode-...)`)
-   **Communication**: Messages sent via `vscode.postMessage` <-> `window.addEventListener('message')`.

## Key Files & Logic

-   **`src/soapClient.ts`**:
    -   `parseWsdl(url)`: Parses WSDL using `soap.createClientAsync`. **CRITICAL**: Extracts `targetNamespace` from `client.wsdl.definitions.targetNamespace` (or `$targetNamespace`) to pass to the UI.
    -   `executeRequest(...)`:
        -   If `args` is an XML string, delegates to `executeRawRequest`.
    -   `executeRawRequest(...)`:
        -   Manually finds endpoint/SOAPAction from `client.wsdl.definitions`.
        -   Uses **Axios** to send the raw XML POST request (bypassing `node-soap`'s object generation which can filter out custom XML).

-   **`webview/src/components/RequestEditor.tsx`**:
    -   Generates default XML based on `operation.input`.
    -   **Important**: Uses a recursive helper `generateXmlBody` to create XML tags based on the input schema, instead of `JSON.stringify`.
    -   **Revert Logic**: Resets state to the memoized `defaultXml`. Note: `window.confirm` is avoided as it blocks webviews; reverts immediately.

## Data Flow

1.  **Load WSDL**: User enters URL -> Webview sends `loadWsdl` -> Extension parses -> Extension sends `wsdlParsed` with Services/Operations -> Webview updates Sidebar.
2.  **Select Operation**: Webview generates default XML locally using `targetNamespace` from the parsed model.
3.  **Execute**: User clicks Run -> Webview sends `executeRequest` with **edited XML** -> Extension uses `axios` to POST -> Extension sends `response` -> Webview displays in `ResponseViewer`.

## Known Quirks / Decisions

1.  **Raw XML Execution**: We allow users to edit the request body freely. To support this, we bypass `node-soap`'s method calling (which expects JS Objects) and use `axios` to send the raw XML string. This ensures 100% fidelity to what the user sees/edits.
2.  **VS Code Theme integration**: The webview uses CSS variables provided by VS Code (e.g., `--vscode-editor-background`) to look native in any theme.
3.  **Namespace Issues**: WSDL parsers can sometimes bury the namespace. We specifically look for `$targetNamespace` in `soapClient.ts` as a fallback.

## Dirty Proxy

The Dirty Proxy intercepts HTTP/HTTPS traffic for debugging and testing.

### Key Files
-   **`src/services/ProxyService.ts`**: HTTP/HTTPS proxy server using `http.createServer` + `axios` for forwarding.
-   **`src/utils/ReplaceRuleApplier.ts`**: Applies XPath-scoped text replacement to request/response XML.

### Replace Rules

Rules are stored in `~/.apinox/config.jsonc` under `replaceRules`:

```jsonc
{
  "replaceRules": [
    {
      "id": "uuid",
      "name": "Mask SSN",
      "xpath": "//Customer/SSN",
      "matchText": "\\d{3}-\\d{2}-\\d{4}",
      "replaceWith": "XXX-XX-XXXX",
      "target": "response",  // "request" | "response" | "both"
      "enabled": true,
      "isRegex": true
    }
  ]
}
```

**How it works:**
1. Rules synced to `ProxyService` on config load/save.
2. Before forwarding request → applies rules with `target = "request"` or `"both"`.
3. Before forwarding response → applies rules with `target = "response"` or `"both"`.
4. XPath-scoped: Only replaces text within elements matching the XPath's target element name.

## Mock Server

The Mock Server returns predefined responses without hitting the real backend.

### Key Files
-   **`src/services/MockServerService.ts`**: HTTP server that matches requests against mock rules.
-   **`src/commands/MockCommands.ts`**: Command handlers for start/stop and rule management.

### Mock Rules

Rules are stored in `~/.apinox/mock-rules.jsonc`:

```jsonc
[
  {
    "id": "uuid",
    "name": "GetUser Success",
    "enabled": true,
    "conditions": [
      { "type": "url", "pattern": "/api/user", "isRegex": false }
    ],
    "statusCode": 200,
    "responseBody": "<Response>...</Response>",
    "delayMs": 100
  }
]
```

**Matching**:
- `url`: Match against request URL path
- `xpath`: Match against request body XML content
- `regex`: Advanced pattern matching

**Unified Server Tab**:
The webview provides a unified `Server` tab with mode toggle (Off, Mock, Proxy, Both).

## Setup Instructions

If you are an agent or developer setting this up from scratch:

1.  **Install Dependencies**:
    ```bash
    npm install
    cd webview
    npm install
    ```

2.  **Build Webview**:
    The webview must be built before the extension can load it.
    ```bash
    cd webview
    npm run build
    ```

3.  **Run Extension**:
    -   Open the project in VS Code.
    -   Press **F5** to launch the Extension Host.
    -   Or run `code .` in the root and use the "Run and Debug" side panel.

4.  **Verification**:
    -   In the Extension Host window, run command `APInox: Open Interface`.
    -   Load a WSDL (e.g. `http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL`).
    -   Select an operation and click **Run**.

## Storage Classes

The extension has two storage mechanisms for projects:

| Class | Format | Use Case |
|-------|--------|----------|
| `ProjectStorage` | Single XML file (SOAP-UI compatible) | Import/export for compatibility with SOAP-UI |
| `FolderProjectStorage` | Folder structure with JSON/XML files | Native format, git-friendly, human-readable |

**FolderProjectStorage** is the primary format. Projects saved with this format have the structure:
```
MyProject/
├── properties.json        # Project metadata
├── interfaces/
│   └── MyService/
│       ├── interface.json # Binding info
│       └── MyOperation/
│           ├── operation.json
│           ├── Request1.xml   # Request body
│           └── Request1.json  # Request metadata
└── tests/
    └── MySuite/
        └── MyTestCase/
            └── 01_step.json
```

## Known Technical Debt

See [CODE_ANALYSIS.md](./CODE_ANALYSIS.md) for a detailed analysis of simplification opportunities.
