/* ============================================
   Dodgers Schedule 2026 — LAドジャース・テレビ放送ナビ
   データソース: 公開 MLB StatsAPI
   ============================================ */

const DODGERS_ID = 119;
const SEASON = 2026;
const API = "https://statsapi.mlb.com/api/v1";
const LOGO = (id) => `https://www.mlbstatic.com/team-logos/${id}.svg`;

/* チーム日本語名 (短縮名 / フル名) */
const TEAMS_JA = {
  108: ["エンゼルス", "ロサンゼルス・エンゼルス"],
  109: ["Dバックス", "アリゾナ・ダイヤモンドバックス"],
  110: ["オリオールズ", "ボルチモア・オリオールズ"],
  111: ["レッドソックス", "ボストン・レッドソックス"],
  112: ["カブス", "シカゴ・カブス"],
  113: ["レッズ", "シンシナティ・レッズ"],
  114: ["ガーディアンズ", "クリーブランド・ガーディアンズ"],
  115: ["ロッキーズ", "コロラド・ロッキーズ"],
  116: ["タイガース", "デトロイト・タイガース"],
  117: ["アストロズ", "ヒューストン・アストロズ"],
  118: ["ロイヤルズ", "カンザスシティ・ロイヤルズ"],
  119: ["ドジャース", "ロサンゼルス・ドジャース"],
  120: ["ナショナルズ", "ワシントン・ナショナルズ"],
  121: ["メッツ", "ニューヨーク・メッツ"],
  133: ["アスレチックス", "アスレチックス"],
  134: ["パイレーツ", "ピッツバーグ・パイレーツ"],
  135: ["パドレス", "サンディエゴ・パドレス"],
  136: ["マリナーズ", "シアトル・マリナーズ"],
  137: ["ジャイアンツ", "サンフランシスコ・ジャイアンツ"],
  138: ["カージナルス", "セントルイス・カージナルス"],
  139: ["レイズ", "タンパベイ・レイズ"],
  140: ["レンジャーズ", "テキサス・レンジャーズ"],
  141: ["ブルージェイズ", "トロント・ブルージェイズ"],
  142: ["ツインズ", "ミネソタ・ツインズ"],
  143: ["フィリーズ", "フィラデルフィア・フィリーズ"],
  144: ["ブレーブス", "アトランタ・ブレーブス"],
  145: ["Wソックス", "シカゴ・ホワイトソックス"],
  146: ["マーリンズ", "マイアミ・マーリンズ"],
  147: ["ヤンキース", "ニューヨーク・ヤンキース"],
  158: ["ブルワーズ", "ミルウォーキー・ブルワーズ"],
};

const GAME_TYPE_LABEL = {
  S: "Spring Training",
  R: "Regular Season",
  F: "Postseason",
  D: "Postseason",
  L: "Postseason",
  W: "World Series",
};

const DOW_JA = ["日", "月", "火", "水", "木", "金", "土"];

let allGames = [];
let state = {
  view: "calendar",
  month: null,       // "2026-07" 形式
  place: "all",
  status: "all",
};

/* ---------- JST ユーティリティ ---------- */

/* Date → JST の各パーツ */
function jstParts(date) {
  const p = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "2-digit", hour12: false,
    weekday: "short",
  }).formatToParts(date);
  const get = (t) => p.find((x) => x.type === t)?.value;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: get("minute"),
    weekday: get("weekday"),
  };
}

function jstDateKey(date) {
  const p = jstParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function jstMonthKey(date) {
  const p = jstParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}`;
}

function jstTimeStr(date) {
  const p = jstParts(date);
  return `${p.hour}:${p.minute}`;
}

function jstFullStr(date) {
  const p = jstParts(date);
  return `${p.month}月${p.day}日 (${p.weekday}) ${p.hour}:${p.minute}`;
}

/* ---------- ゲーム整形 ---------- */

function normalizeGame(g) {
  const isHome = g.teams.home.team.id === DODGERS_ID;
  const opp = isHome ? g.teams.away.team : g.teams.home.team;
  const dodgersSide = isHome ? g.teams.home : g.teams.away;
  const oppSide = isHome ? g.teams.away : g.teams.home;
  const date = new Date(g.gameDate);
  const abstract = g.status.abstractGameState; // Preview / Live / Final
  const detailed = g.status.detailedState;
  const isPostponed = /Postponed|Suspended|Cancelled/i.test(detailed);
  return {
    pk: g.gamePk,
    date,
    officialDate: g.officialDate,
    dateKey: jstDateKey(date),
    monthKey: jstMonthKey(date),
    startTBD: g.status.startTimeTBD,
    gameType: g.gameType,
    isHome,
    oppId: opp.id,
    oppNameEn: opp.name,
    venue: g.venue?.name || "",
    abstract,
    isPostponed,
    dodgersScore: dodgersSide.score,
    oppScore: oppSide.score,
    isWin: dodgersSide.isWinner === true,
  };
}

function oppShort(g) { return (TEAMS_JA[g.oppId] || [g.oppNameEn])[0]; }
function oppFull(g) { return (TEAMS_JA[g.oppId] || [g.oppNameEn, g.oppNameEn])[1]; }

/* ---------- データ取得 ---------- */

async function fetchSchedule() {
  const url = `${API}/schedule?sportId=1&teamId=${DODGERS_ID}&startDate=${SEASON}-02-20&endDate=${SEASON}-11-10`;
  const res = await fetch(url);
  const data = await res.json();
  const games = [];
  (data.dates || []).forEach((d) => (d.games || []).forEach((g) => games.push(normalizeGame(g))));
  games.sort((a, b) => a.date - b.date);
  return games;
}

/* J SPORTS放送データ (GitHub Actionsが公式番組表から定期取得して data/jsports.json に保存) */
let jsportsData = null;

async function fetchJSports() {
  try {
    const res = await fetch("data/jsports.json", { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/* 選手の今季成績 (大谷: 660271 / 山本: 808967) */
async function fetchPlayerStats(personId, groups) {
  const res = await fetch(`${API}/people/${personId}/stats?stats=season&season=${SEASON}&group=${groups}`);
  const data = await res.json();
  const out = {};
  (data.stats || []).forEach((s) => {
    const split = s.splits?.[0];
    if (split) out[s.group.displayName] = split.stat;
  });
  return out;
}

/* ---------- ① NEXT GAME ---------- */

function pickFeaturedGames(games) {
  const now = new Date();
  const live = games.find((g) => g.abstract === "Live");
  const next = games.find((g) => g.abstract !== "Final" && !g.isPostponed && g.date > now);
  const finals = games.filter((g) => g.abstract === "Final");
  const lastFinal = finals.length ? finals[finals.length - 1] : null;
  return { live, next, lastFinal };
}

function renderNextGame({ live, next }) {
  const g = live || next;
  const dtEl = document.getElementById("ngDatetime");
  if (!g) {
    dtEl.textContent = "今後の試合予定はありません";
    dtEl.classList.add("small");
    return;
  }
  document.getElementById("ngGameType").textContent = GAME_TYPE_LABEL[g.gameType] || "Game";

  if (live) {
    document.querySelector(".ng-head h2").innerHTML =
      'LIVE <span class="slash">//</span> 試合中';
    dtEl.textContent = `${jstFullStr(g.date)} 開始`;
  } else if (g.startTBD) {
    const p = jstParts(g.date);
    dtEl.textContent = `${p.month}月${p.day}日 (${p.weekday}) 時刻未定`;
  } else {
    dtEl.textContent = `${jstFullStr(g.date)} プレイボール`;
  }

  document.getElementById("ngLogoRight").src = LOGO(g.oppId);
  document.getElementById("ngLogoRight").alt = oppFull(g);
  document.getElementById("ngNameRight").textContent = oppFull(g);
  document.getElementById("ngRoleLeft").textContent = g.isHome ? "後攻・ホーム" : "先攻・アウェイ";
  document.getElementById("ngRoleRight").textContent = g.isHome ? "先攻・アウェイ" : "後攻・ホーム";
  document.getElementById("ngVenue").innerHTML =
    `📍 球場: <strong>${g.venue}</strong> (${g.isHome ? "ホーム" : "アウェイ"})`;
}

/* ---------- ②③ テレビ中継情報 ---------- */

function renderTV({ live, next, lastFinal }) {
  const oppEl = document.getElementById("tvOpponent");
  const dtEl = document.getElementById("tvDatetime");
  const stEl = document.getElementById("tvStatus");

  /* 試合中ならその試合、終わっていれば次の試合の放送情報を表示 */
  const g = live || next || lastFinal;
  if (!g) {
    oppEl.textContent = "放送予定の試合はありません";
    dtEl.textContent = "";
    stEl.hidden = true;
    return;
  }

  oppEl.textContent = `${oppFull(g)} 戦`;
  const p = jstParts(g.date);
  dtEl.textContent = g.startTBD
    ? `${p.month}月${p.day}日 (${p.weekday}) 日本時間 未定`
    : `${p.month}月${p.day}日 (${p.weekday}) 日本時間 ${p.hour}:${p.minute}〜`;

  if (live) {
    stEl.textContent = "試合中";
    stEl.className = "tv-status live";
  } else if (g === next) {
    stEl.textContent = "放送予定";
    stEl.className = "tv-status upcoming";
  } else {
    stEl.textContent = "試合終了";
    stEl.className = "tv-status";
  }

  renderJSportsChannel(g);
}

/* J SPORTSのチャンネル番号(1〜4)を番組表データから特定して表示 */
function renderJSportsChannel(g) {
  const labelEl = document.getElementById("paidLabel");
  const nameEl = document.getElementById("paidName");
  const rebEl = document.getElementById("tvRebroadcast");

  const prog = jsportsData?.programs?.find((p) => p.gameDate === g.officialDate);
  if (!prog || !prog.airings?.length) return; // データなし → 「J SPORTS (予想)」のまま

  const gameStart = g.date.getTime();
  const airings = [...prog.airings].sort((a, b) => new Date(a.start) - new Date(b.start));

  /* 試合開始の2時間前〜30分後に始まる放送を生中継とみなす */
  const liveAiring = airings.find((a) => {
    const t = new Date(a.start).getTime();
    return t >= gameStart - 120 * 60000 && t <= gameStart + 30 * 60000;
  });

  const main = liveAiring || airings[0];
  labelEl.textContent = liveAiring ? "有料放送 / CS 生中継" : "有料放送 / CS 録画";
  nameEl.innerHTML = `<span class="dot yellow"></span> J SPORTS ${main.channel}`;

  const rest = airings.filter((a) => a !== main && new Date(a.start) > new Date());
  if (rest.length) {
    const items = rest.slice(0, 3).map((a) => {
      const p = jstParts(new Date(a.start));
      return `${p.month}/${p.day}(${p.weekday}) ${p.hour}:${p.minute}〜 J SPORTS ${a.channel}`;
    });
    rebEl.innerHTML = `🔁 再放送: ${items.join(" / ")}`;
    rebEl.hidden = false;
  } else {
    rebEl.hidden = true;
  }
}

/* ---------- ヘッダー選手成績 ---------- */

async function renderPlayerStats() {
  try {
    const [ohtani, yamamoto] = await Promise.all([
      fetchPlayerStats(660271, "hitting,pitching"),
      fetchPlayerStats(808967, "pitching"),
    ]);

    const oh = [];
    if (ohtani.hitting?.homeRuns != null) oh.push(`<span class="num">${ohtani.hitting.homeRuns}</span>号`);
    if (ohtani.pitching?.wins != null) oh.push(`<span class="num">${ohtani.pitching.wins}</span>勝`);
    document.getElementById("ohtaniStats").innerHTML = oh.join(" ・ ") || "—";

    const ya = [];
    if (yamamoto.pitching?.wins != null) ya.push(`<span class="num">${yamamoto.pitching.wins}</span>勝`);
    if (yamamoto.pitching?.era != null) ya.push(`防 ${yamamoto.pitching.era}`);
    document.getElementById("yamamotoStats").innerHTML = ya.join(" ・ ") || "—";
  } catch (e) {
    /* 成績は補助情報のため失敗しても続行 */
    document.getElementById("ohtaniStats").textContent = "—";
    document.getElementById("yamamotoStats").textContent = "—";
  }
}

/* ---------- 月タブ ---------- */

function buildMonthTabs() {
  const tabs = document.getElementById("monthTabs");
  const months = [...new Set(allGames.map((g) => g.monthKey))].sort();
  const nowKey = jstMonthKey(new Date());

  state.month = months.includes(nowKey) ? nowKey : (months.find((m) => m >= nowKey) || months[months.length - 1]);

  tabs.innerHTML = "";
  months.forEach((m) => {
    const btn = document.createElement("button");
    const monthNum = Number(m.split("-")[1]);
    btn.textContent = m === nowKey ? `${monthNum}月 (今月)` : `${monthNum}月`;
    btn.dataset.month = m;
    if (m === state.month) btn.classList.add("active");
    btn.addEventListener("click", () => {
      state.month = m;
      tabs.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
      renderSchedule();
    });
    tabs.appendChild(btn);
  });

  /* アクティブなタブを見える位置へ */
  requestAnimationFrame(() => {
    tabs.querySelector("button.active")?.scrollIntoView({ inline: "center", block: "nearest" });
  });
}

/* ---------- フィルター ---------- */

function gamePassesFilter(g) {
  if (state.place === "home" && !g.isHome) return false;
  if (state.place === "away" && g.isHome) return false;
  if (state.status === "final" && g.abstract !== "Final") return false;
  if (state.status === "upcoming" && g.abstract === "Final") return false;
  return true;
}

function resultParts(g) {
  if (g.isPostponed) return { text: "延期", cls: "other" };
  if (g.abstract === "Final") {
    const w = g.isWin ? "W" : "L";
    const cls = g.isWin ? "win" : "lose";
    if (g.dodgersScore == null || g.oppScore == null) return { text: w + "-", cls };
    return { text: `${w}${g.dodgersScore}-${g.oppScore}`, cls };
  }
  if (g.abstract === "Live") return { text: "LIVE", cls: "time" };
  if (g.startTBD) return { text: "未定", cls: "other" };
  return { text: jstTimeStr(g.date), cls: "time" };
}

/* ---------- カレンダー描画 ---------- */

function renderCalendar() {
  const wrap = document.getElementById("calendarView");
  const [year, month] = state.month.split("-").map(Number);
  const todayKey = jstDateKey(new Date());

  const byDate = {};
  allGames.forEach((g) => {
    if (g.monthKey !== state.month) return;
    (byDate[g.dateKey] = byDate[g.dateKey] || []).push(g);
  });

  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

  let html = '<div class="calendar">';
  html += '<div class="cal-row cal-dow">';
  DOW_JA.forEach((d, i) => {
    const cls = i === 0 ? "sun" : i === 6 ? "sat" : "";
    html += `<span class="${cls}">${d}</span>`;
  });
  html += "</div>";

  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;
  for (let row = 0; row < totalCells / 7; row++) {
    html += '<div class="cal-row">';
    for (let col = 0; col < 7; col++) {
      const idx = row * 7 + col;
      const day = idx - firstDow + 1;
      if (day < 1 || day > daysInMonth) {
        html += '<div class="cal-cell empty"></div>';
        continue;
      }
      const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const games = (byDate[key] || []).filter(gamePassesFilter);
      const todayCls = key === todayKey ? " today" : "";
      html += `<div class="cal-cell${todayCls}">`;

      if (games.length) {
        const g = games[0];
        const ha = g.isHome
          ? '<span class="badge-ha h">H</span>'
          : '<span class="badge-ha a">A</span>';
        html += `<div class="cell-top"><span class="cell-day">${day}</span>${ha}</div>`;
        const r = resultParts(g);
        const extra = games.length > 1 ? ` <small>+${games.length - 1}</small>` : "";
        html += `<div class="cell-game"><img src="${LOGO(g.oppId)}" alt="${oppShort(g)}" loading="lazy"><span class="cell-result ${r.cls}">${r.text}${extra}</span></div>`;
      } else {
        html += `<div class="cell-top"><span class="cell-day">${day}</span></div>`;
      }
      html += "</div>";
    }
    html += "</div>";
  }
  html += "</div>";
  wrap.innerHTML = html;
}

/* ---------- リスト描画 ---------- */

function renderList() {
  const wrap = document.getElementById("listView");
  const games = allGames.filter((g) => g.monthKey === state.month && gamePassesFilter(g));

  if (!games.length) {
    wrap.innerHTML = '<p class="list-empty">条件に合う試合がありません</p>';
    return;
  }

  wrap.innerHTML = games.map((g) => {
    const p = jstParts(g.date);
    const dowIdx = DOW_JA.indexOf(p.weekday);
    const dowCls = dowIdx === 0 ? "sun" : dowIdx === 6 ? "sat" : "";
    const r = resultParts(g);
    return `
      <div class="list-game">
        <div class="list-date">${p.month}/${p.day}<span class="dow ${dowCls}">(${p.weekday})</span></div>
        <div class="list-logo"><img src="${LOGO(g.oppId)}" alt="" loading="lazy"></div>
        <div class="list-info">
          <p class="list-opp">${oppShort(g)}</p>
          <p class="list-sub">${g.isHome ? "ホーム" : "敵地"} ・ ${g.venue}</p>
        </div>
        <div class="list-right"><span class="${r.cls}">${r.text}</span></div>
      </div>`;
  }).join("");
}

function renderSchedule() {
  if (state.view === "calendar") renderCalendar();
  else renderList();
}

/* ---------- イベント ---------- */

function setupControls() {
  document.getElementById("viewToggle").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.view = btn.dataset.view;
    document.querySelectorAll("#viewToggle button").forEach((b) => b.classList.toggle("active", b === btn));
    document.getElementById("calendarView").hidden = state.view !== "calendar";
    document.getElementById("listView").hidden = state.view !== "list";
    renderSchedule();
  });

  document.getElementById("placeFilter").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.place = btn.dataset.place;
    document.querySelectorAll("#placeFilter button").forEach((b) => b.classList.toggle("active", b === btn));
    renderSchedule();
  });

  document.getElementById("statusFilter").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    state.status = btn.dataset.status;
    document.querySelectorAll("#statusFilter button").forEach((b) => b.classList.toggle("active", b === btn));
    renderSchedule();
  });
}

/* ---------- 起動 ---------- */

async function init() {
  setupControls();
  renderPlayerStats();
  try {
    [allGames, jsportsData] = await Promise.all([fetchSchedule(), fetchJSports()]);
    const featured = pickFeaturedGames(allGames);
    renderNextGame(featured);
    renderTV(featured);
    buildMonthTabs();
    renderSchedule();
  } catch (err) {
    document.getElementById("ngDatetime").textContent = "データの取得に失敗しました";
    document.getElementById("ngDatetime").classList.add("small");
    console.error(err);
  }
}

init();
