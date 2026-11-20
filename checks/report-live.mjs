// Meldet die Ergebnisse aus einer results.json an eine (Live-)API: Level aufsteigend, Ende beim ersten
// Level, das nicht bestanden oder nicht geprüft ist. Läuft im Job „deploy“ nach dem Deployment (Level 8).
// Aufruf: node report-live.mjs <results.json> <basis-url>   z. B. node report-live.mjs results.json https://lauf-008.1-2-3-4.sslip.io
import fs from 'node:fs';

const [file, base] = process.argv.slice(2);
if (!file || !base) {
  console.error('Aufruf: node report-live.mjs <results.json> <basis-url>');
  process.exit(2);
}
const results = JSON.parse(fs.readFileSync(file, 'utf8'));
let reported = 0;
for (const l of results.levels) {
  if (!['bestanden', 'fehlgeschlagen'].includes(l.status) || l.checks.length === 0) break;
  const res = await fetch(`${base}/api/levels/${l.level}/result`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ checks: l.checks, durationMs: l.durationMs ?? 0 }),
  });
  if (!res.ok) {
    console.error(`Level ${l.level}: Meldung abgelehnt (${res.status} ${await res.text()})`);
    process.exit(1);
  }
  console.log(`Level ${l.level} gemeldet (${l.status})`);
  reported++;
  if (l.status !== 'bestanden') break;
}
if (reported === 0) {
  console.error('Keine geprüften Levels in der Datei');
  process.exit(1);
}
