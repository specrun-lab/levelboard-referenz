# 03 – Architektur

## Projektstruktur (im Arbeitsverzeichnis)
```
Makefile
.github/workflows/ci.yml   – ab Level 6 (ab Level 7 mit Job „images“, ab Level 8 mit Job „deploy“)
docker-compose.yml         – ab Level 7 (nur in der Pipeline benutzt)
deploy/compose.yml         – ab Level 8 (Compose-Datei für den Server)
.gitignore                 – node_modules/, dist/, .run/, .out/, test-results/, *.tsbuildinfo, backend/bin/
frontend/
  package.json
  package-lock.json        – durch npm install erzeugt, wird von npm ci benötigt
  index.html
  vite.config.ts
  tsconfig.json
  nginx.conf               – ab Level 2
  nginx-api.conf           – ab Level 5 (mit Weiterleitung /api/)
  nginx-container.conf     – ab Level 7 (nginx im Frontend-Container)
  Dockerfile, .dockerignore – ab Level 7
  public/results.json      – Startzustand: alle 10 Levels „offen“
  public/config.json       – {"source":"file"} (ab Level 5)
  src/
    main.tsx
    App.tsx
    results.ts             – Typen, Laden, Prüfen, Auswerten, Formatieren
    styles.css
    components/            – Header.tsx, Summary.tsx, LevelCard.tsx, Notice.tsx, Report.tsx (ab Level 10)
checks/
  package.json
  package-lock.json
  playwright.config.ts
  tests/level1.spec.ts
  tests/level2.spec.ts     – ab Level 2
  tests/level3.spec.ts     – ab Level 3
  tests/level4.spec.ts     – ab Level 4
  tests/level5.spec.ts     – ab Level 5
  tests/level6.spec.ts     – ab Level 6
  tests/level7.spec.ts     – ab Level 7
  tests/level8.spec.ts     – ab Level 8
  tests/level9.spec.ts     – ab Level 9 (läuft gegen die Live-Seite)
  tests/level10.spec.ts    – ab Level 10
  tests/live-report.spec.ts – ab Level 10, Nachprüfung nach der Meldung (kein eigenes Level)
  tests/container.spec.ts  – ab Level 7, nur in der Pipeline (Job „images“)
  write-results.mjs
  report-live.mjs          – ab Level 8, nur in der Pipeline (Job „deploy“)
  loadtest.mjs             – ab Level 9 (Lasttest gegen die Live-Seite)
  collect-tokens.mjs       – ab Level 1 (Verbrauch pro Level aus dem Session-Protokoll)
  collect-report.mjs       – ab Level 6 (Pipeline-Dauer, Image-Größen)
backend/                   – ab Level 3: Go-Modul (siehe levels/level-03.md)
  go.mod, go.sum           – ab Level 4 mit modernc.org/sqlite
  Dockerfile, .dockerignore – ab Level 7
  *.go, *_test.go
```

## Frontend
Vite + React + TypeScript, ohne weitere Bibliotheken (kein Router, kein CSS-Framework, keine UI-Bibliothek).

`frontend/package.json`:
```json
{
  "name": "levelboard-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "19.3.1",
    "react-dom": "19.3.1"
  },
  "devDependencies": {
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.3.0",
    "typescript": "7.0.2",
    "vite": "8.3.8"
  }
}
```

`frontend/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  preview: { port: 8080, strictPort: true, host: '127.0.0.1' },
});
```

`frontend/tsconfig.json` (eine einzige Datei, keine Projekt-Referenzen):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}
```

`frontend/index.html`: `<html lang="de">`, `<meta charset="UTF-8">`, Viewport-Meta, `<meta name="color-scheme" content="dark">`, `<title>Levelboard</title>`, `<div id="root">`, Modul-Script `/src/main.tsx`.

`main.tsx` rendert `<App/>` in `StrictMode` und importiert `styles.css`.

## Prüfsuite
`checks/package.json`:
```json
{
  "name": "levelboard-checks",
  "private": true,
  "type": "module",
  "devDependencies": {
    "@playwright/test": "1.65.1"
  }
}
```

`checks/playwright.config.ts`:
- `testDir: './tests'`, `retries: 0`, `timeout: 15000`, `workers: 1` (nacheinander; ab Level 3 verändern die Tests den Zustand des Backends)
- Reporter: `list` und `json` mit `outputFile: '.out/playwright.json'`
- `use.baseURL`: Umgebungsvariable `BASE_URL`, Standard `http://127.0.0.1:8080`
- ab Level 10 drei `projects`: `{ name: 'levels', testMatch: /level[1-9]\.spec\.ts$/ }`, `{ name: 'level-10', testMatch: /level10\.spec\.ts$/, dependencies: ['levels'] }` und `{ name: 'weitere', testMatch: /(container|live-report)\.spec\.ts$/ }`. Playwright sortiert Testdateien alphabetisch (`level10` vor `level2`); so läuft Level 10 garantiert nach dem Lasttest von Level 9

Was die Suite pro Level prüft und wie sie ihr Ergebnis meldet, steht in der jeweiligen Level-Datei und in `05-datenmodell.md`.

## Makefile – feste Befehle
Der Prüfer nutzt ausschließlich diese Befehle. Sie müssen aus dem Arbeitsverzeichnis heraus funktionieren, wiederholt aufrufbar sein und dürfen nicht interaktiv sein.

| Befehl | Verhalten |
|---|---|
| `make level1` | ruft zuerst `make down` auf. Dann in `frontend/`: `npm ci`, `npm run build`. Danach startet es `vite preview` **im Hintergrund**: Prozessnummer in `.run/frontend.pid`, Ausgabe in `.run/frontend.log`, stdin von `/dev/null`. Es schreibt `1` in die Datei `.run/level`. Es wartet höchstens 60 s, bis `http://127.0.0.1:8080/` antwortet, und gibt dann `Levelboard läuft auf http://127.0.0.1:8080` aus. Antwortet der Port nicht, gibt es die Logs aus `.run/` aus und endet mit Fehlercode. Der Befehl kehrt zurück, während die Seite weiterläuft. |
| `make level2` | ruft zuerst `make down` auf, baut das Frontend wie `level1` und startet dann nginx aus dem Projektordner mit `nginx -p "$(CURDIR)/" -e .run/nginx-error.log -c frontend/nginx.conf`. Vorher legt es `.run/nginx-tmp/` an. nginx schreibt seine Prozessnummer selbst nach `.run/nginx.pid`. Es schreibt `2` nach `.run/level` und wartet wie `level1` auf Port 8080 (gleiche Meldung). |
| `make check` | prüft **alle Levels von 1 bis zum zuletzt gestarteten** (Wert aus `.run/level`; fehlt die Datei: das höchste gebaute Level, derzeit 10). Es installiert die Abhängigkeiten in `checks/`, falls `node_modules` fehlt (`npm ci`), und führt `npx playwright install chromium` aus. Vor den Tests löscht es `checks/.out/loadtest.json`, falls vorhanden. Dann lässt es genau die Dateien `tests/level1.spec.ts` … `tests/level<N>.spec.ts` mit `BASE_URL=$(URL)` laufen (Make-Variable `URL`, Standard `http://127.0.0.1:8080`). Ab Level 3 setzt es zusätzlich `API_URL=$(API_URL)` (Standard `http://127.0.0.1:8081`), ab Level 6 `GITHUB_REPO=$(GITHUB_REPO)`, ab Level 8 `LIVE_URL=$(LIVE_URL)` (Make-Variable, Standard `https://$(RUN_ID).$(LIVE_DOMAIN)`; `LIVE_DOMAIN` kommt aus der Umgebung). Danach führt es **immer** `node write-results.mjs 1 … N` aus, mit `GITHUB_REPO=$(GITHUB_REPO)` und `RUN_ID=$(RUN_ID)`, ab Level 5 mit `REPORT_API=1` und `API_URL=$(API_URL)`, ab Level 9 zusätzlich mit `REPORT_LIVE=1` und `LIVE_URL=$(LIVE_URL)` (siehe `05-datenmodell.md`), auch wenn Tests fehlschlagen. Ab Level 10 lässt es danach, nur wenn `write-results.mjs` erfolgreich war, in `checks/` noch `npx playwright test tests/live-report.spec.ts --reporter=list` mit `LIVE_URL` und `RUN_ID` laufen (siehe `levels/level-10.md`). Der Exit-Code ist 0 genau dann, wenn alle Checks bestanden sind und, ab Level 10, die Nachprüfung bestanden ist. |
| `make level3` | wie `make level2` (inklusive `make down` und Frontend-Build). Zusätzlich baut es das Backend mit `go build -o bin/levelboard-backend .` in `backend/`, **löscht** `.run/levelboard.db` samt `-wal`/`-shm` (frische Datenbank) und startet das Backend mit `LEVELBOARD_DB=.run/levelboard.db` im Hintergrund: Prozessnummer in `.run/backend.pid`, Ausgabe angehängt an `.run/backend.log`, stdin von `/dev/null`. Es schreibt `3` nach `.run/level` und wartet höchstens 60 s auf `http://127.0.0.1:8080/` und `http://127.0.0.1:8081/api/health`. Danach gibt es die Zeilen `Levelboard läuft auf http://127.0.0.1:8080` und `Backend läuft auf http://127.0.0.1:8081` aus. |
| `make level4` | genau wie `make level3`, schreibt danach aber `4` nach `.run/level` und gibt zusätzlich `Datenbank: .run/levelboard.db` aus. |
| `make restart-backend` | beendet nur das Backend (wartet bis zu 5 s, bis der Prozess weg ist) und startet es wieder wie oben, **ohne** die Datenbank zu löschen. Wartet auf `/api/health` und gibt `Backend neu gestartet (Datenbank erhalten)` aus. |
| `make level5` | ruft `make down` auf, baut Frontend und Backend wie `level3`, startet nginx mit **`frontend/nginx-api.conf`** statt `nginx.conf`, löscht die Datenbank, startet das Backend, schreibt `{"source":"api"}` nach `frontend/dist/config.json` und `5` nach `.run/level`. Es wartet auf `http://127.0.0.1:8080/api/health` (also durch die Weiterleitung) und gibt aus: `Levelboard läuft auf http://127.0.0.1:8080 (Quelle: Backend)`, `Backend läuft auf http://127.0.0.1:8081`, `Datenbank: .run/levelboard.db`. |
| `make level6` | genau wie `make level5`, danach `6` nach `.run/level` und Ausgabe `Repo: https://github.com/<GITHUB_REPO>` (siehe `levels/level-06.md`). |
| `make level7` | genau wie `make level6`, danach `7` nach `.run/level` und Ausgabe `Images: ghcr.io/<GITHUB_REPO>-frontend und ghcr.io/<GITHUB_REPO>-backend` (siehe `levels/level-07.md`). |
| `make level8` | genau wie `make level7`, danach `8` nach `.run/level` und Ausgabe `Live: <LIVE_URL>` (siehe `levels/level-08.md`). |
| `make level9` | genau wie `make level8`, danach `9` nach `.run/level` und Ausgabe `Live-Prüfung gegen <LIVE_URL>` (siehe `levels/level-09.md`). |
| `make level10` | genau wie `make level9`, danach `10` nach `.run/level` und Ausgabe `Abschlussbericht: <LIVE_URL>` (siehe `levels/level-10.md`). |
| `make stop-backend` | beendet nur das Backend (wartet bis zu 5 s auf das Ende des Prozesses) und löscht `.run/backend.pid`. Ohne laufendes Backend ist es ohne Fehler. nginx und die Datenbank bleiben. |
| `make down` | beendet die Prozesse aus `.run/frontend.pid`, `.run/nginx.pid` und `.run/backend.pid`, falls vorhanden, und löscht die PID-Dateien sowie `.run/level`. Ohne laufenden Prozess ist es ohne Fehler. |

## Ports
| Port | Dienst |
|---|---|
| 8080 | Levelboard-Seite, nur auf `127.0.0.1` (Level 1: `vite preview`, ab Level 2: nginx; ab Level 5 zusätzlich `/api/` → 8081) |
| 8081 | Backend (REST-API), nur auf `127.0.0.1`, ab Level 3 |
