package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Verbrauch (ab Spec 2.1.0): Tokens und Kosten, die der Runner nach der Prüfung nachträgt.
// Gespeichert als usage.json im Ordner der Datenbank, damit er Neustarts und Deploys übersteht.
type usageStore struct {
	mu   sync.Mutex
	path string
}

func newUsageStore(dbPath string) *usageStore {
	return &usageStore{path: filepath.Join(filepath.Dir(dbPath), "usage.json")}
}

// Get liefert den gespeicherten Verbrauch oder {}, wenn noch keiner nachgetragen wurde.
func (u *usageStore) Get() (json.RawMessage, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	b, err := os.ReadFile(u.path)
	if errors.Is(err, os.ErrNotExist) {
		return json.RawMessage("{}"), nil
	}
	return b, err
}

// Put ersetzt den Verbrauch (atomar über eine temporäre Datei). {} leert ihn.
func (u *usageStore) Put(v json.RawMessage) error {
	u.mu.Lock()
	defer u.mu.Unlock()
	tmp := u.path + ".tmp"
	if err := os.WriteFile(tmp, v, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, u.path)
}

func usageHandler(u *usageStore) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			b, err := u.Get()
			if err != nil {
				internalError(w, err)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(b)
		case http.MethodPut:
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
			var obj map[string]any
			if err := json.Unmarshal(body, &obj); err != nil || obj == nil {
				writeError(w, http.StatusBadRequest, "Body muss ein JSON-Objekt sein")
				return
			}
			var compact bytes.Buffer
			_ = json.Compact(&compact, body)
			if err := u.Put(compact.Bytes()); err != nil {
				internalError(w, err)
				return
			}
			writeJSON(w, http.StatusOK, obj)
		default:
			w.Header().Set("Allow", strings.Join([]string{http.MethodGet, http.MethodPut}, ", "))
			writeError(w, http.StatusMethodNotAllowed, "Methode nicht erlaubt")
		}
	}
}
