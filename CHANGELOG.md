# Changelog


## [0.2.1] - 2025-12-20
## [0.2.0] - 2024-05-23
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
