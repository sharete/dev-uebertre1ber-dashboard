const fs = require('fs');
const path = require('path');
const { DateTime } = require("luxon");

const api = require('./src/api');
const stats = require('./src/stats');
const renderer = require('./src/renderer');
const { normalizeMapName } = require('./src/map_utils');
const notifier = require('./src/notifier');

const PLAYERS_FILE = "players.txt";
const DATA_DIR = path.join(__dirname, "data");
const NOTIFICATION_STATE_FILE = path.join(DATA_DIR, "discord_state.json");
const TEMPLATE_FILE = "index.template.html";
const OUTPUT_FILE = "index.html";
const MAX_MATCHES = 30;

const RANGE_FILES = {
    daily: "elo-daily.json",
    weekly: "elo-weekly.json",
    monthly: "elo-monthly.json",
    yearly: "elo-yearly.json",
    latest: "elo-latest.json",
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function writeJson(file, data) {
    fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

function getPeriodStart(range) {
    const now = DateTime.now().setZone("Europe/Berlin");
    switch (range) {
        case "daily": return now.startOf("day");
        case "weekly": return now.startOf("week");
        case "monthly": return now.startOf("month");
        case "yearly": return now.startOf("year");
        default: return now;
    }
}

async function processPlayer(playerId) {
    try {
        const [profile, history, playerStats, eloHistoryData] = await Promise.all([
            api.getPlayer(playerId),
            api.getPlayerHistory(playerId, 30),
            api.getPlayerStats(playerId),
            api.getEloHistory(playerId)
        ]);

        if (!profile || !profile.player_id) {
            console.error(`❌ Profile not found for ${playerId}`);
            return null;
        }

        const elo = profile.games?.cs2?.faceit_elo || null;
        if (!elo) return null;

        // Fetch match stats for all matches in history
        const matchStatsMap = {};
        for (const item of history.items) {
        let ms = await api.getMatchStats(item.match_id);
            if (!ms) {
                // Fallback: Create placeholder so stats.js doesn't skip the match entirely (for Teammates logic)
                ms = { __mapName: "Unknown" };
                
                // Try to get map name from details if stats failed
                try {
                    const details = await api.getMatchDetails(item.match_id);
                    if (details && details.voting && details.voting.map && details.voting.map.pick && details.voting.map.pick.length > 0) {
                        ms.__mapName = normalizeMapName(details.voting.map.pick[0]);
                    }
                } catch (e) {
                    console.error(`Failed to fetch match details for fallback: ${item.match_id}`, e.message);
                }
            } else {
                // MS exists (it's the mapStats object from api.js)
                let mapName = ms.__mapName;
                
                if (!mapName || mapName === "Unknown") {
                     // Try fetching full match details if map is unknown
                     try {
                         const details = await api.getMatchDetails(item.match_id);
                         if (details && details.voting && details.voting.map && details.voting.map.pick && details.voting.map.pick.length > 0) {
                             mapName = details.voting.map.pick[0];
                         }
                     } catch (e) {}
                     ms.__mapName = mapName || "Unknown";
                }
                // Normalize it
                ms.__mapName = normalizeMapName(ms.__mapName);
            }
            matchStatsMap[item.match_id] = ms;
        }

        // Calculate stats (now includes streak, last5, mapPerformance)
        const calculatedStats = stats.calculatePlayerStats(playerId, history.items, matchStatsMap, eloHistoryData);

        const lastTs = history.items[0]?.finished_at;
        const lastMatch = lastTs ? DateTime.fromSeconds(lastTs).setZone("Europe/Berlin").toFormat("yyyy-MM-dd HH:mm") : "—";
        const lastMatchTs = lastTs || 0;
        const url = (profile.faceit_url || "").replace("{lang}", "de");

        return {
            playerId: profile.player_id,
            nickname: profile.nickname,
            avatar: profile.avatar || "",
            elo,
            level: profile.games?.cs2?.skill_level || 0,
            faceitUrl: url,
            winrate: playerStats.lifetime ? playerStats.lifetime["Win Rate %"] + "%" : "—",
            matches: playerStats.lifetime ? playerStats.lifetime["Matches"] : "—",
            lastMatch,
            lastMatchTs,
            latestMatchId: history.items[0]?.match_id || null,
            latestMatchResult: calculatedStats.last5[0] || null,
            stats: calculatedStats
        };

    } catch (e) {
        console.error(`❌ Error processing ${playerId}:`, e);
        return null;
    }
}

function calculateAwards(results) {
    if (results.length === 0) return {};

    let bestKD = { name: "—", value: "0.00" };
    let bestHS = { name: "—", value: "0%" };
    let bestADR = { name: "—", value: "0.0" };
    let bestWinrate = { name: "—", value: 0 };
    let longestStreak = { name: "—", value: 0, type: "win" };
    let lowestDeaths = { name: "—", value: Infinity };

    for (const p of results) {
        const r = p.stats.recent;

        if (parseFloat(r.kd) > parseFloat(bestKD.value)) {
            bestKD = { name: p.nickname, value: r.kd, avatar: p.avatar };
        }
        if (parseInt(r.hsPercent) > parseInt(bestHS.value)) {
            bestHS = { name: p.nickname, value: r.hsPercent, avatar: p.avatar };
        }
        if (parseFloat(r.adr) > parseFloat(bestADR.value)) {
            bestADR = { name: p.nickname, value: r.adr, avatar: p.avatar };
        }
        if (r.winratePct > bestWinrate.value && r.matches > 0) {
            bestWinrate = { name: p.nickname, value: r.winratePct, avatar: p.avatar };
        }
        if (r.deaths < lowestDeaths.value && r.matches > 0) {
            lowestDeaths = { name: p.nickname, value: r.deaths, avatar: p.avatar };
        }
        if (p.stats.streak.type === "win" && p.stats.streak.count > longestStreak.value) {
            longestStreak = { name: p.nickname, value: p.stats.streak.count, type: "win", avatar: p.avatar };
        }
    }

    return {
        bestKD,
        bestHS,
        bestADR,
        bestWinrate,
        longestStreak,
        lowestDeaths
    };
}

(async () => {
    console.log("🚀 Starting Faceit Dashboard Update...");

    await api.init();

    // Load notification state
    let notificationState = { lastRunTs: 0, players: {} };
    let isMigration = false;
    let isBrandNew = true;

    if (fs.existsSync(NOTIFICATION_STATE_FILE)) {
        isBrandNew = false;
        try {
            const data = JSON.parse(fs.readFileSync(NOTIFICATION_STATE_FILE, "utf-8"));
            if (data.players) {
                notificationState = data;
            } else {
                // Migration from old format (only players map)
                notificationState = { lastRunTs: 0, players: data };
                isMigration = true;
            }
        } catch (e) {
            console.error("⚠️ Failed to load notification state:", e.message);
        }
    }

    const runStartTimeTs = Math.floor(Date.now() / 1000);
    let comparisonTs = notificationState.lastRunTs;

    if (isBrandNew) {
        console.log("ℹ️ Brand new installation. Initial seeding will occur after processing.");
        comparisonTs = runStartTimeTs; 
    } else if (isMigration || comparisonTs === 0) {
        console.log("ℹ️ Migrating to time-based tracking. Using 24h fallback for this run.");
        // Allow matches from the last 24h during migration transition
        comparisonTs = runStartTimeTs - 24 * 3600;
    }

    const lines = fs.readFileSync(PLAYERS_FILE, "utf-8")
        .trim()
        .split("\n")
        .map(l => l.split(/#|\/\//)[0].trim())
        .filter(Boolean);

    console.log(`ℹ️ Processing ${lines.length} players...`);

    const results = [];
    for (let i = 0; i < lines.length; i++) {
        const id = lines[i];
        console.log(`  ⏳ Processing ${i + 1}/${lines.length}: ${id.substring(0, 8)}...`);
        const p = await processPlayer(id);
        if (p) {
            results.push(p);

            // Discord Notification Logic
            const lastSavedMatchId = notificationState.players[p.playerId];
            if (p.latestMatchId && p.latestMatchId !== lastSavedMatchId) {
                // New match ID detected
                
                // Fetch details for the notification
                const latestMatchStats = p.stats.matchHistory[0]; // newest is first
                
                if (latestMatchStats) {
                    const matchTs = latestMatchStats.date;
                    const isNew = matchTs > comparisonTs;

                    if (isNew) {
                        console.log(`🔔 Sending notification for ${p.nickname}: ${p.latestMatchId}`);
                        
                        // Calculate Elo Diff
                        let eloDiff = undefined;
                        const eloHist = p.stats.eloHistory; // oldest first
                        if (eloHist.length >= 2) {
                            eloDiff = eloHist[eloHist.length - 1].elo - eloHist[eloHist.length - 2].elo;
                        }

                        // Detect Dashboard Teammates in this specific match
                        const matchDetails = await api.getMatchDetails(p.latestMatchId);
                        const dashboardTeammates = [];
                        if (matchDetails && matchDetails.teams) {
                            const allPlayersInMatch = Object.values(matchDetails.teams).flatMap(t => t.roster);
                            for (const pm of allPlayersInMatch) {
                                if (pm.nickname === p.nickname) continue;
                                // Check if this player is in our players list
                                if (lines.includes(pm.player_id)) {
                                    dashboardTeammates.push(pm.nickname);
                                }
                            }
                        }

                        await notifier.sendMatchNotification(p, {
                            ...latestMatchStats,
                            eloDiff,
                            teammates: dashboardTeammates
                        });
                    } else {
                        console.log(`ℹ️ Match for ${p.nickname} is before last run. Skipping notification.`);
                    }
                }
                
                // Update player specific match ID to prevent double posts if multiple runs happen quickly
                notificationState.players[p.playerId] = p.latestMatchId;
            }
        }
    }

    results.sort((a, b) => b.elo - a.elo);

    const latest = results.map(r => ({ playerId: r.playerId, elo: r.elo }));
    writeJson(RANGE_FILES.latest, latest);

    const updatedTime = DateTime.now().setZone("Europe/Berlin").toFormat("yyyy-MM-dd HH:mm");
    const now = DateTime.now().setZone("Europe/Berlin");

    const findEloAt = (player, dateThreshold) => {
        if (!player.stats.eloHistory || player.stats.eloHistory.length === 0) return player.elo;
        const history = player.stats.eloHistory;
        const thresholdTs = dateThreshold.toSeconds();
        for (let i = history.length - 1; i >= 0; i--) {
            if (history[i].date <= thresholdTs) {
                return history[i].elo;
            }
        }
        if (history.length > 0) return history[0].elo;
        return player.elo;
    };

    const snapshotData = {};

    for (const range of ["daily", "weekly", "monthly", "yearly"]) {
        const metaPath = path.join(DATA_DIR, `elo-${range}-meta.json`);
        let needsUpdate = true;
        let dataForRange = [];

        if (fs.existsSync(path.join(DATA_DIR, RANGE_FILES[range]))) {
            try {
                dataForRange = JSON.parse(fs.readFileSync(path.join(DATA_DIR, RANGE_FILES[range]), "utf-8"));
            } catch { }
        }

        if (fs.existsSync(metaPath)) {
            try {
                const m = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
                const start = getPeriodStart(range);
                if (DateTime.fromISO(m.lastUpdated, { zone: "Europe/Berlin" }) >= start) {
                    needsUpdate = false;
                }
            } catch { }
        } else {
            console.log(`ℹ️ First run for ${range}. Backfilling from history...`);
            let threshold;
            if (range === "daily") threshold = now.startOf("day");
            if (range === "weekly") threshold = now.startOf("week");
            if (range === "monthly") threshold = now.startOf("month");
            if (range === "yearly") threshold = now.startOf("year");

            const backfilledData = results.map(p => {
                const history = p.stats.eloHistory;
                if (history && history.length > 0) {
                    const lastMatchDate = history[history.length - 1].date;
                    if (lastMatchDate < threshold.toSeconds()) {
                        return { playerId: p.playerId, elo: p.elo };
                    }
                }
                return {
                    playerId: p.playerId,
                    elo: findEloAt(p, threshold)
                };
            });

            writeJson(RANGE_FILES[range], backfilledData);
            fs.writeFileSync(metaPath, JSON.stringify({ lastUpdated: threshold.toISODate() }, null, 2));
            needsUpdate = false;
        }
        if (needsUpdate) {
            dataForRange = latest;
            writeJson(RANGE_FILES[range], latest);
            const start = getPeriodStart(range);
            fs.writeFileSync(metaPath, JSON.stringify({ lastUpdated: start.toISODate() }, null, 2));
            console.log(`✅ ${RANGE_FILES[range]} updated.`);
        }

        // Repair & backfill: ensure all players have correct snapshot values
        const snapshotMap = new Map(dataForRange.map(d => [d.playerId, d]));
        const threshold = getPeriodStart(range);
        const thresholdTs = threshold.toSeconds();
        let changed = false;

        for (const p of results) {
            const playedInPeriod = p.lastMatchTs && p.lastMatchTs >= thresholdTs;
            const correctElo = playedInPeriod ? findEloAt(p, threshold) : p.elo;

            const existing = snapshotMap.get(p.playerId);
            if (!existing) {
                // New player — add to snapshot
                dataForRange.push({ playerId: p.playerId, elo: correctElo });
                changed = true;
            } else if (!playedInPeriod && existing.elo !== p.elo) {
                // Inactive player with stale value — fix to current ELO (GAIN = 0)
                existing.elo = p.elo;
                changed = true;
            }
        }
        if (changed) {
            writeJson(RANGE_FILES[range], dataForRange);
        }

        snapshotData[range] = dataForRange;
    }

    // Calculate awards
    const awards = calculateAwards(results);

    // Render HTML with all data
    renderer.render(TEMPLATE_FILE, OUTPUT_FILE, {
        players: results,
        lastUpdated: updatedTime,
        historyData: snapshotData,
        awards
    });

    // Update lastRunTs to the time we started processing
    notificationState.lastRunTs = runStartTimeTs;

    // Save notification state
    fs.writeFileSync(NOTIFICATION_STATE_FILE, JSON.stringify(notificationState, null, 2));

    console.log("✨ Done!");
})();
