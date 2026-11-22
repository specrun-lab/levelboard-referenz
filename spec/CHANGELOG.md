# Spec-Changelog

## 2.1.0 – 2026-11-22
- **Verbrauch nachtragen:** neuer Endpunkt `GET`/`PUT /api/usage` (04, `openapi.yaml`). Der Runner misst Tokens und Kosten nach der Prüfung und trägt sie auf der Live-Seite nach. Gespeichert wird `usage.json` neben der Datenbank. Format in 05, „Verbrauch“.
- 06: Abschlussbericht wieder mit Kachel „Tokens“ (Harness, Modell, Tokens (Ausgabe), Tokens gesamt, Kosten gesamt; ohne Verbrauch „wird nach der Prüfung ergänzt“), 5 Kacheln in 3 Spalten. Die Liste der Levels bekommt eine Kopfzeile und die Spalten „Kosten“ und „Tokens (Ausgabe)“ (`report-level-cost`, `report-level-output`).
- Level 10: vierter Test `Verbrauch wird gespeichert und gelesen`, Tests 2 und 3 ersetzen zusätzlich `/api/usage`. Der Prüfer prüft `/api/usage` live (neues Kriterium 6).

## 2.0.0 – 2026-11-22
- **Unabhängig vom Agent-Harness:** Die Spec setzt kein bestimmtes Werkzeug mehr voraus. Weg fallen die Session-Protokolle unter `~/.claude/projects`, `collect-tokens.mjs`, Tokens und Kosten in `metrics` sowie die Preistabelle. Tokens und Kosten misst nur noch der Prüfer, nach dem Lauf.
- **Bauzeit aus den eigenen `make check`:** neue Datei `bauzeit.json` (Startzeit aus Schritt 0 in `00-start.md`, Einträge beim ersten Bestehen, danach unveränderlich, `BAUZEIT_FEST=1` für den Prüfer) und `checks/bauzeit.mjs`. `metrics.build` ersetzt `metrics.tokens` (05).
- 06: Karten ohne „Kosten“ und „Tokens (Ausgabe)“, „Bauzeit“ aus `metrics.build`. Bericht mit 4 Kacheln ohne „Tokens“, „Bauzeit gesamt“ als Summe.
- Level 10: Tests und Nachprüfung auf die Bauzeit umgestellt.

## 1.4.0 – 2026-11-21
- 05: Preisstufe für Haiku 5.5. Antworten, deren Prompt (Eingabe + Cache-Schreiben + Cache-Lesen) über 100’000 Tokens liegt, kosten $0.50 / $0.625 / $1 / $0.05 / $2.50 pro Mio. Tokens statt des Grundpreises (laut Anthropic-Preisseite). Vorher rechnete die Spec immer mit dem Grundpreis und unterschätzte lange Haiku-Läufe.

## 1.3.0 – 2026-11-21
- **Bauzeit pro Level:** Das Token-Objekt bekommt `buildS`, also die Sekunden vom Ende der vorigen Phase bis zum Start des `make check`, der das Level besteht (05). Die Karte zeigt sie als neue Zeile „Bauzeit“ (`level-build-time`, `39 s` bzw. `7:32 min`), der Bericht als „Bauzeit gesamt“ (`report-build-time`).
- 06: Die bisherige Kartenzeile „Dauer“ heißt jetzt „Checkdauer“, und „Ausgabe“ heißt „Tokens (Ausgabe)“. Inhalte und `data-testid`s bleiben unverändert.

## 1.2.0 – 2026-11-21
- **Kennzahlen bei ihrem Level** (05, neuer Abschnitt „Kennzahlen pro Level“): Jedes geprüfte Level bekommt ab Level 1 `metrics.tokens`, also den Verbrauch seiner Phase aus dem Session-Protokoll. Die Phasengrenzen sind die früheren `make check`. Gemeinsame Phasen stehen beim höchsten Level, die übrigen bekommen `{ "inLevel": n }`. Dazu kommen `pipeline` bei Level 6, `images` bei Level 7 und `loadtest` bei Level 9 (vorher flach in `metrics`). Die Preistabelle steht jetzt in 05.
- 06: Karten mit „Kosten“ und „Ausgabe“ (`level-cost`, `level-output`). Der **Abschlussbericht ist immer da**, sobald ein Level geprüft ist, und setzt sich aus den Levels zusammen. Fehlende Teile zeigen „noch nicht erreicht“; dazu kommen `data-complete` und „Vollständig“.
- Level 10 heißt jetzt „Bericht vollständig und live“. Die Tests sind neu: `Alle Teile des Berichts sind vorhanden`, `Vollständiger Bericht wird dargestellt`, `Teilbericht zeigt fehlende Teile`. Es gibt kein eigenes `metrics`-Format für Level 10 mehr.
- 03: `collect-tokens.mjs` ab Level 1, `collect-report.mjs` ab Level 6; `write-results.mjs` bekommt `GITHUB_REPO` und `RUN_ID`.

## 1.1.0 – 2026-11-21
- Level 10: Der Abschlussbericht zeigt zusätzlich den **Token-Verbrauch** der eigenen Claude-Code-Session und die **geschätzten Kosten** zum API-Preis. Neu sind `checks/collect-tokens.mjs` (liest `~/.claude/projects/**/*.jsonl`), das Feld `tokens` in den `metrics` von Level 10, die Preistabelle in `levels/level-10.md` und die Kachel „Tokens“ (5 Kacheln in 3 Spalten).
- 02: Hinweis auf die Session-Protokolle unter `~/.claude/projects`.

## 1.0.0 – 2026-11-20
- Neu: **Level 10** (Metriken veröffentlicht): `levels/level-10.md`. Abschnitt „Abschlussbericht“ unter den Karten (`Report.tsx`, `data-testid="report"`); `checks/collect-report.mjs` sammelt Pipeline-Dauer, Image-Größen und Lasttest; `make check` meldet sie als `metrics` von Level 10 und prüft danach live nach (`tests/live-report.spec.ts`); `make level10`; 3 neue Checks.
- 03: `playwright.config.ts` mit den Projekten `levels`, `level-10` (läuft zuletzt) und `weitere`.
- 05: Übersprungene Tests zählen in `write-results.mjs` als nicht bestanden. Vorher galt `spec.ok`, das bei übersprungenen Tests `true` ist.
- 05: `metrics` von Level 10 = `checks/.out/report.json`.
- 06: Gestaltung, Texte und `data-testid`s des Abschlussberichts.
- Damit beschreibt die Spec alle 10 Levels.

## 0.9.0 – 2026-11-20
- Neu: **Level 9** (Live-Prüfung): `levels/level-09.md`. Live-Suite `checks/tests/level9.spec.ts` mit 5 Checks gegen `LIVE_URL`; Lasttest `checks/loadtest.mjs` (10 Verbindungen, 30 s, nur `fetch`, p50/p95 nach Nearest-Rank); `make level9`.
- 05: `write-results.mjs` meldet ab Level 9 zusätzlich an die Live-API (`REPORT_LIVE=1`, `LIVE_URL`) und gibt Level 9 die Lastwerte als `metrics` mit.
- 03: `make check` löscht vor den Tests `checks/.out/loadtest.json`.

## 0.8.0 – 2026-11-20
- Neu: **Level 8** (Deployment): `levels/level-08.md`. Job `deploy` bringt die Images per SSH auf den Server (`~/runs/<RUN_ID>/`, Compose-Projekt `<RUN_ID>`, Netz `web`, Alias `<RUN_ID>-web`); Live-Seite unter `https://<RUN_ID>.<LIVE_DOMAIN>`; `deploy/compose.yml`; `checks/report-live.mjs` meldet die Ergebnisse der Pipeline an die Live-API; `make level8`; 4 neue Checks.
- 02: Umgebungsvariable `LIVE_DOMAIN`.
- 04/openapi: `/api/health` und `run.commit` melden den Commit aus `LEVELBOARD_COMMIT` (lokal `null`). Level 3, Check 1 erwartet deshalb `commit: null`.
- 06: Kopfzeile mit viertem Paar „Commit“ (`run-commit`), unter 640 px ausgeblendet.

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
