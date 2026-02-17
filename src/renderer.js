const fs = require('fs');

/** CSS class constants for reuse */
const CSS = {
  statLabel: 'text-white/30 block text-[10px] uppercase font-bold tracking-wider mb-1',
  statValue: 'font-mono text-xl font-bold',
  sectionTitle: 'font-bold text-white/60 mb-3 text-[10px] uppercase tracking-widest pl-1',
  innerPanel: 'bg-[#0a0a14] border border-white/5 rounded-xl',
  mateItem: 'flex justify-between items-center py-2 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 rounded transition-colors group/mate',
};

/**
 * Escapes HTML special characters to prevent XSS.
 * @param {string} str - Raw string to escape
 * @returns {string} Escaped HTML string
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Returns a CSS class for ELO color tiers.
 * @param {number} elo - Player's current ELO
 * @returns {string} CSS class name
 */
function getEloTierClass(elo) {
  if (elo >= 2500) return 'elo-tier-legendary';
  if (elo >= 2000) return 'elo-tier-diamond';
  if (elo >= 1500) return 'elo-tier-platinum';
  if (elo >= 1000) return 'elo-tier-gold';
  return 'elo-tier-silver';
}

/**
 * Returns rank badge HTML for a given position.
 * @param {number} rank - 1-indexed rank position
 * @returns {string} HTML for rank badge
 */
function renderRankBadge(rank) {
  if (rank === 1) return '<div class="rank-badge rank-1">1</div>';
  if (rank === 2) return '<div class="rank-badge rank-2">2</div>';
  if (rank === 3) return '<div class="rank-badge rank-3">3</div>';
  return `<div class="rank-badge rank-default">${rank}</div>`;
}

class Renderer {
  /**
   * Renders the full dashboard HTML from template + data.
   * @param {string} templatePath - Path to HTML template
   * @param {string} outputPath - Output file path
   * @param {object} data - Dashboard data (players, lastUpdated, historyData, awards)
   */
  render(templatePath, outputPath, data) {
    const { players, lastUpdated, historyData, awards } = data;

    const rows = players.map((p, i) => this.renderPlayer(p, i + 1)).join('\n');

    let template = fs.readFileSync(templatePath, 'utf-8');
    template = template.replace("<!-- INSERT_ELO_TABLE_HERE -->", rows);
    template = template.replace("<!-- INSERT_LAST_UPDATED -->", lastUpdated);
    template = template.replace("<!-- INSERT_PLAYER_COUNT -->", players.length);

    // Inject awards section
    const awardsHtml = this.renderAwards(awards);
    template = template.replace("<!-- INSERT_AWARDS_SECTION -->", awardsHtml);

    // Inject comparison chart data
    const comparisonData = players.map(p => ({
      id: p.playerId,
      nickname: p.nickname,
      avatar: p.avatar,
      history: p.stats.eloHistory || []
    }));
    const comparisonScript = `<script>window.COMPARISON_DATA = ${JSON.stringify(comparisonData)};</script>`;
    template = template.replace("<!-- INSERT_COMPARISON_DATA -->", comparisonScript);

    // Inject history data
    const historyScript = `<script>window.ELO_DATA = ${JSON.stringify(historyData)};</script>`;
    if (template.match(/<!--\s*INSERT_HISTORY_DATA\s*-->/)) {
      template = template.replace(/<!--\s*INSERT_HISTORY_DATA\s*-->/, historyScript);
    } else {
      console.error("❌ History Data marker NOT found in template!");
    }

    fs.writeFileSync(outputPath, template);
    console.log(`✅ Generated ${outputPath}`);
  }

  /**
   * Renders the awards section.
   * @param {object} awards - Calculated awards data
   * @returns {string} Awards HTML
   */
  renderAwards(awards) {
    if (!awards || Object.keys(awards).length === 0) return "";

    const card = (emoji, title, name, value, color) => `
      <div class="glass-panel p-4 rounded-xl flex items-center gap-4 relative overflow-hidden group">
        <div class="absolute right-0 top-0 w-20 h-20 bg-${color}-500/10 rounded-full blur-2xl -mr-8 -mt-8 group-hover:bg-${color}-500/20 transition"></div>
        <div class="w-10 h-10 rounded-lg bg-gradient-to-br from-${color}-500/20 to-${color}-500/5 flex items-center justify-center text-xl shadow-inner">${emoji}</div>
        <div class="min-w-0">
          <p class="text-[10px] uppercase tracking-widest text-white/40 font-bold">${title}</p>
          <p class="font-bold text-white text-sm tracking-tight truncate">${escapeHtml(name)}</p>
          <p class="font-mono text-${color}-400 text-xs font-bold">${value}</p>
        </div>
      </div>`;

    return `
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 w-full awards-grid">
      ${card("🎯", "Best K/D", awards.bestKD.name, awards.bestKD.value, "blue")}
      ${card("💥", "Headshot King", awards.bestHS.name, awards.bestHS.value, "yellow")}
      ${card("⚡", "Best ADR", awards.bestADR.name, awards.bestADR.value, "purple")}
      ${card("🏆", "Best Winrate", awards.bestWinrate.name, `${awards.bestWinrate.value}%`, "green")}
      ${card("🔥", "Win Streak", awards.longestStreak.name, `${awards.longestStreak.value}W`, "orange")}
      ${card("🛡️", "Survivor", awards.lowestDeaths.name, `${awards.lowestDeaths.value} Deaths`, "cyan")}
    </div>`;
  }

  /**
   * Renders a single player row + detail panel.
   * @param {object} p - Player data
   * @param {number} rank - Player rank (1-indexed)
   * @returns {string} HTML for player row + detail row
   */
  renderPlayer(p, rank) {
    const { recent, teammates, streak, last5, mapPerformance, eloHistory } = p.stats;
    const safeName = escapeHtml(p.nickname);

    // Radar Chart Data
    const validMaps = (mapPerformance || []).filter(m => m.map !== "Unknown");
    const radarJson = JSON.stringify({
      labels: validMaps.map(m => m.map),
      data: validMaps.map(m => m.winrate)
    });

    // Teammate analysis
    const topMates = [...teammates].sort((a, b) => b.count - a.count).slice(0, 5);
    const worstMates = [...teammates].sort((a, b) => b.losses - a.losses).slice(0, 5);
    const bestMates = [...teammates].sort((a, b) => b.wins - a.wins).slice(0, 5);

    // Peak ELO
    const historyMax = eloHistory && eloHistory.length ? Math.max(...eloHistory.map(h => h.elo)) : 0;
    const peakElo = Math.max(historyMax, parseInt(p.elo));

    // Streak
    const streakStr = streak.count > 0 ? `${streak.count}${streak.type === 'win' ? 'W' : 'L'}` : '—';
    const streakBadge = streak.count >= 2
      ? (streak.type === "win"
        ? `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/20">🔥${streak.count}W</span>`
        : `<span class="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/20">💀${streak.count}L</span>`)
      : "";

    // Last 5 dots
    const last5Html = last5.map(r =>
      `<div class="w-2 h-2 rounded-full ${r === 'W' ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]' : 'bg-red-400 shadow-[0_0_4px_rgba(248,113,113,0.6)]'}"></div>`
    ).join("");

    // Avatar
    const avatarHtml = p.avatar
      ? `<img src="${p.avatar}" class="w-8 h-8 rounded-full object-cover border border-white/10 shadow-lg" alt="${safeName}" loading="lazy" />`
      : `<div class="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-white/50">${safeName.charAt(0).toUpperCase()}</div>`;

    // ELO tier coloring
    const eloTier = getEloTierClass(parseInt(p.elo));

    // Winrate color
    const wrPct = parseFloat(p.winrate) || 0;
    const wrColor = wrPct >= 55 ? 'from-green-500 to-emerald-400' : wrPct >= 50 ? 'from-blue-600 to-neon-blue' : 'from-red-600 to-red-400';
    const wrTextColor = wrPct >= 50 ? 'text-green-400' : 'text-red-400';

    const mainRow = `
<tr class="player-row glass-card relative group cursor-pointer transition-transform duration-300 hover:scale-[1.005]"
    data-player-id="${p.playerId}"
    data-elo="${p.elo}"
    data-nickname="${safeName}"
    data-winrate="${wrPct}"
    data-matches="${parseInt(p.matches.toString().replace(/,/g, '')) || 0}"
    data-level="${p.level}"
    data-last="${p.lastMatch}"
    data-last-ts="${p.lastMatchTs || 0}"
    data-kd="${parseFloat(recent.kd) || 0}"
    data-peak="${peakElo}"
    data-streak="${streakStr}"
    data-streak-type="${streak.type}">
  <td class="p-4">
    <div class="flex items-center gap-3">
        ${renderRankBadge(rank)}
        <span class="toggle-details select-none text-white/30 group-hover:text-neon-blue transition-all text-xs transform duration-300">▸</span>
        ${avatarHtml}
        <div class="flex flex-col">
            <div class="flex items-center gap-1">
                <a href="${p.faceitUrl}" target="_blank" class="nickname-link font-bold text-white text-base tracking-wide hover:text-faceit transition-colors z-10">${safeName}</a>
                ${streakBadge}
            </div>
            <div class="flex items-center gap-1 mt-1">${last5Html}</div>
        </div>
    </div>
  </td>
  <td class="p-4 font-mono font-bold text-lg ${eloTier} elo-now">${p.elo}</td>
  <td class="p-4 font-mono elo-diff flex items-center justify-center min-h-[60px]">-</td>
  <td class="p-4 text-center">
    <div class="relative inline-block group/badge">
       <div class="absolute inset-0 bg-orange-500/20 blur-md rounded-full opacity-0 group-hover/badge:opacity-100 transition-opacity"></div>
       <img src="icons/levels/level_${p.level}_icon.png" width="28" height="28" title="Level ${p.level}" class="relative drop-shadow-md level-badge">
    </div>
  </td>
  <td class="p-4">
    <div class="flex flex-col gap-1 w-28">
        <div class="flex justify-between text-[10px] text-white/50 uppercase font-bold tracking-wider">
            <span>Winrate</span>
            <span class="${wrTextColor} font-mono">${p.winrate}</span>
        </div>
        <div class="w-full h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div class="h-full bg-gradient-to-r ${wrColor} winrate-fill shadow-[0_0_8px_rgba(0,242,255,0.3)]" style="width: ${p.winrate}"></div>
        </div>
    </div>
  </td>
  <td class="p-4 text-right font-mono text-white/70 text-sm">${p.matches}</td>
  <td class="p-4 text-xs text-white/40 font-mono text-right last-match-cell" data-ts="${p.lastMatchTs || 0}">${p.lastMatch}</td>
</tr>`.trim();

    // --- Detail Panel Sub-components ---
    const statBlock = this._renderStatBlock(recent, radarJson);
    const mapBlock = this._renderMapBlock(mapPerformance);
    const chartBlock = this._renderChartBlock(p.playerId, p.stats.eloHistory, peakElo);
    const topMatesBlock = this._renderMatesBlock('👥 Most played with', topMates, 'count', 'G', false);
    const bestMatesBlock = this._renderMatesBlock('🏆 Most wins with', bestMates, 'wins', 'W', false, 'green');
    const worstMatesBlock = this._renderMatesBlock('💀 Most losses with', worstMates, 'losses', 'L', true, 'red');

    const detailRow = `
<tr class="details-row" data-player-id="${p.playerId}">
  <td colspan="7" class="p-0 border-none">
    <div class="details-content">
      <div class="mx-2 mb-4 p-6 glass-panel rounded-b-xl border-t-0 grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in relative">
           <div class="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-faceit/20 to-transparent"></div>
          <div class="col-span-1 md:col-span-2">
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
    </div>
  </td>
</tr>`.trim();

    return mainRow + "\n" + detailRow;
  }

  /** Renders the performance stats block */
  _renderStatBlock(recent, radarJson) {
    const kdColor = parseFloat(recent.kd) >= 1 ? 'text-green-400' : 'text-red-400';
    return `
<div class="mb-4">
  <div class="font-bold text-neon-blue mb-3 flex items-center gap-2 text-xs uppercase tracking-widest">
    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 002 2h2a2 2 0 002-2z" /></svg>
    Performance (Last 30)
  </div>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 ${CSS.innerPanel} p-4 shadow-inner">
    <div><span class="${CSS.statLabel}">K/D</span> <span class="${CSS.statValue} ${kdColor}">${recent.kd}</span></div>
    <div><span class="${CSS.statLabel}">K/R</span> <span class="${CSS.statValue} text-white">${recent.kr}</span></div>
    <div><span class="${CSS.statLabel}">Avg Kills</span> <span class="${CSS.statValue} text-white">${recent.matches > 0 ? Math.round(recent.kills / recent.matches) : 0}</span></div>
    <div><span class="${CSS.statLabel}">HS %</span> <span class="${CSS.statValue} text-white">${recent.hsPercent}</span></div>

    <div class="col-span-2 md:col-span-4 border-t border-white/5 pt-3 mt-1 flex flex-wrap gap-6 text-xs font-mono text-white/50">
        <span class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-blue-500"></div> K: <b class="text-white">${recent.kills}</b></span>
        <span class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-purple-500"></div> A: <b class="text-white">${recent.assists}</b></span>
        <span class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-red-500"></div> D: <b class="text-white">${recent.deaths}</b></span>
        <span class="flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full bg-yellow-500"></div> ADR: <b class="text-white text-glow-orange">${recent.adr}</b></span>
    </div>
  </div>
  
  <div class="mt-4 ${CSS.innerPanel} p-4 shadow-inner relative overflow-hidden">
      <div class="${CSS.sectionTitle}">🕸️ Performance Web</div>
      <div class="relative h-48 w-full">
         <canvas class="radar-chart" data-radar='${radarJson}'></canvas>
      </div>
  </div>
</div>`;
  }

  /** Renders the map performance table */
  _renderMapBlock(mapPerformance) {
    if (!mapPerformance || mapPerformance.length === 0) return '';

    const mapRows = mapPerformance.map(m => {
      const wrBarColor = m.winrate >= 50 ? 'bg-green-500/60' : 'bg-red-500/60';
      return `
      <tr class="border-b border-white/5 last:border-0">
        <td class="py-2 px-3 text-white/80 text-xs font-medium">${escapeHtml(m.map)}</td>
        <td class="py-2 px-3 text-center text-xs font-mono text-white/50">${m.matches}</td>
        <td class="py-2 px-3 text-center text-xs font-mono">
          <div class="flex items-center gap-2 justify-center">
            <div class="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden"><div class="h-full ${wrBarColor} rounded-full" style="width:${m.winrate}%"></div></div>
            <span class="${m.winrate >= 50 ? 'text-green-400' : 'text-red-400'}">${m.winrate}%</span>
          </div>
        </td>
        <td class="py-2 px-3 text-center text-xs font-mono ${parseFloat(m.kd) >= 1 ? 'text-green-400' : 'text-red-400'}">${m.kd}</td>
      </tr>`;
    }).join("");

    return `
<div class="mb-4">
  <div class="${CSS.sectionTitle}">🗺️ Map Performance</div>
  <div class="${CSS.innerPanel} overflow-hidden">
    <table class="w-full" style="border-spacing:0">
      <thead><tr class="border-b border-white/10">
        <th class="py-2 px-3 text-left text-[10px] uppercase text-white/30 font-bold tracking-wider">Map</th>
        <th class="py-2 px-3 text-center text-[10px] uppercase text-white/30 font-bold tracking-wider">Games</th>
        <th class="py-2 px-3 text-center text-[10px] uppercase text-white/30 font-bold tracking-wider">Win%</th>
        <th class="py-2 px-3 text-center text-[10px] uppercase text-white/30 font-bold tracking-wider">K/D</th>
      </tr></thead>
      <tbody>${mapRows}</tbody>
    </table>
  </div>
</div>`;
  }

  /** Renders the ELO trend chart block with peak badge */
  _renderChartBlock(playerId, eloHistory, peakElo) {
    const historyJson = JSON.stringify(eloHistory || []);
    return `
<div class="mt-6 ${CSS.innerPanel} p-4 shadow-inner relative overflow-hidden group/chart">
    <div class="absolute inset-0 bg-blue-500/5 blur-xl group-hover/chart:bg-blue-500/10 transition-colors"></div>
    <div class="flex items-center justify-between mb-4 relative z-10">
        <div class="${CSS.sectionTitle}" style="margin-bottom:0">📈 ELO Trend (Last 30 Matches)</div>
        <div class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/20 text-[10px] font-mono font-bold text-yellow-400">
            ⭐ Peak: ${peakElo}
        </div>
    </div>
    <div class="h-48 w-full relative z-10">
        <canvas id="chart-${playerId}" class="elo-chart" data-history='${historyJson}'></canvas>
    </div>
</div>`;
  }

  /**
   * Renders a teammate list block.
   * @param {string} title - Section title
   * @param {Array} list - Teammate array
   * @param {string} valueKey - Key for the count value
   * @param {string} suffix - Label suffix (G, W, L)
   * @param {boolean} isLossRate - Whether to invert winrate display
   * @param {string} [titleColor] - Optional color for the title
   */
  _renderMatesBlock(title, list, valueKey, suffix, isLossRate = false, titleColor = 'white') {
    const titleColorClass = titleColor === 'green' ? 'text-green-400/60' : titleColor === 'red' ? 'text-red-400/60' : 'text-white/60';

    const items = list.map(m => {
      let percentage = parseFloat(m.winrate) || 0;
      let displayPct = percentage;
      let colorClass = percentage >= 50
        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
        : 'bg-red-500/10 text-red-400 border border-red-500/20';

      if (isLossRate) {
        displayPct = 100 - percentage;
        colorClass = displayPct >= 50
          ? 'bg-red-500/10 text-red-400 border border-red-500/20'
          : 'bg-green-500/10 text-green-400 border border-green-500/20';
      }

      return `
        <li class="${CSS.mateItem}">
            <a href="${m.url}" target="_blank" class="nickname-link text-white/70 font-medium hover:text-neon-blue transition-colors text-xs truncate">${escapeHtml(m.nickname)}</a>
            <span class="text-[10px] text-white/40 font-mono flex-shrink-0">${m[valueKey]} ${suffix} <span class="ml-1.5 px-1.5 py-0.5 rounded font-bold ${colorClass}">${displayPct}%</span></span>
        </li>`;
    }).join("");

    return `
<div class="mb-4">
  <div class="${CSS.sectionTitle} ${titleColorClass}">${title}</div>
  <ul class="${CSS.innerPanel} p-1">
    ${items}
  </ul>
</div>`;
  }
}

module.exports = new Renderer();
