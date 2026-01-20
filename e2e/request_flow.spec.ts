import { test, expect } from '@playwright/test';

// Other existing code...

// 57. Set up project
await page.evaluate((project) => {
    window.postMessage({ command: 'projectLoaded', project }, '*');
}, mockProject);

// Wait a moment for the message to be processed
await page.waitForTimeout(500);

// 3. Verify project appears in sidebar
await expect(page.locator('text=E2E Project')).toBeVisible({ timeout: 10000 });
await expect(page.locator('text=TestService')).toBeVisible({ timeout: 10000 });
await expect(page.locator('text=HelloRequest')).toBeVisible({ timeout: 10000 });

// Other remaining code...