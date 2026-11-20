# Level 10 – Metriken veröffentlicht

**Ziel:** Die Live-Seite zeigt unter den Karten einen **Abschlussbericht** mit den Kennzahlen deines Laufs: Ergebnis, Lasttest, Image-Größen und Pipeline-Dauer. Die Zahlen sammelt `make check` und meldet sie als `metrics` von Level 10 an die Live-API. Danach zeigt die Seite „10 / 10“.

## Liefergegenstände
- `frontend/src/components/Report.tsx` und Anpassungen in `App.tsx`, `results.ts` und `styles.css` (Gestaltung, Texte und `data-testid`s in `06-design.md`)
- `checks/collect-report.mjs`
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
  "loadtest": { "requests": 5190, "errors": 0, "rps": 172.8, "p50Ms": 57, "p95Ms": 66 }
}
```
| Feld | Herkunft |
|---|---|
| `pipeline.runId`, `pipeline.url` | Lauf von `CI` für den lokalen `HEAD` auf `main` (`gh api repos/<repo>/actions/workflows/ci.yml/runs?branch=main&head_sha=<HEAD>&per_page=1`): `id` und `html_url` |
| `pipeline.jobs.<name>` | für die Jobs `check`, `images` und `deploy` dieses Laufs (`…/actions/runs/<id>/jobs`): Sekunden von `started_at` bis `completed_at`, gerundet |
| `pipeline.totalS` | Sekunden von `run_started_at` des Laufs bis zum spätesten `completed_at` seiner Jobs, gerundet |
| `images.frontendMB`, `images.backendMB` | Image `ghcr.io/<repo>-frontend` bzw. `-backend` mit dem Tag `<HEAD>`, **ohne Anmeldung** gelesen wie in Level 7. Ist das Manifest ein Index, gilt der Eintrag `linux/amd64`. Wert: Summe der `size` aller `layers` geteilt durch 1024 · 1024, auf 1 Nachkommastelle gerundet |
| `loadtest.*` | die gleichnamigen Felder aus `checks/.out/loadtest.json` (Level 9 im selben `make check`) |

## `checks/collect-report.mjs`
Ein ES-Modul mit dem Export `async function collectReport({ repo, sha, loadtestFile })`. Es liefert genau das Objekt oben. Keine neuen Abhängigkeiten: `gh` über `child_process`, die Registry über `fetch`.

## Prüfsuite für Level 10: `checks/tests/level10.spec.ts`
Genau eine Gruppe `test.describe('level-10', …)`, seriell, Zeitlimit pro Test 120 s, mit genau diesen 3 Tests und wörtlichen Titeln.

Die Tests 2 und 3 öffnen die **Live-Seite** und ersetzen im Browser die Antwort von `GET /api/levels`: Sie holen die echte Antwort und ändern darin nur Level 10. So lässt sich die Darstellung prüfen, bevor die echte Meldung kommt.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Kennzahlen für den Bericht gesammelt` | `collectReport` für `GITHUB_REPO` und `HEAD` aufrufen, das Ergebnis nach `checks/.out/report.json` schreiben; alle Job-Dauern > 0; `totalS` ≥ größte Job-Dauer; beide Image-Größen > 0; `url` enthält `/<repo>/actions/runs/<runId>`; `loadtest.requests` > 0 |
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
  - `report-p95` passend zu `report.json`
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
   - Lasttest gleich den `metrics` von Level 9.
4. Die Live-Seite zeigt den Abschlussbericht mit genau diesen Werten in den Formaten aus `06-design.md`.
5. Lokal meldet `make check` Level 1–10 bestanden, meldet alle an die Live-API, und die Nachprüfung besteht.
