const leaderboardBody = document.querySelector("#leaderboard-body");
const leaderboardHead = document.querySelector("#leaderboard-head");
const matchGrid = document.querySelector("#match-grid");
const memberCount = document.querySelector("#member-count");
const profileMemberCount = document.querySelector("#profile-member-count");
const historyLink = document.querySelector("#history-link");
const playerView = document.querySelector("#player-view");
const historyView = document.querySelector("#history-view");
const playerTitle = document.querySelector("#player-title");
const playerProfileCard = document.querySelector("#player-profile-card");
const playerStatGrid = document.querySelector("#player-stat-grid");
const ratingGraph = document.querySelector("#rating-graph");
const analyticsGrid = document.querySelector("#analytics-grid");
const matchupSummary = document.querySelector("#matchup-summary");
const matchupTable = document.querySelector("#matchup-table");
const playerMatchList = document.querySelector("#player-match-list");
const discordProfileLink = document.querySelector("#discord-profile-link");
const mainSections = [
  document.querySelector(".toolbar"),
  document.querySelector(".leaderboard-card")
];
const statButtons = [...document.querySelectorAll("[data-stat]")];
const activeStats = new Set(["mmr", "wl", "winRate"]);
const refreshIntervalMs = 30000;
let isGithubPagesHost = false;
let refreshTimer = null;
let refreshInFlight = false;
const statDefinitions = [
  { key: "mmr", label: "MMR", value: (player) => player.rating },
  { key: "wl", label: "W/L", value: (player) => `${player.wins} - ${player.losses}` },
  { key: "wins", label: "Wins", value: (player) => player.wins },
  { key: "losses", label: "Losses", value: (player) => player.losses },
  { key: "games", label: "Games", value: (player) => player.matches },
  { key: "mvps", label: "MVPs", value: (player) => player.mvpCount ?? 0 },
  { key: "streak", label: "Streak", value: (player) => currentStreak(playerHistory(player)).label },
  { key: "peakMmr", label: "Peak MMR", value: (player) => peakMmr(player) },
  { key: "peakStreak", label: "Peak Streak", value: (player) => bestStreak(playerHistory(player).matches, true) },
  { key: "winRate", label: "Win Rate", value: (player) => `${player.winRate.toFixed(1)}%`, pill: true }
];

const state = {
  servers: [],
  serverId: "default",
  players: [],
  matches: [],
  playerById: new Map()
};

try {
  isGithubPagesHost = window.location.hostname.endsWith("github.io");
  await initializeData(isGithubPagesHost);
  wireStatButtons();
  renderRoute();
  window.addEventListener("hashchange", renderRoute);
  startAutoRefresh();
} catch (error) {
  console.error(error);
  leaderboardBody.innerHTML = `<tr><td colspan="5" class="empty">Could not load leaderboard data.</td></tr>`;
  matchGrid.innerHTML = `<article class="match-card empty-card">Could not load match history.</article>`;
}

async function initializeData(isGithubPages) {
  const requestedServerId = routeParams().get("server");
  if (requestedServerId) {
    await loadServerData(requestedServerId);
    return;
  }

  state.servers = [{ id: "default", name: "ELO Game Que" }];
  state.serverId = "default";
  const leaderboardSources = isGithubPages
    ? ["data/leaderboard.json", "/api/leaderboard"]
    : ["/api/leaderboard", "data/leaderboard.json"];
  const matchSources = isGithubPages
    ? ["data/matches.json", "/api/matches"]
    : ["/api/matches", "data/matches.json"];
  const [leaderboard, history] = await Promise.all([
    fetchJson(leaderboardSources),
    fetchJson(matchSources)
  ]);
  applyData(leaderboard, history);
}

function startAutoRefresh() {
  window.clearInterval(refreshTimer);
  refreshTimer = window.setInterval(refreshCurrentData, refreshIntervalMs);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshCurrentData();
  });
}

async function refreshCurrentData() {
  if (refreshInFlight) return;
  refreshInFlight = true;

  try {
    const serverId = routeParams().get("server");
    if (serverId) {
      await loadServerData(serverId);
    } else {
      await loadDefaultData(isGithubPagesHost);
    }
    renderRoute({ scroll: false });
  } catch (error) {
    console.warn("Could not refresh leaderboard data.", error);
  } finally {
    refreshInFlight = false;
  }
}

async function loadDefaultData(isGithubPages) {
  state.servers = [{ id: "default", name: "ELO Game Que" }];
  state.serverId = "default";
  const leaderboardSources = isGithubPages
    ? ["data/leaderboard.json", "/api/leaderboard"]
    : ["/api/leaderboard", "data/leaderboard.json"];
  const matchSources = isGithubPages
    ? ["data/matches.json", "/api/matches"]
    : ["/api/matches", "data/matches.json"];
  const [leaderboard, history] = await Promise.all([
    fetchJson(leaderboardSources),
    fetchJson(matchSources)
  ]);
  applyData(leaderboard, history);
}

async function loadServerData(serverId) {
  const base = `data/servers/${encodeURIComponent(serverId)}`;
  const [leaderboard, history] = await Promise.all([
    fetchJson([`${base}/leaderboard.json`]),
    fetchJson([`${base}/matches.json`])
  ]);
  state.serverId = serverId;
  applyData(leaderboard, history);
}

function applyData(leaderboard, history) {
  state.players = leaderboard.players ?? [];
  state.matches = history.matches ?? [];
  state.playerById = new Map(state.players.map((player) => [player.userId, player]));

  renderLeaderboard(state.players);
  renderMatches(state.matches);
  memberCount.textContent = `${state.players.length.toLocaleString()} players`;
  profileMemberCount.textContent = `${state.players.length.toLocaleString()} players`;
  historyLink.href = routeHash({ view: "history" });
  document.querySelectorAll(".back-link").forEach((link) => {
    link.href = routeHash();
  });
}

async function fetchJson(paths, options = {}) {
  for (const path of paths) {
    try {
      const response = await fetch(cacheBustPath(path), { cache: "no-store" });
      if (response.ok) return response.json();
    } catch {
      // Try the next source.
    }
  }

  if (options.optional) return null;
  throw new Error(`Could not load any of: ${paths.join(", ")}`);
}

function cacheBustPath(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}t=${Date.now()}`;
}

function renderRoute({ scroll = true } = {}) {
  const params = routeParams();
  const nextServerId = params.get("server");
  if (nextServerId && nextServerId !== state.serverId) {
    loadServerData(nextServerId).then(() => {
      renderRoute({ scroll });
    }).catch((error) => {
      console.error(error);
      leaderboardBody.innerHTML = `<tr><td colspan="5" class="empty">Could not load this server's leaderboard.</td></tr>`;
      matchGrid.innerHTML = `<article class="match-card empty-card">Could not load this server's match history.</article>`;
    });
    return;
  }

  const playerId = params.get("player");
  const player = playerId ? state.playerById.get(playerId) : null;
  const isHistory = params.get("view") === "history" || window.location.hash === "#history";

  if (player) {
    mainSections.forEach((section) => {
      section.hidden = true;
    });
    historyView.hidden = true;
    playerView.hidden = false;
    renderPlayerView(player);
    if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  if (isHistory) {
    mainSections.forEach((section) => {
      section.hidden = true;
    });
    playerView.hidden = true;
    historyView.hidden = false;
    if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }

  playerView.hidden = true;
  historyView.hidden = true;
  mainSections.forEach((section) => {
    section.hidden = false;
  });
}

function routeParams() {
  return new URLSearchParams(window.location.hash.slice(1));
}

function routeHash(params = {}) {
  const route = new URLSearchParams({
    server: state.serverId,
    ...params
  });
  return `#${route.toString()}`;
}

function renderLeaderboard(players) {
  renderLeaderboardHeader();

  if (players.length === 0) {
    leaderboardBody.innerHTML = `<tr><td colspan="${activeColumnCount()}" class="empty">No rated players yet.</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = players.map(playerRow).join("");
}

function renderLeaderboardHeader() {
  leaderboardHead.innerHTML = `
    <th>Rank</th>
    <th>Player</th>
    ${visibleStats().map((stat) => `<th class="numeric">${stat.label}</th>`).join("")}
  `;
}

function playerRow(player) {
  const medal = ["crown", "silver", "bronze"][player.rank - 1] ?? "";
  const highlight = ["gold-row", "silver-row", "bronze-row"][player.rank - 1] ?? "";
  return `
    <tr class="${highlight}">
      <td class="rank-cell">
        <span class="medal ${medal}">${player.rank <= 3 ? "" : "#"}</span>
        <strong>#${player.rank}</strong>
      </td>
      <td>
        <a class="player-cell player-link" href="${playerProfileUrl(player.userId)}">
          ${avatar(player)}
          <strong>${escapeHtml(player.name)}</strong>
        </a>
      </td>
      ${visibleStats().map((stat) => statCell(stat, player)).join("")}
    </tr>
  `;
}

function statCell(stat, player) {
  const value = stat.value(player);
  const content = stat.pill ? `<span class="win-pill">${escapeHtml(value)}</span>` : escapeHtml(value);
  const ratingClass = stat.key === "mmr" ? " rating" : "";
  return `<td class="numeric${ratingClass}">${content}</td>`;
}

function visibleStats() {
  return statDefinitions.filter((stat) => activeStats.has(stat.key));
}

function activeColumnCount() {
  return 2 + visibleStats().length;
}

function wireStatButtons() {
  for (const button of statButtons) {
    button.addEventListener("click", () => {
      const stat = button.dataset.stat;
      if (activeStats.has(stat)) {
        if (activeStats.size === 1) return;
        activeStats.delete(stat);
      } else {
        activeStats.add(stat);
      }

      syncStatButtons();
      renderLeaderboard(state.players);
    });
  }
  syncStatButtons();
}

function syncStatButtons() {
  for (const button of statButtons) {
    const isActive = activeStats.has(button.dataset.stat);
    button.classList.toggle("active", isActive);
    button.classList.toggle("muted", !isActive);
    button.setAttribute("aria-pressed", String(isActive));
  }
}

function renderMatches(matches) {
  if (matches.length === 0) {
    matchGrid.innerHTML = `<article class="match-card empty-card">No completed matches yet.</article>`;
    return;
  }

  matchGrid.innerHTML = matches.map(matchCard).join("");
}

function matchCard(match) {
  const queueNumber = match.queueNumber ?? match.id;
  return `
    <article class="match-card">
      <header>
        <div>
          <h2>ELO Game Que - Match #${queueNumber}</h2>
          <time>${formatDate(match.confirmedAt)}</time>
        </div>
        <a class="mini-button" href="#">Leaderboard</a>
      </header>
      <div class="match-sides">
        ${sideCard(match.winner === "blue", match.blue)}
        ${sideCard(match.winner === "red", match.red)}
      </div>
    </article>
  `;
}

function sideCard(didWin, players) {
  return `
    <div class="side-card ${didWin ? "winner" : "loser"}">
      <div class="side-title">
        <strong>${didWin ? "Winner" : "Loser"}</strong>
        <span></span>
      </div>
      ${players.map((player) => playerDelta(player, didWin)).join("")}
    </div>
  `;
}

function playerDelta(player, didWin) {
  const sign = player.delta > 0 ? "+" : "";
  return `
    <div class="delta-row">
      <a href="${playerProfileUrl(player.userId)}">${escapeHtml(player.name)}</a>
      <strong class="${didWin ? "positive" : "negative"}">${sign}${player.delta.toFixed(1)}</strong>
    </div>
  `;
}

function renderPlayerView(player) {
  const history = playerHistory(player);
  const streak = currentStreak(history);
  const peakRating = Math.max(player.rating, ...history.points.map((point) => point.rating));
  const lastFive = history.matches.slice(-5);
  const lastFiveWins = lastFive.filter((match) => match.didWin).length;
  const avgGain = average(lastFive.filter((match) => match.delta > 0).map((match) => match.delta));
  const avgLoss = average(lastFive.filter((match) => match.delta < 0).map((match) => match.delta));
  const matchups = matchupAnalysis(player, history.matches);

  playerTitle.textContent = player.name;
  discordProfileLink.href = discordProfileUrl(player.userId);
  playerProfileCard.innerHTML = `
    ${avatar(player)}
    <div>
      <strong>${escapeHtml(player.name)}</strong>
      <span>${player.matches} games &middot; ${player.rating} points</span>
    </div>
  `;

  playerStatGrid.innerHTML = [
    metric("Rank", `#${player.rank}`),
    metric("MMR", player.rating),
    metric("W/L", `${player.wins} - ${player.losses}`),
    metric("Peak MMR", peakRating),
    metric("Wins", player.wins),
    metric("Losses", player.losses),
    metric("MVPs", player.mvpCount ?? 0),
    metric("Streak", streak.label),
    metric("Games", player.matches)
  ].join("");

  ratingGraph.innerHTML = ratingGraphSvg(history.points);
  analyticsGrid.innerHTML = [
    analysisCard("Last 5 Games", `${lastFiveWins}W - ${lastFive.length - lastFiveWins}L`, "positive"),
    analysisCard("Best Win Streak", bestStreak(history.matches, true), "positive"),
    analysisCard("Worst Loss Streak", bestStreak(history.matches, false), "negative"),
    analysisCard("Avg MMR Gain", formatSigned(avgGain), "positive"),
    analysisCard("Avg MMR Loss", formatSigned(avgLoss), "negative"),
    analysisCard("Net MMR Change", formatSigned(history.netDelta), history.netDelta >= 0 ? "positive" : "negative")
  ].join("");
  matchupSummary.innerHTML = matchupSummaryCards(matchups);
  matchupTable.innerHTML = matchupTableMarkup(matchups.rows);
  playerMatchList.innerHTML = playerMatchHistory(player, history.matches);
}

function metric(label, value) {
  return `
    <div class="profile-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function analysisCard(label, value, tone) {
  return `
    <div class="analysis-card ${tone}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function matchupSummaryCards(matchups) {
  const cards = [
    ["Best Teammate", matchups.bestTeammate, "with", "positive"],
    ["Worst Teammate", matchups.worstTeammate, "with", "negative"],
    ["Easiest Opponent", matchups.easiestOpponent, "vs", "positive"],
    ["Toughest Opponent", matchups.toughestOpponent, "vs", "negative"]
  ];

  return cards.map(([label, row, mode, tone]) => matchupCard(label, row, mode, tone)).join("");
}

function matchupCard(label, row, mode, tone) {
  if (!row) {
    return `
      <article class="matchup-card ${tone}">
        <span>${label}</span>
        <strong>No data</strong>
        <small>0 games</small>
      </article>
    `;
  }

  const stats = mode === "with" ? row.with : row.vs;
  return `
    <article class="matchup-card ${tone}">
      <span>${label}</span>
      <strong>${escapeHtml(row.name)}</strong>
      <small>${winRateLabel(stats)} (${stats.games} games)</small>
    </article>
  `;
}

function matchupTableMarkup(rows) {
  if (rows.length === 0) {
    return `<article class="empty-card">No matchup data yet.</article>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Player</th>
          <th class="numeric">Games With</th>
          <th class="numeric">Wins With</th>
          <th class="numeric">Losses With</th>
          <th class="numeric">WR With</th>
          <th class="numeric">Games VS</th>
          <th class="numeric">Wins VS</th>
          <th class="numeric">Losses VS</th>
          <th class="numeric">WR VS</th>
          <th class="numeric">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(matchupRow).join("")}
      </tbody>
    </table>
  `;
}

function matchupRow(row) {
  return `
    <tr>
      <td>
        <a class="player-cell player-link compact-player" href="${playerProfileUrl(row.userId)}">
          ${avatar(row)}
          <strong>${escapeHtml(row.name)}</strong>
        </a>
      </td>
      <td class="numeric">${row.with.games}</td>
      <td class="numeric positive">${row.with.wins}</td>
      <td class="numeric negative">${row.with.losses}</td>
      <td class="numeric ${row.with.winRate >= 50 ? "positive" : "negative"}">${winRateLabel(row.with)}</td>
      <td class="numeric">${row.vs.games}</td>
      <td class="numeric positive">${row.vs.wins}</td>
      <td class="numeric negative">${row.vs.losses}</td>
      <td class="numeric ${row.vs.winRate >= 50 ? "positive" : "negative"}">${winRateLabel(row.vs)}</td>
      <td class="numeric">${row.total}</td>
    </tr>
  `;
}

function playerHistory(player) {
  const matches = state.matches
    .filter((match) => match.blue.some((entry) => entry.userId === player.userId) || match.red.some((entry) => entry.userId === player.userId))
    .sort((a, b) => new Date(a.confirmedAt) - new Date(b.confirmedAt))
    .map((match) => {
      const side = match.blue.some((entry) => entry.userId === player.userId) ? "blue" : "red";
      const entry = match[side].find((item) => item.userId === player.userId);
      return {
        ...match,
        side,
        didWin: match.winner === side,
        delta: entry?.delta ?? 0
      };
    });
  const startingRating = player.rating - matches.reduce((total, match) => total + match.delta, 0);
  let rating = startingRating;
  const points = [{ game: 0, rating }];

  for (const match of matches) {
    rating += match.delta;
    points.push({
      game: points.length,
      rating,
      match
    });
  }

  return {
    matches,
    points,
    netDelta: player.rating - startingRating
  };
}

function matchupAnalysis(player, matches) {
  const rowsById = new Map();

  for (const match of matches) {
    const playerSide = match.side;
    const team = match[playerSide] ?? [];
    const opponents = match[oppositeSide(playerSide)] ?? [];
    const didWin = match.didWin;

    for (const teammate of team) {
      if (teammate.userId === player.userId) continue;
      const row = matchupRowData(teammate);
      if (didWin) row.with.wins += 1;
      else row.with.losses += 1;
    }

    for (const opponent of opponents) {
      const row = matchupRowData(opponent);
      if (didWin) row.vs.wins += 1;
      else row.vs.losses += 1;
    }
  }

  const rows = [...rowsById.values()].map((row) => {
    finishSideStats(row.with);
    finishSideStats(row.vs);
    row.total = row.with.games + row.vs.games;
    return row;
  }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    rows,
    bestTeammate: bestMatchup(rows, "with", true),
    worstTeammate: bestMatchup(rows, "with", false),
    easiestOpponent: bestMatchup(rows, "vs", true),
    toughestOpponent: bestMatchup(rows, "vs", false)
  };

  function matchupRowData(entry) {
    if (!rowsById.has(entry.userId)) {
      const playerRecord = state.playerById.get(entry.userId);
      rowsById.set(entry.userId, {
        userId: entry.userId,
        name: entry.name,
        avatarUrl: playerRecord?.avatarUrl ?? "",
        with: emptySideStats(),
        vs: emptySideStats(),
        total: 0
      });
    }
    return rowsById.get(entry.userId);
  }
}

function emptySideStats() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    winRate: 0
  };
}

function finishSideStats(stats) {
  stats.games = stats.wins + stats.losses;
  stats.winRate = stats.games === 0 ? 0 : Number(((stats.wins / stats.games) * 100).toFixed(0));
}

function bestMatchup(rows, key, wantsHigh) {
  return rows
    .filter((row) => row[key].games > 0)
    .sort((a, b) => {
      const rateDiff = wantsHigh ? b[key].winRate - a[key].winRate : a[key].winRate - b[key].winRate;
      return rateDiff || b[key].games - a[key].games || a.name.localeCompare(b.name);
    })[0] ?? null;
}

function ratingGraphSvg(points) {
  const width = 960;
  const height = 260;
  const padding = 36;
  const ratings = points.map((point) => point.rating);
  const rawMin = Math.min(...ratings);
  const rawMax = Math.max(...ratings);
  const spread = rawMax - rawMin;
  const pad = spread === 0 ? 25 : Math.max(10, spread * 0.15);
  const min = rawMin - pad;
  const max = rawMax + pad;
  const range = Math.max(1, max - min);
  const x = (index) => padding + (index / Math.max(1, points.length - 1)) * (width - padding * 2);
  const y = (rating) => height - padding - ((rating - min) / range) * (height - padding * 2);
  const line = points.map((point, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(1)} ${y(point.rating).toFixed(1)}`).join(" ");
  const fill = `${line} L ${x(points.length - 1).toFixed(1)} ${height - padding} L ${padding} ${height - padding} Z`;

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Player MMR graph">
      <path class="graph-fill" d="${fill}"></path>
      <path class="graph-line" d="${line}"></path>
      ${points.map((point, index) => `<circle class="${point.match?.didWin ? "win-dot" : "loss-dot"}" cx="${x(index).toFixed(1)}" cy="${y(point.rating).toFixed(1)}" r="3"></circle>`).join("")}
      <text x="${padding}" y="24">${Math.round(max)}</text>
      <text x="${padding}" y="${height - 12}">${Math.round(min)}</text>
    </svg>
  `;
}

function playerMatchHistory(player, matches) {
  if (matches.length === 0) {
    return `<article class="player-match empty-card">No completed matches yet.</article>`;
  }

  return matches
    .slice()
    .reverse()
    .map((match) => {
      const teammates = match[match.side].filter((entry) => entry.userId !== player.userId).map((entry) => entry.name).slice(0, 3).join(", ");
      return `
        <article class="player-match ${match.didWin ? "winner" : "loser"}">
          <div>
            <strong>${match.didWin ? "Win" : "Loss"} &middot; Match #${match.queueNumber ?? match.id}</strong>
            <span>${formatDate(match.confirmedAt)} &middot; ${sideName(match.side)}${teammates ? ` with ${escapeHtml(teammates)}` : ""}</span>
          </div>
          <strong class="${match.delta >= 0 ? "positive" : "negative"}">${formatSigned(match.delta)}</strong>
        </article>
      `;
    })
    .join("");
}

function currentStreak(history) {
  if (history.matches.length === 0) return { label: "0" };
  const latest = history.matches[history.matches.length - 1].didWin;
  let count = 0;

  for (let index = history.matches.length - 1; index >= 0; index -= 1) {
    if (history.matches[index].didWin !== latest) break;
    count += 1;
  }

  return { label: `${latest ? "W" : "L"}${count}` };
}

function peakMmr(player) {
  return Math.max(player.rating, ...playerHistory(player).points.map((point) => point.rating));
}

function bestStreak(matches, wins) {
  let best = 0;
  let current = 0;
  for (const match of matches) {
    if (match.didWin === wins) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function avatar(player) {
  if (player.avatarUrl) {
    return `<img class="avatar" src="${player.avatarUrl}" alt="">`;
  }

  return `<span class="avatar fallback">${escapeHtml(player.name.slice(0, 2).toUpperCase())}</span>`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatSigned(value) {
  const rounded = Number(value).toFixed(1);
  return value > 0 ? `+${rounded}` : rounded;
}

function sideName(side) {
  return side === "blue" ? "Blue" : "Red";
}

function oppositeSide(side) {
  return side === "blue" ? "red" : "blue";
}

function winRateLabel(stats) {
  return stats.games === 0 ? "--" : `${stats.winRate}%`;
}

function playerProfileUrl(userId) {
  return routeHash({ player: userId });
}

function discordProfileUrl(userId) {
  return `https://discord.com/users/${encodeURIComponent(userId)}`;
}
