import { defineConfig } from '@playwright/test';

// Prüfsuite des Levelboards. Ziel-URL über BASE_URL (Standard: lokale Seite auf Port 8080).
export default defineConfig({
  testDir: './tests',
  retries: 0,
  // Nacheinander: Die API-Tests (ab Level 3) verändern den gemeinsamen Zustand des Backends.
  workers: 1,
  timeout: 15_000,
  reporter: [['list'], ['json', { outputFile: '.out/playwright.json' }]],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://127.0.0.1:8080',
  },
  // Level 10 braucht den Lasttest aus Level 9 im selben Lauf. Playwright sortiert Dateien alphabetisch
  // (level10 vor level2), deshalb läuft Level 10 als eigenes Projekt nach allen anderen Tests.
  projects: [
    { name: 'levels', testMatch: /level[1-9]\.spec\.ts$/ },
    { name: 'level-10', testMatch: /level10\.spec\.ts$/, dependencies: ['levels'] },
    { name: 'weitere', testMatch: /(container|live-report)\.spec\.ts$/ },
  ],
});
