# Dirty SOAP Walkthrough

I have implemented a **Dirty SOAP** extension for VS Code, designed to mimic the functionality and aesthetic of tools like SOAP-UI or Bruno.

## Features Implemented

### 1. WSDL Parsing & Exploration
-   **Loading**: Enter a WSDL URL (default: `CountryInfoService`) to load services.
-   **Sidebar**: Displays a tree view of Services and their Operations.
-   **Integration**: Uses `node-soap` for robust WSDL parsing.

### 2. Request Editor
-   **XML Generation**: Automatically generates a SOAP Envelop skeleton when an operation is selected.
-   **Editing**: Edit the XML body directly (supports passing arguments as XML string to `node-soap`).
-   **Revert**: Click "Revert" to restore the original generated XML if you make a mistake.

### 3. Request Execution
-   **Execution**: Sends the SOAP request via the Extension Host (bypassing CORS limitations of webviews).
-   **Response Viewing**: Displays the raw XML response or JSON result in a dedicated viewer.

### 4. Architecture
-   **React Webview**: Built with Vite, styled with `styled-components` to match VS Code themes.
-   **Message Passing**: Robust communication between the Webview (UI) and Extension (Logic).

## Verification Results

### Backend Logic
I ran a verification script (`verify_soap.ts`) against the `CountryInfoService` WSDL.
-   **Test**: `Client.executeRequest` for `FullCountryInfo` ('US').
-   **Result**: Success. Returned `Country Name: United States`.

### Build Verification
-   **Extension**: compiled successfully with `tsc`.
-   **Webview**: built successfully with `vite` (after resolving ESM/CJS configuration issues).

## How to Run

1.  Open the workspace in VS Code.
2.  Run **F5** to launch the Extension Host.
3.  Run command **"Dirty SOAP: Open Interface"**.
4.  Click **"Load WSDL"** to load the default example.
5.  Select **"FullCountryInfo"** from the sidebar.
6.  Click **"Run"** in the editor.
7.  View the response below the editor.

## Installation from VSIX

1.  Locate `APInox-0.0.1.vsix` in the project root.
2.  In VS Code, go to Extensions view -> "..." -> "Install from VSIX...".
3.  Select the generated file.

## Development & Debugging

1.  **Start Debugging**: Press **F5** in VS Code to launch the Extension Host.
2.  **Webview Devi**: The React app is built into `webview-build`. If you modify files in `webview/src`, run `npm run build` inside `d:/DirtySoap/soap-explorer/webview` to update the UI.
