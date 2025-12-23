# Changelog


## [0.3.8] - 2025-12-23
### Auto-Generated Changes
- feat: Add Help Modal and enhance sidebar with help functionality

## [0.3.7] - 2025-12-23
### Auto-Generated Changes
- feat:


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
