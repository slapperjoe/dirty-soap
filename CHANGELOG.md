# Changelog


## [0.2.11] - 2025-12-21
### Auto-Generated Changes
- feat: Improve project name handling and request content processing in ProjectStorage
- feat: Enhance project reference loading in ProjectStorage for compatibility with multiple SoapUI formats
- feat: Enhance error logging for project and workspace loading in ProjectStorage and WebviewController

## [0.2.7] - 2025-12-21
### Auto-Generated Changes
- feat: Implement `WorkspaceLayout` component with integrated Monaco editors, wildcard support, and updated documentation for new features and settings.
- feat: Update CHANGELOG for version 0.2.4 with new features and enhancements
- feat: Update CHANGELOG for version 0.2.4 with new features and enhancements
- feat: Add Wildcard System for dynamic values in requests and enhance settings management
- feat: Refactor codebase by removing unused components, integrating MonacoSingleLineInput, and adding ErrorBoundary for improved error handling
- feat: Implement sidecar process for handling SOAP requests and responses
- feat: Add MonacoResponseViewer and enhance WorkspaceLayout with XML formatting options
- feat: Add MonacoRequestEditor component with syntax highlighting and decoration support
- feat: Implement WSDL Parser and Schema Viewer

## [0.2.6] - 2025-12-21
### Auto-Generated Changes
- feat: Update CHANGELOG for version 0.2.4 with new features and enhancements
- feat: Update CHANGELOG for version 0.2.4 with new features and enhancements
- feat: Add Wildcard System for dynamic values in requests and enhance settings management
- feat: Refactor codebase by removing unused components, integrating MonacoSingleLineInput, and adding ErrorBoundary for improved error handling
- feat: Implement sidecar process for handling SOAP requests and responses
- feat: Add MonacoResponseViewer and enhance WorkspaceLayout with XML formatting options
- feat: Add MonacoRequestEditor component with syntax highlighting and decoration support
- feat: Implement WSDL Parser and Schema Viewer

## [0.2.5] - 2025-12-20
### Auto-Generated Changes
- feat: Update CHANGELOG for version 0.2.4 with new features and enhancements
- feat: Add Wildcard System for dynamic values in requests and enhance settings management
- feat: Refactor codebase by removing unused components, integrating MonacoSingleLineInput, and adding ErrorBoundary for improved error handling
- feat: Implement sidecar process for handling SOAP requests and responses
- feat: Add MonacoResponseViewer and enhance WorkspaceLayout with XML formatting options
- feat: Add MonacoRequestEditor component with syntax highlighting and decoration support
- feat: Implement WSDL Parser and Schema Viewer

## [0.2.4] - 2025-12-20
### Auto-Generated Changes
- feat: Add Wildcard System for dynamic values in requests and enhance settings management
- feat: Refactor codebase by removing unused components, integrating MonacoSingleLineInput, and adding ErrorBoundary for improved error handling
- feat: Implement sidecar process for handling SOAP requests and responses
- feat: Add MonacoResponseViewer and enhance WorkspaceLayout with XML formatting options
- feat: Add MonacoRequestEditor component with syntax highlighting and decoration support
- feat: Implement WSDL Parser and Schema Viewer

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
