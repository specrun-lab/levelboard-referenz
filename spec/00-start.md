# 00 – Start

**Spec-Version:** 1.2.0 (umfasst Level 1–10)

Du baust das **Levelboard**: eine Web-App, die zeigt, wie weit ein Coding-Agent auf einem Pfad aus 10 Levels gekommen ist, und die sich dabei selbst misst. Du bist dieser Agent.

## Arbeitsauftrag
1. Lies **alle** Dateien in diesem Ordner, in dieser Reihenfolge:
   1. `00-start.md` (diese Datei)
   2. `01-produkt.md` – was das Levelboard ist
   3. `02-startausruestung.md` – welche Werkzeuge vorhanden sind
   4. `03-architektur.md` – Projektstruktur, Befehle, Ports
   5. `04-api.md` und `openapi.yaml` – REST-API (ab Level 3)
   6. `05-datenmodell.md` und `results.schema.json` – Datenformat
   7. `06-design.md` – Aussehen, Texte, `data-testid`s
   8. `levels/` – eine Datei pro Level, in aufsteigender Reihenfolge
2. Baue **alle Levels, für die es eine Datei in `levels/` gibt**, eines nach dem anderen.
3. Prüfe jedes Level mit deiner eigenen Prüfsuite (`make check`), bevor du zum nächsten gehst.
4. Lass am Ende die Seite des **höchsten** gebauten Levels laufen (z. B. `make level10`) und führe danach einmal `make check` aus.

## Regeln
- **Keine Rückfragen.** Ist etwas nicht festgelegt, triff die einfachste, naheliegendste Entscheidung und arbeite weiter.
- Lege das Projekt **im aktuellen Arbeitsverzeichnis** an, also im Ordner, der diesen `spec/`-Ordner enthält. `spec/` selbst änderst du nicht.
- Nutze **genau** die in der Spec genannten Versionen, Pfade, Ports, Befehle, Texte und `data-testid`s. Sie werden automatisch geprüft.
- Füge **keine** Abhängigkeiten hinzu, die nicht in der Spec stehen.
- Schreibe niemals Zugangsdaten oder Secrets in Dateien oder Logs.
- Die Prüfsuite muss **ehrlich** messen: Ein Check, der nicht bestanden ist, darf nicht als bestanden gemeldet werden.

## Wie bewertet wird
Ein unabhängiger Prüfer, den du nicht siehst, kontrolliert nach deinem Lauf jedes Level selbst. Er nutzt dafür ausschließlich die festen Befehle aus `03-architektur.md` und die `data-testid`s aus `06-design.md`. Er prüft auch, ob deine Selbstmessung stimmt.
