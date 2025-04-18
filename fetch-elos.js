// generate_dashboard.js – final komplett mit K/R und häufigstem Lose-Partner

const fs = require("fs");
const path = require("path");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const { DateTime } = require("luxon");
const pLimit = (...args) => import("p-limit").then(mod => mod.default(...args));

const FACEIT_API_KEY = process.env.FACEIT_API_KEY;
const PLAYERS_FILE = "players.txt";
const TEMPLATE_FILE = "index.template.html";
const OUTPUT_FILE = "index.html";
const DATA_DIR = path.join(__dirname, "data");
const API_BASE = "https://open.faceit.com/data/v4";
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
  console.log(`✅ Datei geschrieben: ${file} (${data.length} Einträge)`);
}

function getHeaders() {
  return {
    Authorization: `Bearer ${FACEIT_API_KEY}`,
    "User-Agent": "Mozilla/5.0",
    Accept: "application/json",
    Referer: "https://www.faceit.com/",
    Origin: "https://www.faceit.com",
  };
}

async function retryFetch(url, options = {}, retries = 3, delay = 1000) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    await new Promise(r => setTimeout(r, delay));
  }
  return null;
}

async function safeJson(res) {
  try {
    const txt = await res.text();
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function fetchMatchStats(matchId, playerId) {
  if (!fetchMatchStats.cache) fetchMatchStats.cache = {};
  const cache = fetchMatchStats.cache;
  if (cache[matchId]) return cache[matchId][playerId] || null;

  const res = await retryFetch(`${API_BASE}/matches/${matchId}/stats`, { headers: getHeaders() });
  if (!res) return null;
  const data = await safeJson(res);
  if (!data?.rounds) return null;
  const players = data.rounds[0].teams.flatMap(t => t.players);
  const mapStats = Object.fromEntries(players.map(p => [p.player_id, p.player_stats]));
  cache[matchId] = mapStats;
  return mapStats[playerId] || null;
}

async function fetchRecentStats(playerId) {
  const res = await retryFetch(`${API_BASE}/players/${playerId}/history?game=cs2&limit=30`, { headers: getHeaders() });
  const hist = await safeJson(res) || { items: [] };
  const statsArr = await Promise.all(
    hist.items.map(m => fetchMatchStats(m.match_id, playerId).catch(() => null))
  );

  let kills = 0, deaths = 0, assists = 0, adrTotal = 0, hs = 0, count = 0;
  for (const s of statsArr) {
    if (!s) continue;
    kills += +s.Kills || 0;
    deaths += +s.Deaths || 0;
    assists += +s.Assists || 0;
    adrTotal += +s.ADR || 0;
    hs += +s.Headshots || 0;
    count++;
  }

  return {
    kills,
    assists,
    deaths,
    kd: count && deaths ? (kills / deaths).toFixed(2) : "0.00",
    adr: count ? (adrTotal / count).toFixed(1) : "0.0",
    hsPercent: kills ? Math.round((hs / kills) * 100) + "%" : "0%",
    kr: count ? (kills / count).toFixed(2) : "0.00",
  };
}

async function fetchTeammateStats(playerId) {
  const res = await retryFetch(`${API_BASE}/players/${playerId}/history?game=cs2&limit=30`, { headers: getHeaders() });
  const hist = await safeJson(res) || { items: [] };
  if (hist.items.length === 0) return [];

  const countMap = {}, winMap = {}, loseMap = {}, infoMap = {};
  for (const m of hist.items) {
    const teams = m.teams;
    const winner = m.results?.winner;
    if (!teams || !winner) continue;

    for (const [side, team] of Object.entries(teams)) {
      const members = team.players || [];
      if (!members.some(p => p.player_id === playerId)) continue;

      for (const p of members) {
        if (p.player_id === playerId) continue;
        countMap[p.player_id] = (countMap[p.player_id] || 0) + 1;
        if (side === winner) {
          winMap[p.player_id] = (winMap[p.player_id] || 0) + 1;
        } else {
          loseMap[p.player_id] = (loseMap[p.player_id] || 0) + 1;
        }
        if (!infoMap[p.player_id]) {
          infoMap[p.player_id] = {
            nickname: p.nickname,
            url: (p.faceit_url || "").replace("{lang}", "de"),
          };
        }
      }
      break;
    }
  }

  return Object.entries(countMap).map(([id, cnt]) => {
    const { nickname, url } = infoMap[id] || {};
    const wins = winMap[id] || 0;
    const losses = loseMap[id] || 0;
    return {
      playerId: id,
      nickname: nickname || "—",
      url: url || "#",
      count: cnt,
      wins,
      losses,
      winrate: cnt ? `${Math.round((wins / cnt) * 100)}%` : "—",
    };
  }).filter(p => p.nickname && p.nickname !== "—").sort((a, b) => b.count - a.count);
}

async function fetchPlayerData(playerId) {
  const headers = getHeaders();
  const [pr, hr, sr] = await Promise.all([
    retryFetch(`${API_BASE}/players/${playerId}`, { headers }),
    retryFetch(`${API_BASE}/players/${playerId}/history?game=cs2&limit=1`, { headers }),
    retryFetch(`${API_BASE}/players/${playerId}/stats/cs2`, { headers }),
  ]);

  const profile = await safeJson(pr) || {};
  const history = await safeJson(hr) || { items: [] };
  const stats = await safeJson(sr) || {};

  const elo = profile.games?.cs2?.faceit_elo || null;
  const nickname = profile.nickname || "—";
  const url = (profile.faceit_url || "").replace("{lang}", "de");
  const level = profile.games?.cs2?.skill_level || null;
  const lifetime = stats.lifetime || {};
  const lastTs = history.items[0]?.finished_at;
  const lastMatch = lastTs ? DateTime.fromSeconds(lastTs).setZone("Europe/Berlin").toFormat("yyyy-MM-dd HH:mm") : "—";

  const recentStats = await fetchRecentStats(playerId);
  const teammateStats = await fetchTeammateStats(playerId);
  const topMate = teammateStats[0] || {};
  const worstMate = [...teammateStats].sort((a, b) => b.losses - a.losses)[0] || {};

  return {
    playerId,
    nickname,
    elo,
    lastMatch,
    faceitUrl: url,
    level,
    winrate: lifetime["Win Rate %"] || "—",
    matches: lifetime["Matches"] || "—",
    recentStats,
    partnerNickname: topMate.nickname || "—",
    partnerUrl: topMate.url || "#",
    partnerWinrate: topMate.winrate || "—",
    worstMateNickname: worstMate.nickname || "—",
    worstMateUrl: worstMate.url || "#",
  };
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

(async () => {
  if (!FACEIT_API_KEY) {
    console.error("❌ FACEIT_API_KEY fehlt!");
    process.exit(1);
  }

  const lines = fs.readFileSync(PLAYERS_FILE, "utf-8")
    .trim()
    .split("\n")
    .map(l => l.split(/#|\/\//)[0].trim())
    .filter(Boolean);

  const limit = await pLimit(5);
  const results = (
    await Promise.all(lines.map(id =>
      limit(async () => {
        try {
          const d = await fetchPlayerData(id);
          return d.elo ? d : null;
        } catch (e) {
          console.error(`❌ Fehler bei ${id}: ${e.message}`);
          return null;
        }
      })
    ))
  ).filter(Boolean);

  results.sort((a, b) => b.elo - a.elo);
  const latest = results.map(r => ({ playerId: r.playerId, elo: r.elo }));
  writeJson(RANGE_FILES.latest, latest);

  const updatedTime = DateTime.now().setZone("Europe/Berlin").toFormat("yyyy-MM-dd HH:mm");
  const rows = results.map(p => {
    const {
      playerId, elo, level,
      recentStats,
      partnerNickname, partnerUrl, partnerWinrate,
      worstMateNickname, worstMateUrl,
      winrate, matches, lastMatch
    } = p;

    const mainRow = `
      <tr class="player-row" data-player-id="${playerId}" data-elo="${elo}">
        <td class="p-2">
          <div class="flex items-center gap-2">
            <span class="cursor-pointer toggle-details text-blue-400">▸</span>
            <a href="${p.faceitUrl}" target="_blank" class="nickname-link">${p.nickname}</a>
          </div>
        </td>
        <td class="p-2 elo-now">${elo}</td>
        <td class="p-2 elo-diff">-</td>
        <td class="p-2">
          <img src="icons/levels/level_${level}_icon.png" width="24" height="24" title="Level ${level}">
        </td>
        <td class="p-2">${winrate}</td>
        <td class="p-2">${matches}</td>
        <td class="p-2">${lastMatch}</td>
      </tr>
    `.trim();

    const detailRow = `
      <tr class="details-row hidden bg-white/5" data-player-id="${playerId}">
        <td colspan="7" class="p-3 text-sm text-white/80 pl-10 leading-relaxed">
          <div class="space-y-4">

            <div>
              <div class="font-semibold text-white/90 mb-1">📊 Stats aus den letzten 30 Matches:</div>
              <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-2">
                <div><strong>Kills:</strong> ${recentStats.kills}</div>
                <div><strong>Assists:</strong> ${recentStats.assists}</div>
                <div><strong>Deaths:</strong> ${recentStats.deaths}</div>
                <div><strong>K/D:</strong> ${recentStats.kd}</div>
                <div><strong>ADR:</strong> ${recentStats.adr}</div>
                <div><strong>HS%:</strong> ${recentStats.hsPercent}</div>
                <div><strong>K/R:</strong> ${recentStats.kr}</div>
              </div>
            </div>

            <div>
              <div class="font-semibold text-white/90 mb-1">👥 Mitspieler-Analyse:</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <div><strong>Häufigster Mitspieler:</strong> ${partnerNickname !== "—"
                  ? `<a href="${partnerUrl}" target="_blank" class="nickname-link">${partnerNickname}</a>`
                  : "—"}</div>
                <div><strong>Winrate mit ihm:</strong> ${partnerWinrate}</div>
                <div><strong>Meiste Niederlagen mit:</strong> ${worstMateNickname !== "—"
                  ? `<a href="${worstMateUrl}" target="_blank" class="nickname-link">${worstMateNickname}</a>`
                  : "—"}</div>
              </div>
            </div>

          </div>
        </td>
      </tr>
    `.trim();

    return `${mainRow}\n${detailRow}`;
  }).join("\n");

  const template = fs.readFileSync(TEMPLATE_FILE, "utf-8");
  fs.writeFileSync(OUTPUT_FILE,
    template
      .replace("<!-- INSERT_ELO_TABLE_HERE -->", rows)
      .replace("<!-- INSERT_LAST_UPDATED -->", updatedTime)
  );
  console.log(`✅ Dashboard aktualisiert: ${OUTPUT_FILE}`);

  for (const range of ["daily", "weekly", "monthly", "yearly"]) {
    const metaPath = path.join(DATA_DIR, `elo-${range}-meta.json`);
    const start = getPeriodStart(range);
    let doUpdate = true;
    if (fs.existsSync(metaPath)) {
      try {
        const m = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (DateTime.fromISO(m.lastUpdated, { zone: "Europe/Berlin" }) >= start) {
          doUpdate = false;
        }
      } catch {}
    }
    if (doUpdate) {
      writeJson(RANGE_FILES[range], latest);
      fs.writeFileSync(metaPath, JSON.stringify({ lastUpdated: start.toISODate() }, null, 2));
      console.log(`✅ ${RANGE_FILES[range]} wurde aktualisiert.`);
    }
  }
})();
