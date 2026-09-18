// apps/web/src/dive3d.ts — RIFT DIVE 3D. The landing's showpiece: a real-time
// endless descent through six living biome worlds (one per game portal).
// Custom GLSL sky + energy rings, procedural dioramas, chase camera with
// vista slow-downs, and a 📸 photo mode that exports shareable PNGs — the
// dive markets itself. Decision: raw three.js (pinned CDN, lazy, post-paint)
// instead of threepipe — a viewer framework is the wrong tool for a bespoke
// scene; custom shaders are the whole point.
// Budgets: 0 shell bytes (dynamic import only), own code ≤25KB, three.js from
// CDN at runtime, 2D descent.ts stays as the fallback (WebGL fail / 2GB RAM /
// reduced motion). DPR governor + hidden-tab pause + zero per-frame alloc.
import { type World } from './descent.js';
import { chaptersOf, sagaIndex } from './sagas.js';
import { makeNoise2D, fbm, hashSeed, lsystem } from './procgen.js';
import {
  shouldUse3D, layoutLap, facedWorld, WORLD_GAP, RING_EVERY,
  layoutShards, stepShard, smoothApproach, portalHit, steerTarget,
  SHARD_COUNT, SHARD_COLORS, tunnelLength,
  lapShift, shardLapRot, ringLapRot,
} from './dive3d-layout.js';
import { THREE_PIN } from './three-lazy.js';
import { t } from './strings.js';

// ---------- palette ----------
const PALETTE = ['#C6F135', '#FF3D8A', '#46E0D4', '#FFE9A8'];
const BONE = '#F2EDE3';

export interface Dive3DOpts {
  onPortal?: (game: string) => void;
  /** Fires when the faced world changes (face-follow PLAY bar). */
  onFace?: (game: string) => void;
  /** LZ-3: fires each time the reader finishes chapter 6 (cliffhanger). */
  onFinale?: () => void;
  rift?: string;
  /** SG-1: which saga the dive reads (depth turns its pages). */
  saga?: number;
  /** LZ-3: boot the dive at a chapter (?ch= deep link). */
  startDepth?: number;
}

function hexColor(h: string): number {
  return parseInt(h.slice(1), 16);
}

// ---------- shaders ----------
const SKY_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SKY_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uAccent; uniform float uTime;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.55;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vUv * vec2(2.0, 1.0);
  float n = fbm(p * 3.0 + vec2(uTime * 0.008, 0.0));
  float n2 = fbm(p * 6.0 - vec2(0.0, uTime * 0.012));
  vec3 col = mix(uBot, uTop, vUv.y);
  col += uAccent * (n - 0.5) * 0.35;
  col += uAccent * smoothstep(0.62, 0.95, n2) * 0.30;
  float stars = step(0.9975, hash(floor(p * 220.0)));
  col += vec3(1.0) * stars * (0.4 + 0.6 * sin(uTime * 2.0 + hash(floor(p * 220.0)) * 40.0) * 0.5 + 0.5);
  gl_FragColor = vec4(col, 1.0);
}`;

const RING_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const RING_FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor; uniform float uTime; uniform float uSeed;
void main() {
  float ang = vUv.x * 6.28318;
  float dash = fract(ang * 2.549 + uTime * 0.35 + uSeed);
  float band = smoothstep(0.0, 0.12, dash) * smoothstep(0.55, 0.43, dash);
  float edge = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.82, vUv.y);
  float a = band * edge;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a * 0.85);
}`;

function glowTexture(T: any): any {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new T.CanvasTexture(c);
  return tex;
}

// ---------- world spirits (original chibi souls, anime grammar: big head,
// huge highlighted eyes, tiny mouth — painted procedurally, zero borrowed
// art; one 128px texture each, shared by every lap forever) ----------
// 0 Rin (orbit rings · sleepy planet, ring headband) · 1 Momo (candy dunes ·
// mochi, sparkle eyes) · 2 Usagi (ink garden · moon rabbit, long ears) ·
// 3 Jelli (neon reef · jellyfish idol, antennae) · 4 Ember (ember deep ·
// flame imp, horns + toothy grin) · 5 Hoshi (star nursery · star baby).
const SPIRIT_SKIN = ['#BFF3D8', '#FFC6E0', '#F2EDE3', '#9BF2EA', '#FFB37A', '#FFF3B0'];
function paintSpirit(g: CanvasRenderingContext2D, i: number): void {
  const skin = SPIRIT_SKIN[i]!;
  const cx = 64;
  const cy = 70;
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = skin;
  // extras behind the head
  if (i === 2) { // Usagi ears
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(42, 22, 10, 26, -0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(86, 22, 10, 26, 0.25, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#FF3D8A';
    g.beginPath(); g.ellipse(42, 24, 4, 14, -0.25, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(86, 24, 4, 14, 0.25, 0, Math.PI * 2); g.fill();
    g.fillStyle = skin;
  } else if (i === 4) { // Ember horns
    g.fillStyle = '#7A2E12';
    g.beginPath(); g.moveTo(28, 44); g.lineTo(20, 12); g.lineTo(44, 34); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(100, 44); g.lineTo(108, 12); g.lineTo(84, 34); g.closePath(); g.fill();
    g.fillStyle = skin;
  } else if (i === 3) { // Jelli antennae + dots
    g.strokeStyle = '#46E0D4'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(50, 30); g.quadraticCurveTo(44, 12, 36, 10); g.stroke();
    g.beginPath(); g.moveTo(78, 30); g.quadraticCurveTo(84, 12, 92, 10); g.stroke();
    g.fillStyle = '#46E0D4';
    g.beginPath(); g.arc(36, 10, 5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(92, 10, 5, 0, Math.PI * 2); g.fill();
    g.fillStyle = skin;
  }
  // head (Hoshi is a star)
  if (i === 5) {
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 46 : 22;
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath(); g.fill();
  } else {
    g.beginPath(); g.arc(cx, cy, 44, 0, Math.PI * 2); g.fill();
  }
  if (i === 0) { // Rin ring headband
    g.strokeStyle = '#C6F135'; g.lineWidth = 6;
    g.beginPath(); g.ellipse(cx, cy - 8, 52, 14, -0.2, 0, Math.PI * 2); g.stroke();
  }
  // eyes: white + pupil + highlight (sleepy Rin gets ^ ^ arcs instead)
  if (i === 0) {
    g.strokeStyle = '#2B2144'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.arc(48, 72, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.beginPath(); g.arc(80, 72, 9, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  } else {
    for (const ex of [48, 80]) {
      g.fillStyle = '#fff';
      g.beginPath(); g.ellipse(ex, 70, 10, 13, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2B2144';
      g.beginPath(); g.arc(ex, 72, 5.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ex - 2, 70, 2, 0, Math.PI * 2); g.fill();
      if (i === 1 || i === 5) { // sparkle eyes: second glint
        g.fillStyle = '#C6F135';
        g.beginPath(); g.arc(ex + 3, 76, 1.4, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // mouths
  g.strokeStyle = '#2B2144'; g.lineWidth = 3.5; g.lineCap = 'round';
  g.fillStyle = '#2B2144';
  if (i === 4) { // toothy grin
    g.beginPath(); g.arc(cx, 84, 12, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(60, 88, 8, 7);
  } else if (i === 3) {
    g.beginPath(); g.arc(cx, 88, 6, 0, Math.PI * 2); g.fill(); // idol 'o'
  } else {
    g.beginPath(); g.arc(cx, 86, 6, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); // smile
  }
  // blush
  g.fillStyle = 'rgba(255,61,138,.4)';
  g.beginPath(); g.ellipse(36, 84, 7, 4.5, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(92, 84, 7, 4.5, 0, 0, Math.PI * 2); g.fill();
}
function spiritTextures(T: any): any[] {
  const out: any[] = [];
  for (let i = 0; i < 6; i++) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    paintSpirit(c.getContext('2d')!, i);
    out.push(new T.CanvasTexture(c));
  }
  return out;
}

export async function startDive3D(oldCv: HTMLCanvasElement, opts: Dive3DOpts = {}): Promise<{ stop: () => void }> {
  // A canvas that held a 2D context can never mint a WebGL one — swap in a
  // fresh canvas carrying the same identity (id/class/style/aria).
  const cv = document.createElement('canvas');
  cv.id = oldCv.id;
  cv.className = oldCv.className;
  cv.setAttribute('style', oldCv.getAttribute('style') ?? '');
  const label = oldCv.getAttribute('aria-label');
  if (label) cv.setAttribute('aria-label', label);
  oldCv.replaceWith(cv);
  const T = await import(/* @vite-ignore */ THREE_PIN);
  // SG-1: chapters replace random worlds — same World shape, story carried.
  const WORLDS = chaptersOf(opts.saga ?? 0);
  const ACCENT = WORLDS.map((w) => hexColor(w.accent));
  const mulberry = (seed: number): (() => number) => {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  };

  const renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new T.Scene();
  scene.fog = new T.FogExp2(0x070708, 0.0042);
  const camera = new T.PerspectiveCamera(62, 1, 0.1, 1200);

  // sky dome (follows camera z)
  const skyUni = {
    uTop: { value: new T.Color('#1E1033') },
    uBot: { value: new T.Color('#070708') },
    uAccent: { value: new T.Color(ACCENT[0]) },
    uTime: { value: 0 },
  };
  const sky = new T.Mesh(
    new T.SphereGeometry(560, 24, 16),
    new T.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: skyUni, side: T.BackSide, depthWrite: false, fog: false }),
  );
  scene.add(sky);

  const glowTex = glowTexture(T);
  const spirits = spiritTextures(T);

  // shared geometry / materials
  const GEO = {
    sphere: new T.SphereGeometry(1, 20, 14),
    ball: new T.SphereGeometry(1, 10, 8),
    box: new T.BoxGeometry(1, 1, 1),
    cone: new T.ConeGeometry(1, 1, 10),
    ring: new T.RingGeometry(0.94, 1.0, 72),
    plane: new T.PlaneGeometry(1, 1),
    cyl: new T.CylinderGeometry(0.5, 0.7, 1, 8),
  };
  const matCache = new Map<string, any>();
  const mat = (color: number, extra: Record<string, unknown> = {}): any => {
    const key = `${color}${JSON.stringify(extra)}`;
    let m = matCache.get(key);
    if (!m) { m = new T.MeshBasicMaterial({ color, ...extra }); matCache.set(key, m); }
    return m;
  };
  const ringMatCache = new Map<number, any>();
  const ringMat = (color: number, seed: number): any => {
    let m = ringMatCache.get(color);
    if (!m) {
      m = new T.ShaderMaterial({
        vertexShader: RING_VERT, fragmentShader: RING_FRAG,
        uniforms: { uColor: { value: new T.Color(color) }, uTime: { value: 0 }, uSeed: { value: seed } },
        transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending,
      });
      ringMatCache.set(color, m);
    }
    return m;
  };

  // starfield: two parallax shells
  function makeStars(count: number, spread: number, size: number): any {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
      pos[i * 3 + 2] = -Math.random() * 1100;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, opacity: 0.8, depthWrite: false }));
    scene.add(pts);
    return pts;
  }
  const stars1 = makeStars(900, 500, 1.6);
  const stars2 = makeStars(500, 300, 2.6);

  // tunnel rings (pooled, wrap endlessly)
  const RINGS = 44;
  const rings: any[] = [];
  for (let i = 0; i < RINGS; i++) {
    const m = new T.Mesh(GEO.ring, ringMat(hexColor(PALETTE[i % PALETTE.length]!), (i * 0.37) % 1));
    const r = 26 + (i % 5) * 7;
    m.scale.set(r, r, 1);
    m.position.z = -i * RING_EVERY;
    m.rotation.z = i * 0.7;
    (m as any).userData.spin = 0.05 + (i % 4) * 0.03;
    scene.add(m);
    rings.push(m);
  }

  // drifting motes (pooled positions, wrap past camera)
  const MOTES = 320;
  const motePos = new Float32Array(MOTES * 3);
  const moteVel = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    motePos[i * 3] = (Math.random() - 0.5) * 160;
    motePos[i * 3 + 1] = (Math.random() - 0.5) * 160;
    motePos[i * 3 + 2] = -Math.random() * 1100;
    moteVel[i] = 4 + Math.random() * 10;
  }
  const moteGeo = new T.BufferGeometry();
  moteGeo.setAttribute('position', new T.BufferAttribute(motePos, 3));
  const motes = new T.Points(moteGeo, new T.PointsMaterial({ color: 0xc6f135, size: 1.1, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(motes);

  // ---------- shard spiral (the STAR NURSERY look): hundreds of colored
  // dashes wound in a helix — ONE InstancedMesh = 1 draw call. Pooled:
  // states mutate in place, one reused dummy poses them, colors set once.
  const SHARD_SPAN = tunnelLength();
  const shardSeed = (opts.rift ?? 'RIFT').split('').reduce((a, c) => a + c.charCodeAt(0) * 31, 7);
  const shards = layoutShards(SHARD_COUNT, shardSeed);
  const shardMesh = new T.InstancedMesh(
    new T.PlaneGeometry(2.4, 0.75),
    new T.MeshBasicMaterial({ side: T.DoubleSide }),
    shards.length,
  );
  {
    const col = new T.Color('#ffffff');
    for (let i = 0; i < shards.length; i++) {
      col.set(SHARD_COLORS[shards[i]!.color]!);
      shardMesh.setColorAt(i, col);
    }
    if (shardMesh.instanceColor) shardMesh.instanceColor.needsUpdate = true;
  }
  shardMesh.frustumCulled = false;
  scene.add(shardMesh);
  const shardDummy = new T.Object3D();
  // DDV-1 lap turnover: shard colors ease to the new lap's rotation over
  // ~2s (no pop — the dream deepens). One target buffer; frames ease toward
  // it exponentially and snap exact at the end. Zero per-frame alloc
  // outside the transition window.
  const shardTo = new Float32Array(shards.length * 3);
  let shardLapShown = 0;
  let shardMix = 1;
  const shardCol = new T.Color('#ffffff');

  // ---------- cinematic atmosphere: foreground fronds (IMAX parallax) +
  // light shafts. They ride the camera (repositioned, never reallocated);
  // dark silhouettes up front + additive shafts = instant depth on any scene.
  const fronds: any[] = [];
  const frondMat = new T.SpriteMaterial({ map: glowTex, color: 0x030304, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 4; i++) {
    const f = new T.Sprite(frondMat);
    const wide = i % 2 === 0;
    f.scale.set(wide ? 46 : 26, wide ? 16 : 34, 1);
    f.userData.side = i < 2 ? -1 : 1;
    f.userData.lane = i % 2;
    scene.add(f);
    fronds.push(f);
  }
  const shafts: any[] = [];
  const shaftMat = new T.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.05, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const m = new T.Mesh(GEO.plane, shaftMat);
    m.scale.set(10 + i * 7, 130, 1);
    m.rotation.z = 0.35 + i * 0.12;
    m.userData.lane = i;
    scene.add(m);
    shafts.push(m);
  }
  const fogTarget = new T.Color('#070708');
  const moteTarget = new T.Color('#c6f135');

  // ---------- biome builders (one group per world heart) ----------
  function buildBiome(group: any, index: number, seed: number, world: World): void {
    const accent = hexColor(world.accent); // SG-1: the CHAPTER's accent, not the builder's
    const rand = mulberry(seed);
    const noise = makeNoise2D(hashSeed(`${world.name}|${seed}`));
    // Baked fBm roughening (build-time once per lap recycle — zero per-frame
    // cost, no normal recompute: all biome mats are unlit). Clones only: SHARED
    // GEO must never be touched.
    const roughen = (geo: any, freq: number, amt: number): any => {
      const g = geo.clone();
      const pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const n = fbm(noise, x * freq + 7.3, (y + z) * freq, 3);
        const s = 1 + n * amt;
        pos.setXYZ(i, x * s, y * s, z * s);
      }
      return g;
    };
    const add = (mesh: any, x: number, y: number, z: number): any => { mesh.position.set(x, y, z); group.add(mesh); return mesh; };
    const glow = (color: number, s: number, x: number, y: number, z: number): void => {
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending }));
      sp.scale.set(s, s, 1);
      add(sp, x, y, z);
    };
    if (index === 0) {
      // ORBIT RINGS — banded planet + 3 tilted rings + 2 moons
      const core = add(new T.Mesh(GEO.sphere, mat(accent)), 0, 0, 0);
      core.scale.set(7, 7, 7);
      glow(accent, 34, 0, 0, -2);
      for (let i = 0; i < 3; i++) {
        const r = add(new T.Mesh(GEO.ring, ringMat(hexColor(PALETTE[(index + i) % PALETTE.length]!), i * 0.31)), 0, 0, 0);
        const s = 10 + i * 3.4;
        r.scale.set(s, s, 1);
        r.rotation.x = Math.PI / 2.4 + i * 0.22;
        r.rotation.y = i * 0.4;
        (r as any).userData.orbitRing = 0.1 + i * 0.06;
      }
      for (let i = 0; i < 2; i++) {
        const moon = add(new T.Mesh(GEO.ball, mat(0xf2ede3)), 0, 0, 0);
        moon.scale.setScalar(1.2 + i * 0.7);
        (moon as any).userData.moon = { r: 12 + i * 4, sp: 0.25 + i * 0.14, ph: rand() * 6.28 };
      }
    } else if (index === 1) {
      // CANDY DUNES — faceted dune mound + orbiting sprinkles
      const dune = add(new T.Mesh(roughen(GEO.sphere, 0.35, 0.17), mat(0x5b2d5e, { wireframe: true })), 0, -3, 0);
      dune.scale.set(11, 4.5, 11);
      glow(accent, 30, 0, 2, -2);
      for (let i = 0; i < 16; i++) {
        const sp = add(new T.Mesh(GEO.box, mat(hexColor(i % 2 ? '#FF3D8A' : '#C6F135'))), 0, 0, 0);
        sp.scale.set(0.7, 0.25, 0.25);
        (sp as any).userData.sprinkle = { r: 9 + rand() * 5, sp: 0.3 + rand() * 0.5, ph: rand() * 6.28, y: 1 + rand() * 6 };
      }
    } else if (index === 2) {
      // INK GARDEN — dark moon + branch arc + drifting petals
      const moon = add(new T.Mesh(GEO.sphere, mat(0xe8e2d2)), 9, 9, -4);
      moon.scale.setScalar(2.6);
      const branch = add(new T.Mesh(GEO.cyl, mat(0x3a3a48)), -3, 0, 2);
      branch.scale.set(0.7, 16, 0.7);
      branch.rotation.z = 1.05;
      glow(0xff3d8a, 22, -2, 2, 0);
      const n = 42;
      const pp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pp[i * 3] = (rand() - 0.5) * 26; pp[i * 3 + 1] = (rand() - 0.5) * 20; pp[i * 3 + 2] = (rand() - 0.5) * 14; }
      const pg = new T.BufferGeometry();
      pg.setAttribute('position', new T.BufferAttribute(pp, 3));
      const petals = new T.Points(pg, new T.PointsMaterial({ color: 0xffc6e0, size: 0.9, transparent: true, opacity: 0.8, depthWrite: false }));
      (petals as any).userData.petals = true;
      group.add(petals);
    } else if (index === 3) {
      // NEON REEF — synthwave sun + grid + jellyfish
      const sun = add(new T.Mesh(GEO.sphere, mat(0xffe9a8)), 0, 6, -10);
      sun.scale.set(6, 6, 0.5);
      glow(0xff3d8a, 36, 0, 6, -10);
      const gridPts: number[] = [];
      for (let i = -6; i <= 6; i++) { gridPts.push(i * 3, -6, 0, i * 3, 8, -40); }
      for (let i = 0; i <= 6; i++) { const z = -i * 6; gridPts.push(-18, -6 + i * 2.2, z, 18, -6 + i * 2.2, z); }
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.BufferAttribute(new Float32Array(gridPts), 3));
      group.add(new T.LineSegments(gg, new T.LineBasicMaterial({ color: 0x46e0d4, transparent: true, opacity: 0.5 })));
      for (let i = 0; i < 3; i++) {
        const j = add(new T.Mesh(GEO.cone, mat(i % 2 ? 0xff3d8a : 0x46e0d4, { transparent: true, opacity: 0.85 })), -8 + i * 8, 0, -4 - i * 3);
        j.scale.set(1.6, 2.6, 1.6);
        j.rotation.x = Math.PI;
        (j as any).userData.jelly = { ph: rand() * 6.28, base: j.position.y };
      }
    } else if (index === 4) {
      // EMBER DEEP — basalt pillars + rising embers
      for (let i = 0; i < 6; i++) {
        const h = 6 + rand() * 9;
        const pil = add(new T.Mesh(GEO.box, mat(0x1e0f0c)), -12 + i * 4.6 + rand() * 2, -8 + h / 2, -4 + rand() * 6);
        pil.scale.set(2.4, h, 2.4);
        const cap = add(new T.Mesh(GEO.box, mat(0xff7a1a)), pil.position.x, -8 + h + 0.2, pil.position.z);
        cap.scale.set(2.5, 0.35, 2.5);
      }
      glow(0xff7a1a, 30, 0, -2, 0);
      const n = 60;
      const ep = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { ep[i * 3] = (rand() - 0.5) * 28; ep[i * 3 + 1] = rand() * 20 - 8; ep[i * 3 + 2] = (rand() - 0.5) * 16; }
      const eg = new T.BufferGeometry();
      eg.setAttribute('position', new T.BufferAttribute(ep, 3));
      const embers = new T.Points(eg, new T.PointsMaterial({ color: 0xff9a3d, size: 1.0, transparent: true, opacity: 0.9, depthWrite: false }));
      (embers as any).userData.embers = true;
      group.add(embers);
    } else {
      // STAR NURSERY — bright heart + nebula sprites + twinkles
      const heart = add(new T.Mesh(GEO.sphere, mat(0xffffff)), 0, 0, 0);
      heart.scale.setScalar(1.6);
      (heart as any).userData.heart = true;
      glow(0xc6f135, 30, 0, 0, -2);
      const cols = [0xff3d8a, 0x46e0d4, 0x7a5cff];
      for (let i = 0; i < 3; i++) {
        const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, color: cols[i], transparent: true, opacity: 0.4, depthWrite: false, blending: T.AdditiveBlending }));
        sp.scale.set(26 + i * 8, 26 + i * 8, 1);
        add(sp, (rand() - 0.5) * 16, (rand() - 0.5) * 14, -6 - i * 3);
      }
    }
    // ---- LZ-2 motif overlay: the chapter's signature, built from shared
    // primitives + chapter accent + seed. One draw call per Points/Line set,
    // static meshes ride the camera's motion (parallax = life, zero CPU).
    const motif = (world as World & { motif?: string }).motif ?? '';
    const mseed = hashSeed(`${world.name}|${motif}|${seed}`);
    const mr = mulberry(mseed);
    const scatter = (n: number, color: number, size: number, sx: number, sy: number, sz: number, y0: number): void => {
      const pp = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pp[i * 3] = (mr() - 0.5) * sx;
        pp[i * 3 + 1] = y0 + mr() * sy;
        pp[i * 3 + 2] = (mr() - 0.5) * sz;
      }
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.BufferAttribute(pp, 3));
      const pts = new T.Points(gg, new T.PointsMaterial({ color, size, transparent: true, opacity: 0.85, depthWrite: false }));
      (pts as any).userData.embers = true;
      group.add(pts);
    };
    const vineLines = (axiom: string, rules: Record<string, string>, x0: number, y0: number, step: number): void => {
      const s = lsystem(axiom, rules, 3);
      const pts: number[] = [];
      const stack: number[] = [];
      let a = -Math.PI / 2;
      let px = x0;
      let py = y0;
      for (const ch of s) {
        if (ch === 'F') {
          const nx = px + Math.cos(a) * step;
          const ny = py + Math.sin(a) * step;
          pts.push(px, py, 0, nx, ny, 0);
          px = nx;
          py = ny;
        } else if (ch === '+') { a += 0.42; } else if (ch === '-') { a -= 0.42; }
        else if (ch === '[') { stack.push(px, py, a); }
        else if (ch === ']') { a = stack.pop() ?? a; py = stack.pop() ?? py; px = stack.pop() ?? px; }
      }
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.BufferAttribute(new Float32Array(pts), 3));
      group.add(new T.LineSegments(gg, new T.LineBasicMaterial({ color: 0x2e5e4e, transparent: true, opacity: 0.9 })));
    };
    if (motif === 'ash dunes' || motif === 'lantern cliffs' || motif === 'volcanic isle') {
      scatter(46, hexColor(motif === 'volcanic isle' ? '#FF7A1A' : '#C9BFAE'), 0.9, 30, 20, 16, -6);
      if (motif === 'lantern cliffs') {
        for (let i = 0; i < 5; i++) glow(accent, 7 + mr() * 5, -12 + i * 6 + mr() * 3, -2 + mr() * 10, -3);
      }
      if (motif === 'volcanic isle') {
        const cone = add(new T.Mesh(roughen(GEO.cone, 0.3, 0.22), mat(0x0d0605)), 0, -4, -6);
        cone.scale.set(9, 13, 9);
        glow(0xff5a1a, 26, 0, 3.5, -6); // crater mouth
      }
    } else if (motif === 'reef lanes') {
      const lp: number[] = [];
      for (let i = 0; i < 7; i++) {
        const y = -4 + i * 1.8;
        lp.push(-16, y, -2, 16, y + (mr() - 0.5) * 3, -2);
      }
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.BufferAttribute(new Float32Array(lp), 3));
      group.add(new T.LineSegments(gg, new T.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.4 })));
      scatter(30, accent, 0.8, 30, 14, 12, -5);
    } else if (motif === 'trial rings' || motif === 'whirlpool rings') {
      for (let i = 0; i < (motif === 'whirlpool rings' ? 2 : 1); i++) {
        const r = add(new T.Mesh(GEO.ring, ringMat(accent, 2.7 + i)), 0, 1 - i * 2, -3);
        const s = 13 + i * 4;
        r.scale.set(s, s, 1);
        r.rotation.x = Math.PI / 2.1 + i * 0.3;
        (r as any).userData.orbitRing = (i === 0 ? -0.16 : 0.1);
      }
      glow(accent, 20, 0, 1, -3);
    } else if (motif === 'mask garden' || motif === 'parley cove') {
      vineLines('F', { F: 'F[+F]F[-F]F' }, -6, -8, 1.4);
      vineLines('F', { F: 'FF-[-F+F]+[+F-F]' }, 6, -8, 1.2);
      for (let i = 0; i < 3; i++) {
        const bx = -7 + i * 7;
        add(new T.Mesh(GEO.cyl, mat(0x2a2a34)), bx, -4, 1).scale.set(0.9, 7, 0.9);
        const head = add(new T.Mesh(GEO.sphere, mat(accent, { transparent: true, opacity: 0.92 })), bx, 0.6, 1);
        head.scale.set(1.5, 1.9, 1.2);
        glow(accent, 10, bx, 0.6, 1.5);
      }
    } else if (motif === 'living chart' || motif === 'star mural' || motif === 'crown forge') {
      const lp: number[] = [];
      let px = -14;
      let py = -2;
      for (let i = 0; i < 7; i++) {
        const nx = px + 3 + mr() * 3;
        const ny = py + (mr() - 0.5) * 7;
        lp.push(px, py, -2, nx, ny, -2);
        px = nx;
        py = ny;
      }
      const gg = new T.BufferGeometry();
      gg.setAttribute('position', new T.BufferAttribute(new Float32Array(lp), 3));
      group.add(new T.LineSegments(gg, new T.LineBasicMaterial({ color: accent, transparent: true, opacity: 0.75 })));
      scatter(36, 0xffffff, 0.7, 30, 18, 10, -6);
      if (motif === 'crown forge') {
        const band = add(new T.Mesh(GEO.ring, ringMat(accent, 4.2)), 0, 2, -2);
        band.scale.set(9, 9, 1);
        band.rotation.x = -Math.PI / 2.3;
        (band as any).userData.orbitRing = 0.08;
        glow(accent, 24, 0, 2, -2);
      } else {
        glow(0x7a5cff, 30, 0, 0, -8); // nebula heart
      }
    }
  }

  // ---------- lap groups (2 live laps, recycled endlessly) ----------
  interface LapGroup {
    group: any;
    lap: number;
    animated: { obj: any; kind: string; data?: any }[];
    hearts: { x: number; z: number; game: string }[];
  }
  const SHARED_GEO = new Set(Object.values(GEO));
  function sharedMats(): Set<any> {
    return new Set([...matCache.values(), ...ringMatCache.values()]);
  }
  function clearGroup(group: any): void {
    const shared = sharedMats();
    group.traverse((o: any) => {
      const g = o.geometry as { dispose?: () => void } | undefined;
      if (g && !SHARED_GEO.has(g as never) && g.dispose) { try { g.dispose(); } catch { /* noop */ } }
      const m = o.material as { dispose?: () => void } | undefined;
      if (m && !shared.has(m) && m.dispose) { try { m.dispose(); } catch { /* noop */ } }
    });
    group.clear();
  }
  function collectAnimated(group: any, animated: LapGroup['animated']): void {
    animated.length = 0;
    group.traverse((o: any) => {
      if (o.userData.moon) animated.push({ obj: o, kind: 'moon', data: o.userData.moon });
      else if (o.userData.sprinkle) animated.push({ obj: o, kind: 'sprinkle', data: o.userData.sprinkle });
      else if (o.userData.orbitRing) animated.push({ obj: o, kind: 'orbitRing', data: o.userData.orbitRing });
      else if (o.userData.jelly) animated.push({ obj: o, kind: 'jelly', data: o.userData.jelly });
      else if (o.userData.heart) animated.push({ obj: o, kind: 'heart' });
      else if (o.userData.embers) animated.push({ obj: o, kind: 'embers' });
      else if (o.userData.petals) animated.push({ obj: o, kind: 'petals' });
      else if (o.userData.spirit) animated.push({ obj: o, kind: 'spirit', data: o.userData.spirit });
    });
  }
  function fillLap(group: any, lap: number, animated: LapGroup['animated'], hearts: LapGroup['hearts']): void {
    hearts.length = 0;
    const placed = layoutLap(WORLDS, lap);
    for (const p of placed) {
      hearts.push({ x: p.x, z: p.z, game: p.world.game });
      const holder = new T.Group();
      holder.position.set(p.x, 0, p.z);
      const bi = p.world.biome ?? p.index; // chapter reuses a builder till LZ-2
      buildBiome(holder, bi, p.seed, p.world);
      // resident spirit: the world's soul, bobbing above its heart.
      const spirit = new T.Sprite(new T.SpriteMaterial({ map: spirits[bi], transparent: true, depthWrite: false }));
      spirit.scale.set(7, 7, 1);
      spirit.position.set(0, 11, 0);
      (spirit as any).userData.spirit = { base: 11, ph: (p.seed % 628) / 100 };
      holder.add(spirit);
      // portal core: invisible-feel hit sphere (raycast target)
      const core = new T.Mesh(GEO.sphere, new T.MeshBasicMaterial({ color: ACCENT[p.index]!, transparent: true, opacity: 0.0, depthWrite: false }));
      core.scale.setScalar(8.5);
      (core as any).userData.portal = p.world.game;
      (core as any).userData.worldIndex = p.index;
      holder.add(core);
      group.add(holder);
    }
    collectAnimated(group, animated);
  }
  function buildLap(lap: number): LapGroup {
    const group = new T.Group();
    const animated: LapGroup['animated'] = [];
    const hearts: LapGroup['hearts'] = [];
    fillLap(group, lap, animated, hearts);
    scene.add(group);
    return { group, lap, animated, hearts };
  }
  const laps: LapGroup[] = [];
  laps.push(buildLap(0), buildLap(1));

  // ---------- overlay UI: caption + photo button ----------
  const parent = cv.parentElement;
  if (parent) {
    const cs = window.getComputedStyle(parent);
    if (cs.position === 'static') parent.style.position = 'relative';
  }
  const cap = document.createElement('div');
  cap.setAttribute('aria-live', 'polite');
  cap.style.cssText = 'position:absolute;left:12px;bottom:10px;z-index:3;pointer-events:none;font:800 12px/1.5 system-ui;color:#F2EDE3;text-shadow:0 2px 10px #000;letter-spacing:.04em';
  cv.after(cap);
  const photo = document.createElement('button');
  photo.textContent = t('dive.photo');
  photo.setAttribute('aria-label', t('dive.photoAria'));
  photo.style.cssText = 'position:absolute;right:12px;top:10px;z-index:3;cursor:pointer;border:2px solid rgba(198,241,53,.7);background:rgba(7,7,8,.6);color:#C6F135;border-radius:999px;padding:8px 14px;font:800 13px system-ui;backdrop-filter:blur(6px)';
  cv.after(photo);

  async function capture(): Promise<void> {
    render(performance.now() / 1000, 0.016); // fresh frame, then grab synchronously
    const blob = await new Promise<Blob | null>((res) => cv.toBlob((b) => res(b), 'image/png'));
    const world = WORLDS[faced]!;
    const sagaIdx = sagaIndex(opts.saga ?? 0);
    const link = `${location.origin}${location.pathname}?rift=${encodeURIComponent(opts.rift ?? '')}&game=${world.game}&saga=${sagaIdx}&ch=${faced}`;
    const name = `saga-${sagaIdx}-ch${faced + 1}-${world.game}.png`;
    try {
      const nav = navigator as unknown as { share?: (d: object) => Promise<void>; canShare?: (d: object) => boolean };
      if (blob && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
        const file = new File([blob], name, { type: 'image/png' });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: `${world.name} — ${world.sub}`, url: link });
          return;
        }
      }
      throw new Error('no native share');
    } catch {
      try {
        if (blob) {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = name;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        }
        await navigator.clipboard.writeText(t('dive.invite', { name: world.name, link }));
        say(t('dive.saved'));
      } catch { say(t('dive.blocked')); }
    }
  }
  photo.addEventListener('click', () => { void capture(); });
  // Perf truth (QA budgets): tiny fps chip, same thresholds as game pills.
  const fpsChip = document.createElement('div');
  fpsChip.setAttribute('aria-label', '3D scene frame rate');
  fpsChip.style.cssText = 'position:absolute;right:12px;bottom:10px;z-index:3;pointer-events:none;font:700 11px system-ui;color:#C6F135;background:rgba(7,7,8,.55);border:1px solid rgba(198,241,53,.4);border-radius:999px;padding:4px 10px';
  fpsChip.textContent = '–fps';
  cv.after(fpsChip);
  // First-flight coach mark (the only tutorial the site has): fades in 7s.
  const steerHint = document.createElement('div');
  steerHint.textContent = t('dive.steer');
  steerHint.style.cssText = 'position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:3;pointer-events:none;font:800 12px system-ui;color:#F2EDE3;background:rgba(7,7,8,.6);border:1px solid rgba(70,224,212,.5);border-radius:999px;padding:8px 16px;white-space:nowrap;max-width:94%;overflow:hidden;text-overflow:ellipsis';
  cv.after(steerHint);
  window.setTimeout(() => { try { steerHint.remove(); } catch { /* gone */ } }, 7000);

  // ---------- controls: the site IS the ride ----------
  // Hover/drag steers the camera (choosing = steering); diving INTO a portal
  // ring enters its game (tap still works — flight is additive, never the
  // only door). Passive users still arrive: auto-dive never stops.
  let depth = Math.min(5.999, Math.max(0, opts.startDepth ?? 0));
  let target = depth;
  let faced = 0;
  let lastFaced = -1;
  let lastLap = Math.floor(depth / 6);
  let lastFlyAt = 0;
  let steerTX = 0;
  let steerTY = 2;
  let camX = 0;
  let camY = 4;
  let dragging = false;
  let lastY = 0;
  let downX = 0;
  let downY = 0;
  let moved = 0;
  let bankX = 0;
  cv.style.touchAction = 'pan-y';
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    target += e.deltaY * 0.0016 * 2.2;
  }, { passive: false });
  cv.addEventListener('pointerdown', (e) => {
    dragging = true; moved = 0; lastY = e.clientY; downX = e.clientX; downY = e.clientY;
    try { cv.setPointerCapture(e.pointerId); } catch { /* noop */ }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dy = lastY - e.clientY;
    lastY = e.clientY;
    moved += Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY);
    target += dy * 0.006;
    bankX += (e.clientX - downX) * 0.0004;
  });
  // Hover steers (mouse); touch steers via the drag above. Cheap: no alloc.
  cv.addEventListener('pointermove', (e) => {
    const r = cv.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const t = steerTarget(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -(((e.clientY - r.top) / r.height) * 2 - 1),
    );
    steerTX = t.x;
    steerTY = t.y;
  });
  const endDrag = (): void => { dragging = false; };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);

  const ray = new T.Raycaster();
  const ndc = new T.Vector2();
  const camTarget = new T.Vector3();
  const tmpV = new T.Vector3();
  cv.addEventListener('click', (e) => {
    if (moved > 14) return; // it was a drag
    const r = cv.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(laps.flatMap((l) => l.group.children.flatMap((h: any) => h.children)), false);
    const portal = (hits as any[]).find((h) => h.object?.userData?.portal);
    if (portal) opts.onPortal?.(portal.object.userData.portal);
    else opts.onPortal?.(WORLDS[faced]!.game); // missed the orb: faced world
  });

  function say(m: string): void {
    cap.textContent = m;
    window.setTimeout(() => { if (!dead) paintCap(); }, 2200);
  }
  function paintCap(): void {
    const w = WORLDS[faced]!;
    cap.textContent = `${String(faced + 1).padStart(2, '0')} · ${w.name} — ${w.sub}`;
  }

  // ---------- frame ----------
  let dead = false;
  let raf = 0;
  let last = performance.now();
  let fpsN = 0;
  let fpsT = 0;
  let pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
  let slowFrames = 0;
  let lastShardT = 0;
  const t0 = performance.now();

  function resize(): void {
    const w = cv.clientWidth || 2;
    const h = cv.clientHeight || 2;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function render(t: number, dt: number): void {
    // recycle laps that fell behind / jump ahead of the camera
    const camLap = Math.floor(depth / 6);
    for (const l of laps) {
      if (l.lap < camLap - 1 || l.lap > camLap + 2) {
        l.lap = camLap + 2;
        clearGroup(l.group);
        fillLap(l.group, l.lap, l.animated, l.hearts);
      }
    }
    // DDV-1: the dream deepens — new lap, new light. Shard colors ease to
    // the lap rotation, tunnel rings swap palette offset, skies/fog/motes
    // drift hue+light. Chapter order, portals and captions never move.
    if (camLap !== shardLapShown) {
      const rot = shardLapRot(camLap);
      for (let i = 0; i < shards.length; i++) {
        shardCol.set(SHARD_COLORS[(shards[i]!.color + rot) % SHARD_COLORS.length]!);
        shardTo[i * 3] = shardCol.r;
        shardTo[i * 3 + 1] = shardCol.g;
        shardTo[i * 3 + 2] = shardCol.b;
      }
      shardMix = 0;
      shardLapShown = camLap;
      // Tunnel rings take the same turnover beat (shared-material swap,
      // cache-bounded by the 4-color palette — no leak across laps).
      const ringRot = ringLapRot(camLap, PALETTE.length);
      for (let i = 0; i < rings.length; i++) {
        rings[i].material = ringMat(hexColor(PALETTE[(i + ringRot) % PALETTE.length]!), (i * 0.37) % 1);
      }
    }
    if (shardMix < 1) {
      shardMix = Math.min(1, shardMix + dt * 0.5);
      const arr = (shardMesh.instanceColor as unknown as { array: Float32Array }).array;
      const k = shardMix >= 1 ? 1 : Math.min(1, dt * 3);
      for (let i = 0; i < arr.length; i++) {
        const t = shardTo[i]!;
        arr[i] = k >= 1 ? t : arr[i]! + (t - arr[i]!) * k;
      }
      shardMesh.instanceColor.needsUpdate = true;
    }
    const lap = lapShift(camLap);
    const camZ = -depth * WORLD_GAP;
    // steering: pointer target approached smoothly; sway + bank ride along.
    camX = smoothApproach(camX, steerTX, dt, 3);
    camY = smoothApproach(camY, steerTY, dt, 3);
    const sway = Math.sin(depth * 0.9) * 6 + bankX * 220;
    camera.position.set(camX + sway, camY + Math.sin(t * 0.4) * 1.2, camZ + 34);
    camTarget.set(camX * 0.4, 0, camZ - 60);
    camera.lookAt(camTarget);
    sky.position.set(camera.position.x, camera.position.y, camZ);
    skyUni.uTime.value = t;
    const fw = WORLDS[faced]!;
    skyUni.uTop.value.set(fw.sky1);
    skyUni.uBot.value.set(fw.sky0);
    skyUni.uAccent.value.set(fw.accent);
    skyUni.uTop.value.offsetHSL(lap.hue, 0, lap.light);
    skyUni.uBot.value.offsetHSL(lap.hue, 0, lap.light);
    skyUni.uAccent.value.offsetHSL(lap.hue, 0, 0);
    // atmosphere breathes with the story: fog + spore tint ease to the faced
    // chapter (lerp, never snap — a hard cut would read as a loading hitch).
    fogTarget.set(fw.sky0);
    fogTarget.offsetHSL(lap.hue, 0, lap.light);
    scene.fog.color.lerp(fogTarget, 0.04);
    moteTarget.set(fw.accent);
    moteTarget.offsetHSL(lap.hue, 0, 0);
    (motes.material as any).color.lerp(moteTarget, 0.04);
    // foreground fronds + light shafts ride the camera: near-layer parallax.
    for (const f of fronds) {
      const s = f.userData.side as number;
      const lane = f.userData.lane as number;
      f.position.set(
        camera.position.x + s * (26 + lane * 10) + Math.sin(t * 0.5 + lane * 2.1) * 3,
        camera.position.y - 6 + lane * 12 + Math.sin(t * 0.34 + s) * 1.5,
        camZ + 18 + lane * 6,
      );
    }
    for (const m of shafts) {
      const lane = m.userData.lane as number;
      m.position.set(camera.position.x - 14 + lane * 13, camera.position.y + 8, camZ - 40 - lane * 22);
    }
    for (const [, m] of ringMatCache) (m.uniforms.uTime as { value: number }).value = t;
    stars1.rotation.z = t * 0.002;
    stars2.rotation.z = -t * 0.0015;
    // rings drift + wrap
    for (const r of rings) {
      r.position.z += 26 * 0.016;
      r.rotation.z += (r.userData.spin as number) * 0.016;
      if (r.position.z > camZ + 40) r.position.z -= RINGS * RING_EVERY;
    }
    // motes rise past camera
    const mp = moteGeo.attributes.position as any;
    const arr = mp.array as Float32Array;
    for (let i = 0; i < MOTES; i++) {
      arr[i * 3 + 1] += moteVel[i]! * 0.016;
      arr[i * 3 + 2] += 30 * 0.016;
      if (arr[i * 3 + 2]! > camZ + 30) {
        arr[i * 3] = camera.position.x + (Math.random() - 0.5) * 160;
        arr[i * 3 + 1] = camera.position.y + (Math.random() - 0.5) * 160;
        arr[i * 3 + 2] = camZ - 700 - Math.random() * 400;
      }
    }
    mp.needsUpdate = true;
    // shard spiral: flow past the camera, wrap down-lap, pose the dummies.
    // The tunnel leans halfway with steering (center = camX*0.5): full
    // deflection still reaches the walls, but you never lose the spiral.
    {
      const dtS = Math.min(0.1, Math.max(0, t - lastShardT));
      lastShardT = t;
      const cx = camera.position.x * 0.5;
      for (let i = 0; i < shards.length; i++) {
        const s = shards[i]!;
        stepShard(s, dtS, camZ, SHARD_SPAN);
        const a = s.angle;
        shardDummy.position.set(cx + Math.cos(a) * s.radius, Math.sin(a) * s.radius * 0.72, s.z);
        shardDummy.rotation.set(0, 0, a * 2 + i);
        shardDummy.scale.setScalar(s.size);
        shardDummy.updateMatrix();
        shardMesh.setMatrixAt(i, shardDummy.matrix);
      }
      shardMesh.instanceMatrix.needsUpdate = true;
    }
    // biome life
    for (const l of laps) {
      for (const a of l.animated) {
        const o = a.obj;
        if (a.kind === 'moon') {
          const m = a.data;
          o.position.set(Math.cos(t * m.sp + m.ph) * m.r, Math.sin(t * m.sp + m.ph) * m.r * 0.6, 0);
        } else if (a.kind === 'sprinkle') {
          const m = a.data;
          o.position.set(Math.cos(t * m.sp + m.ph) * m.r, m.y + Math.sin(t * 1.3 + m.ph) * 1.4, Math.sin(t * m.sp + m.ph) * m.r * 0.5);
          o.rotation.y = t * 2 + m.ph;
        } else if (a.kind === 'orbitRing') {
          o.rotation.z += (a.data as number) * 0.016;
        } else if (a.kind === 'jelly') {
          o.position.y = (a.data.base as number) + Math.sin(t * 0.9 + (a.data.ph as number)) * 1.6;
        } else if (a.kind === 'heart') {
          o.scale.setScalar(1.6 * (1 + 0.1 * Math.sin(t * 2.2)));
        } else if (a.kind === 'embers' || a.kind === 'petals') {
          o.rotation.y = t * 0.05;
        }
      }
    }
    renderer.render(scene, camera);
  }

  function frame(now: number): void {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden || !visible) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // governor: sustained slow frames drop pixel ratio once
    if (dt > 0.024) { if (++slowFrames > 90 && pixelRatio > 1) { pixelRatio = 1; resize(); slowFrames = 0; } }
    else slowFrames = Math.max(0, slowFrames - 2);
    // fps chip ~2Hz (same QA thresholds as the game pills).
    fpsN++; fpsT += dt;
    if (fpsN >= 30) {
      const f = fpsT > 0 ? Math.round(fpsN / fpsT) : 0;
      fpsChip.textContent = `${f}fps`;
      fpsChip.style.color = f >= 55 ? '#C6F135' : f >= 45 ? '#FFD93D' : '#FF5D5D';
      fpsN = 0; fpsT = 0;
    }
    target = Math.max(0, target);
    if (!dragging) target += dt * 0.14; // auto-dive
    const frac = ((depth % 1) + 1) % 1;
    const vista = frac > 0.35 && frac < 0.65; // slow down at each heart
    depth += (target - depth) * Math.min(1, dt * (vista ? 2.2 : 4.5));
    bankX *= 1 - Math.min(1, dt * 2);
    faced = facedWorld(depth);
    if (faced !== lastFaced) { lastFaced = faced; opts.onFace?.(WORLDS[faced]!.game); }
    const lapNow = Math.floor(depth / 6); // a full saga read → cliffhanger
    if (lapNow > lastLap) { lastLap = lapNow; try { opts.onFinale?.(); } catch { /* story never blocks play */ } }
    // fly-through entry: pierce a heart ring while passing it → that game.
    // 3s cooldown so one pass = one entry; tap stays as the other door.
    if (now - lastFlyAt > 3000) {
      const flyCamZ = -depth * WORLD_GAP;
      for (const l of laps) {
        for (const h of l.hearts) {
          if (Math.abs(flyCamZ - h.z) < 7 && portalHit(camX, 0, h.x, 0, 9)) {
            lastFlyAt = now;
            opts.onPortal?.(h.game);
            break;
          }
        }
      }
    }
    paintCap();
    render((now - t0) / 1000, dt);
    void tmpV;
  }

  paintCap();
  let visible = true;
  const visObs = new IntersectionObserver((es) => {
    for (const e of es) visible = e.isIntersecting;
  });
  visObs.observe(cv);
  raf = requestAnimationFrame(frame);
  return {
    stop: () => {
      dead = true;
      cancelAnimationFrame(raf);
      try { visObs.disconnect(); } catch { /* gone */ }
      window.removeEventListener('resize', resize);
      try { cap.remove(); photo.remove(); fpsChip.remove(); steerHint.remove(); } catch { /* gone */ }
      try { frondMat.dispose(); shaftMat.dispose(); } catch { /* gone */ }
      try { renderer.dispose(); } catch { /* gone */ }
    },
  };
}

export { shouldUse3D };

