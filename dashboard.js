(() => {
  "use strict";

  const state = {
    range: "daily",
    analysisPeriod: 30,
    sort: { key: "elo", direction: "desc" },
    selectedPlayers: new Set(),
    comparisonChart: null,
    detailCharts: new Map(),
    historyCachePromise: null,
    comparisonRenderId: 0,
    playerDetailCache: new Map(),
    deepDive: { playerId: null, tab: "overview", matchPage: 1, teammatePage: 1, map: "all", result: "all", query: "", mapSort: "matches", mapSortDirection: "desc", chart: null, trigger: null, filterTimer: null }
  };

  const colors = ["#ff6a2b", "#64e6a4", "#69a9ff", "#a98dff", "#ff6e7b"];
  const tableBody = document.getElementById("playerTableBody");
  const searchInput = document.getElementById("searchInput");
  const emptyState = document.getElementById("emptyState");
  const visibleCount = document.getElementById("visible-player-count");
  const filterButtons = [...document.querySelectorAll(".time-filter")];
  const sortButtons = [...document.querySelectorAll("[data-sort]")];
  const formSort = document.getElementById("formSort");
  const analysisPeriodButtons = [...document.querySelectorAll("[data-analysis-period]")];

  if (!tableBody || !searchInput) return;

  const playerRows = () => [...tableBody.querySelectorAll(".player-row")];
  const pairedDetailRow = row => tableBody.querySelector(`.details-row[data-player-id="${CSS.escape(row.dataset.playerId || "")}"]`);

  const number = (value, fallback = 0) => {
    const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const text = value => String(value ?? "").trim();

  const iconMarkup = (name, className = "ui-icon") => {
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

  const upgradeInterfaceIcons = () => {
    const awardIcons = ["target", "burst", "bolt", "trophy", "flame", "shield"];
    document.querySelectorAll(".award-card").forEach((card, index) => {
      const icon = card.querySelector(".award-icon");
      if (icon) icon.innerHTML = iconMarkup(awardIcons[index] || "trophy", "award-svg");
    });

    const headings = [
      { match: "PERFORMANCE WEB", label: "Performance Web", icon: "trend", className: "detail-performance" },
      { match: "MAP PERFORMANCE", label: "Map Performance", icon: "map", className: "detail-map" },
      { match: "ELO TREND", label: "ELO-Trend · letzte 30 Matches", icon: "trend", className: "detail-trend" },
      { match: "ELO-TREND", label: "ELO-Trend · letzte 30 Matches", icon: "trend", className: "detail-trend" },
      { match: "MOST PLAYED WITH", label: "Most played with", icon: "users", className: "detail-mates" },
      { match: "MOST WINS WITH", label: "Most wins with", icon: "trophy", className: "detail-wins" },
      { match: "MOST LOSSES WITH", label: "Most losses with", icon: "skull", className: "detail-losses" }
    ];
    document.querySelectorAll(".details-row .font-bold").forEach(element => {
      const content = text(element.textContent).toUpperCase().replace(/^\?+\s*/, "");
      const heading = headings.find(item => content.includes(item.match));
      if (!heading) return;
      element.classList.add("detail-heading", heading.className);
      const labelClass = heading.className === "detail-trend" ? ' class="trend-period-label"' : "";
      element.innerHTML = `${iconMarkup(heading.icon, "heading-svg")}<span${labelClass}>${heading.label}</span>`;
    });
  };

  const relativeTime = timestamp => {
    const seconds = Number(timestamp);
    if (!seconds) return "Keine Aktivität";
    const diff = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
    const formatter = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
    if (diff < 60) return "gerade eben";
    if (diff < 3600) return formatter.format(-Math.floor(diff / 60), "minute");
    if (diff < 86400) return formatter.format(-Math.floor(diff / 3600), "hour");
    if (diff < 604800) return formatter.format(-Math.floor(diff / 86400), "day");
    if (diff < 2592000) return formatter.format(-Math.floor(diff / 604800), "week");
    if (diff < 31536000) return formatter.format(-Math.floor(diff / 2592000), "month");
    return formatter.format(-Math.floor(diff / 31536000), "year");
  };

  const getSnapshot = row => {
    const records = window.ELO_DATA?.[state.range];
    if (!Array.isArray(records)) return null;
    return records.find(item => item.playerId === row.dataset.playerId) || null;
  };

  const updateDiffs = () => {
    playerRows().forEach(row => {
      const current = number(row.dataset.elo);
      const snapshot = getSnapshot(row);
      const diff = snapshot ? current - number(snapshot.elo, current) : 0;
      row.dataset.diff = String(diff);
      const cell = row.querySelector(".elo-diff");
      if (!cell) return;
      cell.textContent = `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(diff)}`;
      cell.classList.toggle("positive", diff > 0);
      cell.classList.toggle("negative", diff < 0);
    });
    updateSummary();
    renderGlobalInsights();
  };

  const updateSummary = () => {
    const rows = playerRows();
    if (!rows.length) return;
    const ranked = [...rows].sort((a, b) => number(b.dataset.elo) - number(a.dataset.elo));
    const climbers = [...rows].sort((a, b) => number(b.dataset.diff) - number(a.dataset.diff));
    const leader = ranked[0];
    const mvp = climbers[0];
    const drop = climbers[climbers.length - 1];
    const avg = Math.round(rows.reduce((sum, row) => sum + number(row.dataset.elo), 0) / rows.length);
    const active = rows.filter(row => row.dataset.quality === "fresh").length;
    const positiveForm = rows.filter(row => number(row.dataset.form) >= 60).length;

    setText("hero-king-name", leader.dataset.nickname || "—");
    setText("hero-king-elo", `${Math.round(number(leader.dataset.elo)).toLocaleString("de-DE")} ELO`);
    setText("hero-king-level", leader.dataset.level || "—");
    setText("hero-mvp-name", mvp.dataset.nickname || "—");
    setSignedText("hero-mvp-diff", number(mvp.dataset.diff));
    const dropValue = number(drop.dataset.diff);
    setText("hero-down-name", dropValue < 0 ? (drop.dataset.nickname || "—") : "Alle im Plus 💪");
    setSignedText("hero-down-diff", Math.min(0, dropValue));
    setText("crew-average", avg.toLocaleString("de-DE"));
    setText("squad-active-count", active);
    setText("squad-positive-form", positiveForm);
    setText("squad-top-mover", mvp.dataset.nickname || "—");
    setSignedText("squad-top-mover-diff", number(mvp.dataset.diff), " im Zeitraum");
    setSignedText("hero-king-diff", number(leader.dataset.diff));

    const progress = document.getElementById("hero-king-progress");
    if (progress) progress.style.width = `${Math.max(8, Math.min(100, (number(leader.dataset.elo) % 1000) / 10))}%`;

    const avatar = document.getElementById("hero-king-avatar");
    const rowAvatar = leader.querySelector(".ranking-avatar img")
      || (!leader.classList.contains("ranking-player-card") ? leader.querySelector("img:not(.level-badge)") : null);
    if (avatar) {
      avatar.replaceChildren();
      if (rowAvatar?.src) {
        const img = document.createElement("img");
        img.src = rowAvatar.src;
        img.alt = "";
        avatar.append(img);
      } else {
        const initials = document.createElement("span");
        initials.textContent = (leader.dataset.nickname || "U").slice(0, 2).toUpperCase();
        avatar.append(initials);
      }
    }
  };

  const setText = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  };

  const setSignedText = (id, value, suffix = "") => {
    const element = document.getElementById(id);
    if (!element) return;
    const numeric = number(value);
    element.textContent = `${numeric > 0 ? "+" : numeric < 0 ? "−" : "±"}${Math.abs(numeric)}${suffix}`;
    element.classList.toggle("positive", numeric > 0);
    element.classList.toggle("negative", numeric < 0);
  };

  const applyRanks = () => {
    playerRows().filter(row => row.style.display !== "none").forEach((row, index) => {
      row.dataset.rank = String(index + 1).padStart(2, "0");
      const rank = row.querySelector(".ranking-card-rank span");
      if (rank) rank.textContent = String(index + 1).padStart(2, "0");
      row.classList.remove("rank-tier-1", "rank-tier-2", "rank-tier-3");
      if ([0, 1, 2].includes(index)) row.classList.add(`rank-tier-${index + 1}`);
    });
  };

  const filterRows = () => {
    const query = searchInput.value.trim().toLocaleLowerCase("de");
    let count = 0;
    playerRows().forEach(row => {
      const visible = !query || (row.dataset.nickname || "").toLocaleLowerCase("de").includes(query);
      row.style.display = visible ? "" : "none";
      const details = pairedDetailRow(row);
      if (details && !visible) {
        details.classList.add("hidden");
        row.setAttribute("aria-expanded", "false");
      }
      if (visible) count += 1;
    });
    if (visibleCount) visibleCount.textContent = String(count);
    if (emptyState) emptyState.hidden = count !== 0;
    applyRanks();
  };

  const valueForSort = (row, key) => {
    if (key === "nickname") return (row.dataset.nickname || "").toLocaleLowerCase("de");
    if (key === "last") return number(row.dataset.lastTs);
    return number(row.dataset[key] ?? row.dataset.elo);
  };

  const sortRows = () => {
    const pairs = playerRows().map(row => ({ row, details: pairedDetailRow(row) }));
    const multiplier = state.sort.direction === "asc" ? 1 : -1;
    pairs.sort((a, b) => {
      const first = valueForSort(a.row, state.sort.key);
      const second = valueForSort(b.row, state.sort.key);
      if (typeof first === "string") return first.localeCompare(second, "de") * multiplier;
      return (first - second) * multiplier;
    });
    const fragment = document.createDocumentFragment();
    pairs.forEach(({ row, details }) => {
      fragment.append(row);
      if (details) fragment.append(details);
    });
    tableBody.append(fragment);
    sortButtons.forEach(button => {
      const active = button.dataset.sort === state.sort.key;
      button.classList.toggle("active", active);
      button.dataset.direction = active ? state.sort.direction : "";
    });
    filterRows();
  };

  const chartAvailable = () => typeof window.Chart === "function";

  const chartDefaults = () => {
    if (!chartAvailable()) return;
    Chart.defaults.color = "#77818e";
    Chart.defaults.font.family = '"Space Grotesk", system-ui, sans-serif';
    Chart.defaults.borderColor = "rgba(255,255,255,.06)";
  };

  const parseJSONAttribute = (element, name) => {
    try {
      return JSON.parse(element?.dataset?.[name] || "[]");
    } catch {
      return [];
    }
  };

  const renderGlobalInsights = () => {
    const container = document.getElementById("global-insights");
    if (!container) return;
    const items = [];
    for (const row of playerRows()) {
      const name = row.dataset.nickname || "Spieler";
      const streakCount = number(row.dataset.streak);
      if (row.dataset.streakType === "loss" && streakCount >= 3) items.push({ tone: "warning", icon: "↘", title: name, text: `${streakCount} Niederlagen in Folge` });
      else if (row.dataset.streakType === "win" && streakCount >= 3) items.push({ tone: "positive", icon: "↗", title: name, text: `${streakCount} Siege in Folge` });
      const gap = number(row.dataset.peak) - number(row.dataset.elo);
      if (gap >= 0 && gap <= 5) items.push({ tone: "peak", icon: "◆", title: name, text: "spielt am persönlichen Peak" });
      if (number(row.dataset.diff) >= 75) items.push({ tone: "positive", icon: "↑", title: name, text: `+${number(row.dataset.diff)} ELO im Zeitraum` });
    }
    const unique = items.filter((item, index) => items.findIndex(candidate => candidate.title === item.title && candidate.text === item.text) === index).slice(0, 4);
    container.replaceChildren();
    unique.forEach(item => {
      const article = document.createElement("article");
      article.className = `global-insight insight-${item.tone}`;
      const icon = document.createElement("span");
      icon.textContent = item.icon;
      icon.setAttribute("aria-hidden", "true");
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      const detail = document.createElement("small");
      title.textContent = item.title;
      detail.textContent = item.text;
      copy.append(title, detail);
      article.append(icon, copy);
      container.append(article);
    });
    container.hidden = !unique.length;
  };

  const normalizeHistory = (rawHistory, limit = 100) => {
    if (!Array.isArray(rawHistory)) return [];
    const normalized = rawHistory
      .map(item => {
        const rawDate = number(item?.date ?? item?.created_at ?? item?.updated_at, NaN);
        const elo = number(item?.elo ?? item?.i20, NaN);
        const date = rawDate > 1e12 ? rawDate : rawDate * 1000;
        const rawResult = item?.result ?? item?.i10;
        const rawDiff = item?.eloDiff ?? item?.elo_delta;
        const matchId = text(item?.matchId ?? item?.match_id);
        const rawMap = text(item?.map ?? item?.i1).replace(/^de_/i, "");
        return {
          x: date,
          y: elo,
          eloDiff: Number.isFinite(number(rawDiff, NaN)) ? number(rawDiff) : null,
          matchId,
          matchUrl: matchId ? `https://www.faceit.com/de/cs2/room/${encodeURIComponent(matchId)}` : "",
          map: rawMap ? rawMap.charAt(0).toUpperCase() + rawMap.slice(1) : "",
          score: text(item?.score ?? item?.i18),
          result: rawResult === "W" || rawResult === "L" ? rawResult : String(rawResult) === "1" ? "W" : String(rawResult) === "0" ? "L" : ""
        };
      })
      .filter(point => Number.isFinite(point.x) && Number.isFinite(point.y))
      .sort((a, b) => a.x - b.x)
      .filter((point, index, points) => index === 0 || point.x !== points[index - 1].x);
    return normalized.slice(-limit);
  };

  const loadHistoryCache = async () => {
    if (!state.historyCachePromise) {
      state.historyCachePromise = fetch("data/history-cache.json", { cache: "no-store" })
        .then(response => response.ok ? response.json() : {})
        .catch(() => ({}));
    }
    return state.historyCachePromise;
  };

  const resolveHistory = async (playerId, embeddedHistory, limit) => {
    const embedded = normalizeHistory(embeddedHistory, limit);
    const cache = await loadHistoryCache();
    const cached = normalizeHistory(cache?.[playerId], limit);
    const cachedMetadata = cached.filter(point => point.matchId || point.map || point.result).length;
    if (cached.length >= 2 && (cachedMetadata || embedded.length < 2)) return cached;
    return embedded;
  };

  const toMatchSeries = (history, limit = 30) => history
    .slice(-limit)
    .map((point, index) => ({
      x: index + 1,
      y: point.y,
      date: point.x,
      eloDiff: point.eloDiff,
      matchId: point.matchId,
      matchUrl: point.matchUrl,
      map: point.map,
      score: point.score,
      result: point.result
    }));

  const formatChartDate = timestamp => timestamp
    ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "short", year: "2-digit" }).format(new Date(timestamp))
    : "";

  const matchTooltipCallbacks = {
    title: items => items.length ? `Match ${items[0].parsed.x} / ${items[0].dataset.data.length}` : "",
    label: context => {
      const point = context.raw || {};
      const delta = Number.isFinite(point.eloDiff) ? ` · ${point.eloDiff > 0 ? "+" : ""}${point.eloDiff}` : "";
      const prefix = context.dataset.label ? ` ${context.dataset.label}: ` : "";
      return `${prefix}${context.parsed.y} ELO${delta}`;
    },
    afterLabel: context => {
      const point = context.raw || {};
      return [
        [point.result, point.map, point.score].filter(Boolean).join(" · "),
        formatChartDate(point.date)
      ].filter(Boolean);
    },
    footer: items => items.some(item => item.raw?.matchUrl) ? "Klicken, um das FACEIT-Match zu öffnen" : ""
  };

  const openChartMatch = (event, elements, chart) => {
    const element = elements[0];
    const point = element ? chart.data.datasets[element.datasetIndex]?.data?.[element.index] : null;
    if (point?.matchUrl) window.open(point.matchUrl, "_blank", "noopener,noreferrer");
  };

  const showDetailFallback = (canvas, message) => {
    if (!canvas) return;
    canvas.hidden = true;
    const parent = canvas.parentElement;
    if (!parent) return;
    let fallback = parent.querySelector(".detail-chart-fallback");
    if (!fallback) {
      fallback = document.createElement("p");
      fallback.className = "detail-chart-fallback";
      parent.append(fallback);
    }
    fallback.textContent = message;
  };

  const renderDetailCharts = async details => {
    if (!chartAvailable() || !details) return;
    const period = number(details.dataset.analysisPeriod, state.analysisPeriod);

    const lineCanvas = details.querySelector(".elo-chart");
    if (lineCanvas && !state.detailCharts.has(lineCanvas)) {
      const history = toMatchSeries(await resolveHistory(
        details.dataset.playerId,
        parseJSONAttribute(lineCanvas, "history"),
        period
      ), period);
      if (history.length >= 2) {
        lineCanvas.hidden = false;
        lineCanvas.dataset.pointCount = String(history.length);
        lineCanvas.dataset.axisMode = "match";
        state.detailCharts.set(lineCanvas, new Chart(lineCanvas, {
          type: "line",
          data: {
            datasets: [{
              data: history,
              borderColor: "#ff6a2b",
              backgroundColor: "rgba(255,106,43,.08)",
              fill: true,
              borderWidth: 2,
              pointRadius: 0,
              pointHoverRadius: 4,
              tension: .34,
              cubicInterpolationMode: "monotone"
            }]
          },
          options: detailChartOptions(period)
        }));
      } else {
        showDetailFallback(lineCanvas, "Noch nicht genügend ELO-Verlaufsdaten vorhanden.");
      }
    }

    const radarCanvas = details.querySelector(".radar-chart");
    if (radarCanvas && !state.detailCharts.has(radarCanvas)) {
      const radar = parseJSONAttribute(radarCanvas, "radar");
      if (Array.isArray(radar.labels) && radar.labels.length) {
        state.detailCharts.set(radarCanvas, new Chart(radarCanvas, {
          type: "radar",
          data: {
            labels: radar.labels,
            datasets: [{
              data: radar.data,
              borderColor: "#69a9ff",
              backgroundColor: "rgba(105,169,255,.12)",
              borderWidth: 2,
              pointRadius: 2
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                displayColors: false,
                callbacks: { label: context => `${context.formattedValue}% Winrate` }
              }
            },
            scales: {
              r: {
                min: 0, max: 100,
                angleLines: { color: "rgba(255,255,255,.06)" },
                grid: { color: "rgba(255,255,255,.06)" },
                pointLabels: { color: "#8993a0", font: { size: 9 } },
                ticks: { display: false }
              }
            }
          }
        }));
      }
    }
  };

  const detailChartOptions = (period = state.analysisPeriod) => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        displayColors: false,
        callbacks: {
          ...matchTooltipCallbacks
        }
      }
    },
    onClick: openChartMatch,
    scales: {
      x: { type: "linear", min: 1, max: period, display: false },
      y: { grid: { color: "rgba(255,255,255,.055)" }, ticks: { maxTicksLimit: 5, font: { size: 9 } } }
    }
  });

  const toggleDetails = row => {
    const details = pairedDetailRow(row);
    if (!details) return;
    const opening = details.classList.contains("hidden");
    playerRows().forEach(other => {
      if (other === row) return;
      other.setAttribute("aria-expanded", "false");
      pairedDetailRow(other)?.classList.add("hidden");
    });
    details.classList.toggle("hidden", !opening);
    row.setAttribute("aria-expanded", String(opening));
    if (opening) requestAnimationFrame(() => void renderDetailCharts(details));
  };

  const normalizeStreakDisplay = row => {
    if (row.classList.contains("ranking-player-card")) return;
    const formLine = row.querySelector(".player-form")
      || row.querySelector(".nickname-link")?.closest(".flex-col")?.querySelector(".mt-1");
    if (!formLine) return;

    row.querySelectorAll(".streak-indicator").forEach(indicator => indicator.remove());
    const nicknameLine = row.querySelector(".nickname-link")?.parentElement;
    [...(nicknameLine?.children || [])].forEach(child => {
      if (child !== row.querySelector(".nickname-link") && child.tagName === "SPAN") child.remove();
    });

    const count = Math.max(0, Number.parseInt(row.dataset.streak) || 0);
    const type = row.dataset.streakType;
    if (count < 2 || (type !== "win" && type !== "loss")) return;

    const indicator = document.createElement("span");
    indicator.className = `streak-indicator ${type === "win" ? "streak-win" : "streak-loss"}`;
    indicator.textContent = `${count}${type === "win" ? "W" : "L"}`;
    indicator.title = `${count} ${type === "win" ? "Siege" : "Niederlagen"} in Folge`;
    formLine.append(indicator);
  };

  const playerData = playerId => (Array.isArray(window.COMPARISON_DATA) ? window.COMPARISON_DATA : [])
    .find(player => player.id === playerId);

  const periodData = (player, period = state.analysisPeriod) => {
    if (!player) return {};
    return player.periods?.[String(period)] || player.periods?.["30"] || player;
  };

  const calculateBestThirty = history => {
    const points = normalizeHistory(history, 100);
    let gain = 0;
    points.forEach((point, index) => {
      if (index + 29 >= points.length) return;
      const end = points[index + 29];
      gain = Math.max(gain, end.y - point.y);
    });
    return gain;
  };

  const enhancePlayerAnalytics = row => {
    const details = pairedDetailRow(row);
    if (!details) return;
    const player = playerData(row.dataset.playerId) || {};
    const history = player.history || [];
    const eloSamples = number(player.dataQuality?.eloSamples, normalizeHistory(history).length);
    const lastMatchTimestamp = number(row.dataset.lastTs);
    const matchAgeHours = lastMatchTimestamp
      ? Math.max(0, (Date.now() / 1000 - lastMatchTimestamp) / 3600)
      : Infinity;
    const freshness = matchAgeHours <= 7 * 24
      ? { status: "fresh", label: "Match innerhalb 1 Woche", title: "Letztes Match innerhalb der vergangenen 7 Tage" }
      : matchAgeHours <= 30 * 24
        ? { status: "aging", label: "Match älter als 1 Woche", title: "Letztes Match liegt zwischen 7 und 30 Tagen zurück" }
        : {
            status: "stale",
            label: lastMatchTimestamp ? "Match älter als 1 Monat" : "Keine Matchdaten",
            title: lastMatchTimestamp ? "Letztes Match liegt mehr als 30 Tage zurück" : "Kein Match-Datum verfügbar"
          };
    details.querySelectorAll(".share-player").forEach(button => button.remove());
    const existingStatus = details.querySelector(".player-analytics .data-status");
    if (existingStatus) {
      existingStatus.classList.remove("status-fresh", "status-aging", "status-stale", "status-partial");
      existingStatus.classList.add(`status-${freshness.status}`);
      existingStatus.innerHTML = `<i></i>${freshness.label}`;
      existingStatus.title = freshness.title;
      row.dataset.quality = freshness.status;
    }
    const existingAnalytics = details.querySelector(".player-analytics");
    if (existingAnalytics) {
      const setCardScope = (label, scope, append = false) => {
        const card = [...existingAnalytics.querySelectorAll(".personal-bests article")]
          .find(article => text(article.querySelector("span")?.textContent) === label);
        if (!card) return;
        let small = card.querySelector("small");
        if (!small) {
          small = document.createElement("small");
          card.append(small);
        }
        small.textContent = append && text(small.textContent)
          ? `${text(small.textContent).replace(/\s*\u00b7\s*letzte 30 Matches$/i, "")} \u00b7 ${scope}`
          : scope;
      };
      setCardScope("Peak ELO", `Aus ${eloSamples} ELO-Werten`);
      setCardScope("L\u00e4ngste Serie", "Letzte 30 Matches");
      setCardScope("Beste Map", "letzte 30 Matches", true);
      setCardScope("Beste 30er-Phase", `ELO \u00b7 aus ${eloSamples} Werten`);
      [...existingAnalytics.querySelectorAll(".player-insight strong")]
        .filter(element => text(element.textContent) === "Beste Map")
        .forEach(element => element.textContent = "Beste Map \u00b7 letzte 30 Matches");
      return;
    }
    const peak = Math.max(number(row.dataset.peak), ...normalizeHistory(history).map(point => point.y));
    const bestGain = calculateBestThirty(history);
    const formWins = number(row.dataset.formWins);
    const formTotal = number(row.dataset.formTotal);
    const analytics = document.createElement("div");
    analytics.className = "player-analytics";
    analytics.innerHTML = `
      <div class="player-analytics-head">
        <div><span class="data-status status-${freshness.status}" title="${freshness.title}"><i></i>${freshness.label}</span><small>${normalizeHistory(history).length} ELO-Werte geprüft</small></div>
      </div>
      <div class="personal-bests">
        <article><span>Peak ELO</span><strong>${peak || number(row.dataset.elo)}</strong><small>Verfügbarer ELO-Verlauf</small></article>
        <article><span>Aktuelle Serie</span><strong>${text(row.dataset.streak) || "—"}</strong><small>Letzte 30 Matches</small></article>
        <article data-form-card><span>Letzte 5 Matches</span><strong>${formTotal ? `${formWins}/${formTotal}` : "—"}</strong><small>${formTotal ? `${number(row.dataset.form)}% Siege` : "Keine Daten"}</small></article>
        <article><span>Beste 30er-Phase</span><strong>${bestGain > 0 ? "+" : ""}${bestGain}</strong><small>ELO · verfügbarer Verlauf</small></article>
      </div>
      <div class="insight-grid"></div>`;
    const primaryColumn = [...(details.querySelector("td > div")?.children || [])]
      .find(element => element.querySelector(".elo-chart"));
    primaryColumn?.prepend(analytics);
  };

  const syncFormCard = row => {
    const analytics = pairedDetailRow(row)?.querySelector(".player-analytics .personal-bests");
    if (!analytics || analytics.querySelector("[data-form-card]")) return;
    const wins = number(row.dataset.formWins);
    const total = number(row.dataset.formTotal);
    const card = document.createElement("article");
    card.dataset.formCard = "";
    card.innerHTML = `<span>Letzte 5 Matches</span><strong>${total ? `${wins}/${total}` : "—"}</strong><small>${total ? `${number(row.dataset.form)}% Siege` : "Keine Daten"}</small>`;
    analytics.append(card);
  };

  const updateMapRows = (details, maps) => {
    const body = details.querySelector("[data-map-rows]");
    if (!body) return;
    body.replaceChildren();
    const validMaps = Array.isArray(maps) ? maps.filter(map => map.map !== "Unknown") : [];
    if (!validMaps.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.className = "py-4 px-3 text-center text-xs text-white/40";
      cell.textContent = "Keine Map-Daten für diesen Zeitraum verfügbar.";
      row.append(cell);
      body.append(row);
      return;
    }
    validMaps.forEach(map => {
      const row = document.createElement("tr");
      row.className = "border-b border-white/5 last:border-0";
      const values = [map.map, map.matches, `${map.winrate}%`, map.kd];
      values.forEach((value, index) => {
        const cell = document.createElement("td");
        cell.className = index
          ? "py-2 px-3 text-center text-xs font-mono text-white/50"
          : "py-2 px-3 text-white/80 text-xs font-medium";
        if (index === 2) cell.className += number(map.winrate) >= 50 ? " text-green-400" : " text-red-400";
        if (index === 3) cell.className += number(map.kd) >= 1 ? " text-green-400" : " text-red-400";
        cell.textContent = String(value ?? "—");
        row.append(cell);
      });
      body.append(row);
    });
  };

  const updateMateLists = (details, teammates) => {
    const lists = {
      played: [...(teammates || [])].sort((a, b) => number(b.count) - number(a.count)),
      wins: [...(teammates || [])].sort((a, b) => number(b.wins) - number(a.wins)),
      losses: [...(teammates || [])].sort((a, b) => number(b.losses) - number(a.losses))
    };
    Object.entries(lists).forEach(([kind, mates]) => {
      const list = details.querySelector(`[data-mate-list="${kind}"]`);
      if (!list) return;
      list.replaceChildren();
      mates.slice(0, 5).forEach(mate => {
        const item = document.createElement("li");
        item.className = "flex justify-between items-center py-2 border-b border-white/5 last:border-0 hover:bg-white/5 px-2 rounded transition-colors";
        const link = document.createElement("a");
        link.className = "nickname-link text-white/70 font-medium hover:text-neon-blue transition-colors text-xs";
        link.textContent = mate.nickname || "—";
        if (/^https:\/\//i.test(mate.url || "")) {
          link.href = mate.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        const value = kind === "played" ? number(mate.count) : number(mate[kind]);
        const suffix = kind === "played" ? "G" : kind === "wins" ? "W" : "L";
        const rate = kind === "losses" ? 100 - number(mate.winratePct) : number(mate.winratePct);
        const meta = document.createElement("span");
        meta.className = "text-[10px] text-white/40 font-mono";
        meta.textContent = `${value} ${suffix} · ${rate}%`;
        item.append(link, meta);
        list.append(item);
      });
      if (!list.children.length) {
        const empty = document.createElement("li");
        empty.className = "py-3 px-2 text-xs text-white/40";
        empty.textContent = "Keine Daten für diesen Zeitraum.";
        list.append(empty);
      }
    });
  };

  const updatePlayerPeriod = row => {
    const details = pairedDetailRow(row);
    const player = playerData(row.dataset.playerId);
    if (!player) return;
    const period = state.analysisPeriod;
    const data = periodData(player, period);
    const recent = data.recent || {};
    const quality = data.dataQuality || {};
    const personal = data.personalBests || {};
    const performance = data.performanceProfile || {};
    const last5 = Array.isArray(data.last5) ? data.last5 : [];
    const wins = last5.filter(result => result === "W").length;
    const cardValues = {
      kd: recent.kd ?? "0.00",
      adr: recent.adr ?? "0.0",
      winrate: `${number(recent.winratePct)}%`,
      hs: recent.hsPercent ?? "0%",
      consistency: `${number(performance.consistency)}%`,
      form: last5.length ? `${wins}/${last5.length}` : "—",
      streak: number(data.streak?.count) ? `${number(data.streak.count)}${data.streak.type === "win" ? "W" : "L"}` : "—"
    };
    Object.entries(cardValues).forEach(([key, value]) => {
      const target = row.querySelector(`[data-card-stat="${key}"]`);
      if (target) target.textContent = String(value);
    });
    const formLine = row.querySelector(".player-form");
    if (formLine && row.classList.contains("ranking-player-card")) {
      formLine.replaceChildren(...last5.map(result => {
        const dot = document.createElement("i");
        dot.className = `form-dot ${result === "W" ? "win" : "loss"}`;
        dot.setAttribute("aria-label", result === "W" ? "Sieg" : "Niederlage");
        return dot;
      }));
    }
    row.dataset.kd = String(number(recent.kd));
    row.dataset.adr = String(number(recent.adr));
    row.dataset.winrate = String(number(recent.winratePct));
    row.dataset.formWins = String(wins);
    row.dataset.formTotal = String(last5.length);
    row.dataset.form = String(last5.length ? Math.round(wins / last5.length * 100) : 0);
    row.dataset.consistency = String(number(performance.consistency));
    row.dataset.role = text(performance.role?.label || "Allrounder");
    const roleLabel = row.querySelector("[data-card-role]");
    if (roleLabel) roleLabel.textContent = row.dataset.role;
    row.dataset.streak = cardValues.streak;
    row.dataset.streakType = data.streak?.type || "none";
    if (!details) return;
    const available = number(quality.historyMatches, number(recent.matches));
    const analyzed = number(quality.analyzedMatches, number(recent.matches));
    const eloSamples = number(quality.eloSamples, (data.history || []).length);

    details.dataset.analysisPeriod = String(period);
    const coverage = details.querySelector(".analysis-coverage");
    if (coverage) {
      coverage.textContent = available < period
        ? `${available} Matches verfügbar · ${analyzed} ausgewertet · Ziel ${period}`
        : `${analyzed} von ${period} Matches ausgewertet · ${number(quality.matchCoverage)}% Abdeckung`;
    }

    const updateBest = (name, value, scope) => {
      const card = details.querySelector(`[data-best="${name}"]`);
      if (!card) return;
      const strong = card.querySelector("strong");
      const small = card.querySelector("small");
      if (strong) strong.textContent = value;
      if (small) small.textContent = scope;
    };
    const bestMap = personal.bestMap;
    const gain = number(personal.bestThirtyGain);
    updateBest("peak", String(number(personal.peakElo, number(row.dataset.elo))), `Peak in den letzten ${period} Matches · ${eloSamples} ELO-Werte`);
    updateBest("streak", `${number(personal.longestWinStreak)}W`, `Letzte ${period} Matches`);
    updateBest("map", bestMap?.map || "—", bestMap ? `${bestMap.winrate}% WR · letzte ${period} Matches` : `Letzte ${period} Matches`);
    updateBest("gain", `${gain > 0 ? "+" : ""}${gain}`, `Beste zusammenhängende 30er-Phase im ${period}er-Fenster`);
    updateBest("form", last5.length ? `${wins}/${last5.length}` : "—", last5.length ? `${Math.round(wins / last5.length * 100)}% Siege` : "Keine Daten");

    const statValues = {
      kd: recent.kd ?? "0.00",
      kr: recent.kr ?? "0.00",
      "avg-kills": number(recent.matches) ? Math.round(number(recent.kills) / number(recent.matches)) : 0,
      hs: recent.hsPercent ?? "0%",
      kills: number(recent.kills),
      assists: number(recent.assists),
      deaths: number(recent.deaths),
      adr: recent.adr ?? "0.0"
    };
    Object.entries(statValues).forEach(([key, value]) => {
      const target = details.querySelector(`[data-stat="${key}"]`);
      if (target) target.textContent = String(value);
    });
    const performanceLabel = details.querySelector(".performance-period-label");
    const performanceCopy = performanceLabel?.querySelector("span");
    if (performanceCopy) performanceCopy.textContent = `Performance (letzte ${period})`;

    updateMapRows(details, data.mapPerformance);
    const radarCanvas = details.querySelector(".radar-chart");
    if (radarCanvas) {
      const maps = (data.mapPerformance || []).filter(map => map.map !== "Unknown");
      radarCanvas.dataset.radar = JSON.stringify({ labels: maps.map(map => map.map), data: maps.map(map => map.winrate) });
    }
    const lineCanvas = details.querySelector(".elo-chart");
    if (lineCanvas) lineCanvas.dataset.history = JSON.stringify(data.history || []);
    const trendLabel = details.querySelector(".trend-period-label");
    if (trendLabel) trendLabel.textContent = `ELO-Trend · letzte ${period} Matches`;

    const insightGrid = details.querySelector(".insight-grid");
    if (insightGrid) {
      insightGrid.replaceChildren();
      (data.insights || []).slice(0, 4).forEach(insight => {
        const article = document.createElement("article");
        article.className = `player-insight insight-${text(insight.type)}`;
        const icon = document.createElement("span");
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = insight.icon || "•";
        const copy = document.createElement("div");
        const title = document.createElement("strong");
        const detail = document.createElement("small");
        title.textContent = insight.title || "Hinweis";
        detail.textContent = insight.text || "";
        copy.append(title, detail);
        article.append(icon, copy);
        insightGrid.append(article);
      });
      if (!insightGrid.children.length) {
        const empty = document.createElement("p");
        empty.className = "analytics-empty";
        empty.textContent = `Keine belastbare Auffälligkeit in den letzten ${period} Matches.`;
        insightGrid.append(empty);
      }
    }
    updateMateLists(details, data.teammates);

    details.querySelectorAll("canvas").forEach(canvas => {
      state.detailCharts.get(canvas)?.destroy();
      state.detailCharts.delete(canvas);
      canvas.hidden = false;
      canvas.parentElement?.querySelector(".detail-chart-fallback")?.remove();
    });
    if (!details.classList.contains("hidden")) requestAnimationFrame(() => void renderDetailCharts(details));
  };

  const setupRows = () => {
    document.querySelectorAll(".last-match-cell").forEach(cell => {
      const absolute = cell.textContent.trim();
      cell.textContent = relativeTime(cell.dataset.ts);
      cell.title = absolute;
    });
    playerRows().forEach(row => {
      const playerResults = playerData(row.dataset.playerId)?.last5;
      const formLine = row.querySelector(".player-form")
        || row.querySelector(".nickname-link")?.closest(".flex-col")?.querySelector(".mt-1");
      const inferredResults = [...(formLine?.querySelectorAll(":scope > div") || [])]
        .map(dot => dot.classList.contains("bg-green-400") ? "W" : "L");
      const results = Array.isArray(playerResults) && playerResults.length ? playerResults.slice(0, 5) : inferredResults.slice(0, 5);
      const wins = results.filter(result => result === "W").length;
      row.dataset.formWins = String(wins);
      row.dataset.formTotal = String(results.length);
      row.dataset.form = String(results.length ? Math.round(wins / results.length * 100) : 0);
      normalizeStreakDisplay(row);
      enhancePlayerAnalytics(row);
      syncFormCard(row);
      updatePlayerPeriod(row);
      row.tabIndex = 0;
      row.setAttribute("role", "button");
      row.setAttribute("aria-expanded", "false");
      row.setAttribute("aria-label", `${row.dataset.nickname || "Spieler"}: Details öffnen`);
      row.addEventListener("click", event => {
        if (event.target.closest("a")) return;
        openPlayerDeepDive(row);
      });
      row.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openPlayerDeepDive(row);
        }
      });
      row.querySelectorAll("a[target='_blank']").forEach(link => link.rel = "noopener noreferrer");
    });
  };

  const setupFilters = () => {
    filterButtons.forEach(button => button.addEventListener("click", () => {
      state.range = button.dataset.val || "daily";
      filterButtons.forEach(item => {
        const active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      updateDiffs();
      if (state.sort.key === "diff") sortRows();
    }));
    searchInput.addEventListener("input", filterRows);
    document.addEventListener("keydown", event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.focus();
      }
      if (event.key === "Escape" && document.activeElement === searchInput) {
        searchInput.value = "";
        filterRows();
        searchInput.blur();
      }
    });
  };

  const setupSorting = () => {
    sortButtons.forEach(button => button.addEventListener("click", () => {
      const key = button.dataset.sort;
      if (!key) return;
      if (state.sort.key === key) {
        state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
      } else {
        state.sort.key = key;
        state.sort.direction = key === "nickname" ? "asc" : "desc";
      }
      sortRows();
    }));
    formSort?.addEventListener("change", () => {
      state.sort.key = formSort.value;
      state.sort.direction = "desc";
      sortRows();
    });
  };

  const createComparisonChips = () => {
    const container = document.getElementById("comparison-chips");
    const data = Array.isArray(window.COMPARISON_DATA) ? window.COMPARISON_DATA : [];
    if (!container || !data.length) return;
    data.forEach((player, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "comparison-chip";
      button.dataset.playerId = player.id;
      button.style.setProperty("--chip-color", colors[index % colors.length]);
      button.setAttribute("aria-pressed", "false");

      if (player.avatar) {
        const img = document.createElement("img");
        img.src = player.avatar;
        img.alt = "";
        img.loading = "lazy";
        img.addEventListener("error", () => img.remove());
        button.append(img);
      } else {
        const avatar = document.createElement("span");
        avatar.className = "chip-avatar";
        avatar.textContent = text(player.nickname).slice(0, 1).toUpperCase();
        button.append(avatar);
      }
      const label = document.createElement("span");
      label.textContent = player.nickname;
      button.append(label);
      button.addEventListener("click", () => {
        const id = player.id;
        if (state.selectedPlayers.has(id)) state.selectedPlayers.delete(id);
        else if (state.selectedPlayers.size < 5) state.selectedPlayers.add(id);
        button.classList.toggle("active", state.selectedPlayers.has(id));
        button.setAttribute("aria-pressed", String(state.selectedPlayers.has(id)));
        void renderComparison();
      });
      container.append(button);
    });
  };

  const renderPeriodAwards = () => {
    const players = Array.isArray(window.COMPARISON_DATA) ? window.COMPARISON_DATA : [];
    const candidates = players.map(player => ({ player, data: periodData(player) }));
    const best = (selector, fallback = 0) => candidates.reduce((winner, candidate) =>
      selector(candidate.data) > selector(winner.data) ? candidate : winner,
    candidates[0] || { player: { nickname: "—" }, data: {} });
    const lowest = candidates
      .filter(candidate => number(candidate.data.recent?.matches) > 0)
      .reduce((winner, candidate) =>
        number(candidate.data.recent?.deaths, Infinity) < number(winner.data?.recent?.deaths, Infinity) ? candidate : winner,
      null);
    const awardValues = [
      [best(data => number(data.recent?.kd)), data => `${number(data.recent?.kd).toFixed(2)} K/D`],
      [best(data => number(data.recent?.hsPercent)), data => `${number(data.recent?.hsPercent)}%`],
      [best(data => number(data.recent?.adr)), data => `${number(data.recent?.adr).toFixed(1)} ADR`],
      [best(data => number(data.recent?.winratePct)), data => `${number(data.recent?.winratePct)}% WR`],
      [best(data => data.streak?.type === "win" ? number(data.streak.count) : 0), data => `${number(data.streak?.count)}W`],
      [lowest || { player: { nickname: "—" }, data: {} }, data => `${number(data.recent?.deaths)} Deaths`]
    ];
    document.querySelectorAll("#awards-grid .award-card").forEach((card, index) => {
      const [candidate, formatter] = awardValues[index] || [];
      if (!candidate) return;
      const lines = card.querySelectorAll(".award-copy p");
      if (lines[1]) lines[1].textContent = candidate.player.nickname || "—";
      if (lines[2]) lines[2].textContent = formatter(candidate.data);
    });
  };

  const setupAnalysisPeriod = () => {
    analysisPeriodButtons.forEach(button => button.addEventListener("click", () => {
      const period = number(button.dataset.analysisPeriod, 30);
      if (![30, 60, 100].includes(period) || period === state.analysisPeriod) return;
      state.analysisPeriod = period;
      analysisPeriodButtons.forEach(item => {
        const active = number(item.dataset.analysisPeriod) === period;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", String(active));
      });
      const copy = document.getElementById("analysis-period-copy");
      if (copy) copy.textContent = `Letzte ${period} Matches`;
      const awardLabel = document.querySelector("#awards-title span");
      if (awardLabel) awardLabel.textContent = `(letzte ${period} Matches)`;
      const comparisonLabel = document.getElementById("comparison-period-label");
      if (comparisonLabel) comparisonLabel.textContent = `Letzte ${period} Matches`;
      playerRows().forEach(updatePlayerPeriod);
      updateSummary();
      renderPeriodAwards();
      void renderComparison();
    }));
  };

  const comparisonValue = (player, key) => {
    const row = playerRows().find(candidate => candidate.dataset.playerId === player.id);
    const data = periodData(player);
    if (key === "elo") return number(player.elo, number(row?.dataset.elo));
    if (key === "winrate") return number(data.recent?.winratePct, number(row?.dataset.winrate));
    if (key === "kd") return number(data.recent?.kd, number(row?.dataset.kd));
    if (key === "adr") return number(data.recent?.adr, number(row?.dataset.adr));
    if (key === "form") return (data.last5 || []).length
      ? (data.last5 || []).filter(result => result === "W").length / data.last5.length * 100
      : 0;
    return 0;
  };

  const commonMatches = (first, second) => {
    const firstIds = first.matchIds || periodData(first).matchIds || [];
    const secondIds = second.matchIds || periodData(second).matchIds || [];
    const ids = new Set(firstIds.filter(Boolean));
    return secondIds.filter(matchId => ids.has(matchId)).length;
  };

  const renderComparisonMetrics = selected => {
    const container = document.getElementById("comparison-metrics");
    if (!container) return;
    container.replaceChildren();
    if (!selected.length) return;
    const table = document.createElement("table");
    table.innerHTML = `<thead><tr><th>Spieler</th><th>ELO</th><th>Winrate</th><th>K/D</th><th>ADR</th><th>Letzte 5</th><th>Gemeinsame Matches</th></tr></thead>`;
    const body = document.createElement("tbody");
    selected.forEach(player => {
      const shared = Math.max(...selected.filter(other => other.id !== player.id).map(other => commonMatches(player, other)), 0);
      const row = document.createElement("tr");
      const values = [
        player.nickname,
        Math.round(comparisonValue(player, "elo")).toLocaleString("de-DE"),
        `${comparisonValue(player, "winrate").toFixed(0)}%`,
        comparisonValue(player, "kd").toFixed(2),
        comparisonValue(player, "adr").toFixed(1),
        `${comparisonValue(player, "form").toFixed(0)}%`,
        String(shared)
      ];
      values.forEach((value, index) => {
        const cell = document.createElement(index ? "td" : "th");
        cell.textContent = value;
        if (!index) cell.scope = "row";
        row.append(cell);
      });
      body.append(row);
    });
    table.append(body);
    container.append(table);
  };

  const renderComparison = async () => {
    const canvas = document.getElementById("comparison-chart");
    const fallback = document.getElementById("chartFallback");
    const data = Array.isArray(window.COMPARISON_DATA) ? window.COMPARISON_DATA : [];
    const selectedPlayers = data
      .filter(player => state.selectedPlayers.has(player.id))
      .map(player => ({ ...player, ...periodData(player) }));
    renderComparisonMetrics(selectedPlayers);
    const renderId = ++state.comparisonRenderId;
    state.comparisonChart?.destroy();
    state.comparisonChart = null;

    if (!canvas || !selectedPlayers.length || !chartAvailable()) {
      if (canvas) canvas.hidden = true;
      if (fallback) {
        fallback.hidden = false;
        fallback.textContent = !selectedPlayers.length
          ? "Wähle mindestens einen Spieler für den ELO-Vergleich aus."
          : chartAvailable()
            ? "Für den Vergleich sind noch keine Verlaufsdaten verfügbar."
            : "Das Diagramm konnte nicht geladen werden. Die Ranking-Daten bleiben vollständig verfügbar.";
      }
      return;
    }

    canvas.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      fallback.textContent = "Verlaufsdaten werden geladen …";
    }

    const selected = (await Promise.all(selectedPlayers.map(async player => ({
      ...player,
      points: toMatchSeries(await resolveHistory(player.id, player.history, state.analysisPeriod), state.analysisPeriod)
    })))).filter(player => player.points.length >= 2);
    if (renderId !== state.comparisonRenderId) return;

    if (!selected.length) {
      if (fallback) fallback.textContent = "Für den Vergleich sind noch keine Verlaufsdaten verfügbar.";
      return;
    }

    canvas.hidden = false;
    canvas.dataset.pointCounts = selected.map(player => player.points.length).join(",");
    canvas.dataset.axisMode = "match";
    if (fallback) {
      fallback.hidden = true;
      fallback.textContent = "";
    }
    state.comparisonChart = new Chart(canvas, {
      type: "line",
      data: {
        datasets: selected.map((player, index) => ({
          label: player.nickname,
          data: player.points,
          borderColor: colors[index % colors.length],
          backgroundColor: colors[index % colors.length],
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: .34,
          cubicInterpolationMode: "monotone"
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: "nearest", axis: "x", intersect: false },
        plugins: {
          legend: { position: "top", align: "start", labels: { usePointStyle: true, boxWidth: 7, boxHeight: 7, padding: 18, font: { size: 10 } } },
          tooltip: {
            displayColors: true,
            callbacks: matchTooltipCallbacks
          }
        },
        onClick: openChartMatch,
        scales: {
          x: {
            type: "linear",
            min: 1,
            max: state.analysisPeriod,
            grid: { color: "rgba(255,255,255,.035)" },
            title: { display: true, text: `Letzte ${state.analysisPeriod} Matches →`, color: "#606a78", font: { size: 9 } },
            ticks: { maxTicksLimit: 10, precision: 0, font: { size: 9 } }
          },
          y: { grid: { color: "rgba(255,255,255,.055)" }, ticks: { maxTicksLimit: 6, font: { size: 9 } } }
        }
      }
    });
  };

  const escapeUi = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const safeHttp = value => {
    try {
      const url = new URL(String(value || ""), window.location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
    } catch {
      return "#";
    }
  };

  const flagMarkup = value => {
    const code = text(value).toLowerCase();
    if (!/^[a-z]{2}$/.test(code)) return '<span class="flag-fallback" aria-label="Land unbekannt">●</span>';
    return `<img class="country-flag" src="https://flagcdn.com/24x18/${code}.png" srcset="https://flagcdn.com/48x36/${code}.png 2x" width="24" height="18" alt="Länderflagge ${escapeUi(code.toUpperCase())}" loading="lazy">`;
  };

  const countryName = value => {
    const code = text(value).toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return "Unbekannt";
    try {
      return new Intl.DisplayNames(["de"], { type: "region" }).of(code) || code;
    } catch {
      return code;
    }
  };

  const formatMatchDate = value => {
    const direct = Number(value);
    const numeric = Number.isFinite(direct) && direct > 0 ? direct : Date.parse(String(value || ""));
    if (!Number.isFinite(numeric) || numeric <= 0) return "—";
    return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })
      .format(new Date(numeric * (numeric > 1e12 ? 1 : 1000)));
  };

  const detailPeriodData = detail => detail?.periods?.[String(state.analysisPeriod)] || detail?.periods?.["30"] || {};
  const detailMatches = detail => (detail?.matches || []).slice(0, state.analysisPeriod);

  const loadPlayerDetail = async playerId => {
    if (state.playerDetailCache.has(playerId)) return state.playerDetailCache.get(playerId);
    const request = fetch(`data/players/${encodeURIComponent(playerId)}.json`, { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`Player data ${response.status}`);
        return response.json();
      });
    state.playerDetailCache.set(playerId, request);
    try {
      const detail = await request;
      state.playerDetailCache.set(playerId, detail);
      return detail;
    } catch (error) {
      state.playerDetailCache.delete(playerId);
      throw error;
    }
  };

  const renderDeepOverview = (detail, content) => {
    const profile = detail.profile || {};
    const data = detailPeriodData(detail);
    const recent = data.recent || {};
    const personal = data.personalBests || {};
    const performance = data.performanceProfile || {};
    const role = performance.role || { label: "Allrounder", description: "Ausgeglichenes Leistungsprofil" };
    const quality = data.dataQuality || {};
    const history = (detail.history || []).slice(-state.analysisPeriod);
    const levelStarts = [0, 100, 501, 751, 901, 1051, 1201, 1351, 1531, 1751, 2001];
    const currentLevel = Math.max(1, Math.min(10, number(profile.level, 1)));
    const floor = levelStarts[currentLevel];
    const ceiling = currentLevel === 10 ? Math.max(number(profile.elo), floor) : levelStarts[currentLevel + 1];
    const progress = currentLevel === 10 ? 100 : Math.max(0, Math.min(100, (number(profile.elo) - floor) / Math.max(1, ceiling - floor) * 100));
    const created = profile.createdAt ? formatMatchDate(profile.createdAt) : "—";
    const insights = (data.insights || []).filter(insight => insight.type !== "map").slice(0, 4).map(insight => `
      <article class="deep-insight"><span>${escapeUi(insight.icon || "•")}</span><div><strong>${escapeUi(insight.title || "Hinweis")}</strong><small>${escapeUi(insight.text || "")}</small></div></article>`).join("");
    content.innerHTML = `
      <section class="deep-kpis" aria-label="Leistungskennzahlen der letzten ${state.analysisPeriod} Matches">
        <article><span>K/D Ratio</span><strong>${escapeUi(recent.kd || "0.00")}</strong><small>${number(recent.kills)} Kills · ${number(recent.deaths)} Deaths</small></article>
        <article><span>ADR</span><strong>${escapeUi(recent.adr || "0.0")}</strong><small>${number(recent.assists)} Assists · ${number(recent.matches)} Matches</small></article>
        <article class="deep-winrate"><span>Winrate</span><strong>${number(recent.winratePct)}%</strong><i style="--value:${number(recent.winratePct)}"></i><small>${number(recent.wins)} Siege</small></article>
        <article><span>Current ELO</span><strong>${number(profile.elo).toLocaleString("de-DE")}</strong><small>Peak ${number(personal.peakElo, profile.elo).toLocaleString("de-DE")}</small></article>
      </section>
      <section class="deep-profile-strip" aria-label="Rollen- und Impact-Profil">
        <article class="profile-role"><span>Rollenprofil</span><strong>${escapeUi(role.label)}</strong><small>${escapeUi(role.description)}</small></article>
        <article><span>Konstanz</span><strong>${number(performance.consistency)}%</strong><small>Streuung von K/D, ADR und ELO</small></article>
        <article><span>Entry Success</span><strong>${number(recent.entrySuccess)}%</strong><small>${number(recent.entryWins)} gewonnene Entries</small></article>
        <article><span>Clutches</span><strong>${number(recent.clutches)}</strong><small>${number(performance.clutchesPerMatch).toFixed(2)} pro Match</small></article>
        <article><span>Utility / Match</span><strong>${number(performance.utilityPerMatch)}</strong><small>${number(recent.utilityDamage)} Damage gesamt</small></article>
      </section>
      <section class="deep-overview-grid">
        <article class="deep-level-card">
          <div><span>FACEIT Fortschritt</span><strong>Level ${currentLevel}</strong></div>
          <div class="level-progress"><i style="width:${progress}%"></i></div>
          <small>${currentLevel === 10 ? "Höchstes FACEIT-Level erreicht" : `${number(profile.elo)} / ${ceiling} ELO bis Level ${currentLevel + 1}`}</small>
          <div class="level-scale">${Array.from({ length: 10 }, (_, index) => `<span class="${index + 1 <= currentLevel ? "reached" : ""}">${index + 1}</span>`).join("")}</div>
        </article>
        <article class="deep-facts-card">
          <span>Account & Daten</span>
          <dl>
            <div><dt>Region</dt><dd>${escapeUi(text(profile.region).toUpperCase() || "—")}</dd></div>
            <div><dt>Land</dt><dd class="country-value">${flagMarkup(profile.country)}<span>${escapeUi(countryName(profile.country))}</span></dd></div>
            <div><dt>FACEIT seit</dt><dd>${escapeUi(created)}</dd></div>
            <div><dt>Lifetime Matches</dt><dd>${number(profile.lifetimeMatches).toLocaleString("de-DE")}</dd></div>
            <div><dt>Datenabdeckung</dt><dd>${number(quality.matchCoverage)}%</dd></div>
            <div><dt>Letztes Match</dt><dd>${escapeUi(relativeTime(profile.lastMatchTs))}</dd></div>
          </dl>
        </article>
      </section>
      <section class="deep-trend-card">
        <div><span>ELO-Verlauf</span><small>Letzte ${state.analysisPeriod} Matches · ${history.length} Werte</small></div>
        <div class="deep-chart-wrap"><canvas id="deepDiveTrend" aria-label="ELO-Verlauf von ${escapeUi(profile.nickname)}"></canvas><p class="deep-chart-empty" hidden>Zu wenig Verlaufsdaten.</p></div>
      </section>
      <section class="deep-insights">${insights || '<p class="deep-empty">Keine belastbare Auffälligkeit in diesem Zeitraum.</p>'}</section>`;

    state.deepDive.chart?.destroy();
    state.deepDive.chart = null;
    const canvas = content.querySelector("#deepDiveTrend");
    const empty = content.querySelector(".deep-chart-empty");
    if (!chartAvailable() || history.length < 2) {
      if (canvas) canvas.hidden = true;
      if (empty) empty.hidden = false;
      return;
    }
    state.deepDive.chart = new Chart(canvas, {
      type: "line",
      data: { labels: history.map((_, index) => index + 1), datasets: [{ data: history.map(point => number(point.elo)), borderColor: "#ff642e", backgroundColor: "rgba(255,100,46,.12)", fill: true, borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 4, tension: .34, cubicInterpolationMode: "monotone" }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false } }, interaction: { mode: "index", intersect: false }, scales: { x: { grid: { display: false }, ticks: { color: "#6f6b64", maxTicksLimit: 8 } }, y: { grid: { color: "rgba(17,16,15,.12)" }, ticks: { color: "#6f6b64", maxTicksLimit: 5 } } } }
    });
  };

  const renderDeepMatches = (detail, content) => {
    const all = detailMatches(detail);
    const maps = [...new Set(all.map(match => match.map).filter(Boolean))].sort();
    const normalizedQuery = state.deepDive.query.toLocaleLowerCase("de");
    const filtered = all.filter(match => (state.deepDive.map === "all" || match.map === state.deepDive.map)
      && (state.deepDive.result === "all" || match.result === state.deepDive.result)
      && (!normalizedQuery || `${match.map} ${match.score}`.toLocaleLowerCase("de").includes(normalizedQuery)));
    const pageSize = 15;
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    state.deepDive.matchPage = Math.min(state.deepDive.matchPage, pages);
    const page = filtered.slice((state.deepDive.matchPage - 1) * pageSize, state.deepDive.matchPage * pageSize);
    const rows = page.map(match => `<tr>
      <td><span class="match-result result-${match.result === "W" ? "win" : "loss"}">${match.result === "W" ? "Sieg" : "Niederlage"}</span></td>
      <td>${escapeUi(formatMatchDate(match.date))}</td><td><strong>${escapeUi(match.map || "Unknown")}</strong></td><td>${escapeUi(match.score || "—")}</td>
      <td>${number(match.kills)}</td><td>${number(match.assists)}</td><td>${number(match.deaths)}</td>
      <td class="${number(match.kills) - number(match.deaths) >= 0 ? "positive" : "negative"}">${number(match.kills) - number(match.deaths) > 0 ? "+" : ""}${number(match.kills) - number(match.deaths)}</td>
      <td>${number(match.kd).toFixed(2)}</td><td>${number(match.adr).toFixed(1)}</td><td>${number(match.hsPercent).toFixed(0)}%</td>
      <td class="${number(match.eloDiff) >= 0 ? "positive" : "negative"}">${Number.isFinite(Number(match.eloDiff)) ? `${number(match.eloDiff) > 0 ? "+" : ""}${number(match.eloDiff)}` : "—"}</td>
      <td><a class="match-link" href="${escapeUi(safeHttp(match.matchUrl))}" target="_blank" rel="noopener noreferrer" aria-label="Match auf FACEIT öffnen">↗</a></td>
    </tr>`).join("");
    content.innerHTML = `
      <section class="deep-section-head"><div><span>Match Explorer</span><h3>Die letzten ${state.analysisPeriod} Matches</h3></div><p>${filtered.length} von ${all.length} Matches</p></section>
      <div class="match-filters">
        <label><span>Suche</span><input type="search" data-match-query value="${escapeUi(state.deepDive.query)}" placeholder="Map oder Score"></label>
        <label><span>Map</span><select data-match-map><option value="all">Alle Maps</option>${maps.map(map => `<option value="${escapeUi(map)}" ${map === state.deepDive.map ? "selected" : ""}>${escapeUi(map)}</option>`).join("")}</select></label>
        <label><span>Ergebnis</span><select data-match-result><option value="all">Alle</option><option value="W" ${state.deepDive.result === "W" ? "selected" : ""}>Siege</option><option value="L" ${state.deepDive.result === "L" ? "selected" : ""}>Niederlagen</option></select></label>
      </div>
      <div class="deep-table-scroll"><table class="deep-table match-table"><thead><tr><th>Resultat</th><th>Datum</th><th>Map</th><th>Score</th><th>K</th><th>A</th><th>D</th><th>+/-</th><th>K/D</th><th>ADR</th><th>HS</th><th>ELO</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="13" class="deep-empty">Keine Matches für diesen Filter.</td></tr>'}</tbody></table></div>
      <div class="deep-pagination"><button type="button" data-match-page="prev" ${state.deepDive.matchPage === 1 ? "disabled" : ""}>← Zurück</button><span>Seite ${state.deepDive.matchPage} von ${pages}</span><button type="button" data-match-page="next" ${state.deepDive.matchPage === pages ? "disabled" : ""}>Weiter →</button></div>`;
    content.querySelector("[data-match-query]")?.addEventListener("input", event => {
      const query = event.target.value;
      window.clearTimeout(state.deepDive.filterTimer);
      state.deepDive.filterTimer = window.setTimeout(() => {
        state.deepDive.query = query;
        state.deepDive.matchPage = 1;
        renderDeepDive();
        const next = content.querySelector("[data-match-query]");
        next?.focus();
        next?.setSelectionRange(query.length, query.length);
      }, 180);
    });
    content.querySelector("[data-match-map]")?.addEventListener("change", event => { state.deepDive.map = event.target.value; state.deepDive.matchPage = 1; renderDeepDive(); });
    content.querySelector("[data-match-result]")?.addEventListener("change", event => { state.deepDive.result = event.target.value; state.deepDive.matchPage = 1; renderDeepDive(); });
    content.querySelectorAll("[data-match-page]").forEach(button => button.addEventListener("click", () => { state.deepDive.matchPage += button.dataset.matchPage === "next" ? 1 : -1; renderDeepDive(); }));
  };

  const renderDeepMaps = (detail, content) => {
    const maps = [...(detailPeriodData(detail).mapPerformance || [])].filter(map => map.map !== "Unknown");
    const sortKey = state.deepDive.mapSort;
    const direction = state.deepDive.mapSortDirection === "asc" ? 1 : -1;
    maps.sort((first, second) => {
      if (sortKey === "map") return text(first.map).localeCompare(text(second.map), "de") * direction;
      return (number(first[sortKey]) - number(second[sortKey])) * direction;
    });
    const rows = maps.map(map => `<tr><td><strong>${escapeUi(map.map)}</strong></td><td>${number(map.matches)}</td><td>${number(map.wins)}</td><td>${number(map.losses)}</td><td class="${number(map.winrate) >= 50 ? "positive" : "negative"}">${number(map.winrate)}%</td><td>${escapeUi(map.avgKills || "0.0")}</td><td>${escapeUi(map.avgDeaths || "0.0")}</td><td class="${number(map.kdDiff) >= 0 ? "positive" : "negative"}">${number(map.kdDiff) > 0 ? "+" : ""}${escapeUi(map.kdDiff || "0.0")}</td><td>${escapeUi(map.hsPercent || 0)}%</td><td>${escapeUi(map.kr || "0.00")}</td><td>${escapeUi(map.kd || "0.00")}</td><td>${escapeUi(map.adr || "0.0")}</td><td class="map-advanced">${number(map.entrySuccess)}%</td><td class="map-advanced">${number(map.clutches)}</td><td class="map-advanced">${number(map.multikills)}</td><td class="map-advanced">${number(map.utilityDamage)}</td></tr>`).join("");
    const heading = (label, key, advanced = false) => `<th class="${advanced ? "map-advanced" : ""}"><button type="button" data-map-sort="${key}" class="${sortKey === key ? "active" : ""}">${label}${sortKey === key ? (direction > 0 ? " ↑" : " ↓") : ""}</button></th>`;
    content.innerHTML = `<section class="deep-section-head"><div><span>Map Intelligence</span><h3>Performance nach Map</h3></div><button class="advanced-toggle" type="button">Advanced Stats</button></section><div class="deep-table-scroll"><table class="deep-table map-insights-table"><thead><tr>${heading("Map", "map")}${heading("M", "matches")}${heading("W", "wins")}${heading("L", "losses")}${heading("WR", "winrate")}${heading("Ø K", "avgKills")}${heading("Ø D", "avgDeaths")}${heading("+/-", "kdDiff")}${heading("HS", "hsPercent")}${heading("K/R", "kr")}${heading("K/D", "kd")}${heading("ADR", "adr")}${heading("Entry", "entrySuccess", true)}${heading("Clutches", "clutches", true)}${heading("Multis", "multikills", true)}${heading("Utility", "utilityDamage", true)}</tr></thead><tbody>${rows || '<tr><td colspan="16" class="deep-empty">Keine Map-Daten vorhanden.</td></tr>'}</tbody></table></div>`;
    content.querySelector(".advanced-toggle")?.addEventListener("click", event => { content.querySelector(".map-insights-table")?.classList.toggle("show-advanced"); event.currentTarget.classList.toggle("active"); });
    content.querySelectorAll("[data-map-sort]").forEach(button => button.addEventListener("click", () => {
      const key = button.dataset.mapSort;
      state.deepDive.mapSortDirection = state.deepDive.mapSort === key && state.deepDive.mapSortDirection === "desc" ? "asc" : "desc";
      state.deepDive.mapSort = key;
      renderDeepDive();
    }));
  };

  const renderDeepTeammates = (detail, content) => {
    const teammates = [...(detailPeriodData(detail).teammates || [])].sort((a, b) => number(b.count) - number(a.count));
    const tracked = new Map((window.COMPARISON_DATA || []).map(player => [player.id, player]));
    const pageSize = 25;
    const pages = Math.max(1, Math.ceil(teammates.length / pageSize));
    state.deepDive.teammatePage = Math.min(state.deepDive.teammatePage, pages);
    const start = (state.deepDive.teammatePage - 1) * pageSize;
    const page = teammates.slice(start, start + pageSize);
    const rows = page.map(mate => {
      const trackedPlayer = tracked.get(mate.playerId);
      const avatarUrl = trackedPlayer?.avatar || mate.avatar;
      const fallback = escapeUi(text(mate.nickname).slice(0, 2).toUpperCase() || "?");
      return `<tr><td><span class="teammate-avatar"><span class="avatar-fallback">${fallback}</span>${avatarUrl ? `<img src="${escapeUi(safeHttp(avatarUrl))}" alt="" loading="lazy" decoding="async">` : ""}</span><strong>${escapeUi(mate.nickname || "—")}</strong></td><td>${number(mate.count)}</td><td class="positive">${number(mate.wins)}</td><td class="negative">${number(mate.losses)}</td><td class="${number(mate.winratePct) >= 50 ? "positive" : "negative"}">${number(mate.winratePct)}%</td><td>${trackedPlayer ? `<button class="teammate-open" type="button" data-open-player="${escapeUi(mate.playerId)}">Analyse →</button>` : `<a class="match-link" href="${escapeUi(safeHttp(mate.url))}" target="_blank" rel="noopener noreferrer">↗</a>`}</td></tr>`;
    }).join("");
    const rangeStart = teammates.length ? start + 1 : 0;
    const rangeEnd = Math.min(start + pageSize, teammates.length);
    content.innerHTML = `<section class="deep-section-head"><div><span>Team Chemistry</span><h3>Häufigste Teammates</h3></div><p>${rangeStart}–${rangeEnd} von ${teammates.length} · letzte ${state.analysisPeriod} Matches</p></section><div class="deep-table-scroll"><table class="deep-table teammate-table"><thead><tr><th>Teammate</th><th>Matches</th><th>Wins</th><th>Losses</th><th>Winrate</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="deep-empty">Keine gemeinsamen Matches vorhanden.</td></tr>'}</tbody></table></div><div class="deep-pagination"><button type="button" data-teammate-page="prev" ${state.deepDive.teammatePage === 1 ? "disabled" : ""}>← Zurück</button><span>Seite ${state.deepDive.teammatePage} von ${pages}</span><button type="button" data-teammate-page="next" ${state.deepDive.teammatePage === pages ? "disabled" : ""}>Weiter →</button></div>`;
    content.querySelectorAll(".teammate-avatar img").forEach(image => image.addEventListener("error", () => image.remove()));
    content.querySelectorAll("[data-open-player]").forEach(button => button.addEventListener("click", () => openPlayerDeepDive(playerRows().find(row => row.dataset.playerId === button.dataset.openPlayer))));
    content.querySelectorAll("[data-teammate-page]").forEach(button => button.addEventListener("click", () => {
      state.deepDive.teammatePage += button.dataset.teammatePage === "next" ? 1 : -1;
      renderDeepDive();
    }));
  };

  const renderDeepHighlights = (detail, content) => {
    const matches = detailMatches(detail);
    const bestMap = detailPeriodData(detail).personalBests?.bestMap;
    const pick = selector => matches.reduce((best, match) => !best || selector(match) > selector(best) ? match : best, null);
    const multikills = match => number(match.doubleKills) + number(match.tripleKills) + number(match.quadKills) + number(match.pentaKills);
    const highlights = [
      ["Bestes K/D", pick(match => number(match.kd)), match => number(match.kd).toFixed(2), "🎯"],
      ["Meiste Kills", pick(match => number(match.kills)), match => `${number(match.kills)} Kills`, "⚡"],
      ["Höchstes ADR", pick(match => number(match.adr)), match => `${number(match.adr).toFixed(1)} ADR`, "📈"],
      ["Clutch Match", pick(match => number(match.clutches)), match => `${number(match.clutches)} Clutches`, "🛡"],
      ["Entry Impact", pick(match => number(match.entryWins)), match => `${number(match.entryWins)} Entry Wins`, "🚪"],
      ["Multikill Match", pick(multikills), match => `${multikills(match)} Multikills`, "💥"],
      ["Größter ELO-Gewinn", pick(match => number(match.eloDiff, -999)), match => `${number(match.eloDiff) > 0 ? "+" : ""}${number(match.eloDiff)} ELO`, "◆"]
    ].filter(([, match]) => match);
    const bestMapCard = bestMap ? `<article class="highlight-card"><span>⌖</span><small>Beste Map</small><strong>${escapeUi(bestMap.map)}</strong><p>${number(bestMap.winrate)}% Winrate · ${number(bestMap.matches)} Matches</p></article>` : "";
    content.innerHTML = `<section class="deep-section-head"><div><span>Performance Highlights</span><h3>Bestleistungen der letzten ${state.analysisPeriod} Matches</h3></div></section><div class="highlight-grid">${bestMapCard}${highlights.map(([label, match, format, icon]) => `<a class="highlight-card" href="${escapeUi(safeHttp(match.matchUrl))}" target="_blank" rel="noopener noreferrer"><span>${icon}</span><small>${escapeUi(label)}</small><strong>${escapeUi(format(match))}</strong><p>${escapeUi(match.map || "Unknown")} · ${escapeUi(formatMatchDate(match.date))} · ${escapeUi(match.score || "—")}</p><b>Match öffnen ↗</b></a>`).join("") || '<p class="deep-empty">Keine Match-Highlights vorhanden.</p>'}</div>`;
  };

  const renderDeepDive = () => {
    const modal = document.getElementById("playerDeepDive");
    const content = document.getElementById("deepDiveContent");
    const detail = state.playerDetailCache.get(state.deepDive.playerId);
    if (!modal || !content || !detail || detail instanceof Promise) return;
    modal.querySelectorAll("[data-deep-tab]").forEach(button => {
      const active = button.dataset.deepTab === state.deepDive.tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    modal.querySelectorAll("[data-deep-period]").forEach(button => button.classList.toggle("active", number(button.dataset.deepPeriod) === state.analysisPeriod));
    state.deepDive.chart?.destroy();
    state.deepDive.chart = null;
    window.clearTimeout(state.deepDive.filterTimer);
    if (state.deepDive.tab === "matches") renderDeepMatches(detail, content);
    else if (state.deepDive.tab === "maps") renderDeepMaps(detail, content);
    else if (state.deepDive.tab === "teammates") renderDeepTeammates(detail, content);
    else if (state.deepDive.tab === "highlights") renderDeepHighlights(detail, content);
    else renderDeepOverview(detail, content);
  };

  const closePlayerDeepDive = () => {
    const modal = document.getElementById("playerDeepDive");
    if (!modal || modal.hidden) return;
    state.deepDive.chart?.destroy();
    state.deepDive.chart = null;
    modal.hidden = true;
    document.body.classList.remove("deep-dive-open");
    state.deepDive.trigger?.focus?.();
  };

  const openPlayerDeepDive = async row => {
    if (!row) return;
    const modal = document.getElementById("playerDeepDive");
    const content = document.getElementById("deepDiveContent");
    const player = playerData(row.dataset.playerId);
    if (!modal || !content || !player) return;
    state.deepDive.playerId = player.id;
    state.deepDive.tab = "overview";
    state.deepDive.matchPage = 1;
    state.deepDive.teammatePage = 1;
    state.deepDive.map = "all";
    state.deepDive.result = "all";
    state.deepDive.query = "";
    state.deepDive.mapSort = "matches";
    state.deepDive.mapSortDirection = "desc";
    state.deepDive.trigger = document.activeElement;
    setText("deepDiveName", player.nickname || "Spieler-Analyse");
    const country = document.getElementById("deepDiveCountry");
    if (country) country.innerHTML = `${flagMarkup(player.country)}<span>${escapeUi(countryName(player.country))}</span>`;
    const avatar = document.getElementById("deepDiveAvatar");
    if (avatar) avatar.innerHTML = player.avatar ? `<img src="${escapeUi(safeHttp(player.avatar))}" alt="">` : escapeUi(text(player.nickname).slice(0, 1).toUpperCase());
    const meta = document.getElementById("deepDiveMeta");
    if (meta) meta.innerHTML = `<img src="icons/levels/level_${Math.max(1, Math.min(10, number(player.level, 1)))}_icon.png" alt=""><span>Level ${number(player.level)}</span><strong>${number(player.elo).toLocaleString("de-DE")} ELO</strong>`;
    const faceit = document.getElementById("deepDiveFaceit");
    if (faceit) faceit.href = safeHttp(player.faceitUrl);
    modal.hidden = false;
    document.body.classList.add("deep-dive-open");
    content.innerHTML = '<div class="deep-dive-loading"><span></span><p>Spielerdaten werden geladen …</p></div>';
    modal.querySelector(".deep-dive-close")?.focus();
    try {
      await loadPlayerDetail(player.id);
      if (state.deepDive.playerId === player.id && !modal.hidden) renderDeepDive();
    } catch {
      if (state.deepDive.playerId === player.id) content.innerHTML = '<div class="deep-load-error"><strong>Spielerdaten konnten nicht geladen werden.</strong><p>Bitte lade die Seite neu oder versuche es später erneut.</p></div>';
    }
  };

  const setupDeepDive = () => {
    const modal = document.getElementById("playerDeepDive");
    if (!modal) return;
    modal.querySelectorAll("[data-deep-close]").forEach(button => button.addEventListener("click", closePlayerDeepDive));
    modal.querySelectorAll("[data-deep-tab]").forEach(button => button.addEventListener("click", () => {
      state.deepDive.tab = button.dataset.deepTab || "overview";
      state.deepDive.teammatePage = 1;
      renderDeepDive();
    }));
    modal.querySelectorAll("[data-deep-period]").forEach(button => button.addEventListener("click", () => {
      const period = number(button.dataset.deepPeriod, 30);
      document.querySelector(`[data-analysis-period="${period}"]`)?.click();
      state.deepDive.matchPage = 1;
      state.deepDive.teammatePage = 1;
      renderDeepDive();
    }));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && !modal.hidden) closePlayerDeepDive();
    });
  };

  const waitForCharts = (attempt = 0) => {
    if (chartAvailable()) {
      chartDefaults();
      void renderComparison();
      return;
    }
    if (attempt < 30) window.setTimeout(() => waitForCharts(attempt + 1), 100);
    else void renderComparison();
  };

  createComparisonChips();
  waitForCharts();
  upgradeInterfaceIcons();
  document.getElementById("dashboard-toast")?.remove();
  setupRows();
  setupFilters();
  setupSorting();
  setupAnalysisPeriod();
  setupDeepDive();
  updateDiffs();
  sortRows();
  renderPeriodAwards();

})();
