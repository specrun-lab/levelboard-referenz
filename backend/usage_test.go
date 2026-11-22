package main

import (
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestVerbrauchLeerSpeichernUndUeberstehtNeustart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "levelboard.db")
	s1, err := OpenStore(path, "lokal", "0.1.0", fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	h := NewHandler(s1)
	rec := do(t, h, "GET", "/api/usage", "", "")
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != "{}" || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("leer: %d %q", rec.Code, rec.Body.String())
	}
	body := `{"harness":"claude","models":["claude-haiku-5-5"],"total":{"output":1234,"total":56789,"costUsd":1.25},"levels":{"1":{"output":10,"total":100,"costUsd":0.1},"2":{"inLevel":3}}}`
	rec = do(t, h, "PUT", "/api/usage", "application/json; charset=utf-8", body)
	if rec.Code != 200 {
		t.Fatalf("PUT: %d %s", rec.Code, rec.Body.String())
	}
	s1.Close()

	s2, err := OpenStore(path, "lokal", "0.1.0", func() time.Time { return fixedNow().Add(time.Hour) })
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	var got, want map[string]any
	_ = json.Unmarshal([]byte(body), &want)
	if err := json.Unmarshal(do(t, NewHandler(s2), "GET", "/api/usage", "", "").Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	gb, _ := json.Marshal(got)
	wb, _ := json.Marshal(want)
	if string(gb) != string(wb) {
		t.Errorf("nach Neustart %s, erwartet %s", gb, wb)
	}

	// {} leert den Verbrauch wieder
	h2 := NewHandler(s2)
	if rec := do(t, h2, "PUT", "/api/usage", "application/json", "{}"); rec.Code != 200 {
		t.Fatalf("PUT {}: %d", rec.Code)
	}
	if b := strings.TrimSpace(do(t, h2, "GET", "/api/usage", "", "").Body.String()); b != "{}" {
		t.Errorf("nach Leeren %q", b)
	}
}

func TestVerbrauchFehlerfaelle(t *testing.T) {
	h := NewHandler(newTestStore(t, fixedNow))
	const j = "application/json"
	cases := []struct {
		name, method, ctype, body string
		code                      int
	}{
		{"Array", "PUT", j, `[1,2]`, 400},
		{"null", "PUT", j, `null`, 400},
		{"Zahl", "PUT", j, `42`, 400},
		{"kaputt", "PUT", j, `{"a":`, 400},
		{"falscher Typ", "PUT", "text/plain", `{}`, 415},
		{"ohne Typ", "PUT", "", `{}`, 415},
		{"zu gross", "PUT", j, `{"a":"` + strings.Repeat("x", 70*1024) + `"}`, 413},
		{"POST", "POST", j, `{}`, 405},
		{"DELETE", "DELETE", "", "", 405},
	}
	for _, c := range cases {
		rec := do(t, h, c.method, "/api/usage", c.ctype, c.body)
		if rec.Code != c.code {
			t.Errorf("%s: %d, erwartet %d", c.name, rec.Code, c.code)
		}
		var e map[string]any
		if json.Unmarshal(rec.Body.Bytes(), &e) != nil || e["error"] == nil {
			t.Errorf("%s: kein Fehler-JSON: %s", c.name, rec.Body.String())
		}
		if c.code == 405 && rec.Header().Get("Allow") != "GET, PUT" {
			t.Errorf("%s: Allow %q", c.name, rec.Header().Get("Allow"))
		}
	}
	// Fehlversuche ändern nichts
	if b := strings.TrimSpace(do(t, h, "GET", "/api/usage", "", "").Body.String()); b != "{}" {
		t.Errorf("nach Fehlern %q", b)
	}
}
