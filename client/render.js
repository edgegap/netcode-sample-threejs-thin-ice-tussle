// Three.js scene for Thin Ice Tussle: sky, sea, a textured hex ice sheet, waddlers, a hungry orca,
// fish, snow and splashes, all built in code (textures are drawn on canvases at load).
// The renderer only draws a "view" ({players, tiles, fish}); it never decides anything.

import * as THREE from "three";
import { TILES, TILE, PLAYER_R, SHEET_RADIUS, SLOT_COLORS } from "./rules.js";

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;
const SEA_Y = -0.62;

// ---- procedural textures ----------------------------------------------------------------------

function canvas(size) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}

/** Seeded random, so every load draws the same ice. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function crackPath(g, r, x, y, len, width, color) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(x, y);
  let a = r() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (r() - 0.5) * 1.1;
    x += Math.cos(a) * 9;
    y += Math.sin(a) * 9;
    g.lineTo(x, y);
    if (r() < 0.12) crackPath(g, r, x, y, (len - i) * 0.5, width * 0.6, color);
  }
  g.stroke();
}

/** Frosted sea ice: soft frost patches, snow speckle, skate scratches, a few fine cracks. */
function iceTexture(seed, cracked = false) {
  const S = 512;
  const [c, g] = canvas(S);
  const r = rng(seed);
  const base = g.createRadialGradient(S / 2, S / 2, S * 0.05, S / 2, S / 2, S * 0.55);
  base.addColorStop(0, "#eef8ff");
  base.addColorStop(1, "#b9dcf2");
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  // Clear-ice patches (bluer) and frost patches (whiter).
  for (let i = 0; i < 26; i++) {
    const x = r() * S;
    const y = r() * S;
    const rad = 30 + r() * 90;
    const blue = r() < 0.45;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, blue ? "rgba(110,180,230,0.45)" : "rgba(255,255,255,0.75)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Snow speckle.
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.6})`;
    const s = r() * 2.2 + 0.4;
    g.fillRect(r() * S, r() * S, s, s);
  }
  // Skate scratches: long faint curves.
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(${r() < 0.5 ? "255,255,255" : "120,170,205"},${0.15 + r() * 0.25})`;
    g.lineWidth = 0.6 + r();
    g.beginPath();
    const x = r() * S;
    const y = r() * S;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + (r() - 0.5) * 220, y + (r() - 0.5) * 220, x + (r() - 0.5) * 300, y + (r() - 0.5) * 300);
    g.stroke();
  }
  // Fine cracks, and big dark ones when the tile is about to give way.
  for (let i = 0; i < (cracked ? 7 : 3); i++) {
    crackPath(g, r, S / 2 + (r() - 0.5) * S * 0.6, S / 2 + (r() - 0.5) * S * 0.6, cracked ? 26 : 14, cracked ? 4.5 : 1.6, cracked ? "rgba(20,70,120,0.85)" : "rgba(70,135,185,0.6)");
  }
  if (cracked) {
    g.fillStyle = "rgba(40,110,170,0.22)";
    g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Ripple normal map for the sea, from a tiling height field. */
function rippleNormals() {
  const S = 256;
  const h = new Float32Array(S * S);
  const r = rng(7);
  const waves = Array.from({ length: 9 }, () => ({ fx: Math.round(r() * 6 + 1), fy: Math.round(r() * 6 + 1), p: r() * 6.28, a: 0.4 + r() }));
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const w of waves) v += Math.sin(((x * w.fx + y * w.fy) / S) * Math.PI * 2 + w.p) * w.a;
      h[y * S + x] = v;
    }
  const [c, g] = canvas(S);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
      const n = new THREE.Vector3(-dx, -dy, 6).normalize();
      const i = (y * S + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(18, 18);
  return t;
}

function radialTexture(stops) {
  const [c, g] = canvas(256);
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function skyTexture() {
  const [c, g] = canvas(512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, "#3f8fd2");
  gr.addColorStop(0.55, "#9fd0ef");
  gr.addColorStop(1, "#e4f4fc");
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- models -----------------------------------------------------------------------------------

function label(text, color) {
  const [c, g] = canvas(256);
  c.height = 64;
  g.font = "bold 30px system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 7;
  g.strokeStyle = "rgba(10,30,50,.85)";
  g.strokeText(text, 128, 32);
  g.fillStyle = color;
  g.fillText(text, 128, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(5, 1.25, 1);
  s.renderOrder = 10;
  return s;
}

const shadowed = (m) => ((m.castShadow = true), m);

function makeWaddler(slot, name) {
  const color = SLOT_COLORS[slot];
  const root = new THREE.Group();
  const body = new THREE.Group(); // leans forward when sliding
  root.add(body);
  body.scale.setScalar(1.5);
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, ...extra });
  const torso = shadowed(new THREE.Mesh(new THREE.SphereGeometry(PLAYER_R, 24, 18), mat(color)));
  torso.scale.set(1, 1.2, 0.95);
  torso.position.y = PLAYER_R * 1.15;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(PLAYER_R * 0.8, 20, 14), mat(0xfaf7f0));
  belly.scale.set(0.9, 1.1, 0.6);
  belly.position.set(0, PLAYER_R * 1.05, PLAYER_R * 0.45);
  const head = shadowed(new THREE.Mesh(new THREE.SphereGeometry(PLAYER_R * 0.62, 20, 14), mat(color)));
  head.position.y = PLAYER_R * 2.35;
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 10), mat(0xff9f1c));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, PLAYER_R * 2.3, PLAYER_R * 0.7);
  body.add(torso, belly, head, beak);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0xffffff));
    eye.position.set(0.2 * s, PLAYER_R * 2.48, PLAYER_R * 0.5);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(0x111111));
    pupil.position.set(0.2 * s, PLAYER_R * 2.48, PLAYER_R * 0.6);
    const flipper = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat(color)));
    flipper.scale.set(0.35, 1, 0.6);
    flipper.position.set(PLAYER_R * 0.95 * s, PLAYER_R * 1.3, 0);
    flipper.rotation.z = 0.5 * s;
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6), mat(0xff9f1c));
    foot.scale.set(1, 0.35, 1.4);
    foot.position.set(0.3 * s, 0.08, 0.25);
    body.add(eye, pupil, flipper, foot);
  }
  // Golden aura while a mega shove is ready.
  const aura = new THREE.Mesh(
    new THREE.TorusGeometry(PLAYER_R * 1.25, 0.09, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.9 })
  );
  aura.rotation.x = Math.PI / 2;
  aura.position.y = 0.15;
  aura.visible = false;
  root.add(aura);
  const tag = label(name, hex(color));
  tag.position.y = PLAYER_R * 5;
  root.add(tag);
  root.userData = { body, aura, tag, sink: 0, phase: Math.random() * 10 };
  return root;
}

/** An orca, nose toward +z, about 6 units long. Lower jaw opens. */
function makeOrca() {
  const root = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.3, metalness: 0.15 });
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f5f7, roughness: 0.4 });
  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), black));
  body.scale.set(1.1, 1.05, 3);
  const bellyPatch = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14), white);
  bellyPatch.scale.set(0.85, 0.7, 2.3);
  bellyPatch.position.set(0, -0.42, 0.55);
  const jaw = new THREE.Group(); // pivots at the back of the mouth
  jaw.position.set(0, -0.25, 1.7);
  const jawMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), white);
  jawMesh.scale.set(0.7, 0.28, 1.15);
  jawMesh.position.set(0, -0.12, 0.85);
  jaw.add(jawMesh);
  // Teeth along the upper jaw line.
  const toothGeo = new THREE.ConeGeometry(0.06, 0.18, 5);
  for (let i = 0; i < 6; i++)
    for (const s of [-1, 1]) {
      const t = new THREE.Mesh(toothGeo, white);
      t.rotation.x = Math.PI;
      t.position.set(s * (0.42 - i * 0.05), -0.32, 2.1 + i * 0.16);
      root.add(t);
    }
  for (const s of [-1, 1]) {
    const eyePatch = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), white);
    eyePatch.scale.set(0.4, 0.55, 1.2);
    eyePatch.position.set(s * 0.9, 0.38, 1.55);
    const fin = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.6, 14, 8), black));
    fin.scale.set(1.3, 0.12, 0.6);
    fin.position.set(s * 1.25, -0.45, 0.8);
    fin.rotation.z = -0.5 * s;
    root.add(eyePatch, fin);
  }
  const dorsal = shadowed(new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.9, 4), black));
  dorsal.scale.set(0.25, 1, 1);
  dorsal.position.set(0, 1.55, -0.5);
  dorsal.rotation.x = -0.35;
  const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.5 }));
  saddle.scale.set(1.6, 0.4, 1.1);
  saddle.position.set(0, 0.78, -1.4);
  const tail = new THREE.Group();
  tail.position.set(0, 0, -3);
  for (const s of [-1, 1]) {
    const fluke = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.7, 14, 8), black));
    fluke.scale.set(1.4, 0.1, 0.55);
    fluke.position.set(s * 0.8, 0, -0.35);
    fluke.rotation.y = 0.45 * s;
    tail.add(fluke);
  }
  root.add(body, bellyPatch, jaw, dorsal, saddle, tail);
  root.userData = { jaw, tail };
  root.visible = false;
  return root;
}

function makeFish() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc300, emissive: 0xff9500, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 });
  const body = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), gold));
  body.scale.set(1.5, 0.8, 0.5);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 4), gold);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.75;
  g.add(body, tail);
  return g;
}

function makeIceberg(r) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + r() * 0.4), Math.max(-0.4, p.getY(i)) * (0.9 + r() * 0.7), p.getZ(i) * (0.8 + r() * 0.4));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.6, flatShading: true }));
  m.receiveShadow = true;
  return m;
}

// ---- renderer ---------------------------------------------------------------------------------

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(0xcfe9f8, 60, 160);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);

  // Reflections: a soft sky environment, so ice and water pick up the blue.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide }));
  envScene.add(envSky);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;

  scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x1d5f8a, 0.7));
  const sun = new THREE.DirectionalLight(0xfff3df, 1.9);
  sun.position.set(-14, 32, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 90 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // The sea: gentle swells plus a moving ripple normal map; a turquoise shallows glow under the sheet.
  const seaGeo = new THREE.PlaneGeometry(400, 400, 80, 80);
  const ripples = rippleNormals();
  const sea = new THREE.Mesh(
    seaGeo,
    new THREE.MeshStandardMaterial({ color: 0x0a4878, roughness: 0.18, metalness: 0.2, normalMap: ripples, normalScale: new THREE.Vector2(0.55, 0.55) })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_Y;
  sea.receiveShadow = true;
  scene.add(sea);
  const seaBase = seaGeo.attributes.position.array.slice();
  const shallows = new THREE.Mesh(
    new THREE.CircleGeometry(SHEET_RADIUS + 7, 64),
    new THREE.MeshBasicMaterial({ map: radialTexture([[0, "rgba(90,220,230,0.55)"], [0.7, "rgba(60,190,220,0.3)"], [1, "rgba(40,150,200,0)"]]), transparent: true, depthWrite: false })
  );
  shallows.rotation.x = -Math.PI / 2;
  shallows.position.y = SEA_Y + 0.03;
  scene.add(shallows);

  // Icebergs on the horizon, and a few small floes drifting near the sheet.
  const rr = rng(42);
  const floes = [];
  for (let i = 0; i < 9; i++) {
    const berg = makeIceberg(rr);
    const a = rr() * Math.PI * 2;
    const d = 55 + rr() * 70;
    const s = 4 + rr() * 9;
    berg.scale.set(s, s * (0.7 + rr() * 0.8), s);
    berg.position.set(Math.cos(a) * d, SEA_Y - s * 0.15, Math.sin(a) * d - 20);
    berg.rotation.y = rr() * 6;
    scene.add(berg);
  }
  for (let i = 0; i < 10; i++) {
    const floe = makeIceberg(rr);
    const a = rr() * Math.PI * 2;
    const d = SHEET_RADIUS + 5 + rr() * 14;
    const s = 0.6 + rr() * 1.2;
    floe.scale.set(s * 1.6, s * 0.35, s * 1.3);
    floe.position.set(Math.cos(a) * d, SEA_Y, Math.sin(a) * d);
    floe.userData = { a, d, phase: rr() * 6, speed: (rr() - 0.5) * 0.02 };
    scene.add(floe);
    floes.push(floe);
  }

  // The ice: one hexagonal slab per tile, frosted top, translucent blue sides.
  const tileGeo = new THREE.CylinderGeometry(TILE * 0.965, TILE * 0.88, 0.8, 6, 1);
  const topMats = [0, 1, 2].map((i) => new THREE.MeshStandardMaterial({ map: iceTexture(11 + i * 7), bumpMap: iceTexture(11 + i * 7), bumpScale: 2.2, roughness: 0.3, metalness: 0.02, envMapIntensity: 0.9 }));
  const crackedMat = new THREE.MeshStandardMaterial({ map: iceTexture(99, true), bumpMap: iceTexture(99, true), bumpScale: 3, roughness: 0.4, color: 0xd7ecf8 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x5fb4e0, roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.93, emissive: 0x0b4a72, emissiveIntensity: 0.35, envMapIntensity: 1.2 });
  const tiles = TILES.map((t, i) => {
    const top = topMats[i % topMats.length];
    // Material order for CylinderGeometry: side, top cap, bottom cap.
    const m = new THREE.Mesh(tileGeo, [sideMat, top, sideMat]);
    m.position.set(t.x, -0.38, t.z);
    m.rotation.y = (Math.floor(rr() * 6) * Math.PI) / 3; // hexes look the same rotated by 60°: hides the repeat
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData = { state: 0, vy: 0, top, spin: m.rotation.y };
    scene.add(m);
    return m;
  });

  // Drifting snow.
  const SNOW = 500;
  const snowGeo = new THREE.BufferGeometry();
  const snowPos = new Float32Array(SNOW * 3);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 70;
    snowPos[i * 3 + 1] = Math.random() * 30;
    snowPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
  }
  snowGeo.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
  const flake = radialTexture([[0, "rgba(255,255,255,1)"], [0.5, "rgba(255,255,255,0.6)"], [1, "rgba(255,255,255,0)"]]);
  const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ size: 0.35, map: flake, transparent: true, depthWrite: false, opacity: 0.9 }));
  scene.add(snow);

  const players = new Map();
  let fish = null;
  const particles = [];
  const orcas = []; // active attacks
  const orcaPool = [makeOrca(), makeOrca()];
  for (const o of orcaPool) scene.add(o);
  let shake = 0;
  let time = 0;

  function placeCamera() {
    const aspect = innerWidth / innerHeight;
    const span = SHEET_RADIUS + 1.5;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    const dist = Math.max(span / t, span / (t * aspect)) * 1.18;
    const tilt = 0.62;
    camera.position.set((Math.random() - 0.5) * shake, Math.cos(tilt) * dist, Math.sin(tilt) * dist + (Math.random() - 0.5) * shake);
    camera.lookAt(0, 0, 0.5);
    // Fog scales with the camera distance, so phones (far camera) don't drown in it.
    scene.fog.near = dist * 1.1;
    scene.fog.far = dist * 3.2;
  }
  let menuView = false;
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    // Splash on a phone: the menu card covers the lower half, so show the ice in the upper half.
    if (menuView && innerHeight > innerWidth) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.24, innerWidth, innerHeight);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();

  const puffGeo = new THREE.SphereGeometry(1, 6, 4);
  function puff(x, y, z, color, count, speed, size = 0.35) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      m.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      m.position.set(x, y, z);
      m.userData = { vx: Math.cos(a) * v, vy: 2 + Math.random() * speed, vz: Math.sin(a) * v, life: 0.6 + Math.random() * 0.5 };
      scene.add(m);
      particles.push(m);
    }
  }
  const splashAt = (x, z, big = 1) => puff(x, SEA_Y + 0.1, z, 0xe3f6ff, Math.round(22 * big), 6 * big, 0.32);

  /**
   * The orca: it breaches next to the fallen penguin, snaps it up and dives. Over open water it
   * leaps outward in an arc; through a hole in the ice it shoots straight up and drops back.
   */
  function orcaAttack(x, z, victim) {
    const orca = orcaPool.find((o) => !o.visible) ?? orcaPool[0];
    const d = Math.hypot(x, z);
    const inHole = d < SHEET_RADIUS - TILE;
    const dir = d > 0.01 ? { x: x / d, z: z / d } : { x: 0, z: 1 };
    orca.visible = true;
    orcas.push({ orca, x, z, dir, inHole, t: 0, victim, ate: false, splashed: false });
  }

  function stepOrcas(dt) {
    for (let i = orcas.length - 1; i >= 0; i--) {
      const a = orcas[i];
      a.t += dt;
      const T = 1.9; // seconds for the whole attack
      const u = Math.min(1, a.t / T);
      const { orca } = a;
      const ud = orca.userData;
      if (a.inHole) {
        // Straight up out of the hole, then back down.
        const h = Math.sin(u * Math.PI);
        orca.position.set(a.x, SEA_Y - 6 + h * 8.5, a.z);
        orca.rotation.set(-Math.PI / 2 + (u - 0.5) * 0.6, Math.atan2(a.dir.x, a.dir.z), 0);
      } else {
        // An arc outward over open water: starts under the penguin, ends 7 units further out.
        const s = -1 + u * 8;
        const h = Math.sin(u * Math.PI) * 5.2 - 2.2;
        orca.position.set(a.x + a.dir.x * s, SEA_Y + h, a.z + a.dir.z * s);
        const pitch = -Math.cos(u * Math.PI) * 0.9; // nose up rising, nose down diving
        orca.rotation.set(pitch, Math.atan2(a.dir.x, a.dir.z), 0);
      }
      ud.jaw.rotation.x = u < 0.32 ? Math.min(0.75, u * 3) : u < 0.42 ? 0.75 - (u - 0.32) * 7.5 : 0;
      ud.tail.rotation.x = Math.sin(a.t * 14) * 0.35;
      if (!a.splashed && u > 0.12) {
        a.splashed = true;
        splashAt(a.x, a.z, 1.5);
        sfxHook?.("breach");
      }
      if (!a.ate && u > 0.38) {
        a.ate = true;
        const p = players.get(a.victim);
        if (p) p.userData.eaten = true;
        puff(a.x, 1.2, a.z, 0xffffff, 10, 5, 0.18);
        sfxHook?.("chomp");
      }
      if (u >= 0.86 && !a.dove) {
        a.dove = true;
        splashAt(orca.position.x, orca.position.z, 1.2);
      }
      if (u >= 1) {
        orca.visible = false;
        orcas.splice(i, 1);
      }
    }
  }
  let sfxHook = null;

  return {
    /** Screen axes (right, up) to world (x, z): the camera looks toward -z. */
    toWorld: (sx, sy) => ({ mx: sx, mz: -sy }),
    /** true while the menu is up: on portrait screens the view moves up, above the menu card. */
    setMenuView(on) {
      if (menuView === on) return;
      menuView = on;
      resize();
    },
    /** Called with "breach" and "chomp" so the page can play sounds. */
    onSound(fn) {
      sfxHook = fn;
    },
    /** Draw a view. ease = 0 snaps to it; > 0 eases toward it (network snapshots). */
    sync(view, dt, ease = 0) {
      const k = ease ? 1 - Math.exp(-ease * dt) : 1;
      for (let i = 0; i < tiles.length; i++) {
        const m = tiles[i];
        const s = Number(view.tiles[i]);
        const u = m.userData;
        if (s === 0 && u.state !== 0) {
          // New round: the tile is back.
          m.position.set(TILES[i].x, -0.38, TILES[i].z);
          m.rotation.set(0, u.spin, 0);
          m.material[1] = u.top;
          m.visible = true;
          u.vy = 0;
        }
        if (s === 1 && u.state === 0) m.material[1] = crackedMat;
        u.state = s;
      }
      const seen = new Set();
      for (const e of view.players) {
        seen.add(e.id);
        let obj = players.get(e.id);
        const fresh = !obj;
        if (fresh) {
          obj = makeWaddler(e.slot, e.name ?? "");
          players.set(e.id, obj);
          scene.add(obj);
        }
        const u = obj.userData;
        const far = Math.hypot(obj.position.x - e.x, obj.position.z - e.z) > 5;
        if (!u.out || !e.out) {
          if (fresh || far || k === 1) obj.position.set(e.x, obj.position.y, e.z);
          else {
            obj.position.x += (e.x - obj.position.x) * k;
            obj.position.z += (e.z - obj.position.z) * k;
          }
        }
        let d = e.a - obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        obj.rotation.y += d * (fresh ? 1 : Math.min(1, dt * 12));
        u.slide = e.slide;
        u.aura.visible = !!e.mega;
        if (!e.out) (u.sink = 0), (u.eaten = false);
        u.out = e.out;
      }
      for (const [id, obj] of players)
        if (!seen.has(id)) {
          scene.remove(obj);
          players.delete(id);
        }
      if (view.fish && !fish) {
        fish = makeFish();
        scene.add(fish);
      } else if (!view.fish && fish) {
        scene.remove(fish);
        fish = null;
      }
      if (fish) fish.position.set(view.fish.x, 0.6, view.fish.z);
    },
    /** A penguin went into the sea at (x, z): splash, then the orca. */
    fall(x, z, id) {
      splashAt(x, z);
      shake = Math.max(shake, 0.6);
      orcaAttack(x, z, id);
    },
    splash(x, z) {
      splashAt(x, z);
      shake = Math.max(shake, 0.6);
    },
    bump(x, z, big) {
      puff(x, 1, z, 0xffffff, big ? 12 : 5, big ? 7 : 4, 0.18);
      if (big) shake = Math.max(shake, 0.35);
    },
    sparkle(x, z) {
      puff(x, 0.8, z, 0xffd60a, 16, 5, 0.15);
    },
    clear() {
      for (const obj of players.values()) scene.remove(obj);
      players.clear();
      if (fish) scene.remove(fish);
      fish = null;
      for (const a of orcas) a.orca.visible = false;
      orcas.length = 0;
    },
    frame(dt) {
      time += dt;
      // Swell the sea and slide its ripples.
      const pos = seaGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = seaBase[i * 3];
        const y = seaBase[i * 3 + 1];
        pos.array[i * 3 + 2] = Math.sin(x * 0.12 + time * 0.9) * 0.18 + Math.cos(y * 0.1 + time * 0.7) * 0.18;
      }
      pos.needsUpdate = true;
      seaGeo.computeVertexNormals();
      ripples.offset.set(time * 0.012, time * 0.007);
      for (const f of floes) {
        const u = f.userData;
        u.a += u.speed * dt;
        f.position.set(Math.cos(u.a) * u.d, SEA_Y + Math.sin(time * 1.3 + u.phase) * 0.08, Math.sin(u.a) * u.d);
        f.rotation.y += u.speed * dt * 4;
      }
      // Snow drifts down and around.
      const sp = snowGeo.attributes.position;
      for (let i = 0; i < SNOW; i++) {
        let y = sp.array[i * 3 + 1] - dt * (1.2 + (i % 7) * 0.15);
        if (y < SEA_Y) y += 30;
        sp.array[i * 3 + 1] = y;
        sp.array[i * 3] += Math.sin(time * 0.6 + i) * dt * 0.4;
      }
      sp.needsUpdate = true;
      // Cracking tiles shiver, dropped tiles tip over and sink.
      for (const m of tiles) {
        const u = m.userData;
        if (u.state === 1) {
          m.position.y = -0.38 + Math.sin(time * 40 + m.position.x) * 0.05;
          m.rotation.z = Math.sin(time * 33 + m.position.z) * 0.04;
        } else if (u.state === 2 && m.visible) {
          u.vy -= 7 * dt;
          m.position.y += u.vy * dt;
          m.rotation.x += dt * 0.9;
          if (m.position.y < -6) m.visible = false;
        }
      }
      stepOrcas(dt);
      for (const obj of players.values()) {
        const u = obj.userData;
        if (u.out) {
          u.sink += dt;
          // Bobbing in the water, waiting to be eaten.
          obj.position.y = SEA_Y - 0.6 - Math.min(u.sink, 0.6) * 0.5 + Math.sin(time * 6) * 0.08;
          u.tag.visible = false;
          obj.visible = !u.eaten && u.sink < 3;
          continue;
        }
        obj.visible = u.tag.visible = true;
        obj.position.y = 0;
        // Waddle when walking, belly-flop when sliding.
        const lean = u.slide ? -1.25 : 0;
        u.body.rotation.x += (lean - u.body.rotation.x) * Math.min(1, dt * 14);
        u.body.rotation.z = u.slide ? 0 : Math.sin(time * 9 + u.phase) * 0.08;
        u.body.position.y = u.slide ? 0.4 : 0;
        u.aura.rotation.z += dt * 3;
      }
      if (fish) {
        fish.rotation.y += dt * 2;
        fish.position.y = 0.6 + Math.sin(time * 4) * 0.15;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const u = p.userData;
        u.life -= dt;
        u.vy -= 12 * dt;
        p.position.x += u.vx * dt;
        p.position.y += u.vy * dt;
        p.position.z += u.vz * dt;
        p.material.opacity = Math.max(0, u.life * 1.5);
        if (u.life <= 0) {
          scene.remove(p);
          p.material.dispose();
          particles.splice(i, 1);
        }
      }
      shake = Math.max(0, shake - dt * 2.5);
      placeCamera();
      renderer.render(scene, camera);
    },
  };
}
