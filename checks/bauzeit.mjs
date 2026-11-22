// Bauzeit pro Level (ab Spec 2.0.0): unabhängig vom Agent-Harness, aus den eigenen make check.
// Datei: bauzeit.json im Projektordner (nicht in git, übersteht make down und make levelN).
//   { "start": "<ISO>", "levels": { "1": { "passedAt": "<ISO>", "buildS": 452 }, "3": { "passedAt": "<ISO>", "inLevel": 5 } } }
// Ein Eintrag entsteht, wenn make check ein Level erstmals bestanden meldet, und wird danach nie mehr geändert.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../bauzeit.json');

export function readBauzeit() {
  try {
    const d = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return { start: typeof d.start === 'string' ? d.start : null, levels: d.levels && typeof d.levels === 'object' ? d.levels : {} };
  } catch {
    return { start: null, levels: {} };
  }
}

/**
 * Trägt neu bestandene Levels ein. current: Status je geprüftem Level dieses Laufs, aufsteigend.
 * Mit frozen (BAUZEIT_FEST=1, z. B. beim Prüfer) wird nichts eingetragen, nur gelesen.
 */
export function updateBauzeit(current, now = new Date(), frozen = process.env.BAUZEIT_FEST === '1') {
  const data = readBauzeit();
  if (frozen) return data;
  if (!data.start) data.start = now.toISOString();
  let reached = 0;
  for (const l of current) {
    if (l.status !== 'bestanden') break;
    reached = l.level;
  }
  let best = 0;
  while (data.levels[best + 1]) best++;
  if (reached > best) {
    const prev = best > 0 ? data.levels[best].passedAt : data.start;
    const passedAt = now.toISOString();
    data.levels[reached] = { passedAt, buildS: Math.max(0, Math.round((now - Date.parse(prev)) / 1000)) };
    for (let n = best + 1; n < reached; n++) data.levels[n] = { passedAt, inLevel: reached };
  }
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  return data;
}
