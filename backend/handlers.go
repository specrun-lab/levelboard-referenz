package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"mime"
	"net/http"
	"strconv"
)

const maxBody = 64 * 1024

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func internalError(w http.ResponseWriter, err error) {
	log.Printf("interner Fehler: %v", err)
	writeError(w, http.StatusInternalServerError, "interner Fehler")
}

// allow prüft die Methode; bei falscher Methode 405 mit Allow-Header.
func allow(w http.ResponseWriter, r *http.Request, method string) bool {
	if r.Method == method {
		return true
	}
	w.Header().Set("Allow", method)
	writeError(w, http.StatusMethodNotAllowed, "Methode nicht erlaubt")
	return false
}

func levelNumber(r *http.Request) (int, bool) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || n < 1 || n > len(Titles) {
		return 0, false
	}
	return n, true
}

// reportBody ist der Body von POST /api/levels/{n}/result. Zeiger erkennen fehlende Felder.
type reportBody struct {
	Checks []struct {
		Name *string `json:"name"`
		OK   *bool   `json:"ok"`
	} `json:"checks"`
	DurationMs *int64          `json:"durationMs"`
	Metrics    json.RawMessage `json:"metrics"`
}

func parseReport(body []byte) (Report, string) {
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	var b reportBody
	if err := dec.Decode(&b); err != nil {
		return Report{}, "ungültiges JSON oder unbekannte Felder"
	}
	if dec.More() {
		return Report{}, "ungültiges JSON"
	}
	if b.Checks == nil || len(b.Checks) == 0 || len(b.Checks) > 100 {
		return Report{}, "checks muss 1 bis 100 Einträge enthalten"
	}
	rep := Report{Checks: make([]Check, 0, len(b.Checks))}
	for _, c := range b.Checks {
		if c.Name == nil || *c.Name == "" || c.OK == nil {
			return Report{}, "jeder Check braucht name (nicht leer) und ok"
		}
		rep.Checks = append(rep.Checks, Check{Name: *c.Name, OK: *c.OK})
	}
	if b.DurationMs == nil || *b.DurationMs < 0 {
		return Report{}, "durationMs muss eine ganze Zahl ≥ 0 sein"
	}
	rep.DurationMs = *b.DurationMs
	if len(b.Metrics) > 0 && string(b.Metrics) != "null" {
		var m map[string]any
		if err := json.Unmarshal(b.Metrics, &m); err != nil || m == nil {
			return Report{}, "metrics muss ein Objekt sein"
		}
		rep.Metrics = m
	}
	return rep, ""
}

// NewHandler baut alle Routen der API.
func NewHandler(s *Store) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		if !allow(w, r, http.MethodGet) {
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "version": s.version})
	})

	mux.HandleFunc("/api/levels", func(w http.ResponseWriter, r *http.Request) {
		if !allow(w, r, http.MethodGet) {
			return
		}
		res, err := s.Snapshot()
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, res)
	})

	mux.HandleFunc("/api/levels/{n}", func(w http.ResponseWriter, r *http.Request) {
		n, ok := levelNumber(r)
		if !ok {
			writeError(w, http.StatusNotFound, "Level nicht gefunden")
			return
		}
		if !allow(w, r, http.MethodGet) {
			return
		}
		l, err := s.Level(n)
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, l)
	})

	mux.HandleFunc("/api/levels/{n}/history", func(w http.ResponseWriter, r *http.Request) {
		n, ok := levelNumber(r)
		if !ok {
			writeError(w, http.StatusNotFound, "Level nicht gefunden")
			return
		}
		if !allow(w, r, http.MethodGet) {
			return
		}
		limit := 50
		if q := r.URL.Query(); q.Has("limit") {
			v, err := strconv.Atoi(q.Get("limit"))
			if err != nil || v < 1 || v > 500 {
				writeError(w, http.StatusBadRequest, "limit muss eine ganze Zahl von 1 bis 500 sein")
				return
			}
			limit = v
		}
		entries, err := s.History(n, limit)
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"level": n, "entries": entries})
	})

	mux.HandleFunc("/api/levels/{n}/result", func(w http.ResponseWriter, r *http.Request) {
		n, ok := levelNumber(r)
		if !ok {
			writeError(w, http.StatusNotFound, "Level nicht gefunden")
			return
		}
		if !allow(w, r, http.MethodPost) {
			return
		}
		mt, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mt != "application/json" {
			writeError(w, http.StatusUnsupportedMediaType, "Content-Type muss application/json sein")
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
		if err != nil {
			var tooBig *http.MaxBytesError
			if errors.As(err, &tooBig) {
				writeError(w, http.StatusRequestEntityTooLarge, "Body größer als 64 KB")
				return
			}
			writeError(w, http.StatusBadRequest, "Body nicht lesbar")
			return
		}
		rep, msg := parseReport(body)
		if msg != "" {
			writeError(w, http.StatusBadRequest, msg)
			return
		}
		res, err := s.Report(n, rep)
		if errors.Is(err, ErrConflict) {
			writeError(w, http.StatusConflict, err.Error())
			return
		}
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, res)
	})

	// Alles andere: 404 als JSON
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "nicht gefunden")
	})
	return mux
}
