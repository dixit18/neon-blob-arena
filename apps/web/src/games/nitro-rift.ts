// apps/web/src/games/nitro-rift.ts — Nitro Rift client (NR-3: ✨ 3D toggle).
// Base tier (always works): Canvas top-down, lap-relative. Enhanced tier
// (explicit tap only): threepipe → three.js CDN scene, 2D default intact.
import { loadThree } from '../three-lazy.js';

export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string; heat: number; endsInMs: number;
  pads: { at: number; lane: number }[];
  you: { prog: number; lane: number; boost: number; place: number; lap: number };
  racers: { n: string; prog: number; lane: number; you: boolean; bot: boolean; fin: boolean; lap: number }[];
  feed: string[];
};

const TRACK = 1200;
const LANES = 4;

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#nr{font-weight:700}#nr #nrStat{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:6px}'
    + '#nr canvas{width:100%;border-radius:16px;border:2px solid #2A2A2E;background:#0E0E12;touch-action:none;display:block}'
    + '#nr .hud{display:flex;gap:8px;margin:8px 0;font-size:13px;flex-wrap:wrap}'
    + '#nr .pill{background:#121214;border:2px solid #2A2A2E;border-radius:999px;padding:6px 12px}'
    + '#nr .row{display:flex;gap:8px;margin-top:8px}'
    + '#nr button{cursor:pointer;border:2px solid #2A2A2E;border-radius:12px;padding:14px;font-weight:900;font-size:18px;min-height:56px;background:#121214;color:#F2EDE3;flex:1}'
    + '#nr button:active{border-color:#C6F135}'
    + '#nr #nrBoost{flex:2;background:linear-gradient(135deg,#C6F135,#8FE000);color:#070708;border:none}'
    + '#nr #nr3d{flex:0.7;background:#121214;color:#C6F135;border:2px solid #C6F135;font-size:15px}'
    + '#nr #nrFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'nr';
  box.innerHTML = '<div id="nrStat">connecting…</div>'
    + '<canvas id="nrCv" width="480" height="640" aria-label="Nitro rift track"></canvas>'
    + '<div class="hud"><span class="pill" id="nrPlace">P–</span><span class="pill" id="nrBoostP">⚡ 60</span>'
    + '<span class="pill" id="nrHeat">🏁 heat 1</span></div>'
    + '<div class="row"><button id="nrL">◀</button><button id="nrBoost">BOOST</button><button id="nrR">▶</button><button id="nr3d">✨</button></div>'
    + '<div id="nrFeed"></div>';
  el.appendChild(box);

  const cv = box.querySelector('#nrCv') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const stat = box.querySelector('#nrStat') as HTMLElement;
  const placeP = box.querySelector('#nrPlace') as HTMLElement;
  const boostP = box.querySelector('#nrBoostP') as HTMLElement;
  const heatP = box.querySelector('#nrHeat') as HTMLElement;
  const feed = box.querySelector('#nrFeed') as HTMLElement;
  const say = (m: string): void => { stat.textContent = m; };

  let closed = false;
  let snap: Snap | null = null;
  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;

  const intent = { dx: 0, boost: false };
  let lastSent = '';
  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }
  function pushIntent(force = false): void {
    const key = `${intent.dx},${intent.boost}`;
    if (!force && key === lastSent) return;
    lastSent = key;
    send('input', { dx: intent.dx, dy: 0, fire: intent.boost || undefined });
  }
  window.setInterval(() => { if (!closed) pushIntent(); }, 66);

  const hold = (btn: HTMLButtonElement, down: () => void, up: () => void): void => {
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); down(); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, () => up());
  };
  hold(box.querySelector('#nrL') as HTMLButtonElement,
    () => { intent.dx = -1; pushIntent(true); },
    () => { intent.dx = 0; pushIntent(true); });
  hold(box.querySelector('#nrR') as HTMLButtonElement,
    () => { intent.dx = 1; pushIntent(true); },
    () => { intent.dx = 0; pushIntent(true); });
  hold(box.querySelector('#nrBoost') as HTMLButtonElement,
    () => { intent.boost = true; pushIntent(true); },
    () => { intent.boost = false; pushIntent(true); });
  window.addEventListener('keydown', (e) => {
    if (closed || /INPUT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    if (e.key === 'ArrowLeft') { intent.dx = -1; pushIntent(true); }
    if (e.key === 'ArrowRight') { intent.dx = 1; pushIntent(true); }
    if (e.key === ' ') { intent.boost = true; pushIntent(true); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' && intent.dx === -1) { intent.dx = 0; pushIntent(true); }
    if (e.key === 'ArrowRight' && intent.dx === 1) { intent.dx = 0; pushIntent(true); }
    if (e.key === ' ') { intent.boost = false; pushIntent(true); }
  });

  function paint(): void {
    if (!snap) {
      const W0 = (cv.width = cv.clientWidth * 2 || 480);
      cv.height = Math.round(W0 * 1.33);
      return;
    }
    // HUD always updates (2D and 3D alike).
    placeP.textContent = `P${snap.you.place || '–'}/${snap.racers.length}`;
    boostP.textContent = `⚡ ${snap.you.boost}`;
    heatP.textContent = `🏁 heat ${snap.heat} · lap ${snap.you.lap ?? 1}/2`;
    feed.textContent = snap.feed.join(' · ');
    if (snap.phase === 'lobby') say('heat forms… first across takes it');
    else if (snap.phase === 'race') say(`P${snap.you.place} — pads refill boost, bumps cost speed`);
    else say('heat done — fresh grid in a few seconds');
    if (three) { try { three.render(snap); } catch { three = null; } if (three) return; }
    const W = (cv.width = cv.clientWidth * 2 || 480);
    const H = (cv.height = Math.round(W * 1.33));
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0E0E12';
    g.fillRect(0, 0, W, H);
    const laneW = W / LANES;
    g.strokeStyle = '#2A2A2E';
    g.lineWidth = 2;
    for (let i = 1; i < LANES; i++) {
      g.beginPath(); g.moveTo(i * laneW, 0); g.lineTo(i * laneW, H); g.stroke();
    }
    // camera: you stay at 78% height, world scrolls (lap-relative: prog wraps)
    const myLapProg = snap.you.prog % TRACK;
    const cam = myLapProg - TRACK * 0.22;
    const yOf = (prog: number): number => H * 0.9 - (((prog % TRACK) - cam) / (TRACK * 0.55)) * H;
    // finish line
    const fy = yOf(TRACK);
    if (fy > -20 && fy < H + 20) {
      g.fillStyle = '#F2EDE3';
      for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) {
        if ((i + j) % 2 === 0) g.fillRect((W / 12) * i, fy + j * 8, W / 12, 8);
      }
    }
    for (const p of snap.pads) {
      const y = yOf(p.at);
      if (y < -20 || y > H + 20) continue;
      g.fillStyle = '#C6F135';
      g.beginPath();
      const x = (p.lane + 0.5) * laneW;
      g.moveTo(x, y - 12); g.lineTo(x + 12, y); g.lineTo(x, y + 12); g.lineTo(x - 12, y);
      g.closePath(); g.fill();
    }
    for (const r of snap.racers) {
      const y = Math.max(14, Math.min(H - 14, yOf(r.prog)));
      const x = (r.lane + 0.5) * laneW;
      g.beginPath();
      g.arc(x, y, r.you ? 15 : 12, 0, Math.PI * 2);
      g.fillStyle = r.you ? '#C6F135' : r.bot ? '#8A8A93' : '#FF3D8A';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#070708';
      g.stroke();
      g.fillStyle = '#F2EDE3';
      g.font = '11px system-ui';
      g.textAlign = 'center';
      g.fillText(`${r.fin ? '🏁 ' : ''}${r.n.slice(0, 9)}`, x, y - 18);
    }
  }

  // --- optional 3D overlay (explicit tap only; 2D is the game) ---
  let three: { render: (s: Snap) => void } | null = null;
  (box.querySelector('#nr3d') as HTMLButtonElement).addEventListener('click', async () => {
    say('loading 3D… (one-time, stays 2D if offline)');
    const kit = await loadThree();
    if (closed || !kit) { say(kit ? '3D ready' : 'offline — staying on 2D, fully playable'); return; }
    try {
      three = enableNitro3D(kit, cv);
      say(kit.kind === 'threepipe' ? `✨ threepipe ${kit.version} 3D on` : `✨ three.js ${kit.version} 3D on`);
    } catch { say('3D failed to start — 2D stays'); }
  });

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=nitro-rift&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('on the grid — pedal down!');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as Snap;
        if (p && p.t === 'nitro') { snap = p; paint(); }
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

function enableNitro3D(kit: { kind: string; api: unknown }, cv: HTMLCanvasElement): { render: (s: Snap) => void } {
  const THREE = kit.api as {
    Scene: new () => { add(o: unknown): void; background: unknown };
    PerspectiveCamera: new (f: number, a: number, n: number, fa: number) => { position: { set(x: number, y: number, z: number): void } };
    WebGLRenderer: new (o: { canvas: HTMLCanvasElement }) => {
      setSize(w: number, h: number): void; render(a: unknown, b: unknown): void;
    };
    PlaneGeometry: new (w: number, h: number) => unknown;
    BoxGeometry: new (w: number, h: number, d: number) => unknown;
    MeshBasicMaterial: new (o: { color: number }) => unknown;
    Mesh: new (geo: unknown, mat: unknown) => { position: { set(x: number, y: number, z: number): void } };
    Color: new (c: string) => unknown;
  };
  const K = 0.1; // world units → scene units (1200u track = 120 long)
  const laneX = (lane: number): number => (lane - 1.5) * 8;
  const renderer = new THREE.WebGLRenderer({ canvas: cv });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0E0E12');
  const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
  const track = new THREE.Mesh(new THREE.PlaneGeometry(40, 130), new THREE.MeshBasicMaterial({ color: 0x14141a }));
  scene.add(track);
  const line = new THREE.Mesh(new THREE.BoxGeometry(36, 0.5, 1.2), new THREE.MeshBasicMaterial({ color: 0xf2ede3 }));
  line.position.set(0, 0.2, 0);
  scene.add(line);
  const cars = new Map<string, { position: { set(x: number, y: number, z: number): void } }>();
  const padDots = new Map<string, { position: { set(x: number, y: number, z: number): void } }>();
  return {
    render(s: Snap): void {
      const W = cv.clientWidth || 480;
      renderer.setSize(W, Math.round(W * 1.33));
      const myLap = s.you.prog % TRACK;
      cam.position.set(laneX(s.you.lane), 26, -myLap * K + 24);
      for (const p of s.pads) {
        const key = `${p.at}:${p.lane}`;
        let m = padDots.get(key);
        if (!m) {
          m = new THREE.Mesh(
            new THREE.BoxGeometry(2.4, 0.6, 2.4),
            new THREE.MeshBasicMaterial({ color: 0xc6f135 }),
          ) as unknown as { position: { set(x: number, y: number, z: number): void } };
          scene.add(m);
          padDots.set(key, m);
        }
        m.position.set(laneX(p.lane), 0.4, -(p.at % TRACK) * K);
      }
      for (const r of s.racers) {
        let m = cars.get(r.n);
        if (!m) {
          m = new THREE.Mesh(
            new THREE.BoxGeometry(3.4, 1.6, 6),
            new THREE.MeshBasicMaterial({ color: r.you ? 0xc6f135 : r.bot ? 0x8a8a93 : 0xff3d8a }),
          ) as unknown as { position: { set(x: number, y: number, z: number): void } };
          scene.add(m);
          cars.set(r.n, m);
        }
        m.position.set(laneX(r.lane), 1, -(r.prog % TRACK) * K);
      }
      renderer.render(scene, cam);
    },
  };
}
