// Three.js scene for Thin Ice Tussle: sea, hex ice sheet, waddlers, fish and splashes, all built in
// code. The renderer only draws a "view" ({players, tiles, fish}); it never decides anything.

import * as THREE from "three";
import { TILES, TILE, PLAYER_R, SHEET_RADIUS, SLOT_COLORS } from "./rules.js";

const hex = (n) => `#${n.toString(16).padStart(6, "0")}`;

function label(text, color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d");
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

function makeWaddler(slot, name) {
  const color = SLOT_COLORS[slot];
  const root = new THREE.Group();
  const body = new THREE.Group(); // leans forward when sliding
  root.add(body);
  body.scale.setScalar(1.5);
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...extra });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(PLAYER_R, 24, 18), mat(color));
  torso.scale.set(1, 1.2, 0.95);
  torso.position.y = PLAYER_R * 1.15;
  const belly = new THREE.Mesh(new THREE.SphereGeometry(PLAYER_R * 0.8, 20, 14), mat(0xfaf7f0));
  belly.scale.set(0.9, 1.1, 0.6);
  belly.position.set(0, PLAYER_R * 1.05, PLAYER_R * 0.45);
  const head = new THREE.Mesh(new THREE.SphereGeometry(PLAYER_R * 0.62, 20, 14), mat(color));
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
    const flipper = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), mat(color));
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
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(PLAYER_R * 0.95, 20), new THREE.MeshBasicMaterial({ color: 0x0a3550, transparent: true, opacity: 0.25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);
  const tag = label(name, hex(color));
  tag.position.y = PLAYER_R * 5;
  root.add(tag);
  root.userData = { body, aura, shadow, tag, sink: 0, phase: Math.random() * 10 };
  return root;
}

function makeFish() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc300, emissive: 0xff9500, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 10), gold);
  body.scale.set(1.5, 0.8, 0.5);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 4), gold);
  tail.rotation.z = Math.PI / 2;
  tail.position.x = -0.75;
  g.add(body, tail);
  return g;
}

export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9d8f2);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a6f97, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(-12, 30, 18);
  scene.add(sun);

  // The sea, with a few slow swells.
  const seaGeo = new THREE.PlaneGeometry(260, 260, 60, 60);
  const sea = new THREE.Mesh(seaGeo, new THREE.MeshStandardMaterial({ color: 0x1b6ca8, roughness: 0.35, metalness: 0.1, flatShading: true }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -0.9;
  scene.add(sea);
  const seaBase = seaGeo.attributes.position.array.slice();

  // The ice: one hexagonal slab per tile.
  const tileGeo = new THREE.CylinderGeometry(TILE * 0.96, TILE * 0.9, 0.7, 6);
  const tiles = TILES.map((t) => {
    const tint = new THREE.Color(0xeef8ff).offsetHSL(0, 0, (Math.random() - 0.5) * 0.06);
    const m = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color: tint, roughness: 0.25, metalness: 0.05 }));
    m.position.set(t.x, -0.35, t.z);
    m.userData = { state: 0, vy: 0, base: m.material.color.clone() };
    scene.add(m);
    return m;
  });
  const CRACK = new THREE.Color(0x7fb3d5);

  const players = new Map();
  let fish = null;
  const particles = [];
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
  }
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  addEventListener("resize", resize);
  resize();

  function puff(x, y, z, color, count, speed, size = 0.35) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(size, 6, 4), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      m.position.set(x, y, z);
      m.userData = { vx: Math.cos(a) * v, vy: 2 + Math.random() * speed, vz: Math.sin(a) * v, life: 0.6 + Math.random() * 0.5 };
      scene.add(m);
      particles.push(m);
    }
  }

  return {
    /** Screen axes (right, up) to world (x, z): the camera looks toward -z. */
    toWorld: (sx, sy) => ({ mx: sx, mz: -sy }),
    /** Draw a view. ease = 0 snaps to it; > 0 eases toward it (network snapshots). */
    sync(view, dt, ease = 0) {
      const k = ease ? 1 - Math.exp(-ease * dt) : 1;
      for (let i = 0; i < tiles.length; i++) {
        const m = tiles[i];
        const s = Number(view.tiles[i]);
        const u = m.userData;
        if (s === 0 && u.state !== 0) {
          // New round: the tile is back.
          m.position.set(TILES[i].x, -0.35, TILES[i].z);
          m.rotation.set(0, 0, 0);
          m.material.color.copy(u.base);
          m.visible = true;
          u.vy = 0;
        }
        if (s === 1 && u.state === 0) m.material.color.copy(CRACK);
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
        if (fresh || far || k === 1) obj.position.set(e.x, obj.position.y, e.z);
        else {
          obj.position.x += (e.x - obj.position.x) * k;
          obj.position.z += (e.z - obj.position.z) * k;
        }
        let d = e.a - obj.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        obj.rotation.y += d * (fresh ? 1 : Math.min(1, dt * 12));
        u.slide = e.slide;
        u.aura.visible = !!e.mega;
        if (!e.out) u.sink = 0;
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
    splash(x, z) {
      puff(x, -0.6, z, 0xd6f0ff, 26, 6, 0.3);
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
    },
    frame(dt) {
      time += dt;
      // Swell the sea.
      const pos = seaGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = seaBase[i * 3];
        const y = seaBase[i * 3 + 1];
        pos.array[i * 3 + 2] = Math.sin(x * 0.18 + time * 1.2) * 0.25 + Math.cos(y * 0.15 + time) * 0.25;
      }
      pos.needsUpdate = true;
      // Cracking tiles shiver, dropped tiles tip over and sink.
      for (const m of tiles) {
        const u = m.userData;
        if (u.state === 1) {
          m.position.y = -0.35 + Math.sin(time * 40 + m.position.x) * 0.05;
          m.rotation.z = Math.sin(time * 33 + m.position.z) * 0.04;
        } else if (u.state === 2 && m.visible) {
          u.vy -= 9 * dt;
          m.position.y += u.vy * dt;
          m.rotation.x += dt * 0.8;
          if (m.position.y < -6) m.visible = false;
        }
      }
      for (const obj of players.values()) {
        const u = obj.userData;
        if (u.out) {
          u.sink += dt;
          obj.position.y = -u.sink * 2.2;
          u.tag.visible = u.shadow.visible = false;
          obj.visible = u.sink < 2;
          continue;
        }
        obj.visible = u.tag.visible = u.shadow.visible = true;
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
          particles.splice(i, 1);
        }
      }
      shake = Math.max(0, shake - dt * 2.5);
      placeCamera();
      renderer.render(scene, camera);
    },
  };
}
