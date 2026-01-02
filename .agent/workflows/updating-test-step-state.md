---
description: How to properly update state when modifying test step data
---

# Updating Test Step Data (Assertions, Extractors, etc.)

When adding or modifying data within a test step (assertions, extractors, requests), you MUST update THREE pieces of state to ensure the UI reflects changes immediately:

## Required State Updates

1. **`projects`** - The master data source, updated via `setProjects()`
2. **`selectedStep`** - The currently selected step, updated via `setSelectedStep()`
3. **`selectedRequest`** - The request being displayed, updated via `setSelectedRequest()`

## Pattern to Follow

```typescript
// 1. Build the updated request with new data
const updatedRequest = {
    ...selectedStep.config.request,
    extractors: [...(selectedStep.config.request.extractors || []), newExtractor],
    dirty: true
};

// 2. Build the updated step containing the updated request
const updatedStep = {
    ...selectedStep,
    config: {
        ...selectedStep.config,
        request: updatedRequest
    }
};

// 3. Update projects (master data source)
setProjects(nextProjects);

// 4. CRITICAL: Update selectedStep for StepDetail panel
setSelectedStep(updatedStep);

// 5. CRITICAL: Update selectedRequest for ExtractorsPanel/AssertionsPanel
setSelectedRequest(updatedRequest);
```

## Why This Matters

- `WorkspaceLayout` renders `ExtractorsPanel` with `selectedRequest.extractors`
- `WorkspaceLayout` renders `AssertionsPanel` with `selectedRequest.assertions`
- If only `projects` and `selectedStep` are updated, the panels won't re-render

## Files Affected by This Pattern

- `useTestCaseHandlers.ts` - `handleSaveExtractor`, `handleAddAssertion`, `handleAddExistenceAssertion`
- Any future handlers that modify step/request data
