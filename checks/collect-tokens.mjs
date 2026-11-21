// Token-Verbrauch der eigenen Claude-Code-Session, aufgeteilt nach Levels (ab Level 1).
// Quelle: Session-Protokolle unter ~/.claude/projects (*.jsonl). Regeln: spec/05-datenmodell.md, „Verbrauch pro Level“.
// Als Modul: import { levelTokens, sumTokens, readProtocol } from './collect-tokens.mjs'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_DIR = path.join(os.homedir(), '.claude', 'projects');

/** USD pro Million Tokens. `long`: Preise für Anfragen, deren Prompt über `longFrom` Tokens hat (nur Haiku 5.5). */
export const PRICES = {
  'claude-opus-5-5': { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, write5m: 2.5, write1h: 4, read: 0.1, output: 10 },
  'claude-haiku-5-5': {
    input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5,
    longFrom: 100_000, long: { input: 0.5, write5m: 0.625, write1h: 1, read: 0.05, output: 2.5 },
  },
};

function jsonlFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsonlFiles(p));
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

/** Höchstes n, für das „Level 1: bestanden … Level n: bestanden“ durchgehend in der Ausgabe steht. */
export function reachedIn(text) {
  const passed = new Set([...text.matchAll(/Level (\d+): bestanden/g)].map((m) => Number(m[1])));
  let n = 0;
  while (passed.has(n + 1)) n++;
  return n;
}

/**
 * Liest das Protokoll: Antworten (je message.id einmal, ohne <synthetic>) und die Stellen, an denen
 * ein früheres „make check“ erstmals ein höheres Level erreicht hat (Phasengrenzen).
 */
export function readProtocol(dir = DEFAULT_DIR) {
  const responses = new Map();
  const commands = new Map();
  const outputs = [];
  for (const file of jsonlFiles(dir)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      const t = Date.parse(d.timestamp ?? '');
      if (d.type === 'assistant' && d.message?.id && d.message.usage) {
        for (const c of d.message.content ?? []) if (c?.type === 'tool_use' && c.name === 'Bash') commands.set(c.id, String(c.input?.command ?? ''));
        if (d.message.model !== '<synthetic>' && !responses.has(d.message.id)) responses.set(d.message.id, { t, model: d.message.model, usage: d.message.usage });
      }
      if (d.type === 'user') {
        const c = d.message?.content;
        const r = d.toolUseResult;
        const id = Array.isArray(c) ? c.find((x) => x?.type === 'tool_result')?.tool_use_id : undefined;
        if (r && typeof r === 'object' && ('stdout' in r || 'stderr' in r)) outputs.push({ t, id, text: `${r.stdout ?? ''}\n${r.stderr ?? ''}` });
        const text = typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === 'string' ? x.text : '')).join('\n') : '';
        if (text.includes('<task-notification>')) outputs.push({ t, id: text.match(/<tool-use-id>([^<]+)<\/tool-use-id>/)?.[1], text });
      }
    }
  }
  const steps = [];
  let best = 0;
  for (const o of outputs.sort((a, b) => a.t - b.t)) {
    if (!/make\s+check\b/.test(commands.get(o.id) ?? '')) continue;
    const n = reachedIn(o.text);
    if (n > best) {
      steps.push({ t: o.t, from: best + 1, to: n });
      best = n;
    }
  }
  return { responses: [...responses.values()].sort((a, b) => a.t - b.t), steps, best };
}

/** Summe über Antworten: Token-Arten, Kosten (USD, 2 Nachkommastellen), Zeitraum. */
export function sumTokens(list) {
  const sum = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
  let cost = 0;
  const models = new Set();
  for (const { model, usage: u } of list) {
    const base = PRICES[model];
    if (!base) throw new Error(`kein Preis für Modell ${model}`);
    models.add(model);
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const w5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
    const r = { input: u.input_tokens ?? 0, cacheWrite5m: w5m, cacheWrite1h: w1h, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 };
    for (const k of Object.keys(sum)) sum[k] += r[k];
    // Prompt-Länge der Anfrage = Eingabe + Cache-Schreiben + Cache-Lesen; darüber gilt die teurere Stufe
    const prompt = r.input + r.cacheWrite5m + r.cacheWrite1h + r.cacheRead;
    const price = base.long && prompt > base.longFrom ? base.long : base;
    cost += (r.input * price.input + r.cacheWrite5m * price.write5m + r.cacheWrite1h * price.write1h + r.cacheRead * price.read + r.output * price.output) / 1e6;
  }
  return {
    models: [...models].sort(),
    responses: list.length,
    ...sum,
    total: Object.values(sum).reduce((a, b) => a + b, 0),
    costUsd: Math.round(cost * 100) / 100,
    from: list.length ? new Date(list[0].t).toISOString() : null,
    until: list.length ? new Date(list.at(-1).t).toISOString() : null,
  };
}

/**
 * Verbrauch je Level für den Stand dieses make check.
 * current: Status je Level aus diesem Lauf, z. B. [{ level: 1, status: 'bestanden' }, …] (aufsteigend).
 * Ergebnis: Map level → Token-Objekt | { inLevel: n } (nur Levels, die geprüft wurden).
 */
export function levelTokens(current, dir = DEFAULT_DIR) {
  const { responses, steps, best } = readProtocol(dir);
  const result = new Map();
  if (responses.length === 0) return result;
  // Bauzeit: vom Ende der vorigen Phase (bzw. der ersten Antwort) bis zur letzten Antwort der Phase,
  // also bis zum Start des make check, der das Level besteht
  const withBuild = (list, start) => ({ ...sumTokens(list), buildS: list.length ? Math.round((list.at(-1).t - start) / 1000) : 0 });
  const assign = (from, to, list, start) => {
    result.set(to, withBuild(list, start));
    for (let n = from; n < to; n++) result.set(n, { inLevel: to });
  };
  // Abgeschlossene Phasen aus früheren make check
  let prev = -Infinity;
  for (const s of steps) {
    assign(s.from, s.to, responses.filter((r) => r.t > prev && r.t <= s.t), prev === -Infinity ? responses[0].t : prev);
    prev = s.t;
  }
  // Laufende Phase: alles nach der letzten Grenze
  const rest = responses.filter((r) => r.t > prev);
  let reachedNow = 0;
  for (const l of current) {
    if (l.status !== 'bestanden') break;
    reachedNow = l.level;
  }
  const failed = current.find((l) => l.status === 'fehlgeschlagen');
  const restStart = prev === -Infinity ? responses[0].t : prev;
  if (reachedNow > best) assign(best + 1, reachedNow, rest, restStart);
  else if (failed && failed.level > best) result.set(failed.level, withBuild(rest, restStart));
  if (failed && failed.level > best && reachedNow > best) result.set(failed.level, withBuild([], restStart));
  // Nur geprüfte Levels behalten
  const checked = new Set(current.filter((l) => l.status === 'bestanden' || l.status === 'fehlgeschlagen').map((l) => l.level));
  for (const n of [...result.keys()]) if (!checked.has(n)) result.delete(n);
  return result;
}
