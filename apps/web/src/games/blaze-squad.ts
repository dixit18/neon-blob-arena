// apps/web/src/games/blaze-squad.ts — Blaze Squad client.
// Base tier (always works): Canvas2D top-down — zone ring, crates, blobs,
// bolts, HP/kill HUD. Left-half drag = move stick, right-half drag = aim +
// autofire, WASD + mouse + Space on desktop. Every tap paints same-tick.
// Enhanced tier (explicit "✨ 3D" tap only): threepipe → three.js CDN scene
// (arena plane, blob spheres, zone ring); falls back to 2D silently.
import { loadThree } from '../three-lazy.js';

export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string;
  zone: { x: number; y: number; r: number; nextInMs: number };
  endsInMs: number;
  you: { hp: number; alive: boolean; kills: number; rapidMs: number };
  players: { n: string; hp: number; alive: boolean; you: boolean; bot: boolean; x: number; y: number; q: number }[];
  crates: { x: number; y: number; t: number }[];
  feed: string[];
};

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#bz{font-weight:700}#bz #bzStat{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:6px}'
    + '#bz canvas{width:100%;border-radius:16px;border:2px solid #2A2A2E;background:#0E0E12;touch-action:none;display:block}'
    + '#bz .hud{display:flex;gap:8px;align-items:center;margin:8px 0;font-size:13px;flex-wrap:wrap}'
    + '#bz .pill{background:#121214;border:2px solid #2A2A2E;border-radius:999px;padding:6px 12px}'
    + '#bz .row{display:flex;gap:8px;margin-top:8px}#bz button{cursor:pointer;border:none;border-radius:12px;padding:14px;font-weight:900;font-size:15px;min-height:52px}'
    + '#bz #bzFire{flex:1;background:linear-gradient(135deg,#FF3D8A,#FF8A5B);color:#fff}'
    + '#bz #bz3d{background:#121214;color:#C6F135;border:2px solid #C6F135}'
    + '#bz #bzFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'bz';
  box.innerHTML = '<div id="bzStat">connecting…</div>'
    + '<canvas id="bzCv" width="600" height="600" aria-label="Blaze squad arena"></canvas>'
    + '<div class="hud"><span class="pill" id="bzHp">❤ 100</span><span class="pill" id="bzK">💥 0</span><span class="pill" id="bzRapid" style="display:none">⚡ rapid</span>'
    + '<span class="pill" id="bzZone">🔥 zone —</span><span class="pill" id="bzT">⏱ —</span></div>'
    + '<div class="row"><button id="bzFire">HOLD TO FIRE</button><button id="bz3d">✨ 3D</button></div>'
    + '<div id="bzFeed"></div>';
  el.appendChild(box);

  const cv = box.querySelector('#bzCv') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const stat = box.querySelector('#bzStat') as HTMLElement;
  const hpP = box.querySelector('#bzHp') as HTMLElement;
  const kP = box.querySelector('#bzK') as HTMLElement;
  const zP = box.querySelector('#bzZone') as HTMLElement;
  const tP = box.querySelector('#bzT') as HTMLElement;
  const rapidP = box.querySelector('#bzRapid') as HTMLElement;
  const feed = box.querySelector('#bzFeed') as HTMLElement;
  const say = (m: string): void => { stat.textContent = m; };

  let closed = false;
  let snap: Snap | null = null;
  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;
  const S = 6; // world 100u → 600px

  // intent state, sent at 15Hz + on change
  const intent = { dx: 0, dy: 0, fire: false, aim: 0 };
  let lastSent = '';

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }
  function pushIntent(force = false): void {
    const key = `${intent.dx.toFixed(2)},${intent.dy.toFixed(2)},${intent.fire},${intent.aim.toFixed(2)}`;
    if (!force && key === lastSent) return;
    lastSent = key;
    send('input', { dx: intent.dx, dy: intent.dy, fire: intent.fire || undefined, aim: intent.aim });
  }
  window.setInterval(() => { if (!closed) pushIntent(); }, 66);

  // --- controls: twin sticks on touch, WASD+mouse+Space on desktop ---
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    if (closed || /INPUT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    keys.add(e.key.toLowerCase());
    if (e.key === ' ') { intent.fire = true; pushIntent(true); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    keys.delete(e.key.toLowerCase());
    if (e.key === ' ') { intent.fire = false; pushIntent(true); }
  });
  function keysTick(): void {
    let dx = 0;
    let dy = 0;
    if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
    if (keys.has('d') || keys.has('arrowright')) dx += 1;
    if (keys.has('w') || keys.has('arrowup')) dy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) dy += 1;
    if (dx || dy) { intent.dx = dx; intent.dy = dy; pushIntent(); }
    else if (intent.dx !== 0 || intent.dy !== 0) {
      if (!stickMove.active) { intent.dx = 0; intent.dy = 0; pushIntent(); }
    }
  }
  window.setInterval(keysTick, 66);
  cv.addEventListener('mousemove', (e) => {
    if (closed || !snap) return;
    const r = cv.getBoundingClientRect();
    const me = snap.players.find((p) => p.you);
    if (!me) return;
    const mx = ((e.clientX - r.left) / r.width) * 100;
    const my = ((e.clientY - r.top) / r.height) * 100;
    intent.aim = Math.atan2(my - me.y, mx - me.x);
  });
  const stickMove = { active: false, id: -1 };
  const stickAim = { active: false, id: -1 };
  cv.addEventListener('pointerdown', (e) => {
    const r = cv.getBoundingClientRect();
    const left = e.clientX - r.left < r.width / 2;
    cv.setPointerCapture(e.pointerId);
    if (left) { stickMove.active = true; stickMove.id = e.pointerId; }
    else { stickAim.active = true; stickAim.id = e.pointerId; intent.fire = true; aimFrom(e); }
    pushIntent(true);
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickMove.id && stickMove.active) {
      const r = cv.getBoundingClientRect();
      const cx = r.left + r.width / 4;
      const cy = r.top + r.height / 2;
      intent.dx = Math.max(-1, Math.min(1, (e.clientX - cx) / 60));
      intent.dy = Math.max(-1, Math.min(1, (e.clientY - cy) / 60));
      pushIntent();
    } else if (e.pointerId === stickAim.id && stickAim.active) aimFrom(e);
  });
  const stickUp = (e: PointerEvent): void => {
    if (e.pointerId === stickMove.id) { stickMove.active = false; intent.dx = 0; intent.dy = 0; }
    if (e.pointerId === stickAim.id) { stickAim.active = false; intent.fire = false; }
    pushIntent(true);
  };
  cv.addEventListener('pointerup', stickUp);
  cv.addEventListener('pointercancel', stickUp);
  function aimFrom(e: PointerEvent): void {
    if (!snap) return;
    const r = cv.getBoundingClientRect();
    const me = snap.players.find((p) => p.you);
    if (!me) return;
    const mx = ((e.clientX - r.left) / r.width) * 100;
    const my = ((e.clientY - r.top) / r.height) * 100;
    intent.aim = Math.atan2(my - me.y, mx - me.x);
    pushIntent();
  }
  const fireBtn = box.querySelector('#bzFire') as HTMLButtonElement;
  fireBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); intent.fire = true; pushIntent(true); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
    fireBtn.addEventListener(ev, () => { if (!stickAim.active) { intent.fire = false; pushIntent(true); } });
  }

  // --- 2D render (always works) + optional 3D overlay ---
  let three: { render: (s: Snap) => void } | null = null;
  (box.querySelector('#bz3d') as HTMLButtonElement).addEventListener('click', async () => {
    say('loading 3D… (one-time, stays 2D if offline)');
    const kit = await loadThree();
    if (closed || !kit) { say(kit ? '3D ready' : 'offline — staying on 2D, fully playable'); return; }
    try {
      three = enableBlaze3D(kit, cv);
      say(kit.kind === 'threepipe' ? `✨ threepipe ${kit.version} 3D on` : `✨ three.js ${kit.version} 3D on`);
    } catch { say('3D failed to start — 2D stays'); }
  });

  function paint(): void {
    if (three && snap) { try { three.render(snap); } catch { three = null; } if (three) return; }
    const W = (cv.width = cv.clientWidth * 2 || 600);
    cv.height = W;
    const k = W / 100;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#0E0E12';
    g.fillRect(0, 0, W, W);
    if (!snap) return;
    // burn outside the zone
    g.fillStyle = 'rgba(255,61,138,.10)';
    g.fillRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(snap.zone.x * k, snap.zone.y * k, snap.zone.r * k, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#14141A';
    g.fillRect(0, 0, W, W);
    g.restore();
    g.strokeStyle = '#C6F135';
    g.lineWidth = Math.max(2, k * 0.8);
    g.beginPath();
    g.arc(snap.zone.x * k, snap.zone.y * k, snap.zone.r * k, 0, Math.PI * 2);
    g.stroke();
    for (const c of snap.crates ?? []) {
      g.fillStyle = c.t === 1 ? '#FFD93D' : '#3DFF8A';
      const s2 = k * (c.t === 1 ? 1.5 : 1.1);
      g.fillRect(c.x * k - s2 / 2, c.y * k - s2 / 2, s2, s2);
    }
    for (const p of snap.players) {
      if (!p.alive) continue;
      g.beginPath();
      g.arc(p.x * k, p.y * k, k * 1.7, 0, Math.PI * 2);
      g.fillStyle = p.you ? '#C6F135' : p.bot ? '#8A8A93' : '#FF3D8A';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#070708';
      g.stroke();
      // hp arc
      g.beginPath();
      g.strokeStyle = p.hp > 50 ? '#C6F135' : '#FF5D5D';
      g.lineWidth = 3;
      g.arc(p.x * k, p.y * k, k * 2.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (p.hp / 100));
      g.stroke();
      g.fillStyle = '#F2EDE3';
      g.font = `${Math.max(10, k * 1.6)}px system-ui`;
      g.textAlign = 'center';
      g.fillText(p.n.slice(0, 10), p.x * k, p.y * k - k * 3);
    }
    hpP.textContent = `❤ ${snap.you.hp}`;
    kP.textContent = `💥 ${snap.you.kills}`;
    const rapid = (snap.you.rapidMs ?? 0) > 0;
    rapidP.style.display = rapid ? '' : 'none';
    if (rapid) rapidP.textContent = `⚡ rapid ${Math.ceil((snap.you.rapidMs ?? 0) / 1000)}s`;
    zP.textContent = `🔥 zone r${snap.zone.r} · ${Math.ceil(snap.zone.nextInMs / 1000)}s`;
    tP.textContent = snap.phase === 'fight' ? `⏱ ${Math.ceil(snap.endsInMs / 1000)}s` : snap.phase;
    feed.textContent = snap.feed.join(' · ');
    if (snap.phase === 'lobby') say('dropping in… first shrink in 30s');
    else if (!snap.you.alive) say('popped! spectating — next round auto-starts');
    else say(`you: ❤${snap.you.hp} · 💥${snap.you.kills}`);
  }
  void S;

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=blaze-squad&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    ws = new WebSocket(`${ctx.server}?${q}`);
    ws.onopen = () => { retry = 0; };
    ws.onmessage = (ev) => {
      let m: { type?: string; payload?: unknown };
      try { m = JSON.parse(String(ev.data)); } catch { return; }
      if (m.type === 'event') {
        const p = m.payload as { t?: string; token?: string; room?: string };
        if (p.t === 'hello') {
          if (p.token) token = p.token;
          if (p.room) roomId = p.room;
          say('in the drop — loot up!');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as Snap;
        if (p && p.t === 'blaze') { snap = p; paint(); }
      }
    };
    ws.onclose = () => {
      if (closed) return;
      retry++;
      say('dropped — rejoining in 1.5s…');
      setTimeout(connect, 1500);
    };
    ws.onerror = () => { try { ws?.close(); } catch { /* gone */ } };
  }

  connect();
  new MutationObserver(() => { if (!document.contains(el)) { closed = true; try { ws?.close(); } catch { /* gone */ } } })
    .observe(document.body, { childList: true, subtree: true });
}

function enableBlaze3D(kit: { kind: string; api: unknown }, cv: HTMLCanvasElement): { render: (s: Snap) => void } {
  const THREE = kit.api as Record<string, new (...a: never[]) => {
    setSize(w: number, h: number): void; render(a: unknown, b: unknown): void; domElement: HTMLCanvasElement;
  }> & {
    Scene: new () => { add(o: unknown): void; background: unknown };
    PerspectiveCamera: new (f: number, a: number, n: number, fa: number) => { position: { set(x: number, y: number, z: number): void } };
    WebGLRenderer: new (o: { canvas: HTMLCanvasElement }) => {
      setSize(w: number, h: number): void; render(a: unknown, b: unknown): void;
    };
    PlaneGeometry: new (w: number, h: number) => unknown;
    SphereGeometry: new (r: number, w: number, h: number) => unknown;
    RingGeometry: new (a: number, b: number, s: number) => unknown;
    MeshBasicMaterial: new (o: { color: number }) => unknown;
    Mesh: new (geo: unknown, mat: unknown) => { position: { set(x: number, y: number, z: number): void } };
    Color: new (c: string) => unknown;
  };
  const renderer = new THREE.WebGLRenderer({ canvas: cv });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0E0E12');
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  cam.position.set(0, 95, 55);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshBasicMaterial({ color: 0x14141a }));
  scene.add(ground);
  const dots = new Map<string, { position: { set(x: number, y: number, z: number): void } }>();
  const SQUAD_COLORS = [0xff6b5b, 0x5bb8ff, 0xffd93d]; // Ember / Tide / Volt
  return {
    render(s: Snap): void {
      renderer.setSize(cv.clientWidth || 600, cv.clientWidth || 600);
      for (const p of s.players) {
        if (!p.alive) { dots.delete(p.n); continue; }
        let m = dots.get(p.n);
        if (!m) {
          const color = p.you ? 0xc6f135 : (SQUAD_COLORS[p.q ?? 0] ?? 0xff3d8a);
          m = new THREE.Mesh(
            new THREE.SphereGeometry(1.7, 12, 12),
            new THREE.MeshBasicMaterial({ color }),
          ) as unknown as { position: { set(x: number, y: number, z: number): void } };
          scene.add(m);
          dots.set(p.n, m);
        }
        m.position.set(p.x - 50, 1.5, p.y - 50);
      }
      renderer.render(scene, cam);
    },
  };
}
