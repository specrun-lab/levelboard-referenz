package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite" // reiner Go-Treiber, Name „sqlite“
)

// Feste Level-Titel (siehe spec/01-produkt.md).
var Titles = [10]string{
	"Statische Seite",
	"Webserver",
	"REST-Backend",
	"Datenbank",
	"Frontend + Backend",
	"Repo + CI",
	"Images in der Pipeline",
	"Deployment",
	"Live-Prüfung",
	"Metriken veröffentlicht",
}

const (
	StatusOffen          = "offen"
	StatusBestanden      = "bestanden"
	StatusFehlgeschlagen = "fehlgeschlagen"
	StatusGesperrt       = "gesperrt"
)

type Check struct {
	Name string `json:"name"`
	OK   bool   `json:"ok"`
}

type Level struct {
	Level      int            `json:"level"`
	Title      string         `json:"title"`
	Status     string         `json:"status"`
	CheckedAt  *string        `json:"checkedAt"`
	DurationMs *int64         `json:"durationMs"`
	Checks     []Check        `json:"checks"`
	Metrics    map[string]any `json:"metrics"`
}

type Run struct {
	ID        string  `json:"id"`
	Version   string  `json:"version"`
	Commit    *string `json:"commit"`
	UpdatedAt *string `json:"updatedAt"`
}

// Results hat exakt das Format von results.json (spec/results.schema.json).
type Results struct {
	Run    Run     `json:"run"`
	Levels []Level `json:"levels"`
}

// Report ist ein gemeldetes Prüfergebnis für ein Level.
type Report struct {
	Checks     []Check
	DurationMs int64
	Metrics    map[string]any
}

// Entry ist ein Eintrag der Historie (Tabelle reports).
type Entry struct {
	ID         int64          `json:"id"`
	Status     string         `json:"status"`
	CheckedAt  string         `json:"checkedAt"`
	DurationMs int64          `json:"durationMs"`
	Checks     []Check        `json:"checks"`
	Metrics    map[string]any `json:"metrics"`
}

var (
	ErrNotFound = errors.New("Level nicht gefunden")
	ErrConflict = errors.New("ein niedrigeres Level ist nicht bestanden")
)

// Migration 1: exakt das Schema aus spec/05-datenmodell.md.
const migration1 = `
CREATE TABLE levels (
  level        INTEGER PRIMARY KEY CHECK (level BETWEEN 1 AND 10),
  status       TEXT    NOT NULL CHECK (status IN ('offen','bestanden','fehlgeschlagen','gesperrt')),
  checked_at   TEXT,
  duration_ms  INTEGER,
  checks       TEXT    NOT NULL DEFAULT '[]',
  metrics      TEXT    NOT NULL DEFAULT '{}'
);
CREATE TABLE reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  level        INTEGER NOT NULL REFERENCES levels(level),
  status       TEXT    NOT NULL CHECK (status IN ('bestanden','fehlgeschlagen')),
  checked_at   TEXT    NOT NULL,
  duration_ms  INTEGER NOT NULL,
  checks       TEXT    NOT NULL,
  metrics      TEXT    NOT NULL
);
CREATE INDEX reports_level ON reports(level, id);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
`

// Store hält den Zustand in einer SQLite-Datei. Genau eine offene Verbindung:
// alle Zugriffe laufen nacheinander, Transaktionen sind dadurch atomar.
type Store struct {
	db      *sql.DB
	runID   string
	version string
	commit  *string // Commit des laufenden Images (LEVELBOARD_COMMIT), sonst nil
	now     func() time.Time
	usage   *usageStore // Verbrauch (usage.json neben der Datenbank)
}

// SetCommit legt den Commit fest, den run.commit und /api/health melden; leer heißt unbekannt (null).
func (s *Store) SetCommit(c string) {
	if c == "" {
		s.commit = nil
		return
	}
	s.commit = &c
}

// Commit liefert den Commit des laufenden Images oder nil.
func (s *Store) Commit() *string { return s.commit }

func OpenStore(path, runID, version string, now func() time.Time) (*Store, error) {
	if now == nil {
		now = time.Now
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	s := &Store{db: db, runID: runID, version: version, now: now, usage: newUsageStore(path)}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("Migration: %w", err)
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate() error {
	var v int
	if err := s.db.QueryRow(`PRAGMA user_version`).Scan(&v); err != nil {
		return err
	}
	if v >= 1 {
		return nil
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.Exec(migration1); err != nil {
		return err
	}
	for n := 1; n <= len(Titles); n++ {
		if _, err := tx.Exec(`INSERT INTO levels (level, status) VALUES (?, 'offen')`, n); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(`PRAGMA user_version = 1`); err != nil {
		return err
	}
	return tx.Commit()
}

// Zeitformat wie JavaScript toISOString(): UTC mit Millisekunden.
func isoTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

type querier interface {
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

func scanLevel(sc interface{ Scan(...any) error }) (Level, error) {
	var l Level
	var at sql.NullString
	var d sql.NullInt64
	var checks, metrics string
	if err := sc.Scan(&l.Level, &l.Status, &at, &d, &checks, &metrics); err != nil {
		return Level{}, err
	}
	l.Title = Titles[l.Level-1]
	if at.Valid {
		l.CheckedAt = &at.String
	}
	if d.Valid {
		l.DurationMs = &d.Int64
	}
	if err := json.Unmarshal([]byte(checks), &l.Checks); err != nil {
		return Level{}, err
	}
	if err := json.Unmarshal([]byte(metrics), &l.Metrics); err != nil {
		return Level{}, err
	}
	if l.Checks == nil {
		l.Checks = []Check{}
	}
	if l.Metrics == nil {
		l.Metrics = map[string]any{}
	}
	return l, nil
}

func (s *Store) run() Run { return Run{ID: s.runID, Version: s.version, Commit: s.commit} }

const levelCols = `level, status, checked_at, duration_ms, checks, metrics`

func snapshot(q querier, run Run) (Results, error) {
	res := Results{Run: run, Levels: make([]Level, 0, len(Titles))}
	rows, err := q.Query(`SELECT ` + levelCols + ` FROM levels ORDER BY level`)
	if err != nil {
		return Results{}, err
	}
	defer rows.Close()
	for rows.Next() {
		l, err := scanLevel(rows)
		if err != nil {
			return Results{}, err
		}
		res.Levels = append(res.Levels, l)
	}
	if err := rows.Err(); err != nil {
		return Results{}, err
	}
	var updated sql.NullString
	err = q.QueryRow(`SELECT value FROM meta WHERE key = 'updated_at'`).Scan(&updated)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return Results{}, err
	}
	if updated.Valid {
		res.Run.UpdatedAt = &updated.String
	}
	return res, nil
}

// Snapshot liefert den Gesamtstand.
func (s *Store) Snapshot() (Results, error) {
	return snapshot(s.db, s.run())
}

// Level liefert ein einzelnes Level (1–10).
func (s *Store) Level(n int) (Level, error) {
	if n < 1 || n > len(Titles) {
		return Level{}, ErrNotFound
	}
	return scanLevel(s.db.QueryRow(`SELECT `+levelCols+` FROM levels WHERE level = ?`, n))
}

// Report übernimmt ein Prüfergebnis in einer Transaktion und setzt die Regeln durch:
//   - ist ein niedrigeres Level nicht bestanden: ErrConflict, nichts wird geschrieben
//   - Status aus den Checks, checkedAt und updated_at vom Server
//   - neuer Eintrag in der Historie (reports)
//   - alle höheren Levels: offen (bestanden) bzw. gesperrt (fehlgeschlagen), geleert
func (s *Store) Report(n int, rep Report) (Results, error) {
	if n < 1 || n > len(Titles) {
		return Results{}, ErrNotFound
	}
	tx, err := s.db.Begin()
	if err != nil {
		return Results{}, err
	}
	defer tx.Rollback()

	var notPassed int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM levels WHERE level < ? AND status <> 'bestanden'`, n).Scan(&notPassed); err != nil {
		return Results{}, err
	}
	if notPassed > 0 {
		return Results{}, ErrConflict
	}

	status := StatusBestanden
	for _, c := range rep.Checks {
		if !c.OK {
			status = StatusFehlgeschlagen
			break
		}
	}
	metrics := rep.Metrics
	if metrics == nil {
		metrics = map[string]any{}
	}
	checksJSON, err := json.Marshal(rep.Checks)
	if err != nil {
		return Results{}, err
	}
	metricsJSON, err := json.Marshal(metrics)
	if err != nil {
		return Results{}, err
	}
	now := isoTime(s.now())

	if _, err := tx.Exec(`INSERT INTO reports (level, status, checked_at, duration_ms, checks, metrics) VALUES (?, ?, ?, ?, ?, ?)`,
		n, status, now, rep.DurationMs, string(checksJSON), string(metricsJSON)); err != nil {
		return Results{}, err
	}
	if _, err := tx.Exec(`UPDATE levels SET status = ?, checked_at = ?, duration_ms = ?, checks = ?, metrics = ? WHERE level = ?`,
		status, now, rep.DurationMs, string(checksJSON), string(metricsJSON), n); err != nil {
		return Results{}, err
	}
	rest := StatusOffen
	if status == StatusFehlgeschlagen {
		rest = StatusGesperrt
	}
	if _, err := tx.Exec(`UPDATE levels SET status = ?, checked_at = NULL, duration_ms = NULL, checks = '[]', metrics = '{}' WHERE level > ?`, rest, n); err != nil {
		return Results{}, err
	}
	if _, err := tx.Exec(`INSERT INTO meta (key, value) VALUES ('updated_at', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, now); err != nil {
		return Results{}, err
	}
	res, err := snapshot(tx, s.run())
	if err != nil {
		return Results{}, err
	}
	return res, tx.Commit()
}

// History liefert die Meldungen zu Level n, neueste zuerst.
func (s *Store) History(n, limit int) ([]Entry, error) {
	if n < 1 || n > len(Titles) {
		return nil, ErrNotFound
	}
	rows, err := s.db.Query(`SELECT id, status, checked_at, duration_ms, checks, metrics FROM reports WHERE level = ? ORDER BY id DESC LIMIT ?`, n, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	entries := []Entry{}
	for rows.Next() {
		var e Entry
		var checks, metrics string
		if err := rows.Scan(&e.ID, &e.Status, &e.CheckedAt, &e.DurationMs, &checks, &metrics); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(checks), &e.Checks); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(metrics), &e.Metrics); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}
