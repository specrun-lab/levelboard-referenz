import { test, expect, request as playwrightRequest, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSizeMB, pipelineOf } from '../collect-report.mjs';

// Jeder Test = ein Check von Level 10 (Bericht vollständig und live).
// Test 1 sammelt alle Teile des Berichts nach .out/bericht.json; Tests 2 und 3 prüfen die Darstellung auf der
// Live-Seite mit ersetzter API-Antwort (/api/levels und /api/usage). Test 4 prüft /api/usage am lokalen Backend.
// Die echte Meldung kommt danach; make check prüft sie mit tests/live-report.spec.ts.
// Den echten Verbrauch (Tokens, Kosten) misst der Runner nach der Prüfung und trägt ihn per PUT /api/usage nach.
const REPO = process.env.GITHUB_REPO ?? `specrun-lab/levelboard-${process.env.RUN_ID ?? 'lokal'}`;
const LIVE = process.env.LIVE_URL ?? '';
const API = process.env.API_URL ?? 'http://127.0.0.1:8081';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.resolve(HERE, '../.out');
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const comma = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',');
const build = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`);
// Bauzeit für die Darstellungstests: echte Einträge aus bauzeit.json, wo es sie schon gibt, sonst Beispielwerte
const exampleBuild = (n: number) => (n % 3 === 0 ? { passedAt: new Date().toISOString(), inLevel: n + 1 } : { passedAt: new Date().toISOString(), buildS: 30 * n + 7 });

/** Ersetzt im Browser die Antwort von /api/levels: Jedes Level bekommt die angegebenen Felder. */
async function withLevels(page: Page, patch: (level: number) => Record<string, unknown>) {
  await page.route('**/api/levels', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.levels = body.levels.map((l: { level: number }) => ({ ...l, ...patch(l.level) }));
    await route.fulfill({ response: res, json: body });
  });
}

/** Ersetzt im Browser die Antwort von /api/usage. */
async function withUsage(page: Page, usage: Record<string, unknown>) {
  await page.route('**/api/usage', (route) => route.fulfill({ status: 200, contentType: 'application/json', json: usage }));
}

/** Beispiel-Verbrauch passend zur Bauzeit: Levels mit inLevel verweisen auf ihr Level, die anderen haben eigene Werte. */
function exampleUsage(builds: Record<string, any>) {
  const levels: Record<string, unknown> = {};
  let output = 0;
  let total = 0;
  let cost = 0;
  for (let n = 1; n <= 10; n++) {
    const x = builds[n];
    if (x?.inLevel) levels[n] = { inLevel: x.inLevel };
    else {
      levels[n] = { output: 1000 * n + 234, total: 100_000 * n, costUsd: n / 4 };
      output += 1000 * n + 234;
      total += 100_000 * n;
      cost += n / 4;
    }
  }
  return {
    harness: 'claude',
    models: ['claude-haiku-5-5'],
    measuredAt: new Date().toISOString(),
    total: { output, total, costUsd: Math.round(cost * 100) / 100 },
    levels,
  };
}
const thousands = (n: number) => n.toLocaleString('de-CH');
const usd = (n: number) => `${comma(n, 2)} USD`;
const inL = (n: number) => `in L${String(n).padStart(2, '0')}`;

test.describe.configure({ mode: 'serial' });

test.describe('level-10', () => {
  test.setTimeout(120_000);

  test('Alle Teile des Berichts sind vorhanden', async () => {
    const sha = head();
    const pipeline = pipelineOf(REPO, sha);
    const images = { frontendMB: await imageSizeMB(`${REPO}-frontend`, sha), backendMB: await imageSizeMB(`${REPO}-backend`, sha) };
    const loadtest = JSON.parse(fs.readFileSync(path.join(OUT, 'loadtest.json'), 'utf8'));
    // bauzeit.json gibt es erst nach dem ersten make check; fehlende Einträge ersetzen Beispielwerte
    let bauzeit: { levels?: Record<string, unknown> } = {};
    try { bauzeit = JSON.parse(fs.readFileSync(path.join(ROOT, 'bauzeit.json'), 'utf8')); } catch {}
    const build = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, bauzeit.levels?.[i + 1] ?? exampleBuild(i + 1)]));
    fs.writeFileSync(path.join(OUT, 'bericht.json'), JSON.stringify({ pipeline, images, loadtest, build }, null, 2) + '\n');
    for (const job of ['check', 'images', 'deploy']) expect(pipeline.jobs[job], `Job ${job}`).toBeGreaterThan(0);
    expect(images.frontendMB).toBeGreaterThan(0);
    expect(images.backendMB).toBeGreaterThan(0);
    expect(loadtest.requests).toBeGreaterThan(0);
  });

  test('Vollständiger Bericht wird dargestellt', async ({ page }) => {
    const b = JSON.parse(fs.readFileSync(path.join(OUT, 'bericht.json'), 'utf8'));
    const extra: Record<number, Record<string, unknown>> = { 6: { pipeline: b.pipeline }, 7: { images: b.images }, 9: { loadtest: b.loadtest } };
    await withLevels(page, (n) => ({ status: 'bestanden', checkedAt: new Date().toISOString(), metrics: { build: b.build[n], ...(extra[n] ?? {}) } }));
    const u = exampleUsage(b.build);
    await withUsage(page, u);
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('report')).toHaveAttribute('data-complete', 'true', { timeout: 8000 });
    await expect(page.getByTestId('report-reached')).toHaveText('10 / 10');
    await expect(page.getByTestId('report-complete')).toHaveText('ja');
    const own = Object.values(b.build).filter((x: any) => x.inLevel === undefined) as any[];
    await expect(page.getByTestId('report-build-time')).toHaveText(build(own.reduce((s, x) => s + x.buildS, 0)));
    await expect(page.getByTestId('report-p95')).toHaveText(`${b.loadtest.p95Ms} ms`);
    await expect(page.getByTestId('report-image-frontend')).toHaveText(`${comma(b.images.frontendMB)} MB`);
    for (const job of ['check', 'images', 'deploy']) await expect(page.getByTestId(`report-job-${job}`)).toHaveText(`${b.pipeline.jobs[job]} s`);
    await expect(page.getByTestId('report-pipeline-link')).toHaveAttribute('href', b.pipeline.url);
    for (let n = 1; n <= 10; n++) {
      const x = b.build[n];
      const card = page.locator(`[data-testid="level-card"][data-level="${n}"]`);
      await expect(card.getByTestId('level-build-time')).toHaveText(x.inLevel ? inL(x.inLevel) : build(x.buildS));
    }
    // Verbrauch: Summen in der Kachel Tokens, pro Level Kosten und Tokens (Ausgabe) in der Liste
    await expect(page.getByTestId('report-harness')).toHaveText('claude');
    await expect(page.getByTestId('report-model')).toHaveText('claude-haiku-5-5');
    await expect(page.getByTestId('report-tokens-output')).toHaveText(thousands(u.total.output));
    await expect(page.getByTestId('report-tokens-total')).toHaveText(thousands(u.total.total));
    await expect(page.getByTestId('report-cost')).toHaveText(usd(u.total.costUsd));
    for (let n = 1; n <= 10; n++) {
      const e = u.levels[n] as any;
      const row = page.locator(`[data-testid="report-level"][data-level="${n}"]`);
      await expect(row.getByTestId('report-level-cost')).toHaveText(e.inLevel ? inL(e.inLevel) : usd(e.costUsd));
      await expect(row.getByTestId('report-level-output')).toHaveText(e.inLevel ? inL(e.inLevel) : thousands(e.output));
    }
  });

  test('Teilbericht zeigt fehlende Teile', async ({ page }) => {
    const b = JSON.parse(fs.readFileSync(path.join(OUT, 'bericht.json'), 'utf8'));

    await withLevels(page, (n) =>
      n <= 2
        ? { status: 'bestanden', checkedAt: new Date().toISOString(), metrics: { build: { passedAt: new Date().toISOString(), buildS: 42 } } }
        : { status: 'offen', checkedAt: null, durationMs: null, checks: [], metrics: {} },
    );
    await withUsage(page, {});
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('report')).toHaveAttribute('data-state', 'ready', { timeout: 8000 });
    await expect(page.getByTestId('report-reached')).toHaveText('2 / 10');
    await expect(page.getByTestId('report-complete')).toHaveText('nein');
    for (const part of ['pipeline', 'images', 'loadtest']) await expect(page.getByTestId(`report-${part}-missing`)).toHaveText('noch nicht erreicht');
    await expect(page.getByTestId('report-build-time')).toHaveText(build(84));
    // Ohne nachgetragenen Verbrauch: Hinweis in der Kachel, „–“ in der Liste
    await expect(page.getByTestId('report-tokens-missing')).toHaveText('wird nach der Prüfung ergänzt');
    await expect(page.getByTestId('report-level-cost')).toHaveText(Array(10).fill('–'));
    await expect(page.getByTestId('report-level-output')).toHaveText(Array(10).fill('–'));
  });

  test('Verbrauch wird gespeichert und gelesen', async () => {
    const api = await playwrightRequest.newContext({ baseURL: API });
    const before = await (await api.get('/api/usage')).json();
    try {
      const u = exampleUsage({});
      const put = await api.put('/api/usage', { data: u });
      expect(put.status()).toBe(200);
      expect(await put.json()).toEqual(u);
      expect(await (await api.get('/api/usage')).json()).toEqual(u);
      // Fehlerfälle ändern nichts
      const raw = (body: string, type = 'application/json') => api.put('/api/usage', { data: body, headers: { 'Content-Type': type } });
      expect((await raw('[1,2]')).status()).toBe(400);
      expect((await raw('{"a":')).status()).toBe(400);
      expect((await raw('{}', 'text/plain')).status()).toBe(415);
      expect((await raw(JSON.stringify({ a: 'x'.repeat(70 * 1024) }))).status()).toBe(413);
      const post = await api.post('/api/usage', { data: {} });
      expect(post.status()).toBe(405);
      expect(post.headers()['allow']).toContain('PUT');
      expect(await (await api.get('/api/usage')).json()).toEqual(u);
      // {} leert den Verbrauch
      expect((await api.put('/api/usage', { data: {} })).status()).toBe(200);
      expect(await (await api.get('/api/usage')).json()).toEqual({});
    } finally {
      await api.put('/api/usage', { data: before });
      await api.dispose();
    }
  });
});
