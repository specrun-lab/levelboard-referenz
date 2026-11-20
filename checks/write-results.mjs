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
    entry.checks.push({ name: spec.title, ok: spec.ok });
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
    Object.assign(l, { status: passed ? 'bestanden' : 'fehlgeschlagen', checkedAt: now, durationMs: Math.round(e.durationMs), checks: e.checks });
    if (!passed) failedAt = l.level;
  } else if (l.level > Math.min(...levels)) {
    Object.assign(l, { status: failedAt !== null ? 'gesperrt' : 'offen', checkedAt: null, durationMs: null, checks: [] });
  }
}

fs.writeFileSync(target, JSON.stringify(results, null, 2) + '\n');
for (const n of levels) {
  const l = results.levels[n - 1];
  const ok = l.checks.filter((c) => c.ok).length;
  console.log(`Level ${n}: ${l.status}${l.checks.length ? ` (${ok}/${l.checks.length} Checks)` : ''}`);
}

// Ab Level 5 (REPORT_API=1): jedes geprüfte Level aufsteigend ans Backend melden, nach dem ersten Fehlschlag aufhören.
let apiOk = true;
if (process.env.REPORT_API === '1') {
  const api = process.env.API_URL ?? 'http://127.0.0.1:8081';
  for (const n of levels) {
    const e = byLevel.get(n);
    const res = await fetch(`${api}/api/levels/${n}/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checks: e.checks, durationMs: Math.round(e.durationMs) }),
    }).catch((err) => ({ ok: false, status: 0, text: async () => String(err) }));
    if (!res.ok) {
      console.log(`Meldung an das Backend für Level ${n} fehlgeschlagen: ${res.status} ${await res.text()}`);
      apiOk = false;
      break;
    }
    console.log(`Level ${n} an das Backend gemeldet`);
    if (!e.checks.every((c) => c.ok)) break;
  }
}
process.exit(failedAt === null && apiOk ? 0 : 1);
