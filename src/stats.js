const { DateTime } = require("luxon");

const FRESH_HOURS = 7 * 24;
const AGING_HOURS = 30 * 24;

class StatsCalculator {
    /**
     * Classifies the age of a player's latest match.
     * Green: up to 7 days, yellow: over 7 and up to 30 days, red: over 30 days.
     */
    getDataFreshness(latestTimestamp, nowSeconds = Date.now() / 1000) {
        if (!Number(latestTimestamp)) {
            return { status: "stale", label: "Keine Matchdaten", ageHours: Infinity };
        }

        const ageHours = Math.max(0, (nowSeconds - Number(latestTimestamp)) / 3600);
        if (ageHours <= FRESH_HOURS) {
            return { status: "fresh", label: "Match innerhalb 1 Woche", ageHours };
        }
        if (ageHours <= AGING_HOURS) {
            return { status: "aging", label: "Match älter als 1 Woche", ageHours };
        }
        return { status: "stale", label: "Match älter als 1 Monat", ageHours };
    }

    /**
     * Calculates comprehensive stats for a player from their match history.
     * @param {string} playerId - FACEIT player UUID
     * @param {Array} history - Array of match history items (newest first)
     * @param {object} matchStatsMap - Map of matchId → per-player stats
     * @param {Array} externalEloHistory - Raw ELO history from FACEIT API
     * @returns {object} Calculated stats: recent, teammates, eloHistory, matchHistory, streak, last5, mapPerformance
     */
    calculatePlayerStats(playerId, history, matchStatsMap, externalEloHistory, requestedMatches = history?.length || 0) {
        if (!playerId || !history || !matchStatsMap) {
            return this._emptyStats();
        }
        let kills = 0, deaths = 0, assists = 0, adrTotal = 0, hs = 0, count = 0, rounds = 0;
        let entryWins = 0, entryCount = 0, clutches = 0, multikills = 0, utilityDamage = 0;

        // For teammates analysis
        const teammateCounts = {};
        const teammateWins = {};
        const teammateLosses = {};
        const teammateInfo = {};

        // For map performance
        const mapData = {};

        // For last 5 results & streak
        const matchResults = []; // ordered newest → oldest
        const detailedHistory = []; // For Heatmap

        for (const match of history) {
            const matchId = match.match_id;
            const stats = matchStatsMap[matchId];
            if (!stats) continue;

            const playerStats = stats[playerId];

            // Personal Stats
            if (playerStats) {
                kills += +playerStats.Kills || 0;
                deaths += +playerStats.Deaths || 0;
                assists += +playerStats.Assists || 0;
                adrTotal += +playerStats.ADR || 0;
                hs += +playerStats.Headshots || 0;
                if (typeof playerStats.__rounds === "number") rounds += playerStats.__rounds;
                entryWins += +playerStats["Entry Wins"] || +playerStats["First Kills"] || 0;
                entryCount += +playerStats["Entry Count"] || 0;
                clutches += +playerStats["Clutch Kills"] || 0;
                multikills += (+playerStats["Double Kills"] || 0) + (+playerStats["Triple Kills"] || 0)
                    + (+playerStats["Quadro Kills"] || 0) + (+playerStats["Penta Kills"] || 0);
                utilityDamage += +playerStats["Utility Damage"] || 0;
                count++;
            }

            // Map Performance
            const mapName = stats.__mapName || "Unknown";
            if (!mapData[mapName]) {
                mapData[mapName] = {
                    wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0, matches: 0,
                    adrTotal: 0, headshots: 0, rounds: 0, entryWins: 0, entryCount: 0,
                    clutches: 0, multikills: 0, utilityDamage: 0, damage: 0
                };
            }

            // Determine win/loss for this match
            const teams = match.teams;
            const winner = match.results?.winner;
            let didWin = false;

            if (teams && winner) {
                for (const [side, team] of Object.entries(teams)) {
                    const members = team.players || [];
                    if (!members.some(p => p.player_id === playerId)) continue;
                    didWin = (side === winner);

                    // Teammate Stats
                    for (const p of members) {
                        if (p.player_id === playerId) continue;

                        teammateCounts[p.player_id] = (teammateCounts[p.player_id] || 0) + 1;
                        if (didWin) {
                            teammateWins[p.player_id] = (teammateWins[p.player_id] || 0) + 1;
                        } else {
                            teammateLosses[p.player_id] = (teammateLosses[p.player_id] || 0) + 1;
                        }

                        if (!teammateInfo[p.player_id]) {
                            teammateInfo[p.player_id] = {
                                nickname: p.nickname,
                                url: (p.faceit_url || "").replace("{lang}", "de"),
                                avatar: p.avatar
                            };
                        }
                    }
                    break;
                }
            }

            // Track match result
            matchResults.push(didWin ? "W" : "L");

            // Track detailed match history for Heatmap
            if (playerStats) {
                const mKills = +playerStats.Kills || 0;
                const mDeaths = +playerStats.Deaths || 0;
                const mKD = mDeaths ? (mKills / mDeaths).toFixed(2) : (mKills > 0 ? "10.0" : "0.00");
                
                detailedHistory.push({
                    matchId: matchId,
                    matchUrl: `https://www.faceit.com/de/cs2/room/${encodeURIComponent(matchId)}`,
                    date: match.finished_at,
                    kd: mKD,
                    result: didWin ? "W" : "L",
                    map: mapName,
                    score: stats.__score || "0 - 0",
                    kills: mKills,
                    deaths: mDeaths,
                    assists: +playerStats.Assists || 0,
                    adr: +playerStats.ADR || 0,
                    hsPercent: playerStats["Headshots %"] || (mKills ? Math.round((+playerStats.Headshots || 0) / mKills * 100) : 0),
                    mvps: +playerStats.MVPs || 0,
                    rounds: +playerStats.__rounds || 0,
                    kr: +playerStats["K/R Ratio"] || (+playerStats.__rounds ? mKills / +playerStats.__rounds : 0),
                    damage: +playerStats.Damage || 0,
                    entryKills: +playerStats["First Kills"] || 0,
                    entryWins: +playerStats["Entry Wins"] || +playerStats["First Kills"] || 0,
                    entryCount: +playerStats["Entry Count"] || 0,
                    entrySuccess: +playerStats["Match Entry Success Rate"] || 0,
                    clutches: +playerStats["Clutch Kills"] || 0,
                    doubleKills: +playerStats["Double Kills"] || 0,
                    tripleKills: +playerStats["Triple Kills"] || 0,
                    quadKills: +playerStats["Quadro Kills"] || 0,
                    pentaKills: +playerStats["Penta Kills"] || 0,
                    utilityDamage: +playerStats["Utility Damage"] || 0,
                    enemiesFlashed: +playerStats["Enemies Flashed"] || 0,
                    sniperKills: +playerStats["Sniper Kills"] || 0
                });
            }

            // Map stats accumulation
            // We now include "Unknown" maps so the total match count in the table sums up to 30 (or whatever the history limit is)
            mapData[mapName].matches++;
            if (didWin) mapData[mapName].wins++;
            else mapData[mapName].losses++;
            
            if (playerStats) {
                mapData[mapName].kills += +playerStats.Kills || 0;
                mapData[mapName].deaths += +playerStats.Deaths || 0;
                mapData[mapName].assists += +playerStats.Assists || 0;
                mapData[mapName].adrTotal += +playerStats.ADR || 0;
                mapData[mapName].headshots += +playerStats.Headshots || 0;
                mapData[mapName].rounds += +playerStats.__rounds || 0;
                mapData[mapName].entryWins += +playerStats["Entry Wins"] || +playerStats["First Kills"] || 0;
                mapData[mapName].entryCount += +playerStats["Entry Count"] || 0;
                mapData[mapName].clutches += +playerStats["Clutch Kills"] || 0;
                mapData[mapName].multikills += (+playerStats["Double Kills"] || 0) + (+playerStats["Triple Kills"] || 0)
                    + (+playerStats["Quadro Kills"] || 0) + (+playerStats["Penta Kills"] || 0);
                mapData[mapName].utilityDamage += +playerStats["Utility Damage"] || 0;
                mapData[mapName].damage += +playerStats.Damage || 0;
            }
        }

        // Aggregate Personal Stats
        const wins = matchResults.filter(r => r === "W").length;
        const recentStats = {
            kills,
            assists,
            deaths,
            wins,
            kd: count && deaths ? (kills / deaths).toFixed(2) : "0.00",
            adr: count ? (adrTotal / count).toFixed(1) : "0.0",
            hsPercent: kills ? Math.round((hs / kills) * 100) + "%" : "0%",
            kr: rounds ? (kills / rounds).toFixed(2) : "0.00",
            matches: count,
            winratePct: count ? Math.round((wins / count) * 100) : 0,
            entryWins,
            entryCount,
            entrySuccess: entryCount ? Math.round(entryWins / entryCount * 100) : 0,
            clutches,
            multikills,
            utilityDamage
        };

        // Win/Loss Streak (from most recent match)
        let streak = { type: "none", count: 0 };
        if (matchResults.length > 0) {
            const first = matchResults[0];
            let streakCount = 0;
            for (const r of matchResults) {
                if (r === first) streakCount++;
                else break;
            }
            streak = { type: first === "W" ? "win" : "loss", count: streakCount };
        }

        // Last 5 results
        const last5 = matchResults.slice(0, 5);

        // Map Performance (sorted by matches played, descending)
        const mapPerformance = Object.entries(mapData)
            .map(([map, d]) => ({
                map,
                wins: d.wins,
                losses: d.losses,
                matches: d.matches,
                winrate: d.matches ? Math.round((d.wins / d.matches) * 100) : 0,
                kd: d.deaths ? (d.kills / d.deaths).toFixed(2) : "0.00",
                adr: d.matches ? (d.adrTotal / d.matches).toFixed(1) : "0.0",
                hsPercent: d.kills ? Math.round(d.headshots / d.kills * 100) : 0,
                kr: d.rounds ? (d.kills / d.rounds).toFixed(2) : "0.00",
                avgKills: d.matches ? (d.kills / d.matches).toFixed(1) : "0.0",
                avgDeaths: d.matches ? (d.deaths / d.matches).toFixed(1) : "0.0",
                avgAssists: d.matches ? (d.assists / d.matches).toFixed(1) : "0.0",
                kdDiff: d.matches ? ((d.kills - d.deaths) / d.matches).toFixed(1) : "0.0",
                entrySuccess: d.entryCount ? Math.round(d.entryWins / d.entryCount * 100) : 0,
                clutches: d.clutches,
                multikills: d.multikills,
                utilityDamage: d.utilityDamage
            }))
            .sort((a, b) => b.matches - a.matches);

        // ELO History
        const eloHistory = (externalEloHistory || [])
            .map(item => {
                const rawDate = Number(item.date ?? item.created_at ?? item.updated_at);
                const date = rawDate > 1e12 ? Math.floor(rawDate / 1000) : Math.floor(rawDate);
                const elo = parseInt(item.elo ?? item.i20);
                const rawDiff = item.elo_delta ?? item.eloDiff;
                const normalized = {
                    date,
                    elo,
                    eloDiff: rawDiff !== undefined && rawDiff !== "" ? parseInt(rawDiff) : undefined
                };
                const matchId = item.matchId ?? item.match_id;
                const map = item.map ?? item.i1;
                const score = item.score ?? item.i18;
                const rawResult = item.result ?? item.i10;
                if (matchId) {
                    normalized.matchId = String(matchId);
                    normalized.matchUrl = `https://www.faceit.com/de/cs2/room/${encodeURIComponent(matchId)}`;
                }
                if (map) normalized.map = String(map).replace(/^de_/i, "").replace(/\b\w/g, letter => letter.toUpperCase());
                if (score) normalized.score = String(score);
                if (rawResult === "W" || rawResult === "L") normalized.result = rawResult;
                else if (String(rawResult) === "1") normalized.result = "W";
                else if (String(rawResult) === "0") normalized.result = "L";
                return normalized;
            })
            .filter(item => Number.isFinite(item.date) && Number.isFinite(item.elo))
            .sort((a, b) => a.date - b.date)
            .filter((item, index, items) => index === 0 || item.date !== items[index - 1].date)
            .slice(-300);

        // Match the detailed statistics with the closest ELO sample. FACEIT's two
        // endpoints do not always use the exact same second for a completed match.
        for (const match of detailedHistory) {
            const matchDate = Number(match.date);
            const closest = eloHistory.reduce((best, point) => {
                const distance = Math.abs(point.date - matchDate);
                return !best || distance < best.distance ? { point, distance } : best;
            }, null);
            if (closest && closest.distance <= 12 * 60 * 60) {
                match.elo = closest.point.elo;
                match.eloDiff = closest.point.eloDiff;
            }
        }

        let longestWinStreak = 0;
        let currentWinStreak = 0;
        for (const result of [...matchResults].reverse()) {
            currentWinStreak = result === "W" ? currentWinStreak + 1 : 0;
            longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
        }
        const peakPoint = eloHistory.reduce((best, point) => !best || point.elo > best.elo ? point : best, null);
        const currentElo = eloHistory.at(-1)?.elo || 0;
        const bestMap = mapPerformance
            .filter(map => map.map !== "Unknown" && map.matches >= 2)
            .sort((a, b) => b.winrate - a.winrate || parseFloat(b.kd) - parseFloat(a.kd) || b.matches - a.matches)[0] || null;
        let bestThirtyGain = 0;
        for (let index = 0; index + 29 < eloHistory.length; index++) {
            const end = eloHistory[index + 29];
            bestThirtyGain = Math.max(bestThirtyGain, end.elo - eloHistory[index].elo);
        }

        const personalBests = {
            peakElo: peakPoint?.elo || currentElo,
            peakEloDate: peakPoint?.date || null,
            longestWinStreak,
            bestMap,
            bestThirtyGain
        };

        const expectedMatches = history.length;
        const matchCoverage = expectedMatches ? Math.round((count / expectedMatches) * 100) : 0;
        const latestTimestamp = Math.max(
            Number(history[0]?.finished_at) || 0,
            Number(eloHistory.at(-1)?.date) || 0
        );
        const freshness = this.getDataFreshness(latestTimestamp);
        const dataQuality = {
            status: freshness.status,
            label: freshness.label,
            matchCoverage,
            eloSamples: eloHistory.length,
            requestedMatches: Number(requestedMatches) || history.length,
            historyMatches: history.length,
            analyzedMatches: count,
            latestTimestamp,
            ageHours: Number.isFinite(freshness.ageHours) ? Math.round(freshness.ageHours) : null
        };

        const recentElo = eloHistory.slice(-10);
        const recentGain = recentElo.length >= 2 ? recentElo.at(-1).elo - recentElo[0].elo : 0;
        const insights = [];
        if (streak.type === "loss" && streak.count >= 3) insights.push({ type: "warning", icon: "↘", title: "Negativserie", text: `${streak.count} Niederlagen in Folge` });
        if (streak.type === "win" && streak.count >= 3) insights.push({ type: "positive", icon: "↗", title: "Heißer Lauf", text: `${streak.count} Siege in Folge` });
        if (currentElo && personalBests.peakElo - currentElo <= 5) insights.push({ type: "peak", icon: "◆", title: "Peak-Alarm", text: `${currentElo} ELO · persönlicher Bestwert` });
        if (recentGain >= 80) insights.push({ type: "positive", icon: "↑", title: "Starker Trend", text: `+${recentGain} ELO in 10 Matches` });
        if (recentGain <= -80) insights.push({ type: "warning", icon: "↓", title: "Formtief", text: `${recentGain} ELO in 10 Matches` });
        if (bestMap) insights.push({ type: "map", icon: "⌖", title: `Beste Map · letzte ${Number(requestedMatches) || history.length} Matches`, text: `${bestMap.map} · ${bestMap.winrate}% Winrate` });

        // Aggregate Teammate Stats
        const teammates = Object.entries(teammateCounts).map(([id, cnt]) => {
            const { nickname, url, avatar } = teammateInfo[id] || {};
            const wins = teammateWins[id] || 0;
            const losses = teammateLosses[id] || 0;
            return {
                playerId: id,
                nickname: nickname || "—",
                url: url || "#",
                avatar,
                count: cnt,
                wins,
                losses,
                winratePct: cnt ? Math.round((wins / cnt) * 100) : 0,
                winrate: cnt ? `${Math.round((wins / cnt) * 100)}%` : "—",
            };
        }).filter(p => p.nickname && p.nickname !== "—");

        return {
            recent: recentStats,
            teammates,
            eloHistory,
            matchHistory: detailedHistory, // Heatmap Data
            streak,
            last5,
            mapPerformance,
            personalBests,
            dataQuality,
            insights
        };
    }

    /** Returns an empty stats object for error/edge cases */
    _emptyStats() {
        return {
            recent: { kills: 0, assists: 0, deaths: 0, wins: 0, kd: "0.00", adr: "0.0", hsPercent: "0%", kr: "0.00", matches: 0, winratePct: 0, entryWins: 0, entryCount: 0, entrySuccess: 0, clutches: 0, multikills: 0, utilityDamage: 0 },
            teammates: [],
            eloHistory: [],
            matchHistory: [],
            streak: { type: "none", count: 0 },
            last5: [],
            mapPerformance: [],
            personalBests: { peakElo: 0, peakEloDate: null, longestWinStreak: 0, bestMap: null, bestThirtyGain: 0 },
            dataQuality: { status: "stale", label: "Keine Matchdaten", matchCoverage: 0, eloSamples: 0, latestTimestamp: 0, ageHours: null },
            insights: []
        };
    }
}

module.exports = new StatsCalculator();
