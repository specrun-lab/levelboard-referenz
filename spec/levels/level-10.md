# Level 10 – Metriken veröffentlicht

**Ziel:** Der **Abschlussbericht** auf der Live-Seite ist **vollständig**. Es gibt ihn schon ab Level 1, und er setzt sich aus den Levels zusammen (`06-design.md`). Mit Level 10 sind alle Teile gefüllt: Ergebnis mit Bauzeit gesamt, Lasttest (Level 9), Image-Größen (Level 7) und Pipeline-Dauer (Level 6). Danach zeigt die Live-Seite „10 / 10“ und „Vollständig: ja“.

Dazu kommt der **Verbrauch** (ab Spec 2.1.0): Tokens und Kosten misst der Runner von Specrun nach der Prüfung und trägt sie per `PUT /api/usage` nach (`04-api.md`, `05-datenmodell.md`). Du baust den Endpunkt und die Anzeige (Kachel „Tokens“, Spalten „Kosten“ und „Tokens (Ausgabe)“ in der Liste). Solange nichts nachgetragen ist, zeigt die Kachel „wird nach der Prüfung ergänzt“.

Die Kennzahlen selbst entstehen schon bei ihren Levels (`05-datenmodell.md`, „Kennzahlen pro Level“). Level 10 prüft, dass alles da ist und live richtig angezeigt wird.

## Liefergegenstände
- Backend: `GET` und `PUT /api/usage` mit `usage.json` neben der Datenbank (`04-api.md`), mit Go-Tests
- Frontend: Verbrauch laden und anzeigen (`05-datenmodell.md`, „Verbrauch“; `06-design.md`, „Abschlussbericht“)
- `checks/tests/level10.spec.ts`
- `checks/tests/live-report.spec.ts`
- `playwright.config.ts` mit den Projekten aus `03-architektur.md`
- `Makefile` mit `level10` und der Nachprüfung in `make check` (siehe `03-architektur.md`)

Danach pushen und auf die Pipeline warten: Die Live-Seite zeigt den Bericht erst mit dem deployten Frontend.

## Prüfsuite für Level 10: `checks/tests/level10.spec.ts`
Genau eine Gruppe `test.describe('level-10', …)`, seriell, Zeitlimit pro Test 120 s, mit genau diesen 4 Tests und wörtlichen Titeln.

Die Tests 2 und 3 öffnen die **Live-Seite** und ersetzen im Browser die Antworten von `GET /api/levels` (sie holen die echte Antwort und ändern darin die Levels) und von `GET /api/usage` (feste Antwort). So lässt sich die Darstellung prüfen, bevor die echte Meldung kommt. Test 4 spricht das **lokale** Backend an (`API_URL`, Standard `http://127.0.0.1:8081`).

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Alle Teile des Berichts sind vorhanden` | `pipelineOf(GITHUB_REPO, HEAD)` hat die Jobs `check`, `images` und `deploy` mit Dauer > 0; beide Image-Größen > 0; `checks/.out/loadtest.json` hat `requests` > 0. Alles zusammen nach `checks/.out/bericht.json` schreiben: `{ pipeline, images, loadtest, build }`. `build` ist ein Objekt Level → Bauzeit-Eintrag: der Eintrag aus `bauzeit.json`, wo es ihn schon gibt (die Datei kann beim ersten `make check` noch fehlen), sonst ein Beispielwert im selben Format |
| 2 | `Vollständiger Bericht wird dargestellt` | Alle Levels ersetzt durch `status: "bestanden"`, `checkedAt`: jetzt, `metrics`: `build` aus `bericht.json`, dazu `pipeline` bei Level 6, `images` bei Level 7, `loadtest` bei Level 9. Dann: `report` mit `data-complete="true"`; `report-reached` = `10 / 10`; `report-complete` = `ja`; `report-build-time` = Summe der `buildS` (ohne `inLevel`); `report-p95`, `report-image-frontend` und die drei `report-job-*` passend; `report-pipeline-link` mit `href` = `pipeline.url`; in jeder Karte `level-build-time` passend zu ihrem Eintrag (Formate in `06-design.md`). `/api/usage` ersetzt durch einen Beispiel-Verbrauch im Format aus `05-datenmodell.md`: Levels mit `inLevel` in `bericht.json` bekommen `{ "inLevel": n }`, die übrigen eigene Werte. Dann: `report-harness`, `report-model`, `report-tokens-output`, `report-tokens-total`, `report-cost` und in jeder Zeile `report-level-cost` und `report-level-output` passend |
| 3 | `Teilbericht zeigt fehlende Teile` | Level 1 und 2 ersetzt durch `bestanden` mit `metrics.build` = `{ "passedAt": <jetzt>, "buildS": 42 }`, alle übrigen durch `offen` mit `checkedAt: null`, `durationMs: null`, `checks: []`, `metrics: {}`. Dann: `report` mit `data-state="ready"`; `report-reached` = `2 / 10`; `report-complete` = `nein`; `report-build-time` = `1:24 min`; `report-pipeline-missing`, `report-images-missing` und `report-loadtest-missing` mit genau dem Text `noch nicht erreicht`. `/api/usage` ersetzt durch `{}`: `report-tokens-missing` mit genau dem Text `wird nach der Prüfung ergänzt`, alle 10 `report-level-cost` und `report-level-output` = `–` |
| 4 | `Verbrauch wird gespeichert und gelesen` | Am lokalen Backend: bisherigen Stand von `GET /api/usage` merken. `PUT` mit einem Beispiel-Verbrauch → 200 mit demselben Objekt, `GET` liefert es. `PUT` mit `[1,2]` und mit kaputtem JSON → 400, mit `Content-Type: text/plain` → 415, mit mehr als 64 KB → 413, `POST` → 405 mit `Allow`, das `PUT` enthält; danach liefert `GET` weiterhin den Beispiel-Verbrauch. `PUT {}` → `GET` liefert `{}`. Am Ende (auch bei Fehlern) den gemerkten Stand zurückschreiben |

## Nachprüfung: `checks/tests/live-report.spec.ts`
Kein eigenes Level. Die Datei läuft erst **nach** der Meldung an die Live-API und nur ab Level 10. Sie hat genau eine Gruppe `test.describe('live-bericht', …)` mit einem Test `Live-Seite zeigt den gemeldeten Abschlussbericht`:
- `GET <LIVE_URL>/api/levels`: Alle 10 Levels sind `bestanden`, jedes hat `metrics.build`, Level 6 hat `pipeline`, Level 7 `images` und Level 9 `loadtest`.
- Die Live-Seite, diesmal ohne Ersetzen, zeigt:
  - `report` mit `data-complete="true"`
  - `summary-reached` = `10 / 10`, `report-score` = `100 / 100`
  - `report-commit` = die ersten 7 Zeichen von `run.commit`
  - `report-build-time` = Summe der `buildS` (ohne `inLevel`)
  - `report-p95`, `report-image-backend` und `report-pipeline-total` passend zur API
  - 10 `report-level` mit `data-status="bestanden"`

## Ablauf, den du selbst durchspielen sollst
1. Tests anpassen, committen, pushen, auf die Pipeline warten (alle drei Jobs grün).
2. `make level10` und `make check` → Level 1–10 bestanden. Alle zehn Levels werden an die Live-API gemeldet, und die Nachprüfung besteht.
3. Kontrolle im Browser: Die Live-Seite zeigt 10 / 10 und einen vollständigen Abschlussbericht.
4. **Danach nichts mehr pushen.** Willst du noch etwas ändern, dann gilt nach dem Push wieder Schritt 1–3: Die Pipeline setzt die Live-Seite beim Deploy auf Level 1–5 zurück, erst dein nächstes `make check` meldet wieder 1–10. Der Prüfer bewertet den Stand, den die Live-Seite am Ende zeigt.

## Bestanden, wenn (Prüfer)
1. Level 1–9 sind bestanden.
2. Auf der Live-API sind Level 1–10 `bestanden`, und Level 10 hat genau die 4 Checks dieser Datei.
3. Die Kennzahlen stimmen mit der Messung des Prüfers überein:
   - `pipeline` (Level 6) und `images` (Level 7) exakt,
   - `loadtest` (Level 9) vollständig und plausibel,
   - jedes Level hat eine Bauzeit (`metrics.build`). Ihre Werte prüft der Prüfer nicht nach, sie sind deine Selbstmessung.
4. Die Live-Seite zeigt den vollständigen Abschlussbericht mit genau diesen Werten in den Formaten aus `06-design.md`.
5. Lokal meldet `make check` Level 1–10 bestanden, meldet alle an die Live-API, und die Nachprüfung besteht.
6. `/api/usage` auf der Live-Seite: `GET` liefert ein Objekt; die Fehlerfälle aus `04-api.md` stimmen; ein `PUT` mit eigenen Testwerten des Prüfers kommt per `GET` unverändert zurück und erscheint im Bericht (Kachel „Tokens“ und Spalten der Liste in den Formaten aus `06-design.md`). Danach stellt der Prüfer den vorherigen Stand wieder her.
