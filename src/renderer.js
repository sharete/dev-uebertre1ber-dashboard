const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const normalizeUrl = (value) => {
  try {
    const url = new URL(String(value ?? ''));
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '#';
  } catch {
    return '#';
  }
};
const safeUrl = (value) => escapeHtml(normalizeUrl(value));

const deriveRenderProfile = stats => {
  if (stats?.performanceProfile?.role) return stats.performanceProfile;
  const recent = stats?.recent || {};
  const matches = stats?.matchHistory || [];
  const numeric = values => values.map(Number).filter(Number.isFinite);
  const average = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const deviation = values => {
    if (values.length < 2) return 0;
    const mean = average(values);
    return Math.sqrt(average(values.map(value => (value - mean) ** 2)));
  };
  const kdValues = numeric(matches.map(match => match.kd));
  const adrValues = numeric(matches.map(match => match.adr));
  const kdVariation = average(kdValues) ? deviation(kdValues) / average(kdValues) : 0;
  const adrVariation = average(adrValues) ? deviation(adrValues) / average(adrValues) : 0;
  const consistency = matches.length >= 3 ? Math.round(Math.max(0, Math.min(100, 100 - kdVariation * 52 - adrVariation * 34))) : 0;
  const analyzed = Math.max(1, Number(recent.matches) || matches.length || 1);
  const entryAttemptsPerMatch = (Number(recent.entryCount) || 0) / analyzed;
  const clutchesPerMatch = (Number(recent.clutches) || 0) / analyzed;
  const utilityPerMatch = Math.round((Number(recent.utilityDamage) || 0) / analyzed);
  const hs = Number.parseFloat(recent.hsPercent) || 0;
  const kd = Number.parseFloat(recent.kd) || 0;
  const adr = Number.parseFloat(recent.adr) || 0;
  let role = { key: 'allrounder', label: 'Allrounder', description: 'Ausgeglichenes Profil ohne extreme Ausschläge' };
  if (entryAttemptsPerMatch >= .35 && Number(recent.entrySuccess) >= 50) role = { key: 'opener', label: 'Opener', description: 'Sucht und gewinnt häufig die ersten Duelle' };
  else if (clutchesPerMatch >= .12) role = { key: 'closer', label: 'Closer', description: 'Überdurchschnittlich präsent in Clutch-Situationen' };
  else if (utilityPerMatch >= 80) role = { key: 'support', label: 'Support', description: 'Hoher messbarer Impact durch Utility' };
  else if (hs >= 55 && kd >= 1.05) role = { key: 'sharpshooter', label: 'Sharpshooter', description: 'Hohe Präzision und starke Headshot-Quote' };
  else if (adr >= 82 && kd >= 1.08) role = { key: 'fragger', label: 'Fragger', description: 'Hoher Damage-Output bei positiver K/D' };
  return { consistency, eloTrend: 0, eloVolatility: 0, role, entryAttemptsPerMatch, clutchesPerMatch, utilityPerMatch };
};

const serializeForScript = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const countryFlag = value => {
  const code = String(value || '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return '<span class="flag-fallback" aria-label="Land unbekannt">●</span>';
  return `<img class="country-flag" src="https://flagcdn.com/24x18/${code}.png" srcset="https://flagcdn.com/48x36/${code}.png 2x" width="24" height="18" alt="Länderflagge ${escapeHtml(code.toUpperCase())}" loading="lazy">`;
};

const iconSvg = (name, className = 'ui-icon') => {
  const paths = {
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',
    burst: '<path d="m12 2 1.8 6.2L20 6l-3.7 5 5.7 3-6.6.2.6 6.8-4-5.4L8 21l.6-6.8L2 14l5.7-3L4 6l6.2 2.2L12 2Z"/>',
    bolt: '<path d="M13 2 5 13h6l-1 9 9-13h-6V2Z"/>',
    trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0V4Z"/><path d="M8 6H4v1a4 4 0 0 0 4 4m8-5h4v1a4 4 0 0 1-4 4M12 12v5m-4 3h8m-6-3h4"/>',
    flame: '<path d="M13 2s1 4-2 6c-2 1-3 3-3 5a4 4 0 0 0 8 0c0-2-1-4-3-6 0 2-1 3-2 4 0-4 2-6 2-9Z"/>',
    shield: '<path d="M12 3 5 6v5c0 4.8 2.8 8 7 10 4.2-2 7-5.2 7-10V6l-7-3Z"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z"/><path d="M9 3v15m6-12v15"/>',
    users: '<path d="M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/><path d="M17 11a4 4 0 0 1 4 4v2m-5-14a4 4 0 0 1 0 8"/>',
    skull: '<path d="M8 18v3m4-3v3m4-3v3M5 14a8 8 0 1 1 14 0l-3 4H8l-3-4Z"/><circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/>',
    trend: '<path d="M3 17 9 11l4 4 8-9"/><path d="M15 6h6v6"/>'
  };
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.trend}</svg>`;
};

class Renderer {
  render(templatePath, outputPath, data) {
    const { players, lastUpdated, historyData, awards } = data;

    const rows = players.map(p => this.renderRankingCard(p)).join('\n');

    let template = fs.readFileSync(templatePath, 'utf-8');
    template = template.replace("<!-- INSERT_ELO_TABLE_HERE -->", rows);
    template = template.replaceAll("<!-- INSERT_LAST_UPDATED -->", lastUpdated);
    template = template.replaceAll("<!-- INSERT_PLAYER_COUNT -->", players.length);
    const assetRoot = path.dirname(outputPath);
    const assetVersion = crypto.createHash('sha256')
      .update(['dashboard.css', 'dashboard.js'].map(file => {
        const assetPath = path.join(assetRoot, file);
        return fs.existsSync(assetPath) ? fs.readFileSync(assetPath) : file;
      }).join('|'))
      .digest('hex')
      .slice(0, 12);
    template = template.replaceAll("<!-- INSERT_ASSET_VERSION -->", assetVersion);

    // Inject awards section
    const awardsHtml = this.renderAwards(awards);
    template = template.replace("<!-- INSERT_AWARDS_SECTION -->", awardsHtml);

    const playerDataDirectory = path.join(path.dirname(outputPath), 'data', 'players');
    fs.mkdirSync(playerDataDirectory, { recursive: true });

    const trackedProfiles = new Map(players.map(player => [player.playerId, player]));
    const enrichTeammates = periodStats => (periodStats?.teammates || []).map(mate => {
      const tracked = trackedProfiles.get(mate.playerId);
      return tracked ? { ...mate, avatar: tracked.avatar || mate.avatar, url: tracked.faceitUrl || mate.url } : mate;
    });
    const detailPeriod = (period, periodStats) => ({
      requestedMatches: Number(period) || 30,
      recent: periodStats?.recent || {},
      last5: periodStats?.last5 || [],
      streak: periodStats?.streak || { type: 'none', count: 0 },
      mapPerformance: periodStats?.mapPerformance || [],
      personalBests: periodStats?.personalBests || {},
      dataQuality: periodStats?.dataQuality || {},
      performanceProfile: deriveRenderProfile(periodStats),
      insights: periodStats?.insights || [],
      teammates: enrichTeammates(periodStats)
    });

    for (const player of players) {
      const period100 = player.periodStats?.['100'] || player.stats || {};
      const detailPayload = {
        version: 1,
        lastUpdated,
        profile: {
          id: player.playerId,
          nickname: player.nickname,
          avatar: normalizeUrl(player.avatar),
          faceitUrl: normalizeUrl(player.faceitUrl),
          country: player.country || '',
          region: player.region || '',
          memberships: player.memberships || [],
          steamId: player.steamId || '',
          createdAt: player.createdAt || null,
          elo: Number.parseInt(player.elo) || 0,
          level: Number.parseInt(player.level) || 0,
          lifetimeWinrate: player.winrate || '0%',
          lifetimeMatches: Number.parseInt(String(player.matches).replace(/,/g, '')) || 0,
          lastMatch: player.lastMatch || '',
          lastMatchTs: Number(player.lastMatchTs) || 0
        },
        matches: period100.matchHistory || [],
        history: period100.eloHistory || [],
        periods: Object.fromEntries(['30', '60', '100'].map(period => [
          period,
          detailPeriod(period, player.periodStats?.[period] || player.stats)
        ]))
      };
      const fileName = `${String(player.playerId).replace(/[^a-z0-9_-]/gi, '_')}.json`;
      fs.writeFileSync(path.join(playerDataDirectory, fileName), JSON.stringify(detailPayload));
    }

    // Inject compact comparison data. Heavy match/map data lives in lazy player JSON files.
    const serializePeriod = (period, periodStats) => ({
      requestedMatches: Number(period) || 30,
      recent: periodStats?.recent || {},
      last5: periodStats?.last5 || [],
      streak: periodStats?.streak || { type: "none", count: 0 },
      personalBests: periodStats?.personalBests || {},
      dataQuality: periodStats?.dataQuality || {},
      performanceProfile: deriveRenderProfile(periodStats),
      insights: periodStats?.insights || [],
      matchIds: (periodStats?.matchHistory || []).map(match => match.matchId).filter(Boolean),
      history: (periodStats?.eloHistory || []).slice(-Number(period) || -30)
    });
    const comparisonData = players.map(p => ({
      id: p.playerId,
      nickname: p.nickname,
      avatar: normalizeUrl(p.avatar),
      faceitUrl: normalizeUrl(p.faceitUrl),
      country: p.country || '',
      region: p.region || '',
      elo: Number.parseInt(p.elo) || 0,
      winrate: Number.parseFloat(p.winrate) || 0,
      level: Number.parseInt(p.level) || 0,
      recent: p.stats.recent || {},
      last5: p.stats.last5 || [],
      personalBests: p.stats.personalBests || {},
      dataQuality: p.stats.dataQuality || {},
      performanceProfile: deriveRenderProfile(p.stats),
      insights: p.stats.insights || [],
      history: (p.stats.eloHistory || []).slice(-100),
      periods: Object.fromEntries(["30", "60", "100"].map(period => [
        period,
        serializePeriod(period, p.periodStats?.[period] || p.stats)
      ]))
    }));
    const comparisonScript = `<script>window.COMPARISON_DATA = ${serializeForScript(comparisonData)};window.DASHBOARD_ANALYTICS = ${serializeForScript({ lastUpdated })};</script>`;
    template = template.replace("<!-- INSERT_COMPARISON_DATA -->", comparisonScript);

    // Inject history data
    const historyScript = `<script>window.ELO_DATA = ${serializeForScript(historyData)};</script>`;
    if (template.match(/<!--\s*INSERT_HISTORY_DATA\s*-->/)) {
      template = template.replace(/<!--\s*INSERT_HISTORY_DATA\s*-->/, historyScript);
    } else {
      console.error("❌ History Data marker NOT found in template!");
    }

    fs.writeFileSync(outputPath, template);
    console.log(`✅ Generated ${outputPath}`);
  }

  renderAwards(awards) {
    if (!awards || Object.keys(awards).length === 0) return "";

    const card = (title, name, value, icon, accent, index) => `
      <article class="award-card award-${accent}">
        <span class="award-index" aria-hidden="true">0${index}</span>
        <span class="award-icon" aria-hidden="true">${iconSvg(icon, 'award-svg')}</span>
        <div class="award-copy">
          <p>${escapeHtml(title)}</p>
          <p>${escapeHtml(name)}</p>
          <p>${escapeHtml(value)}</p>
        </div>
      </article>`;

    return `
    <div class="award-grid">
${card("Duelist", awards.bestKD.name, `${awards.bestKD.value} K/D`, "target", "blue", 1)}
${card("Headshot King", awards.bestHS.name, awards.bestHS.value, "burst", "yellow", 2)}
${card("Damage Dealer", awards.bestADR.name, `${awards.bestADR.value} ADR`, "bolt", "violet", 3)}
${card("Winner", awards.bestWinrate.name, `${awards.bestWinrate.value}% WR`, "trophy", "green", 4)}
${card("Hot Hand", awards.longestStreak.name, `${awards.longestStreak.value}W`, "flame", "orange", 5)}
${card("Baiter", awards.lowestDeaths.name, `${Number.isFinite(awards.lowestDeaths.value) ? awards.lowestDeaths.value : 0} Deaths`, "shield", "cyan", 6)}
    </div>`;
  }

  renderRankingCard(p) {
    const recent = p.stats?.recent || {};
    const performance = deriveRenderProfile(p.stats);
    const role = performance.role || { key: 'allrounder', label: 'Allrounder' };
    const last5 = p.stats?.last5 || [];
    const streak = p.stats?.streak || { type: 'none', count: 0 };
    const quality = p.stats?.dataQuality || { status: 'stale', label: 'Keine Matchdaten' };
    const wins = last5.filter(result => result === 'W').length;
    const formPercent = last5.length ? Math.round(wins / last5.length * 100) : 0;
    const streakLabel = streak.count ? `${streak.count}${streak.type === 'win' ? 'W' : 'L'}` : '—';
    const nickname = escapeHtml(p.nickname);
    const initial = escapeHtml(String(p.nickname || '?').charAt(0).toUpperCase());
    const avatar = p.avatar
      ? `<span class="ranking-avatar"><span>${initial}</span><img src="${safeUrl(p.avatar)}" alt="" loading="lazy" onerror="this.remove()"></span>`
      : `<span class="ranking-avatar"><span>${initial}</span></span>`;
    const formDots = last5.map(result => `<i class="form-dot ${result === 'W' ? 'win' : 'loss'}" aria-label="${result === 'W' ? 'Sieg' : 'Niederlage'}"></i>`).join('');

    return `<tr class="player-row ranking-player-card"
      data-player-id="${escapeHtml(p.playerId)}" data-elo="${Number(p.elo) || 0}"
      data-nickname="${nickname}" data-winrate="${Number.parseFloat(p.winrate) || 0}"
      data-matches="${Number.parseInt(String(p.matches).replace(/,/g, '')) || 0}"
      data-level="${Number(p.level) || 0}" data-last="${escapeHtml(p.lastMatch)}"
      data-last-ts="${Number(p.lastMatchTs) || 0}" data-kd="${Number.parseFloat(recent.kd) || 0}"
      data-adr="${Number.parseFloat(recent.adr) || 0}" data-form="${formPercent}"
      data-consistency="${Number(performance.consistency) || 0}" data-role="${escapeHtml(role.label)}"
      data-quality="${escapeHtml(quality.status)}" data-peak="${Number(p.stats?.personalBests?.peakElo) || Number(p.elo) || 0}"
      data-streak="${escapeHtml(streakLabel)}" data-streak-type="${escapeHtml(streak.type)}">
      <td colspan="7">
        <article class="ranking-card">
          <div class="ranking-card-rank" aria-label="Ranking"><small>#</small><span>—</span></div>
          <div class="ranking-player">
            ${avatar}
            <div class="ranking-identity">
              <div class="ranking-eyebrow"><span class="ranking-country">${countryFlag(p.country)}</span><span data-card-role>${escapeHtml(role.label)}</span></div>
              <a class="nickname-link" href="${safeUrl(p.faceitUrl)}" target="_blank" rel="noopener noreferrer">${nickname}</a>
              <div class="ranking-meta"><img src="icons/levels/level_${Math.max(1, Math.min(10, Number(p.level) || 1))}_icon.png" alt="FACEIT Level ${escapeHtml(p.level)}"><span>Level ${escapeHtml(p.level)}</span><span class="data-status status-${escapeHtml(quality.status)}"><i></i>${escapeHtml(quality.label)}</span></div>
            </div>
          </div>
          <div class="ranking-elo">
            <small>Current ELO</small>
            <strong class="elo-now">${Number(p.elo) || 0}</strong>
            <span class="elo-diff">±0</span>
          </div>
          <div class="ranking-stat-grid">
            <span><small>K/D</small><strong data-card-stat="kd">${escapeHtml(recent.kd || '0.00')}</strong></span>
            <span><small>ADR</small><strong data-card-stat="adr">${escapeHtml(recent.adr || '0.0')}</strong></span>
            <span><small>Winrate</small><strong data-card-stat="winrate">${Number(recent.winratePct ?? Number.parseFloat(p.winrate)) || 0}%</strong></span>
            <span><small>Headshots</small><strong data-card-stat="hs">${escapeHtml(recent.hsPercent || '0%')}</strong></span>
            <span><small>Konstanz</small><strong data-card-stat="consistency">${Number(performance.consistency) || 0}%</strong></span>
          </div>
          <div class="ranking-form-block">
            <div><small>Form · letzte 5</small><strong data-card-stat="form">${wins}/${last5.length || 0}</strong></div>
            <span class="player-form">${formDots}</span>
            <div class="ranking-form-meta"><span data-card-stat="streak">${escapeHtml(streakLabel)}</span><span class="last-match-cell" data-ts="${Number(p.lastMatchTs) || 0}">${escapeHtml(p.lastMatch)}</span></div>
          </div>
          <button class="open-player-deep-dive" type="button" aria-label="${nickname} analysieren"><span>Profil</span><b aria-hidden="true">→</b></button>
        </article>
      </td>
    </tr>`;
  }

  renderPlayer(p) {
    const { recent, teammates, streak, last5, mapPerformance, eloHistory } = p.stats;
    const personalBests = p.stats.personalBests || {};
    const dataQuality = p.stats.dataQuality || { status: "stale", label: "Keine Matchdaten", matchCoverage: 0, eloSamples: 0 };
    const insights = p.stats.insights || [];
    const recentFormWins = last5.filter(result => result === 'W').length;
    const recentFormPercent = last5.length ? Math.round(recentFormWins / last5.length * 100) : 0;
    const nickname = escapeHtml(p.nickname);
    const playerId = escapeHtml(p.playerId);

    // Radar Chart Data Preparation
    const validMaps = (mapPerformance || []).filter(m => m.map !== "Unknown");
    const radarLabels = validMaps.map(m => m.map);
    const radarData = validMaps.map(m => m.winrate);
    const radarJson = escapeHtml(JSON.stringify({ labels: radarLabels, data: radarData }));

    const topMates = [...teammates].sort((a, b) => b.count - a.count).slice(0, 5);
    const worstMates = [...teammates].sort((a, b) => b.losses - a.losses).slice(0, 5);
    const bestMates = [...teammates].sort((a, b) => b.wins - a.wins).slice(0, 5);

    // Calculate Peak ELO (max of history + current)
    const historyMax = eloHistory && eloHistory.length ? Math.max(...eloHistory.map(h => h.elo)) : 0;
    const peakElo = Math.max(historyMax, parseInt(p.elo));

    // Format Streak
    const streakStr = streak.count > 0 ? `${streak.count}${streak.type === 'win' ? 'W' : 'L'}` : '—';
    // Keep streak information on the form line so it never shifts the ELO column.
    const streakBadge = streak.count >= 2
      ? (streak.type === "win"
        ? `<span class="streak-indicator streak-win" title="${streak.count} Siege in Folge">${streak.count}W</span>`
        : `<span class="streak-indicator streak-loss" title="${streak.count} Niederlagen in Folge">${streak.count}L</span>`)
      : "";

    // Last 5 dots
    const last5Html = last5.map(r =>
      `<div class="w-2 h-2 rounded-full ${r === 'W' ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]' : 'bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.6)]'}"></div>`
    ).join("");

    // Avatar
    const initial = escapeHtml(String(p.nickname || '?').charAt(0).toUpperCase());
    const avatarHtml = p.avatar
      ? `<div class="relative w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/50 overflow-hidden"><span>${initial}</span><img src="${safeUrl(p.avatar)}" class="absolute inset-0 w-full h-full object-cover border border-white/10" alt="" loading="lazy" onerror="this.remove()" /></div>`
      : `<div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/50">${initial}</div>`;

    const mainRow = `
<tr class="player-row glass-card relative group cursor-pointer transition-transform duration-300 hover:scale-[1.01]"
    data-player-id="${playerId}"
    data-elo="${p.elo}"
    data-nickname="${nickname}"
    data-winrate="${parseFloat(p.winrate) || 0}"
    data-matches="${parseInt(p.matches.toString().replace(/,/g, '')) || 0}"
    data-level="${p.level}"
    data-last="${escapeHtml(p.lastMatch)}"
    data-last-ts="${p.lastMatchTs || 0}"
    data-kd="${parseFloat(recent.kd) || 0}"
    data-adr="${parseFloat(recent.adr) || 0}"
    data-form="${recentFormPercent}"
    data-quality="${escapeHtml(dataQuality.status)}"
    data-peak="${peakElo}"
    data-streak="${streakStr}"
    data-streak-type="${streak.type}">
  <td class="p-4">
    <div class="flex items-center gap-3">
        <div class="w-1 h-8 bg-faceit rounded-full opacity-0 group-hover:opacity-100 transition-opacity absolute left-2"></div>
        <span class="toggle-details select-none text-white/30 group-hover:text-neon-blue transition-colors text-xs transform transition-transform duration-300">▸</span>
        ${avatarHtml}
        <div class="flex flex-col">
            <div class="flex items-center gap-1">
                <a href="${safeUrl(p.faceitUrl)}" target="_blank" rel="noopener noreferrer" class="nickname-link font-bold text-white text-base tracking-wide hover:text-faceit transition-colors z-10">${nickname}</a>
            </div>
            <div class="player-form flex items-center gap-1 mt-1">${last5Html}${streakBadge}</div>
        </div>
    </div>
  </td>
  <td class="p-4 font-mono font-bold text-lg text-white text-glow-blue elo-now">${p.elo}</td>
  <td class="p-4 font-mono elo-diff flex items-center justify-center min-h-[60px]">-</td>
  <td class="p-4 text-center">
    <div class="relative inline-block group/badge">
       <div class="absolute inset-0 bg-orange-500/20 blur-md rounded-full opacity-0 group-hover/badge:opacity-100 transition-opacity"></div>
        <img src="icons/levels/level_${Math.max(1, Math.min(10, Number.parseInt(p.level) || 1))}_icon.png" width="28" height="28" alt="FACEIT Level ${escapeHtml(p.level)}" class="relative drop-shadow-md level-badge">
    </div>
  </td>
  <td class="p-4">
    <div class="flex flex-col gap-1 w-24">
        <div class="flex justify-between text-[10px] text-white/50 uppercase font-bold tracking-wider">
            <span>Winrate</span>
            <span class="${parseFloat(p.winrate) >= 50 ? 'text-green-400' : 'text-red-400'}">${p.winrate}</span>
        </div>
        <div class="w-full h-1.5 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div class="h-full bg-gradient-to-r from-blue-600 to-neon-blue shadow-[0_0_10px_rgba(0,242,255,0.5)]" style="width: ${p.winrate}"></div>
        </div>
    </div>
  </td>
  <td class="p-4 text-right font-mono text-white/70 text-sm">${p.matches}</td>
  <td class="p-4 text-xs text-white/40 font-mono text-right last-match-cell" data-ts="${p.lastMatchTs || 0}">${escapeHtml(p.lastMatch)}</td>
</tr>`.trim();

    // Map Performance Table
    const mapRows = (mapPerformance || []).map(m => `
      <tr class="border-b border-white/5 last:border-0">
        <td class="py-2 px-3 text-white/80 text-xs font-medium">${escapeHtml(m.map)}</td>
        <td class="py-2 px-3 text-center text-xs font-mono text-white/50">${m.matches}</td>
        <td class="py-2 px-3 text-center text-xs font-mono ${m.winrate >= 50 ? 'text-green-400' : 'text-red-400'}">${m.winrate}%</td>
        <td class="py-2 px-3 text-center text-xs font-mono ${parseFloat(m.kd) >= 1 ? 'text-green-400' : 'text-red-400'}">${m.kd}</td>
      </tr>`).join("");

    const mapBlock = mapPerformance && mapPerformance.length > 0 ? `
<div class="mb-4">
  <div class="detail-heading detail-map font-bold text-white/60 mb-3 text-[10px] uppercase tracking-widest pl-1">${iconSvg('map', 'heading-svg')}<span>Map Performance</span></div>
  <div class="bg-[#0a0a14] border border-white/5 rounded-xl overflow-hidden">
    <table class="w-full" style="border-spacing:0">
      <thead><tr class="border-b border-white/10">
        <th class="py-2 px-3 text-left text-[10px] uppercase text-white/30 font-bold tracking-wider">Map</th>
        <th class="py-2 px-3 text-center text-[10px] uppercase text-white/30 font-bold tracking-wider">Games</th>
        <th class="py-2 px-3 text-center text-[10px] uppercase text-white/30 font-bold tracking-wider">Win%</th>
        <th class="py-2 px-3 text-center text-[10px] uppercase text-white/30 font-bold tracking-wider">K/D</th>
      </tr></thead>
      <tbody data-map-rows>${mapRows || '<tr><td colspan="4" class="py-4 px-3 text-center text-xs text-white/40">Keine Map-Daten verfügbar.</td></tr>'}</tbody>
    </table>
  </div>
</div>` : "";

    const statBlock = `
<div class="mb-4">
  <div class="performance-period-label font-bold text-neon-blue mb-3 flex items-center gap-2 text-xs uppercase tracking-widest">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>
    <span>Performance (letzte 30)</span>
  </div>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#0a0a14] border border-white/5 p-4 rounded-xl shadow-inner">
    <div><span class="text-white/30 block text-[10px] uppercase font-bold tracking-wider mb-1">K/D</span> <span data-stat="kd" class="font-mono text-xl font-bold ${parseFloat(recent.kd) >= 1 ? 'text-green-400' : 'text-red-400'}">${recent.kd}</span></div>
    <div><span class="text-white/30 block text-[10px] uppercase font-bold tracking-wider mb-1">K/R</span> <span data-stat="kr" class="font-mono text-xl font-bold text-white">${recent.kr}</span></div>
    <div><span class="text-white/30 block text-[10px] uppercase font-bold tracking-wider mb-1">Avg Kills</span> <span data-stat="avg-kills" class="font-mono text-xl font-bold text-white">${recent.matches > 0 ? Math.round(recent.kills / recent.matches) : 0}</span></div>
    <div><span class="text-white/30 block text-[10px] uppercase font-bold tracking-wider mb-1">HS %</span> <span data-stat="hs" class="font-mono text-xl font-bold text-white">${recent.hsPercent}</span></div>

    <div class="col-span-2 md:col-span-4 border-t border-white/5 pt-3 mt-1 flex flex-wrap gap-6 text-xs font-mono text-white/50">
        <span class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div> K: <b data-stat="kills" class="text-white">${recent.kills}</b></span>
        <span class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-purple-500"></div> A: <b data-stat="assists" class="text-white">${recent.assists}</b></span>
        <span class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-red-500"></div> D: <b data-stat="deaths" class="text-white">${recent.deaths}</b></span>
        <span class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> ADR: <b data-stat="adr" class="text-white text-glow-orange">${recent.adr}</b></span>
    </div>
  </div>
  
  <div class="mt-4 bg-[#0a0a14] border border-white/5 p-4 rounded-xl shadow-inner relative overflow-hidden">
      <div class="font-bold text-white/60 mb-2 text-[10px] uppercase tracking-widest pl-1">Map-Profil</div>
      <div class="relative h-48 w-full">
         <canvas class="radar-chart" data-radar='${radarJson}'></canvas>
      </div>
  </div>
</div>`;

    const matesList = (list, valueKey = 'count', suffix = 'G', isLossRate = false) => list.map(m => {
        let percentage = parseFloat(m.winrate) || 0;
        let displayPct = percentage;
        let colorClass = percentage >= 50 ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20';

        if (isLossRate) {
            displayPct = 100 - percentage;
            // Invert colors: High Loss Rate = Bad (Red), Low Loss Rate = Good (Green)
            colorClass = displayPct >= 50 ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20';
        }

        return `
        <li class="flex justify-between items-center py-2 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 rounded transition-colors group/mate">
            <a href="${safeUrl(m.url)}" target="_blank" rel="noopener noreferrer" class="nickname-link text-white/70 font-medium hover:text-neon-blue transition-colors text-xs">${escapeHtml(m.nickname)}</a>
            <span class="text-[10px] text-white/40 font-mono">${m[valueKey]} ${suffix} <span class="ml-2 px-1.5 py-0.5 rounded font-bold ${colorClass}">${displayPct}%</span></span>
        </li>`;
    }).join("");

    const topMatesBlock = `
<div class="mb-4">
  <div class="detail-heading detail-mates font-bold text-white/60 mb-3 text-[10px] uppercase tracking-widest pl-1">${iconSvg('users', 'heading-svg')}<span>Most played with</span></div>
  <ul data-mate-list="played" class="bg-[#0a0a14] border border-white/5 rounded-xl p-1">
    ${matesList(topMates, 'count', 'G')}
  </ul>
</div>`;

    const bestMatesBlock = `
<div class="mb-4">
  <div class="detail-heading detail-wins font-bold text-green-400/60 mb-3 text-[10px] uppercase tracking-widest pl-1">${iconSvg('trophy', 'heading-svg')}<span>Most wins with</span></div>
  <ul data-mate-list="wins" class="bg-[#0a0a14] border border-white/5 rounded-xl p-1">
    ${matesList(bestMates, 'wins', 'W')}
  </ul>
</div>`;

    const worstMatesBlock = `
<div class="mb-4">
  <div class="detail-heading detail-losses font-bold text-red-400/60 mb-3 text-[10px] uppercase tracking-widest pl-1">${iconSvg('skull', 'heading-svg')}<span>Most losses with</span></div>
  <ul data-mate-list="losses" class="bg-[#0a0a14] border border-white/5 rounded-xl p-1">
     ${matesList(worstMates, 'losses', 'L', true)}
  </ul>
</div>`;

    const historyJson = escapeHtml(JSON.stringify((p.stats.eloHistory || []).slice(-30)));

    const chartBlock = `
<div class="mt-6 bg-[#0a0a14] border border-white/5 p-4 rounded-xl shadow-inner relative overflow-hidden group/chart">
    <div class="detail-heading detail-trend font-bold text-white/60 mb-4 text-[10px] uppercase tracking-widest relative z-10">
        ${iconSvg('trend', 'heading-svg')}<span class="trend-period-label">ELO-Trend · letzte 30 Matches</span>
    </div>
    <div class="h-48 w-full relative z-10">
        <canvas id="chart-${playerId}" class="elo-chart" data-history='${historyJson}'></canvas>
    </div>
</div>
`;

    const bestMap = personalBests.bestMap;
    const insightHtml = insights.length
      ? insights.slice(0, 4).map(item => `
        <article class="player-insight insight-${escapeHtml(item.type)}">
          <span aria-hidden="true">${escapeHtml(item.icon)}</span>
          <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.text)}</small></div>
        </article>`).join("")
      : `<p class="analytics-empty">Noch keine belastbare Auffälligkeit in den letzten Matches.</p>`;
    const analyticsBlock = `
<div class="player-analytics">
  <div class="player-analytics-head">
    <div>
      <span class="data-status status-${escapeHtml(dataQuality.status)}"><i></i>${escapeHtml(dataQuality.label)}</span>
      <small class="analysis-coverage">${Number(dataQuality.analyzedMatches) || Number(recent.matches) || 0} von 30 Matches ausgewertet · ${Number(dataQuality.matchCoverage) || 0}% Abdeckung</small>
    </div>
  </div>
  <div class="personal-bests" aria-label="Persönliche Bestwerte">
    <article data-best="peak"><span>Peak ELO</span><strong>${Number(personalBests.peakElo) || peakElo}</strong><small>Aus ${Number(dataQuality.eloSamples) || 0} ELO-Werten</small></article>
    <article data-best="streak"><span>Längste Serie</span><strong>${Number(personalBests.longestWinStreak) || 0}W</strong><small>Letzte 30 Matches</small></article>
    <article data-best="map"><span>Beste Map</span><strong>${escapeHtml(bestMap?.map || "—")}</strong><small>${bestMap ? `${bestMap.winrate}% WR · letzte 30 Matches` : "Letzte 30 Matches"}</small></article>
    <article data-best="gain"><span>Beste 30er-Phase</span><strong>${Number(personalBests.bestThirtyGain) > 0 ? "+" : ""}${Number(personalBests.bestThirtyGain) || 0}</strong><small>ELO · aus ${Number(dataQuality.eloSamples) || 0} Werten</small></article>
    <article data-best="form" data-form-card><span>Letzte 5 Matches</span><strong>${last5.length ? `${recentFormWins}/${last5.length}` : "—"}</strong><small>${last5.length ? `${recentFormPercent}% Siege` : "Keine Daten"}</small></article>
  </div>
  <div class="insight-grid">${insightHtml}</div>
</div>`;

    const detailRow = `
<tr class="details-row hidden" data-player-id="${playerId}">
  <td colspan="7" class="p-0 border-none">
    <div class="mx-2 mb-4 p-6 glass-panel rounded-b-xl border-t-0 grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in relative shadow-neon-blue">
         <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-gray-700 to-transparent opacity-50"></div>
        <div class="col-span-1 md:col-span-2">
            ${analyticsBlock}
            ${statBlock}
            ${mapBlock}
            ${chartBlock}
        </div>
        <div>
             ${topMatesBlock}
        </div>
        <div class="space-y-0">
             ${bestMatesBlock}
             ${worstMatesBlock}
        </div>
    </div>
  </td>
</tr>`.trim();

    return mainRow + "\n" + detailRow;
  }
}

module.exports = new Renderer();
