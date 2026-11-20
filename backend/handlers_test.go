package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func do(t *testing.T, h http.Handler, method, path, ctype, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	if ctype != "" {
		req.Header.Set("Content-Type", ctype)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestHealth(t *testing.T) {
	h := NewHandler(newTestStore(t, fixedNow))
	rec := do(t, h, "GET", "/api/health", "", "")
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("Status %d, Typ %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	var b map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &b)
	if c, ok := b["commit"]; b["status"] != "ok" || b["version"] != "0.1.0" || !ok || c != nil || len(b) != 3 {
		t.Errorf("Body %v", b)
	}
}

func TestCommitInHealthUndLevels(t *testing.T) {
	s := newTestStore(t, fixedNow)
	s.SetCommit("0123456789abcdef0123456789abcdef01234567")
	h := NewHandler(s)
	var b map[string]any
	_ = json.Unmarshal(do(t, h, "GET", "/api/health", "", "").Body.Bytes(), &b)
	if b["commit"] != "0123456789abcdef0123456789abcdef01234567" {
		t.Errorf("health: %v", b)
	}
	var r Results
	_ = json.Unmarshal(do(t, h, "GET", "/api/levels", "", "").Body.Bytes(), &r)
	if r.Run.Commit == nil || *r.Run.Commit != "0123456789abcdef0123456789abcdef01234567" {
		t.Errorf("run.commit: %v", r.Run.Commit)
	}
}

func TestLevelsUndEinzelnesLevel(t *testing.T) {
	h := NewHandler(newTestStore(t, fixedNow))
	var r Results
	if err := json.Unmarshal(do(t, h, "GET", "/api/levels", "", "").Body.Bytes(), &r); err != nil || len(r.Levels) != 10 {
		t.Fatalf("GET /api/levels: %v, %d Levels", err, len(r.Levels))
	}
	var l Level
	rec := do(t, h, "GET", "/api/levels/3", "", "")
	if err := json.Unmarshal(rec.Body.Bytes(), &l); err != nil || rec.Code != 200 || l.Level != 3 || l.Title != "REST-Backend" {
		t.Fatalf("GET /api/levels/3: %d %+v", rec.Code, l)
	}
}

func TestMeldenUndFehlerfaelle(t *testing.T) {
	h := NewHandler(newTestStore(t, fixedNow))
	const j = "application/json"
	okBody := `{"checks":[{"name":"a","ok":true}],"durationMs":5}`

	cases := []struct {
		name, method, path, ctype, body string
		code                            int
	}{
		{"Reihenfolge verletzt", "POST", "/api/levels/2/result", j, okBody, 409},
		{"Level 1 melden", "POST", "/api/levels/1/result", j, okBody, 200},
		{"Level 2 melden", "POST", "/api/levels/2/result", j, okBody, 200},
		{"Content-Type mit charset", "POST", "/api/levels/1/result", "application/json; charset=utf-8", okBody, 200},
		{"kaputtes JSON", "POST", "/api/levels/1/result", j, `{kaputt`, 400},
		{"checks fehlt", "POST", "/api/levels/1/result", j, `{"durationMs":1}`, 400},
		{"checks leer", "POST", "/api/levels/1/result", j, `{"checks":[],"durationMs":1}`, 400},
		{"name leer", "POST", "/api/levels/1/result", j, `{"checks":[{"name":"","ok":true}],"durationMs":1}`, 400},
		{"ok fehlt", "POST", "/api/levels/1/result", j, `{"checks":[{"name":"a"}],"durationMs":1}`, 400},
		{"durationMs negativ", "POST", "/api/levels/1/result", j, `{"checks":[{"name":"a","ok":true}],"durationMs":-1}`, 400},
		{"durationMs Kommazahl", "POST", "/api/levels/1/result", j, `{"checks":[{"name":"a","ok":true}],"durationMs":1.5}`, 400},
		{"unbekanntes Feld", "POST", "/api/levels/1/result", j, `{"checks":[{"name":"a","ok":true}],"durationMs":1,"x":1}`, 400},
		{"metrics kein Objekt", "POST", "/api/levels/1/result", j, `{"checks":[{"name":"a","ok":true}],"durationMs":1,"metrics":[]}`, 400},
		{"falscher Content-Type", "POST", "/api/levels/1/result", "text/plain", okBody, 415},
		{"zu groß", "POST", "/api/levels/1/result", j, `{"checks":[{"name":"` + strings.Repeat("x", 70*1024) + `","ok":true}],"durationMs":1}`, 413},
		{"Level 0", "GET", "/api/levels/0", "", "", 404},
		{"Level 11", "POST", "/api/levels/11/result", j, okBody, 404},
		{"Level abc", "GET", "/api/levels/abc", "", "", 404},
		{"unbekannter Pfad", "GET", "/api/unbekannt", "", "", 404},
		{"DELETE auf levels", "DELETE", "/api/levels", "", "", 405},
		{"GET auf result", "GET", "/api/levels/1/result", "", "", 405},
		{"Historie", "GET", "/api/levels/1/history", "", "", 200},
		{"Historie limit", "GET", "/api/levels/1/history?limit=500", "", "", 200},
		{"Historie limit 0", "GET", "/api/levels/1/history?limit=0", "", "", 400},
		{"Historie limit 501", "GET", "/api/levels/1/history?limit=501", "", "", 400},
		{"Historie limit abc", "GET", "/api/levels/1/history?limit=abc", "", "", 400},
		{"Historie Level 11", "GET", "/api/levels/11/history", "", "", 404},
		{"Historie POST", "POST", "/api/levels/1/history", j, okBody, 405},
	}
	for _, c := range cases {
		rec := do(t, h, c.method, c.path, c.ctype, c.body)
		if rec.Code != c.code {
			t.Errorf("%s: Status %d, erwartet %d (%s)", c.name, rec.Code, c.code, rec.Body.String())
			continue
		}
		if rec.Header().Get("Content-Type") != "application/json" {
			t.Errorf("%s: Content-Type %q", c.name, rec.Header().Get("Content-Type"))
		}
		if c.code >= 400 {
			var e map[string]string
			if json.Unmarshal(rec.Body.Bytes(), &e) != nil || e["error"] == "" {
				t.Errorf("%s: kein Fehlerobjekt: %s", c.name, rec.Body.String())
			}
		}
		if c.code == 405 && rec.Header().Get("Allow") == "" {
			t.Errorf("%s: Allow-Header fehlt", c.name)
		}
	}
}
