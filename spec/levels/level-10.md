# Level 10 – Metriken veröffentlicht

**Ziel:** Die Live-Seite zeigt unter den Karten einen **Abschlussbericht** mit den Kennzahlen deines Laufs: Ergebnis, Token-Verbrauch samt geschätzten Kosten, Lasttest, Image-Größen und Pipeline-Dauer. Die Zahlen sammelt `make check` und meldet sie als `metrics` von Level 10 an die Live-API. Danach zeigt die Seite „10 / 10“.

## Liefergegenstände
- `frontend/src/components/Report.tsx` und Anpassungen in `App.tsx`, `results.ts` und `styles.css` (Gestaltung, Texte und `data-testid`s in `06-design.md`)
- `checks/collect-report.mjs`
- `checks/collect-tokens.mjs`
- `checks/tests/level10.spec.ts`
- `checks/tests/live-report.spec.ts`
- `checks/write-results.mjs`: `metrics` von Level 10 aus `checks/.out/report.json` (siehe `05-datenmodell.md`)
- `Makefile` mit `level10` und der Nachprüfung in `make check` (siehe `03-architektur.md`)

Danach pushen: Die Pipeline deployt das neue Frontend, erst dann kann die Live-Seite den Bericht zeigen.

## Kennzahlen: `metrics` von Level 10
Genau dieses Objekt, alle Zahlen als Zahlen:
```json
{
  "pipeline": { "runId": 44809760705, "url": "https://github.com/specrun-lab/levelboard-lauf-010/actions/runs/44809760705",
                "jobs": { "check": 81, "images": 118, "deploy": 64 }, "totalS": 268 },
  "images":   { "frontendMB": 25.2, "backendMB": 8.3 },
  "loadtest": { "requests": 5190, "errors": 0, "rps": 172.8, "p50Ms": 57, "p95Ms": 66 },
  "tokens":   { "models": ["claude-sonnet-5-5"], "responses": 39, "input": 82, "cacheWrite5m": 0, "cacheWrite1h": 125475,
                "cacheRead": 4419802, "output": 65587, "total": 4610946, "costUsd": 1.6, "sessionS": 1339,
                "until": "2026-11-20T16:19:31.603Z" }
}
```
| Feld | Herkunft |
|---|---|
| `pipeline.runId`, `pipeline.url` | Lauf von `CI` für den lokalen `HEAD` auf `main` (`gh api repos/<repo>/actions/workflows/ci.yml/runs?branch=main&head_sha=<HEAD>&per_page=1`): `id` und `html_url` |
| `pipeline.jobs.<name>` | für die Jobs `check`, `images` und `deploy` dieses Laufs (`…/actions/runs/<id>/jobs`): Sekunden von `started_at` bis `completed_at`, gerundet |
| `pipeline.totalS` | Sekunden von `run_started_at` des Laufs bis zum spätesten `completed_at` seiner Jobs, gerundet |
| `images.frontendMB`, `images.backendMB` | Image `ghcr.io/<repo>-frontend` bzw. `-backend` mit dem Tag `<HEAD>`, **ohne Anmeldung** gelesen wie in Level 7. Ist das Manifest ein Index, gilt der Eintrag `linux/amd64`. Wert: Summe der `size` aller `layers` geteilt durch 1024 · 1024, auf 1 Nachkommastelle gerundet |
| `loadtest.*` | die gleichnamigen Felder aus `checks/.out/loadtest.json` (Level 9 im selben `make check`) |
| `tokens.*` | deine eigene Claude-Code-Session, siehe „Token-Verbrauch“ unten |

## Token-Verbrauch: `checks/collect-tokens.mjs`
Ein ES-Modul mit dem Export `function collectTokens(dir)`. Standard für `dir` ist `~/.claude/projects` (also `$HOME/.claude/projects`).
- **Quelle:** alle Dateien `*.jsonl` unter `dir`, auch in Unterordnern. Jede Zeile ist ein JSON-Objekt; ungültige Zeilen überspringen.
- **Antworten:** Zeilen mit `type: "assistant"` und `message.usage`. Dieselbe Antwort steht oft in mehreren Zeilen: **jede `message.id` nur einmal** zählen (die erste Zeile gilt). Antworten mit `message.model` = `<synthetic>` nicht zählen. Gibt es keine Antwort, wirft die Funktion einen Fehler.
- **Summen** über alle Antworten:

  | Feld | aus `message.usage` |
  |---|---|
  | `input` | `input_tokens` |
  | `cacheWrite1h` | `cache_creation.ephemeral_1h_input_tokens` (fehlt `cache_creation`: 0) |
  | `cacheWrite5m` | `cache_creation.ephemeral_5m_input_tokens`; fehlt `cache_creation`, dann `cache_creation_input_tokens` |
  | `cacheRead` | `cache_read_input_tokens` |
  | `output` | `output_tokens` |

  Fehlende Werte zählen als 0. `total` ist die Summe dieser fünf Felder.
- `models`: alle vorkommenden `message.model`, alphabetisch, ohne Doppelte. `responses`: Anzahl der Antworten.
- `sessionS`: Sekunden vom `timestamp` der ersten bis zu dem der letzten Antwort, gerundet. `until`: `timestamp` der letzten Antwort als ISO-Zeit (`toISOString()`).
- `costUsd`: Für jede Antwort die Tokens mal den Preis ihres Modells (USD pro Million Tokens, Tabelle unten), alles aufsummiert, am Ende auf 2 Nachkommastellen gerundet. Ein Modell, das nicht in der Tabelle steht, ist ein Fehler.

  | Modell | Eingabe | Cache schreiben 5 min | Cache schreiben 1 h | Cache lesen | Ausgabe |
  |---|---|---|---|---|---|
  | `claude-opus-5-5` | 4 | 5 | 8 | 0.2 | 20 |
  | `claude-sonnet-5-5` | 2 | 2.5 | 4 | 0.1 | 10 |
  | `claude-haiku-5-5` | 0.1 | 0.125 | 0.2 | 0.01 | 0.5 |

Die Messung zeigt den Stand beim Sammeln in `make check`. Was du danach noch verbrauchst, fehlt darin. Das ist so gewollt.

## `checks/collect-report.mjs`
Ein ES-Modul mit dem Export `async function collectReport({ repo, sha, loadtestFile, projectsDir })`. Es liefert genau das Objekt oben; `tokens` kommt aus `collectTokens(projectsDir)`. Keine neuen Abhängigkeiten: `gh` über `child_process`, die Registry über `fetch`.

## Prüfsuite für Level 10: `checks/tests/level10.spec.ts`
Genau eine Gruppe `test.describe('level-10', …)`, seriell, Zeitlimit pro Test 120 s, mit genau diesen 3 Tests und wörtlichen Titeln.

Die Tests 2 und 3 öffnen die **Live-Seite** und ersetzen im Browser die Antwort von `GET /api/levels`: Sie holen die echte Antwort und ändern darin nur Level 10. So lässt sich die Darstellung prüfen, bevor die echte Meldung kommt.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Kennzahlen für den Bericht gesammelt` | `collectReport` für `GITHUB_REPO` und `HEAD` aufrufen, das Ergebnis nach `checks/.out/report.json` schreiben; alle Job-Dauern > 0; `totalS` ≥ größte Job-Dauer; beide Image-Größen > 0; `url` enthält `/<repo>/actions/runs/<runId>`; `loadtest.requests` > 0; `tokens.responses` > 0, `tokens.models` nicht leer, `tokens.total` = Summe der fünf Token-Felder, `tokens.costUsd` > 0 |
| 2 | `Abschlussbericht wird dargestellt` | Level 10 ersetzt durch `status: "bestanden"`, `checkedAt`: jetzt, `metrics`: Inhalt von `report.json` → `report` hat `data-state="ready"`; alle Werte aus `06-design.md` stimmen mit `report.json` überein (Formate dort); `report-pipeline-link` hat `href` = `pipeline.url`; 10 `report-level` |
| 3 | `Ohne Level 10 erscheint der Hinweis` | Level 10 ersetzt durch `status: "offen"`, `checkedAt: null`, `durationMs: null`, `checks: []`, `metrics: {}` → `report` hat `data-state="empty"`, `report-empty` mit genau dem Text aus `06-design.md` |

## Nachprüfung: `checks/tests/live-report.spec.ts`
Kein eigenes Level. Die Datei läuft erst **nach** der Meldung an die Live-API und nur ab Level 10. Sie hat genau eine Gruppe `test.describe('live-bericht', …)` mit einem Test `Live-Seite zeigt den gemeldeten Abschlussbericht`:
- `GET <LIVE_URL>/api/levels`: alle 10 Levels `bestanden`, und die `metrics` von Level 10 sind gleich dem Inhalt von `report.json`.
- Die Live-Seite, diesmal ohne Ersetzen, zeigt:
  - `report` mit `data-state="ready"`
  - `summary-reached` und `report-reached` = `10 / 10`
  - `report-score` = `100 / 100`
  - `report-commit` = die ersten 7 Zeichen von `run.commit`
  - `report-p95` und `report-cost` passend zu `report.json`
  - 10 `report-level` mit `data-status="bestanden"`

## Ablauf, den du selbst durchspielen sollst
1. Frontend und Prüfsuite anpassen, committen, pushen, auf die Pipeline warten (alle drei Jobs grün).
2. `make level10` und `make check` → Level 1–10 bestanden. Alle zehn Levels werden an die Live-API gemeldet, und die Nachprüfung besteht.
3. Kontrolle im Browser: Die Live-Seite zeigt 10 / 10 und den Abschlussbericht.

## Bestanden, wenn (Prüfer)
1. Level 1–9 sind bestanden.
2. Auf der Live-API sind Level 1–10 `bestanden`. Level 10 hat genau die 3 Checks dieser Datei und `metrics` im Format oben.
3. Die Kennzahlen stimmen mit der Messung des Prüfers überein:
   - Pipeline-Lauf, Job-Dauern und `totalS` exakt,
   - Image-Größen exakt,
   - Lasttest gleich den `metrics` von Level 9,
   - Tokens und Kosten exakt gleich der Nachrechnung des Prüfers aus deinem Session-Protokoll, für alle Antworten bis `tokens.until`.
4. Die Live-Seite zeigt den Abschlussbericht mit genau diesen Werten in den Formaten aus `06-design.md`.
5. Lokal meldet `make check` Level 1–10 bestanden, meldet alle an die Live-API, und die Nachprüfung besteht.
