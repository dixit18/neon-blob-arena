// Full-3D world renderer (Three.js). The authoritative sim stays a 2D plane;
// world (x, y) maps to three (x, 0, z=y). Presentation only — never gameplay.
import * as THREE from 'three';

export const MOCHI3D = ['#E84393', '#FB9039', '#00C2A8', '#2FA8E0', '#8B5CF6', '#FFC93C'];
const MOCHI_H = [335, 25, 170, 200, 262, 48];
const INK = '#2B2144'; // die-cut outline + features (reads on cream)
export function mochiIdx(hue: number): number {
  let bi = 0, bd = 1e9;
  for (let i = 0; i < MOCHI_H.length; i++) {
    const d = Math.min(Math.abs(MOCHI_H[i] - hue), 360 - Math.abs(MOCHI_H[i] - hue));
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

// ---- baked faces: ink features + sprinkle toppings by tier (zero per-frame cost) ----
const SPRINKLES = ['#E84393', '#2FA8E0', '#FFC93C', '#00C2A8', '#ffffff'];
function sprinkle(g: CanvasRenderingContext2D, x: number, y: number, rot: number, color: string) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.fillStyle = color;
  g.fillRect(-7, -2.5, 14, 5);
  g.restore();
}
function faceCanvas(face: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = INK; g.strokeStyle = INK; g.lineCap = 'round';
  if (face <= 1) {
    const r = face === 0 ? 9 : 10;
    g.beginPath(); g.arc(48, 56, r, 0, 7); g.arc(80, 56, r, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(51, 53, 3, 0, 7); g.arc(83, 53, 3, 0, 7); g.fill();
    g.strokeStyle = INK; g.lineWidth = 6;
    g.beginPath(); g.arc(64, 74, 15, 0.3, Math.PI - 0.3); g.stroke();
    if (face === 1) {
      g.fillStyle = '#F9A8D4'; // baked dot blush
      for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 3; xx++) {
        g.fillRect(24 + xx * 5, 72 + yy * 5, 3, 3);
        g.fillRect(92 + xx * 5, 72 + yy * 5, 3, 3);
      }
      sprinkle(g, 40, 30, -0.4, SPRINKLES[1]);
      sprinkle(g, 90, 34, 0.5, SPRINKLES[2]);
    }
  } else if (face === 2) {
    g.beginPath(); g.arc(47, 52, 10, 0, 7); g.arc(81, 52, 10, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(50, 49, 3, 0, 7); g.arc(84, 49, 3, 0, 7); g.fill();
    g.fillStyle = '#F9A8D4';
    for (let yy = 0; yy < 3; yy++) for (let xx = 0; xx < 4; xx++) {
      g.fillRect(22 + xx * 5, 70 + yy * 5, 3, 3);
      g.fillRect(90 + xx * 5, 70 + yy * 5, 3, 3);
    }
    g.fillStyle = INK;
    g.beginPath(); g.ellipse(64, 84, 10, 13, 0, 0, 7); g.fill();
    sprinkle(g, 34, 28, 0.4, SPRINKLES[0]);
    sprinkle(g, 64, 22, -0.2, SPRINKLES[2]);
    sprinkle(g, 94, 30, 0.7, SPRINKLES[3]);
  } else {
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(32, 34); g.lineTo(54, 46); g.stroke();
    g.beginPath(); g.moveTo(96, 34); g.lineTo(74, 46); g.stroke();
    g.fillStyle = INK;
    g.beginPath(); g.arc(49, 62, 10, 0, 7); g.arc(79, 62, 10, 0, 7); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(42, 82); g.lineTo(54, 82); g.lineTo(48, 96); g.fill();
    g.beginPath(); g.moveTo(74, 82); g.lineTo(86, 82); g.lineTo(80, 96); g.fill();
    sprinkle(g, 30, 60, 0.5, SPRINKLES[2]);
    sprinkle(g, 98, 58, -0.5, SPRINKLES[0]);
    sprinkle(g, 64, 24, 0.2, SPRINKLES[1]);
  }
  return c;
}

function nameCanvas(name: string, hunter: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '800 30px Nunito, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#ffffff';
  g.strokeText(name.slice(0, 14), 128, 32);
  g.fillStyle = hunter ? '#E84393' : INK;
  g.fillText(name.slice(0, 14), 128, 32);
  return c;
}

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 2, 16, 16, 16);
  grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#FFF1D4'; g.fillRect(0, 0, 256, 256); // cream picnic blanket
  g.strokeStyle = 'rgba(232,67,147,.28)'; g.lineWidth = 3; // raspberry gingham
  g.strokeRect(1, 1, 254, 254);
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  g.fillStyle = 'rgba(47,168,224,.35)';
  g.beginPath(); g.arc(64, 200, 4, 0, 7); g.arc(200, 80, 3.5, 0, 7); g.fill();
  g.strokeStyle = 'rgba(251,144,57,.55)'; g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    const px = 200 + Math.cos(a) * 12, py = 190 + Math.sin(a) * 12;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 16);
  return t;
}

export interface DrawPlayer {
  id: string; x: number; y: number; r: number; hue: number;
  name: string; isMe: boolean; hunter: boolean; shielded: boolean;
  charge?: number; // polar: +1 blue ring / −1 red ring / 0|undefined none
}
export interface DrawWell { x: number; y: number; r: number }
export interface DrawOrb { i: number; x: number; y: number; hue: number }
export interface DrawPellet { x: number; y: number; hue: number }
export interface DrawParticle { x: number; y: number; hue: number; life: number }
export interface DrawRing { x: number; y: number; r: number; max: number; life: number; hue: number }

const MAXP = 240, MAXO = 96, MAXPT = 240;

export class World3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private blobs = new Map<string, THREE.Group>();
  private blobMats: THREE.MeshStandardMaterial[] = [];
  private hullGeo = new THREE.SphereGeometry(1, 24, 18);
  private hullMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }); // ink die-cut outline
  private faceTex: THREE.CanvasTexture[] = [];
  private shadowGeo = new THREE.CircleGeometry(1, 24);
  private shadowMat = new THREE.MeshBasicMaterial({ color: '#2B2144', transparent: true, opacity: 0.22, depthWrite: false });
  private seenPool = new Set<string>(); // hoisted per-frame membership (no alloc)
  private seenOrbPool = new Set<number>(); // hoisted orb membership (no alloc)
  private pellets!: THREE.InstancedMesh;
  private orbs!: THREE.InstancedMesh;
  private orbPrev = new Map<number, { x: number; y: number }>();
  private pts!: THREE.Points;
  private ptPos = new Float32Array(MAXPT * 3);
  private ptCol = new Float32Array(MAXPT * 3);
  private ringPool: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; col: THREE.Color }[] = [];
  private chargeRings = new Map<string, THREE.Mesh>(); // polar polarity rings (blue + / red −)
  private seenChargePool = new Set<string>(); // hoisted charged-membership (no alloc)
  private wellGroup: THREE.Group | null = null; // buffet: 3 devourers, built once
  private wellMeshes: { hole: THREE.Mesh; rim: THREE.Mesh }[] = [];
  private wellSpin = 0;
  private hunterRings = new Map<string, THREE.Mesh>();
  private youRing!: THREE.Mesh;
  private shieldShell!: THREE.Mesh;
  private crownGeo = new THREE.ConeGeometry(1, 1, 5);
  private crownMat = new THREE.MeshStandardMaterial({ color: '#FFE93C', roughness: 0.3, metalness: 0.4, emissive: '#FFE93C', emissiveIntensity: 0.45 });
  private dummy = new THREE.Object3D();
  private tmpColor = new THREE.Color();
  private tmpV = new THREE.Vector3();
  private floorTex!: THREE.CanvasTexture;
  private flash = new THREE.PointLight('#ffffff', 0, 2600, 1.6);
  private flashLvl = 0;
  private dashKick = 0;
  private W = 1; private H = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color('#BDE6FB'); // soda-sky day
    this.scene.fog = new THREE.Fog('#BDE6FB', 1700, 5200);
    this.camera = new THREE.PerspectiveCamera(55, 1, 1, 14000);
    this.camera.position.set(0, 950, 640);

    this.scene.add(new THREE.HemisphereLight('#FFF4DE', '#E8B4D8', 0.95));
    const dir = new THREE.DirectionalLight('#ffffff', 1.25);
    dir.position.set(1000, 2200, 600);
    this.scene.add(dir);
    const rim = new THREE.DirectionalLight('#2FA8E0', 0.4);
    rim.position.set(-1400, 900, -1200);
    this.scene.add(rim);
    this.flash.position.set(2000, 700, 2000);
    this.scene.add(this.flash);

    // confetti sky (1 draw call, zero per-frame cost) — candy dots over soda-sky
    {
      const N = 420;
      const pos = new Float32Array(N * 3);
      const col = new Float32Array(N * 3);
      const c = new THREE.Color();
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 3000 + Math.random() * 2800;
        const y = 500 + Math.random() * 2000;
        pos[i * 3] = 2000 + Math.cos(a) * r;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = 2000 + Math.sin(a) * r;
        c.set(MOCHI3D[i % MOCHI3D.length]);
        col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const confetti = new THREE.Points(g, new THREE.PointsMaterial({
        size: 15, vertexColors: true, map: dotTexture(), transparent: true,
        opacity: 0.9, depthWrite: false, sizeAttenuation: true,
      }));
      confetti.frustumCulled = false;
      this.scene.add(confetti);
    }

    // floor + candy walls
    this.floorTex = floorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ map: this.floorTex, roughness: 0.9, metalness: 0 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(2000, 0, 2000);
    this.scene.add(floor);
    // candy grid shimmer above the floor (cheap lines, huge depth cue)
    const grid = new THREE.GridHelper(4000, 40, '#E84393', '#2FA8E0');
    (grid.material as THREE.Material).transparent = true;
    ((grid.material as unknown as { opacity: number }).opacity as number) = 0.22;
    grid.position.set(2000, 1.2, 2000);
    this.scene.add(grid);
    // corner pylons: 4 candy towers = instant 3D landmarking
    const pylonGeo = new THREE.CylinderGeometry(26, 40, 420, 10);
    const pylonCols = ['#E84393', '#2FA8E0', '#FFC93C', '#00C2A8'];
    for (let i = 0; i < 4; i++) {
      const px = i % 2 === 0 ? -60 : 4060;
      const pz = i < 2 ? -60 : 4060;
      const mat = new THREE.MeshStandardMaterial({
        color: '#FFFDF6', emissive: pylonCols[i], emissiveIntensity: 0.9, roughness: 0.5,
      });
      const py = new THREE.Mesh(pylonGeo, mat);
      py.position.set(px, 210, pz);
      this.scene.add(py);
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(44, 14, 10),
        new THREE.MeshBasicMaterial({ color: pylonCols[i], toneMapped: false }),
      );
      cap.position.set(px, 440, pz);
      this.scene.add(cap);
    }
    const wallMat = new THREE.MeshStandardMaterial({ color: '#FFFDF6', emissive: '#FB9039', emissiveIntensity: 0.55, roughness: 0.5 });
    const mkWall = (w: number, d: number, x: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 70, d), wallMat);
      m.position.set(x, 35, z);
      this.scene.add(m);
    };
    mkWall(4040, 20, 2000, -10); mkWall(4040, 20, 2000, 4010);
    mkWall(20, 4040, -10, 2000); mkWall(20, 4040, 4010, 2000);

    // body materials per mochi hue (soft emissive so bodies glow on cream)
    this.blobMats = MOCHI3D.map((col) => new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.22, roughness: 0.35, metalness: 0.05,
    }));
    for (let f = 0; f < 4; f++) {
      const t = new THREE.CanvasTexture(faceCanvas(f));
      t.colorSpace = THREE.SRGBColorSpace;
      this.faceTex.push(t);
    }

    // pellets: instanced mochi drops (Basic = bright + cheap, no per-light cost)
    const pelletGeo = new THREE.SphereGeometry(1, 10, 8);
    this.pellets = new THREE.InstancedMesh(pelletGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), MAXP);
    this.pellets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAXP; i++) this.pellets.setColorAt(i, this.tmpColor.set('#ffffff'));
    this.scene.add(this.pellets);

    // orbs: instanced splat-shots (solid hot cores — additive washes out on cream)
    this.orbs = new THREE.InstancedMesh(pelletGeo, new THREE.MeshBasicMaterial({
      toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false,
    }), MAXO);
    this.orbs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAXO; i++) this.orbs.setColorAt(i, this.tmpColor.set('#ffffff'));
    this.scene.add(this.orbs);

    // particles
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.ptPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute('color', new THREE.BufferAttribute(this.ptCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.pts = new THREE.Points(pg, new THREE.PointsMaterial({
      size: 11, vertexColors: true, map: dotTexture(), transparent: true,
      opacity: 0.95, depthWrite: false, sizeAttenuation: true,
    }));
    this.pts.frustumCulled = false;
    this.scene.add(this.pts);

    // shockwave ring pool (flat on floor)
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 3;
      mesh.visible = false;
      this.scene.add(mesh);
      this.ringPool.push({ mesh, mat, col: new THREE.Color('#ffffff') });
    }
    // YOU ring + shield shell
    const youMat = new THREE.MeshBasicMaterial({ color: '#FFE93C', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
    this.youRing = new THREE.Mesh(ringGeo, youMat);
    this.youRing.rotation.x = -Math.PI / 2;
    this.youRing.position.y = 2;
    this.youRing.visible = false;
    this.scene.add(this.youRing);
    this.shieldShell = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: '#22D3EE', transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.shieldShell.visible = false;
    this.scene.add(this.shieldShell);
  }

  resize(w: number, h: number) {
    this.W = w; this.H = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setPixelRatio(dpr: number) { this.renderer.setPixelRatio(dpr); } // quality governor

  private faceFor(r: number): number { return r < 20 ? 0 : r < 30 ? 1 : r < 44 ? 2 : 3; }

  private nameSprite(name: string, hunter: boolean): THREE.Sprite {
    // Per-blob ownership: texture dies WITH its sprite (dispose both together).
    // The old global cache leaked textures on rename AND could evict textures
    // still on screen. 26 small canvases is nothing; correctness is everything.
    const tex = new THREE.CanvasTexture(nameCanvas(name, hunter));
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  }

  private disposeName(s: THREE.Sprite) {
    const m = s.material as THREE.SpriteMaterial;
    if (m.map) m.map.dispose();
    m.dispose();
  }

  toScreenInto(x: number, y: number, lift: number, out: { x: number; y: number; behind: boolean }): void {
    this.tmpV.set(x, lift, y).project(this.camera);
    out.x = (this.tmpV.x * 0.5 + 0.5) * this.W;
    out.y = (-this.tmpV.y * 0.5 + 0.5) * this.H;
    out.behind = this.tmpV.z > 1;
  }

  toScreen(x: number, y: number, lift = 0): { x: number; y: number; behind: boolean } {
    const out = { x: 0, y: 0, behind: false };
    this.toScreenInto(x, y, lift, out);
    return out;
  }

  kick(dash: boolean, killFlash: boolean) {
    if (dash) this.dashKick = 1;
    if (killFlash) this.flashLvl = 1;
  }

  frame(v: {
    camX: number; camY: number; trauma: number; mobile: boolean; time: number;
    players: DrawPlayer[]; pellets: DrawPellet[]; orbs: DrawOrb[];
    particles: DrawParticle[]; rings: DrawRing[]; meR?: number; wells?: DrawWell[];
  }) {
    // camera: full-3D chase view (fixed yaw => controls stay world-aligned)
    // bigger blob = higher camera so giants stay readable; dash = FOV punch
    const f = v.mobile ? 1.28 : 1.0;
    const zoom = 1 + Math.min(0.55, ((v.meR ?? 20) - 20) * 0.008);
    this.dashKick = Math.max(0, this.dashKick - 0.06);
    this.flashLvl = Math.max(0, this.flashLvl - 0.05);
    const sh = v.trauma * v.trauma * 16;
    // smooth-noise shake (sine mix) — white Math.random per frame buzzed and read as jitter
    const jx = (Math.sin(v.time * 0.043 + 1.7) * 0.6 + Math.sin(v.time * 0.013 + 0.4) * 0.4) * sh;
    const jz = (Math.sin(v.time * 0.037 + 4.2) * 0.6 + Math.sin(v.time * 0.011 + 2.1) * 0.4) * sh;
    this.camera.position.set(v.camX + jx, 950 * f * zoom, v.camY + 640 * f * zoom + jz);
    this.camera.lookAt(v.camX + jx * 0.5, 0, v.camY);
    const wantFov = 55 + this.dashKick * 9;
    if (Math.abs(this.camera.fov - wantFov) > 0.1) {
      this.camera.fov += (wantFov - this.camera.fov) * 0.25;
      this.camera.updateProjectionMatrix();
    }
    // kill-flash light follows the camera
    this.flash.intensity = this.flashLvl * 9000;
    this.flash.position.set(v.camX, 620, v.camY + 260);
    // floor shimmer drift (cheap life cue, no extra draw calls)
    this.floorTex.offset.set((v.time / 90000) % 1, (v.time / 120000) % 1);

    // blobs (membership set hoisted; Map delete-during-iterate is safe)
    const seen = this.seenPool;
    seen.clear();
    let hasMe = false, meShielded = false;
    for (const p of v.players) {
      seen.add(p.id);
      let grp = this.blobs.get(p.id);
      const gi = mochiIdx(p.hue);
      if (!grp) {
        grp = new THREE.Group();
        const hull = new THREE.Mesh(this.hullGeo, this.hullMat);
        const body = new THREE.Mesh(this.hullGeo, this.blobMats[gi]);
        const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        const face = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.faceTex[this.faceFor(p.r)], transparent: true, depthWrite: false }));
        face.name = 'face';
        const name = this.nameSprite(p.name, p.hunter);
        name.name = 'name';
        const crown = new THREE.Mesh(this.crownGeo, this.crownMat);
        crown.name = 'crown';
        grp.add(hull); grp.add(body); grp.add(shadow); grp.add(face); grp.add(name); grp.add(crown);
        grp.userData = { hull, body, shadow, face, name, crown, gi: -1, fi: -1, nm: '' };
        this.blobs.set(p.id, grp);
        this.scene.add(grp);
      }
      const u = grp.userData;
      if (u.gi !== gi) { (u.body as THREE.Mesh).material = this.blobMats[gi]; u.gi = gi; }
      const fi = this.faceFor(p.r);
      if (u.fi !== fi) { ((u.face as THREE.Sprite).material as THREE.SpriteMaterial).map = this.faceTex[fi]; u.fi = fi; }
      const nmKey = (p.hunter ? 'H' : 'Y') + p.name;
      if (u.nm !== nmKey) {
        const old = u.name as THREE.Sprite;
        grp.remove(old);
        this.disposeName(old);
        const fresh = this.nameSprite(p.name, p.hunter);
        fresh.name = 'name';
        u.name = fresh;
        grp.add(fresh);
        u.nm = nmKey;
      }
      const wob = 1 + 0.05 * Math.sin(v.time / 300 + p.x * 0.05 + p.y * 0.03);
      const r = p.r;
      grp.position.set(p.x, 0, p.y);
      (u.body as THREE.Mesh).scale.set(r * wob, r * 0.78 / wob, r * wob);
      (u.body as THREE.Mesh).position.y = r * 0.78;
      (u.hull as THREE.Mesh).scale.set(r * wob * 1.13, r * 0.78 / wob * 1.13, r * wob * 1.13);
      (u.hull as THREE.Mesh).position.y = r * 0.78;
      (u.shadow as THREE.Mesh).scale.set(r * 1.05, r * 1.05, 1);
      (u.shadow as THREE.Mesh).position.y = 0.6;
      const face = u.face as THREE.Sprite;
      face.position.set(0, r * 0.95, r * 0.62);
      face.scale.set(r * 1.15, r * 1.15, 1);
      const nm = u.name as THREE.Sprite;
      const nw = 90 + r * 1.5;
      nm.scale.set(nw, nw / 4, 1);
      nm.position.set(0, r * 2.1 + 26, 0);
      const crown = u.crown as THREE.Mesh;
      const isBoss = fi === 3;
      crown.visible = isBoss;
      if (isBoss) {
        crown.scale.set(r * 0.32, r * 0.5, r * 0.32);
        crown.position.set(0, r * 1.75 + Math.sin(v.time / 400) * 4, 0);
        crown.rotation.y = v.time / 700;
      }
      u.ringPulse = ((v.time / 500) % 1);
    }
    for (const [id, grp] of this.blobs) {
      if (seen.has(id)) continue;
      this.scene.remove(grp);
      const u = grp.userData;
      ((u.face as THREE.Sprite).material as THREE.Material).dispose();
      this.disposeName(u.name as THREE.Sprite);
      this.blobs.delete(id);
    }

    // hunter rings + YOU ring + shield + polar charge rings
    for (const [id, mesh] of this.hunterRings) {
      if (!seen.has(id)) { this.scene.remove(mesh); (mesh.material as THREE.Material).dispose(); mesh.geometry.dispose(); this.hunterRings.delete(id); }
    }
    for (const p of v.players) {
      // polar charge ring: blue + / raspberry − (same 1-draw-call-each pattern as hunters)
      if (p.charge === 1 || p.charge === -1) {
        this.seenChargePool.add(p.id);
        let cring = this.chargeRings.get(p.id);
        if (!cring) {
          cring = new THREE.Mesh(
            new THREE.RingGeometry(0.9, 1, 40),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }),
          );
          cring.rotation.x = -Math.PI / 2;
          this.scene.add(cring);
          this.chargeRings.set(p.id, cring);
        }
        const pulse = 1 + 0.07 * Math.sin(v.time / 220 + p.x * 0.01);
        cring.position.set(p.x, 2.5, p.y);
        cring.scale.set((p.r + 12) * pulse, (p.r + 12) * pulse, 1);
        (cring.material as THREE.MeshBasicMaterial).color.set(p.charge > 0 ? '#2FA8E0' : '#E84393');
      }
      if (p.hunter) {
        let ring = this.hunterRings.get(p.id);
        if (!ring) {
          ring = new THREE.Mesh(
            new THREE.RingGeometry(0.9, 1, 40),
            new THREE.MeshBasicMaterial({ color: '#FF4444', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
          );
          ring.rotation.x = -Math.PI / 2;
          this.scene.add(ring);
          this.hunterRings.set(p.id, ring);
        }
        const pulse = 1 + 0.08 * Math.sin(v.time / 200);
        ring.position.set(p.x, 2.5, p.y);
        ring.scale.set((p.r + 12) * pulse, (p.r + 12) * pulse, 1);
      }
      if (p.isMe) {
        hasMe = true;
        if (p.shielded) meShielded = true;
        this.youRing.visible = true;
        this.youRing.position.set(p.x, 2, p.y);
        const youPulse = 1 + 0.06 * Math.sin(v.time / 260);
        this.youRing.scale.set((p.r + 7) * youPulse, (p.r + 7) * youPulse, 1);
        ((this.youRing.material as THREE.MeshBasicMaterial).opacity as number) = 0.75 + 0.2 * Math.sin(v.time / 260);
        if (p.shielded) {
          this.shieldShell.visible = true;
          this.shieldShell.position.set(p.x, p.r * 0.8, p.y);
          const sp = 1 + 0.05 * Math.sin(v.time / 180);
          this.shieldShell.scale.set(p.r * 1.35 * sp, p.r * 1.35 * sp, p.r * 1.35 * sp);
          ((this.shieldShell.material as THREE.MeshBasicMaterial).opacity as number) = 0.18 + 0.08 * Math.sin(v.time / 180);
        }
      }
    }
    if (!hasMe) this.youRing.visible = false;
    if (!meShielded) this.shieldShell.visible = false;
    for (const [id, mesh] of this.chargeRings) {
      if (!seen.has(id) || !this.seenChargePool.has(id)) {
        this.scene.remove(mesh); (mesh.material as THREE.Material).dispose(); mesh.geometry.dispose(); this.chargeRings.delete(id);
      }
    }
    this.seenChargePool.clear();

    // pellets (instanced mochi drops with a gentle bob)
    const np = Math.min(MAXP, v.pellets.length);
    for (let i = 0; i < np; i++) {
      const pl = v.pellets[i];
      this.dummy.position.set(pl.x, 5 + Math.sin(v.time / 900 + pl.x * 0.05 + pl.y * 0.04) * 2.5, pl.y);
      this.dummy.scale.set(6, 4.5, 6);
      this.dummy.rotation.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.pellets.setMatrixAt(i, this.dummy.matrix);
      this.pellets.setColorAt(i, this.tmpColor.set(MOCHI3D[mochiIdx(pl.hue)]));
    }
    this.pellets.count = np;
    this.pellets.instanceMatrix.needsUpdate = true;
    if (this.pellets.instanceColor) this.pellets.instanceColor.needsUpdate = true;

    // orbs (stretched along travel, motion-estimated from ids)
    const no = Math.min(MAXO, v.orbs.length);
    const seenOrb = this.seenOrbPool;
    seenOrb.clear();
    for (let i = 0; i < no; i++) {
      const o = v.orbs[i];
      seenOrb.add(o.i);
      const prev = this.orbPrev.get(o.i);
      const dx = prev ? o.x - prev.x : 20, dz = prev ? o.y - prev.y : 0;
      this.orbPrev.set(o.i, { x: o.x, y: o.y });
      const sp = Math.hypot(dx, dz);
      this.dummy.position.set(o.x, 14, o.y);
      this.dummy.rotation.set(0, -Math.atan2(dz, dx), 0);
      this.dummy.scale.set(9 + Math.min(22, sp * 0.9), 7, 7);
      this.dummy.updateMatrix();
      this.orbs.setMatrixAt(i, this.dummy.matrix);
      this.orbs.setColorAt(i, this.tmpColor.set(MOCHI3D[mochiIdx(o.hue)]));
    }
    for (const k of this.orbPrev.keys()) if (!seenOrb.has(k)) this.orbPrev.delete(k);
    this.orbs.count = no;
    this.orbs.instanceMatrix.needsUpdate = true;
    if (this.orbs.instanceColor) this.orbs.instanceColor.needsUpdate = true;

    // particles
    const npt = Math.min(MAXPT, v.particles.length);
    for (let i = 0; i < npt; i++) {
      const pt = v.particles[i];
      this.ptPos[i * 3] = pt.x;
      this.ptPos[i * 3 + 1] = 10 + Math.max(0, pt.life) * 55;
      this.ptPos[i * 3 + 2] = pt.y;
      this.tmpColor.set(MOCHI3D[mochiIdx(pt.hue)]);
      this.ptCol[i * 3] = this.tmpColor.r;
      this.ptCol[i * 3 + 1] = this.tmpColor.g;
      this.ptCol[i * 3 + 2] = this.tmpColor.b;
    }
    (this.pts.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.pts.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.pts.geometry.setDrawRange(0, npt);

    // shockwave rings (color via preallocated THREE.Color — no hsl() string parse per frame)
    for (let i = 0; i < this.ringPool.length; i++) {
      const slot = this.ringPool[i];
      const rg = v.rings[i];
      if (!rg) { slot.mesh.visible = false; continue; }
      slot.mesh.visible = true;
      slot.mesh.position.set(rg.x, 3, rg.y);
      const rr = rg.r + (rg.max - rg.r) * 0.5;
      slot.mesh.scale.set(rr, rr, 1);
      slot.mat.opacity = Math.min(1, rg.life * 2.5);
      slot.col.setHSL((((rg.hue % 360) + 360) % 360) / 360, 0.95, 0.65);
      slot.mat.color.copy(slot.col);
    }

    // buffet wells: black spheres + spinning accretion rings (6 meshes, zero alloc)
    if (v.wells && v.wells.length > 0) {
      if (!this.wellGroup) {
        this.wellGroup = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const hole = new THREE.Mesh(
            new THREE.SphereGeometry(1, 20, 14),
            new THREE.MeshBasicMaterial({ color: '#0B0614' }),
          );
          const rim = new THREE.Mesh(
            new THREE.TorusGeometry(1.35, 0.12, 10, 40),
            new THREE.MeshBasicMaterial({ color: '#B45CFF', toneMapped: false, transparent: true, opacity: 0.95 }),
          );
          rim.rotation.x = Math.PI / 2.4;
          this.wellGroup.add(hole); this.wellGroup.add(rim);
          this.wellMeshes.push({ hole, rim });
        }
        this.scene.add(this.wellGroup);
      }
      this.wellGroup.visible = true;
      this.wellSpin += 0.03;
      for (let i = 0; i < this.wellMeshes.length; i++) {
        const w = v.wells[i];
        const m = this.wellMeshes[i];
        if (!w) { m.hole.visible = false; m.rim.visible = false; continue; }
        m.hole.visible = true; m.rim.visible = true;
        m.hole.position.set(w.x, w.r * 0.5, w.y);
        m.hole.scale.set(w.r, w.r * 0.55, w.r);
        m.rim.position.set(w.x, 6, w.y);
        const rs = w.r * (1.25 + 0.05 * Math.sin(v.time / 300 + i * 2));
        m.rim.scale.set(rs, rs, rs);
        m.rim.rotation.z = this.wellSpin + i;
      }
    } else if (this.wellGroup) {
      this.wellGroup.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
