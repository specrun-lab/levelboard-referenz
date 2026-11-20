import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Jeder Test = ein Check von Level 7 (Images in der Pipeline). Fragt GitHub und die GHCR ab.
const REPO = process.env.GITHUB_REPO ?? `specrun-lab/levelboard-${process.env.RUN_ID ?? 'lokal'}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8', timeout: 60_000 });
const ghJson = (endpoint: string) => JSON.parse(gh(['api', endpoint]));
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();

function runForHead() {
  return ghJson(`repos/${REPO}/actions/workflows/ci.yml/runs?branch=main&head_sha=${head()}&per_page=1`).workflow_runs[0];
}

/** Prüft ohne Anmeldung, ob ghcr.io/<name>:<tag> öffentlich abrufbar ist. */
async function publicManifestExists(name: string, tag: string): Promise<boolean> {
  const tokenRes = await fetch(`https://ghcr.io/token?scope=repository:${name}:pull`);
  if (!tokenRes.ok) return false;
  const { token } = (await tokenRes.json()) as { token: string };
  const res = await fetch(`https://ghcr.io/v2/${name}/manifests/${tag}`, {
    method: 'HEAD',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json',
    },
  });
  return res.ok;
}

test.describe.configure({ mode: 'serial' });

test.describe('level-7', () => {
  test.setTimeout(120_000);

  test('Job images des letzten Laufs ist grün', async () => {
    const run = runForHead();
    expect(run, 'kein Lauf von CI für den aktuellen Commit').toBeTruthy();
    const jobs = ghJson(`repos/${REPO}/actions/runs/${run.id}/jobs`).jobs as { name: string; conclusion: string }[];
    expect(jobs.find((j) => j.name === 'images')?.conclusion).toBe('success');
  });

  test('Beide Images liegen öffentlich in der GHCR', async () => {
    const sha = head();
    for (const part of ['frontend', 'backend']) {
      expect(await publicManifestExists(`${REPO}-${part}`, sha), `${REPO}-${part}:${sha}`).toBe(true);
    }
  });

  test('Report der Container-Suite enthält nur bestandene Checks', async () => {
    const run = runForHead();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'levelboard-container-'));
    gh(['run', 'download', String(run.id), '--repo', REPO, '--name', 'levelboard-container-report', '--dir', dir]);
    const file = ['playwright.json', 'checks/.out/playwright.json', '.out/playwright.json'].map((f) => path.join(dir, f)).find((f) => fs.existsSync(f));
    expect(file, 'playwright.json fehlt im Artefakt').toBeTruthy();
    const report = JSON.parse(fs.readFileSync(file!, 'utf8'));
    const specs: { title: string; ok: boolean }[] = [];
    const walk = (s: { suites?: unknown[]; specs?: { title: string; ok: boolean }[] }) => {
      (s.suites ?? []).forEach((x) => walk(x as typeof s));
      specs.push(...(s.specs ?? []));
    };
    report.suites.forEach(walk);
    expect(specs.length).toBeGreaterThanOrEqual(6);
    expect(specs.filter((s) => !s.ok).map((s) => s.title)).toEqual([]);
  });
});
