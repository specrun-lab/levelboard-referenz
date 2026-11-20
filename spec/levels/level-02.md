# Level 2 – Webserver

**Ziel:** Die gebaute Seite wird nicht mehr vom Vorschau-Server von Vite, sondern von **nginx** ausgeliefert. nginx ist lokal installiert (siehe `02-startausruestung.md`) und läuft ohne root-Rechte. Docker wird **nicht** verwendet.

Level 1 bleibt unverändert bestehen: `make level1` funktioniert weiterhin.

## Liefergegenstände
- `frontend/nginx.conf`
- `Makefile` mit `level2` und erweitertem `check` bzw. `down` (siehe `03-architektur.md`)
- `checks/tests/level2.spec.ts`
- `checks/write-results.mjs` für mehrere Levels (siehe `05-datenmodell.md`)

## nginx-Konfiguration (`frontend/nginx.conf`)
Gestartet wird sie aus dem Projektordner mit:
```
nginx -p "<projektordner>/" -e .run/nginx-error.log -c frontend/nginx.conf
```
Alle relativen Pfade in der Datei beziehen sich auf den Projektordner. Die Datei muss **auf Linux und macOS unverändert laufen**. Deshalb:
- **keine** `include`-Anweisung (z. B. keine externe `mime.types`), sondern ein eigener `types { … }`-Block mit mindestens: `text/html html`, `text/css css`, `application/javascript js mjs`, `application/json json`, `image/svg+xml svg`, `image/png png`, `image/x-icon ico`, `font/woff2 woff2`; `default_type application/octet-stream`
- `charset utf-8`, `charset_types text/css application/javascript application/json`
- `pid`, `error_log`, `access_log` und alle `*_temp_path` (client_body, proxy, fastcgi, uwsgi, scgi) unter `.run/` (Temp-Pfade unter `.run/nginx-tmp/`)
- kein `user`-Eintrag
- nginx läuft als Hintergrundprozess (Standard, kein `daemon off`)

Ab Spec 0.5.0 bekommt `/config.json` wie `/results.json` den Header `Cache-Control: no-store` (eigener `location = /config.json`-Block).

Verhalten, das geprüft wird (Header-Werte **exakt**):

| Anfrage | Erwartung |
|---|---|
| Server lauscht | nur auf `127.0.0.1:8080` |
| jede Antwort | Header `Server: nginx` ohne Versionsnummer (`server_tokens off`) |
| `GET /` und `GET /index.html` | 200, `Cache-Control: no-cache` |
| `GET /results.json` | 200, `Cache-Control: no-store` |
| `GET /assets/<datei>` | 200, `Cache-Control: public, max-age=31536000, immutable` |
| Header bei Fehlern | die drei `Cache-Control`-Header werden mit `always` gesetzt |
| fehlende Datei, z. B. `GET /gibt-es-nicht.json` | **404**, kein Fallback auf `index.html` |
| `Accept-Encoding: gzip` für HTML, JS, CSS, JSON | `Content-Encoding: gzip` (`gzip on`, `gzip_vary on`, `gzip_min_length 256`, `gzip_types text/css application/javascript application/json`) |

Wegen des echten 404 zeigt die Seite bei fehlender `results.json` den Hinweis „missing“ (siehe `05-datenmodell.md`).

## Prüfsuite für Level 2
`checks/tests/level2.spec.ts` enthält genau eine Gruppe `test.describe('level-2', …)` mit genau diesen 7 Tests (Titel wörtlich):

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Antwort kommt von nginx` | `GET /` → 200 und Header `server` ist exakt `nginx` |
| 2 | `results.json wird nicht zwischengespeichert` | `GET /results.json` → 200, `cache-control` exakt `no-store` |
| 3 | `index.html wird nicht zwischengespeichert` | `GET /` → `cache-control` exakt `no-cache` |
| 4 | `Assets werden ein Jahr zwischengespeichert` | die erste in `index.html` verlinkte JS-Datei unter `/assets/` → 200, `cache-control` exakt `public, max-age=31536000, immutable` |
| 5 | `Fehlende Datei ergibt 404` | `GET /gibt-es-nicht.json` → 404 |
| 6 | `Antworten sind gzip-komprimiert` | `/`, die JS-Datei aus Test 4 und `/results.json` mit `Accept-Encoding: gzip` → `content-encoding` ist `gzip` |
| 7 | `Seite funktioniert über nginx` | Seite lädt, `board` hat `data-state="ok"`, 10 `level-card`, keine Konsolenfehler und kein `pageerror` |

## Ablauf, den du selbst durchspielen sollst
1. `make level2` → nginx läuft auf `http://127.0.0.1:8080`, alles „Offen“.
2. `make check` → Ausgabe `Level 1: bestanden (5/5 Checks)` und `Level 2: bestanden (7/7 Checks)`, Exit-Code 0.
3. Seite neu laden → Level 1 und 2 „Bestanden“, Erreichtes Level `2 / 10`.
4. `make level1` und danach `make check` → nur Level 1 wird geprüft, Level 2 bleibt „Offen“.
5. `make down` → weder `vite preview` noch nginx laufen noch.
6. Wenn es weitere Levels gibt, mit dem nächsten Level weitermachen; was am Ende laufen soll, steht in `00-start.md`.

## Bestanden, wenn (Prüfer)
1. Level 1 ist bestanden.
2. `make level2` endet erfolgreich, Port 8080 antwortet innerhalb von 60 s, und der Header `Server` ist `nginx`.
3. Alle Regeln aus der Tabelle oben sind erfüllt.
4. Die Darstellungstests aus Level 1 (gültige, fehlende und ungültige `results.json`; `data-testid`s; Layout) bestehen auch über nginx.
5. `make check` endet mit Exit-Code 0. `frontend/dist/results.json` erfüllt das Schema und meldet Level 1 mit den 5 und Level 2 mit den 7 Checks aus dieser Datei als `bestanden`.
6. `make down` beendet nginx (Port 8080 danach frei).
