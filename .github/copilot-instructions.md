# GitHub Copilot Instructions for APInox

## Development Priorities

### 1. Platform Priority: Tauri over VS Code Extension
**ALWAYS** prioritize Tauri implementation over VS Code Extensions when working on features or fixing issues.

- **Tauri** (`src-tauri/`, Rust + Tauri APIs) is the primary target for new features
- **VS Code Extension** (`src/`, Node.js + VS Code APIs) is maintained for backward compatibility
- When implementing a feature, start with Tauri implementation first
- If both platforms need updates, implement Tauri changes before VS Code extension changes
- Use Tauri's cross-platform capabilities and native performance benefits

### 2. Build Considerations: Production AND Debug
**ALWAYS** ensure both production builds and debug builds are considered when making changes.

- Test changes with `npm run tauri:dev` (debug)
- Test changes with `npm run tauri:build` (production)
- Verify webview compilation with `npm run compile-webview`
- Check that production optimizations don't break functionality
- Consider bundle size and performance impacts in production builds
- Verify VS Code extension builds with `npm run compile`

### 3. Logging: Use Logger Mechanism
**ALWAYS** send important changes and errors through the logging mechanism, never use `console.log` for production code.

- Use the logger for all important events, state changes, and errors
- In Rust (Tauri): Use `log::info!()`, `log::warn!()`, `log::error!()`, `log::debug!()`
- In Node.js (Extension): Use the VS Code Output Channel or configured logger
- In React (Webview): Send messages to the extension host for logging
- Include context and relevant data in log messages
- Log errors with stack traces when available
- Use appropriate log levels (debug, info, warn, error)

### 4. Cross-Platform Support: Windows, macOS, Linux
**ALWAYS** remember this application runs on Windows, macOS, and Linux.

- Avoid platform-specific APIs unless absolutely necessary
- Test file paths work on all platforms (use `path` module, not hardcoded separators)
- Use Tauri's cross-platform plugins for system integration
- Handle platform-specific behavior gracefully (e.g., keyboard shortcuts, file dialogs)
- Consider case-sensitive filesystems (Linux/macOS) vs case-insensitive (Windows)
- Use appropriate path separators and line endings
- Test on multiple platforms when possible

### 5. Language Priority: Rust over Node.js
**ALWAYS** prioritize Rust implementations over Node.js when there's a choice.

- If a feature can be implemented in Rust (Tauri), prefer that over Node.js
- Move performance-critical code to Rust when possible
- Use Tauri commands for business logic when feasible
- Leverage Rust's type safety and performance benefits
- Only use Node.js when:
  - Working with VS Code extension-specific features
  - Using Node.js-specific libraries that have no Rust equivalent
  - Maintaining backward compatibility with existing Node.js code

## Architecture Guidelines

### Tauri Application Structure
```
src-tauri/
├── src/
│   ├── main.rs       # Tauri entry point
│   └── lib.rs        # Shared library code
├── Cargo.toml        # Rust dependencies
└── tauri.conf.json   # Tauri configuration
```

### VS Code Extension Structure
```
src/
├── extension.ts          # Extension entry point
├── services/            # Business logic services
├── commands/            # VS Code command handlers
└── utils/               # Utility functions
```

### Webview Structure
```
webview/
├── src/
│   ├── components/      # React components
│   ├── App.tsx          # Main React app
│   └── main.tsx         # Entry point
└── vite.config.ts       # Vite build config
```

## Key Technical Considerations

### Logging Best Practices
- Use structured logging with context
- Include timestamps and severity levels
- Log important state transitions
- Log all errors with full context
- Use debug level for verbose development info
- Never log sensitive data (passwords, tokens, etc.)

### Cross-Platform File Handling
```typescript
// Good - cross-platform
const filePath = path.join(baseDir, 'config', 'settings.json');

// Bad - Windows-only
const filePath = baseDir + '\\config\\settings.json';
```

### Tauri Command Pattern
```rust
// Rust side (src-tauri/src/)
#[tauri::command]
fn my_command(param: String) -> Result<String, String> {
    log::info!("Executing my_command with param: {}", param);
    // Implementation
    Ok("result".to_string())
}

// Register in main.rs
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![my_command])
    .run(tauri::generate_context!())
```

## Testing Requirements
- Write tests for new features
- Ensure existing tests pass: `npm test`
- Test Tauri builds: `npm run tauri:build`
- Test VS Code extension in debug mode (F5)
- Verify webview functionality in both platforms
- Tests can be fixed in the pull requests they originated from.  No need for addtional PRs.

## Common Commands
```bash
# Tauri Development
npm run tauri:dev          # Run in development mode
npm run tauri:build        # Build for production

# VS Code Extension
npm run compile            # Compile TypeScript
npm run watch              # Watch mode
npm run test               # Run tests

# Webview
npm run compile-webview    # Build webview
cd webview && npm run dev  # Webview dev mode

# Linting
npm run lint               # Run ESLint
```

## Additional Context
- See [AGENTS.md](../AGENTS.md) for architecture overview
- See [CODE_ANALYSIS.md](../CODE_ANALYSIS.md) for technical debt
- See [README.md](../README.md) for user-facing documentation
