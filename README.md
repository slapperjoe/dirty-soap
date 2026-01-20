# APInox

A visual SOAP client for VS Code, inspired by Bruno and SOAP-UI.

## Features

- **Workspace Management**: Manage multiple projects in a single workspace. Save and load projects locally.
- **WSDL Explorer**: 
    - Load WSDLs from URLs or local files.
    - Explore Services, Bindings, and Operations.
    - Selectively add interfaces to your active projects.
- **Smart Proxy Support**: Automatically detects and uses your VS Code or System Proxy settings (supports HTTP/HTTPS proxies with Authentication).
- **WCF/Enterprise Ready**:
    - **SSL Bypass**: Automatically handles self-signed certificates purely for WSDL loading and Request execution (useful for internal dev/test environments).
    - **Header Emulation**: Mimics browser headers to bypass strict WAFs.
    - **Detailed Logging**: Network errors are logged with full status and body for debugging.
- **Request Editor**: 
    - Auto-generates SOAP Envelopes with correct path handling and namespaces.
    - Editable Request Endpoint URL per request.
    - XML Syntax Highlighting.
    - **Wildcard Support**: Use `{{...}}` for dynamic values, date math, or custom JavaScript logic.
- **Response Viewer**:
    - View formatted XML responses.
    - Layout Toggle: Switch between vertical (split up/down) and horizontal (split left/right) views.
- **Unified Server Tab** (Proxy + Mock):
    - **Mode Toggle**: Off, Mock, Proxy, or Both
    - **Dirty Proxy**: Intercepts HTTP/HTTPS traffic for debugging and testing.
        - **Replace Rules**: Modify request/response content in-flight (XPath-scoped).
        - **Breakpoints**: Pause and edit requests/responses in real-time.
    - **Mock Server**: Return canned responses without hitting real backends.
        - **Mock Rules**: Match requests by URL, XPath, or regex.
        - **Record Mode**: Auto-capture real responses as mock rules.
        - **Passthrough**: Forward unmatched requests to real backend.
- **Project Structure**: Organize work into Projects -> Interfaces -> Operations -> Requests.
- **Context Actions**: Clone, Delete, and Rename requests easily via context menus.
- **Settings**: Persistent configuration with a built-in JSONC editor and contextual **Help Panel**.
- **Debug & Diagnostics** (Tauri Mode):
    - **Debug Modal**: Press **Ctrl+Shift+D** to open comprehensive diagnostics.
    - **Sidecar Logs**: View real-time Node.js backend logs with auto-refresh.
    - **Frontend Logs**: Captured browser console logs for React/UI debugging.
    - **System Info**: View configuration state and system diagnostics.
    - **Connection Test**: Test frontend-backend communication with latency display.
    - **Debug Indicator**: Optional red square overlay for advanced debugging (hidden by default).
- **VS Code Integration**: 
    - Status bar button for quick access.
    - Seamless theming and sidebar integration.
    - **Ctrl+S** to save all dirty projects.

## Usage

1. **Open APInox**: Click the **"🧪 APInox"** button in the status bar (bottom), or run command `APInox: Open Interface`.
2. **Load a WSDL**:
    - Use the **WSDL Explorer** section.
    - Select "URL" or "File" input mode.
    - Click `▶` (Load) to parse the WSDL.
3. **Add to Project**:
    - Expand the loaded WSDL in the Explorer.
    - Right-click an Interface -> "Add to Project" (or use the `+` icon in the explorer header to add all).
4. **Create Requests**:
    - In the **Workspace** section, expand your Project and Interface.
    - Right-click an Operation -> "Add Request".
5. **Execute**:
    - Edit the XML body in the editor.
    - (Optionally) Update the Endpoint URL in the toolbar.
    - Click the "Run" button.
6. **Workspace**:
    - Dirty indicator (●) shows unsaved changes.
    - Save button appears on dirty projects/requests.
    - Use **Ctrl+S** to save all dirty projects at once.
    - Use the **Close** (❌) icon to close projects.
7. **Debug & Diagnostics** (Tauri Mode Only):
    - Press **Ctrl+Shift+D** to open the debug modal.
    - View sidecar logs, frontend logs, and system diagnostics.
    - Test connection to backend.
    - Toggle debug indicator visibility if needed.

## Roadmap & Planned Features

We are constantly working to improve APInox for C# developers. Here is what we are planning next:

- **Git Integration**: Shared workspaces and team synchronization.
- **Azure DevOps**: Link operations to Work Items and attach artifacts directly.
- **Generate C# Code**: Copy your SOAP request as a ready-to-use C# `HttpClient` snippet.
- **WSDL to Proxy**: Integration with `dotnet-svcutil`.

## Developer Notes

- **Agent Context**: See [AGENTS.md](./AGENTS.md) for architecture overview and setup instructions.
- **Code Analysis**: See [CODE_ANALYSIS.md](./CODE_ANALYSIS.md) for technical debt and simplification recommendations.
