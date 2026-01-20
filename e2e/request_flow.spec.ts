import { test, expect } from '@playwright/test';

test.describe('Request Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock VS Code API here
  });

  test('should load projects and allow manual request execution', async ({ page }) => {
    // Post projectLoaded message here
    await page.waitForTimeout(500); // Key addition
    // Existing test logic
    await expect(page.getByText('E2E Project')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('TestService')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('HelloRequest')).toBeVisible({ timeout: 10000 });
    // Further existing test logic for request execution flow and response verification
  });
});