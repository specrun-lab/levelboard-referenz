import { test, expect } from '@playwright/test';

// Jeder Test = ein Check von Level 1. Der Testtitel ist der Check-Name in results.json.
test.describe('level-1', () => {
  test('Seite antwortet mit HTTP 200', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('text/html');
  });

  test('Titel ist „Levelboard“', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Levelboard');
  });

  test('10 Level-Karten sichtbar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('board')).not.toHaveAttribute('data-state', 'loading');
    await expect(page.getByTestId('level-card')).toHaveCount(10);
    for (const card of await page.getByTestId('level-card').all()) {
      await expect(card).toBeVisible();
    }
  });

  test('Keine Konsolenfehler', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByTestId('board')).not.toHaveAttribute('data-state', 'loading');
    expect(errors).toEqual([]);
  });

  test('Handy-Ansicht: Karten einspaltig', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    const boxes = await Promise.all((await page.getByTestId('level-card').all()).map((c) => c.boundingBox()));
    const xs = new Set(boxes.map((b) => Math.round(b!.x)));
    expect(xs.size).toBe(1);
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollW).toBeLessThanOrEqual(375);
  });
});
