// Token-Verbrauch der eigenen Claude-Code-Session (Level 10): liest die Session-Protokolle unter ~/.claude/projects.
// Als Modul: import { collectTokens } from './collect-tokens.mjs'
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** USD pro Million Tokens (Spec, levels/level-10.md). */
export const PRICES = {
  'claude-opus-5-5': { input: 4, write5m: 5, write1h: 8, read: 0.2, output: 20 },
  'claude-sonnet-5-5': { input: 2, write5m: 2.5, write1h: 4, read: 0.1, output: 10 },
  'claude-haiku-5-5': { input: 0.1, write5m: 0.125, write1h: 0.2, read: 0.01, output: 0.5 },
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

export function collectTokens(dir = path.join(os.homedir(), '.claude', 'projects')) {
  // Jede Antwort (message.id) nur einmal; synthetische Einträge von Claude Code zählen nicht
  const responses = new Map();
  for (const file of jsonlFiles(dir)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let d;
      try { d = JSON.parse(line); } catch { continue; }
      const m = d.type === 'assistant' ? d.message : null;
      if (!m?.id || !m.usage || m.model === '<synthetic>' || responses.has(m.id)) continue;
      responses.set(m.id, { t: Date.parse(d.timestamp), model: m.model, usage: m.usage });
    }
  }
  if (responses.size === 0) throw new Error(`keine Antworten in ${dir}`);

  const sum = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
  let cost = 0;
  const models = new Set();
  for (const { model, usage: u } of responses.values()) {
    const price = PRICES[model];
    if (!price) throw new Error(`kein Preis für Modell ${model}`);
    models.add(model);
    const created = u.cache_creation_input_tokens ?? 0;
    // Aufschlüsselung nach Gültigkeit; ohne Aufschlüsselung gilt alles als 5-Minuten-Cache
    const w1h = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const w5m = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens ?? 0) : created;
    const r = { input: u.input_tokens ?? 0, cacheWrite5m: w5m, cacheWrite1h: w1h, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0 };
    for (const k of Object.keys(sum)) sum[k] += r[k];
    cost += (r.input * price.input + r.cacheWrite5m * price.write5m + r.cacheWrite1h * price.write1h + r.cacheRead * price.read + r.output * price.output) / 1e6;
  }
  const times = [...responses.values()].map((r) => r.t).sort((a, b) => a - b);
  return {
    models: [...models].sort(),
    responses: responses.size,
    ...sum,
    total: Object.values(sum).reduce((a, b) => a + b, 0),
    costUsd: Math.round(cost * 100) / 100,
    sessionS: Math.round((times.at(-1) - times[0]) / 1000),
    until: new Date(times.at(-1)).toISOString(),
  };
}
