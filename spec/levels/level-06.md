# Level 6 – Repo + CI

**Ziel:** Der Code kommt in ein **öffentliches GitHub-Repo**. Eine **Pipeline** (GitHub Actions) baut dort die Levels 1–5 im selben Container-Image, in dem du arbeitest, prüft sie mit `make check` und legt den Test-Report als Artefakt ab. Du wartest auf das Ergebnis und prüfst es mit deiner Prüfsuite.

## Vorhanden in deiner Umgebung
- `GH_TOKEN`: Token für die GitHub-Organisation **`specrun-lab`**. Es darf dort Repos anlegen, Code pushen, Workflows schreiben und Läufe lesen. `gh` nutzt es automatisch.
- `RUN_ID`: Kennung dieses Laufs, z. B. `lauf-006`.
- `gh` und `git` (siehe `02-startausruestung.md`).

## Regeln für Zugangsdaten (verbindlich)
- Das Token **niemals** in Dateien, Commits, Ausgaben oder Logs schreiben, auch nicht gekürzt.
- Kein Token in der Git-Konfiguration oder in Remote-Adressen. Für das Pushen über HTTPS nutzt du `gh auth setup-git`.
- Ein Fund im Repo, in der Historie oder in den Logs der Pipeline macht den Lauf **ungültig**.

## Repo
- Name: **`specrun-lab/levelboard-<RUN_ID>`**, **öffentlich**, Standard-Branch `main`.
- Anlegen mit `gh repo create specrun-lab/levelboard-$RUN_ID --public`.
- Im Projektordner `git init -b main`, Git-Identität **nur für dieses Repo**:
  - `git config user.name "Levelboard Agent"`
  - `git config user.email "agent@specrun.invalid"`
- Remote `origin` = `https://github.com/specrun-lab/levelboard-<RUN_ID>.git`.
- Committet wird alles außer dem, was `.gitignore` ausschließt. `spec/` gehört dazu.
- Am Ende ist der lokale Stand **vollständig gepusht**: kein uncommitteter Rest, `HEAD` = `origin/main`.

## Pipeline: `.github/workflows/ci.yml` (feste Eckpunkte)
Das YAML schreibst du selbst. Diese Punkte sind verbindlich:

| Eckpunkt | Vorgabe |
|---|---|
| Name des Workflows | `CI` |
| Auslöser | `push` auf `main` und `workflow_dispatch` |
| Job | genau ein Job `check`, `runs-on: ubuntu-latest`, `timeout-minutes: 20` |
| Container | `container: image: ghcr.io/specrun-lab/devcontainer:1` mit `options: --user root` (Container-Jobs brauchen Schreibrechte im Arbeitsordner des Runners) |
| Umgebung | `GOMODCACHE: /home/dev/go/pkg/mod`, `GOCACHE: /home/dev/.cache/go-build`, `GOFLAGS: -modcacherw -buildvcs=false`. Als root zeigt `HOME` woanders hin; so werden die vorgehaltenen Go-Module genutzt und nichts muss über den Go-Proxy geladen werden. `-buildvcs=false` ist nötig, weil Git im Container (root ≠ Eigentümer des Arbeitsordners) die Abfrage verweigert, die `go build` für die Versionsangabe macht („error obtaining VCS status“) |
| Schritte | 1. `actions/checkout@v7` · 2. `make level5` · 3. `make check` · 4. Artefakt hochladen |
| Artefakt | `actions/upload-artifact@v7`, Name **`levelboard-report`**, Inhalt `frontend/dist/results.json` und `checks/.out/playwright.json`, **`if: always()`** (auch wenn `make check` scheitert) |

Der Job ist nur grün, wenn `make check` grün ist. In der Pipeline läuft nur **bis Level 5**: Level 6 prüft die Pipeline selbst und gehört nicht hinein. Ab Level 7 kommt ein zweiter Job `images` dazu (siehe `level-07.md`); der Job `check` bleibt unverändert.

## Kennzahl
Ab Level 6 setzt `write-results.mjs` bei Level 6 `metrics.pipeline` mit `checks/collect-report.mjs` (siehe `05-datenmodell.md`, „Kennzahlen pro Level“). Der Abschlussbericht zeigt daraus die Pipeline-Dauer.

## Makefile
- `make level6`: genau wie `make level5`, danach `6` nach `.run/level` und die Ausgabe `Repo: https://github.com/<GITHUB_REPO>`.
- Make-Variablen: `RUN_ID ?= lokal` und `GITHUB_REPO ?= specrun-lab/levelboard-$(RUN_ID)`. `make check` gibt `GITHUB_REPO` an die Prüfsuite weiter.

## Prüfsuite für Level 6
`checks/tests/level6.spec.ts`: genau eine Gruppe `test.describe('level-6', …)`, seriell, Zeitlimit pro Test 120 s (`test.setTimeout(120_000)`), mit genau diesen 4 Tests in dieser Reihenfolge und mit wörtlichen Titeln. Abfragen laufen über `gh api …` (Token aus `GH_TOKEN`), lokale Angaben über `git` im Projektordner.

| # | Testtitel | Prüft |
|---|---|---|
| 1 | `Repo existiert und ist öffentlich` | `gh api repos/<GITHUB_REPO>`: `full_name` stimmt, `visibility` = `public`, `default_branch` = `main` |
| 2 | `Lokaler Stand ist gepusht` | `git status --porcelain` ist leer; `git rev-parse HEAD` = `commit.sha` aus `gh api repos/<GITHUB_REPO>/branches/main` |
| 3 | `Letzter Pipeline-Lauf ist grün` | `gh api "repos/<GITHUB_REPO>/actions/workflows/ci.yml/runs?branch=main&head_sha=<HEAD>&per_page=1"`: ein Lauf vorhanden, `status` = `completed`, `conclusion` = `success` |
| 4 | `Report enthält Level 1–5 bestanden` | `gh run download <id> --repo <GITHUB_REPO> --name levelboard-report --dir <temp>`; darin `results.json` (direkt oder unter `frontend/dist/`); Level 1–5 `bestanden`, jedes mit mindestens einem Check |

## Ablauf, den du selbst durchspielen sollst
1. Erst die Levels 1–5 lokal fertig machen; `make level5` und `make check` sind grün.
2. Pipeline-Datei anlegen, Repo anlegen, committen, pushen.
3. Auf den Lauf warten: `gh run watch --repo specrun-lab/levelboard-$RUN_ID --exit-status`. Ist er rot: Log lesen (`gh run view --log-failed`), korrigieren, committen, pushen, erneut warten.
4. `make level6` und `make check` → Levels 1–6 bestanden, Exit-Code 0.
5. Wichtig: Nach `make check` darf es **keine** lokalen Änderungen mehr geben, die nicht gepusht sind.

## Bestanden, wenn (Prüfer)
1. Level 1–5 sind bestanden (lokal geprüft).
2. `specrun-lab/levelboard-<RUN_ID>` existiert, ist öffentlich, Standard-Branch `main`. Der lokale `HEAD` entspricht `main` auf GitHub, ohne uncommittete Änderungen.
3. `.github/workflows/ci.yml` erfüllt die Eckpunkte: Name, Auslöser, Job, Container-Image, Go-Umgebung, Schritte, Artefakt mit `if: always()`.
4. Der letzte Lauf von `CI` für den aktuellen Commit auf `main` ist `completed`/`success`.
5. Das Artefakt `levelboard-report` dieses Laufs enthält eine `results.json`, die das Schema erfüllt und Level 1–5 als `bestanden` meldet, mit den Checks wörtlich aus den Level-Dateien. `playwright.json` ist vorhanden.
6. Keine Zugangsdaten im Repo, in der gesamten Git-Historie und in den Logs des Laufs (Muster wie `github_pat_`, `ghp_`, `gho_`, `sk-ant-`).
7. Lokal meldet `make check` Level 1–6 bestanden.
