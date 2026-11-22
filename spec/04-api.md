# 04 – REST-API (ab Level 3; Historie ab Level 4; Verbrauch ab Level 10)

Der verbindliche Vertrag ist **`openapi.yaml`** (OpenAPI 3.1). Diese Datei erklärt die Regeln und gibt Beispiele.

## Grundlagen
- Basis-Adresse: `http://127.0.0.1:8081`. Der Server lauscht **nur** auf `127.0.0.1:8081`. Ab Level 7 ist die Adresse über `LEVELBOARD_ADDR` einstellbar (Standard `127.0.0.1:8081`; im Container `0.0.0.0:8081`).
- Alle Antworten, auch Fehler, haben den Header `Content-Type: application/json` (exakt so, ohne `charset`).
- Level 3: Daten liegen **im Arbeitsspeicher**; ein Neustart setzt alles zurück.
- Ab Level 4: Daten liegen in einer **SQLite-Datei** (siehe `05-datenmodell.md`). Ein Neustart nur des Backends behält sie, `make level3` bzw. `make level4` beginnen mit einer frischen Datei.
- Gleichzeitige Anfragen müssen sicher sein (z. B. mit `sync.Mutex`). Viele parallele Meldungen dürfen weder abstürzen noch zu einem inkonsistenten Zustand führen.

## Startzustand
- `GET /api/levels` liefert direkt nach dem Start dasselbe wie `frontend/public/results.json`: alle 10 Levels `offen`, `updatedAt: null`.
- Abweichungen:
  - `run.id` kommt aus der Umgebungsvariablen `RUN_ID`, ohne diese `lokal`.
  - `run.version` ist `0.1.0`.
  - `run.commit` (ab Spec 0.8.0) ist der Wert der Umgebungsvariablen `LEVELBOARD_COMMIT`; ohne sie oder bei leerem Wert `null`. Lokal ist er also `null`, im Image der Commit-Hash (siehe `levels/level-08.md`). Derselbe Wert steht in jeder Antwort mit Gesamtstand und als `commit` in `/api/health`.

## Endpunkte
| Methode | Pfad | Erfolg |
|---|---|---|
| `GET` | `/api/health` | 200 `{"status":"ok","version":"0.1.0","commit":null}` |
| `GET` | `/api/levels` | 200, Gesamtstand im Format von `results.json` |
| `GET` | `/api/levels/{n}` | 200, ein Level-Objekt |
| `POST` | `/api/levels/{n}/result` | 200, der neue Gesamtstand (wie `GET /api/levels`) |
| `GET` | `/api/levels/{n}/history?limit=50` | 200, die Historie von Level n (ab Level 4) |
| `GET` | `/api/usage` | 200, der nachgetragene Verbrauch oder `{}` (ab Level 10) |
| `PUT` | `/api/usage` | 200, der gespeicherte Verbrauch (ab Level 10) |

`{n}` ist eine Zahl von 1 bis 10. Alles andere ergibt 404, z. B. `0`, `11`, `abc`.

## Ergebnis melden: `POST /api/levels/{n}/result`
Body:
```json
{ "checks": [ { "name": "Seite antwortet", "ok": true } ], "durationMs": 1234, "metrics": {} }
```
Feldregeln (sonst **400**):
- `checks`: 1 bis 100 Einträge; jeder hat `name` (nicht leer) und `ok` (boolean).
- `durationMs`: ganze Zahl ≥ 0. Kommazahlen sind ungültig.
- `metrics`: optional. Wenn angegeben, ein Objekt; `null` gilt wie nicht angegeben.
- **Unbekannte Felder** sind ungültig, sowohl im Body als auch in den Checks.

Regeln (der **Server** setzt sie durch, nicht der Melder):
1. Ist eines der Levels `1 … n-1` **nicht** `bestanden`, antwortet der Server mit **409** und ändert nichts.
2. Das Level `n` bekommt:
   - `status`: `bestanden`, wenn alle Checks `ok` sind, sonst `fehlgeschlagen`
   - `checkedAt`: jetzt (UTC, Format wie JavaScript `toISOString()`, z. B. `2026-11-21T09:14:00.000Z`)
   - `durationMs`, `checks` und `metrics` (ohne Angabe `{}`) aus dem Body
   - `title`: immer der feste Titel aus `01-produkt.md`
3. Alle Levels **über** `n` werden geleert (`checkedAt`, `durationMs` = `null`, `checks` = `[]`, `metrics` = `{}`). Ihr Status wird `offen`, wenn `n` bestanden ist, sonst `gesperrt`.
4. `run.updatedAt` bekommt denselben Zeitpunkt wie `checkedAt`.
5. Ab Level 4 entsteht zusätzlich ein Eintrag in der Historie (siehe unten).

## Historie: `GET /api/levels/{n}/history` (ab Level 4)
Liefert alle **angenommenen** Meldungen zu Level n, **neueste zuerst** (nach `id` absteigend):
```json
{ "level": 2, "entries": [
  { "id": 7, "status": "bestanden", "checkedAt": "2026-11-21T09:14:00.000Z", "durationMs": 120,
    "checks": [ { "name": "a", "ok": true } ], "metrics": {} }
] }
```
- `id`: fortlaufende Nummer über alle Levels (Spalte `reports.id`).
- `status` ist nur `bestanden` oder `fehlgeschlagen`.
- Die übrigen Felder sind genau so, wie sie bei der Meldung im Level gespeichert wurden.
- `limit`: optional, ganze Zahl von 1 bis 500, Standard 50; sonst **400**.
- Keine Meldungen: `"entries": []`.
- Meldungen mit 409 erscheinen **nicht**.
- Wird ein höheres Level durch eine neue Meldung geleert, bleibt seine Historie erhalten.

## Verbrauch: `GET` und `PUT /api/usage` (ab Level 10)
Tokens und Kosten des Laufs misst **nicht** der Agent, sondern der Runner von Specrun **nach** der Prüfung (`02-startausruestung.md`). Er trägt sie mit `PUT /api/usage` auf der Live-Seite nach. Das Backend speichert sie nur und liefert sie wieder aus; es prüft ihren Inhalt nicht.
- `PUT /api/usage`: Body ist ein beliebiges **JSON-Objekt** (Format in `05-datenmodell.md`, „Verbrauch“). Es **ersetzt** den bisherigen Stand vollständig. Antwort 200 mit genau dem gespeicherten Objekt. `{}` leert den Verbrauch.
- `GET /api/usage`: 200 mit dem zuletzt gespeicherten Objekt, vor dem ersten `PUT` `{}`.
- Gespeichert wird in der Datei `usage.json` **im selben Ordner wie die Datenbank** (`LEVELBOARD_DB`, also lokal `.run/usage.json`, im Container `/data/usage.json`). So übersteht der Verbrauch Neustarts und Deploys. Schreiben atomar (temporäre Datei, dann umbenennen).
- Fehler bei `PUT`, in dieser Reihenfolge: falscher `Content-Type` → 415; Body größer als 64 KB → 413; kein gültiges JSON oder kein Objekt (z. B. Array, Zahl, `null`) → 400. Andere Methoden als `GET` und `PUT` → 405 mit `Allow: GET, PUT`. Ein abgelehnter `PUT` ändert nichts.
- Die Meldungen der Levels (`POST /api/levels/{n}/result`) berühren den Verbrauch nicht.

## Fehler
Immer als `{"error":"<Text in Deutsch>"}`:

| Code | Wann |
|---|---|
| 400 | ungültiges JSON, fehlende, falsche oder unbekannte Felder |
| 400 | bei der Historie: ungültiges `limit` |
| 404 | unbekanntes Level oder unbekannter Pfad (auch außerhalb von `/api/`) |
| 405 | falsche Methode (z. B. `DELETE /api/levels`, `GET /api/levels/1/result`), mit Header `Allow` (z. B. `Allow: GET`) |
| 409 | ein niedrigeres Level ist nicht bestanden |
| 413 | Body größer als 64 KB (65 536 Bytes) |
| 415 | `Content-Type` ist nicht `application/json`; Parameter wie `; charset=utf-8` sind erlaubt |

Reihenfolge der Prüfung bei `POST /api/levels/{n}/result`:
1. `n` gültig, sonst 404
2. Methode, sonst 405
3. `Content-Type`, sonst 415
4. Größe, sonst 413
5. Body, sonst 400
6. Reihenfolge, sonst 409

## Beispiel
```
POST /api/levels/2/result     (Level 1 ist noch offen)
→ 409 {"error":"ein niedrigeres Level ist nicht bestanden"}

POST /api/levels/1/result  {"checks":[{"name":"a","ok":false}],"durationMs":5}
→ 200 … levels[0].status = "fehlgeschlagen", levels[1..9].status = "gesperrt"
```
