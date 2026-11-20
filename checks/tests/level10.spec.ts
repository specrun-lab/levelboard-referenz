import { test, expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectReport } from '../collect-report.mjs';

// Jeder Test = ein Check von Level 10 (Metriken veröffentlicht).
// Test 1 sammelt die Kennzahlen nach .out/report.json; write-results.mjs meldet sie als metrics von Level 10.
// Tests 2 und 3 prüfen die Darstellung auf der Live-Seite mit ersetzter API-Antwort (die echte Meldung kommt erst danach;
// make check prüft sie zum Schluss mit tests/live-report.spec.ts).
const REPO = process.env.GITHUB_REPO ?? `specrun-lab/levelboard-${process.env.RUN_ID ?? 'lokal'}`;
const LIVE = process.env.LIVE_URL ?? '';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const OUT = path.resolve(HERE, '../.out');
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const comma = (n: number) => n.toFixed(1).replace('.', ',');

/** Ersetzt im Browser die Antwort von /api/levels: Level 10 bekommt Status und metrics wie angegeben. */
async function withLevel10(page: Page, level10: Record<string, unknown>) {
  await page.route('**/api/levels', async (route) => {
    const res = await route.fetch();
    const body = await res.json();
    body.levels[9] = { ...body.levels[9], ...level10 };
    await route.fulfill({ response: res, json: body });
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('level-10', () => {
  test.setTimeout(120_000);

  test('Kennzahlen für den Bericht gesammelt', async () => {
    const report = await collectReport({ repo: REPO, sha: head(), loadtestFile: path.join(OUT, 'loadtest.json') });
    fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    const { pipeline, images, loadtest } = report;
    expect(pipeline.url).toContain(`/${REPO}/actions/runs/${pipeline.runId}`);
    for (const s of Object.values(pipeline.jobs)) expect(s).toBeGreaterThan(0);
    expect(pipeline.totalS).toBeGreaterThanOrEqual(Math.max(...Object.values(pipeline.jobs)));
    expect(images.frontendMB).toBeGreaterThan(0);
    expect(images.backendMB).toBeGreaterThan(0);
    expect(loadtest.requests).toBeGreaterThan(0);
  });

  test('Abschlussbericht wird dargestellt', async ({ page }) => {
    const r = JSON.parse(fs.readFileSync(path.join(OUT, 'report.json'), 'utf8'));
    await withLevel10(page, { status: 'bestanden', checkedAt: new Date().toISOString(), metrics: r });
    await page.goto(`${LIVE}/`);
    const report = page.getByTestId('report');
    await expect(report).toHaveAttribute('data-state', 'ready', { timeout: 8000 });
    await expect(page.getByTestId('report-p50')).toHaveText(`${r.loadtest.p50Ms} ms`);
    await expect(page.getByTestId('report-p95')).toHaveText(`${r.loadtest.p95Ms} ms`);
    await expect(page.getByTestId('report-rps')).toHaveText(`${comma(r.loadtest.rps)} Anfragen/s`);
    await expect(page.getByTestId('report-errors')).toHaveText(String(r.loadtest.errors));
    await expect(page.getByTestId('report-image-frontend')).toHaveText(`${comma(r.images.frontendMB)} MB`);
    await expect(page.getByTestId('report-image-backend')).toHaveText(`${comma(r.images.backendMB)} MB`);
    for (const job of ['check', 'images', 'deploy']) await expect(page.getByTestId(`report-job-${job}`)).toHaveText(`${r.pipeline.jobs[job]} s`);
    await expect(page.getByTestId('report-pipeline-total')).toHaveText(`${r.pipeline.totalS} s`);
    await expect(page.getByTestId('report-pipeline-link')).toHaveAttribute('href', r.pipeline.url);
    await expect(page.getByTestId('report-level')).toHaveCount(10);
  });

  test('Ohne Level 10 erscheint der Hinweis', async ({ page }) => {
    await withLevel10(page, { status: 'offen', checkedAt: null, durationMs: null, checks: [], metrics: {} });
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('report')).toHaveAttribute('data-state', 'empty', { timeout: 8000 });
    await expect(page.getByTestId('report-empty')).toHaveText('Noch kein Abschlussbericht – er erscheint, sobald Level 10 gemeldet ist.');
  });
});
