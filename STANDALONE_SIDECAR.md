# Standalone Sidecar Build

This document explains the sidecar bundling strategies for APInox.

## Current Status: JavaScript Bundle (Production)

**Working:** JavaScript bundle via esbuild (`sidecar-bundle/bundle.js`)  
**Status:** Requires Node.js on target machine but works reliably  
**In Progress:** Standalone binary with embedded Node.js (axios compatibility issues)

## JavaScript Bundle (Current Approach)

### Build
```bash
cd sidecar && npm run bundle
npm run prepare:sidecar
```

Creates `sidecar-bundle/bundle.js` (~1MB) + `node_modules/jsonc-parser`

### Pros
✅ Small file size (~1MB)  
✅ Works reliably  
✅ Fast builds  
✅ Easy to debug  

### Cons
❌ Requires Node.js installed  
❌ PATH issues on Windows/Mac bundles  

## Standalone Binary (In Development)

**Issue:** pkg has trouble with axios's dynamic module resolution.

### Attempted Solutions
- ✅ Updated to `@yao-pkg/pkg` (supports Node 20)
- ❌ `--public-packages '*'` - Still fails
- ❌ `--no-bytecode` - Breaks other modules
- ❌ pkg assets config - Module not found

### Error
```
Error: Cannot find module '/snapshot/APInox/node_modules/axios/dist/node/axios.cjs'
```

### Potential Solutions (TODO)

1. **Replace axios** with fetch or node-https
2. **Bundle with esbuild** then package bundle with pkg
3. **Use Bun** instead of pkg for standalone binaries
4. **Vendorize axios** with explicit requires

## Current Workaround: Improved Node.js Detection

The Rust code now checks common Node.js locations before PATH:

```rust
/opt/homebrew/bin/node      // Homebrew (Apple Silicon)
/usr/local/bin/node          // Homebrew (Intel) 
/usr/bin/node                // System
C:\Program Files\nodejs\node.exe  // Windows
```

This solves most PATH issues without requiring standalone binary.

## For Distributed Testing

Use the JavaScript bundle approach:

```bash
# Setup on worker machines (one-time)
curl -sL https://nodejs.org/dist/v20.10.0/node-v20.10.0-linux-x64.tar.xz | tar xJ
export PATH=$PWD/node-v20.10.0-linux-x64/bin:$PATH

# Run worker
node sidecar-bundle/bundle.js --config-dir /tmp/config
```

Or use Docker:
```dockerfile
FROM node:20-slim
COPY sidecar-bundle /app
WORKDIR /app
CMD ["node", "bundle.js"]
```

## Build Commands

### JavaScript Bundle (Working)
```bash
npm run tauri:build              # Uses JS bundle
npm run prepare:sidecar          # Prepares JS bundle
```

### Binary (Not Working Yet)
```bash
cd sidecar && npm run build:binary:mac   # Builds but crashes
```

## File Sizes

- **JS Bundle**: ~1MB (+ Node.js runtime)
- **Standalone Binary**: ~50MB (if we can fix it)

## Next Steps

1. Replace axios with native fetch/https
2. Test binary build after axios removal
3. Update docs when binary works
4. Add CI/CD for multi-platform binaries

