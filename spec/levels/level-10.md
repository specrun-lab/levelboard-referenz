# Level 10 – Metriken veröffentlicht

**Ziel:** Der **Abschlussbericht** auf der Live-Seite ist **vollständig**. Er gibt es schon ab Level 1 und setzt sich aus den Levels zusammen (`06-design.md`). Mit Level 10 sind alle Teile gefüllt: Ergebnis, Tokens und Kosten aller Levels, Lasttest (Level 9), Image-Größen (Level 7) und Pipeline-Dauer (Level 6). Danach zeigt die Live-Seite „10 / 10“ und „Vollständig: ja“.

Die Kennzahlen selbst entstehen schon bei ihren Levels (`05-datenmodell.md`, „Kennzahlen pro Level“). Level 10 prüft, dass alles da ist und live richtig angezeigt wird.

## Liefergegenstände
- `checks/tests/level10.spec.ts`
- `checks/tests/live-report.spec.ts`
- `playwright.config.ts` mit den Projekten aus `03-architektur.md`
- `Makefile` mit `level10` und der Nachprüfung in `make check` (siehe `03-architektur.md`)

Danach pushen und auf die Pipeline warten: Die Live-Seite zeigt den Bericht erst mit dem deployten Frontend.

## Prüfsuite für Level 10: `checks/tests/level10.spec.ts`
Genau eine Gruppe `test.describe('level-10', …)`, seriell, Zeitlimit pro Test 120 s, mit genau diesen 3 Tests und wörtlichen Titeln.

Die Tests 2 und 3 öffnen die **Live-Seite** und ersetzen im Browser die Antwort von `GET /api/levels`: Sie holen die echte Antwort und ändern darin die Levels. So lässt sich die Darstellung prüfen, bevor die echte Meldung kommt.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Alle Teile des Berichts sind vorhanden` | `pipelineOf(GITHUB_REPO, HEAD)` hat die Jobs `check`, `images` und `deploy` mit Dauer > 0; beide Image-Größen > 0; `checks/.out/loadtest.json` hat `requests` > 0; `levelTokens` für „Level 1–10 bestanden“ liefert Einträge für alle 10 Levels. Alles zusammen nach `checks/.out/bericht.json` schreiben: `{ pipeline, images, loadtest, tokens }` mit `tokens` als Objekt Level → Eintrag |
| 2 | `Vollständiger Bericht wird dargestellt` | Alle Levels ersetzt durch `status: "bestanden"`, `checkedAt`: jetzt, `metrics`: `tokens` aus `bericht.json`, dazu `pipeline` bei Level 6, `images` bei Level 7, `loadtest` bei Level 9. Dann: `report` mit `data-complete="true"`; `report-reached` = `10 / 10`; `report-complete` = `ja`; `report-cost` und `report-tokens-output` = Summen über die Levels mit eigenem Token-Objekt; `report-p95`, `report-image-frontend` und die drei `report-job-*` passend; `report-pipeline-link` mit `href` = `pipeline.url`; in jeder Karte `level-cost` und `level-output` passend zu ihrem Eintrag (Formate in `06-design.md`) |
| 3 | `Teilbericht zeigt fehlende Teile` | Level 1 und 2 ersetzt durch `bestanden` mit einem Token-Objekt aus `bericht.json`, alle übrigen durch `offen` mit `checkedAt: null`, `durationMs: null`, `checks: []`, `metrics: {}`. Dann: `report` mit `data-state="ready"`; `report-reached` = `2 / 10`; `report-complete` = `nein`; `report-pipeline-missing`, `report-images-missing` und `report-loadtest-missing` mit genau dem Text `noch nicht erreicht`; kein `report-tokens-missing` |

## Nachprüfung: `checks/tests/live-report.spec.ts`
Kein eigenes Level. Die Datei läuft erst **nach** der Meldung an die Live-API und nur ab Level 10. Sie hat genau eine Gruppe `test.describe('live-bericht', …)` mit einem Test `Live-Seite zeigt den gemeldeten Abschlussbericht`:
- `GET <LIVE_URL>/api/levels`: Alle 10 Levels sind `bestanden`, jedes hat `metrics.tokens`, Level 6 hat `pipeline`, Level 7 `images` und Level 9 `loadtest`.
- Die Live-Seite, diesmal ohne Ersetzen, zeigt:
  - `report` mit `data-complete="true"`
  - `summary-reached` = `10 / 10`, `report-score` = `100 / 100`
  - `report-commit` = die ersten 7 Zeichen von `run.commit`
  - `report-cost` = Summe der `costUsd` aus der API
  - `report-p95`, `report-image-backend` und `report-pipeline-total` passend zur API
  - 10 `report-level` mit `data-status="bestanden"`

## Ablauf, den du selbst durchspielen sollst
1. Tests anpassen, committen, pushen, auf die Pipeline warten (alle drei Jobs grün).
2. `make level10` und `make check` → Level 1–10 bestanden. Alle zehn Levels werden an die Live-API gemeldet, und die Nachprüfung besteht.
3. Kontrolle im Browser: Die Live-Seite zeigt 10 / 10 und einen vollständigen Abschlussbericht.

## Bestanden, wenn (Prüfer)
1. Level 1–9 sind bestanden.
2. Auf der Live-API sind Level 1–10 `bestanden`, und Level 10 hat genau die 3 Checks dieser Datei.
3. Die Kennzahlen stimmen mit der Messung des Prüfers überein:
   - `pipeline` (Level 6) und `images` (Level 7) exakt,
   - `loadtest` (Level 9) vollständig und plausibel,
   - `tokens` aller 10 Levels exakt gleich der Nachrechnung aus deinem Session-Protokoll nach den Regeln in `05-datenmodell.md`.
4. Die Live-Seite zeigt den vollständigen Abschlussbericht mit genau diesen Werten in den Formaten aus `06-design.md`.
5. Lokal meldet `make check` Level 1–10 bestanden, meldet alle an die Live-API, und die Nachprüfung besteht.
