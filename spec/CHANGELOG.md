# Spec-Changelog

## 0.7.0 – 2026-11-20
- Neu: **Level 7** (Images in der Pipeline): `levels/level-07.md`. Zweistufige Dockerfiles auf Basis `nginx:1.31.9-alpine` und `alpine:3.23` (Backend ohne root, UID 10001, Volume `/data`); `nginx-container.conf`; `docker-compose.yml`; Pipeline-Job `images` (bauen, im Runner starten, Container-Suite, öffentlich in die GHCR pushen); `make level7`; 6 Container-Checks und 3 lokale Checks.
- 04: Backend-Adresse über `LEVELBOARD_ADDR` (Standard unverändert `127.0.0.1:8081`).

## 0.6.0 – 2026-11-20
- Neu: **Level 6** (Repo + CI): `levels/level-06.md`. Öffentliches Repo `specrun-lab/levelboard-<RUN_ID>`; Pipeline `.github/workflows/ci.yml` mit festen Eckpunkten im Image `ghcr.io/specrun-lab/devcontainer:1`; Artefakt `levelboard-report`; `make level6`; 4 neue Checks über `gh`.
- 02: `GH_TOKEN` und `RUN_ID` in der Umgebung; Regeln für Zugangsdaten; Image öffentlich in der GHCR.

## 0.5.0 – 2026-11-20
- Neu: **Level 5** (Frontend + Backend): `levels/level-05.md`; `config.json` legt die Datenquelle fest (Datei bzw. Backend); im API-Modus Abfrage alle 5 s; Zustand `unavailable` mit Hinweis; Quelle in der Kopfzeile (`run-source`); `nginx-api.conf` mit Weiterleitung `/api/` (inkl. `charset off`); `make level5`, `make stop-backend`; `write-results.mjs` meldet ab Level 5 auch an die API; 5 neue Checks.
- 02/03: `/config.json` ohne Cache auch in `nginx.conf`.
- 02: Der Go-Modul-Cache im Container enthält `modernc.org/sqlite` v1.62.0 samt Abhängigkeiten, Builds klappen damit auch ohne Go-Proxy.

## 0.4.0 – 2026-11-20
- Neu: **Level 4** (Datenbank): `levels/level-04.md`, SQLite-Datei `.run/levelboard.db`, exaktes Schema mit Migration (`05-datenmodell.md`), Historie `GET /api/levels/{n}/history`, `make level4` und `make restart-backend`, 5 neue Checks.
- Erste Abhängigkeit: `modernc.org/sqlite` v1.62.0 (reines Go). Vorgaben gegen SQLite-Fallen: eine Verbindung, WAL, busy_timeout, Meldung in einer Transaktion.
- 03: `make level3` löscht die Datenbank vor dem Start; `playwright.config.ts` mit `workers: 1`.

## 0.3.0 – 2026-11-20
- Neu: **Level 3** (REST-Backend in Go): `levels/level-03.md`, `04-api.md`, `openapi.yaml`, `make level3`, Port 8081, 8 neue Checks.
- Das Backend setzt die Regeln beim Melden selbst durch (Status, Zeitpunkt, Sperren, 409 bei falscher Reihenfolge).
- Go-Tests sind Pflicht und laufen als Check in `make check`.
- 03: `.gitignore` zusätzlich `*.tsbuildinfo` (Lücke aus Lauf 003) und `backend/bin/`.

## 0.2.1 – 2026-11-20
- 02: Der Arbeitsordner `/workspace` enthält zu Beginn nur `spec/`; die Container-Konfiguration liegt außerhalb (neuer Laufordner-Aufbau `env/` + `work/`).

## 0.2.0 – 2026-11-20
- Neu: **Level 2** (Webserver): `levels/level-02.md`, `frontend/nginx.conf`, `make level2`, 7 neue Checks.
- 02: Startausrüstung ist jetzt ein **Linux-Dev-Container** (Ubuntu 24.04, Node 26.13.0, Go 1.27.4, nginx 1.31.9, Chromium vorinstalliert), ohne root und ohne Docker.
- 01: Level-Titel 6 und 7 heißen jetzt „Repo + CI“ und „Images in der Pipeline“ (kein lokales Docker).
- 03: `make check` prüft alle Levels bis zum zuletzt gestarteten (`.run/level`); `make down` stoppt auch nginx.
- 05: `write-results.mjs` nimmt mehrere Levels; die Dauer eines Levels ist die Summe seiner Testdauern.
- 00: Am Ende läuft die Seite des höchsten Levels, danach einmal `make check`.

## 0.1.0 – 2026-11-20
- Erste Fassung für **Level 1** (Statische Seite).
- Grundlagen: Start, Produkt, Startausrüstung, Architektur.
- Datenmodell mit `results.schema.json`.
- Design: dunkles Dashboard, Tokens, Komponenten, `data-testid`s.
- `levels/level-01.md`.
- Noch nicht enthalten: `04-api.md` und `openapi.yaml` (ab Level 3).
