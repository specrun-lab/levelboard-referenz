# Level 5 – Frontend + Backend

**Ziel:** Die Seite zeigt die Ergebnisse **live aus dem Backend**. nginx leitet `/api/` an das Backend weiter, die Seite nutzt nur ihre eigene Adresse (keine Probleme mit CORS). `make check` meldet seine Ergebnisse zusätzlich ans Backend. Damit misst sich die App selbst und zeigt es live an.

Die Levels 1–4 bleiben **unverändert** prüfbar. Die Seite kennt deshalb zwei Quellen und nimmt die, die eine Einstellung im Build vorgibt.

## Liefergegenstände
- `frontend/public/config.json` mit `{"source":"file"}` und die Logik der beiden Quellen (siehe `05-datenmodell.md`)
- Kopfzeile mit Quelle, Hinweis „Backend nicht erreichbar“ (siehe `06-design.md`)
- `frontend/nginx-api.conf`
- `Makefile` mit `level5` und öffentlichem `stop-backend` (siehe `03-architektur.md`)
- `checks/write-results.mjs` mit Meldung an die API
- `checks/tests/level5.spec.ts`

## nginx mit Weiterleitung (`frontend/nginx-api.conf`)
- Inhalt wie `frontend/nginx.conf` (alle Regeln aus Level 2 und die Regel für `/config.json`), dazu **ein** zusätzlicher Block:
  ```nginx
  location /api/ {
    proxy_pass http://127.0.0.1:8081;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    charset off;
    add_header Cache-Control "no-store" always;
  }
  ```
- `charset off` ist **nötig**. Sonst hängt nginx wegen `charset_types` an die JSON-Antworten des Backends `; charset=utf-8` an, und `Content-Type` wäre nicht mehr exakt `application/json`.
- Statuscodes, Fehler-JSON und Header des Backends kommen unverändert an. Auch ein 404 unter `/api/` ist das JSON des Backends, keine Fehlerseite von nginx.
- In **beiden** Dateien bekommt `/config.json` den Header `Cache-Control: no-store` (wie `/results.json`).

## Prüfsuite für Level 5
`checks/tests/level5.spec.ts`: genau eine Gruppe `test.describe('level-5', …)`, seriell, mit genau diesen 5 Tests in dieser Reihenfolge und mit wörtlichen Titeln. Alle Anfragen gehen über `BASE_URL` (Port 8080). Für den direkten Vergleich wird `API_URL` (Port 8081) verwendet.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Seite liest aus dem Backend` | `GET /config.json` → `{"source":"api"}`; die Seite erreicht `data-state="ok"`; `run-source` hat `data-source="api"` und den Text `Backend` |
| 2 | `nginx leitet /api/ an das Backend weiter` | `GET /api/health` über 8080 → 200, `content-type` exakt `application/json`, Body gleich dem direkten Aufruf an 8081; `GET /api/unbekannt` → 404 mit `error` |
| 3 | `Gemeldetes Ergebnis erscheint ohne Neuladen` | Seite öffnen; `POST /api/levels/1/result` (bestanden, `durationMs` 4242) über 8080; **ohne Neuladen** zeigt die Karte von Level 1 innerhalb von 8 s die Dauer `4,2 s` und den Status `bestanden` |
| 4 | `Backend-Ausfall wird angezeigt` | Seite öffnen; Anfragen an `/api/levels` im Browser mit `page.route` auf eine 502-Antwort (HTML) umleiten; innerhalb von 8 s `notice` mit `data-kind="unavailable"` und 10 Karten `offen`; nach `page.unroute` verschwindet der Hinweis innerhalb von 8 s, `data-state="ok"`. Das echte Backend läuft dabei weiter |
| 5 | `Meldungen über nginx landen in der Historie` | `POST /api/levels/1/result` über 8080 (bestanden, Check `Probe über nginx`, `durationMs` 5151) → 200; `GET /api/levels/1/history?limit=1` über 8080 → der Eintrag mit genau diesen Werten |

## Ablauf, den du selbst durchspielen sollst
1. `make level5` → Seite auf 8080 mit „Quelle: Backend“, Backend auf 8081, frische Datenbank.
2. Seite im Browser offen lassen und `make check` ausführen → die Karten springen ohne Neuladen nach und nach auf „Bestanden“. Ausgabe: Levels 1–5 bestanden, danach `Level n an das Backend gemeldet` für 1–5. Exit-Code 0.
3. `make stop-backend` → die Seite zeigt nach höchstens 5 s den Hinweis „Backend nicht erreichbar“. `make restart-backend` → der Hinweis verschwindet, die Daten sind wieder da.
4. `make level4` → die Seite zeigt wieder „Quelle: Datei“.
5. Wenn es weitere Levels gibt, mit dem nächsten Level weitermachen; was am Ende laufen soll, steht in `00-start.md`.

## Bestanden, wenn (Prüfer)
1. Level 1–4 sind bestanden (damit ist auch der Datei-Modus geprüft).
2. `make level5` endet erfolgreich; 8080 und 8081 antworten; `/config.json` liefert `{"source":"api"}`; die Kopfzeile zeigt „Backend“.
3. Weiterleitung: Antworten über 8080 sind gleich den direkten an 8081 (Status, JSON, `Content-Type` exakt `application/json`), auch bei Fehlern. Die Regeln aus Level 2 gelten mit `nginx-api.conf` weiterhin. `/api/` und `/config.json` haben `Cache-Control: no-store`.
4. Live-Anzeige: Vom Prüfer gemeldete Ergebnisse (bestanden, fehlgeschlagen, gesperrt) erscheinen ohne Neuladen innerhalb von 7 s richtig.
5. Ausfall: Nach `make stop-backend` erscheinen innerhalb von 7 s der Hinweis und der Leerzustand. Nach `make restart-backend` sind die Daten wieder da und der Hinweis ist weg.
6. `make check` endet mit Exit-Code 0. `results.json` **und** `GET /api/levels` melden die Levels 1–5 als `bestanden`, mit den Checks wörtlich aus den Level-Dateien.
7. `public/results.json` und `public/config.json` sind unverändert; `make down` gibt 8080 und 8081 frei.
