import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { imageSizeMB, pipelineOf } from '../collect-report.mjs';
import { levelTokens } from '../collect-tokens.mjs';

// Jeder Test = ein Check von Level 10 (Bericht vollständig und live).
// Test 1 sammelt alle Teile des Berichts nach .out/bericht.json; Tests 2 und 3 prüfen die Darstellung auf der
// Live-Seite mit ersetzter API-Antwort. Die echte Meldung kommt danach; make check prüft sie mit tests/live-report.spec.ts.
const REPO = process.env.GITHUB_REPO ?? `specrun-lab/levelboard-${process.env.RUN_ID ?? 'lokal'}`;
const LIVE = process.env.LIVE_URL ?? '';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.resolve(HERE, '../.out');
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const comma = (n: number, digits = 1) => n.toFixed(digits).replace('.', ',');
const thousands = (n: number) => n.toLocaleString('de-CH');
const ALL_PASSED = Array.from({ length: 10 }, (_, i) => ({ level: i + 1, status: 'bestanden' }));

/** Ersetzt im Browser die Antwort von /api/levels: Jedes Level bekommt die angegebenen Felder. */
async function withLevels(page: Page, patch: (level: number) => Record<string, unknown>) {
  await page.route('**/api/levels', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.levels = body.levels.map((l: { level: number }) => ({ ...l, ...patch(l.level) }));
    await route.fulfill({ response: res, json: body });
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('level-10', () => {
  test.setTimeout(120_000);

  test('Alle Teile des Berichts sind vorhanden', async () => {
    const sha = head();
    const pipeline = pipelineOf(REPO, sha);
    const images = { frontendMB: await imageSizeMB(`${REPO}-frontend`, sha), backendMB: await imageSizeMB(`${REPO}-backend`, sha) };
    const loadtest = JSON.parse(fs.readFileSync(path.join(OUT, 'loadtest.json'), 'utf8'));
    const tokens = Object.fromEntries(levelTokens(ALL_PASSED));
    fs.writeFileSync(path.join(OUT, 'bericht.json'), JSON.stringify({ pipeline, images, loadtest, tokens }, null, 2) + '\n');
    for (const job of ['check', 'images', 'deploy']) expect(pipeline.jobs[job], `Job ${job}`).toBeGreaterThan(0);
    expect(images.frontendMB).toBeGreaterThan(0);
    expect(images.backendMB).toBeGreaterThan(0);
    expect(loadtest.requests).toBeGreaterThan(0);
    expect(Object.keys(tokens)).toHaveLength(10);
  });

  test('Vollständiger Bericht wird dargestellt', async ({ page }) => {
    const b = JSON.parse(fs.readFileSync(path.join(OUT, 'bericht.json'), 'utf8'));
    const extra: Record<number, Record<string, unknown>> = { 6: { pipeline: b.pipeline }, 7: { images: b.images }, 9: { loadtest: b.loadtest } };
    await withLevels(page, (n) => ({ status: 'bestanden', checkedAt: new Date().toISOString(), metrics: { tokens: b.tokens[n], ...(extra[n] ?? {}) } }));
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('report')).toHaveAttribute('data-complete', 'true', { timeout: 8000 });
    await expect(page.getByTestId('report-reached')).toHaveText('10 / 10');
    await expect(page.getByTestId('report-complete')).toHaveText('ja');
    const phases = Object.values(b.tokens).filter((t: any) => t.inLevel === undefined) as any[];
    const cost = Math.round(phases.reduce((s, t) => s + t.costUsd, 0) * 100) / 100;
    await expect(page.getByTestId('report-cost')).toHaveText(`${comma(cost, 2)} USD`);
    await expect(page.getByTestId('report-tokens-output')).toHaveText(thousands(phases.reduce((s, t) => s + t.output, 0)));
    await expect(page.getByTestId('report-p95')).toHaveText(`${b.loadtest.p95Ms} ms`);
    await expect(page.getByTestId('report-image-frontend')).toHaveText(`${comma(b.images.frontendMB)} MB`);
    for (const job of ['check', 'images', 'deploy']) await expect(page.getByTestId(`report-job-${job}`)).toHaveText(`${b.pipeline.jobs[job]} s`);
    await expect(page.getByTestId('report-pipeline-link')).toHaveAttribute('href', b.pipeline.url);
    for (let n = 1; n <= 10; n++) {
      const t = b.tokens[n];
      const card = page.locator(`[data-testid="level-card"][data-level="${n}"]`);
      await expect(card.getByTestId('level-cost')).toHaveText(t.inLevel ? `in L${String(t.inLevel).padStart(2, '0')}` : `${comma(t.costUsd, 2)} USD`);
      await expect(card.getByTestId('level-output')).toHaveText(t.inLevel ? '–' : thousands(t.output));
    }
  });

  test('Teilbericht zeigt fehlende Teile', async ({ page }) => {
    const b = JSON.parse(fs.readFileSync(path.join(OUT, 'bericht.json'), 'utf8'));
    const phase = Object.values(b.tokens).find((t: any) => t.inLevel === undefined);
    await withLevels(page, (n) =>
      n <= 2
        ? { status: 'bestanden', checkedAt: new Date().toISOString(), metrics: { tokens: phase } }
        : { status: 'offen', checkedAt: null, durationMs: null, checks: [], metrics: {} },
    );
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('report')).toHaveAttribute('data-state', 'ready', { timeout: 8000 });
    await expect(page.getByTestId('report-reached')).toHaveText('2 / 10');
    await expect(page.getByTestId('report-complete')).toHaveText('nein');
    for (const part of ['pipeline', 'images', 'loadtest']) await expect(page.getByTestId(`report-${part}-missing`)).toHaveText('noch nicht erreicht');
    await expect(page.getByTestId('report-tokens-missing')).toHaveCount(0);
  });
});
