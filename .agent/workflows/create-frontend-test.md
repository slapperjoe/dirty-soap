---
description: how to create a frontend unit/component test for the webview
---

To create a new frontend unit or component test for the webview, follow these steps:

1.  **Identify the Target**: Determine the component, hook, or utility in `webview/src/` that needs testing.
2.  **Create the Test File**: Create a new file following the naming convention `[TargetName].test.tsx` (for components) or `[TargetName].test.ts` (for hooks/utils).
    - For components, use `webview/src/components/__tests__/[ComponentName].test.tsx`.
    - For hooks, use `webview/src/hooks/__tests__/[HookName].test.ts`.
    - For general utilities, use `webview/src/utils/__tests__/[UtilityName].test.ts`.
3.  **Basic Template (Component)**: Use React Testing Library for component tests.

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComponentName } from '../ComponentName';

describe('ComponentName', () => {
    it('should render correctly with [props]', () => {
        render(<ComponentName someProp="value" />);
        expect(screen.getByText('value')).toBeInTheDocument();
    });

    it('should call [handler] when [event] occurs', () => {
        const handler = vi.fn();
        render(<ComponentName onEvent={handler} />);
        
        fireEvent.click(screen.getByRole('button'));
        expect(handler).toHaveBeenCalled();
    });
});
```

4.  **Basic Template (Hook)**: Use `@testing-library/react`'s `renderHook`.

```typescript
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHookName } from '../useHookName';

describe('useHookName', () => {
    it('should initialize with [default state]', () => {
        const { result } = renderHook(() => useHookName());
        expect(result.current.value).toBe(defaultValue);
    });

    it('should update state when [action] occurs', () => {
        const { result } = renderHook(() => useHookName());
        
        act(() => {
            result.current.performAction();
        });

        expect(result.current.value).toBe(newValue);
    });
});
```

5.  **Mocking Contexts**: If the component depends on contexts, wrap it in a provider in the `render` call or use a custom render function.
6.  **Run the Test**: Execute the test from the `webview` directory: `cd webview && npx vitest run [path/to/test]`.
7.  **Verify Coverage**: Run with coverage from the `webview` directory: `cd webview && npx vitest run --coverage`.
8.  **Consistency**: Refer to [create-backend-test.md](file:///Users/mark/Code/APInox/.agent/workflows/create-backend-test.md) for backend test standards.

## UI Integration Testing (Delete Pattern)

Integration tests verify that multiple components or complex state transitions work together. A prime example is the "Delete Pattern" (click-shake-confirm).

1.  **Scope**: Target the component that manages the deletion state (e.g., `ProjectList` or `PerformanceSuiteEditor`).
2.  **Verify Visual State**: Assert that the first click changes the button's visual state (title, color, or shake).
3.  **Verify Action Delay**: Ensure the final deletion handler is only called after the second click.

```tsx
it('should follow delete pattern', () => {
    const onDelete = vi.fn();
    render(<TargetComponent onDelete={onDelete} />);

    const deleteButton = screen.getByTitle('Delete');
    fireEvent.click(deleteButton);

    // Should change to confirmation mode
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTitle('Click again to Confirm')).toBeInTheDocument();

    // Second click triggers action
    fireEvent.click(screen.getByTitle('Click again to Confirm'));
    expect(onDelete).toHaveBeenCalled();
});
```

## E2E Testing (Playwright)

E2E tests verify the entire application flow by mocking the VS Code extension host in a browser environment.

1.  **Test Directory**: `e2e/`
2.  **Configuration**: `playwright.config.ts` manages the development server and browser settings.
3.  **Mocking the Bridge**: Use `page.addInitScript` to mock `acquireVsCodeApi` and establish a message-passing channel between the webview and Playwright.

```ts
test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
        window.acquireVsCodeApi = () => ({
            postMessage: (message) => window.postMessage({ type: 'from-webview', message }, '*'),
            setState: () => {},
            getState: () => ({})
        });
    });
    await page.goto('http://localhost:5173');
});
```

4.  **Verifying Flow**:
    - Use `page.evaluate` to send `window.postMessage` commands *to* the webview (simulating backend responses).
    - Use `page.waitForEvent('body')` or specific locators to wait for UI updates.
    - Scope editor checks to their containers using `data-testid` where available.

5.  **Running E2E**: `npx playwright test` (from the root directory).
