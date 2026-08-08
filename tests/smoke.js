const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const renderer = require("../src/renderer");
const stats = require("../src/stats");

const root = path.resolve(__dirname, "..");
const template = fs.readFileSync(path.join(root, "index.template.html"), "utf8");
const generated = fs.readFileSync(path.join(root, "index.html"), "utf8");
const dashboardScript = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const dashboardCss = fs.readFileSync(path.join(root, "dashboard.css"), "utf8");
const updaterScript = fs.readFileSync(path.join(root, "index.js"), "utf8");
const apiScript = fs.readFileSync(path.join(root, "src", "api.js"), "utf8");

for (const marker of [
  "INSERT_ELO_TABLE_HERE",
  "INSERT_LAST_UPDATED",
  "INSERT_PLAYER_COUNT",
  "INSERT_AWARDS_SECTION",
  "INSERT_HISTORY_DATA",
  "INSERT_COMPARISON_DATA",
  "INSERT_ASSET_VERSION"
]) {
  assert.match(template, new RegExp(marker), `Template marker ${marker} is missing`);
  assert.doesNotMatch(generated, new RegExp(marker), `Generated page still contains ${marker}`);
}

assert.match(generated, /id="playerTableBody"/);
assert.match(generated, /class="player-row/);
assert.match(generated, /src="dashboard\.js(?:\?v=[^"]+)?"/);
assert.match(generated, /src="vendor\/chart\.min\.js"/);
assert.doesNotMatch(generated, /cdn\.jsdelivr\.net\/npm\/chart\.js/);
assert.match(generated, /href="dashboard\.css(?:\?v=[^"]+)?"/);
assert.doesNotMatch(generated, /Crew Ranking/);
assert.match(generated, />Baiter</);
assert.match(generated, /class="award-icon"/);
assert.doesNotMatch(generated, /class="award-icon"[^>]*>\?+/);
assert.match(generated, /Last Update:/);
assert.match(generated, /Dashboard by <a [^>]*>sha<\/a>/);
assert.match(generated, /id="formSort"/);
assert.match(generated, /id="global-insights"/);
assert.match(generated, /class="shell squad-pulse"/);
assert.match(generated, /id="squad-active-count"/);
assert.match(generated, /data-card-stat="consistency"/);
assert.match(generated, /data-card-role/);
assert.match(generated, /id="comparison-metrics"/);
assert.doesNotMatch(template, /id="synergy-grid"|Team-Synergien/);
assert.equal(fs.statSync(path.join(root, "vendor", "chart.min.js")).size > 100000, true);
assert.match(dashboardScript, /toMatchSeries/);
assert.match(dashboardScript, /cubicInterpolationMode: "monotone"/);
assert.match(dashboardScript, /matchAgeHours <= 7 \* 24/);
assert.match(dashboardScript, /matchAgeHours <= 30 \* 24/);
assert.match(dashboardCss, /\.data-status\.status-aging/);
assert.match(dashboardCss, /\.data-status\.status-stale/);
assert.match(dashboardScript, /max: state\.analysisPeriod/);
assert.match(dashboardScript, /periodData/);
assert.match(dashboardScript, /updatePlayerPeriod/);
assert.match(dashboardScript, /renderPeriodAwards/);
assert.match(template, /data-analysis-period="30"/);
assert.match(template, /data-analysis-period="60"/);
assert.match(template, /data-analysis-period="100"/);
assert.match(template, /id="playerDeepDive"/);
assert.match(template, /data-deep-tab="matches"/);
assert.match(template, /data-deep-tab="maps"/);
assert.match(template, /data-deep-tab="teammates"/);
assert.match(template, /data-deep-tab="highlights"/);
assert.match(dashboardCss, /\.analysis-period-control/);
assert.match(dashboardCss, /\.ranking-card/);
assert.match(dashboardCss, /\.deep-dive-panel/);
assert.match(updaterScript, /ANALYSIS_PERIODS = \[30, 60, 100\]/);
assert.match(updaterScript, /periodStats/);
assert.match(apiScript, /Math\.min\(100/);
assert.match(apiScript, /from=0&limit=/);
assert.match(dashboardScript, /matchTooltipCallbacks/);
assert.match(dashboardScript, /Klicken, um das FACEIT-Match zu öffnen/);
assert.match(dashboardScript, /renderComparisonMetrics/);
assert.match(dashboardScript, /squad-positive-form/);
assert.match(dashboardScript, /performanceProfile/);
assert.doesNotMatch(dashboardScript, /renderSynergies|synergy-grid/);
assert.match(dashboardScript, /loadPlayerDetail/);
assert.match(dashboardScript, /renderDeepMatches/);
assert.match(dashboardScript, /renderDeepMaps/);
assert.doesNotMatch(dashboardScript, /navigator\.share|navigator\.clipboard|data-share-player/);
assert.doesNotMatch(dashboardScript, /state\.selectedPlayers\.add\(player\.id\)/);
assert.doesNotMatch(dashboardScript, /if \(index < 3\)/);
assert.match(dashboardScript, /Wähle mindestens einen Spieler für den ELO-Vergleich aus/);
assert.match(template, /ELO-Verlauf vergleichen/);
assert.doesNotMatch(template, /dashboard-toast/);
assert.match(dashboardScript, /upgradeInterfaceIcons/);
assert.match(dashboardScript, /formWins/);
assert.match(dashboardCss, /\.chart-fallback\[hidden\]/);
assert.match(dashboardCss, /\.deep-chart-empty\[hidden\]/);
assert.doesNotMatch(dashboardCss, /backdrop-filter:/);
assert.match(dashboardScript, /animation: false/);
assert.match(dashboardScript, /data-teammate-page/);
assert.match(dashboardScript, /insight\.type !== "map"/);
assert.match(template, /dashboard\.js\?v=<!-- INSERT_ASSET_VERSION -->/);
assert.match(template, /dashboard\.css\?v=<!-- INSERT_ASSET_VERSION -->/);
assert.match(dashboardScript, /flagcdn\.com/);
assert.doesNotMatch(dashboardCss, /\.synergy-(?:panel|grid|card|head)/);
assert.ok(dashboardScript.lastIndexOf("createComparisonChips();") < dashboardScript.lastIndexOf("setupRows();"));
assert.match(dashboardCss, /\.sort-control select option/);

const awardHtml = renderer.renderAwards({
  bestKD: { name: "One", value: "1.20" },
  bestHS: { name: "Two", value: "60" },
  bestADR: { name: "Three", value: "90" },
  bestWinrate: { name: "Four", value: "70" },
  longestStreak: { name: "Five", value: 5 },
  lowestDeaths: { name: "Six", value: 300 }
});
assert.match(awardHtml, /class="award-svg"/);
assert.match(awardHtml, /award-orange/);
assert.match(awardHtml, />Baiter</);
assert.doesNotMatch(awardHtml, />Survivor</);
assert.doesNotMatch(awardHtml, /\?\?/);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dashboard-render-"));
const templatePath = path.join(tempDir, "template.html");
const outputPath = path.join(tempDir, "output.html");
fs.writeFileSync(
  templatePath,
  "<!-- INSERT_ELO_TABLE_HERE --><!-- INSERT_LAST_UPDATED --><!-- INSERT_PLAYER_COUNT --><!-- INSERT_AWARDS_SECTION --><!-- INSERT_HISTORY_DATA --><!-- INSERT_COMPARISON_DATA --><!-- INSERT_ASSET_VERSION -->"
);

const maliciousName = '<script>alert("xss")</script>';
renderer.render(templatePath, outputPath, {
  players: [{
    playerId: "player-1",
    nickname: maliciousName,
    avatar: "javascript:alert(1)",
    country: "de",
    elo: 1500,
    level: 5,
    faceitUrl: "javascript:alert(1)",
    winrate: "50%",
    matches: 10,
    lastMatch: "2026-01-01 12:00",
    lastMatchTs: 1767265200,
    stats: {
      recent: { kd: "1.00", kr: "0.70", kills: 100, deaths: 100, assists: 20, adr: "75.0", hsPercent: "50%", matches: 10 },
      teammates: [],
      streak: { count: 0, type: "none" },
      last5: ["W", "L", "W", "W", "L"],
      mapPerformance: [],
      eloHistory: []
    }
  }],
  lastUpdated: "2026-01-01 12:00",
  historyData: { daily: [] },
  awards: {}
});

const rendered = fs.readFileSync(outputPath, "utf8");
assert.doesNotMatch(rendered, /javascript:alert/);
assert.doesNotMatch(rendered, /<script>alert/);
assert.match(rendered, /&lt;script&gt;/);
assert.match(rendered, /data-form="60"/);
assert.match(rendered, />3\/5</);
assert.match(rendered, /class="ranking-card"/);
assert.match(rendered, /flagcdn\.com\/24x18\/de\.png/);
assert.doesNotMatch(rendered, />DE<\/span>/);
assert.match(rendered, /data-card-stat="form"/);
assert.match(rendered, /"periods":\{"30":/);
assert.doesNotMatch(rendered, /"matchHistory":/);
assert.doesNotMatch(rendered, /Ansicht teilen|data-share-player/);
assert.doesNotMatch(rendered, /INSERT_ASSET_VERSION/);
const playerDetailPath = path.join(tempDir, "data", "players", "player-1.json");
assert.equal(fs.existsSync(playerDetailPath), true);
const playerDetail = JSON.parse(fs.readFileSync(playerDetailPath, "utf8"));
assert.equal(playerDetail.profile.id, "player-1");
assert.ok(Array.isArray(playerDetail.matches));
assert.ok(playerDetail.periods["100"]);
assert.ok(playerDetail.periods["100"].performanceProfile);
fs.rmSync(tempDir, { recursive: true, force: true });

const normalizedStats = stats.calculatePlayerStats("player-1", [], {}, [
  { date: 1767265200000, i20: "1480" },
  { date: 1767268800, elo: "1500", elo_delta: "20" },
  { created_at: 1767261600, elo: "1450" },
  { date: "invalid", elo: "9999" }
]);
assert.deepEqual(
  normalizedStats.eloHistory,
  [
    { date: 1767261600, elo: 1450, eloDiff: undefined },
    { date: 1767265200, elo: 1480, eloDiff: undefined },
    { date: 1767268800, elo: 1500, eloDiff: 20 }
  ],
  "ELO history should accept both FACEIT history formats and remain chronological"
);

const analyzedStats = stats.calculatePlayerStats(
  "player-1",
  [
    {
      match_id: "1-match-a",
      finished_at: 1767268800,
      results: { winner: "faction1" },
      teams: { faction1: { players: [{ player_id: "player-1", nickname: "One" }, { player_id: "player-2", nickname: "Two" }] } }
    },
    {
      match_id: "1-match-b",
      finished_at: 1767265200,
      results: { winner: "faction1" },
      teams: { faction1: { players: [{ player_id: "player-1", nickname: "One" }, { player_id: "player-2", nickname: "Two", avatar: "https://example.com/two.jpg" }] } }
    }
  ],
  {
    "1-match-a": { __mapName: "Mirage", __score: "13 - 8", "player-1": { Kills: 20, Deaths: 10, Assists: 5, ADR: 92, Headshots: 10, __rounds: 21, "Entry Wins": 3, "Entry Count": 4, "Clutch Kills": 1, "Double Kills": 2, "Triple Kills": 1, "Utility Damage": 84 } },
    "1-match-b": { __mapName: "Mirage", __score: "13 - 10", "player-1": { Kills: 18, Deaths: 12, Assists: 4, ADR: 84, Headshots: 8, __rounds: 23, "Entry Wins": 2, "Entry Count": 4, "Clutch Kills": 0, "Double Kills": 1, "Utility Damage": 40 } }
  },
  [
    { date: 1767265200, elo: 1500, elo_delta: 25, matchId: "1-match-b", i1: "de_mirage", i10: "1", i18: "13 - 10" },
    { date: 1767268800, elo: 1525, elo_delta: 25, matchId: "1-match-a", i1: "de_mirage", i10: "1", i18: "13 - 8" }
  ]
);
assert.equal(analyzedStats.matchHistory[0].matchUrl, "https://www.faceit.com/de/cs2/room/1-match-a");
assert.equal(analyzedStats.personalBests.peakElo, 1525);
assert.equal(analyzedStats.personalBests.longestWinStreak, 2);
assert.equal(analyzedStats.personalBests.bestMap.map, "Mirage");
assert.equal(analyzedStats.dataQuality.matchCoverage, 100);
assert.equal(analyzedStats.dataQuality.requestedMatches, 2);
assert.equal(analyzedStats.recent.entrySuccess, 63);
assert.equal(analyzedStats.recent.clutches, 1);
assert.equal(analyzedStats.matchHistory[0].tripleKills, 1);
assert.equal(analyzedStats.mapPerformance[0].adr, "88.0");
assert.equal(analyzedStats.mapPerformance[0].entrySuccess, 63);
assert.equal(analyzedStats.teammates[0].avatar, "https://example.com/two.jpg");
assert.equal(typeof analyzedStats.performanceProfile.consistency, "number");
assert.equal(analyzedStats.performanceProfile.role.label, "Opener");
assert.equal(
  stats.calculatePlayerStats("player-1", [], {}, [], 60).dataQuality.requestedMatches,
  60
);
assert.ok(Array.isArray(analyzedStats.insights));

const freshnessNow = 2_000_000_000;
assert.equal(stats.getDataFreshness(freshnessNow - 168 * 3600, freshnessNow).status, "fresh");
assert.equal(stats.getDataFreshness(freshnessNow - (168 * 3600 + 1), freshnessNow).status, "aging");
assert.equal(stats.getDataFreshness(freshnessNow - 720 * 3600, freshnessNow).status, "aging");
assert.equal(stats.getDataFreshness(freshnessNow - (720 * 3600 + 1), freshnessNow).status, "stale");
assert.equal(stats.getDataFreshness(0, freshnessNow).status, "stale");
assert.equal(stats.getDataFreshness(freshnessNow - 169 * 3600, freshnessNow).label, "Match älter als 1 Woche");

const twentyNineEloPoints = Array.from({ length: 29 }, (_, index) => ({ date: 1_700_000_000 + index, elo: 1000 + index * 5 }));
const thirtyEloPoints = [...twentyNineEloPoints, { date: 1_700_000_029, elo: 1145 }];
assert.equal(stats.calculatePlayerStats("player-1", [], {}, twentyNineEloPoints).personalBests.bestThirtyGain, 0);
assert.equal(stats.calculatePlayerStats("player-1", [], {}, thirtyEloPoints).personalBests.bestThirtyGain, 145);

console.log("Dashboard smoke tests passed.");
