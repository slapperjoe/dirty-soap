# Changelog


## [0.15.0] - 2026-01-24
### Added
- **Encrypted Secrets**: Environment variables can now be marked as secret with AES-256-GCM encryption at rest
  - Toggle any custom field between Plain/Secret with lock icon
  - Masked display (••••••••) with show/hide eye icon
  - Automatic encryption in `~/.apinox/secrets.enc`
  - Variable resolution ({{fieldName}}) works transparently with encrypted values
  - Export redacts secrets as [REDACTED]
  - Import preserves existing secrets
- **Variable Resolution**: Request execution now automatically resolves environment variables (including secrets) before sending
  - Added `getActiveEnvironment()` and `getGlobalVariables()` helper methods to SettingsManager
  - Frontend now passes active environment to backend for proper variable substitution
  - Wildcard syntax highlighting for {{variables}} in Monaco editor

### Fixed
- **macOS**: Performance suites and settings now persist across reinstalls. Config directory moved from exe-relative location to stable user directory (`~/Library/Application Support/apinox/` on macOS). Automatic migration from legacy location included.

## [0.14.0] - 2026-01-22
### Auto-Generated Changes
- feat: Implement WSDL loading cancellation and local XSD resolution - Added CancelWsdlLoadCommand to allow users to cancel ongoing WSDL loading operations. - Enhanced LoadWsdlCommand to support cancellation and local directory resolution for XSD files. - Updated WebviewController to integrate the new cancel command. - Modified the bridge utility to automatically extract local directory paths for WSDL files. - Improved XML generation logic to handle complex types using full schema when available. - Introduced a build number management system with .buildno file for versioning. - Created scripts to fix XSD import paths in WSDL/XSD files for local development.

## [0.13.4] - 2026-01-22
### Auto-Generated Changes
- Refactor code structure for improved readability and maintainability Fixes to WSDL imports

## [0.13.3] - 2026-01-21
### Auto-Generated Changes
- feat: migrate from axios to native fetch API for standalone binary support  - Replaced axios with native Node.js fetch in ProxyService and other services - Updated ProxyService to handle HTTP requests and responses using fetch - Added NativeHttpClient utility for HTTP operations with error handling - Enhanced DebugModal to reflect changes in sidecar diagnostics - Updated WelcomePanel and styles for logo adjustments - Bumped webview version to 0.13.2 - Added comprehensive tests for NativeHttpClient - Documented standalone binary implementation and build process

## [0.13.2] - 2026-01-21
### Auto-Generated Changes
- Mac Fixes

## [0.13.1] - 2026-01-21
### Auto-Generated Changes
- feat: enhance script playground functionality

## [0.13.0] - 2026-01-21
### Auto-Generated Changes
- feat: Major fixes for prod version

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
