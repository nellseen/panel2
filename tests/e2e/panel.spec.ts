import { expect, test } from '@playwright/test';

test.describe('Termux NodePanel — End-to-End Browser Verification Suite', () => {
  test('1. Full lifecycle, zero-reload stop/restart, workspace tools, resilience & responsive layouts', async ({
    page,
    context,
  }) => {
    const appErrors: string[] = [];
    let serversApiHits = 0;

    page.on('pageerror', (err) => {
      appErrors.push(`pageerror: ${err.message}`);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore expected synthetic 503 network error logged by browser when testing offline/503 fault injection
        if (!text.includes('503') && !text.includes('ERR_INTERNET_DISCONNECTED')) {
          appErrors.push(`console.error: ${text}`);
        }
      }
    });
    page.on('request', (req) => {
      if (req.url().endsWith('/api/servers') && req.method() === 'GET') {
        serversApiHits += 1;
      }
    });

    // --- Scenario 1: Dashboard opens cleanly on Premium Black (#08090B) canvas ---
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

    const bgColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bgColor).toBe('rgb(8, 9, 11)');

    const initialBootId = await page.evaluate(
      () => (window as unknown as { __bootId?: string }).__bootId
    );
    expect(initialBootId).toBeTruthy();

    // Desktop 1440x900 horizontal overflow check
    const desktopOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(desktopOverflow).toBe(false);

    // --- Scenario 2: Primary navigation across all 6 console sections ---
    const sidebarNav = page.getByRole('navigation', { name: 'Main navigation' });
    await sidebarNav.getByRole('button', { name: /Servers/i }).click();
    await expect(page.getByRole('heading', { name: 'Servers', level: 1 })).toBeVisible();

    await sidebarNav.getByRole('button', { name: /Packages/i }).click();
    await expect(page.getByRole('heading', { name: 'System Packages', level: 1 })).toBeVisible();

    await sidebarNav.getByRole('button', { name: /Diagnostics/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Doctor & Runtime Diagnostics', level: 1 })
    ).toBeVisible();

    await sidebarNav.getByRole('button', { name: /Activity Log/i }).click();
    await expect(page.getByRole('heading', { name: 'Activity Audit Log', level: 1 })).toBeVisible();

    await sidebarNav.getByRole('button', { name: /Settings/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Panel Settings & Security Architecture', level: 1 })
    ).toBeVisible();

    await sidebarNav.getByRole('button', { name: /Overview/i }).click();
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

    // --- Scenario 3 & 12: Create Server Modal validation, Escape close, & valid provisioning ---
    await page.getByRole('button', { name: 'New Server', exact: true }).click();
    const createDialog = page.getByRole('dialog', { name: 'Create Node.js Instance' });
    await expect(createDialog).toBeVisible();

    // Close with Escape key
    await page.keyboard.press('Escape');
    await expect(createDialog).toBeHidden();

    // Reopen and validate empty name + reserved port 3000
    await page.getByRole('button', { name: 'New Server', exact: true }).click();
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel(/Listening Port/i).fill('3000');
    await createDialog.getByRole('button', { name: 'Create Server', exact: true }).click();
    await expect(createDialog.getByText(/Server name is required/i)).toBeVisible();
    await expect(createDialog.getByText(/Port 3000 is reserved/i)).toBeVisible();

    // Fill valid Native HTTP Server on port 4310
    await createDialog.getByLabel(/Server Name/i).fill('E2E Order Service');
    await createDialog.getByLabel(/Listening Port/i).fill('4310');
    await createDialog.getByRole('radio', { name: /Native HTTP Server/i }).check();
    await createDialog.getByRole('button', { name: 'Create Server', exact: true }).click();
    await expect(createDialog).toBeHidden();

    // Creating navigates into Server Detail view; return to Dashboard Overview first to test Bug A scenario!
    await expect(page.getByRole('heading', { name: 'E2E Order Service', level: 1 })).toBeVisible();
    await sidebarNav.getByRole('button', { name: /Overview/i }).click();
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'E2E Order Service', exact: true })).toBeVisible();

    // --- Scenario 4, 5, 9, 10: Start, Stop, and Restart managed server WITH DASHBOARD OPEN ---
    // Start server
    const startBtn = page.getByRole('button', { name: 'Start E2E Order Service' });
    await startBtn.click();
    await expect(page.getByText('Running').first()).toBeVisible();

    // Verify no request storm / loop occurred
    const hitsBeforeStop = serversApiHits;

    // STOP managed server while dashboard remains open -> MUST NOT reload or blank!
    const stopBtn = page.getByRole('button', { name: 'Stop E2E Order Service' });
    await stopBtn.click();
    await expect(page.getByText('Stopped').first()).toBeVisible();
    await expect(page.getByText('Exit 0').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();

    const bootIdAfterStop = await page.evaluate(
      () => (window as unknown as { __bootId?: string }).__bootId
    );
    expect(bootIdAfterStop).toBe(initialBootId);

    // Start again, then RESTART managed server while dashboard remains open -> MUST NOT reload or blank!
    await page.getByRole('button', { name: 'Start E2E Order Service' }).click();
    await expect(page.getByText('Running').first()).toBeVisible();

    const restartBtn = page.getByRole('button', { name: 'Restart E2E Order Service' });
    await restartBtn.click();
    await expect(page.getByText('Running').first()).toBeVisible();

    const bootIdAfterRestart = await page.evaluate(
      () => (window as unknown as { __bootId?: string }).__bootId
    );
    expect(bootIdAfterRestart).toBe(initialBootId);

    const hitsAfterLifecycle = serversApiHits - hitsBeforeStop;
    expect(hitsAfterLifecycle).toBeLessThan(12);

    // --- Scenario 11: Transient Backend API 503 Outage -> Stale Warning + Recovery ---
    await page.route('**/api/servers', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: true,
            code: 'SERVICE_UNAVAILABLE',
            message: 'Simulated upstream outage',
          }),
        });
      } else {
        await route.continue();
      }
    });

    await page.getByRole('button', { name: 'Refresh panel state' }).click();
    await expect(page.getByText(/Showing cached state/i)).toBeVisible();
    // Server card MUST remain visible and NOT collapse to empty state
    await expect(page.getByRole('button', { name: 'E2E Order Service', exact: true })).toBeVisible();

    await page.unroute('**/api/servers');
    await page.getByRole('button', { name: 'Retry Sync' }).click();
    await expect(page.getByText(/Showing cached state/i)).toBeHidden();

    // --- Scenario 8: Network / WebSocket Disconnect & Reconnect without Dashboard Loss ---
    await context.setOffline(true);
    await page.waitForTimeout(300);
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Refresh panel state' }).click();
    await expect(page.getByText('Realtime')).toBeVisible();

    // --- Scenario 6 & 7: Server Detail -> Terminal, File Manager, Confirmation Cancel/Confirm, & .env ---
    await page.getByRole('button', { name: 'E2E Order Service', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'E2E Order Service', level: 1 })).toBeVisible();

    // Live Terminal execution
    const termInput = page.getByLabel('Terminal command input');
    await termInput.fill('echo E2E_TERMINAL_READY');
    await page.getByRole('button', { name: 'Run', exact: true }).click();
    await expect(page.getByTestId('terminal-output')).toContainText('E2E_TERMINAL_READY');

    // Keyboard ArrowRight navigation from Live Terminal tab -> File Manager tab
    const terminalTab = page.getByRole('tab', { name: /Live Terminal/i });
    await terminalTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: /File Manager/i })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // File Manager: Create file -> Edit & Save -> Rename -> Cancel Delete -> Confirm Delete
    await page.getByRole('button', { name: 'New file' }).click();
    const newFileDialog = page.getByRole('dialog', { name: 'Create New File' });
    await newFileDialog.getByLabel('File Name').fill('notes.txt');
    await newFileDialog.getByRole('button', { name: 'Create File', exact: true }).click();
    await expect(newFileDialog).toBeHidden();

    const editor = page.getByLabel('Editor for notes.txt');
    await expect(editor).toBeVisible();
    await editor.fill('verified content v1');
    await page.getByRole('button', { name: 'Save File', exact: true }).click();
    await expect(page.getByText('Unsaved')).toBeHidden();

    // Rename notes.txt -> status.txt
    await page.getByRole('button', { name: 'Actions for notes.txt' }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    const renameDialog = page.getByRole('dialog', { name: 'Rename File' });
    await renameDialog.getByLabel('New Name').fill('status.txt');
    await renameDialog.getByRole('button', { name: 'Rename', exact: true }).click();
    await expect(renameDialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Actions for status.txt' })).toBeVisible();

    // Open Delete Confirmation -> Cancel first (must NOT delete) -> Confirm second
    await page.getByRole('button', { name: 'Actions for status.txt' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const delFileDialog = page.getByRole('dialog', { name: 'Delete File?' });
    await delFileDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Actions for status.txt' })).toBeVisible();

    await page.getByRole('button', { name: 'Actions for status.txt' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Delete File?' })
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Actions for status.txt' })).toBeHidden();

    // Environment (.env) tab
    await page.getByRole('tab', { name: /Environment \(\.env\)/i }).click();
    await expect(page.getByRole('heading', { name: 'Environment Variables (.env)' })).toBeVisible();
    await page.getByRole('button', { name: 'Save to .env' }).click();

    // --- Mobile Viewport (375x812) Responsive Check ---
    await page.setViewportSize({ width: 375, height: 812 });
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(mobileOverflow).toBe(false);

    // Open Mobile Navigation Drawer & navigate to Activity Log
    await page.getByRole('button', { name: 'Open navigation menu' }).click();
    const mobileDrawer = page.getByRole('dialog', { name: 'NodePanel Navigation' });
    await expect(mobileDrawer).toBeVisible();
    await mobileDrawer.getByRole('button', { name: /Activity Log/i }).click();
    await expect(page.getByRole('heading', { name: 'Activity Audit Log', level: 1 })).toBeVisible();

    // Restore desktop viewport & test Server Delete Confirmation flow
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('aside').getByRole('button', { name: /E2E Order Service/i }).click();
    await page.getByRole('button', { name: 'Delete server instance' }).click();
    const delServerDialog = page.getByRole('dialog', { name: 'Delete Server Instance?' });
    await delServerDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'E2E Order Service', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Delete server instance' }).click();
    await page
      .getByRole('dialog', { name: 'Delete Server Instance?' })
      .getByRole('button', { name: 'Delete Server' })
      .click();

    await expect(page.getByRole('heading', { name: 'Servers', level: 1 })).toBeVisible();
    await expect(page.getByText('E2E Order Service')).toBeHidden();

    // Final invariant: zero full-page reloads across the entire E2E journey & zero console/page errors
    const finalBootId = await page.evaluate(
      () => (window as unknown as { __bootId?: string }).__bootId
    );
    expect(finalBootId).toBe(initialBootId);
    expect(appErrors).toEqual([]);
  });
});
