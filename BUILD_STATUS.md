# Build Status

**Last Updated**: 2026-01-24

---

## ✅ What's Working

### Tauri Desktop App
```bash
npm run tauri:dev      # Development with hot reload
npm run tauri:build    # Production build
```
- ✅ Uses standalone binary (`sidecar-bundle/sidecar`)
- ✅ Embedded Node.js v18.5.0 (46MB binary)
- ✅ Zero dependencies - no Node.js installation required
- ✅ Cross-platform support (Windows/Mac/Linux)

### VS Code Extension
```bash
npm run compile        # Builds extension + webview
code .                 # Open and press F5 to run
```
- ✅ Maintained for backward compatibility
- ✅ Uses Node.js runtime

### Current Features
- ✅ WSDL parsing and operation exploration
- ✅ SOAP request execution  
- ✅ Proxy server for traffic inspection
- ✅ Mock server for test responses
- ✅ Request/response replace rules
- ✅ Test suites and test runner
- ✅ Performance testing with metrics export
- ✅ Request history
- ✅ File watcher
- ✅ Project management (FolderProjectStorage)
- ✅ Changelog visible in welcome screen
- ✅ Theme-aware logo display
- ✅ Environment variables with custom fields
- ✅ Encrypted secrets (AES-256-GCM)

---

## 🔄 In Progress

### Encrypted Secrets (Feature #5) - 95% Complete
- ✅ Backend encryption infrastructure
- ✅ API endpoints (set/get/delete)
- ✅ UI with custom fields and secret toggles
- ✅ Export/import with [REDACTED] handling
- ⏳ Variable resolution in requests (remaining)
- ⏳ End-to-end testing

**ETA**: 4 hours

---

## 📋 Next Steps

1. Complete encrypted secrets variable resolution
2. CLI + Sidecar merge (see CLI_SIDECAR_MERGE.md)
3. Request chaining (Feature #6)
4. OpenAPI/REST support (Feature #8)

---

## Build Commands

### Development
```bash
npm run tauri:dev              # Tauri with hot reload
npm run dev:webview            # Webview only (browser)
```

### Production
```bash
npm run tauri:build            # Full Tauri build with binary
npm run compile                # VS Code extension build
```

### Testing
```bash
npm test                       # Run unit tests
npm run test:coverage          # With coverage
```

### Binary
```bash
cd sidecar && npm run binary           # Build for current platform
cd sidecar && npm run binary:all       # Build for all platforms
```

---

## Recent Achievements (2026-01)

1. ✅ Standalone binary with embedded Node.js (no dependencies)
2. ✅ Removed axios, replaced with native fetch
3. ✅ Performance metrics with CSV/JSON export
4. ✅ Encrypted secrets infrastructure (95% complete)
5. ✅ Logo overlay and theme improvements
6. ✅ Node.js detection for multiple install locations

---

## Support & Documentation

- Main docs: `README.md`
- Architecture: `AGENTS.md`
- Features: `TODO.md`
- Binary details: `STANDALONE_BINARY_COMPLETE.md`
- Merge plans: `CLI_SIDECAR_MERGE.md`
- Tauri bundling: `TAURI_BUNDLING.md`
