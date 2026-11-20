import { test, expect, type APIRequestContext } from '@playwright/test';

// Jeder Test = ein Check von Level 2 (Seite läuft im Webserver nginx).
async function firstAsset(request: APIRequestContext): Promise<string> {
  const html = await (await request.get('/')).text();
  const m = html.match(/\/assets\/[^"']+\.js/);
  expect(m, 'index.html verweist auf eine JS-Datei unter /assets/').not.toBeNull();
  return m![0];
}

test.describe('level-2', () => {
  test('Antwort kommt von nginx', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    expect(res.headers()['server']).toBe('nginx');
  });

  test('results.json wird nicht zwischengespeichert', async ({ request }) => {
    const res = await request.get('/results.json');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store');
  });

  test('index.html wird nicht zwischengespeichert', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['cache-control']).toBe('no-cache');
  });

  test('Assets werden ein Jahr zwischengespeichert', async ({ request }) => {
    const res = await request.get(await firstAsset(request));
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  test('Fehlende Datei ergibt 404', async ({ request }) => {
    const res = await request.get('/gibt-es-nicht.json');
    expect(res.status()).toBe(404);
  });

  test('Antworten sind gzip-komprimiert', async ({ request }) => {
    for (const url of ['/', await firstAsset(request), '/results.json']) {
      const res = await request.get(url, { headers: { 'Accept-Encoding': 'gzip' } });
      expect(res.headers()['content-encoding'], url).toBe('gzip');
    }
  });

  test('Seite funktioniert über nginx', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('level-card')).toHaveCount(10);
    expect(errors).toEqual([]);
  });
});
