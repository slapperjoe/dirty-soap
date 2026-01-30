# Diagnostic Logging System (Flight Recorder)

## Overview
The Diagnostic Logging System is a "flight recorder" for Dirty Soap, designed to capture high-fidelity traces of frontend-backend communication and internal backend events. It is the primary tool for debugging "silent failures" where UI actions do not result in expected backend state changes (e.g., protocol mismatches, dropped messages, state sync issues).

## When to Use (Agent Instructions)
**CRITICAL**: As an AI Agent, you should actively activate and check these logs when:
1.  **Implementing Complex Flows**: Before starting a multi-step refactor (e.g., changing how requests are saved), Reload Window to clear logs, then verify your changes by inspecting the generated log file.
2.  **Debugging "Silent" Failures**: If a user reports that "nothing happens" when they click a button, this is your primary investigation tool.
3.  **Verifying Protocol Changes**: If you modify a backend Command or a frontend Message Handler, **you must** export a log to prove that the message structure (command vs type, payload shape) remains compatible.
4.  **State Sync Issues**: When frontend state doesn't match what's saved to disk, check if backend is sending sync messages back to frontend.

## How to Use

1.  **Activate**: The recorder runs automatically and streams logs to disk immediately.
2.  **Reproduce**: Perform the specific UI actions that are failing.
3.  **Locate**:
    - Logs are automatically saved to `c:\temp` (if it exists) or `~/.APInox/diagnostics/` as `.jsonl` files.
    - Filename format: `APInox-diagnostics-<timestamp>.jsonl`.
    - Find the most recent file to see the current session.
4.  **View**:
    - You can use the command `Dirty Soap: Export Diagnostic Logs` to instantly open the *current active log file*.
    - Or open the `.jsonl` file manually.

## Log Structure (JSONL)
The log file is **JSON Lines** format (one JSON object per line). This ensures data integrity even if VS Code crashes.

```json
{"type":"HEADER","timestamp":"...","version":"1.0"}
{"timestamp":"...","category":"BRIDGE_IN","message":"..."}
{"timestamp":"...","category":"BRIDGE_OUT","message":"..."}
{"timestamp":"...","category":"BACKEND","message":"..."}
```

### Retention Policy
- The system automatically keeps logs for **7 days**.
- Older `.jsonl` files in the diagnostic directory are automatically deleted on extension startup.

### Log Categories
- `BRIDGE_IN`: Messages received by `WebviewController` from the Frontend.
    - **Crucial**: Check the `data` payload here. Does the `command` string match what the backend expects?
- `BRIDGE_OUT`: Messages sent from Backend to Frontend.
    - **Critical for State Sync**: If backend updates data, it MUST send a message back to update frontend state.
- `BACKEND`: Internal backend events (Service initialization, file saving, project loading).
    - Look for "Saved folder project", "LoadProjectCommand", etc.
- `ERROR`: Exceptions caught in the backend.

## Debugging Patterns

### Pattern 1: Protocol Mismatch
This system is most effective at catching "Protocol Mismatches".
**Scenario**: Frontend sends `{ command: 'add' }` but Backend expects `{ type: 'add' }`.
**Detection**:
1. Search logs for the `BRIDGE_IN` event corresponding to the action.
2. Inspect the `data` object.
3. Compare the structure in the log against the TypeScript interface in the Backend command class and the Frontend `useMessageHandler` hook.

### Pattern 2: Missing State Sync
**Scenario**: User edits data, backend saves it, but UI shows stale data when user navigates away and back.
**Detection**:
1. Search for the save event (e.g., `updateTestStep`, `saveProject`)
2. Verify `BRIDGE_IN` shows the command was received
3. Verify `BACKEND` shows "Saved folder project" or similar
4. **CRITICAL**: Check if there's a corresponding `BRIDGE_OUT` with `projectLoaded` or similar sync message
5. If `BRIDGE_OUT` is missing, backend isn't notifying frontend of the update

**Example Fix**: Add `this._panel.webview.postMessage({ command: 'projectLoaded', project })` after save

### Pattern 3: Content Verification
**Scenario**: Data appears to be saved but content is wrong (e.g., default values instead of user input).
**Detection**:
1. Search for the relevant command with content (e.g., `scriptContent`)
2. Check `BACKEND` log messages that log content length or previews
3. Compare logged content against what's on disk (use PowerShell to verify)

**PowerShell Commands for Verification**:
```powershell
# Find recent .jsonl log
Get-ChildItem -Path C:\temp -Filter APInox-diagnostics-*.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 1

# Search for specific events
Get-Content "path\to\file.jsonl" | Select-String -Pattern "updateTestStep" -Context 1,2

# Extract script content from logs
Get-Content "path\to\file.jsonl" | Select-String -Pattern "scriptContent"

# Verify what's actually on disk
Get-Content "C:\Users\<User>\<project>\tests\Suite\Case\02_Script.json" | ConvertFrom-Json | Select-Object -ExpandProperty config | Select-Object -ExpandProperty scriptContent
```

## Common Debugging Workflows

### Workflow 1: Trace a UI Action End-to-End
1. Note the current time
2. Perform the UI action
3. Open the most recent `.jsonl` file
4. Search for entries after your noted time
5. Follow the flow: `BRIDGE_IN` → `BACKEND` → `BRIDGE_OUT`
6. Identify where the chain breaks

### Workflow 2: Compare Expected vs Actual
1. Know what message/data you expect to see
2. Search the log for related category (`BRIDGE_IN`, `BACKEND`)
3. Use JSON comparison to spot differences in payload structure
4. Fix the mismatch in either frontend sender or backend handler

### Workflow 3: Verify File Persistence
1. Search for save events in logs (look for "Saved folder project", "saveProject", etc.)
2. Note the filename/path from the log
3. Use PowerShell to verify the file exists and contains expected content
4. If file is correct but UI is wrong → check for missing `BRIDGE_OUT` sync message
5. If file is wrong → check `BRIDGE_IN` payload that was sent to backend

## Tips for Agents
- **Always check logs in chronological order** - use timestamps to trace the sequence
- **Search for patterns like**: `updateTestStep`, `projectLoaded`, `Script`, `scriptContent`
- **Use context**: `-Context 1,2` in PowerShell `Select-String` to see surrounding lines
- **Verify both directions**: Message IN and corresponding state update OUT
- **Check file system**: Logs tell you what backend tried to do, but verify it actually happened
