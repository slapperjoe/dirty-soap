# Local XSD Resolution Fix for Tauri

## Problem
When loading a local WSDL file in the Tauri GUI (like `Samples/Organisation/Organisation.xml`), 
the application failed to parse it because the WSDL references remote XSD schemas that are not 
accessible. The error was:
```
getaddrinfo ENOTFOUND acg-r02-bld-osb.myac.gov.au
```

## Root Cause
The WSDL parser was enhanced to support local XSD resolution via the `localWsdlDir` parameter,
but the Tauri frontend wasn't automatically passing the directory path when loading local files.

## Solution

### 1. Enhanced WsdlParser (src/WsdlParser.ts)
Added automatic local XSD resolution that:
- Scans the local directory for all XSD/WSDL files
- Builds a namespace cache mapping XML namespaces to local file paths
- Uses node-soap's `overrideImportLocation` hook to redirect remote schema requests to local files
- Allows node-soap to resolve elements by namespace automatically

### 2. Updated Tauri Frontend Bridge (webview/src/utils/bridge.ts)
Modified the `sendMessage` function to automatically extract and include the directory path
when loading local WSDL files:

```typescript
if (isTauri() && message.command === 'loadWsdl' && message.isLocal && message.url) {
    const lastSlash = Math.max(message.url.lastIndexOf('/'), message.url.lastIndexOf('\\'));
    if (lastSlash > 0) {
        message.localWsdlDir = message.url.substring(0, lastSlash);
    }
}
```

## Testing
To test the fix:

1. **Start Tauri in dev mode:**
   ```bash
   npm run tauri:dev
   ```

2. **Load the Organisation WSDL:**
   - File > Open WSDL
   - Navigate to `Samples/Organisation/Organisation.xml`
   - Select and load

3. **Verify Success:**
   - The WSDL should parse successfully
   - All 32 operations should be visible
   - No "ENOTFOUND" errors in the logs
   - Complex types from local XSD files should be properly resolved

## Files Changed
- `src/WsdlParser.ts` - Added local XSD resolution with overrideImportLocation
- `webview/src/utils/bridge.ts` - Auto-extract directory for local WSDL files  
- `src/commands/LoadWsdlCommand.ts` - Pass directory for VS Code (for consistency)

## How It Works
1. User selects a local WSDL file
2. Frontend extracts the directory path from the file path
3. Frontend sends `loadWsdl` command with both `url` and `localWsdlDir`
4. Sidecar receives the command and passes both parameters to WsdlParser
5. WsdlParser scans the directory and builds a namespace cache of local XSD files
6. WsdlParser intercepts all remote XSD import requests via `overrideImportLocation`
7. **If local XSD files exist:** Redirects to local files (node-soap resolves by namespace)
8. **If no local files exist:** Falls back to trying the remote URL
9. WSDL parsing succeeds with full complex type information

## Fallback Behavior
The parser is smart about handling missing schemas:
- **Has local files:** Uses them to avoid network calls and work in locked-down environments
- **No local files:** Falls back to fetching from the remote URL
- **Mixed scenario:** Uses local files when available, fetches missing ones remotely
