import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadtest } from '../loadtest.mjs';

// Jeder Test = ein Check von Level 9 (Live-Prüfung). Alles läuft gegen die Live-Seite LIVE_URL.
// Der Lasttest schreibt sein Ergebnis nach .out/loadtest.json; write-results.mjs meldet es als metrics von Level 9.
const LIVE = process.env.LIVE_URL ?? '';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.out/loadtest.json');
const JSON_HEADERS = { 'Content-Type': 'application/json' };

test.describe.configure({ mode: 'serial' });

test.describe('level-9', () => {
  test.setTimeout(120_000);

  test('Live-Seite zeigt Kopfzeile und 10 Karten', async ({ page }) => {
    expect(LIVE, 'LIVE_URL').toMatch(/^https:\/\//);
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('run-id')).toHaveText(process.env.RUN_ID ?? 'lokal');
    await expect(page.getByTestId('run-commit')).toHaveText(/^[0-9a-f]{7}$/);
    await expect(page.getByTestId('level-card')).toHaveCount(10);
  });

  test('Cache- und gzip-Regeln gelten live', async ({ request }) => {
    const root = await request.get(`${LIVE}/`, { headers: { 'Accept-Encoding': 'gzip' } });
    expect(root.status()).toBe(200);
    expect(root.headers()['cache-control']).toBe('no-cache');
    expect(root.headers()['content-encoding']).toBe('gzip');
    const js = /\/assets\/[^"]+\.js/.exec(await root.text())?.[0];
    expect(js, 'JS-Datei in index.html').toBeTruthy();
    expect((await request.get(`${LIVE}${js}`)).headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await request.get(`${LIVE}/config.json`)).headers()['cache-control']).toBe('no-store');
    expect((await request.get(`${LIVE}/gibt-es-nicht.json`)).status()).toBe(404);
  });

  test('Live-API antwortet laut Spec', async ({ request }) => {
    const health = await request.get(`${LIVE}/api/health`);
    expect(health.status()).toBe(200);
    expect(health.headers()['content-type']).toBe('application/json');
    expect((await (await request.get(`${LIVE}/api/levels`)).json()).levels).toHaveLength(10);
    const notFound = await request.get(`${LIVE}/api/levels/0`);
    expect(notFound.status()).toBe(404);
    expect(typeof (await notFound.json()).error).toBe('string');
    const wrongMethod = await request.delete(`${LIVE}/api/levels`);
    expect(wrongMethod.status()).toBe(405);
    expect(wrongMethod.headers()['allow']).toBe('GET');
    expect((await request.post(`${LIVE}/api/levels/1/result`, { headers: JSON_HEADERS, data: { checks: [] } })).status()).toBe(400);
    expect((await request.post(`${LIVE}/api/levels/1/result`, { headers: { 'Content-Type': 'text/plain' }, data: '{}' })).status()).toBe(415);
  });

  test('Meldung erscheint live ohne Neuladen', async ({ page, request }) => {
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    const res = await request.post(`${LIVE}/api/levels/1/result`, { headers: JSON_HEADERS, data: { checks: [{ name: 'Live-Probe', ok: true }], durationMs: 4242 } });
    expect(res.status()).toBe(200);
    const card = page.locator('[data-testid="level-card"][data-level="1"]');
    await expect(card.getByTestId('level-duration')).toHaveText('4,2 s', { timeout: 8000 });
    const hist = await (await request.get(`${LIVE}/api/levels/1/history?limit=1`)).json();
    expect(hist.entries[0].checks[0].name).toBe('Live-Probe');
  });

  test('Lasttest: 10 Verbindungen, 30 s, ohne Fehler, p95 unter 1 s', async () => {
    const result = await loadtest(LIVE);
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n');
    expect(result.requests).toBeGreaterThan(0);
    expect(result.errors).toBe(0);
    expect(result.p95Ms).toBeLessThan(1000);
  });
});
