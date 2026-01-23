# APInox Frontend Architecture

The frontend is a React application built with Vite, designed to run inside a VS Code Webview.

## Component Hierarchy

### `App.tsx`
The root component (= "The Monolith"). It currently holds most of the application state due to legacy reasons.
- **State**: Projects, Config, Watcher History, Proxy History, UI State (expand/collapse).
- **Communication**: Uses `bridge` to send/receive messages from the VS Code specific backend.

### `Sidebar.tsx`
The main navigation and tool panel on the left side.
- **Role**: Renders the active view based on `activeView` state (Projects, Explorer, Watcher, Proxy).
- **Refactoring Status**: Decomposed into sub-components (Stage 2).

#### Sidebar Components (`src/components/sidebar/`)
- **`ProjectList.tsx`**: Renders the loaded projects, interfaces, and test cases.
    - Uses `ServiceTree` for the request structure.
    - Uses `ProjectTestTree` for test suites/cases.
- **`ApiExplorerSidebar.tsx`**: The API/WSDL browsing interface. Allows loading definitions and previewing them before adding to the project.
    - Uses `ServiceTree` for preview.
- **`WatcherPanel.tsx`**: Controls and history for the File Watcher feature.
- **`ProxyUi.tsx`**: Controls and history for the "Dirty Proxy" feature.
- **`ServiceTree.tsx`**: A shared recursive component for rendering Interface -> Operation -> Request hierarchies.
- **`shared/SidebarStyles.tsx`**: Shared styled components (`HeaderButton`, `ServiceItem`) used across sidebar panels.

## State Management (Planned Stage 3)
Currently, `App.tsx` passes extensive props down to `Sidebar` and its children.
Future refactoring will introduce `WorkspaceContext` to hold:
- Project List
- Global Configuration
- Backend Connection Status

## Communication Pattern
The Frontend communicates with the Backend (`WebviewController`) via the `vscode.postMessage` API, abstracted by the `bridge` utility.
- **Commands**: Typed messages (e.g., `saveProject`, `startProxy`).
- **Events**: The backend sends messages back (e.g., `updateProducts`, `proxyLog`).
