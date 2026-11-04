// Thin Ice Tussle: menu, HUD, the solo match against bots, and online matches on Edgegap.

import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { sfx, unlockAudio } from "./audio.js";
import * as R from "./rules.js";
import { LOCAL_PORT, autoplay, cancelMatchmaking, directServer, findMatch, joinServer, loadConfig } from "./online.js";

const $ = (id) => document.getElementById(id);
const ui = {
  menu: $("menu"),
  hud: $("hud"),
  name: $("name"),
  solo: $("solo"),
  find: $("find"),
  local: $("local"),
  cancel: $("cancel"),
  status: $("status"),
  queue: $("queue"),
  queueTime: $("queue-time"),
  message: $("message"),
  secondary: document.querySelector(".secondary"),
  board: $("board"),
  banner: $("banner"),
  big: $("big"),
  quit: $("quit"),
  bots: [...document.querySelectorAll("[data-bots]")],
};

const renderer = createRenderer();
renderer.onSound((name) => (solo || online) && sfx[name]?.()); // the bot match behind the splash stays quiet
const input = createInput();
const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
const BOT_NAMES = ["Waddles", "Pebble", "Flip", "Nugget", "Sleet", "Mochi", "Biscuit", "Gizmo"];
const COUNTDOWN = 3;
const RESULTS = 5;

ui.name.value = localStorage.getItem("ice-name") || `Pingu${Math.floor(Math.random() * 900 + 100)}`;
let botCount = Number(localStorage.getItem("ice-bots") || 3);
const showBots = () => ui.bots.forEach((b) => b.classList.toggle("on", Number(b.dataset.bots) === botCount));
ui.bots.forEach((b) => (b.onclick = () => ((botCount = Number(b.dataset.bots)), localStorage.setItem("ice-bots", botCount), showBots())));
showBots();

// ---- HUD (shared shape: {phase, timer, round, roundLive, players:[{id, name, score, slot, out}], banner, result}) --

function renderHud(state, myId) {
  ui.board.replaceChildren(
    ...state.players.map((p) => {
      const li = document.createElement("li");
      li.className = `${p.id === myId ? "me" : ""} ${p.out && state.roundLive ? "out" : ""}`;
      li.style.setProperty("--c", hex(R.SLOT_COLORS[p.slot] ?? 0xffffff));
      li.innerHTML = `<span></span><b></b>`;
      li.firstChild.textContent = p.name;
      li.lastChild.textContent = "●".repeat(p.score) + "○".repeat(Math.max(0, R.ROUNDS_TO_WIN - p.score));
      return li;
    })
  );
  const t = state.timer;
  if (state.phase === "waiting") {
    ui.banner.textContent = state.waitingFor > 0 ? `Waiting for ${state.waitingFor} more player(s)...` : "Waiting for players...";
    ui.big.textContent = "";
  } else if (state.phase === "countdown") {
    ui.banner.textContent = `First to ${R.ROUNDS_TO_WIN} rounds`;
    ui.big.textContent = t > 0 ? t : "GO!";
  } else if (state.phase === "playing") {
    ui.banner.textContent = `Round ${state.round}`;
    ui.big.textContent = state.roundLive ? "" : state.banner ?? "";
    if (state.roundLive && state.meOut) ui.banner.textContent += "  ·  splash! watching";
  } else if (state.phase === "over") {
    ui.banner.textContent = t != null ? `Back to menu in ${t}s` : "";
    ui.big.textContent = state.result?.winner ?? "Match over";
  }
}

let beepKey = null;
function countdownBeep(state) {
  const key = state.phase === "countdown" ? `c${state.timer}` : state.phase;
  if (key === beepKey) return;
  beepKey = key;
  if (state.phase === "countdown" && state.timer > 0) sfx.beep(false);
  else if (state.phase === "playing") sfx.beep(true);
}

/** Effects for simulation events, solo or online. Returns a banner for a finished round, if any. */
function playEvents(events, myId, nameOf) {
  let banner = null;
  for (const e of events) {
    if (e.t === "crack") sfx.crack();
    else if (e.t === "drop") sfx.drop();
    else if (e.t === "fall") (renderer.fall(e.x, e.z, e.id), sfx.splash());
    else if (e.t === "bump") (renderer.bump(e.x, e.z, e.big), sfx.bump(e.big));
    else if (e.t === "slide" && e.id === myId) sfx.slide();
    else if (e.t === "eat") sfx.fish();
    else if (e.t === "round") {
      banner = e.winner == null ? "Everyone fell in!" : e.winner === myId ? "You win the round!" : `${nameOf(e.winner)} wins the round`;
      sfx.round(e.winner === myId);
    } else if (e.t === "start") sfx.beep(true);
  }
  return banner;
}

function showMenu(message = "") {
  ui.menu.hidden = false;
  ui.hud.hidden = true;
  ui.find.hidden = ui.secondary.hidden = false;
  ui.local.hidden = !isLocalPage;
  ui.queue.hidden = true;
  clearInterval(queueTimer);
  ui.find.disabled = !config.matchmakerUrl;
  ui.message.textContent = message || (config.matchmakerUrl ? "" : "Online play is not configured on this page.");
  document.body.classList.remove("in-match");
  renderer.setMenuView(true);
  input.show(false);
}

function showHud() {
  ui.menu.hidden = true;
  ui.hud.hidden = false;
  document.body.classList.add("in-match");
  renderer.setMenuView(false);
  showContact(false);
  input.show(true);
}

// Contact Edgegap: a button at the bottom that opens Discord and email links.
const contactBtn = $("contact-btn");
const contactCard = $("contact-card");
function showContact(open) {
  contactCard.hidden = !open;
  contactBtn.setAttribute("aria-expanded", String(open));
}
contactBtn.onclick = () => showContact(contactCard.hidden);
addEventListener("keydown", (e) => e.key === "Escape" && showContact(false));

// ---- solo match against bots -----------------------------------------------------------------

let solo = null;

function startSolo() {
  unlockAudio();
  localStorage.setItem("ice-name", ui.name.value);
  const world = R.createWorld();
  const names = { 1: ui.name.value.trim().slice(0, 16) || "You" };
  R.addPlayer(world, { id: 1 });
  const pool = [...BOT_NAMES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < botCount; i++) {
    R.addPlayer(world, { id: i + 2, bot: true });
    names[i + 2] = `${pool[i]} (bot)`;
  }
  R.startMatch(world);
  solo = { world, names, phase: "countdown", ends: performance.now() + COUNTDOWN * 1000, acc: 0, result: null, banner: null };
  renderer.clear();
  showHud();
}

const view = (world, names) => ({
  players: world.players.map((p) => ({ id: p.id, slot: p.slot, x: p.x, z: p.z, a: p.a, slide: p.slideT > 0, mega: p.mega > 0, out: p.out, name: names[p.id] })),
  tiles: world.tiles,
  fish: world.fish,
});

function soloFrame(dt) {
  const now = performance.now();
  const { world, names } = solo;
  if (solo.phase === "countdown" && now >= solo.ends) solo.phase = "playing";
  if (solo.phase === "playing") {
    const STEP = 1 / 60;
    solo.acc += dt;
    while (solo.acc >= STEP && solo.phase === "playing") {
      solo.acc -= STEP;
      for (const p of world.players) {
        if (p.out) continue;
        if (p.bot) p.input = R.botInput(world, p, p.brain, STEP);
        else {
          const { sx, sy, dash } = input.read();
          p.input = { ...renderer.toWorld(sx, sy), dash };
        }
      }
      const banner = playEvents(R.stepMatch(world, STEP), 1, (id) => names[id]);
      if (banner) solo.banner = banner;
      const champ = R.matchWinner(world);
      if (champ && !world.roundLive) {
        solo.result = { winner: champ.id === 1 ? "You win the match!" : `${names[champ.id]} wins the match` };
        solo.phase = "over";
        solo.ends = now + RESULTS * 1000;
      }
    }
  }
  if (solo.phase === "over" && now >= solo.ends) {
    solo = null;
    renderer.clear();
    showMenu("Play again?");
    return;
  }
  const state = {
    phase: solo.phase,
    timer: Math.max(0, Math.ceil((solo.ends - now) / 1000)),
    round: world.round,
    roundLive: world.roundLive,
    meOut: R.getPlayer(world, 1)?.out,
    banner: solo.banner,
    players: world.players.map((p) => ({ id: p.id, name: names[p.id], score: p.wins, slot: p.slot, out: p.out })),
    result: solo.result,
  };
  renderHud(state, 1);
  countdownBeep(state);
  renderer.sync(view(world, names), dt);
}

// ---- online match: the server runs the game, we draw its state and send inputs ----------------

const config = await loadConfig();
const isLocalPage = ["localhost", "127.0.0.1"].includes(location.hostname);
let online = null; // { server, state, banner, url }
let searching = false;
let queueTimer = 0;

async function playOnline(getServer) {
  unlockAudio();
  localStorage.setItem("ice-name", ui.name.value);
  ui.find.hidden = ui.secondary.hidden = true;
  ui.queue.hidden = false;
  ui.message.textContent = "";
  // Time in the queue, so a wait never looks frozen.
  const queuedAt = performance.now();
  clearInterval(queueTimer);
  const tickQueue = () => {
    const s = Math.floor((performance.now() - queuedAt) / 1000);
    ui.queueTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  tickQueue();
  queueTimer = setInterval(tickQueue, 1000);
  searching = true;
  const status = (text) => (ui.status.textContent = text);
  try {
    const { url, ticketId } = await getServer(status);
    if (!searching) return;
    status("Connecting...");
    const session = { server: null, state: null, banner: null, url };
    session.server = await joinServer(url, ui.name.value, ticketId, {
      onStatus: status,
      onState: (msg) => {
        session.state = msg;
        const nameOf = (id) => msg.players.find((p) => p.id === id)?.name ?? "?";
        const banner = playEvents(msg.s.ev, session.server?.myId, nameOf);
        if (banner) session.banner = banner;
        countdownBeep(msg);
      },
      onClose: (e) => {
        const finished = online?.state?.phase === "over";
        online = null;
        renderer.clear();
        showMenu(finished ? "Match finished. Play again?" : e?.code === 4000 ? "You were away too long, so you left the match." : "Disconnected from the server.");
      },
    });
    if (!searching) return session.server.close(); // cancelled while connecting
    searching = false;
    clearInterval(queueTimer);
    online = session;
    renderer.clear();
    showHud();
  } catch (err) {
    // After Cancel the SDK rejects with "Matchmaking stopped": the menu already says "Cancelled."
    if (!searching) return;
    searching = false;
    showMenu(String(err?.message ?? err));
  }
}

function onlineFrame(dt) {
  const { server, state } = online;
  const { sx, sy, dash } = input.read();
  if (state?.phase === "playing") server.sendInput({ ...renderer.toWorld(sx, sy), dash });
  if (!state) return;
  const s = state.s;
  const mine = new Map(s.p.map((p) => [p.id, p]));
  const nameOf = new Map(state.players.map((p) => [p.id, p.name]));
  renderHud(
    {
      ...state,
      round: s.r,
      roundLive: s.live,
      meOut: mine.get(server.myId)?.out,
      banner: online.banner,
      players: state.players.map((p) => ({ ...p, slot: mine.get(p.id)?.slot, out: mine.get(p.id)?.out })),
    },
    server.myId
  );
  // Ease toward the latest server snapshot (20 per second) every frame.
  renderer.sync({ players: s.p.map((p) => ({ ...p, name: nameOf.get(p.id) })), tiles: s.t, fish: s.f }, dt, 14);
}

ui.solo.onclick = startSolo;
ui.find.onclick = () => playOnline((status) => findMatch(config, status));
ui.local.onclick = () => playOnline(async () => ({ url: `ws://${location.hostname}:${LOCAL_PORT}` }));
ui.cancel.onclick = () => {
  searching = false;
  cancelMatchmaking();
  online?.server.close();
  showMenu("Cancelled.");
};
ui.quit.onclick = () => {
  solo = null;
  if (online) online.server.close();
  renderer.clear();
  showMenu();
};

// ---- splash: four bots play behind the menu ------------------------------------------------------

const attract = { world: R.createWorld(), names: {}, acc: 0, live: false };
for (let i = 1; i <= 4; i++) {
  R.addPlayer(attract.world, { id: 100 + i, bot: true });
  attract.names[100 + i] = BOT_NAMES[i * 2 - 1];
}
R.startMatch(attract.world);

function attractFrame(dt) {
  const { world } = attract;
  if (!attract.live) {
    renderer.clear(); // the solo or online match left its own waddlers on screen
    attract.live = true;
  }
  const STEP = 1 / 60;
  attract.acc = Math.min(attract.acc + dt, 0.25);
  while (attract.acc >= STEP) {
    attract.acc -= STEP;
    for (const p of world.players) if (!p.out) p.input = R.botInput(world, p, p.brain, STEP);
    for (const e of R.stepMatch(world, STEP)) {
      if (e.t === "fall") renderer.fall(e.x, e.z, e.id);
      else if (e.t === "bump" && e.big) renderer.bump(e.x, e.z, true);
    }
    if (R.matchWinner(world) && !world.roundLive && world.pause <= 0) R.startMatch(world);
  }
  renderer.sync(view(world, attract.names), dt);
}

// ---- main loop -------------------------------------------------------------------------------

let last = performance.now();
function frame(dt) {
  if (solo) soloFrame(dt);
  else if (online) onlineFrame(dt);
  else attractFrame(dt); // splash, and while searching for a match
  if (solo || online) attract.live = false;
  renderer.frame(dt);
}
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}
showMenu();
requestAnimationFrame(loop);
if (directServer) playOnline(async () => ({ url: directServer }));
else if (autoplay === "1" && config.matchmakerUrl) ui.find.click();
else if (autoplay === "local") ui.local.click();

// For browser automation: read the state, or advance frames when the tab is hidden (no requestAnimationFrame).
window.__game = {
  get phase() {
    return solo?.phase ?? online?.state?.phase ?? (online ? "connected" : searching ? "searching" : "menu");
  },
  get solo() {
    return solo;
  },
  get online() {
    return online && { url: online.url, myId: online.server.myId, match: online.server.match, players: online.state?.players, result: online.state?.result, round: online.state?.s.r };
  },
  tick: frame,
};
