import { test, expect, type APIRequestContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Jeder Test = ein Check von Level 4 (Datenbank). Seriell, weil die Tests den Zustand verändern.
const API = process.env.API_URL ?? 'http://127.0.0.1:8081';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DB = path.join(ROOT, '.run/levelboard.db');

const report = (ok: boolean, durationMs: number) => ({ checks: [{ name: 'Probe', ok }], durationMs });
const post = (request: APIRequestContext, n: number, body: object) =>
  request.post(`${API}/api/levels/${n}/result`, { headers: JSON_HEADERS, data: body });
const history = async (request: APIRequestContext, n: number, query = '') =>
  request.get(`${API}/api/levels/${n}/history${query}`);

test.describe.configure({ mode: 'serial' });

test.describe('level-4', () => {
  test('Meldungen erscheinen in der Historie, neueste zuerst', async ({ request }) => {
    expect((await post(request, 1, report(true, 101))).status()).toBe(200);
    expect((await post(request, 1, report(true, 102))).status()).toBe(200);
    const res = await history(request, 1);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.level).toBe(1);
    expect(body.entries[0].durationMs).toBe(102);
    expect(body.entries[1].durationMs).toBe(101);
    expect(body.entries[0].id).toBeGreaterThan(body.entries[1].id);
    expect(body.entries[0].status).toBe('bestanden');
  });

  test('Historie begrenzt mit limit', async ({ request }) => {
    const res = await history(request, 1, '?limit=1');
    expect((await res.json()).entries).toHaveLength(1);
    expect((await history(request, 1, '?limit=0')).status()).toBe(400);
    expect((await history(request, 1, '?limit=501')).status()).toBe(400);
  });

  test('Daten überstehen einen Neustart des Backends', async ({ request }) => {
    const before = await (await history(request, 1, '?limit=500')).json();
    const levelsBefore = (await (await request.get(`${API}/api/levels`)).json()).levels;
    execFileSync('make', ['--no-print-directory', 'restart-backend'], { cwd: ROOT, stdio: 'pipe', timeout: 90_000 });
    const after = await (await history(request, 1, '?limit=500')).json();
    const levelsAfter = (await (await request.get(`${API}/api/levels`)).json()).levels;
    expect(after).toEqual(before);
    expect(levelsAfter).toEqual(levelsBefore);
  });

  test('Abgelehnte Meldungen landen nicht in der Historie', async ({ request }) => {
    expect((await post(request, 1, report(false, 103))).status()).toBe(200); // Level 1 fehlgeschlagen
    const before = (await (await history(request, 2)).json()).entries.length;
    expect((await post(request, 2, report(true, 104))).status()).toBe(409);
    expect((await (await history(request, 2)).json()).entries).toHaveLength(before);
  });

  test('Datenbank hat das vorgegebene Schema', async () => {
    const db = new DatabaseSync(DB, { readOnly: true });
    try {
      expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1);
      const cols = (t: string) => (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
      expect(cols('levels')).toEqual(['level', 'status', 'checked_at', 'duration_ms', 'checks', 'metrics']);
      expect(cols('reports')).toEqual(['id', 'level', 'status', 'checked_at', 'duration_ms', 'checks', 'metrics']);
      expect(cols('meta')).toEqual(['key', 'value']);
      expect((db.prepare('SELECT COUNT(*) AS n FROM levels').get() as { n: number }).n).toBe(10);
    } finally {
      db.close();
    }
  });
});
