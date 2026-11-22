// Überträgt das Ergebnis der Playwright-Suite in den ausgelieferten Build (frontend/dist/results.json).
// Die Quelle frontend/public/results.json bleibt unverändert („alles offen“),
// damit jeder Neustart (make levelN) wieder bei null beginnt.
// Aufruf: node write-results.mjs <level> [<level> …]   z. B. node write-results.mjs 1 2
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { updateBauzeit } from './bauzeit.mjs';
import { imageSizeMB, pipelineOf } from './collect-report.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const levels = process.argv.slice(2).map(Number).sort((a, b) => a - b);
if (levels.length === 0) throw new Error('Mindestens ein Level angeben');
const target = path.join(here, '../frontend/dist/results.json');

// Checks und Dauer je Level aus dem Playwright-Report sammeln (describe-Gruppe „level-<n>“)
const report = JSON.parse(fs.readFileSync(path.join(here, '.out/playwright.json'), 'utf8'));
const byLevel = new Map(levels.map((n) => [n, { checks: [], durationMs: 0 }]));
const walk = (suite) => {
  for (const s of suite.suites ?? []) walk(s);
  const n = Number(/^level-(\d+)$/.exec(suite.title ?? '')?.[1]);
  if (!byLevel.has(n)) return;
  for (const spec of suite.specs ?? []) {
    const entry = byLevel.get(n);
    // Nur ein Test, der wirklich gelaufen und bestanden ist, zählt: Playwright meldet übersprungene Tests mit ok: true
    const ran = (spec.tests ?? []).length > 0 && spec.tests.every((t) => t.status === 'expected' || t.status === 'flaky');
    entry.checks.push({ name: spec.title, ok: spec.ok && ran });
    entry.durationMs += (spec.tests ?? []).flatMap((t) => t.results ?? []).reduce((s, r) => s + (r.duration ?? 0), 0);
  }
};
report.suites.forEach(walk);
for (const [n, e] of byLevel) if (e.checks.length === 0) throw new Error(`Keine Checks für Level ${n} gefunden`);


const now = new Date().toISOString();
const results = JSON.parse(fs.readFileSync(target, 'utf8'));
results.run.updatedAt = now;
if (process.env.RUN_ID) results.run.id = process.env.RUN_ID;

// Levels aufsteigend: Nach dem ersten Fehler ist alles Höhere gesperrt.
let failedAt = null;
for (const l of results.levels) {
  const e = byLevel.get(l.level);
  if (failedAt === null && e) {
    const passed = e.checks.every((c) => c.ok);
    Object.assign(l, { status: passed ? 'bestanden' : 'fehlgeschlagen', checkedAt: now, durationMs: Math.round(e.durationMs), checks: e.checks, metrics: {} });
    if (!passed) failedAt = l.level;
  } else if (l.level > Math.min(...levels)) {
    Object.assign(l, { status: failedAt !== null ? 'gesperrt' : 'offen', checkedAt: null, durationMs: null, checks: [], metrics: {} });
  }
}

// Kennzahlen bei ihrem Level (spec/05-datenmodell.md): build (Bauzeit) bei jedem Level mit Eintrag in bauzeit.json,
// pipeline bei Level 6, images bei Level 7, loadtest bei Level 9 (jeweils nur, wenn bestanden)
const current = results.levels.filter((l) => byLevel.has(l.level)).map((l) => ({ level: l.level, status: l.status }));
const bauzeit = updateBauzeit(current);
const repo = process.env.GITHUB_REPO ?? `specrun-lab/levelboard-${process.env.RUN_ID ?? 'lokal'}`;
const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.join(here, '..'), encoding: 'utf8' }).trim();
const readOut = (f) => { try { return JSON.parse(fs.readFileSync(path.join(here, '.out', f), 'utf8')); } catch { return null; } };
for (const l of results.levels) {
  if (!byLevel.has(l.level) || (l.status !== 'bestanden' && l.status !== 'fehlgeschlagen')) continue;
  const m = {};
  if (bauzeit.levels[l.level]) m.build = bauzeit.levels[l.level];
  if (l.status === 'bestanden') {
    try {
      if (l.level === 6) m.pipeline = pipelineOf(repo, head());
      if (l.level === 7) m.images = { frontendMB: await imageSizeMB(`${repo}-frontend`, head()), backendMB: await imageSizeMB(`${repo}-backend`, head()) };
    } catch (err) { console.log(`Kennzahlen für Level ${l.level} nicht ermittelbar: ${err.message}`); }
    if (l.level === 9 && readOut('loadtest.json')) m.loadtest = readOut('loadtest.json');
  }
  l.metrics = m;
}

fs.writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
for (const n of levels) {
  const l = results.levels[n - 1];
  const ok = l.checks.filter((c) => c.ok).length;
  console.log(`Level ${n}: ${l.status}${l.checks.length ? ` (${ok}/${l.checks.length} Checks)` : ''}`);
}

// Meldet die geprüften Levels aufsteigend an ein Backend; hört nach dem ersten Fehlschlag auf.
async function sendResults(base, label) {
  for (const n of levels) {
    const e = byLevel.get(n);
    const res = await fetch(`${base}/api/levels/${n}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checks: e.checks, durationMs: Math.round(e.durationMs), metrics: results.levels[n - 1].metrics }),
    }).catch((err) => ({ ok: false, status: 0, text: async () => String(err) }));
    if (!res.ok) {
      console.log(`Meldung an ${label} für Level ${n} fehlgeschlagen: ${res.status} ${await res.text()}`);
      return false;
    }
    console.log(`Level ${n} an ${label} gemeldet`);
    if (!e.checks.every((c) => c.ok)) break;
  }
  return true;
}

// Ab Level 5 (REPORT_API=1): ans lokale Backend; ab Level 9 (REPORT_LIVE=1) zusätzlich an die Live-API.
let apiOk = true;
if (process.env.REPORT_API === '1') apiOk = await sendResults(process.env.API_URL ?? 'http://127.0.0.1:8081', 'das Backend');
if (process.env.REPORT_LIVE === '1') apiOk = (await sendResults(process.env.LIVE_URL ?? '', 'die Live-API')) && apiOk;
process.exit(failedAt === null && apiOk ? 0 : 1);
