# Level 7 – Images in der Pipeline

**Ziel:** Die Pipeline baut aus deinem Code **zwei App-Images** (Frontend und Backend), startet sie im Runner mit `docker compose`, prüft sie mit einer eigenen Container-Suite und legt sie **öffentlich** in der GitHub Container Registry (GHCR) ab. Lokal startest du **nie** Container, denn im Dev Container gibt es kein Docker.

## Liefergegenstände
- `backend/Dockerfile`, `backend/.dockerignore`
- `frontend/Dockerfile`, `frontend/.dockerignore`, `frontend/nginx-container.conf`
- `docker-compose.yml` im Projektordner
- ab Level 7 setzt `write-results.mjs` bei Level 7 `metrics.images` (siehe `05-datenmodell.md`, „Kennzahlen pro Level“)
- Backend liest die Adresse aus `LEVELBOARD_ADDR` (siehe unten)
- `checks/tests/container.spec.ts` (Container-Suite, läuft nur in der Pipeline)
- `checks/tests/level7.spec.ts` (lokale Checks, fragen GitHub und die GHCR ab)
- `.github/workflows/ci.yml` mit zusätzlichem Job `images`
- `Makefile` mit `level7`

## Backend: Adresse
- Umgebungsvariable `LEVELBOARD_ADDR`, Standard **`127.0.0.1:8081`**. Lokal ändert sich also nichts.
- Im Container wird sie auf `0.0.0.0:8081` gesetzt, damit nginx im Frontend-Container das Backend erreicht.

## Images
**Backend (`backend/Dockerfile`)**, zweistufig:
1. `FROM golang:1.27.4-alpine AS build`: `go.mod` und `go.sum` kopieren, `go mod download`, Quellen kopieren, `CGO_ENABLED=0 go build -buildvcs=false -trimpath -ldflags="-s -w" -o /out/levelboard-backend .`
2. `FROM alpine:3.23`:
   - Benutzer `levelboard` mit UID **10001** (`adduser -D -H -u 10001 levelboard`)
   - Ordner `/data`, der ihm gehört
   - Programm nach `/usr/local/bin/levelboard-backend`
   - `USER levelboard`
   - `ENV LEVELBOARD_ADDR=0.0.0.0:8081` und `LEVELBOARD_DB=/data/levelboard.db`
   - `EXPOSE 8081`, `ENTRYPOINT ["/usr/local/bin/levelboard-backend"]`
- `.dockerignore`: `bin/` und `*_test.go`.

**Frontend (`frontend/Dockerfile`)**, zweistufig:
1. `FROM node:26.13.0-alpine AS build`: `package.json` und `package-lock.json` kopieren, `npm ci`, Quellen kopieren, `npm run build`, danach `{"source":"api"}` nach `dist/config.json` schreiben.
2. `FROM nginx:1.31.9-alpine`:
   - `nginx-container.conf` nach `/etc/nginx/nginx.conf`
   - `dist/` nach `/usr/share/nginx/html`
   - `EXPOSE 8080`
- `.dockerignore`: `node_modules/`, `dist/`, `*.tsbuildinfo`.

**Beide Images** bekommen über die Build-Argumente `SOURCE_URL` und `REVISION` diese Labels:
- `org.opencontainers.image.source` (URL des Repos)
- `org.opencontainers.image.revision` (Commit-Hash)
- `org.opencontainers.image.title` (`levelboard-backend` bzw. `levelboard-frontend`)

Das Label `source` verknüpft das Paket in der GHCR mit dem öffentlichen Repo.

**`frontend/nginx-container.conf`** entspricht `nginx-api.conf` aus Level 5, mit genau diesen Unterschieden:

| Direktive | Wert im Container |
|---|---|
| `pid` | `/tmp/nginx.pid` |
| `error_log` | `/dev/stderr warn` |
| `access_log` | `/dev/stdout` |
| `*_temp_path` | `/tmp/client`, `/tmp/proxy`, `/tmp/fastcgi`, `/tmp/uwsgi`, `/tmp/scgi` |
| `listen` | `8080` (alle Schnittstellen des Containers) |
| `root` | `/usr/share/nginx/html` |
| `proxy_pass` | `http://backend:8081` (Name des Dienstes in Compose) |

## `docker-compose.yml`
- Dienst **`backend`**:
  - `build` mit `context: ./backend` und den Argumenten `SOURCE_URL: ${SOURCE_URL:-}` und `REVISION: ${IMAGE_TAG:-lokal}`
  - `image: ${IMAGE_PREFIX:-levelboard}-backend:${IMAGE_TAG:-lokal}`
  - `environment: RUN_ID: ${RUN_ID:-container}`
  - Volume `levelboard-data:/data`
  - `healthcheck` mit `["CMD", "wget", "-qO-", "http://127.0.0.1:8081/api/health"]`, `interval: 2s`, `timeout: 2s`, `retries: 30`
- Dienst **`frontend`**:
  - `build` wie oben mit `context: ./frontend`
  - `image: ${IMAGE_PREFIX:-levelboard}-frontend:${IMAGE_TAG:-lokal}`
  - `ports: ["8080:8080"]`
  - `depends_on: backend: condition: service_healthy`
- Benanntes Volume `levelboard-data`. Das Backend wird **nicht** nach außen veröffentlicht.

## Pipeline: neuer Job `images` in `.github/workflows/ci.yml`
| Eckpunkt | Vorgabe |
|---|---|
| Name, Abhängigkeit | `images`, `needs: check` |
| Runner | `runs-on: ubuntu-latest` **ohne** `container:` (Docker wird gebraucht), `timeout-minutes: 20` |
| Rechte | `permissions: contents: read, packages: write` |
| Umgebung | `IMAGE_PREFIX: ghcr.io/${{ github.repository }}`, `IMAGE_TAG: ${{ github.sha }}`, `SOURCE_URL: ${{ github.server_url }}/${{ github.repository }}` |
| Schritte | 1. `actions/checkout@v7` · 2. `actions/setup-node@v7` mit `node-version: 26.13.0` · 3. `docker compose build` · 4. `docker compose up -d --wait` · 5. in `checks/`: `npm ci`, `npx playwright install --with-deps chromium`, `npx playwright test tests/container.spec.ts` · 6. Artefakt **`levelboard-container-report`** = `checks/.out/playwright.json` mit `actions/upload-artifact@v7` und **`if: always()`** · 7. Anmeldung bei `ghcr.io` mit `secrets.GITHUB_TOKEN` (`docker login ghcr.io -u "${{ github.actor }}" --password-stdin`), `docker compose push`, dann beide Images zusätzlich als `:main` taggen und pushen · 8. `docker compose down -v` mit `if: always()` |

Gepusht wird also nur, wenn die Container-Suite grün ist. Ergebnis sind diese Images:
- `ghcr.io/specrun-lab/levelboard-<RUN_ID>-frontend:<commit>` und `:main`
- `ghcr.io/specrun-lab/levelboard-<RUN_ID>-backend:<commit>` und `:main`

## Container-Suite: `checks/tests/container.spec.ts`
Genau eine Gruppe `test.describe('container', …)`, seriell, mit genau diesen 6 Tests und wörtlichen Titeln. Seite und API laufen über `http://127.0.0.1:8080` (`BASE_URL` wie gewohnt). `docker compose …` wird mit dem Projektordner als Arbeitsordner aufgerufen.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Seite läuft im Container und liest aus dem Backend` | `/config.json` = `{"source":"api"}`; Seite `data-state="ok"`; `run-source` mit `data-source="api"` |
| 2 | `/api/ wird an den Backend-Container weitergeleitet` | `GET /api/health` → 200, `content-type` exakt `application/json`, `status` `ok`; `GET /api/unbekannt` → 404 |
| 3 | `Meldung erscheint ohne Neuladen` | Seite öffnen, `POST /api/levels/1/result` (bestanden, `durationMs` 4242) → Karte von Level 1 zeigt innerhalb von 8 s `4,2 s` |
| 4 | `Daten überstehen einen Neustart des Backend-Containers` | Historie von Level 1 (`?limit=500`, nicht leer) merken; `docker compose restart backend`; warten, bis `/api/health` 200 liefert (höchstens 60 s); Historie unverändert |
| 5 | `Cache- und gzip-Regeln gelten im Container` | `/`: `cache-control` `no-cache`, `content-encoding` `gzip`, `server` `nginx`; erste JS-Datei aus `/assets/`: `public, max-age=31536000, immutable`; `/config.json`: `no-store`; `/gibt-es-nicht.json` → 404 |
| 6 | `Backend-Container läuft nicht als root` | `docker compose exec -T backend id -u` ist nicht `0` |

## Makefile
`make level7`: genau wie `make level6`, danach `7` nach `.run/level` und die Ausgabe `Images: ghcr.io/<GITHUB_REPO>-frontend und ghcr.io/<GITHUB_REPO>-backend`.

## Lokale Prüfsuite für Level 7: `checks/tests/level7.spec.ts`
Genau eine Gruppe `test.describe('level-7', …)`, seriell, Zeitlimit pro Test 120 s, mit genau diesen 3 Tests und wörtlichen Titeln:

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Job images des letzten Laufs ist grün` | im Lauf von `CI` für den lokalen `HEAD`: Job `images` mit `conclusion` = `success` (`gh api repos/<repo>/actions/runs/<id>/jobs`) |
| 2 | `Beide Images liegen öffentlich in der GHCR` | **ohne Anmeldung**: `GET https://ghcr.io/token?scope=repository:<repo>-<teil>:pull` liefert ein Token; damit `HEAD https://ghcr.io/v2/<repo>-<teil>/manifests/<HEAD>` (Accept für OCI-Index, OCI-Manifest und Docker-Manifest v2) → 2xx, für `frontend` und `backend` |
| 3 | `Report der Container-Suite enthält nur bestandene Checks` | Artefakt `levelboard-container-report` des Laufs laden (`gh run download`); mindestens 6 Tests, keiner fehlgeschlagen |

## Ablauf, den du selbst durchspielen sollst
1. Dateien anlegen, committen, pushen.
2. Auf den Lauf warten: `gh run watch … --exit-status`. Beide Jobs müssen grün sein. Bei Fehlern das Log lesen, korrigieren, erneut pushen. Da lokal kein Docker läuft, ist die Pipeline dein einziger Test der Images.
3. `make level7` und `make check` → Level 1–7 bestanden.

## Bestanden, wenn (Prüfer)
1. Level 1–6 sind bestanden.
2. Dockerfiles, nginx-Konfiguration und Compose-Datei erfüllen die Eckpunkte oben.
3. Im letzten Lauf von `CI` für den aktuellen Commit ist der Job `images` grün. Das Artefakt `levelboard-container-report` belegt 6 bestandene Container-Checks mit den Titeln aus dieser Datei.
4. Beide Images liegen **öffentlich** mit dem Tag des aktuellen Commits in der GHCR. Die Labels `source` und `revision` stimmen.
5. Der Prüfer zieht die Images selbst, startet sie und prüft Kernfunktionen.
6. Lokal meldet `make check` Level 1–7 bestanden.
