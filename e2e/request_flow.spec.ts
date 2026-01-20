import { test, expect } from '@playwright/test';

test.describe('Request Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock VS Code API here
  });

  test('should load projects and allow manual request execution', async ({ page }) => {
    // Post projectLoaded message here
    await page.waitForTimeout(500); // Key addition
    // Existing test logic
    expect(await page.isVisible('E2E Project'), { timeout: 10000 }).toBeTruthy();
    expect(await page.isVisible('TestService'), { timeout: 10000 }).toBeTruthy();
    expect(await page.isVisible('HelloRequest'), { timeout: 10000 }).toBeTruthy();
    // Further existing test logic for request execution flow and response verification
  });
});