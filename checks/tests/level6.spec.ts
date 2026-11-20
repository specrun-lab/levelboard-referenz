import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Jeder Test = ein Check von Level 6 (Repo + CI). Fragt GitHub über die CLI `gh` ab (Token aus GH_TOKEN).
const REPO = process.env.GITHUB_REPO ?? `specrun-lab/levelboard-${process.env.RUN_ID ?? 'lokal'}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEVEL_COUNT_IN_CI = 5;

const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8', timeout: 60_000 });
const ghJson = (endpoint: string) => JSON.parse(gh(['api', endpoint]));
const git = (args: string[]) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

function latestRunForHead() {
  const head = git(['rev-parse', 'HEAD']);
  const runs = ghJson(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&head_sha=${head}&per_page=1`).workflow_runs;
  return runs[0];
}

test.describe.configure({ mode: 'serial' });

test.describe('level-6', () => {
  test.setTimeout(120_000);

  test('Repo existiert und ist öffentlich', async () => {
    const repo = ghJson(`repos/${REPO}`);
    expect(repo.full_name).toBe(REPO);
    expect(repo.visibility).toBe('public');
    expect(repo.default_branch).toBe('main');
  });

  test('Lokaler Stand ist gepusht', async () => {
    expect(git(['status', '--porcelain'])).toBe('');
    const head = git(['rev-parse', 'HEAD']);
    expect(ghJson(`repos/${REPO}/branches/main`).commit.sha).toBe(head);
  });

  test('Letzter Pipeline-Lauf ist grün', async () => {
    const run = latestRunForHead();
    expect(run, 'kein Lauf von CI für den aktuellen Commit').toBeTruthy();
    expect(run.status).toBe('completed');
    expect(run.conclusion).toBe('success');
  });

  test('Report enthält Level 1–5 bestanden', async () => {
    const run = latestRunForHead();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'levelboard-report-'));
    gh(['run', 'download', String(run.id), '--repo', REPO, '--name', 'levelboard-report', '--dir', dir]);
    const file = ['results.json', 'frontend/dist/results.json'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
    expect(file, 'results.json fehlt im Artefakt').toBeTruthy();
    const results = JSON.parse(fs.readFileSync(file!, 'utf8'));
    for (let n = 1; n <= LEVEL_COUNT_IN_CI; n++) {
      expect(results.levels[n - 1].status, `Level ${n}`).toBe('bestanden');
      expect(results.levels[n - 1].checks.length, `Level ${n}: Checks`).toBeGreaterThan(0);
    }
  });
});
