# Changelog


## [0.12.0] - 2026-01-19
### Auto-Generated Changes
- feat: add Tauri dialog plugin and enhance settings management - Added @tauri-apps/plugin-dialog dependency for file selection dialogs. - Enhanced MainContent component to support new configDir state. - Updated SettingsEditorModal to auto-save settings on tab changes and close. - Integrated file watcher configuration in IntegrationsTab with file selection capability. - Improved GeneralTab to display settings location and sidecar status. - Added sample requests for SOAP,REST,and GraphQL in the Samples folder. - Updated UI context and message handling to manage new configDir state. - Refactored various components to improve settings handling and user experience.
-----

## [0.11.0] - 2026-01-15
### Fixed
- Tauri application fixes and stability improvements.

## [0.10.0] - 2026-01-15
### Added
- **Tauri App**: Reintroduction of the Tauri-based application.

## [0.9.0] - 2026-01-07
### Added
- **WSDL Management**: New settings webview for WSDL parsing and SOAP operations.

## [0.8.0] - 2026-01-01
### Added
- **Unified Server Tab**: Combined Proxy and Mock into a single Server view with toggle modes (Off, Mock, Proxy, Both).
- **Mock Server**:
    - Return predefined responses without hitting real backend.
    - Mock rules with URL, XPath, and regex matching.
    - Record mode to auto-capture real responses.
    - Latency simulation.
- **Settings Tab Enum**: Refactored settings modal for better navigation.

### Changed
- Removed separate Proxy and Mock tabs from sidebar.
- Settings cog on Server tab now opens directly to Server settings.

## [0.7.6] - 2025-12-31
### Added
- **Status Bar Launch**: "🧪 Dirty SOAP" button for quick access.
- **Manual Save**: New save workflow (Ctrl+S) replacing auto-save on keystroke.
- **Unsaved Warning**: Browser alert when closing with unsaved changes.

## [0.7.0] - 2025-12-29
### Added
- **Replace Rules**:
    - Functionality to apply text replacement rules to XML content in the Proxy Service.
    - UI for creating and managing replace rules in Settings.
- **Context Management**: new Project, Selection, and UI context providers.
- **New Webview UI**: Updated UI for SOAP interaction, deprecating old verification scripts.

## [0.6.0] - 2025-12-24
### Added
- **Proxy Service**:
    - HTTPS proxy support with self-signed certificate generation (`ensureCert`).
    - ConfigSwitcherService to inject proxy URLs into config files.
    - Certificate installation helpers in the UI.

## [0.5.0] - 2025-12-23
### Added
- **File Watcher**: Real-time file watching with history and operation name extraction.
- **Headers Panel**: New UI for managing HTTP headers.

## [0.4.0] - 2025-12-23
### Added
- **Assertions**: UI components and handling for SoapUI assertions.

## [0.3.0] - 2025-12-22
### Added
- **WSDL Parser**: Robust parsing with Axios, including proxy detection and SSL verification fixes.
- **Workspace**: Dirty state tracking and workspace persistence.

## [0.2.0] - 2025-12-19
### Added
- **Wildcard System**: Support for dynamic values in requests (URL, Headers, Body).
    - `{{env}}`: Current environment identifier.
    - `{{url}}`: Current environment's endpoint URL.
    - `{{newguid}}`, `{{uuid}}`: Generate a new UUID.
    - `{{now}}`, `{{epoch}}`: Current timestamp.
    - `{{randomInt(min,max)}}`: Random integer generator.
    - **Data Gen**: `{{lorem}}`, `{{name}}`, `{{country}}`, `{{state}}`.
    - **Date Math**: `{{now+1m}}` (add 1 minute), `{{now-2d}}` (subtract 2 days), etc.
- **Settings Management**:
    - Persistent configuration stored in `~/.dirty-soap/config.jsonc`.
    - UI Settings (layout, line numbers) are now remembered.
    - Autosave functionality for unsaved workspace changes.
- **UI Improvements**:
    - **Environment Selector**: Quickly switch between environments.
    - **Settings Editor**: Direct JSONC editing for advanced configuration.
    - **Enhanced Styling**: Distinct highlighting for environment variables (Blue) vs. dynamic wildcards (Pink).
    - Improved Toolbar alignment and layout.
- **Logging**:
    - Full request path and payload are now logged.

### Fixed
- Re-enabled build minification for better performance.
- Fixed toolbar button alignment issues.
- Addressed various UI glitches in the Monaco Editor.
