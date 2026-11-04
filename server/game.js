// Thin Ice Tussle on the server. The rules are client/rules.js, the same file the browser runs for
// solo play; here the server owns the ice and the players, and clients only send inputs.
// Implements the room.js game contract from the edgegap-threejs skill (assets/server/game.js).

import * as R from "../client/rules.js";
import { axisIn, ffaResult } from "./util.js";

const r2 = (v) => Math.round(v * 100) / 100;

export function createGame() {
  const world = R.createWorld();
  let events = []; // simulation events since the last snapshot, for client effects

  return {
    name: "thin-ice-tussle",
    // Bots fill every empty seat, so 1, 2 or 3 humans always play a 4-waddler match.
    // Score = rounds won; a match is first to ROUNDS_TO_WIN, with MATCH_SECONDS as a backstop.
    config: { tickHz: 60, sendHz: 20, maxPlayers: 4, botFill: 4, matchSeconds: R.MATCH_SECONDS },
    info: () => ({ roundsToWin: R.ROUNDS_TO_WIN }),

    addPlayer(p) {
      R.addPlayer(world, { id: p.id, bot: p.bot });
    },
    removePlayer(p) {
      R.removePlayer(world, p.id);
    },
    input(p, msg) {
      const w = R.getPlayer(world, p.id);
      if (w) w.input = { mx: axisIn(msg.mx), mz: axisIn(msg.mz), dash: !!msg.dash };
    },
    start() {
      R.startMatch(world);
      events = [];
    },
    reset() {
      world.roundLive = false;
      world.pause = 0;
    },

    update(dt, room) {
      for (const w of world.players) if (w.bot && !w.out) w.input = R.botInput(world, w, w.brain, dt);
      for (const e of R.stepMatch(world, dt)) events.push("x" in e ? { ...e, x: r2(e.x), z: r2(e.z) } : e);
      for (const w of world.players) {
        const p = room.players.get(w.id);
        if (p) p.score = w.wins;
      }
    },

    result(room) {
      return R.matchWinner(world) && !world.roundLive ? ffaResult(room, " the match") : null;
    },
    timeUp: (room) => ffaResult(room, " on rounds"),

    snapshot() {
      const s = {
        p: world.players.map((w) => ({ id: w.id, slot: w.slot, x: r2(w.x), z: r2(w.z), a: r2(w.a), slide: w.slideT > 0, mega: w.mega > 0, out: w.out })),
        t: world.tiles.join(""),
        f: world.fish && { x: r2(world.fish.x), z: r2(world.fish.z) },
        r: world.round,
        live: world.roundLive,
        ev: events,
      };
      events = [];
      return s;
    },
  };
}
