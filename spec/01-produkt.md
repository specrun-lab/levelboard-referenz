# 01 – Produkt

## Zweck
Das Levelboard ist eine einseitige Web-App im Stil eines technischen Monitoring-Dashboards. Sie zeigt:
- den Status von 10 Levels,
- wie weit der aktuelle Durchlauf gekommen ist („Erreichtes Level“),
- wann zuletzt geprüft wurde.

Die Daten stammen aus der Prüfsuite des Projekts selbst. Das Levelboard misst sich also selbst.

## Die 10 Levels (Titel sind fest und wörtlich)
| Nr. | Titel |
|---|---|
| 1 | Statische Seite |
| 2 | Webserver |
| 3 | REST-Backend |
| 4 | Datenbank |
| 5 | Frontend + Backend |
| 6 | Repo + CI |
| 7 | Images in der Pipeline |
| 8 | Deployment |
| 9 | Live-Prüfung |
| 10 | Metriken veröffentlicht |

Die Seite zeigt immer alle 10 Levels, auch wenn erst ein Teil davon gebaut ist.

## Status eines Levels
| Wert | Anzeige | Bedeutung |
|---|---|---|
| `offen` | Offen | noch nicht geprüft |
| `bestanden` | Bestanden | alle Checks des Levels sind bestanden |
| `fehlgeschlagen` | Fehlgeschlagen | mindestens ein Check ist nicht bestanden |
| `gesperrt` | Gesperrt | ein früheres Level ist fehlgeschlagen; dieses Level wird nicht mehr geprüft |

**Erreichtes Level** = das höchste Level n, für das die Levels 1 bis n alle `bestanden` sind. Ist Level 1 nicht bestanden, ist es 0.

## Sprache
Die Oberfläche ist Deutsch. Datum und Uhrzeit werden im Format `TT.MM.JJJJ, HH:MM` in lokaler Zeit angezeigt (z. B. `21.11.2026, 10:14`).
