// Thin Ice Tussle: menu, HUD and the solo match against bots.

import { createRenderer } from "./render.js";
import { createInput } from "./input.js";
import { sfx, unlockAudio } from "./audio.js";
import * as R from "./rules.js";

const $ = (id) => document.getElementById(id);
const ui = {
  menu: $("menu"),
  hud: $("hud"),
  name: $("name"),
  solo: $("solo"),
  status: $("status"),
  board: $("board"),
  banner: $("banner"),
  big: $("big"),
  quit: $("quit"),
  bots: [...document.querySelectorAll("[data-bots]")],
};

const renderer = createRenderer();
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
    else if (e.t === "fall") (renderer.splash(e.x, e.z), sfx.splash());
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
  ui.status.textContent = message;
  input.show(false);
}

function showHud() {
  ui.menu.hidden = true;
  ui.hud.hidden = false;
  input.show(true);
}

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

ui.solo.onclick = startSolo;
ui.quit.onclick = () => {
  solo = null;
  renderer.clear();
  showMenu();
};

// ---- main loop -------------------------------------------------------------------------------

let last = performance.now();
function frame(dt) {
  if (solo) soloFrame(dt);
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

// For browser automation: read the state, or advance frames when the tab is hidden (no requestAnimationFrame).
window.__game = {
  get phase() {
    return solo?.phase ?? "menu";
  },
  get solo() {
    return solo;
  },
  tick: frame,
};
