// Thin Ice Tussle: the game rules. Plain JS with no DOM, so the same file can run anywhere.
//
// Up to four waddlers slide around a sheet of hexagonal ice tiles. The sheet cracks from the edge
// inward (and later anywhere); cracked tiles drop into the sea a moment later. Belly-slide into a
// rival to shove them off. Last one standing wins the round; first to 4 rounds wins the match.
// Grab a golden fish and your next slide is a mega shove.

export const TILE = 1.6; // hex radius, centre to corner
export const RINGS = 6; // 127 tiles
export const PLAYER_R = 0.75;
export const ROUNDS_TO_WIN = 4;
export const ROUND_PAUSE = 3; // seconds between rounds
export const MATCH_SECONDS = 300;
export const CRACK_WARNING = 1.3; // seconds a tile shakes before it drops
export const SLOT_COLORS = [0xff4d6d, 0x3a86ff, 0xffbe0b, 0x2dc653];

const ACCEL = 20;
const DRAG = 0.55; // low: it's ice
const MAX_SPEED = 13;
const SLIDE_SPEED = 16;
const SLIDE_TIME = 0.28;
const SLIDE_COOLDOWN = 1.3;
const KNOCK = 9;
const MEGA_KNOCK = 21;
const MEGA_TIME = 8;
const FISH_EVERY = [7, 11];

// ---- the hex sheet --------------------------------------------------------------------------

const SQRT3 = Math.sqrt(3);
/** Every tile: axial (q, r), centre (x, z), ring (0 = centre). Same order everywhere. */
export const TILES = [];
const INDEX = new Map();
for (let q = -RINGS; q <= RINGS; q++) {
  for (let r = Math.max(-RINGS, -q - RINGS); r <= Math.min(RINGS, -q + RINGS); r++) {
    INDEX.set(`${q},${r}`, TILES.length);
    TILES.push({ q, r, x: TILE * SQRT3 * (q + r / 2), z: TILE * 1.5 * r, ring: (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2 });
  }
}
export const SHEET_RADIUS = TILE * 1.5 * RINGS + TILE;

/** Index of the tile under (x, z), or -1 off the sheet. */
export function tileAt(x, z) {
  const r = z / (1.5 * TILE);
  const q = x / (SQRT3 * TILE) - r / 2;
  // Round fractional axial coordinates to the nearest hex (cube rounding).
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - (-q - r));
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return INDEX.get(`${rq},${rr}`) ?? -1;
}

/** Tile state 0 solid, 1 cracking, 2 gone; off the sheet counts as gone. Tiles: array or "0012..." string. */
export function stateAt(tiles, x, z) {
  const i = tileAt(x, z);
  return i < 0 ? 2 : Number(tiles[i]);
}

// ---- world ------------------------------------------------------------------------------------

export function createWorld(rng = Math.random) {
  return {
    rng,
    tiles: TILES.map(() => 0),
    crackT: TILES.map(() => 0),
    players: [],
    fish: null,
    fishAt: 0,
    round: 0,
    roundTime: 0,
    roundLive: false,
    pause: 0,
    nextCrack: 0,
  };
}

export function freeSlot(world) {
  for (let s = 0; s < 4; s++) if (!world.players.some((p) => p.slot === s)) return s;
  return -1;
}

function spawnPoint(slot) {
  const a = Math.PI / 4 + (slot * Math.PI) / 2;
  const d = SHEET_RADIUS * 0.5;
  return { x: Math.sin(a) * d, z: Math.cos(a) * d, a: a + Math.PI };
}

/** A player joining mid-round watches until the next round starts. */
export function addPlayer(world, { id, slot = freeSlot(world), bot = false }) {
  const p = { id, slot, bot, ...spawnPoint(slot), vx: 0, vz: 0, input: { mx: 0, mz: 0, dash: false }, slideCd: 0, slideT: 0, mega: 0, out: world.roundLive, wins: 0, brain: {} };
  world.players.push(p);
  return p;
}

export function removePlayer(world, id) {
  world.players = world.players.filter((p) => p.id !== id);
}

export function getPlayer(world, id) {
  return world.players.find((p) => p.id === id);
}

/** New match: everyone back to zero wins, round 1 starts. */
export function startMatch(world) {
  for (const p of world.players) p.wins = 0;
  world.round = 0;
  startRound(world);
}

export function startRound(world) {
  world.tiles.fill(0);
  world.crackT.fill(0);
  for (const p of world.players) Object.assign(p, spawnPoint(p.slot), { vx: 0, vz: 0, slideCd: 0, slideT: 0, mega: 0, out: false });
  world.fish = null;
  world.fishAt = rand(world, ...FISH_EVERY);
  world.round++;
  world.roundTime = 0;
  world.roundLive = true;
  world.pause = 0;
  world.nextCrack = 3;
}

const rand = (world, lo, hi) => lo + world.rng() * (hi - lo);

/**
 * Advance the match by dt: the round, the pause between rounds, the next round.
 * Returns events for effects and scoring: crack, drop, fall, bump, slide, fish, eat, round {winner}.
 */
export function stepMatch(world, dt) {
  const events = step(world, dt);
  if (world.roundLive) {
    const alive = world.players.filter((p) => !p.out);
    const over = world.players.length >= 2 ? alive.length <= 1 : alive.length === 0;
    if (over) {
      const winner = world.players.length >= 2 ? alive[0] : null;
      if (winner) winner.wins++;
      world.roundLive = false;
      world.pause = ROUND_PAUSE;
      events.push({ t: "round", winner: winner?.id ?? null, round: world.round });
    }
  } else if (world.pause > 0) {
    world.pause -= dt;
    if (world.pause <= 0 && !matchWinner(world)) {
      startRound(world);
      events.push({ t: "start", round: world.round });
    }
  }
  return events;
}

export function matchWinner(world) {
  return world.players.find((p) => p.wins >= ROUNDS_TO_WIN) ?? null;
}

function step(world, dt) {
  const events = [];
  const { tiles, crackT } = world;
  if (world.roundLive) world.roundTime += dt;

  // The sheet breaks up: outermost tiles first, faster as the round goes on, anywhere after 20 s.
  if (world.roundLive && world.roundTime >= world.nextCrack) {
    const solid = TILES.map((t, i) => i).filter((i) => tiles[i] === 0);
    if (solid.length) {
      const outer = Math.max(...solid.map((i) => TILES[i].ring));
      const anywhere = world.roundTime > 20 && world.rng() < 0.3;
      const pool = anywhere ? solid.filter((i) => TILES[i].ring > 0) : solid.filter((i) => TILES[i].ring === outer);
      const i = (pool.length ? pool : solid)[Math.floor(world.rng() * (pool.length || solid.length))];
      tiles[i] = 1;
      crackT[i] = CRACK_WARNING;
      events.push({ t: "crack", i });
    }
    world.nextCrack = world.roundTime + Math.max(0.18, 1.1 - world.roundTime * 0.025);
  }
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== 1) continue;
    crackT[i] -= dt;
    if (crackT[i] <= 0) {
      tiles[i] = 2;
      events.push({ t: "drop", i });
    }
  }

  // A golden fish now and then, on solid ice near the middle.
  if (world.roundLive && !world.fish && world.roundTime >= world.fishAt) {
    const spots = TILES.map((t, i) => i).filter((i) => tiles[i] === 0 && TILES[i].ring <= 3);
    if (spots.length) {
      const t = TILES[spots[Math.floor(world.rng() * spots.length)]];
      world.fish = { x: t.x, z: t.z };
      events.push({ t: "fish", x: t.x, z: t.z });
    }
    world.fishAt = world.roundTime + rand(world, ...FISH_EVERY);
  }
  if (world.fish && stateAt(tiles, world.fish.x, world.fish.z) === 2) world.fish = null;

  const alive = world.players.filter((p) => !p.out);
  for (const p of alive) {
    p.slideCd = Math.max(0, p.slideCd - dt);
    p.slideT = Math.max(0, p.slideT - dt);
    p.mega = Math.max(0, p.mega - dt);
    let { mx, mz, dash } = p.input;
    const len = Math.hypot(mx, mz);
    if (len > 1) (mx /= len), (mz /= len);
    p.vx += mx * ACCEL * dt;
    p.vz += mz * ACCEL * dt;
    if (dash && p.slideCd <= 0) {
      let dx = mx;
      let dz = mz;
      if (Math.hypot(dx, dz) < 0.2) (dx = Math.sin(p.a)), (dz = Math.cos(p.a));
      const l = Math.hypot(dx, dz) || 1;
      p.vx = (dx / l) * SLIDE_SPEED;
      p.vz = (dz / l) * SLIDE_SPEED;
      p.slideT = SLIDE_TIME;
      p.slideCd = SLIDE_COOLDOWN;
      events.push({ t: "slide", id: p.id });
    }
    const drag = Math.exp(-DRAG * dt);
    p.vx *= drag;
    p.vz *= drag;
    const s = Math.hypot(p.vx, p.vz);
    const max = p.slideT > 0 ? SLIDE_SPEED : MAX_SPEED;
    if (s > max) (p.vx *= max / s), (p.vz *= max / s);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    if (s > 0.8) p.a = Math.atan2(p.vx, p.vz);
  }

  // Bumps: everyone bounces; a sliding waddler shoves the other one hard.
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i];
      const b = alive[j];
      let nx = b.x - a.x;
      let nz = b.z - a.z;
      const d = Math.hypot(nx, nz);
      if (d >= PLAYER_R * 2) continue;
      if (d < 1e-6) (nx = 1), (nz = 0);
      else (nx /= d), (nz /= d);
      const overlap = PLAYER_R * 2 - d;
      a.x -= (nx * overlap) / 2;
      a.z -= (nz * overlap) / 2;
      b.x += (nx * overlap) / 2;
      b.z += (nz * overlap) / 2;
      const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (vrel < 0) {
        const j2 = -0.95 * vrel; // equal masses, restitution 0.9
        a.vx -= j2 * nx;
        a.vz -= j2 * nz;
        b.vx += j2 * nx;
        b.vz += j2 * nz;
      }
      const sliding = a.slideT > 0 || b.slideT > 0;
      if (sliding) {
        const [att, vic, sign] = a.slideT >= b.slideT ? [a, b, 1] : [b, a, -1];
        const k = att.mega > 0 ? MEGA_KNOCK : KNOCK;
        vic.vx += nx * sign * k;
        vic.vz += nz * sign * k;
        att.slideT = 0;
        if (att.mega > 0) att.mega = 0;
      }
      if (sliding || -vrel > 3) events.push({ t: "bump", x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, big: sliding });
    }
  }

  for (const p of alive) {
    if (world.fish && Math.hypot(p.x - world.fish.x, p.z - world.fish.z) < 1.3) {
      p.mega = MEGA_TIME;
      world.fish = null;
      events.push({ t: "eat", id: p.id });
    }
    // Off the ice or over a hole: splash. Cracking tiles still hold.
    if (stateAt(tiles, p.x, p.z) === 2) {
      p.out = true;
      p.mega = 0;
      events.push({ t: "fall", id: p.id, x: p.x, z: p.z });
    }
  }
  return events;
}

// ---- bots ---------------------------------------------------------------------------------

/**
 * Bot driver. Reads only positions and tile states ({players:[{id, x, z, out}], tiles, fish}),
 * so it can drive a bot in the simulation or a headless test player from a network snapshot
 * (tiles may be an array or a "0012..." string). Returns an input {mx, mz, dash}.
 */
export function botInput(view, me, brain, dt, rng = Math.random) {
  brain.skill ??= 0.7 + rng() * 0.25;
  brain.retarget = (brain.retarget ?? 0) - dt;
  const rivals = view.players.filter((p) => p.id !== me.id && !p.out);
  let target = rivals.find((p) => p.id === brain.target);
  if (!target || brain.retarget <= 0) {
    target = rivals.sort((a, b) => dist(me, a) - dist(me, b) + (rng() - 0.5) * 4)[0];
    brain.target = target?.id;
    brain.retarget = 1 + rng() * 1.5;
  }
  const vx = me.vx ?? 0;
  const vz = me.vz ?? 0;
  const fish = view.fish && dist(me, view.fish) < 9 ? view.fish : null;
  const goal = fish ?? target;

  // Score twelve directions: stay on solid ice, keep toward the middle, close in on the goal.
  let best = [0, 0];
  let bestScore = -Infinity;
  for (let k = 0; k < 12; k++) {
    const ang = (k * Math.PI) / 6;
    const dx = Math.sin(ang);
    const dz = Math.cos(ang);
    let score = 0;
    for (const look of [1.2, 2.6]) {
      const s = stateAt(view.tiles, me.x + dx * look + vx * 0.35, me.z + dz * look + vz * 0.35);
      score -= s === 2 ? 10 / look : s === 1 ? 2.5 : 0;
    }
    const cl = Math.hypot(me.x, me.z);
    if (cl > 0.5) score += ((dx * -me.x + dz * -me.z) / cl) * 0.6 * Math.min(1, cl / 8);
    if (goal) {
      const gl = dist(me, goal) || 1;
      score += ((dx * (goal.x - me.x) + dz * (goal.z - me.z)) / gl) * (fish ? 1.6 : 1.1);
    }
    score += rng() * 0.3;
    if (score > bestScore) (bestScore = score), (best = [dx, dz]);
  }

  // Slide into a close rival when lined up, if the ice behind them isn't where we'd land.
  let dash = false;
  if (target && dist(me, target) < 3.5) {
    const tl = dist(me, target) || 1;
    const dx = (target.x - me.x) / tl;
    const dz = (target.z - me.z) / tl;
    const safe = stateAt(view.tiles, me.x + dx * 3, me.z + dz * 3) !== 2;
    if (safe && rng() < dt * 2.2 * brain.skill) {
      dash = true;
      best = [dx, dz];
    }
  }
  return { mx: best[0] * brain.skill, mz: best[1] * brain.skill, dash };
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
