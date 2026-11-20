import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Jeder Test = ein Check von Level 3 (REST-Backend). Die Tests laufen nacheinander,
// weil sie den Zustand des Backends verändern.
const API = process.env.API_URL ?? 'http://127.0.0.1:8081';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const here = path.dirname(fileURLToPath(import.meta.url));

const report = (ok: boolean) => ({ checks: [{ name: 'Probe', ok }], durationMs: 10 });

test.describe.configure({ mode: 'serial' });

test.describe('level-3', () => {
  test('Backend antwortet auf /api/health', async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toBe('application/json');
    expect(await res.json()).toEqual({ status: 'ok', version: expect.any(String) });
  });

  test('GET /api/levels liefert alle 10 Levels im Schema', async ({ request }) => {
    const res = await request.get(`${API}/api/levels`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['levels', 'run']);
    expect(body.levels).toHaveLength(10);
    body.levels.forEach((l: { level: number; status: string; checks: unknown[] }, i: number) => {
      expect(l.level).toBe(i + 1);
      expect(['offen', 'bestanden', 'fehlgeschlagen', 'gesperrt']).toContain(l.status);
      expect(Array.isArray(l.checks)).toBe(true);
    });
  });

  test('Ergebnis melden setzt Status und Zeitpunkt', async ({ request }) => {
    const res = await request.post(`${API}/api/levels/1/result`, { headers: JSON_HEADERS, data: report(true) });
    expect(res.status()).toBe(200);
    const l1 = (await res.json()).levels[0];
    expect(l1.status).toBe('bestanden');
    expect(Number.isNaN(Date.parse(l1.checkedAt))).toBe(false);
    expect(l1.durationMs).toBe(10);
  });

  test('Fehlschlag sperrt höhere Levels', async ({ request }) => {
    const res = await request.post(`${API}/api/levels/1/result`, { headers: JSON_HEADERS, data: report(false) });
    const levels = (await res.json()).levels;
    expect(levels[0].status).toBe('fehlgeschlagen');
    for (const l of levels.slice(1)) expect(l.status).toBe('gesperrt');
  });

  test('Falsche Reihenfolge ergibt 409', async ({ request }) => {
    // Level 1 ist nach dem vorigen Test fehlgeschlagen → Level 2 darf nicht gemeldet werden
    const res = await request.post(`${API}/api/levels/2/result`, { headers: JSON_HEADERS, data: report(true) });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toEqual(expect.any(String));
  });

  test('Ungültige Anfragen ergeben 400', async ({ request }) => {
    for (const data of ['{kaputt', JSON.stringify({ durationMs: 1 }), JSON.stringify({ checks: [], durationMs: 1 })]) {
      const res = await request.post(`${API}/api/levels/1/result`, { headers: JSON_HEADERS, data });
      expect(res.status(), data).toBe(400);
      expect((await res.json()).error).toEqual(expect.any(String));
    }
  });

  test('Unbekanntes Level ergibt 404', async ({ request }) => {
    for (const p of ['/api/levels/0', '/api/levels/11', '/api/levels/abc']) {
      const res = await request.get(`${API}${p}`);
      expect(res.status(), p).toBe(404);
    }
  });

  test('Go-Tests bestehen', async () => {
    // Wirft bei einem fehlgeschlagenen Go-Test; die Ausgabe erscheint dann im Report.
    execFileSync('go', ['test', '-count=1', './...'], { cwd: path.join(here, '../../backend'), stdio: 'pipe', timeout: 120_000 });
  });
});
