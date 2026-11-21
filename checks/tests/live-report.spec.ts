import { test, expect } from '@playwright/test';

// Nachprüfung (ab Level 10): läuft in make check NACH der Meldung an die Live-API, ist kein eigenes Level.
// Prüft, dass die echte Live-Seite den vollständigen Abschlussbericht aus den gemeldeten Levels zeigt.
const LIVE = process.env.LIVE_URL ?? '';
const comma = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',');
const build = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`);

test.describe('live-bericht', () => {
  test('Live-Seite zeigt den gemeldeten Abschlussbericht', async ({ page, request }) => {
    const body = await (await request.get(`${LIVE}/api/levels`)).json();
    for (const l of body.levels) {
      expect(l.status, `Level ${l.level}`).toBe('bestanden');
      expect(l.metrics.tokens, `tokens von Level ${l.level}`).toBeTruthy();
    }
    const [l6, l7, l9] = [body.levels[5].metrics, body.levels[6].metrics, body.levels[8].metrics];
    expect(l6.pipeline && l7.images && l9.loadtest).toBeTruthy();
    const phases = body.levels.map((l: any) => l.metrics.tokens).filter((t: any) => t.inLevel === undefined);
    const cost = Math.round(phases.reduce((s: number, t: any) => s + t.costUsd, 0) * 100) / 100;

    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('report')).toHaveAttribute('data-complete', 'true', { timeout: 8000 });
    await expect(page.getByTestId('summary-reached')).toHaveText('10 / 10');
    await expect(page.getByTestId('report-score')).toHaveText('100 / 100');
    await expect(page.getByTestId('report-commit')).toHaveText(String(body.run.commit).slice(0, 7));
    await expect(page.getByTestId('report-cost')).toHaveText(`${comma(cost, 2)} USD`);
    await expect(page.getByTestId('report-build-time')).toHaveText(build(phases.reduce((s: number, t: any) => s + t.buildS, 0)));
    await expect(page.getByTestId('report-p95')).toHaveText(`${l9.loadtest.p95Ms} ms`);
    await expect(page.getByTestId('report-image-backend')).toHaveText(`${comma(l7.images.backendMB)} MB`);
    await expect(page.getByTestId('report-pipeline-total')).toHaveText(`${l6.pipeline.totalS} s`);
    await expect(page.locator('[data-testid="report-level"][data-status="bestanden"]')).toHaveCount(10);
  });
});
