// Überträgt das Ergebnis der Playwright-Suite in den ausgelieferten Build (frontend/dist/results.json).
// Die Quelle frontend/public/results.json bleibt unverändert („alles offen“),
// damit jeder Neustart (make levelN) wieder bei null beginnt.
// Aufruf: node write-results.mjs <level> [<level> …]   z. B. node write-results.mjs 1 2
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

// metrics: Level 9 = Lasttest (tests/level9.spec.ts), Level 10 = Kennzahlen des Abschlussberichts (tests/level10.spec.ts)
const METRICS_FILES = { 9: '.out/loadtest.json', 10: '.out/report.json' };
const metricsOf = (n) => {
  if (!METRICS_FILES[n]) return {};
  try { return JSON.parse(fs.readFileSync(path.join(here, METRICS_FILES[n]), 'utf8')); } catch { return {}; }
};

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
    Object.assign(l, { status: passed ? 'bestanden' : 'fehlgeschlagen', checkedAt: now, durationMs: Math.round(e.durationMs), checks: e.checks, metrics: metricsOf(l.level) });
    if (!passed) failedAt = l.level;
  } else if (l.level > Math.min(...levels)) {
    Object.assign(l, { status: failedAt !== null ? 'gesperrt' : 'offen', checkedAt: null, durationMs: null, checks: [], metrics: {} });
  }
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
      body: JSON.stringify({ checks: e.checks, durationMs: Math.round(e.durationMs), metrics: metricsOf(n) }),
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
