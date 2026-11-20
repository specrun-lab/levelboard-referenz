# Level 8 – Deployment

**Ziel:** Die Pipeline bringt die Images aus Level 7 auf einen Server im Internet. Danach ist das Levelboard öffentlich unter **`https://<RUN_ID>.<LIVE_DOMAIN>`** erreichbar, z. B. `https://lauf-008.89-67-45-123.sslip.io`. Die Seite zeigt den Commit, der live läuft, und die Ergebnisse der Pipeline.

## Was bereitsteht (nicht deine Aufgabe)
- Ein **Server** mit Ubuntu, Docker und dem Compose-Plugin. Du erreichst ihn **nur aus der Pipeline** per SSH als Benutzer ohne root, der Docker nutzen darf. Lokal hast du keinen Zugang.
- Ein Docker-Netz **`web`** und darin **Caddy**. Caddy nimmt `https://<RUN_ID>.<LIVE_DOMAIN>` an und leitet an **`<RUN_ID>-web:8080`** im Netz `web` weiter. Das Zertifikat holt Caddy beim ersten Aufruf selbst, das kann einige Sekunden dauern. HTTPS, Firewall und DNS sind also erledigt.
- In der Organisation `specrun-lab` (für dein Repo sichtbar):

  | Name | Art | Inhalt |
  |---|---|---|
  | `DEPLOY_HOST` | Secret | IP-Adresse des Servers |
  | `DEPLOY_USER` | Secret | SSH-Benutzer |
  | `DEPLOY_SSH_KEY` | Secret | privater SSH-Schlüssel (OpenSSH-Format) |
  | `DEPLOY_KNOWN_HOSTS` | Secret | Host-Schlüssel des Servers als Zeilen für `known_hosts` |
  | `LIVE_DOMAIN` | Variable | Domain des Servers, z. B. `89-67-45-123.sslip.io` |

- Lokal steht dieselbe Domain in der Umgebungsvariablen `LIVE_DOMAIN`.
- Die Images aus Level 7 sind öffentlich. Der Server zieht sie ohne Anmeldung.

Auf dem Server laufen auch **andere Läufe**. Fasse nur deinen Ordner `~/runs/<RUN_ID>/` und dein Compose-Projekt `<RUN_ID>` an. Verboten sind z. B. `docker system prune`, Änderungen am Netz `web` oder an Caddy.

## Liefergegenstände
- Backend meldet den Commit (siehe unten), `backend/Dockerfile` ergänzt
- Kopfzeile mit Commit (`run-commit`, siehe `06-design.md`)
- `deploy/compose.yml`
- `checks/report-live.mjs`
- `checks/tests/level8.spec.ts`
- `checks/tests/level3.spec.ts`: Check 1 erwartet `commit: null` (siehe `levels/level-03.md`)
- `.github/workflows/ci.yml` mit zusätzlichem Job `deploy`
- `Makefile` mit `level8`, `LIVE_DOMAIN` und `LIVE_URL`

## Commit im Backend und im Image
- Das Backend liest die Umgebungsvariable **`LEVELBOARD_COMMIT`**. `/api/health` liefert `{"status":"ok","version":"0.1.0","commit":<wert>}`, und jede Antwort mit Gesamtstand hat denselben Wert in `run.commit`. Ohne die Variable oder bei leerem Wert ist er `null` (siehe `04-api.md`).
- `backend/Dockerfile`, Laufzeitstufe: Das `ENV` von Level 7 bekommt zusätzlich `LEVELBOARD_COMMIT=${REVISION}`. Das `ARG REVISION` muss in dieser Stufe vor dem `ENV` stehen. Im Image steht damit der Commit-Hash aus dem Build-Argument `REVISION`.
- Die Seite zeigt den Commit aus `run.commit` in der Kopfzeile (`run-commit`, erste 7 Zeichen).

## Compose-Datei für den Server: `deploy/compose.yml`
`docker-compose.yml` aus Level 7 bleibt unverändert, denn die Pipeline nutzt sie weiter. Für den Server gibt es eine eigene Datei mit genau diesen Eckpunkten:
- Oben `name: ${RUN_ID:?RUN_ID fehlt}`. Das Compose-Projekt heißt also wie der Lauf.
- Keine `build`-Abschnitte. Die Images sind `${IMAGE_PREFIX}-backend:${IMAGE_TAG}` und `${IMAGE_PREFIX}-frontend:${IMAGE_TAG}`, also immer das Tag des Commits, nie `main` oder `latest`.
- Beide Dienste haben `restart: unless-stopped`.
- **`backend`**:
  - `environment: RUN_ID: ${RUN_ID}`
  - Volume `levelboard-data:/data`, damit die Daten Re-Deployments überstehen
  - `healthcheck` wie in Level 7
  - keine `ports`, nicht im Netz `web`
- **`frontend`**:
  - `depends_on: backend: condition: service_healthy`
  - **keine** `ports`
  - Netze: `default` und `web`; im Netz `web` mit dem Alias **`${RUN_ID}-web`**
- Netz `web` mit `external: true`, benanntes Volume `levelboard-data`.

`frontend/nginx-container.conf` bleibt unverändert.

## Meldung an die Live-API: `checks/report-live.mjs`
Aufruf: `node report-live.mjs <results.json> <basis-url>`. Das Skript liest den Gesamtstand aus der Datei und meldet die Levels **aufsteigend** per `POST <basis-url>/api/levels/<n>/result` mit `checks` und `durationMs` aus der Datei:
- Es hört beim ersten Level auf, dessen Status weder `bestanden` noch `fehlgeschlagen` ist oder das keine Checks hat.
- Ein `fehlgeschlagen` wird noch gemeldet, danach hört es auf.
- Es endet mit Fehlercode, wenn eine Meldung nicht mit 2xx angenommen wird oder gar nichts gemeldet wurde.
- Keine neuen Abhängigkeiten (`fetch` von Node).

## Pipeline: neuer Job `deploy` in `.github/workflows/ci.yml`
| Eckpunkt | Vorgabe |
|---|---|
| Name, Abhängigkeit | `deploy`, `needs: images`, `if: github.ref == 'refs/heads/main'` |
| Runner | `runs-on: ubuntu-latest` ohne `container:`, `timeout-minutes: 15` |
| Gleichzeitigkeit | `concurrency: { group: deploy, cancel-in-progress: false }` |
| Umgebung | `IMAGE_PREFIX: ghcr.io/${{ github.repository }}`, `IMAGE_TAG: ${{ github.sha }}` |
| `RUN_ID` | Name des Repos ohne `levelboard-`, also `lauf-008` für `specrun-lab/levelboard-lauf-008` |
| Live-Adresse | `LIVE_URL = https://<RUN_ID>.${{ vars.LIVE_DOMAIN }}`. Fehlt die Variable, bricht der Job mit Meldung ab |
| Zugang | nur über `${{ secrets.DEPLOY_HOST }}`, `${{ secrets.DEPLOY_USER }}`, `${{ secrets.DEPLOY_SSH_KEY }}` und `${{ secrets.DEPLOY_KNOWN_HOSTS }}`. Den Schlüssel in eine Datei mit Rechten `600` schreiben, `known_hosts` aus dem Secret, **`StrictHostKeyChecking yes`**. Kein `ssh-keyscan`, kein `StrictHostKeyChecking no` |

Schritte:
1. `actions/checkout@v7` und `actions/setup-node@v7` mit `node-version: 26.13.0`
2. Auf dem Server `~/runs/<RUN_ID>/` anlegen. Dorthin `deploy/compose.yml` als `compose.yml` kopieren (`scp`). Daneben eine `.env` mit genau `RUN_ID`, `IMAGE_PREFIX` und `IMAGE_TAG` schreiben.
3. In diesem Ordner auf dem Server: `docker compose pull -q`, dann `docker compose up -d --wait --remove-orphans`.
4. Höchstens 180 s lang wiederholt `GET <LIVE_URL>/api/health` abfragen, bis `commit` gleich `IMAGE_TAG` ist. Sonst schlägt der Job fehl.
5. Artefakt `levelboard-report` aus dem Job `check` desselben Laufs laden (`actions/download-artifact@v8`), dann `node checks/report-live.mjs <pfad-zu-results.json> <LIVE_URL>`.
6. `GET <LIVE_URL>/` antwortet mit 200, `GET <LIVE_URL>/config.json` enthält `"api"`.

Secrets erscheinen nie in Ausgaben, Dateien im Repo oder Artefakten.

## Makefile
- `LIVE_DOMAIN ?=` (Wert aus der Umgebung) und `LIVE_URL ?= https://$(RUN_ID).$(LIVE_DOMAIN)`.
- `make level8`: genau wie `make level7`, danach `8` nach `.run/level` und die Ausgabe `Live: <LIVE_URL>`.
- `make check` übergibt ab Level 8 zusätzlich `LIVE_URL=$(LIVE_URL)` an Playwright (siehe `03-architektur.md`).

## Lokale Prüfsuite für Level 8: `checks/tests/level8.spec.ts`
Genau eine Gruppe `test.describe('level-8', …)`, seriell, Zeitlimit pro Test 120 s, mit genau diesen 4 Tests und wörtlichen Titeln. Die Adresse kommt aus `LIVE_URL`, der Commit ist der lokale `HEAD`.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Job deploy des letzten Laufs ist grün` | im Lauf von `CI` für `HEAD`: Job `deploy` mit `conclusion` = `success` |
| 2 | `Live-Seite antwortet über HTTPS` | `LIVE_URL` beginnt mit `https://`; `GET <LIVE_URL>/` → 200 (mit gültigem Zertifikat); Seite mit `data-state="ok"`, `run-source` mit `data-source="api"` |
| 3 | `Live-Seite meldet den aktuellen Commit` | `GET <LIVE_URL>/api/health` → 200 mit `commit` = `HEAD`; `run-commit` zeigt die ersten 7 Zeichen von `HEAD` |
| 4 | `Live-Seite zeigt die Ergebnisse der Pipeline` | `GET <LIVE_URL>/api/levels`: `run.id` = `RUN_ID`, Level 1–5 `bestanden` |

## Ablauf, den du selbst durchspielen sollst
1. Dateien anlegen, committen, pushen.
2. Auf den Lauf warten: `gh run watch … --exit-status`. Alle drei Jobs müssen grün sein. Bei Fehlern das Log lesen (`gh run view <id> --log-failed`), korrigieren, erneut pushen. Den Server erreichst du nur über die Pipeline.
3. `make level8` und `make check` → Level 1–8 bestanden.

## Bestanden, wenn (Prüfer)
1. Level 1–7 sind bestanden.
2. `deploy/compose.yml` und der Job `deploy` erfüllen die Eckpunkte oben. Der Server-Zugang läuft nur über die Secrets, im Repo liegt kein Schlüssel.
3. Im letzten Lauf von `CI` für den aktuellen Commit ist der Job `deploy` grün.
4. Von außen geprüft: Die Live-URL antwortet über gültiges HTTPS. Die Seite liest aus dem Backend und zeigt den aktuellen Commit. `/api/health` meldet diesen Commit. Die API antwortet laut Spec, und Level 1–5 sind live bestanden.
5. Lokal meldet `make check` Level 1–8 bestanden.
