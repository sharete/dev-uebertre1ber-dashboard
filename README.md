# 🎯 uebertre1ber FACEIT ELO Dashboard

Ein automatisiertes FACEIT-Dashboard, das Statistiken wie ELO-Entwicklung, Match-Performance und Spieleranalysen übersichtlich darstellt. Ideal für Spielergruppen, Teams oder Streamer, die ihre Leistung langfristig verfolgen möchten.

## 🚀 Features

- 📊 **Live ELO-Tracking** (alle 30 Minuten via GitHub Actions)
- 🧠 **Statistik-Auswertung** der letzten 30 Matches:
  - Wins/Losses, Winrate
  - K/D, ADR, HS%, K/R
  - ELO +/- pro Spiel
- 🗓️ **ELO-Verlauf** als Sparkline (täglich, wöchentlich, monatlich, jährlich)
- 📈 **ELO-Vergleichschart** – Spieler direkt vergleichen (letzte 30 Matches)
- 📁 **Map-Analyse** mit Winrate und K/D pro Map + Radar-Chart
- 👥 **Mitspieler-Analyse** – häufigste, beste und schlechteste Duos
- 🏆 **Awards** – Best K/D, Headshot King, Best ADR, Winrate, Streak, Survivor
- 🔍 **Such- und Sortier-Funktionen** für alle Spalten
- 🧩 Modernes UI mit **Tailwind CSS**, **Glassmorphism** und **Chart.js**
- 📱 **Responsive Design** – optimiert für Desktop und Mobile

## 🛠️ Technologie-Stack

- 📦 `Node.js 20+` zur Datenabfrage via [FACEIT API](https://developers.faceit.com/)
- 🧪 Datenanalyse mit JavaScript (Matchauswertung & ELO-Snapshots)
- 🎨 Frontend: HTML + Tailwind CSS (CDN) + Chart.js (CDN)
- 🔁 Automatisches Deployment mit GitHub Actions + GitHub Pages

## 📄 Projektstruktur

```
.
├── .github/workflows/     # GitHub Actions (Auto-Update + Spielerverwaltung)
├── data/                  # ELO Snapshots (daily, weekly, monthly, yearly)
├── icons/                 # Level-Icons und Logo
├── src/
│   ├── api.js             # FACEIT API Client mit Retry & Cache
│   ├── cache.js           # Match-Statistik Cache (90 Tage)
│   ├── map_utils.js       # Map-Name Normalisierung
│   ├── renderer.js        # HTML Template Renderer
│   └── stats.js           # Spielerstatistik-Berechnung
├── index.js               # Main Script – orchestriert Datenabfrage + HTML-Generierung
├── index.template.html    # HTML-Template mit Platzhaltern
├── manage-players.js      # CLI zur Spielerverwaltung (add/remove/list)
├── players.txt            # Spieler-IDs + Nicknames
└── package.json
```

## ⚙️ Einrichtung (lokal)

```bash
git clone https://github.com/sharete/dev-uebertre1ber-dashboard.git
cd dev-uebertre1ber-dashboard
npm install
FACEIT_API_KEY=dein_key node index.js
```

## 🎮 Spielerverwaltung

```bash
# Spieler hinzufügen
FACEIT_API_KEY=xxx node manage-players.js add noxq

# Spieler entfernen
node manage-players.js remove noxq

# Alle Spieler anzeigen
node manage-players.js list

# Nicknames mit FACEIT abgleichen
FACEIT_API_KEY=xxx node manage-players.js list --sync
```

## ⏰ Automatisierte Aktualisierung

Das Dashboard aktualisiert sich automatisch alle 30 Minuten über GitHub Actions:

1. Daten über die FACEIT API abrufen
2. Statistiken berechnen und ELO-Snapshots erstellen
3. `index.html` neu generieren und auf GitHub Pages veröffentlichen

## 📜 Lizenz

MIT – feel free to fork, verbessern oder deinen eigenen Style hinzufügen!

---

> Maintained with ❤️ by [Sharam / sharete](https://github.com/sharete)
