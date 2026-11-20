package main

import (
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func fixedNow() time.Time { return time.Date(2026, 11, 21, 9, 14, 0, 0, time.UTC) }

// newTestStore öffnet eine frische Datenbank in einem temporären Ordner.
func newTestStore(t *testing.T, now func() time.Time) *Store {
	t.Helper()
	s, err := OpenStore(filepath.Join(t.TempDir(), "test.db"), "lokal", "0.1.0", now)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func snap(t *testing.T, s *Store) Results {
	t.Helper()
	r, err := s.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func ok(n int) []Check {
	cs := make([]Check, n)
	for i := range cs {
		cs[i] = Check{Name: "c", OK: true}
	}
	return cs
}

func TestStartzustand(t *testing.T) {
	s := newTestStore(t, fixedNow)
	r := snap(t, s)
	if len(r.Levels) != 10 || r.Run.ID != "lokal" || r.Run.UpdatedAt != nil {
		t.Fatalf("unerwarteter Startzustand: %+v", r.Run)
	}
	for i, l := range r.Levels {
		if l.Level != i+1 || l.Title != Titles[i] || l.Status != StatusOffen || l.CheckedAt != nil || l.DurationMs != nil || len(l.Checks) != 0 {
			t.Errorf("Level %d nicht im Startzustand: %+v", i+1, l)
		}
	}
}

func TestBestandenSetztHoehereAufOffen(t *testing.T) {
	s := newTestStore(t, fixedNow)
	r, err := s.Report(1, Report{Checks: ok(3), DurationMs: 120})
	if err != nil {
		t.Fatal(err)
	}
	l := r.Levels[0]
	if l.Status != StatusBestanden || *l.CheckedAt != "2026-11-21T09:14:00.000Z" || *l.DurationMs != 120 || len(l.Checks) != 3 {
		t.Fatalf("Level 1 falsch: %+v", l)
	}
	if *r.Run.UpdatedAt != *l.CheckedAt {
		t.Error("run.updatedAt nicht gesetzt")
	}
	for _, h := range r.Levels[1:] {
		if h.Status != StatusOffen {
			t.Errorf("Level %d sollte offen sein, ist %s", h.Level, h.Status)
		}
	}
}

func TestFehlschlagSperrtHoehere(t *testing.T) {
	s := newTestStore(t, fixedNow)
	_, _ = s.Report(1, Report{Checks: ok(1)})
	r, err := s.Report(2, Report{Checks: []Check{{"a", true}, {"b", false}}})
	if err != nil {
		t.Fatal(err)
	}
	if r.Levels[0].Status != StatusBestanden || r.Levels[1].Status != StatusFehlgeschlagen {
		t.Fatalf("Status falsch: %s / %s", r.Levels[0].Status, r.Levels[1].Status)
	}
	for _, h := range r.Levels[2:] {
		if h.Status != StatusGesperrt || h.CheckedAt != nil {
			t.Errorf("Level %d sollte gesperrt und leer sein: %+v", h.Level, h)
		}
	}
	// Erneut bestanden → höhere Levels wieder offen
	r, _ = s.Report(2, Report{Checks: ok(1)})
	if r.Levels[2].Status != StatusOffen {
		t.Errorf("Level 3 sollte wieder offen sein, ist %s", r.Levels[2].Status)
	}
}

func TestReihenfolgeErzwungen(t *testing.T) {
	s := newTestStore(t, fixedNow)
	before := snap(t, s)
	if _, err := s.Report(3, Report{Checks: ok(1)}); !errors.Is(err, ErrConflict) {
		t.Fatalf("erwartet ErrConflict, bekommen %v", err)
	}
	if snap(t, s).Levels[2].Status != before.Levels[2].Status {
		t.Error("Zustand wurde trotz Konflikt geändert")
	}
}

func TestUnbekanntesLevel(t *testing.T) {
	s := newTestStore(t, fixedNow)
	for _, n := range []int{0, 11, -1} {
		if _, err := s.Report(n, Report{Checks: ok(1)}); !errors.Is(err, ErrNotFound) {
			t.Errorf("Level %d: erwartet ErrNotFound, bekommen %v", n, err)
		}
		if _, err := s.Level(n); !errors.Is(err, ErrNotFound) {
			t.Errorf("Level %d: erwartet ErrNotFound", n)
		}
	}
}

func TestPersistenzUeberNeustart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "p.db")
	s1, err := OpenStore(path, "lokal", "0.1.0", fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = s1.Report(1, Report{Checks: ok(2), DurationMs: 5, Metrics: map[string]any{"x": 1.0}})
	s1.Close()
	s2, err := OpenStore(path, "lokal", "0.1.0", fixedNow)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	l, _ := s2.Level(1)
	if l.Status != StatusBestanden || l.Metrics["x"] != 1.0 || len(l.Checks) != 2 {
		t.Fatalf("Daten nach Neustart verloren: %+v", l)
	}
	h, _ := s2.History(1, 50)
	if len(h) != 1 {
		t.Fatalf("Historie nach Neustart: %d Einträge", len(h))
	}
}

func TestHistorie(t *testing.T) {
	s := newTestStore(t, fixedNow)
	_, _ = s.Report(1, Report{Checks: ok(1), DurationMs: 1})
	_, _ = s.Report(1, Report{Checks: []Check{{"a", false}}, DurationMs: 2})
	_, _ = s.Report(2, Report{Checks: ok(1), DurationMs: 3}) // 409, darf nicht in die Historie
	h, err := s.History(1, 50)
	if err != nil || len(h) != 2 {
		t.Fatalf("Historie Level 1: %v, %d Einträge", err, len(h))
	}
	if h[0].DurationMs != 2 || h[0].Status != StatusFehlgeschlagen || h[1].DurationMs != 1 || h[0].ID <= h[1].ID {
		t.Errorf("Reihenfolge/Inhalt falsch: %+v", h)
	}
	if h2, _ := s.History(2, 50); len(h2) != 0 {
		t.Errorf("abgelehnte Meldung in der Historie: %+v", h2)
	}
	if h1, _ := s.History(1, 1); len(h1) != 1 || h1[0].DurationMs != 2 {
		t.Errorf("limit wirkt nicht: %+v", h1)
	}
	if _, err := s.History(11, 50); !errors.Is(err, ErrNotFound) {
		t.Errorf("Level 11: %v", err)
	}
}

func TestGleichzeitigeMeldungen(t *testing.T) {
	s := newTestStore(t, nil)
	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(2)
		go func(pass bool) {
			defer wg.Done()
			_, _ = s.Report(1, Report{Checks: []Check{{"c", pass}}})
		}(i%2 == 0)
		go func() { defer wg.Done(); _, _ = s.Snapshot() }()
	}
	wg.Wait()
	if h, _ := s.History(1, 500); len(h) != 200 {
		t.Fatalf("Historie hat %d statt 200 Einträge", len(h))
	}
	r := snap(t, s)
	want := StatusOffen
	if r.Levels[0].Status == StatusFehlgeschlagen {
		want = StatusGesperrt
	}
	for _, h := range r.Levels[1:] {
		if h.Status != want {
			t.Fatalf("inkonsistenter Endzustand: Level 1 %s, Level %d %s", r.Levels[0].Status, h.Level, h.Status)
		}
	}
}
