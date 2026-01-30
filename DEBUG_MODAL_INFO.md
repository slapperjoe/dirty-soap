# Debug Modal - Enhanced Diagnostic Information

## What's Now Displayed in the GUI

When you open the Debug Modal (Ctrl+Shift+D / Cmd+Shift+D), you'll now see comprehensive diagnostic information in the **System Information** section.

### When Sidecar is Running (✓ Ready)

```
System Information
──────────────────────────────────────
Settings Location: C:\Users\...\AppData\Roaming\com.apinox.app
Sidecar Status: ✓ Ready (port 3000)
Node.js: ✓ v18.17.0
Sidecar Process: ✓ Running

Sidecar Runtime Info:
  Node Version: v18.17.0
  Platform: win32 (x64)
  Process ID: 12345
  Uptime: 123s
  Memory: 45MB / 67MB

Debug Endpoint: http://127.0.0.1:3000/debug [clickable link]
```

### When Sidecar is NOT Running (✗ Not Ready)

#### Scenario 1: Node.js Not Found
```
System Information
──────────────────────────────────────
Settings Location: C:\Users\...\AppData\Roaming\com.apinox.app
Sidecar Status: ✗ Not Ready
Node.js: ✗ Not found (program not found)
Sidecar Process: ✗ Not Running

⚠ Sidecar Not Ready

Possible causes:
• Node.js not found - Install Node.js and ensure it's in your PATH
• Sidecar not built - Run: npm run build:sidecar
• Port conflict or firewall blocking localhost
• Permissions issue with config directory

📋 Check Sidecar Logs tab below for detailed error messages
```

#### Scenario 2: Sidecar Process Failed
```
System Information
──────────────────────────────────────
Settings Location: C:\Users\...\AppData\Roaming\com.apinox.app
Sidecar Status: ✗ Not Ready
Node.js: ✓ v18.17.0
Sidecar Process: ✗ Not Running

⚠ Sidecar Not Ready

Possible causes:
• Sidecar process failed to start - Check logs below for errors
• Sidecar not built - Run: npm run build:sidecar
• Port conflict or firewall blocking localhost
• Permissions issue with config directory

📋 Check Sidecar Logs tab below for detailed error messages
```

## Information Sources

### 1. **Tauri Commands** (Rust → Frontend)
   - `get_config_dir()` - Config directory path
   - `is_sidecar_ready()` - Boolean ready state
   - `get_sidecar_port()` - Port number
   - `get_sidecar_diagnostics()` - **NEW** Comprehensive diagnostics:
     ```json
     {
       "port": 3000,
       "ready": true,
       "configDir": "C:\\Users\\...\\AppData\\Roaming\\com.apinox.app",
       "processRunning": true,
       "nodeCheck": {
         "available": true,
         "version": "v18.17.0"
       }
     }
     ```

### 2. **Sidecar `/debug` Endpoint** (HTTP GET)
   - Called automatically when sidecar is ready
   - Returns runtime information:
     ```json
     {
       "message": "Sidecar is running",
       "configDir": "C:\\Users\\...\\AppData\\Roaming\\com.apinox.app",
       "nodeVersion": "v18.17.0",
       "platform": "win32",
       "arch": "x64",
       "pid": 12345,
       "uptime": 123.456,
       "memoryUsage": {
         "rss": 50000000,
         "heapTotal": 20000000,
         "heapUsed": 15000000,
         "external": 1000000
       }
     }
     ```

### 3. **Sidecar Logs Tab**
   - Real-time log streaming from the sidecar process
   - Shows all startup messages, errors, and warnings
   - Includes the detailed logging added to `sidecar/src/index.ts`

### 4. **Frontend Logs Tab**
   - Frontend console logs captured from the React app
   - Includes errors, warnings, and info messages

## Visual Indicators

### Status Colors
- **Green (✓)** - Component is working correctly
- **Yellow/Orange (⚠)** - Warning state, sidecar not ready
- **Red (✗)** - Component failed or not available

### Icons
- **✓** - Success/Available
- **✗** - Failed/Not Available
- **⚠** - Warning

### Highlighted Issues
When Node.js is not found, that specific issue is highlighted in **red** in the warning box:
```
• Node.js not found - Install Node.js and ensure it's in your PATH
```

## What's Updated in Real-Time

The debug modal refreshes every **5 seconds** automatically, updating:
1. Sidecar ready status
2. Port number (if changed)
3. Process running status
4. Node.js availability
5. Runtime information (uptime, memory usage)
6. Log entries

## How to Use This Information

### For End Users

1. **Open Debug Modal**: Press `Ctrl+Shift+D` (Windows/Linux) or `Cmd+Shift+D` (Mac)
2. **Check System Information section**:
   - If you see ✓ markers, everything is working
   - If you see ✗ markers, follow the troubleshooting tips
3. **Read the warning box** if present - it will tell you exactly what's wrong
4. **Check Sidecar Logs** for detailed error messages

### For Developers/Support

1. **Ask user to open Debug Modal** (Ctrl+Shift+D / Cmd+Shift+D)
2. **Request a screenshot** of the System Information section
3. **Ask for Sidecar Logs** - user can copy/paste from the Sidecar Logs tab
4. **Key information to collect**:
   - Settings Location (config directory)
   - Sidecar Status (Ready/Not Ready)
   - Node.js version and availability
   - Process running status
   - Any error messages from logs

### For Remote Debugging

If a user can't open the Debug Modal or provide a screenshot:

1. **Check Node.js manually**:
   ```bash
   node --version
   ```

2. **Check if sidecar is built**:
   ```bash
   # From project root
   dir sidecar\dist\sidecar\src\index.js    # Windows
   ls sidecar/dist/sidecar/src/index.js     # Mac/Linux
   ```

3. **Test sidecar manually**:
   ```bash
   cd sidecar
   node dist\sidecar\src\index.js --config-dir C:\temp\test-config
   ```
   Should output: `SIDECAR_PORT:3000` if working

## Comparison: Before vs After

### Before (Limited Info)
```
Settings Location: C:\Users\...\AppData\Roaming\com.apinox.app
Sidecar status: Not ready
```
👎 No information about WHY it's not ready

### After (Comprehensive Diagnostics)
```
Settings Location: C:\Users\...\AppData\Roaming\com.apinox.app
Sidecar Status: ✗ Not Ready
Node.js: ✗ Not found (program not found)
Sidecar Process: ✗ Not Running

⚠ Sidecar Not Ready

Possible causes:
• Node.js not found - Install Node.js and ensure it's in your PATH
• [other causes...]

📋 Check Sidecar Logs tab below for detailed error messages
```
👍 Clear indication that Node.js is the problem, with actionable solution

## Additional Features

### Clickable Links
- Debug Endpoint link is clickable when sidecar is running
- Opens `http://127.0.0.1:<port>/debug` in browser
- Shows JSON diagnostic information

### Code Formatting
- Commands shown in monospace font with background: `npm run build:sidecar`
- Easy to copy/paste

### Smart Error Detection
- Dynamically highlights the actual problem (Node.js, process, build)
- Doesn't show irrelevant warnings
- Prioritizes most likely causes based on diagnostics

## Backend Logging (Not Shown in GUI)

The following logs are written to Tauri's log output (visible in terminal during development):

### Rust (Tauri) Logs
- Startup sequence with paths searched
- Node.js version check
- Process spawn details
- All stdout/stderr from sidecar process
- Port detection

### Node.js (Sidecar) Logs
- Startup banner with system info
- Config directory resolution
- Service initialization progress
- HTTP server start confirmation
- Runtime errors and exceptions

These logs are essential for debugging but not directly shown in the GUI. They can be accessed:
- During development: Check the terminal where you ran `npm run tauri dev`
- In production: May require enabling file logging via Tauri config

The Sidecar Logs tab in the Debug Modal shows sidecar console output captured after startup.

---

# Diagnostics Panel Integration (NEW)

## Overview

**NEW in this version**: All certificate and proxy diagnostic tools are now integrated into the Debug Modal, accessible via the "🔧 Certificate & Proxy" tab.

## What Was Added

### 1. New DiagnosticsTab Component
**File**: `src-tauri/webview/src/components/modals/DiagnosticsTab.tsx`

Features:
- **Certificate Diagnostics**: Check if certificate exists, where it's installed, and if it's working
- **Proxy Configuration Check**: Validate protocol consistency between client and target
- **One-Click Actions**: 
  - Install certificate to LocalMachine store
  - Fix certificate location (move from CurrentUser to LocalMachine)
  - Regenerate certificate
- **Status Indicators**: Visual feedback with icons (✓/✗/⚠️)
- **Detailed Error Messages**: Context-aware help for common issues

### 2. Updated DebugModal with Tabs
**File**: `src-tauri/webview/src/components/modals/DebugModal.tsx`

Changes:
- Added tabbed interface (📋 Logs & System Info | 🔧 Certificate & Proxy)
- Imported new DiagnosticsTab component
- Tab navigation with VS Code theming

## Backend Commands Required

The DiagnosticsTab expects these backend commands (need to be implemented):

```typescript
// Certificate checks
{ command: 'checkCertificate' }
// Returns: { exists: boolean, certPath: string, thumbprint: string }

{ command: 'checkCertificateStore', thumbprint: string }
// Returns: { inLocalMachine: boolean, inCurrentUser: boolean }

{ command: 'testHttpsServer' }
// Returns: { success: boolean, error?: string }

// Certificate actions
{ command: 'installCertificateToLocalMachine' }
// Returns: { success: boolean, error?: string }

{ command: 'moveCertificateToLocalMachine' }
// Returns: { success: boolean, error?: string }

{ command: 'regenerateCertificate' }
// Returns: { success: boolean, error?: string }

// Proxy checks
{ command: 'getProxyStatus' }
// Returns: { running: boolean }
```

## User Experience

### Access
1. Press `Ctrl+Shift+D` to open Debug modal
2. Click "🔧 Certificate & Proxy" tab
3. Click diagnostic buttons to run checks

### Certificate Workflow
1. **Run Certificate Check** → Shows detailed status
2. If issues found, click relevant fix button:
   - "Install Certificate" - if not in any store
   - "Fix Certificate Location" - if in wrong store (CurrentUser)
   - "Regenerate Certificate" - if certificate/key mismatch

### Proxy Workflow
1. **Run Proxy Check** → Validates configuration
2. Shows warnings if protocol mismatch (HTTP vs HTTPS)
3. Provides specific guidance for fixing client URLs

## Common Issues Handled

| Issue | Detection | Solution |
|-------|-----------|----------|
| Error 1312 | Certificate not in LocalMachine store | "Fix Certificate Location" button |
| SEC_E_INVALID_TOKEN | Certificate/key mismatch | "Regenerate Certificate" button |
| TLS handshake failure | Protocol mismatch | Shows warning with correct URL |
| Certificate not trusted | Not installed | "Install Certificate" button |

## Benefits

1. **All-in-one**: No need for separate PowerShell scripts
2. **User-friendly**: Visual feedback and clear actions
3. **Context-aware**: Diagnostics explain what's wrong and how to fix it
4. **Integrated**: Works within the application UI
5. **Cross-platform ready**: Uses bridge commands (can work on all platforms)

## Next Steps

To complete the integration:

1. **Implement backend commands** in the Rust/Node.js bridge
2. **Test the diagnostics flow** with real HTTPS proxy scenarios
3. **Add telemetry** (optional) to track common issues
4. **Update documentation** to reference the built-in diagnostics

## Notes

- PowerShell scripts (`bind-proxy-cert.ps1`, etc.) are still useful for automation
- The UI provides the same functionality in a more accessible way
- Backend implementation is platform-specific (Windows cert store APIs)

