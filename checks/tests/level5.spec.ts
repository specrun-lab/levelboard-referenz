import { test, expect } from '@playwright/test';

// Jeder Test = ein Check von Level 5 (Frontend + Backend). Seriell, weil die Tests den Zustand verändern.
// Alle Aufrufe gehen über die Adresse der Seite (BASE_URL, Port 8080); nginx leitet /api/ weiter.
const API_DIRECT = process.env.API_URL ?? 'http://127.0.0.1:8081';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

test.describe.configure({ mode: 'serial' });

test.describe('level-5', () => {
  test('Seite liest aus dem Backend', async ({ page, request }) => {
    const cfg = await request.get('/config.json');
    expect(await cfg.json()).toEqual({ source: 'api' });
    await page.goto('/');
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('run-source')).toHaveAttribute('data-source', 'api');
    await expect(page.getByTestId('run-source')).toHaveText('Backend');
  });

  test('nginx leitet /api/ an das Backend weiter', async ({ request }) => {
    const viaNginx = await request.get('/api/health');
    const direct = await request.get(`${API_DIRECT}/api/health`);
    expect(viaNginx.status()).toBe(200);
    expect(viaNginx.headers()['content-type']).toBe('application/json');
    expect(await viaNginx.json()).toEqual(await direct.json());
    const missing = await request.get('/api/unbekannt');
    expect(missing.status()).toBe(404);
    expect((await missing.json()).error).toEqual(expect.any(String));
  });

  test('Gemeldetes Ergebnis erscheint ohne Neuladen', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    const res = await request.post('/api/levels/1/result', {
      headers: JSON_HEADERS,
      data: { checks: [{ name: 'Probe', ok: true }], durationMs: 4242 },
    });
    expect(res.status()).toBe(200);
    // kein page.reload(): die Seite fragt selbst alle 5 Sekunden ab
    const card = page.locator('[data-testid="level-card"][data-level="1"]');
    await expect(card.getByTestId('level-duration')).toHaveText('4,2 s', { timeout: 8000 });
    await expect(card).toHaveAttribute('data-status', 'bestanden');
  });

  test('Backend-Ausfall wird angezeigt', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    // Ausfall nachstellen, ohne das echte Backend zu stoppen
    await page.route('**/api/levels', (route) => route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>502</h1>' }));
    await expect(page.getByTestId('notice')).toHaveAttribute('data-kind', 'unavailable', { timeout: 8000 });
    await expect(page.locator('[data-testid="level-card"][data-status="offen"]')).toHaveCount(10);
    await page.unroute('**/api/levels');
    await expect(page.getByTestId('notice')).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
  });

  test('Meldungen über nginx landen in der Historie', async ({ request }) => {
    const res = await request.post('/api/levels/1/result', {
      headers: JSON_HEADERS,
      data: { checks: [{ name: 'Probe über nginx', ok: true }], durationMs: 5151 },
    });
    expect(res.status()).toBe(200);
    const hist = await (await request.get('/api/levels/1/history?limit=1')).json();
    expect(hist.entries[0].durationMs).toBe(5151);
    expect(hist.entries[0].checks[0].name).toBe('Probe über nginx');
  });
});
