# Level 3 – REST-Backend

**Ziel:** Ein Backend in Go stellt die Level-Ergebnisse über eine REST-API bereit und setzt die Regeln beim Melden selbst durch. Die Daten liegen vorerst **im Arbeitsspeicher**.

In Level 3 liest die Seite weiter `results.json`, und `make check` schreibt weiter dorthin. Erst Level 5 verbindet Seite und Backend.

## Liefergegenstände
- `backend/` – Go-Modul, **nur Standardbibliothek**:
  - `go.mod` mit `module levelboard/backend` und `go 1.27`, **ohne** `require` (ab Level 4 genau eine Abhängigkeit, siehe `level-04.md`)
  - Quelltext im Paket `main` direkt in `backend/`, z. B. `main.go`, `store.go` und `handlers.go`
  - **Go-Tests** (`*_test.go`) für die Regeln und die Fehlerfälle
  - das gebaute Programm liegt in `backend/bin/levelboard-backend` (nicht versioniert)
- `Makefile` mit `level3` sowie erweitertem `check` und `down` (siehe `03-architektur.md`)
- `checks/tests/level3.spec.ts`

## Backend
- Verhalten exakt nach `04-api.md` und `openapi.yaml`.
- Routing mit den Mustern von `net/http`, z. B. `/api/levels/{n}` und `r.PathValue("n")`. Kein Router-Paket.
- Lauscht auf `127.0.0.1:8081`. Schreibt pro Anfrage eine Logzeile nach stdout, die `make level3` in `.run/backend.log` umleitet.
- Bei `SIGTERM` oder `SIGINT` beendet es sich sauber (`http.Server.Shutdown`) mit Exit-Code 0.
- `go vet ./...` meldet nichts.

## Prüfsuite für Level 3
`checks/tests/level3.spec.ts` enthält genau eine Gruppe `test.describe('level-3', …)`. Sie läuft seriell (`test.describe.configure({ mode: 'serial' })`), weil die Tests den Zustand des Backends verändern. Sie enthält genau diese 8 Tests, in dieser Reihenfolge und mit wörtlichen Titeln. Die Adresse des Backends kommt aus `API_URL`, Standard `http://127.0.0.1:8081`.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Backend antwortet auf /api/health` | 200, `content-type` exakt `application/json`, Body `{"status":"ok","version":<string>,"commit":null}` (lokal ist `LEVELBOARD_COMMIT` nicht gesetzt) |
| 2 | `GET /api/levels liefert alle 10 Levels im Schema` | 200, Schlüssel genau `run` und `levels`, 10 Levels mit `level` 1–10, gültigem Status und `checks` als Array |
| 3 | `Ergebnis melden setzt Status und Zeitpunkt` | `POST /api/levels/1/result` mit einem bestandenen Check und `durationMs: 10` → 200, Level 1 `bestanden`, `checkedAt` ein gültiges Datum, `durationMs` 10 |
| 4 | `Fehlschlag sperrt höhere Levels` | `POST /api/levels/1/result` mit einem nicht bestandenen Check → Level 1 `fehlgeschlagen`, Levels 2–10 `gesperrt` |
| 5 | `Falsche Reihenfolge ergibt 409` | danach `POST /api/levels/2/result` → 409 mit `error` |
| 6 | `Ungültige Anfragen ergeben 400` | `{kaputt`, Body ohne `checks`, Body mit leerem `checks` → jeweils 400 mit `error` |
| 7 | `Unbekanntes Level ergibt 404` | `GET /api/levels/0`, `/11`, `/abc` → 404 |
| 8 | `Go-Tests bestehen` | führt `go test -count=1 ./...` in `backend/` aus; der Test scheitert, wenn das Kommando scheitert |

## Ablauf, den du selbst durchspielen sollst
1. `make level3` → Seite auf 8080 (nginx), Backend auf 8081. Ausgabe der beiden Zeilen `Levelboard läuft auf http://127.0.0.1:8080` und `Backend läuft auf http://127.0.0.1:8081`.
2. `make check` → `Level 1: bestanden (5/5 Checks)`, `Level 2: bestanden (7/7 Checks)`, `Level 3: bestanden (8/8 Checks)`, Exit-Code 0.
3. `make down` → weder nginx noch das Backend laufen noch, beide Ports sind frei.
4. Wenn es weitere Levels gibt, mit dem nächsten Level weitermachen; was am Ende laufen soll, steht in `00-start.md`.

## Bestanden, wenn (Prüfer)
1. Level 1 und 2 sind bestanden.
2. `make level3` endet erfolgreich; 8080 und 8081 antworten innerhalb von 60 s.
3. Die API verhält sich exakt nach `openapi.yaml` und `04-api.md`: jede Antwort im Schema, alle Regeln, alle Fehlercodes in der festgelegten Reihenfolge.
4. Viele gleichzeitige Meldungen führen zu keinem Fehler 5xx und zu einem konsistenten Endzustand.
5. Nach `make down` und erneutem `make level3` ist der Startzustand wiederhergestellt.
6. `go.mod` hat keine Abhängigkeiten (bis Level 3; ab Level 4 siehe `level-04.md`), `go vet ./...` ist sauber, `go test ./...` ist grün. Die Testabdeckung wird als Nebenwert erfasst.
7. `make check` endet mit Exit-Code 0. `results.json` meldet die Levels 1–3 als `bestanden`, mit den Checks wörtlich aus den Level-Dateien.
8. `make down` beendet nginx und das Backend.
