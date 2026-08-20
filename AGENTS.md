# APInox - Agent Context

## Project Overview
This is a **Tauri Desktop Application** for exploring SOAP Web Services (WSDL). It mimics the UI/UX of tools like Bruno or Postman but for SOAP.

## Architecture

**PRIMARY PLATFORM**: Tauri standalone desktop application  
**SISTER PROJECT**: [APIprox](https://github.com/yourusername/apiprox) - HTTP/HTTPS proxy & CLI tools (distributed testing, coordinator/worker)

The project is a Tauri desktop application:
1. **Tauri App**: Standalone desktop application using Tauri + React
2. **Rust Backend**: Tauri commands and Rust modules for WSDL parsing, SOAP/HTTP execution, storage, and desktop integrations

### Tauri Application Architecture (PRIMARY)

```
┌─────────────────────────────────────────────────────────┐
│                   Tauri Desktop App                     │
├─────────────────────────────────────────────────────────┤
│  React Webview (src-tauri/webview/)                     │
│  - UI Components (React + styled-components)            │
│  - State Management (React hooks)                       │
│  - Bridge Communication (postMessage / invoke)          │
├─────────────────────────────────────────────────────────┤
│  Rust Backend (src-tauri/src/)                          │
│  - Tauri commands                                       │
│  - SOAP / HTTP execution                                │
│  - WSDL parsing                                         │
│  - Project storage                                      │
│  - Proxy / mock / testing services                      │
├─────────────────────────────────────────────────────────┤
│  Tauri Core                                             │
│  - Window management                                    │
│  - Native file dialogs                                  │
│  - Cross-platform packaging                             │
└─────────────────────────────────────────────────────────┘
```

### Communication Architecture

**Webview ←→ Rust Backend** (Primary communication path):
- **Direction**: Bidirectional command/event flow
- **Protocol**: Tauri `invoke()` commands plus window events/bridge helpers
- **Implementation**:
  - Frontend: `bridge.sendMessage({ command, ...data })` and Tauri invokes where appropriate
  - Backend: `src-tauri/src/lib.rs` command registration and feature modules under `src-tauri/src/`
- **Pattern**: Request/Response + Event Streaming

**Key Difference from Legacy Architecture**:
- No VS Code extension code
- No separate backend process in this repository
- File I/O and native operations run through the Rust backend
- Local-first persistence remains the default UI pattern
- Simpler build and packaging flow

### 1. Rust Backend (`src-tauri/src/`)
-   **Runtime**: Rust
-   **Framework**: Tauri v2
-   **Responsibilities**:
    -   Parsing WSDLs and schemas
    -   Executing HTTP/SOAP requests
    -   Running proxy/mock/testing services
    -   File I/O and project storage
    -   Logging through the Tauri/Rust logger
    -   Command registration and native integrations

### 2. React Webview (`src-tauri/webview/`)
-   **Runtime**: Browser (Chromium) within Tauri window
-   **Framework**: React + Vite
-   **Styling**: `styled-components` + CSS Variables
-   **State Management**: React hooks + local state
-   **Communication**: `bridge.sendMessage()` plus Tauri commands/events

### 3. Tauri Core
-   **Responsibilities**:
    -   Window management
    -   Native file dialogs
    -   App lifecycle and packaging
    -   Cross-platform desktop integration

## Key Files & Logic

-   **`src-tauri/src/parsers/wsdl_commands.rs`**:
    -   Handles WSDL loading/parsing requests from the frontend.
    -   Bridges parsed services, operations, and schema metadata back to the UI.

-   **`src-tauri/src/soap/client.rs`**:
    -   Builds SOAP envelopes and executes raw SOAP requests.
    -   Captures request/response metadata, headers, and response XML.

-   **`src-tauri/src/lib.rs`**:
    -   Registers frontend-facing Tauri commands.
    -   Wires together storage, parser, HTTP, SOAP, and testing modules.

-   **`src-tauri/webview/src/components/RequestEditor.tsx`**:
    -   Generates default XML based on `operation.input`.
    -   **Important**: Uses a recursive helper `generateXmlBody` to create XML tags based on the input schema, instead of `JSON.stringify`.
    -   **Revert Logic**: Resets state to the memoized `defaultXml`.

## Data Flow (Tauri Application)

1.  **Load WSDL**: User enters a URL → Webview sends `loadWsdl` → Rust backend parses the document → backend returns services/operations → Webview updates the sidebar.
2.  **Select Operation**: Webview generates default XML locally using `targetNamespace` from the parsed model.
3.  **Execute**: User clicks Run → Webview sends `executeRequest` with **edited XML** → Rust backend performs the HTTP/SOAP request → backend returns the response → Webview displays it in `ResponseViewer`.
4.  **Save Project**: User makes changes → Webview updates local state → Webview calls `saveProject()` → Saves directly to disk via `FolderProjectStorage`.

## Architecture Patterns

### Local-First Persistence
- **Frontend manages state**: Projects, test cases, workflows stored in React state
- **Immediate saves**: Changes trigger `saveProject()` which writes to disk
- **No backend commands needed**: Simple updates do not go through the backend
- **Example**: Updating test step config saves locally, no `updateTestStep` command

### When to Use Backend Commands
✅ **Use backend commands for**:
- WSDL parsing (requires node-soap)
- HTTP/SOAP requests (avoids CORS)
- Proxy/Mock server operations (needs Node.js HTTP server)
- File watching (OS-level notifications)
- Heavy computation

❌ **Don't use backend commands for**:
- Simple state updates (workflow step config changes)
- UI state persistence (layout mode, panel sizes)
- Local project modifications (use direct file saves)

### Command Streaming Pattern
For long-running operations (test suites, performance tests):
```typescript
// Frontend requests with streaming flag
bridge.sendMessage({ command: 'runTestCase', testCase, stream: true });

// Backend creates run ID and updates array
const runId = `run-${Date.now()}`;
testRunStore.set(runId, { updates: [], done: false });

// Frontend polls for updates
bridge.sendMessage({ command: 'getTestRunUpdates', runId, fromIndex: 0 });
```

## Known Quirks / Decisions

1.  **Raw XML Execution**: We allow users to edit the request body freely. To support this, we bypass `node-soap`'s method calling (which expects JS Objects) and use `axios` to send the raw XML string. This ensures 100% fidelity to what the user sees/edits.
2.  **Tauri Window Management**: Single window application, uses overlays/modals instead of multiple windows.
3.  **Namespace Issues**: WSDL parsers can sometimes bury the namespace. We specifically look for `$targetNamespace` in `soapClient.ts` as a fallback.
4.  **Single Runtime**: The backend now runs inside the Tauri/Rust application rather than a separate bundled process.

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

## Setup Instructions (Tauri Application)

If you are an agent or developer setting this up from scratch:

1.  **Install Dependencies**:
    ```bash
    npm install
    cd src-tauri/webview && npm install && cd ../..
    ```

2.  **Run Tauri Application**:
    ```bash
    npm run tauri:dev
    ```

3.  **Build for Production**:
    ```bash
    npm run tauri:build
    ```
    Output: Installers in `src-tauri/target/release/bundle/`

4.  **Verification**:
    -   Launch the application
    -   Create or open a project
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
│       ├── interface.json # Binding info (type, bindingName, soapVersion, definition)
│       └── MyOperation/
│           ├── operation.json  # Operation metadata (name, action, input, targetNamespace, originalEndpoint, fullSchema)
│           ├── Request1.xml    # Request body
│           └── Request1.json   # Request metadata
└── tests/
    └── MySuite/
        └── MyTestCase/
            └── 01_step.json
```

### Critical Storage Fields

**Interface-level** (`interface.json`):
- `definition`: WSDL URL (critical for refresh operations)
- `bindingName`, `soapVersion`: SOAP binding metadata
- `type`: Always "soap" for SOAP interfaces
- `displayName`: UI display name (optional, preserves original `name` for binding)

**Operation-level** (`operation.json`):
- `originalEndpoint`: **CRITICAL** - The service endpoint URL from WSDL. This is used when creating new requests and must persist across saves/loads.
- `targetNamespace`: Namespace for XML generation
- `fullSchema`: Deep schema tree for XML generation (SchemaNode structure)
- `action`: SOAP action header
- `input`: Input parameter schema
- `displayName`: UI display name (optional)

**Request-level** (`RequestName.json`):
- `endpoint`: Request-specific endpoint override
- `method`: HTTP method
- `contentType`: Content type header
- `headers`: Custom headers
- `assertions`, `extractors`, `wsSecurity`, `attachments`: Test/security metadata

### Storage Persistence Flow

When adding an interface from API Explorer:
1. **WSDL Parser** (`src/WsdlParser.ts`) sets `originalEndpoint` on each operation from WSDL
2. **Explorer adds to project** - operations preserve all fields via spread operator
3. **Save** - `FolderProjectStorage.saveProject()` writes `operation.json` with all metadata
4. **Load** - `FolderProjectStorage.loadProject()` reads `operation.json` and restores via spread operator
5. **Create request** - `useContextMenu.handleAddRequest()` uses `op.originalEndpoint` for new request endpoint

**Common bug**: If `originalEndpoint` is missing in saved files, new requests won't have endpoints. Check that:
- WSDL parser is setting the field (line 234 in `WsdlParser.ts`)
- Save logic includes it (line 96 in `FolderProjectStorage.ts`)
- Operations in memory have it (check before save)

## Coding Standards

These standards are the default for future edits. Apply them to files you touch, but avoid repo-wide reformatting unless the task is specifically a formatting cleanup.

- **Frontend and config files** (`.ts`, `.tsx`, `.js`, `.jsx`, `.json`, `.css`, `.scss`, `.md`, `.yml`, `.yaml`):
  - Use **double quotes** instead of single quotes where the language allows either.
  - Use **spaces, not tabs**.
  - Use **2-space indentation**.
- **Rust files** (`.rs`):
  - Follow `rustfmt` defaults instead of forcing the frontend spacing rules.
  - Use spaces for indentation.

The root `.editorconfig` reflects the indentation rules above so editors pick them up automatically.

## Build & Development Workflow

### Development Build Process

**Important**: APInox now uses a single Tauri runtime with a Rust backend and React webview.

#### What Gets Compiled Where

| Source | Compiler | Output | Used By |
|--------|----------|--------|---------|
| `packages/request-editor/src/*` | Vite / TypeScript | `packages/request-editor/dist/*` | Shared editor package |
| `src-tauri/webview/src/*` | Vite | `src-tauri/webview/dist/*` | Tauri webview |
| `src-tauri/src/*.rs` | cargo | `src-tauri/target/*` | Tauri backend/core |
| `shared/src/*` | TypeScript consumers | package/build outputs | Shared models/utilities |

#### Build Commands

```bash
# Shared packages + webview
npm run compile-webview

# Full Tauri builds
npm run tauri:dev           # Development build and desktop run
npm run tauri:build         # Production build and installers

# Tests
npm test
```

#### Development Iteration Loop

When making changes:

1. **Rust/backend changes** (`src-tauri/src/*.rs`):
   - Restart or rerun `npm run tauri:dev` if needed
   - Check backend logs in the Debug modal or terminal

2. **Frontend changes** (`src-tauri/webview/src/*`):
   - Hot reload works automatically in dev mode

3. **Shared package changes** (`packages/` or `shared/`):
   - Re-run the relevant package/webview build when needed

#### Debugging "My changes aren't working"

If code changes don't appear after restart:

1. **Check compiled output exists**:
   - Frontend: `src-tauri/webview/dist/` should exist for production builds
   - Rust: `src-tauri/target/` should show recent build output

2. **Rerun the appropriate build**:
   ```bash
   npm run compile-webview
   npm run tauri:dev
   ```

3. **Check logs for errors**:
   - Terminal output for Rust/Tauri build errors
   - Debug modal for backend/frontend logs

## Known Technical Debt

*See commit history for past technical debt resolutions.*
