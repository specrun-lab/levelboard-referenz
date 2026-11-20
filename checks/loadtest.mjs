// Lasttest (Level 9): feste Anzahl paralleler Verbindungen über eine feste Dauer, nur mit fetch von Node.
// Aufruf: node loadtest.mjs <basis-url>   → Ergebnis als JSON auf stdout
// Als Modul: import { loadtest } from './loadtest.mjs'
import { pathToFileURL } from 'node:url';

export const CONNECTIONS = 10;
export const DURATION_MS = 30_000;
export const PATHS = ['/', '/api/levels'];
const REQUEST_TIMEOUT_MS = 10_000;

/** Wert an der Stelle p (0–100) nach dem Nearest-Rank-Verfahren, sortiert aufsteigend. */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export async function loadtest(base, { connections = CONNECTIONS, durationMs = DURATION_MS } = {}) {
  const times = [];
  let errors = 0;
  const start = performance.now();
  const deadline = start + durationMs;

  // Jede Verbindung fragt abwechselnd PATHS[0], PATHS[1], … ab, bis die Zeit um ist.
  const worker = async () => {
    for (let i = 0; performance.now() < deadline; i++) {
      const t0 = performance.now();
      try {
        const res = await fetch(base + PATHS[i % PATHS.length], { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
        await res.arrayBuffer();
        if (res.status !== 200) errors++;
      } catch {
        errors++;
      }
      times.push(performance.now() - t0);
    }
  };
  await Promise.all(Array.from({ length: connections }, worker));

  const elapsedS = (performance.now() - start) / 1000;
  const sorted = [...times].sort((a, b) => a - b);
  return {
    connections,
    durationS: durationMs / 1000,
    requests: times.length,
    errors,
    rps: Math.round((times.length / elapsedS) * 10) / 10,
    p50Ms: Math.round(percentile(sorted, 50)),
    p95Ms: Math.round(percentile(sorted, 95)),
    maxMs: Math.round(sorted.at(-1) ?? 0),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const base = process.argv[2];
  if (!base) {
    console.error('Aufruf: node loadtest.mjs <basis-url>');
    process.exit(2);
  }
  console.log(JSON.stringify(await loadtest(base.replace(/\/$/, '')), null, 2));
}
