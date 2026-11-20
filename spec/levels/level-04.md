# Level 4 – Datenbank

**Ziel:** Das Backend speichert alles in einer **SQLite-Datei** statt im Arbeitsspeicher und führt eine **Historie** aller angenommenen Meldungen. Ein Neustart nur des Backends behält die Daten. Ein Neustart über `make level3` oder `make level4` beginnt mit einer frischen Datenbank.

Das Verhalten der API aus Level 3 bleibt **unverändert**. Alle Checks aus Level 3 müssen weiterhin bestehen.

## Liefergegenstände
- Backend mit SQLite nach `05-datenmodell.md` (Abschnitt „Datenbank“)
- `GET /api/levels/{n}/history` nach `04-api.md` und `openapi.yaml`
- `Makefile` mit `level4` und `restart-backend` (siehe `03-architektur.md`)
- Go-Tests auch für Datenbank, Historie und Persistenz
- `checks/tests/level4.spec.ts`

## Bibliothek und Abhängigkeit
- **Genau eine** direkte Abhängigkeit: `modernc.org/sqlite` in Version **v1.62.0**. Sie ist in reinem Go geschrieben, im Container gibt es keinen C-Compiler. Ihre indirekten Abhängigkeiten stehen wie üblich als `// indirect` in `go.mod`, dazu kommt `go.sum`.
- Der Zugriff läuft über `database/sql` mit dem Treiber-Namen `sqlite`, eingebunden per `import _ "modernc.org/sqlite"`.
- Ansonsten gilt weiterhin: nur die Go-Standardbibliothek.
- `go.mod` und `go.sum` werden mitgeliefert. Das Herunterladen der Module braucht Internet, ist im Container also möglich.

## SQLite richtig einsetzen (verbindlich)
- Datenbankpfad aus der Umgebungsvariablen `LEVELBOARD_DB`, Standard `.run/levelboard.db`. Der Ordner wird bei Bedarf angelegt.
- Verbindungszeichenkette mit den Pragmas `journal_mode(WAL)`, `busy_timeout(5000)` und `foreign_keys(1)`, z. B. `file:<pfad>?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)`.
- **Genau eine offene Verbindung:** `db.SetMaxOpenConns(1)`. So laufen alle Zugriffe nacheinander, und keine Meldung geht bei gleichzeitigen Anfragen verloren.
- Eine Meldung (Prüfung der Reihenfolge, Eintrag in `reports`, Änderung von `levels` und `meta`) läuft in **einer Transaktion**. Bei einem Konflikt (409) wird nichts geschrieben.
- Innerhalb einer offenen Transaktion nur über die Transaktion lesen und schreiben, nie zusätzlich über `db`. Bei einer einzigen Verbindung würde das sonst blockieren.

## Prüfsuite für Level 4
`checks/tests/level4.spec.ts`: genau eine Gruppe `test.describe('level-4', …)`, seriell, mit genau diesen 5 Tests in dieser Reihenfolge und mit wörtlichen Titeln. Die Adresse des Backends kommt aus `API_URL`.

Für Test 5 öffnet die Prüfsuite die Datenbankdatei mit dem in Node eingebauten `node:sqlite` (`new DatabaseSync('<projekt>/.run/levelboard.db', { readOnly: true })`). Es ist keine zusätzliche Abhängigkeit nötig.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Meldungen erscheinen in der Historie, neueste zuerst` | zwei Meldungen an Level 1 (bestanden, `durationMs` 101 und 102) → `GET /api/levels/1/history`: 200, `level` 1, der erste Eintrag hat 102, der zweite 101, die `id` des ersten ist größer, Status `bestanden` |
| 2 | `Historie begrenzt mit limit` | `?limit=1` → genau 1 Eintrag; `?limit=0` und `?limit=501` → 400 |
| 3 | `Daten überstehen einen Neustart des Backends` | Historie (`?limit=500`) und `GET /api/levels` merken, dann `make restart-backend` im Projektordner ausführen; danach sind beide unverändert |
| 4 | `Abgelehnte Meldungen landen nicht in der Historie` | Level 1 fehlgeschlagen melden; dann eine Meldung an Level 2 → 409; die Historie von Level 2 hat danach gleich viele Einträge wie vorher |
| 5 | `Datenbank hat das vorgegebene Schema` | `PRAGMA user_version` = 1; die Spalten von `levels`, `reports` und `meta` exakt und in der Reihenfolge wie in `05-datenmodell.md`; `levels` hat 10 Zeilen |

Außerdem: `checks/playwright.config.ts` bekommt `workers: 1`. Die Testdateien laufen damit nacheinander, weil die API-Tests den gemeinsamen Zustand des Backends verändern.

## Ablauf, den du selbst durchspielen sollst
1. `make level4` → Seite auf 8080, Backend auf 8081, frische `.run/levelboard.db`; Ausgabe zusätzlich `Datenbank: .run/levelboard.db`.
2. `make check` → Level 1 (5/5), 2 (7/7), 3 (8/8) und 4 (5/5) bestanden, Exit-Code 0.
3. `make restart-backend` → das Backend läuft wieder, die Daten sind erhalten.
4. `make level4` erneut → wieder der Startzustand.
5. Wenn es weitere Levels gibt, mit dem nächsten Level weitermachen; was am Ende laufen soll, steht in `00-start.md`.

## Bestanden, wenn (Prüfer)
1. Level 1–3 sind bestanden.
2. `make level4` endet erfolgreich; 8080 und 8081 antworten; `.run/levelboard.db` existiert.
3. Die Datenbankdatei hat exakt das Schema aus `05-datenmodell.md` und `user_version` 1. Nach Meldungen stimmen Datei und API überein.
4. Die Historie stimmt: Reihenfolge, Inhalte, `limit` samt Fehlerfällen; Meldungen mit 409 sind nicht enthalten.
5. Nach `make restart-backend` sind Stand und Historie unverändert. Nach `make level4` ist der Startzustand wiederhergestellt.
6. 100 gleichzeitige Meldungen ergeben keinen Fehler 5xx und **genau** 100 neue Einträge in der Historie; der Endzustand ist konsistent.
7. Der API-Vertrag aus Level 3 gilt weiterhin.
8. `go.mod` hat genau die eine direkte Abhängigkeit `modernc.org/sqlite v1.62.0`; `go vet ./...` ist sauber, `go test ./...` grün.
9. `make check` endet mit Exit-Code 0; die Levels 1–4 sind `bestanden`, mit den Checks wörtlich aus den Level-Dateien; die Startdatei ist unverändert; `make down` gibt 8080 und 8081 frei.
