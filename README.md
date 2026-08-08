# Uebertr1eber FACEIT Team Intelligence

Ein automatisch aktualisiertes Performance-Dashboard für die Uebertr1eber-Crew. Es verdichtet FACEIT-Daten zu einem klaren Ranking, aktuellen Formwerten, ELO-Trends und Team-Insights.

## Funktionen

- Live-Ranking mit Tages-, Wochen-, Monats- und Jahresvergleich
- Crew-Pulse mit Durchschnitts-ELO, Aktivität, Form und Top-Mover
- Suche und Sortierung nach Spieler, ELO, Trend, Form, Winrate, K/D, ADR und Konstanz
- Dynamische Rollenprofile aus Entry-, Clutch-, Utility-, Aim- und Damage-Daten
- Detailanalyse der letzten 30, 60 oder 100 Matches
- K/D, ADR, Headshot-Quote, K/R, Form, Streaks und Konstanz
- Entry-Erfolg, Clutches, Multikills und Utility-Schaden
- Map-Performance sowie beste und häufigste Mitspieler
- Direkter ELO-Verlauf-Vergleich für bis zu fünf Spieler
- Responsive Bedienung für Desktop, Tablet und Smartphone
- Barrierearme Tastaturbedienung und robuste Avatar-Fallbacks

## Lokale Entwicklung

Voraussetzungen: Node.js 20 oder neuer.

```bash
npm ci
npm run build:css
npm test
```

Für eine Aktualisierung mit Live-Daten:

```bash
FACEIT_API_KEY=dein_key npm start
```

Unter Windows PowerShell:

```powershell
$env:FACEIT_API_KEY = "dein_key"
npm start
```

## Spielerverwaltung

```bash
# Spieler hinzufügen
FACEIT_API_KEY=xxx node manage-players.js add noxq

# Spieler entfernen
node manage-players.js remove noxq

# Alle Spieler anzeigen
node manage-players.js list
```

## Projektstruktur

```text
.
├── dashboard.css           # Produktspezifisches Designsystem
├── dashboard.js            # Suche, Sortierung, Details und Charts
├── index.template.html     # HTML-Template
├── index.html              # Generierte, veröffentlichte Website
├── index.js                # FACEIT-Datenpipeline
├── src/                    # API, Statistik und Rendering
├── data/                   # ELO-Snapshots und Match-Cache
├── icons/                  # FACEIT-Level-Assets
└── tests/                  # Smoke- und Security-Tests
```

## Automatische Aktualisierung

Der Workflow `FACEIT ELO Auto Update` läuft alle 30 Minuten:

1. Repository und Node.js vorbereiten
2. FACEIT-Daten abrufen und Statistiken berechnen
3. Website aus dem Template generieren
4. Smoke- und Security-Tests ausführen
5. Nur tatsächliche Änderungen committen und pushen

Der API-Key wird ausschließlich als GitHub-Secret `FACEIT_API_KEY` verwendet. Optionale Match-Benachrichtigungen nutzen `DISCORD_WEBHOOK_URL`.
