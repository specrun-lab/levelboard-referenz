# Level 1 – Statische Seite

**Ziel:** Die Levelboard-Seite als gebaute statische Seite, lokal gestartet, mit einer eigenen Prüfsuite, die ihr Ergebnis auf der Seite sichtbar macht.

## Liefergegenstände
- `frontend/` vollständig nach `03-architektur.md`, `05-datenmodell.md` und `06-design.md`
- `checks/` mit `tests/level1.spec.ts`, `write-results.mjs` und `bauzeit.mjs`: Schon ab Level 1 bekommt jedes bestandene Level seine Bauzeit als `metrics.build` (siehe `05-datenmodell.md`, „Bauzeit pro Level“). Die Karten zeigen sie als „Bauzeit“, und der Abschlussbericht ist von Anfang an da (siehe `06-design.md`)
- `bauzeit.json` mit der Startzeit (siehe `00-start.md`, Schritt 0) und der Eintrag `bauzeit.json` in `.gitignore`
- `Makefile` mit `level1`, `check`, `down`
- `.gitignore`

## Prüfsuite für Level 1
`checks/tests/level1.spec.ts` enthält genau eine Gruppe `test.describe('level-1', …)` mit genau diesen 5 Tests. Die Titel sind wörtlich, denn sie werden zu den Check-Namen:

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Seite antwortet mit HTTP 200` | `GET /` liefert Status 200 und einen `Content-Type`, der `text/html` enthält |
| 2 | `Titel ist „Levelboard“` | der Seitentitel ist exakt „Levelboard“ |
| 3 | `10 Level-Karten sichtbar` | nachdem `board` nicht mehr `data-state="loading"` hat: genau 10 `level-card`, alle sichtbar |
| 4 | `Keine Konsolenfehler` | beim Laden bis zum Ende von `loading` gibt es keine Konsolenmeldung vom Typ `error` und keinen `pageerror` |
| 5 | `Handy-Ansicht: Karten einspaltig` | bei Viewport 375 × 812 haben alle `level-card` dieselbe x-Position (gerundet), und `document.documentElement.scrollWidth` ist ≤ 375 |

## Ablauf, den du selbst durchspielen sollst
1. `make level1` → Seite läuft auf `http://127.0.0.1:8080`, alle Levels „Offen“, Erreichtes Level `0 / 10`.
2. `make check` → 5/5 Checks bestanden, Ausgabe `Level 1: bestanden (5/5 Checks)`.
3. Seite neu laden → Level 1 „Bestanden“, Checks `5/5`, Erreichtes Level `1 / 10`.
4. `make level1` erneut → wieder alles „Offen“ (Neustart setzt zurück).
5. Wenn es weitere Levels gibt, mit dem nächsten Level weitermachen; was am Ende laufen soll, steht in `00-start.md`.

## Bestanden, wenn (Prüfer)
1. `make level1` endet erfolgreich, und Port 8080 antwortet innerhalb von 60 s.
2. Die Seite stellt **beliebige gültige Testdaten** korrekt dar: alle 4 Status, Erreichtes Level, Fortschrittsbalken, Fakten und Formatierungen.
3. Fehlende und ungültige `results.json` führen zum richtigen Hinweis und zum Leerzustand.
4. Alle `data-testid`s aus `06-design.md` sind vorhanden. Es gibt keine Konsolenfehler.
5. `make check` endet mit Exit-Code 0. Die erzeugte `frontend/dist/results.json` erfüllt `results.schema.json` und meldet Level 1 als `bestanden` mit den 5 Checks.
6. `frontend/public/results.json` ist nach `make check` unverändert im Startzustand.
