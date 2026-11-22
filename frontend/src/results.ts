// Datenmodell und Auswertung von results.json (= Format der späteren Antwort von GET /api/levels).

export type LevelStatus = 'offen' | 'bestanden' | 'fehlgeschlagen' | 'gesperrt';

export interface Check {
  name: string;
  ok: boolean;
}

export interface LevelResult {
  level: number;
  title: string;
  status: LevelStatus;
  checkedAt: string | null;
  durationMs: number | null;
  checks: Check[];
  metrics: Record<string, unknown>;
}

export interface RunInfo {
  id: string;
  version: string;
  commit: string | null;
  updatedAt: string | null;
}

export interface Results {
  run: RunInfo;
  levels: LevelResult[];
}

/** Feste Level-Titel (die Seite zeigt immer diese, unabhängig von der Datei). */
export const LEVEL_TITLES = [
  'Statische Seite',
  'Webserver',
  'REST-Backend',
  'Datenbank',
  'Frontend + Backend',
  'Repo + CI',
  'Images in der Pipeline',
  'Deployment',
  'Live-Prüfung',
  'Metriken veröffentlicht',
] as const;

export const LEVEL_COUNT = LEVEL_TITLES.length;

const STATUSES: LevelStatus[] = ['offen', 'bestanden', 'fehlgeschlagen', 'gesperrt'];

export type LoadState =
  | { kind: 'loading' }
  | { kind: 'ok'; results: Results }
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'unavailable' };

/** Datenquelle: Datei (results.json, Level 1–4) oder Backend (/api/levels, ab Level 5). */
export type Source = 'file' | 'api';

/** Liest /config.json. Fehlt sie oder ist sie ungültig, gilt „file“. */
export async function loadSource(url = '/config.json'): Promise<Source> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return 'file';
    const data = (await res.json()) as { source?: unknown };
    return data && data.source === 'api' ? 'api' : 'file';
  } catch {
    return 'file';
  }
}

/** Lädt den Stand aus dem Backend. Nicht erreichbar, 5xx oder HTML → „unavailable“. */
export async function loadFromApi(url = '/api/levels'): Promise<LoadState> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    return { kind: 'unavailable' };
  }
  const isHtml = (res.headers.get('content-type') ?? '').includes('text/html');
  if (!res.ok || isHtml) return { kind: 'unavailable' };
  try {
    const parsed = parseResults(await res.json());
    return parsed ? { kind: 'ok', results: parsed } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

/** Abfrage-Intervall im API-Modus. */
export const POLL_MS = 5000;

/** Leerer Zustand: alle Levels offen. */
export function emptyResults(): Results {
  return {
    run: { id: '–', version: '–', commit: null, updatedAt: null },
    levels: LEVEL_TITLES.map((title, i) => ({
      level: i + 1,
      title,
      status: 'offen',
      checkedAt: null,
      durationMs: null,
      checks: [],
      metrics: {},
    })),
  };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrOrNull = (v: unknown) => v === null || typeof v === 'string';
const isIsoOrNull = (v: unknown) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v)));

function isLevel(v: unknown): v is LevelResult {
  if (!isObj(v)) return false;
  return (
    Number.isInteger(v.level) &&
    (v.level as number) >= 1 &&
    (v.level as number) <= LEVEL_COUNT &&
    typeof v.title === 'string' &&
    STATUSES.includes(v.status as LevelStatus) &&
    isIsoOrNull(v.checkedAt) &&
    (v.durationMs === null || (typeof v.durationMs === 'number' && v.durationMs >= 0)) &&
    Array.isArray(v.checks) &&
    v.checks.every((c) => isObj(c) && typeof c.name === 'string' && typeof c.ok === 'boolean') &&
    isObj(v.metrics)
  );
}

/** Strenge Prüfung: Jede Abweichung vom Schema macht die ganze Datei ungültig. */
export function parseResults(data: unknown): Results | null {
  if (!isObj(data) || !isObj(data.run) || !Array.isArray(data.levels)) return null;
  const run = data.run;
  if (typeof run.id !== 'string' || typeof run.version !== 'string' || !isStrOrNull(run.commit) || !isIsoOrNull(run.updatedAt)) {
    return null;
  }
  if (data.levels.length !== LEVEL_COUNT || !data.levels.every(isLevel)) return null;
  const levels = [...(data.levels as LevelResult[])].sort((a, b) => a.level - b.level);
  if (!levels.every((l, i) => l.level === i + 1)) return null; // jede Nummer genau einmal
  return { run: run as unknown as RunInfo, levels };
}

export async function loadResults(url = '/results.json'): Promise<LoadState> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    return { kind: 'missing' };
  }
  // Fehlt die Datei, liefern manche Server (z. B. mit SPA-Fallback) index.html statt 404 – das zählt ebenfalls als „fehlt“.
  const isHtml = (res.headers.get('content-type') ?? '').includes('text/html');
  if (res.status === 404 || (res.ok && isHtml)) return { kind: 'missing' };
  if (!res.ok) return { kind: 'invalid' };
  try {
    const parsed = parseResults(await res.json());
    return parsed ? { kind: 'ok', results: parsed } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

/** Erreichtes Level = höchstes Level, bis zu dem alle Levels bestanden sind. */
export function reachedLevel(levels: LevelResult[]): number {
  let n = 0;
  for (const l of levels) {
    if (l.status !== 'bestanden') break;
    n = l.level;
  }
  return n;
}

const dateFmt = new Intl.DateTimeFormat('de-CH', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** ISO → „21.11.2026, 10:14“ (lokale Zeit), null → „–“ */
export function formatDateTime(iso: string | null): string {
  return iso ? dateFmt.format(new Date(iso)) : '–';
}

/** 850 → „850 ms“, 2310 → „2,3 s“, null → „–“ */
export function formatDuration(ms: number | null): string {
  if (ms === null) return '–';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
}

export const STATUS_LABEL: Record<LevelStatus, string> = {
  offen: 'Offen',
  bestanden: 'Bestanden',
  fehlgeschlagen: 'Fehlgeschlagen',
  gesperrt: 'Gesperrt',
};

/** Bauzeit eines Levels (metrics.build, ab Spec 2.0.0): eigene Zeit oder „in Level n enthalten“. */
export type Build = { buildS: number } | { inLevel: number };
export interface Pipeline { runId: number; url: string; jobs: Record<string, number>; totalS: number }
export interface Images { frontendMB: number; backendMB: number }
export interface Loadtest { requests: number; errors: number; rps: number; p50Ms: number; p95Ms: number }

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Bauzeit eines Levels oder null, solange es keinen Eintrag gibt. */
export function buildOf(l: LevelResult): Build | null {
  const b = l.metrics?.build;
  if (!isObj(b)) return null;
  if (isNum(b.inLevel)) return { inLevel: b.inLevel };
  return isNum(b.buildS) ? { buildS: b.buildS } : null;
}

/** Pipeline aus Level 6, Images aus Level 7, Lasttest aus Level 9 – null, solange nicht vorhanden. */
export function pipelineOf(levels: LevelResult[]): Pipeline | null {
  const p = levels[5]?.metrics?.pipeline;
  if (!isObj(p) || !isNum(p.runId) || typeof p.url !== 'string' || !isNum(p.totalS) || !isObj(p.jobs) || !Object.values(p.jobs).every(isNum)) return null;
  return p as unknown as Pipeline;
}
export function imagesOf(levels: LevelResult[]): Images | null {
  const i = levels[6]?.metrics?.images;
  return isObj(i) && isNum(i.frontendMB) && isNum(i.backendMB) ? (i as unknown as Images) : null;
}
export function loadtestOf(levels: LevelResult[]): Loadtest | null {
  const l = levels[8]?.metrics?.loadtest;
  return isObj(l) && [l.requests, l.errors, l.rps, l.p50Ms, l.p95Ms].every(isNum) ? (l as unknown as Loadtest) : null;
}

/** Bauzeit gesamt: Summe aller Levels mit eigener Zeit; null, solange keine erfasst ist. */
export function buildSum(levels: LevelResult[]): number | null {
  const list = levels.map(buildOf).flatMap((b) => (b && 'buildS' in b ? [b.buildS] : []));
  return list.length ? list.reduce((s, x) => s + x, 0) : null;
}

/** Bauzeit: 39 → „39 s“, 452 → „7:32 min“ */
export function formatBuild(s: number): string {
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`;
}

/** 4419802 → „4’419’802“ */
export function formatThousands(n: number): string {
  return n.toLocaleString('de-CH');
}

/** 172.8 → „172,8“ (Nachkommastellen fest) */
export function formatDecimal(n: number, digits = 1): string {
  return n.toFixed(digits).replace('.', ',');
}

/**
 * Verbrauch (GET /api/usage, ab Spec 2.1.0): Tokens und Kosten, vom Runner nach der Prüfung nachgetragen.
 * Pro Level eigene Werte oder „in Level n enthalten“; costUsd null = Preis des Modells unbekannt.
 */
export interface UsageNumbers { output: number; total: number; costUsd: number | null }
export type LevelUsage = UsageNumbers | { inLevel: number };
export interface Usage {
  harness: string | null;
  models: string[];
  measuredAt: string | null;
  total: UsageNumbers;
  levels: Record<string, LevelUsage>;
}

const isUsageNumbers = (v: unknown): v is UsageNumbers =>
  isObj(v) && isNum(v.output) && isNum(v.total) && (v.costUsd === null || isNum(v.costUsd));

/** Prüft den Verbrauch; {} (noch nicht nachgetragen) oder Unbekanntes → null. Ungültige Level-Einträge fallen weg. */
export function parseUsage(data: unknown): Usage | null {
  if (!isObj(data) || !isUsageNumbers(data.total)) return null;
  const levels: Record<string, LevelUsage> = {};
  if (isObj(data.levels)) {
    for (const [n, e] of Object.entries(data.levels)) {
      if (isObj(e) && isNum(e.inLevel)) levels[n] = { inLevel: e.inLevel };
      else if (isUsageNumbers(e)) levels[n] = { output: e.output, total: e.total, costUsd: e.costUsd };
    }
  }
  return {
    harness: typeof data.harness === 'string' ? data.harness : null,
    models: Array.isArray(data.models) ? data.models.filter((m): m is string => typeof m === 'string') : [],
    measuredAt: isIsoOrNull(data.measuredAt) ? (data.measuredAt as string | null) : null,
    total: { output: data.total.output, total: data.total.total, costUsd: data.total.costUsd },
    levels,
  };
}

/** Lädt den Verbrauch aus dem Backend; jeder Fehler zählt als „noch nicht nachgetragen“ (null). */
export async function loadUsage(url = '/api/usage'): Promise<Usage | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
    return parseUsage(await res.json());
  } catch {
    return null;
  }
}

/** 1.234 → „1,23 USD“; null → „–“ */
export function formatUsd(n: number | null): string {
  return n === null ? '–' : `${formatDecimal(n, 2)} USD`;
}
