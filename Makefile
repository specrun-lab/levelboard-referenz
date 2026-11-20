# Levelboard – feste Befehle für Agent und Prüfer.
# make level1          baut das Frontend und startet es mit vite preview auf http://127.0.0.1:8080
# make level2          baut das Frontend und startet es mit nginx auf http://127.0.0.1:8080
# make level3          wie level2, dazu das Go-Backend auf http://127.0.0.1:8081
# make level4          wie level3; das Backend speichert in der SQLite-Datei .run/levelboard.db
# make level5          wie level4, nginx leitet /api/ an das Backend weiter, die Seite liest live aus dem Backend
# make level6          wie level5; Level 6 (Repo + CI) liegt auf GitHub, make check fragt es dort ab
# make level7          wie level6; Level 7 (Images in der Pipeline) liegt auf GitHub und in der GHCR
# make level8          wie level7; Level 8 (Deployment) läuft auf dem Server unter LIVE_URL
# make level9          wie level8; make check prüft zusätzlich die Live-Seite (inkl. Lasttest) und meldet an die Live-API
# make level10         wie level9; make check sammelt die Kennzahlen des Abschlussberichts und prüft ihn danach live
# make restart-backend startet nur das Backend neu, die Datenbank bleibt erhalten
# make stop-backend    beendet nur das Backend (z. B. um einen Ausfall nachzustellen)
# make check           prüft alle Levels bis zum zuletzt gestarteten und schreibt results.json
# make check URL=…     dasselbe gegen eine andere Adresse der Seite (API_URL für das Backend)
# make down            stoppt alles, was gestartet wurde

SHELL   := /bin/bash
RUN     := .run
URL     ?= http://127.0.0.1:8080
API_URL ?= http://127.0.0.1:8081
DB      := $(RUN)/levelboard.db
# Zuletzt gestartetes Level (von make levelN geschrieben); ohne Datei: höchstes gebautes Level
LEVEL  := $(shell cat $(RUN)/level 2>/dev/null || echo 10)
# Repo auf GitHub (Level 6): specrun-lab/levelboard-<RUN_ID>
RUN_ID      ?= lokal
GITHUB_REPO ?= specrun-lab/levelboard-$(RUN_ID)
# Live-Adresse (Level 8): https://<RUN_ID>.<LIVE_DOMAIN>, LIVE_DOMAIN kommt aus der Umgebung
LIVE_DOMAIN ?=
LIVE_URL    ?= https://$(RUN_ID).$(LIVE_DOMAIN)
LEVELS := $(shell seq 1 $(LEVEL))
# Ab Level 5 meldet make check die Ergebnisse zusätzlich ans Backend
REPORT_API := $(shell [ $(LEVEL) -ge 5 ] && echo 1 || echo 0)
# Ab Level 9 meldet make check zusätzlich an die Live-API
REPORT_LIVE := $(shell [ $(LEVEL) -ge 9 ] && echo 1 || echo 0)
NGINX_CONF ?= frontend/nginx.conf

.PHONY: level1 level2 level3 level4 level5 level6 level7 level8 level9 level10 restart-backend check down build backend-build start-nginx start-backend stop-backend wait

build:
	cd frontend && npm ci && npm run build

backend-build:
	cd backend && go build -o bin/levelboard-backend .

# wartet bis zu 60 s auf eine Adresse (PORT_URL)
wait:
	@for i in $$(seq 1 60); do curl -sf -o /dev/null $(PORT_URL) && exit 0; sleep 1; done; \
	  echo "Fehler: $(PORT_URL) antwortet nicht" >&2; cat $(RUN)/*.log >&2; exit 1

start-nginx:
	@mkdir -p $(RUN)/nginx-tmp
	nginx -p "$(CURDIR)/" -e $(RUN)/nginx-error.log -c $(NGINX_CONF)

start-backend:
	@mkdir -p $(RUN)
	@nohup env LEVELBOARD_DB=$(DB) ./backend/bin/levelboard-backend < /dev/null >> $(RUN)/backend.log 2>&1 & echo $$! > $(RUN)/backend.pid
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8081/api/health

# beendet das Backend und wartet bis zu 5 s, bis der Prozess wirklich weg ist
stop-backend:
	@if [ -f $(RUN)/backend.pid ]; then kill $$(cat $(RUN)/backend.pid) 2>/dev/null || true; \
	  for i in $$(seq 1 50); do kill -0 $$(cat $(RUN)/backend.pid) 2>/dev/null || break; sleep 0.1; done; \
	  rm -f $(RUN)/backend.pid; fi

level1: down build
	@mkdir -p $(RUN)
	@cd frontend; nohup ./node_modules/.bin/vite preview < /dev/null > ../$(RUN)/frontend.log 2>&1 & echo $$! > ../$(RUN)/frontend.pid
	@echo 1 > $(RUN)/level
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8080/
	@echo "Levelboard läuft auf http://127.0.0.1:8080"

level2: down build start-nginx
	@echo 2 > $(RUN)/level
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8080/
	@echo "Levelboard läuft auf http://127.0.0.1:8080"

# Ab Level 3 beginnt jeder Start mit einer frischen Datenbank (Neustart setzt zurück)
level3: down build backend-build start-nginx
	@rm -f $(DB) $(DB)-wal $(DB)-shm
	@$(MAKE) --no-print-directory start-backend
	@echo 3 > $(RUN)/level
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8080/
	@echo "Levelboard läuft auf http://127.0.0.1:8080"
	@echo "Backend läuft auf http://127.0.0.1:8081"

level4: level3
	@echo 4 > $(RUN)/level
	@echo "Datenbank: $(DB)"

# Ab Level 5: nginx mit Weiterleitung, Seite im API-Modus
level5: down build backend-build
	@$(MAKE) --no-print-directory start-nginx NGINX_CONF=frontend/nginx-api.conf
	@rm -f $(DB) $(DB)-wal $(DB)-shm
	@$(MAKE) --no-print-directory start-backend
	@echo '{"source":"api"}' > frontend/dist/config.json
	@echo 5 > $(RUN)/level
	@$(MAKE) --no-print-directory wait PORT_URL=http://127.0.0.1:8080/api/health
	@echo "Levelboard läuft auf http://127.0.0.1:8080 (Quelle: Backend)"
	@echo "Backend läuft auf http://127.0.0.1:8081"
	@echo "Datenbank: $(DB)"

# Level 6: lokal wie Level 5; Repo und Pipeline liegen auf GitHub ($(GITHUB_REPO))
level6: level5
	@echo 6 > $(RUN)/level
	@echo "Repo: https://github.com/$(GITHUB_REPO)"

# Level 7: lokal wie Level 6; die Images baut und testet die Pipeline (Job „images“)
level7: level6
	@echo 7 > $(RUN)/level
	@echo "Images: ghcr.io/$(GITHUB_REPO)-frontend und ghcr.io/$(GITHUB_REPO)-backend"

# Level 8: lokal wie Level 7; deployt wird von der Pipeline (Job „deploy“)
level8: level7
	@echo 8 > $(RUN)/level
	@echo "Live: $(LIVE_URL)"

# Level 9: lokal wie Level 8; make check prüft zusätzlich die Live-Seite und meldet dorthin
level9: level8
	@echo 9 > $(RUN)/level
	@echo "Live-Prüfung gegen $(LIVE_URL)"

# Level 10: lokal wie Level 9; make check meldet zusätzlich den Abschlussbericht und prüft ihn live
level10: level9
	@echo 10 > $(RUN)/level
	@echo "Abschlussbericht: $(LIVE_URL)"

restart-backend: stop-backend start-backend
	@echo "Backend neu gestartet (Datenbank erhalten)"

check:
	cd checks && ([ -d node_modules ] || npm ci) && npx playwright install chromium > /dev/null
	rm -f checks/.out/loadtest.json checks/.out/report.json
	cd checks && BASE_URL=$(URL) API_URL=$(API_URL) GITHUB_REPO=$(GITHUB_REPO) LIVE_URL=$(LIVE_URL) npx playwright test $(foreach n,$(LEVELS),tests/level$(n).spec.ts); REPORT_API=$(REPORT_API) API_URL=$(API_URL) REPORT_LIVE=$(REPORT_LIVE) LIVE_URL=$(LIVE_URL) node write-results.mjs $(LEVELS)
	@if [ $(LEVEL) -ge 10 ]; then cd checks && RUN_ID=$(RUN_ID) LIVE_URL=$(LIVE_URL) npx playwright test tests/live-report.spec.ts --reporter=list; fi

down:
	@if [ -f $(RUN)/frontend.pid ]; then kill $$(cat $(RUN)/frontend.pid) 2>/dev/null || true; rm -f $(RUN)/frontend.pid; fi
	@if [ -f $(RUN)/nginx.pid ]; then kill $$(cat $(RUN)/nginx.pid) 2>/dev/null || true; rm -f $(RUN)/nginx.pid; fi
	@$(MAKE) --no-print-directory stop-backend
	@rm -f $(RUN)/level
