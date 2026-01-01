# Changelog


## [0.8.1] - 2026-01-01
### Auto-Generated Changes
- feat: Implement WSDL parsing and a new webview for managing settings and SOAP operations.

## [0.8.0] - 2026-01-01
### Added
- **Mock Server**: Return predefined responses without hitting real backend
    - Mock rules with URL, XPath, and regex matching
    - Record mode to auto-capture real responses
    - Passthrough for unmatched requests
    - Latency simulation
- **Unified Server Tab**: Combined Proxy and Mock into single Server view
    - Mode toggle: Off, Mock, Proxy, Both
    - Conditional sections show Mock Rules or Breakpoints based on mode
- **Settings Tab Enum**: Refactored settings modal to use `SettingsTab` enum
- **Updated Help Modal**: Added Server and Mock Server documentation sections

### Changed
- Removed separate Proxy and Mock tabs from sidebar
- Settings cog on Server tab now opens Settings directly to Server tab

## [0.7.6] - 2025-12-31
### Changes
- **Status Bar Launch**: Added "🧪 Dirty SOAP" button in the status bar for quick access
- **Manual Save**: Removed auto-save on every keystroke - projects now save manually
- **Ctrl+S**: Added keyboard shortcut to save all dirty projects
- **Save Indicators**: Save button only appears when project/request is dirty, turns green after save
- **Unsaved Warning**: Browser warns when closing with unsaved changes

## [0.7.5] - 2025-12-30
### Auto-Generated Changes
- feat: Update .vscodeignore and package-lock.json for improved project structure and versioning

## [0.7.4] - 2025-12-29
### Auto-Generated Changes
- feat: Enhance replace rule functionality in ProxyService and SettingsEditorModal - Updated ProxyService to log applied replace rules by name. - Added replace rules management in SettingsEditorModal with options to add,edit,and delete rules.

## [0.7.3] - 2025-12-29
### Auto-Generated Changes
- feat: Implement replace rule functionality in proxy service - Added ReplaceRuleApplier for applying text replacement rules to XML content. - Updated ProxyService to manage and apply replace rules during request/response handling. - Enhanced SettingsManager to include replace rules in configuration.

## [0.7.2] - 2025-12-29
### Auto-Generated Changes
- feat: Add replace rule functionality in proxy view - Implemented CreateReplaceRuleModal for defining text replacement rules in requests/responses. - Updated WorkspaceLayout to handle replace rule creation and display endpoint info in read-only mode. - Introduced ReplaceRule interface in models for managing replace rules.

## [0.7.1] - 2025-12-29
### Auto-Generated Changes
- feat: Implement context providers for project,selection,and UI state management - Added ProjectContext for managing project-related state and actions. - Introduced SelectionContext to handle UI selection state across various components. - Created UIContext for managing UI configuration,layout preferences,and modal visibility. - Refactored main.tsx to wrap the App component with the new context providers. - Extracted message handling logic into a custom hook for better organization and maintainability. - Created styled components for the main application layout and context menu.

## [0.7.0] - 2025-12-28
### Auto-Generated Changes
- feat: Implement new webview UI for SOAP interaction and project management,deprecating old verification scripts.

## [0.6.6] - 2025-12-25
### Auto-Generated Changes
- feat: enhance request handling in App and Sidebar components for improved proxy configuration

## [0.6.5] - 2025-12-24
### Auto-Generated Changes
- feat: add TypeScript declarations for Vite client and PNG module support

## [0.6.4] - 2025-12-24
### Auto-Generated Changes
- feat: Enhance configuration management by adding lastConfigPath tracking - Updated WebviewController to store the last selected config file path. - Modified ProxyService to ensure proper handling of HTTPS target URLs with trimmed input. - Extended SettingsManager to include lastConfigPath in the configuration.

## [0.6.3] - 2025-12-24
### Auto-Generated Changes
- feat: Add certificate opening functionality in WebviewController - Implemented handling for openCertificate message to open the generated certificate and provide user instructions for installation. - Enhanced user feedback for certificate management in the proxy service.

## [0.6.2] - 2025-12-24
### Auto-Generated Changes
- feat: Add self-signed certificate generation for HTTPS proxy support - Updated ProxyService to handle HTTPS requests with self-signed certificates. - Introduced ensureCert method to generate and manage certificates. - Enhanced ConfigSwitcherService to replace URLs with proxy base URLs while preserving paths. - Added new ReplacerService for managing replacement rules in request and response bodies. - Updated package.json to include selfsigned and its types. - Modified webview components to support certificate installation and display.

## [0.6.1] - 2025-12-24
### Auto-Generated Changes
- feat: Enhance proxy configuration handling and UI updates - Updated ConfigSwitcherService to return original URL upon proxy injection. - Modified WebviewController to send updated proxy target to the UI. - Enhanced Sidebar component to allow editing of proxy target URL and improved layout for proxy controls.

## [0.6.0] - 2025-12-24
### Auto-Generated Changes
- feat: Implement Proxy and Config Switcher Services - Added ProxyService to handle HTTP requests and responses including logging and error handling. - Introduced ConfigSwitcherService for injecting proxy URLs into configuration files and restoring original configurations. - Updated SoapPanel to integrate ProxyService and ConfigSwitcherService. - Enhanced App component to manage proxy state and history. - Modified Sidebar component to include proxy controls and navigation. - Updated WatcherEvent model to accommodate proxy-related fields.

## [0.5.4] - 2025-12-24
### Auto-Generated Changes
- feat: Update Sidebar and WorkspaceLayout components for improved watcher controls and response display

## [0.5.3] - 2025-12-24
### Auto-Generated Changes
- feat: Enhance file watcher functionality with clear history feature and operation name extraction

## [0.5.2] - 2025-12-23
### Auto-Generated Changes
- feat: Add file watcher controls and enhance watcher event model with root element extraction

## [0.5.1] - 2025-12-23
### Auto-Generated Changes
- feat: Implement file watcher service and integrate with WebviewController and Sidebar for real-time updates

## [0.5.0] - 2025-12-23
### Auto-Generated Changes
- feat: Enhance HTTP headers management with new HeadersPanel component and integrate into WorkspaceLayout

## [0.4.0] - 2025-12-23
### Auto-Generated Changes
- feat: Implement assertion handling and UI components for SoapUI requests

## [0.3.8] - 2025-12-23
### Auto-Generated Changes
- feat: Add Help Modal and enhance sidebar with help functionality

## [0.3.5] - 2025-12-23
### Auto-Generated Changes
- fix: Add https-proxy-agent for improved proxy handling in Axios requests

## [0.3.4] - 2025-12-23
### Auto-Generated Changes
- fix: Implement proxy detection and configuration in Axios requests for improved network handling

## [0.3.3] - 2025-12-23
### Auto-Generated Changes
- fix: Disable SSL verification in Axios requests and improve callback handling in WsdlParser

## [0.3.2] - 2025-12-23
### Auto-Generated Changes
- fix: Enhance Axios request handling in WsdlParser for better URL resolution and error logging

## [0.3.1] - 2025-12-23
### Auto-Generated Changes
- fix: Improve WSDL parsing request handling with Axios and enhanced error logging

## [0.3.0] - 2025-12-22
### Overview
- Major variation release including workspace persistence, inline XML values, and performance optimizations.
- feat: Add version bump tasks and update changelog; implement workspace dirty state tracking in App and Sidebar components

## [0.2.22] - 2025-12-22
### Auto-Generated Changes
- fix: Optimize event listener management for resizing in App component
- feat: Implement autosave retrieval in WebviewController and update App to request autosave on load
- fix: Correct indentation handling for XML attributes in formatter

## [0.2.21] - 2025-12-22
### Auto-Generated Changes
- feat: Add inline element values configuration for XML formatting and UI

## [0.2.20] - 2025-12-22
### Auto-Generated Changes
- feat: Enhance clipboard handling in Monaco editor for robust copy and paste functionality

## [0.2.19] - 2025-12-22
### Auto-Generated Changes
- feat: Enhance project storage to save and load request endpoints

## [0.2.18] - 2025-12-22
### Auto-Generated Changes
- feat: Add clipboard command support in Monaco editor for copy, paste, and cut actions

## [0.2.17] - 2025-12-22
### Auto-Generated Changes
- feat: Implement project saved notification and manage saved projects state in UI

## [0.2.16] - 2025-12-22
### Auto-Generated Changes
- feat: Update default content type to application/soap+xml in project handling and UI components

## [0.2.15] - 2025-12-22
### Auto-Generated Changes
- fix: Refactor Sidebar and WorkspaceLayout components for improved layout and response handling

## [0.2.14] - 2025-12-22
### Auto-Generated Changes
- feat: Update request handling to include content type headers and adjust project expansion state in sidebar

## [0.2.13] - 2025-12-22
### Auto-Generated Changes
- feat: Enhance project name logging and error handling in ProjectStorage and WebviewController; enable default context menu in MonacoRequestEditor

## [0.2.12] - 2025-12-21
### Auto-Generated Changes
- feat: Add namespace for dirty-soap and save raw request content in ProjectStorage

## [0.2.11] - 2025-12-21
### Auto-Generated Changes
- feat: Improve project name handling and request content processing in ProjectStorage
- feat: Enhance project reference loading in ProjectStorage for compatibility with multiple SoapUI formats
- feat: Enhance error logging for project and workspace loading in ProjectStorage and WebviewController

## [0.2.7] - 2025-12-21
### Auto-Generated Changes
- feat: Implement `WorkspaceLayout` component with integrated Monaco editors, wildcard support, and updated documentation for new features and settings.


## [0.2.5] - 2025-12-20
### Auto-Generated Changes
- feat: Update CHANGELOG for version 0.2.4 with new features and enhancements

## [0.2.3] - 2025-12-20
### Auto-Generated Changes
- feat: Add Wildcard System for dynamic values in requests and enhance settings management
- feat: Refactor codebase by removing unused components, integrating MonacoSingleLineInput, and adding ErrorBoundary for improved error handling
- feat: Implement sidecar process for handling SOAP requests and responses
- feat: Add MonacoResponseViewer and enhance WorkspaceLayout with XML formatting options
- feat: Add MonacoRequestEditor component with syntax highlighting and decoration support
- feat: Implement WSDL Parser and Schema Viewer

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
    - **Environment Selector**: Quickly switch between environments (e.g., Build vs. DIT).
    - **Settings Editor**: Direct JSONC editing for advanced configuration.
    - **Enhanced Styling**: Distinct highlighting for environment variables (Blue) vs. dynamic wildcards (Pink).
    - Improved Toolbar alignment and layout.
- **Logging**:
    - Full request path and payload (after substitution) are now logged to the "Dirty SOAP" output channel.

### Fixed
- Re-enabled build minification for better performance.
- Fixed toolbar button alignment issues.
- Addressed various UI glitches in the Monaco Editor.
