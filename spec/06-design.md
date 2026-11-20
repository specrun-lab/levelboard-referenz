# 06 – Design

Stil: technisch-sachliches Monitoring-Dashboard. **Nur dunkles Theme.** Keine Bilder, keine Icon-Bibliothek, keine Webfonts. Alle Werte gelten exakt.

Alle Styles liegen in `frontend/src/styles.css`. Für Statusfarben gibt es die Klassen `status-<status>`; jede setzt die Variable `--st-color` auf die passende Statusfarbe. Elemente, die nach Status eingefärbt werden, nutzen `var(--st-color)`.

## Design-Tokens (auf `:root`)
| Token | Wert | Verwendung |
|---|---|---|
| `--bg` | `#0b0d10` | Seitenhintergrund |
| `--surface` | `#12151a` | Kopfzeile, Panels, Karten |
| `--surface-2` | `#181c22` | Abzeichen-Hintergrund |
| `--border` | `#242a32` | Rahmen, Trennlinien |
| `--text` | `#e6e8eb` | Text |
| `--muted` | `#8a919b` | Beschriftungen |
| `--faint` | `#5b626c` | „/ 10“ |
| `--accent` | `#4c8dff` | Fokusrahmen |
| `--st-offen` | `#8a919b` | Status offen |
| `--st-bestanden` | `#2fbf71` | Status bestanden, Logo |
| `--st-fehlgeschlagen` | `#f0524f` | Status fehlgeschlagen, Hinweis |
| `--st-gesperrt` | `#5f6670` | Status gesperrt |
| `--font` | `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | Fließtext |
| `--mono` | `ui-monospace, 'SF Mono', Menlo, Consolas, monospace` | Zahlen, IDs, Zeiten |
| `--radius` | `8px` | Eckenradius |

Dazu `color-scheme: dark` auf `:root`.

## Basis
- `box-sizing: border-box` für alle Elemente.
- `html` und `body` haben `margin: 0`.
- `body`: Hintergrund `--bg`, Farbe `--text`, Schrift `--font`, 14 px, Zeilenhöhe 1.5, `-webkit-font-smoothing: antialiased`.
- `dl` und `dd` haben `margin: 0`.
- `:focus-visible`: `outline: 2px solid var(--accent); outline-offset: 2px`.

## Aufbau der Seite
```
<div class="app" data-testid="board" data-state="…">
  <header class="header"> … </header>
  <main class="main">
    [Hinweis]       – nur bei data-state missing/invalid/unavailable
    [Zusammenfassung]
    [Raster mit 10 Karten]
  </main>
</div>
```
`data-state` am Wurzelelement ist einer der Ladezustände `loading`, `ok`, `missing`, `invalid` oder `unavailable` (siehe `05-datenmodell.md`).

`main`: max. 1200 px breit, horizontal zentriert, Innenabstand 24 px, Spalten-Flexbox mit 24 px Abstand.

## Kopfzeile
- Höhe 56 px, Flexbox: vertikal zentriert, Inhalt an den Rändern (`space-between`), Abstand 16 px.
- Innenabstand 0 / 24 px, Hintergrund `--surface`, unten 1 px `--border`.
- **Links (Marke):** Flexbox mit 12 px Abstand.
  - Zeichen `▮▮▮` (`aria-hidden`) in `--st-bestanden`, 12 px, `letter-spacing: -2px`.
  - Daneben „Levelboard“, 16 px, Gewicht 600, `letter-spacing: 0.01em`.
- **Rechts:** eine `<dl>` mit vier Paaren, 24 px Abstand. Jedes Paar ist eine Flexbox mit Grundlinien-Ausrichtung und 8 px Abstand.
  - `<dt>` „Durchlauf“, „Version“, „Commit“ und „Quelle“ (in dieser Reihenfolge): 12 px, `--muted`.
  - `<dd>` mit `run.id`, `run.version`, dem Commit bzw. der Quelle: Schrift `--mono`, 13 px.
  - Commit (ab Spec 0.8.0): die ersten 7 Zeichen von `run.commit`, „–“ bei `null`. Das `<dd>` hat `data-testid="run-commit"` und den vollen Wert als `title` (bei `null` kein `title`).
  - Quelle (ab Spec 0.5.0): „Datei“ im Datei-Modus, „Backend“ im API-Modus, „–“ solange `config.json` noch nicht geladen ist. Das `<dd>` hat `data-testid="run-source"` und `data-source="file"`, `"api"` bzw. leer.

## Hinweis (nur bei `missing`, `invalid` und `unavailable`)
- `role="alert"`, Flexbox, vertikal zentriert, 12 px Abstand, Innenabstand 12 / 16 px.
- 1 px Rahmen `--st-fehlgeschlagen`, Radius 8, Hintergrund `rgba(240, 82, 79, 0.08)`.
- Links ein runder Kreis, 20 × 20 px, Hintergrund `--st-fehlgeschlagen`, darin „!“ in `--bg`, fett, 12 px, `aria-hidden`.
- Texte (wörtlich):
  - `missing`: „Keine Ergebnisse gefunden. Die Datei results.json fehlt.“
  - `invalid`: „Die Ergebnisdatei ist ungültig. Es werden keine Ergebnisse angezeigt.“ (auch im API-Modus)
  - `unavailable`: „Backend nicht erreichbar. Neuer Versuch alle 5 Sekunden.“

## Zusammenfassung
- `<section aria-label="Zusammenfassung">`.
- Flexbox, vertikal zentriert, 32 px Abstand, Innenabstand 24 px.
- Hintergrund `--surface`, 1 px `--border`, Radius 8.
- **Links:**
  - Beschriftung „Erreichtes Level“: 12 px, `--muted`, Großbuchstaben, `letter-spacing: 0.06em`.
  - Darunter der Wert, z. B. `2 / 10`: Schrift `--mono`, 40 px, Gewicht 600, Zeilenhöhe 1.1. Der Teil `/ 10` ist ein eigenes `<span>` in `--faint`, 24 px. Zwischen Zahl und `/` steht ein Leerzeichen.
- **Rechts** (füllt die Restbreite, Spalte mit 12 px Abstand):
  - **Fortschrittsbalken:** Raster mit 10 gleich breiten Spalten und 4 px Abstand, `role="img"`, `aria-label="<n> von 10 Levels erreicht"`.
    - Je Level ein Segment: 8 px hoch, Radius 2 px, Farbe = Statusfarbe des Levels, `title="Level <n>: <Statusanzeige>"`.
  - **Zeile** „Zuletzt aktualisiert: <Zeit>“: 13 px, `--muted`. Die Zeit steht in einem `<span>` mit `--mono` in `--text`. Ohne Wert steht „–“.

## Raster und Level-Karten
- Raster: 5 Spalten, 16 px Abstand. `<section aria-label="Levels">`.
- **Karte** (`<article>`):
  - Spalten-Flexbox, 12 px Abstand, Innenabstand 16 px.
  - Hintergrund `--surface`, 1 px `--border`, oben 3 px in der Statusfarbe, Radius 8.
  - Gesperrte Karten haben `opacity: 0.6`.
- **Kopf der Karte:** Flexbox, Inhalt an den Rändern, 8 px Abstand.
  - Links die Nummer `L01` … `L10` (zweistellig mit führender Null): `--mono`, 13 px, `--muted`.
  - Rechts das **Abzeichen:**
    - Inline-Flexbox, 6 px Abstand, Innenabstand 2 / 8 px, Radius 999 px.
    - Hintergrund `--surface-2`, 1 px `--border`, Text in der Statusfarbe, 12 px, Gewicht 500, kein Umbruch.
    - Vorne ein Punkt: 6 × 6 px, rund, in der Statusfarbe, `aria-hidden`.
    - Text: Offen / Bestanden / Fehlgeschlagen / Gesperrt.
- **Titel:** `<h2>`, Titel aus `01-produkt.md`, 15 px, Gewicht 600, Zeilenhöhe 1.3, ohne Außenabstand. Angezeigt wird immer der feste Titel, nicht `title` aus der Datei.
- **Fakten:** `<dl>` als Spalte mit 4 px Abstand, oben 12 px Innenabstand und 1 px `--border`. `margin-top: auto`, damit die Fakten unten bündig sind.
  - Jede Zeile ist eine Flexbox mit dem Inhalt an den Rändern.
  - `<dt>`: 11 px, `--muted`, Großbuchstaben, `letter-spacing: 0.06em`.
  - `<dd>`: `--mono`, 12 px, kein Umbruch.

  | Beschriftung (`dt`) | Wert (`dd`) |
  |---|---|
  | Geprüft | `checkedAt` im Format `TT.MM.JJJJ, HH:MM`, sonst „–“ |
  | Dauer | unter 1000 ms: `850 ms` (gerundet), sonst Sekunden mit einer Nachkommastelle und Komma: `2,3 s`; null: „–“ |
  | Checks | `<bestanden>/<alle>`, z. B. `4/5`; ohne Checks: „–“ |

## Responsiv
| Breite | Anpassung |
|---|---|
| ab 1200 px | 5 Spalten |
| 640–1199 px | Raster mit 2 Spalten |
| unter 640 px | Raster mit 1 Spalte und 12 px Abstand; `main` mit 16 px Innenabstand und 16 px Abstand; Kopfzeile mit 0 / 16 px Innenabstand und 16 px Abstand zwischen den Paaren; die `<dt>` der Kopfzeile ausgeblendet; die Paare „Commit“ und „Quelle“ ganz ausgeblendet (die `<dd>` bleiben im DOM); Zusammenfassung untereinander (Spalte, gestreckt) mit 16 px Abstand und 16 px Innenabstand |

Bei 375 px Breite darf es kein horizontales Scrollen geben.

## Verbindliche `data-testid`s
| testid | Element |
|---|---|
| `board` | Wurzelelement, mit `data-state` |
| `run-id` | `<dd>` mit der Durchlauf-ID |
| `run-version` | `<dd>` mit der Version |
| `run-commit` | `<dd>` mit dem kurzen Commit (ab Spec 0.8.0) |
| `run-source` | `<dd>` mit der Quelle, mit `data-source` (ab Level 5) |
| `notice` | Hinweis, mit `data-kind="missing"` bzw. `"invalid"` |
| `summary-reached` | Element mit dem Wert „<n> / 10“ (Textinhalt z. B. `2 / 10`) |
| `summary-progress` | Fortschrittsbalken |
| `summary-updated` | `<span>` mit der Zeit der letzten Aktualisierung |
| `level-card` | Karte, mit `data-level` (1–10) und `data-status` |
| `level-title` | Titel in der Karte |
| `level-status` | Abzeichen in der Karte |
| `level-checked-at` | Wert „Geprüft“ |
| `level-duration` | Wert „Dauer“ |
| `level-checks` | Wert „Checks“ |
