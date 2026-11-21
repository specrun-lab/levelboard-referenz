# Level 9 – Live-Prüfung

**Ziel:** Deine Prüfsuite prüft jetzt auch die **Live-Seite** aus Level 8, inklusive eines kurzen **Lasttests**. Danach meldet `make check` die Ergebnisse von Level 1–9 an die **Live-API**, also an das Backend auf dem Server. Die öffentliche Seite zeigt dann „9 / 10“, und bei Level 9 stehen die Messwerte des Lasttests.

Die Live-Adresse ist wie in Level 8 `LIVE_URL = https://<RUN_ID>.<LIVE_DOMAIN>`. Am Server und an der Pipeline änderst du nichts.

## Liefergegenstände
- `checks/loadtest.mjs`
- `checks/tests/level9.spec.ts`
- `checks/write-results.mjs` meldet ab Level 9 zusätzlich an die Live-API (siehe `05-datenmodell.md`)
- `Makefile` mit `level9`, `REPORT_LIVE` und dem Löschen von `checks/.out/loadtest.json` (siehe `03-architektur.md`)

## Lasttest: `checks/loadtest.mjs`
Ein ES-Modul ohne neue Abhängigkeiten. Es nutzt nur `fetch` und `performance.now()` von Node.

- **Export** `async function loadtest(base)`. `base` ist die Live-Adresse ohne `/` am Ende.
- **Last:** genau **10** gleichzeitige „Verbindungen“, also 10 Schleifen, die parallel laufen. Jede Schleife schickt nacheinander Anfragen, bis **30 s** seit dem Start vergangen sind. Eine Anfrage, die bei Ablauf noch läuft, wird zu Ende geführt und mitgezählt.
- **Ziele:** Jede Schleife fragt abwechselnd `GET <base>/` und `GET <base>/api/levels` ab und beginnt mit `/`.
- **Messung pro Anfrage:**
  - Gemessen wird die Zeit vom Absenden bis zum vollständig gelesenen Body, in Millisekunden.
  - **Fehler** ist jede Antwort mit einem Status außer 200 und jede Ausnahme, auch eine Zeitüberschreitung nach 10 s.
  - Fehlerhafte Anfragen zählen trotzdem zu `requests` und zu den Zeiten.
- **Ergebnis:** ein Objekt mit genau diesen Feldern, alle als Zahlen:

  | Feld | Wert |
  |---|---|
  | `connections` | `10` |
  | `durationS` | `30` |
  | `requests` | Anzahl aller Anfragen |
  | `errors` | Anzahl der Fehler |
  | `rps` | `requests` geteilt durch die tatsächlich verstrichenen Sekunden, auf 1 Nachkommastelle gerundet |
  | `p50Ms`, `p95Ms` | 50.- bzw. 95.-Perzentil der Zeiten nach **Nearest-Rank**: aufsteigend sortieren, dann der Wert an Position `ceil(p/100 · n)`, 1-basiert; gerundet auf ganze ms |
  | `maxMs` | längste Zeit, gerundet auf ganze ms |

- **Aufruf von der Kommandozeile:** `node loadtest.mjs <basis-url>` gibt das Ergebnis als JSON aus.

## Live-Suite: `checks/tests/level9.spec.ts`
Genau eine Gruppe `test.describe('level-9', …)`, seriell, Zeitlimit pro Test 120 s, mit genau diesen 5 Tests und wörtlichen Titeln. Alle Adressen beginnen mit `LIVE_URL`.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Live-Seite zeigt Kopfzeile und 10 Karten` | `LIVE_URL` beginnt mit `https://`; Seite mit `data-state="ok"`; `run-id` = `RUN_ID`; `run-commit` hat 7 Hex-Zeichen; 10 `level-card` |
| 2 | `Cache- und gzip-Regeln gelten live` | `GET /` mit `Accept-Encoding: gzip` → 200, `cache-control` `no-cache`, `content-encoding` `gzip`; erste JS-Datei aus `/assets/` (aus dem HTML): `public, max-age=31536000, immutable`; `/config.json`: `no-store`; `/gibt-es-nicht.json` → 404 |
| 3 | `Live-API antwortet laut Spec` | `/api/health` → 200, `content-type` exakt `application/json`; `/api/levels` mit 10 Levels; `/api/levels/0` → 404 mit `error`; `DELETE /api/levels` → 405 mit `Allow: GET`; `POST /api/levels/1/result` mit `{"checks":[]}` → 400; dasselbe mit `Content-Type: text/plain` → 415 |
| 4 | `Meldung erscheint live ohne Neuladen` | Seite öffnen (`data-state="ok"`), dann `POST /api/levels/1/result` mit `{"checks":[{"name":"Live-Probe","ok":true}],"durationMs":4242}` → 200; die Karte von Level 1 zeigt innerhalb von 8 s `4,2 s`; der neueste Eintrag in `/api/levels/1/history?limit=1` hat den Check `Live-Probe` |
| 5 | `Lasttest: 10 Verbindungen, 30 s, ohne Fehler, p95 unter 1 s` | `loadtest(LIVE_URL)` ausführen und das Ergebnis als JSON nach `checks/.out/loadtest.json` schreiben (auch wenn die folgenden Prüfungen scheitern); `requests` > 0, `errors` = 0, `p95Ms` < 1000 |

Test 4 meldet absichtlich eine Probe an Level 1 und leert damit live die höheren Levels. Das ist so gewollt. Am Ende meldet `make check` alle Levels neu.

## Ablauf, den du selbst durchspielen sollst
1. Dateien anlegen, committen, pushen, auf die Pipeline warten (alle drei Jobs grün, wie in Level 8).
2. `make level9` und `make check` → Level 1–9 bestanden. Die Ausgabe enthält für jedes Level `… an das Backend gemeldet` und `… an die Live-API gemeldet`.
3. Kontrolle: `GET <LIVE_URL>/api/levels` zeigt Level 1–9 `bestanden`, und Level 9 hat die Lastwerte in `metrics.loadtest` (siehe `05-datenmodell.md`).

## Bestanden, wenn (Prüfer)
1. Level 1–8 sind bestanden.
2. **Selbstmessung live vorhanden:**
   - Auf der Live-API sind Level 1–9 `bestanden`, und `run.commit` ist der aktuelle Commit.
   - Level 9 hat genau die 5 Checks dieser Datei und `metrics.loadtest` mit allen Feldern des Lasttests.
   - Diese Werte sind plausibel: `connections` 10, `durationS` 30, `errors` 0, `p95Ms` < 1000, `requests` > 0, `p50Ms` ≤ `p95Ms` ≤ `maxMs`.
3. **Fremdmessung:** Der Prüfer prüft die Live-Seite selbst, mit eigenen Checks und einem eigenen Lasttest mit gleicher Last. Bestanden, wenn alles stimmt, ohne Fehler und mit p95 unter 1 s. Die Abweichung zu deinen Werten wird protokolliert, entscheidet aber nicht.
4. Lokal meldet `make check` Level 1–9 bestanden und meldet sie an die Live-API.
