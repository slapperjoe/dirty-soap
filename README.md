# Dirty SOAP

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
- **Project Structure**: Organize work into Projects -> Interfaces -> Operations -> Requests.
- **Context Actions**: Clone, Delete, and Rename requests easily via context menus.
- **Settings**: Persistent configuration with a built-in JSONC editor and contextual **Help Panel**.
- **VS Code Integration**: seamless theming and sidebar integration.

## Usage

1. **Open Dirty SOAP**: Run command `Dirty SOAP: Open Interface` or click the Soap icon in the Activity Bar.
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
    - Use the **Save** (💾) and **Close** (❌) icons in project headers to manage your work.
    - Use "New Project" and "Load Project" to organize multiple environments.

## Roadmap & Planned Features

We are constantly working to improve Dirty SOAP for C# developers. Here is what we are planning next:

- **Git Integration**: Shared workspaces and team synchronization.
- **Azure DevOps**: Link operations to Work Items and attach artifacts directly.
- **Generate C# Code**: Copy your SOAP request as a ready-to-use C# `HttpClient` snippet.
- **WSDL to Proxy**: Integration with `dotnet-svcutil`.


