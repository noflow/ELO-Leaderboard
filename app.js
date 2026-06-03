const leaderboardBody = document.querySelector("#leaderboard-body");
const matchGrid = document.querySelector("#match-grid");
const memberCount = document.querySelector("#member-count");

try {
  const [leaderboard, history] = await Promise.all([
    fetchJson(["/api/leaderboard", "data/leaderboard.json"]),
    fetchJson(["/api/matches", "data/matches.json"])
  ]);

  renderLeaderboard(leaderboard.players ?? []);
  renderMatches(history.matches ?? []);
  memberCount.textContent = `${(leaderboard.players ?? []).length.toLocaleString()} players`;
} catch (error) {
  console.error(error);
  leaderboardBody.innerHTML = `<tr><td colspan="5" class="empty">Could not load leaderboard data.</td></tr>`;
  matchGrid.innerHTML = `<article class="match-card empty-card">Could not load match history.</article>`;
}

async function fetchJson(paths) {
  for (const path of paths) {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (response.ok) return response.json();
    } catch {
      // Try the next source.
    }
  }

  throw new Error(`Could not load any of: ${paths.join(", ")}`);
}

function renderLeaderboard(players) {
  if (players.length === 0) {
    leaderboardBody.innerHTML = `<tr><td colspan="5" class="empty">No rated players yet.</td></tr>`;
    return;
  }

  leaderboardBody.innerHTML = players.map(playerRow).join("");
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
        <a class="player-cell player-link" href="${discordProfileUrl(player.userId)}" target="_blank" rel="noreferrer">
          ${avatar(player)}
          <strong>${escapeHtml(player.name)}</strong>
        </a>
      </td>
      <td class="numeric rating">${player.rating}</td>
      <td class="numeric">${player.wins} - ${player.losses}</td>
      <td class="numeric"><span class="win-pill">${player.winRate.toFixed(1)}%</span></td>
    </tr>
  `;
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
        ${sideCard("blue", match.winner === "blue", match.blue)}
        ${sideCard("red", match.winner === "red", match.red)}
      </div>
    </article>
  `;
}

function sideCard(side, didWin, players) {
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
      <a href="${discordProfileUrl(player.userId)}" target="_blank" rel="noreferrer">${escapeHtml(player.name)}</a>
      <strong class="${didWin ? "positive" : "negative"}">${sign}${player.delta.toFixed(1)}</strong>
    </div>
  `;
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

function discordProfileUrl(userId) {
  return `https://discord.com/users/${encodeURIComponent(userId)}`;
}
