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
});
