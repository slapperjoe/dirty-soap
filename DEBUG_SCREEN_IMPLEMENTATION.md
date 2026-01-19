# Debug Screen Implementation Plan

## Overview
This document outlines the implementation of a debug screen feature in the GeneralTab of the Settings modal. This feature will help developers and users troubleshoot issues by providing visibility into sidecar logs, configuration state, and system diagnostics.

## Background
Based on previous analysis, the GeneralTab.tsx needs to be enhanced with debugging capabilities including:
1. Sidecar console logs display with real-time updates
2. Settings debug information viewer
3. Configuration preview and validation
4. Error tracking and display

## Implementation Tasks

### Phase 1: Backend - Sidecar Log Service
**Status**: 🔴 Not Started

#### Task 1.1: Add Log Collection to Sidecar
- [ ] Create log buffer/circular queue in sidecar to store recent logs
- [ ] Add timestamps and log levels to all console.log statements
- [ ] Implement GetLogs command in FrontendCommand enum
- [ ] Implement ClearLogs command in FrontendCommand enum
- [ ] Add handlers in sidecar/src/router.ts for:
  - `GetLogs`: Returns array of recent log entries
  - `ClearLogs`: Clears the log buffer

**Files to modify:**
- `shared/src/messages.ts` - Add GetLogs and ClearLogs to FrontendCommand enum
- `sidecar/src/services/LogService.ts` - NEW: Create service to manage log buffer
- `sidecar/src/router.ts` - Add command handlers
- `sidecar/src/index.ts` - Initialize LogService and inject into console methods

#### Task 1.2: Add Log Streaming (Optional Enhancement)
- [ ] Implement real-time log streaming via WebSocket or periodic polling
- [ ] Add BackendCommand.SidecarLog for push notifications
- [ ] Update LogService to emit log events

### Phase 2: Backend - Debug Information Endpoints
**Status**: 🔴 Not Started

#### Task 2.1: Configuration Debug Endpoint
- [ ] Add GetDebugInfo command to FrontendCommand enum
- [ ] Create handler in router.ts that returns:
  - Current configuration (sanitized - no secrets)
  - Sidecar readiness status
  - Active services status (proxy, mock, watcher, etc.)
  - Environment variables (filtered)
  - System information (OS, Node version, etc.)

**Files to modify:**
- `shared/src/messages.ts` - Add GetDebugInfo to FrontendCommand
- `sidecar/src/router.ts` - Add GetDebugInfo handler
- `sidecar/src/services/DebugService.ts` - NEW: Create service to collect debug info

### Phase 3: Frontend - UI Components
**Status**: 🔴 Not Started

#### Task 3.1: Add State Variables to GeneralTab
- [ ] Add useState hooks for:
  - `logs: string[]` - Array of log entries from sidecar
  - `settingsDebug: any` - Debug information object
  - `fetchError: string | null` - Error state for failed fetches
  - `rawConfigPreview: string | null` - Raw JSON config preview
  - `sidecarReady: boolean` - Sidecar connection status
  - `sidecarPort: number | null` - Port number if available
  - `showLogs: boolean` - Toggle for logs section visibility

**Files to modify:**
- `webview/src/components/modals/settings/GeneralTab.tsx`

#### Task 3.2: Add useEffect Hook for Log Loading
- [ ] Create async function `loadLogs` that:
  - Calls `bridge.sendCommand('getLogs')` if in Tauri mode
  - Updates `logs` state with response
  - Handles errors by setting `fetchError`
- [ ] Call `loadLogs` in useEffect with dependency on `sidecarPort`
- [ ] Add cleanup to prevent memory leaks

**Example:**
```typescript
useEffect(() => {
  if (!isTauriMode || !sidecarReady) return;
  
  const loadLogs = async () => {
    try {
      const response = await bridge.sendCommand('getLogs', {});
      setLogs(response.logs || []);
      setFetchError(null);
    } catch (error) {
      setFetchError(error.message);
    }
  };
  
  loadLogs();
  // Optional: Set up polling interval for real-time updates
  const interval = setInterval(loadLogs, 5000);
  return () => clearInterval(interval);
}, [sidecarReady, isTauriMode]);
```

#### Task 3.3: Add clearLogs Function
- [ ] Create async function `clearLogs` that:
  - Calls `bridge.sendCommand('clearLogs')` 
  - Reloads logs after clearing
  - Shows success/error feedback

#### Task 3.4: Add Sidecar Logs UI Section
- [ ] Add new section below Network settings with:
  - Section header "Sidecar Console Logs" (only visible in Tauri mode)
  - Header div with title and "Clear Logs" button
  - Container div with log entries display
  - Each log entry styled with timestamp and message
  - Max height with scrolling
  - Empty state message when no logs
  - Error message display if fetch fails

**Layout:**
```tsx
{isTauriMode && (
  <FormGroup>
    <SectionHeader>Sidecar Console Logs</SectionHeader>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontSize: '0.9em', color: 'var(--vscode-descriptionForeground)' }}>
        Last {logs.length} entries
      </span>
      <button onClick={clearLogs} disabled={logs.length === 0}>
        Clear Logs
      </button>
    </div>
    <div style={{
      maxHeight: '200px',
      overflowY: 'auto',
      background: 'var(--vscode-editor-background)',
      border: '1px solid var(--vscode-panel-border)',
      padding: '8px',
      fontFamily: 'monospace',
      fontSize: '0.85em'
    }}>
      {logs.length === 0 ? (
        <div style={{ color: 'var(--vscode-descriptionForeground)', textAlign: 'center', padding: '20px' }}>
          No logs available
        </div>
      ) : (
        logs.map((log, i) => (
          <div key={i} style={{ marginBottom: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {log}
          </div>
        ))
      )}
    </div>
  </FormGroup>
)}
```

#### Task 3.5: Add Settings Debug Information Section
- [ ] Add collapsible `<details>` section below logs:
  - Summary: "Settings Debug Information"
  - Display `settingsDebug` object as formatted JSON
  - Display `rawConfigPreview` if available
  - Only visible in Tauri mode

**Layout:**
```tsx
{isTauriMode && settingsDebug && (
  <details style={{ marginTop: 16 }}>
    <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: 8 }}>
      Settings Debug Information
    </summary>
    <div style={{
      background: 'var(--vscode-editor-background)',
      border: '1px solid var(--vscode-panel-border)',
      padding: '12px',
      fontFamily: 'monospace',
      fontSize: '0.8em',
      whiteSpace: 'pre-wrap',
      overflowX: 'auto',
      maxHeight: '300px',
      overflowY: 'auto'
    }}>
      {rawConfigPreview || JSON.stringify(settingsDebug, null, 2)}
    </div>
  </details>
)}
```

### Phase 4: Testing
**Status**: 🔴 Not Started

#### Task 4.1: Manual Testing
- [ ] Test in VS Code extension mode (logs section should not appear)
- [ ] Test in Tauri standalone mode:
  - Verify logs load on settings open
  - Verify "Clear Logs" button works
  - Verify logs update periodically (if auto-refresh implemented)
  - Verify error handling when sidecar not ready
  - Verify debug information displays correctly

#### Task 4.2: Integration Testing
- [ ] Verify log messages from various sidecar operations appear
- [ ] Test with different sidecar states (ready, not ready, errored)
- [ ] Verify memory usage doesn't grow unbounded from log buffer

### Phase 5: Documentation
**Status**: 🔴 Not Started

- [ ] Update README.md with debug screen feature description
- [ ] Add screenshots of debug screen to documentation
- [ ] Document log format and retention policy
- [ ] Add troubleshooting guide using debug logs

## Implementation Order

1. **Start with Backend** (Phase 1 & 2) - Get the data flowing first
   - Implement LogService and log collection
   - Add GetLogs and ClearLogs commands
   - Test with direct API calls before adding UI

2. **Add Frontend State** (Phase 3.1) - Prepare the UI foundation
   - Add all necessary state variables
   - Don't worry about undefined errors since initial values are set

3. **Implement Log Loading** (Phase 3.2-3.3) - Connect the data flow
   - Add useEffect and loadLogs function
   - Add clearLogs function
   - Test that data flows correctly

4. **Build UI Components** (Phase 3.4-3.5) - Make it visible
   - Add logs display section
   - Add debug information section
   - Style and polish

5. **Test & Document** (Phase 4-5) - Ensure quality
   - Manual testing in both modes
   - Integration testing
   - Documentation updates

## Success Criteria

✅ Sidecar logs are visible in the Settings → General tab when running in Tauri mode
✅ Logs can be cleared via UI button
✅ Debug information shows current configuration state
✅ Error states are handled gracefully
✅ Feature is completely hidden in VS Code extension mode (no sidecar)
✅ Performance impact is minimal (log buffer has size limit)
✅ Code is well-documented and maintainable

## Notes

- **VS Code Mode**: This feature is ONLY relevant for Tauri standalone mode where sidecar runs locally. In VS Code extension mode, logs go to VS Code's Output Channel instead.
- **Log Retention**: Implement circular buffer with configurable size (default: 500 entries) to prevent memory issues
- **Security**: Ensure no sensitive data (passwords, tokens) appears in logs
- **Performance**: Consider debouncing/throttling log updates if implementing real-time streaming
