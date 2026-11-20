// Levelboard-Backend: REST-API für die Level-Ergebnisse, gespeichert in SQLite (modernc.org/sqlite).
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

const (
	defaultAddr = "127.0.0.1:8081"
	version     = "0.1.0"
)

func main() {
	// Adresse: lokal nur 127.0.0.1, im Container 0.0.0.0 (über LEVELBOARD_ADDR)
	addr := os.Getenv("LEVELBOARD_ADDR")
	if addr == "" {
		addr = defaultAddr
	}
	runID := os.Getenv("RUN_ID")
	if runID == "" {
		runID = "lokal"
	}
	dbPath := os.Getenv("LEVELBOARD_DB")
	if dbPath == "" {
		dbPath = ".run/levelboard.db"
	}
	store, err := OpenStore(dbPath, runID, version, nil)
	if err != nil {
		log.Fatalf("Datenbank %s: %v", dbPath, err)
	}
	defer store.Close()
	// Commit des Images (Level 8): kommt im Container aus dem Build-Argument REVISION
	store.SetCommit(os.Getenv("LEVELBOARD_COMMIT"))
	log.Printf("Datenbank: %s", dbPath)

	srv := &http.Server{
		Addr:              addr,
		Handler:           logRequests(NewHandler(store)),
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	go func() {
		log.Printf("Levelboard-Backend läuft auf http://%s", addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server-Fehler: %v", err)
		}
	}()

	<-ctx.Done()
	log.Print("Beende …")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Fehler beim Beenden: %v", err)
	}
	log.Print("Beendet")
}

func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start).Round(time.Microsecond))
	})
}
