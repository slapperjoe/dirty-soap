# Shared Codebase Refactor Plan (Revised)

## Goal
Eliminate code duplication between the VS Code Extension backend (`src/`) and the Webview frontend (`webview/src/`). Currently, critical files like `models.ts` and `messages.ts` are manually synchronized, leading to potential bugs and maintenance overhead.

---

## Issues Identified in Original Plan

> [!IMPORTANT]
> The following issues were discovered during review and must be addressed.

### Issue 1: `rootDir` Conflict
The backend `tsconfig.json` has `"rootDir": "src"`. This means TypeScript expects **all** source files to be under `src/`. A `shared/` folder at the root level would cause compilation errors.

**Solution:** Remove `rootDir` from backend `tsconfig.json` and use `include` instead:
```json
"include": ["src/**/*", "shared/**/*"]
```

### Issue 2: Vite Source Map Path Transform
The `vite.config.ts` has a custom `sourcemapPathTransform` that assumes all source is under `webview/src`. Sharing code from `../shared` may break sourcemaps.

**Solution:** Update the transform logic to handle `shared` paths or simplify it.

### Issue 3: Dependency Mismatch for Utils
The utils we planned to share have different dependency requirements:
- `BackendXPathEvaluator.ts` and `ReplaceRuleApplier.ts` use `fast-xml-parser` (Node.js compatible, but NOT in webview's `package.json`).
- `xmlFormatter.ts` and `xmlUtils.ts` are pure TypeScript with no dependencies (✅ safe to share).
- `AssertionRunner.ts` imports from models AND from `BackendXPathEvaluator` (chained dependency).

**Solution Options:**
1.  **Add `fast-xml-parser` to webview `devDependencies`:** Allows sharing all utils. Increases bundle size slightly but ensures consistency.
2.  **Only share dependency-free utils:** Share `models.ts`, `messages.ts`, `xmlFormatter.ts`, `xmlUtils.ts`. Keep XPath/Assertion logic backend-only.
3.  **Abstract XPath interface:** Create a shared interface, implement differently in frontend (DOM) and backend (fast-xml-parser). More complex.

**Recommended:** Option 2 for Phase 1 (low risk), then Option 1 if frontend XPath consistency becomes necessary.

---

## Revised Implementation Strategy

### Phase 1: Core Shared Files (Low Risk)
Move only pure TypeScript definition and utility files:
- `models.ts`
- `messages.ts`
- `xmlFormatter.ts`
- `xmlUtils.ts`

### Phase 2: Update tsconfig Files

**Backend (`tsconfig.json`):**
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "outDir": "out",
    "lib": ["ES2020"],
    "sourceMap": true,
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["shared/src/*"]
    }
  },
  "include": ["src/**/*", "shared/**/*"],
  "exclude": ["node_modules", ".vscode-test", "webview", "e2e"]
}
```

**Frontend (`webview/tsconfig.json`):**
```json
{
  "compilerOptions": {
    // ... existing options ...
    "baseUrl": ".",
    "paths": {
      "@shared/*": ["../shared/src/*"]
    }
  },
  "include": ["src", "../shared/src"]
}
```

**Vite (`webview/vite.config.ts`):**
```typescript
resolve: {
  alias: {
    '@shared': path.resolve(__dirname, '../shared/src')
  }
}
```

### Phase 3: Move Files
1. Create `shared/src/` directory.
2. Copy `webview/src/models.ts` to `shared/src/models.ts` (source of truth for UI types).
3. Copy `webview/src/messages.ts` to `shared/src/messages.ts`.
4. Copy `webview/src/utils/xmlFormatter.ts` to `shared/src/utils/xmlFormatter.ts`.
5. Copy `webview/src/utils/xmlUtils.ts` to `shared/src/utils/xmlUtils.ts`.

### Phase 4: Refactor Imports
Use find-and-replace across `src/` and `webview/src/`:
- `from './models'` → `from '@shared/models'`
- `from '../models'` → `from '@shared/models'`
- `from './messages'` → `from '@shared/messages'`
- `from '../messages'` → `from '@shared/messages'`
- Same for `xmlFormatter` and `xmlUtils`.

### Phase 5: Delete Originals
Delete the old files from `src/` and `webview/src/` after verifying builds work.

### Phase 6: (Future) Shared XPath/Assertions
If frontend XPath consistency is needed:
1. Add `fast-xml-parser` to `webview/package.json`.
2. Move `BackendXPathEvaluator.ts` to `shared/src/utils/XPathEvaluator.ts`.
3. Move `AssertionRunner.ts` to `shared/src/utils/AssertionRunner.ts`.
4. Delete `webview/src/utils/xpathEvaluator.ts`.

---

## New Directory Structure
```
DirtySoap/
├── shared/
│   └── src/
│       ├── models.ts
│       ├── messages.ts
│       └── utils/
│           ├── xmlFormatter.ts
│           └── xmlUtils.ts
├── src/              (Extension Backend - imports from @shared)
├── webview/src/      (React Frontend - imports from @shared)
├── tsconfig.json     (Updated with paths)
└── webview/
    ├── tsconfig.json (Updated with paths)
    └── vite.config.ts (Updated with alias)
```

---

## Verification Plan

1.  **Backend Compile:** `npm run compile` - Must pass with no errors.
2.  **Frontend Build:** `cd webview && npm run build` - Must produce working bundle.
3.  **Extension Test:** Launch extension in VS Code Extension Host, verify:
    - WSDL Explorer loads operations.
    - Requests send/receive correctly.
    - Test runner executes tests.
4.  **Existing Unit Tests:** `npm run test` in root and `cd webview && npm run test`.

---

## Summary of Changes from Original Plan

| Original Idea | Issue | Revised Approach |
|---------------|-------|------------------|
| Move 7+ files including XPath utils | Dependency mismatch | Move only 4 dependency-free files in Phase 1 |
| Add `@shared/*` path mapping | `rootDir` conflict | Remove `rootDir`, use `include` array instead |
| Assume Vite handles `../shared` | Sourcemap issues | Explicitly add to vite `resolve.alias` |
