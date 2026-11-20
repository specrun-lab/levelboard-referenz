import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Jeder Test = ein Check von Level 8 (Deployment). Fragt GitHub und die Live-Seite auf dem Server ab.
// LIVE_URL = https://<RUN_ID>.<LIVE_DOMAIN> (setzt das Makefile).
const REPO = process.env.GITHUB_REPO ?? `specrun-lab/levelboard-${process.env.RUN_ID ?? 'lokal'}`;
const LIVE = process.env.LIVE_URL ?? '';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8', timeout: 60_000 });
const ghJson = (endpoint: string) => JSON.parse(gh(['api', endpoint]));
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

test.describe.configure({ mode: 'serial' });

test.describe('level-8', () => {
  test.setTimeout(120_000);

  test('Job deploy des letzten Laufs ist grün', async () => {
    const run = ghJson(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&head_sha=${head()}&per_page=1`).workflow_runs[0];
    expect(run, 'kein Lauf von CI für den aktuellen Commit').toBeTruthy();
    const jobs = ghJson(`repos/${REPO}/actions/runs/${run.id}/jobs`).jobs as { name: string; conclusion: string }[];
    expect(jobs.find((j) => j.name === 'deploy')?.conclusion).toBe('success');
  });

  test('Live-Seite antwortet über HTTPS', async ({ page, request }) => {
    expect(LIVE, 'LIVE_URL').toMatch(/^https:\/\/[a-z0-9-]+\.[a-z0-9.-]+[a-z0-9]$/);
    const res = await request.get(`${LIVE}/`);
    expect(res.status()).toBe(200);
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('board')).toHaveAttribute('data-state', 'ok');
    await expect(page.getByTestId('run-source')).toHaveAttribute('data-source', 'api');
  });

  test('Live-Seite meldet den aktuellen Commit', async ({ page, request }) => {
    const sha = head();
    const health = await request.get(`${LIVE}/api/health`);
    expect(health.status()).toBe(200);
    expect((await health.json()).commit).toBe(sha);
    await page.goto(`${LIVE}/`);
    await expect(page.getByTestId('run-commit')).toHaveText(sha.slice(0, 7));
  });

  test('Live-Seite zeigt die Ergebnisse der Pipeline', async ({ request }) => {
    const body = await (await request.get(`${LIVE}/api/levels`)).json();
    expect(body.run.id).toBe(process.env.RUN_ID ?? 'lokal');
    for (let n = 1; n <= 5; n++) expect(body.levels[n - 1].status, `Level ${n}`).toBe('bestanden');
  });
});
