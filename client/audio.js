// Tiny synth sound effects with Web Audio: no audio files to load.

let ctx = null;
let noiseBuf = null;

export function unlockAudio() {
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") ctx.resume();
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
}

function tone(freq, dur, { type = "sine", gain = 0.12, slide = 0, delay = 0 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, { gain = 0.15, freq = 1200, q = 1 } = {}) {
  if (!ctx || !noiseBuf) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  filter.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(ctx.destination);
  src.start(t);
  src.stop(t + dur);
}

export const sfx = {
  crack: () => noise(0.06, { gain: 0.05, freq: 3500, q: 3 }),
  drop: () => noise(0.25, { gain: 0.06, freq: 400 }),
  splash: () => (noise(0.5, { gain: 0.25, freq: 700, q: 0.7 }), tone(300, 0.4, { slide: -200, gain: 0.06 })),
  slide: () => noise(0.2, { gain: 0.06, freq: 2500, q: 0.5 }),
  bump: (big) => tone(big ? 140 : 220, 0.15, { type: "square", gain: big ? 0.1 : 0.04, slide: -70 }),
  fish: () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.12, { type: "triangle", delay: i * 0.06 })),
  round: (mine) => (mine ? [523, 659, 784, 1047] : [392, 330, 262]).forEach((f, i) => tone(f, 0.2, { type: "triangle", delay: i * 0.1 })),
  beep: (high) => tone(high ? 880 : 440, 0.12, { type: "square", gain: 0.05 }),
};
