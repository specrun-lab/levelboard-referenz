import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Container-Suite (Level 7): läuft NUR in der Pipeline (Job „images“) gegen die per
// `docker compose up` gestarteten Images. Seite und API über http://127.0.0.1:8080.
// Lokal nicht ausführen – dort gibt es kein Docker.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const compose = (args: string[]) => execFileSync('docker', ['compose', ...args], { cwd: ROOT, encoding: 'utf8', timeout: 120_000 }).trim();
const JSON_HEADERS = { 'Content-Type': 'application/json' };

test.describe.configure({ mode: 'serial' });

test.describe('container', () => {
  test('Seite läuft im Container und liest aus dem Backend', async ({ page, request }) => {
    expect(await (await request.get('/config.json')).json()).toEqual({ source: 'api' });
    await page.goto('/');
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('run-source')).toHaveAttribute('data-source', 'api');
  });

  test('/api/ wird an den Backend-Container weitergeleitet', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/json');
    expect((await res.json()).status).toBe('ok');
    expect((await request.get('/api/unbekannt')).status()).toBe(404);
  });

  test('Meldung erscheint ohne Neuladen', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    const res = await request.post('/api/levels/1/result', { headers: JSON_HEADERS, data: { checks: [{ name: 'Container', ok: true }], durationMs: 4242 } });
    expect(res.status()).toBe(200);
    const card = page.locator('[data-testid="level-card"][data-level="1"]');
    await expect(card.getByTestId('level-duration')).toHaveText('4,2 s', { timeout: 8000 });
  });

  test('Daten überstehen einen Neustart des Backend-Containers', async ({ request }) => {
    test.setTimeout(120_000);
    const before = await (await request.get('/api/levels/1/history?limit=500')).json();
    expect(before.entries.length).toBeGreaterThan(0);
    compose(['restart', 'backend']);
    await expect(async () => {
      expect((await request.get('/api/health')).status()).toBe(200);
    }).toPass({ timeout: 60_000 });
    const after = await (await request.get('/api/levels/1/history?limit=500')).json();
    expect(after).toEqual(before);
  });

  test('Cache- und gzip-Regeln gelten im Container', async ({ request }) => {
    const index = await request.get('/', { headers: { 'Accept-Encoding': 'gzip' } });
    expect(index.headers()['cache-control']).toBe('no-cache');
    expect(index.headers()['content-encoding']).toBe('gzip');
    expect(index.headers()['server']).toBe('nginx');
    const asset = (await index.text()).match(/\/assets\/[^"']+\.js/)![0];
    expect((await request.get(asset)).headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await request.get('/config.json')).headers()['cache-control']).toBe('no-store');
    expect((await request.get('/gibt-es-nicht.json')).status()).toBe(404);
  });

  test('Backend-Container läuft nicht als root', async () => {
    expect(compose(['exec', '-T', 'backend', 'id', '-u'])).not.toBe('0');
  });
});
