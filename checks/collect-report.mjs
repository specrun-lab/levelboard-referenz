// Kennzahlen für Level 6 (Pipeline-Dauer) und Level 7 (Image-Größen), genutzt von write-results.mjs.
// Als Modul: import { pipelineOf, imageSizeMB } from './collect-report.mjs'
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const gh = (endpoint) => JSON.parse(execFileSync('gh', ['api', endpoint], { encoding: 'utf8', timeout: 60_000 }));
const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');
const secondsBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 1000);

/** Komprimierte Größe eines Images (linux/amd64) in MB = Summe der Layer-Größen / 1024 / 1024, 1 Nachkommastelle. */
export async function imageSizeMB(name, tag) {
  const { token } = await (await fetch(`https://ghcr.io/token?scope=repository:${name}:pull`)).json();
  const get = async (ref) => {
    const res = await fetch(`https://ghcr.io/v2/${name}/manifests/${ref}`, { headers: { Authorization: `Bearer ${token}`, Accept: ACCEPT } });
    if (!res.ok) throw new Error(`Manifest ${name}:${ref} → ${res.status}`);
    return res.json();
  };
  let manifest = await get(tag);
  if (manifest.manifests) {
    const amd64 = manifest.manifests.find((m) => m.platform?.os === 'linux' && m.platform?.architecture === 'amd64');
    if (!amd64) throw new Error(`${name}:${tag} ohne linux/amd64`);
    manifest = await get(amd64.digest);
  }
  const bytes = manifest.layers.reduce((sum, l) => sum + l.size, 0);
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

/** Pipeline-Lauf von CI für den Commit: Dauer je abgeschlossenem Job und gesamt (in Sekunden). */
export function pipelineOf(repo, sha) {
  const run = gh(`repos/${repo}/actions/workflows/ci.yml/runs?branch=main&head_sha=${sha}&per_page=1`).workflow_runs[0];
  if (!run) throw new Error(`kein Lauf von CI für ${sha}`);
  const jobs = gh(`repos/${repo}/actions/runs/${run.id}/jobs`).jobs.filter((j) => j.started_at && j.completed_at);
  const duration = Object.fromEntries(jobs.map((j) => [j.name, secondsBetween(j.started_at, j.completed_at)]));
  const lastEnd = jobs.map((j) => j.completed_at).sort().at(-1);
  return { runId: run.id, url: run.html_url, jobs: duration, totalS: lastEnd ? secondsBetween(run.run_started_at, lastEnd) : 0 };
}
