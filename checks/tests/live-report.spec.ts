import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Nachprüfung (ab Level 10): läuft in make check NACH der Meldung an die Live-API, ist kein eigenes Level.
// Prüft, dass die echte Live-Seite den eben gemeldeten Abschlussbericht zeigt.
const LIVE = process.env.LIVE_URL ?? '';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.out');

test.describe('live-bericht', () => {
  test('Live-Seite zeigt den gemeldeten Abschlussbericht', async ({ page, request }) => {
    const report = JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8'));
    const body = await (await request.get(`${LIVE}/api/levels`)).json();
    for (const l of body.levels) expect(l.status, `Level ${l.level}`).toBe('bestanden');
    expect(body.levels[9].metrics).toEqual(report);

    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('report')).toHaveAttribute('data-state', 'ready', { timeout: 8000 });
    await expect(page.getByTestId('summary-reached')).toHaveText('10 / 10');
    await expect(page.getByTestId('report-reached')).toHaveText('10 / 10');
    await expect(page.getByTestId('report-score')).toHaveText('100 / 100');
    await expect(page.getByTestId('report-commit')).toHaveText(String(body.run.commit).slice(0, 7));
    await expect(page.getByTestId('report-p95')).toHaveText(`${report.loadtest.p95Ms} ms`);
    await expect(page.locator('[data-testid="report-level"][data-status="bestanden"]')).toHaveCount(10);
  });
});
