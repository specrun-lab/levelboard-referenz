# 05 – Datenmodell

## results.json
Die Ergebnisse aller Levels liegen in einer JSON-Datei. Ihr Format ist in **`results.schema.json`** verbindlich festgelegt (JSON Schema 2020-12). Es ist zugleich das Format der späteren REST-Antwort `GET /api/levels`.

Beispiel:
```json
{
  "run": { "id": "2026-11-21-01", "version": "0.1.0", "commit": null, "updatedAt": "2026-11-21T10:15:00.000Z" },
  "levels": [
    {
      "level": 1,
      "title": "Statische Seite",
      "status": "bestanden",
      "checkedAt": "2026-11-21T10:14:58.000Z",
      "durationMs": 2310,
      "checks": [ { "name": "Seite antwortet mit HTTP 200", "ok": true } ],
      "metrics": {}
    }
  ]
}
```
Das Beispiel zeigt nur einen der immer genau 10 Einträge in `levels`.

Feldregeln:
- `levels` enthält **immer genau 10** Einträge, jede Nummer 1–10 genau einmal, aufsteigend sortiert.
- `title` entspricht dem Titel aus `01-produkt.md`.
- Zeitangaben sind ISO-8601 in UTC (`new Date().toISOString()`).
- `durationMs` ist eine ganze Zahl.
- Ein Level mit Status `offen` oder `gesperrt` hat `checkedAt: null`, `durationMs: null`, `checks: []`.
- `metrics` enthält die Kennzahlen des Levels, siehe „Kennzahlen pro Level“ unten. Ein Level ohne Kennzahlen hat `{}`.

## Startzustand: `frontend/public/results.json`
- `run`: `{ "id": "lokal", "version": "0.1.0", "commit": null, "updatedAt": null }`
- alle 10 Levels mit `status: "offen"`, `checkedAt: null`, `durationMs: null`, `checks: []`, `metrics: {}`
- Formatierung: `JSON.stringify(daten, null, 2)` plus abschließender Zeilenumbruch

Diese Datei wird **nie** von der Prüfsuite verändert. Jedes `make level1` baut neu und beginnt damit wieder bei „alles offen“.

## Laden in der Seite
Die Seite lädt die Datei **zur Laufzeit** mit `fetch('/results.json', { cache: 'no-store' })`; sie ist nicht in das JS-Bundle eingebaut. Daraus ergibt sich der Ladezustand:

| Fall | Zustand |
|---|---|
| Anfrage läuft noch | `loading` |
| Netzwerkfehler, HTTP 404, oder Antwort mit HTTP 2xx und `Content-Type` mit `text/html` (SPA-Fallback des Servers) | `missing` |
| sonstiger HTTP-Fehler, JSON nicht lesbar, oder Daten verletzen das Schema | `invalid` |
| gültige Daten | `ok` |

Die Prüfung ist **streng**: Jede Abweichung vom Schema macht die ganze Datei ungültig. Insbesondere gilt die Datei als ungültig bei:
- fehlenden Feldern,
- falschen Typen,
- unbekanntem Status,
- nicht genau 10 Levels,
- doppelten oder fehlenden Nummern,
- Zeitangaben, die `Date.parse` nicht lesen kann.

Im Zustand `loading`, `missing`, `invalid` und `unavailable` zeigt die Seite den Leerzustand: `run.id` und `run.version` als „–“, `updatedAt` als „–“, alle 10 Levels `offen`.

## Datenquelle: `config.json` (ab Level 5)
- `frontend/public/config.json` enthält `{"source":"file"}` (mit Zeilenumbruch) und gehört damit zu jedem Build. Die Prüfsuite verändert die Datei nie.
- `make level5` überschreibt nach dem Build **`frontend/dist/config.json`** mit `{"source":"api"}`.
- Die Seite lädt **vor allem anderen** `fetch('/config.json', { cache: 'no-store' })`:
  - `source` ist `"api"` → **API-Modus**
  - sonst, oder bei Fehler, 404, HTML oder ungültigem JSON → **Datei-Modus**
- **Datei-Modus:** unverändert wie oben (`/results.json`, einmalig).
- **API-Modus:** `fetch('/api/levels', { cache: 'no-store' })` über dieselbe Adresse wie die Seite, danach **alle 5000 ms** erneut. Der nächste Abruf startet 5000 ms nach dem Ende des vorigen. Ladezustand:

  | Fall | Zustand |
  |---|---|
  | Anfrage läuft (nur beim ersten Mal) | `loading` |
  | Netzwerkfehler, HTTP-Status außerhalb 2xx, oder Antwort mit `Content-Type` `text/html` | `unavailable` |
  | JSON nicht lesbar oder Schema verletzt (gleiche strenge Prüfung wie oben) | `invalid` |
  | gültige Daten | `ok` |

  - Bei `unavailable` zeigt die Seite **keine** veralteten Daten, sondern den Leerzustand.
  - Ist das Backend wieder erreichbar, wechselt der nächste Abruf zurück zu `ok`.

## Melden an das Backend (ab Level 5) und an die Live-API (ab Level 9)
`write-results.mjs` meldet zusätzlich ans Backend, wenn die Umgebungsvariable `REPORT_API=1` gesetzt ist. `make check` setzt sie ab Level 5. Ab Level 9 setzt `make check` außerdem `REPORT_LIVE=1` und `LIVE_URL`: Dann meldet es nach dem lokalen Backend **zusätzlich** an `<LIVE_URL>`, nach denselben Regeln. Dort lauten die Zeilen `Level <n> an die Live-API gemeldet` bzw. `Meldung an die Live-API für Level <n> fehlgeschlagen: <status> <text>`. Ablauf:
1. Zuerst wie oben `frontend/dist/results.json` schreiben und die Zeilen `Level <n>: …` ausgeben.
2. Dann für die angegebenen Levels **aufsteigend** je `POST <API_URL>/api/levels/<n>/result` mit `{"checks": [...], "durationMs": <dauer>, "metrics": <metrics>}`. `metrics` ist dasselbe Objekt wie in `results.json` (siehe „Kennzahlen pro Level“). `API_URL` ist Standard `http://127.0.0.1:8081`; die Checks und die Dauer sind dieselben wie in `results.json`.
3. Nach jeder erfolgreichen Meldung die Zeile `Level <n> an das Backend gemeldet` ausgeben.
4. Nach einem Level mit nicht bestandenem Check **aufhören**, weil höhere Meldungen ohnehin 409 ergäben.
5. Antwortet das Backend nicht mit 200, die Zeile `Meldung an das Backend für Level <n> fehlgeschlagen: <status> <text>` ausgeben und aufhören.
6. Exit-Code 0 nur, wenn kein Level fehlgeschlagen ist **und** alle Meldungen angenommen wurden.

## Ergebnis schreiben: `checks/write-results.mjs`
Aufruf: `node write-results.mjs <level> [<level> …]`, z. B. `node write-results.mjs 1 2`. Ablauf:
1. Liest `checks/.out/playwright.json`, den JSON-Report von Playwright.
2. Sammelt für jedes angegebene Level alle Tests aus der `describe`-Gruppe `level-<n>`:
   - Jeder Test ergibt einen Check `{ name: <Testtitel>, ok: … }`, in Report-Reihenfolge. `ok` ist nur `true`, wenn `spec.ok` wahr ist **und** jeder Eintrag in `spec.tests` den `status` `expected` oder `flaky` hat. Ein übersprungener Test (`skipped`, z. B. nach einem Fehler in einer seriellen Gruppe oder einer Projekt-Abhängigkeit) zählt als **nicht** bestanden.
   - Die Dauer des Levels ist die Summe der Testdauern (`results[].duration`) dieser Gruppe, gerundet.
   - Findet es für ein angegebenes Level keinen Check, bricht es mit Fehler ab.
3. Liest `frontend/dist/results.json`, also den ausgelieferten Build, **nicht** `public/`.
4. Geht die Levels **aufsteigend** durch. Für jedes angegebene Level, solange noch keines fehlgeschlagen ist:
   - `status`: `bestanden`, wenn alle Checks ok sind, sonst `fehlgeschlagen`
   - `checkedAt`: jetzt
   - `durationMs`: die Dauer aus Schritt 2
   - `checks`: die gesammelten Checks
   - `metrics`: siehe „Kennzahlen pro Level“ (wird nach dem Status aller Levels bestimmt)
5. Alle übrigen Levels **oberhalb des kleinsten angegebenen Levels** werden gesetzt auf:
   - `gesperrt`, wenn ein Level fehlgeschlagen ist,
   - sonst `offen`,

   jeweils mit `checkedAt: null`, `durationMs: null`, `checks: []`, `metrics: {}`. Das gilt auch für angegebene Levels nach einem Fehler. Levels unterhalb des kleinsten angegebenen bleiben unverändert.
6. Setzt `run.updatedAt` auf denselben Zeitpunkt. Ist `RUN_ID` gesetzt, wird `run.id` auf deren Wert gesetzt.
7. Schreibt die Datei zurück (`JSON.stringify(…, null, 2)` + Zeilenumbruch).
8. Gibt pro angegebenem Level eine Zeile aus: `Level <n>: <status> (x/y Checks)`, bzw. ohne Klammer, wenn das Level keine Checks hat. Endet mit Exit-Code 0, wenn kein Level fehlgeschlagen ist, sonst 1.

`vite preview` liefert die geänderte Datei sofort aus. Nach einem Neuladen zeigt die Seite das neue Ergebnis.

## Kennzahlen pro Level (`metrics`)
`write-results.mjs` setzt `metrics` für jedes geprüfte Level (`bestanden` oder `fehlgeschlagen`), nachdem der Status aller Levels feststeht. Alle anderen Levels bekommen `{}`.

| Feld | bei | gesetzt, wenn | Inhalt |
|---|---|---|---|
| `tokens` | jedem geprüften Level, ab Level 1 | das Session-Protokoll lesbar ist | Verbrauch der Phase, siehe unten |
| `pipeline` | Level 6 | Level 6 bestanden | `pipelineOf(GITHUB_REPO, HEAD)` aus `checks/collect-report.mjs` |
| `images` | Level 7 | Level 7 bestanden | `{ frontendMB, backendMB }` über `imageSizeMB(…)` aus `checks/collect-report.mjs` |
| `loadtest` | Level 9 | Level 9 bestanden und `checks/.out/loadtest.json` vorhanden | Inhalt dieser Datei |

Kann eine Kennzahl nicht ermittelt werden (z. B. kein Protokoll oder `gh` nicht erreichbar), fehlt nur dieses Feld. `write-results.mjs` gibt dann eine Zeile mit dem Grund aus und arbeitet weiter.

`checks/collect-report.mjs` (ab Level 6) exportiert:
- `pipelineOf(repo, sha)`: Lauf von `CI` für `sha` auf `main` (`gh api repos/<repo>/actions/workflows/ci.yml/runs?branch=main&head_sha=<sha>&per_page=1`). Ergebnis: `{ runId, url, jobs, totalS }` mit `runId` = `id`, `url` = `html_url`, `jobs` = Objekt Jobname → Sekunden von `started_at` bis `completed_at` (gerundet, nur abgeschlossene Jobs) und `totalS` = Sekunden von `run_started_at` bis zum spätesten `completed_at`, gerundet.
- `async imageSizeMB(name, tag)`: Image `ghcr.io/<name>:<tag>` ohne Anmeldung gelesen, wie in Level 7. Bei einem Index gilt der Eintrag `linux/amd64`. Wert: Summe der `size` aller `layers`, geteilt durch 1024 · 1024, auf 1 Nachkommastelle gerundet.

### Verbrauch pro Level: `checks/collect-tokens.mjs` (ab Level 1)
Claude Code legt die Protokolle deiner Session unter `~/.claude/projects/` ab (`*.jsonl`, auch in Unterordnern). Daraus ermittelt das Modul den Verbrauch je Level. Es exportiert mindestens `levelTokens(current, dir)`; `current` ist der Status je geprüftem Level dieses Laufs, aufsteigend. Ergebnis: je Level ein Token-Objekt oder `{ "inLevel": n }`.

**Protokoll lesen.** Jede Zeile ist ein JSON-Objekt; ungültige Zeilen überspringen.
- **Antworten:** Zeilen mit `type: "assistant"` und `message.usage`. Jede `message.id` zählt nur einmal (die erste Zeile gilt). `message.model` = `<synthetic>` zählt nicht. Zeitpunkt ist `timestamp`.
- **Befehle:** In den Antworten die Blöcke `content[]` mit `type: "tool_use"` und `name: "Bash"`, gemerkt als `id` → `input.command`.
- **Ausgaben:** Zeilen mit `type: "user"`:
  - Hat die Zeile `toolUseResult` mit `stdout` oder `stderr`, ist die Ausgabe `stdout + "\n" + stderr`. Sie gehört zu `tool_use_id` des ersten Blocks `tool_result` in `message.content`.
  - Enthält der Text der Zeile `<task-notification>`, ist er die Ausgabe des Befehls mit der `id` aus `<tool-use-id>…</tool-use-id>` (Hintergrundbefehle).

**Phasengrenzen.** Die Ausgaben werden nach Zeit sortiert. Es zählen nur Ausgaben von Befehlen, die `make check` enthalten (Muster `make\s+check\b`). Für jede solche Ausgabe ist das erreichte Level das höchste `n`, für das `Level 1: bestanden` … `Level n: bestanden` alle darin vorkommen. Liegt es über dem bisher besten, entsteht eine Grenze `{ t, from: best + 1, to: n }`.

**Phasen.** Eine Phase umfasst alle Antworten nach der vorigen Grenze bis einschließlich ihrer eigenen. Ihr Verbrauch gehört zum Level `to`; die Levels `from` bis `to − 1` bekommen `{ "inLevel": to }`. Danach kommt die laufende Phase, also alle Antworten nach der letzten Grenze:
- Erreicht dieser Lauf (`current`) ein höheres Level als das beste bisher, gehört sie zu diesem Level. Die neuen Levels darunter bekommen `{ "inLevel": … }`, und ein fehlgeschlagenes Level darüber bekommt ein Token-Objekt mit lauter Nullen.
- Sonst gehört sie zum fehlgeschlagenen Level dieses Laufs, falls es über dem besten liegt.

Nur geprüfte Levels bekommen einen Eintrag. Ein Level, das schon früher bestanden wurde, behält so seinen Wert, auch über spätere `make check` hinweg.

**Token-Objekt:**
```json
{ "models": ["claude-sonnet-5-5"], "responses": 22, "input": 44, "cacheWrite5m": 0, "cacheWrite1h": 80734,
  "cacheRead": 1302190, "output": 56103, "total": 1439071, "costUsd": 1.2,
  "from": "2026-11-20T15:57:12.000Z", "until": "2026-11-20T16:04:50.000Z" }
```
| Feld | aus `message.usage` der Antworten der Phase |
|---|---|
| `input` | Summe `input_tokens` |
| `cacheWrite1h` | Summe `cache_creation.ephemeral_1h_input_tokens` (fehlt `cache_creation`: 0) |
| `cacheWrite5m` | Summe `cache_creation.ephemeral_5m_input_tokens`; fehlt `cache_creation`, dann `cache_creation_input_tokens` |
| `cacheRead` | Summe `cache_read_input_tokens` |
| `output` | Summe `output_tokens` |

- Fehlende Werte zählen als 0. `total` ist die Summe der fünf Felder.
- `models`: alle Modelle der Phase, alphabetisch, ohne Doppelte. `responses`: Anzahl der Antworten.
- `from` und `until`: `timestamp` der ersten und der letzten Antwort als ISO-Zeit, bei keiner Antwort `null`.
- `costUsd`: Tokens mal Preis des jeweiligen Modells (USD pro Million Tokens), über die Phase summiert und auf 2 Nachkommastellen gerundet. Ein Modell, das nicht in der Tabelle steht, ist ein Fehler.

| Modell | Eingabe | Cache schreiben 5 min | Cache schreiben 1 h | Cache lesen | Ausgabe |
|---|---|---|---|---|---|
| `claude-opus-5-5` | 4 | 5 | 8 | 0.2 | 20 |
| `claude-sonnet-5-5` | 2 | 2.5 | 4 | 0.1 | 10 |
| `claude-haiku-5-5` | 0.1 | 0.125 | 0.2 | 0.01 | 0.5 |

Gibt es kein Protokoll oder keine Antwort, bekommt kein Level `tokens`. Was nach dem letzten `make check` noch verbraucht wird, steht in keinem Level.

## Datenbank (ab Level 4)
Das Backend speichert in einer SQLite-Datei (Pfad aus `LEVELBOARD_DB`, Standard `.run/levelboard.db`). Das Schema ist **exakt** so anzulegen, mit Spalten in dieser Reihenfolge:

```sql
CREATE TABLE levels (
  level        INTEGER PRIMARY KEY CHECK (level BETWEEN 1 AND 10),
  status       TEXT    NOT NULL CHECK (status IN ('offen','bestanden','fehlgeschlagen','gesperrt')),
  checked_at   TEXT,
  duration_ms  INTEGER,
  checks       TEXT    NOT NULL DEFAULT '[]',
  metrics      TEXT    NOT NULL DEFAULT '{}'
);
CREATE TABLE reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  level        INTEGER NOT NULL REFERENCES levels(level),
  status       TEXT    NOT NULL CHECK (status IN ('bestanden','fehlgeschlagen')),
  checked_at   TEXT    NOT NULL,
  duration_ms  INTEGER NOT NULL,
  checks       TEXT    NOT NULL,
  metrics      TEXT    NOT NULL
);
CREATE INDEX reports_level ON reports(level, id);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
```

Bedeutung:
- `levels`: der aktuelle Stand, eine Zeile pro Level.
  - `checked_at`: Zeitpunkt im Format von `toISOString()`, `NULL` solange nicht geprüft
  - `checks`: JSON-Array der Checks
  - `metrics`: JSON-Objekt
- `reports`: die **Historie**. Jede angenommene Meldung ergibt genau eine Zeile; Meldungen mit 409 erzeugen keine.
- `meta`: Schlüssel `updated_at` ist der Wert für `run.updatedAt`. Fehlt die Zeile, ist `updatedAt` `null`.

**Migration:** Beim Start liest das Backend `PRAGMA user_version`. Bei 0 legt es in **einer Transaktion** das Schema an, fügt die 10 Zeilen in `levels` mit `status = 'offen'` ein (sonst Standardwerte) und setzt `PRAGMA user_version = 1`. Bei 1 ändert es nichts.

`run.id` und `run.version` werden **nicht** gespeichert. Sie kommen wie in Level 3 aus `RUN_ID` bzw. sind fest `0.1.0`.
