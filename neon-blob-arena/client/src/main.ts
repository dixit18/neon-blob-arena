// Neon Blob Arena client — Canvas2D 60fps, prediction + interpolation, juice.
// No engine. <150KB. Mobile joystick + desktop mouse/WASD.

type Snap = {
  t: string; tick: number; you: string;
  me?: { x: number; y: number; r: number; mass: number; dashReady: boolean; score: number; kills: number; alive: boolean; respawnIn?: number };
  players: { id: string; n: string; x: number; y: number; r: number; h: number; k: number; s: number; b: number }[];
  pellets: { id: number; x: number; y: number; hue: number }[];
  leaders: { n: string; s: number }[];
  feed: string[];
};

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const mini = document.getElementById('minimap') as HTMLCanvasElement;
const mctx = mini.getContext('2d')!;
const el = (id: string) => document.getElementById(id)!;

const WORLD = 4000;
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize); resize();

// ---------- state ----------
let ws: WebSocket | null = null;
let myId = '';
let roomId = new URLSearchParams(location.search).get('room') || '';
let myName = localStorage.getItem('blob-name') || '';
if (myName) (el('name') as HTMLInputElement).value = myName;
if (roomId) el('roomLabel').textContent = `Room: ${roomId} — friends joining this link land here`;

let me = { x: WORLD / 2, y: WORLD / 2, r: 20, mass: 12, dashReady: true, alive: true, score: 0, kills: 0 };
// remote interpolation: id -> {a, b, t0} snapshots
const remotes = new Map<string, { n: string; h: number; r: number; ax: number; ay: number; bx: number; by: number; t: number }>();
let pellets: { x: number; y: number; hue: number }[] = [];
let cam = { x: me.x, y: me.y };
let trauma = 0;
let particles: { x: number; y: number; vx: number; vy: number; life: number; hue: number; r: number }[] = [];
let lastSnapAt = performance.now();

// ---------- juice: procedural SFX + shockwave rings + hit-stop + spectate ----------
let AC: AudioContext | null = null;
function audio(): AudioContext | null {
  if (!AC) { try { AC = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { /* no audio */ } }
  if (AC && AC.state === 'suspended') void AC.resume();
  return AC;
}
function tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
  const ac = audio(); if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f0), t);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function sfx(kind: 'dash' | 'eat' | 'die' | 'kill' | 'click') {
  switch (kind) {
    case 'dash': tone(300, 900, 0.18, 'sawtooth', 0.08); break;
    case 'eat': tone(400 + Math.random() * 200, 900, 0.09, 'sine', 0.10); break;
    case 'kill': tone(500, 1000, 0.12, 'square', 0.07); tone(750, 1500, 0.14, 'square', 0.05, 0.07); break;
    case 'die': tone(400, 60, 0.4, 'sawtooth', 0.12); break;
    case 'click': tone(600, 800, 0.06, 'sine', 0.06); break;
  }
}
let rings: { x: number; y: number; r: number; max: number; life: number; hue: number }[] = [];
function ring(x: number, y: number, max: number, hue: number) {
  rings.push({ x, y, r: 8, max, life: 0.45, hue });
  if (rings.length > 24) rings.shift();
}
let hitstop = 0;
let spectateId: string | null = null;
let prevMass = 12, prevKills = 0;

// input
const keys = new Set<string>();
let mouse = { x: W / 2, y: H / 2, active: false };
let joy = { active: false, dx: 0, dy: 0, id: -1, ox: 0, oy: 0 };
let dashQueued = false;
let seq = 0;

window.addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (e.code === 'Space') { dashQueued = true; e.preventDefault(); }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; });
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') { joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = 0; joy.dy = 0; }
  else { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; }
});
window.addEventListener('pointermove', e => {
  if (joy.active && e.pointerId === joy.id) {
    const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const l = Math.hypot(dx, dy) || 1, max = 60;
    const c = Math.min(1, l / max);
    joy.dx = (dx / l) * c; joy.dy = (dy / l) * c;
  }
});
window.addEventListener('pointerup', e => { if (e.pointerId === joy.id) { joy.active = false; joy.dx = joy.dy = 0; } });
el('dashBtn').addEventListener('click', () => { dashQueued = true; });
el('copyLink').addEventListener('click', async () => {
  const link = location.origin + location.pathname + '?room=' + (roomId || 'lobby');
  try { await navigator.clipboard.writeText(link); el('copyLink').textContent = '✅ Copied!'; }
  catch { prompt('Share this link:', link); }
  setTimeout(() => (el('copyLink').textContent = '🔗 Invite'), 1500);
});

function inputDir(): { dx: number; dy: number } {
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  if (dx !== 0 || dy !== 0) { const l = Math.hypot(dx, dy); return { dx: dx / l, dy: dy / l }; }
  if (joy.active && (joy.dx || joy.dy)) return { dx: joy.dx, dy: joy.dy };
  if (mouse.active) {
    const cx = W / 2, cy = H / 2;
    const vx = mouse.x - cx, vy = mouse.y - cy;
    const l = Math.hypot(vx, vy);
    if (l > 24) { const c = Math.min(1, (l - 24) / 160); return { dx: (vx / l) * c, dy: (vy / l) * c }; }
  }
  return { dx: 0, dy: 0 };
}

// ---------- net ----------
const SERVER = new URLSearchParams(location.search).get('server')
  || (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SERVER
  || (['localhost', '127.0.0.1'].includes(location.hostname) ? `ws://${location.hostname}:7749` : 'wss://neon-blob-arena.onrender.com');

function connect(name: string) {
  const q = new URLSearchParams({ name });
  if (roomId) q.set('room', roomId);
  ws = new WebSocket(`${SERVER}?${q.toString()}`);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'hello') {
      myId = m.you; roomId = m.room;
      history.replaceState(null, '', `?room=${roomId}`);
      el('roomLabel').textContent = `Room: ${roomId} — share the link to squad up`;
      el('menu').style.display = 'none';
      return;
    }
    if (m.t === 'died') {
      trauma = Math.min(1, trauma + 0.7);
      burst(me.x, me.y, 26, 280);
      ring(me.x, me.y, me.r + 90, 280);
      sfx('die');
      spectateId = null;
      el('deadTitle').textContent = '💥 Eaten!';
      el('deadSub').textContent = `Eaten by ${m.by}. Spectating…`;
      el('dead').style.display = 'flex';
      return;
    }
    if (m.t === 'snap') onSnap(m as Snap);
  };
  ws.onclose = () => {
    setTimeout(() => { if (el('menu').style.display === 'none') connect(name); }, 1500);
  };
  // input @30Hz with redundant feel, server rate-limits anyway
  setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const d = inputDir();
    // local prediction: nudge camera + predicted pos for zero-latency feel
    const spd = 330 * Math.pow(12 / Math.max(12, me.mass), 0.22);
    me.x += d.dx * spd * (1 / 30); me.y += d.dy * spd * (1 / 30);
    me.x = Math.max(me.r, Math.min(WORLD - me.r, me.x));
    me.y = Math.max(me.r, Math.min(WORLD - me.r, me.y));
    ws.send(JSON.stringify({ t: 'input', seq: ++seq, dx: +d.dx.toFixed(3), dy: +d.dy.toFixed(3), dash: dashQueued }));
    if (dashQueued && me.dashReady) { trauma = Math.min(1, trauma + 0.25); burst(me.x, me.y, 10, 200); ring(me.x, me.y, me.r + 70, 190); sfx('dash'); }
    dashQueued = false;
  }, 1000 / 30);
}

function onSnap(s: Snap) {
  lastSnapAt = performance.now();
  if (s.me) {
    // reconcile: server wins, but smooth-snap to avoid teleport pop
    const m = s.me;
    const err = Math.hypot(m.x - me.x, m.y - me.y);
    if (err > 220) { me.x = m.x; me.y = m.y; } // big desync: hard snap
    else { me.x += (m.x - me.x) * 0.45; me.y += (m.y - me.y) * 0.45; }
    me.r = m.r; me.mass = m.mass; me.dashReady = m.dashReady;
    me.alive = m.alive; me.score = m.score; me.kills = m.kills;
    // eat detect: sudden mass gain = chomp (juice only — server owns truth)
    if (m.mass - prevMass > 3 && me.alive) { ring(me.x, me.y, me.r + 60, 150); sfx('eat'); hitstop = Math.max(hitstop, 0.045); }
    if (m.kills > prevKills) { sfx('kill'); hitstop = Math.max(hitstop, 0.06); }
    prevMass = m.mass; prevKills = m.kills;
    if (!m.alive) {
      const target = spectateId && remotes.get(spectateId) ? remotes.get(spectateId)! : null;
      const secs = m.respawnIn != null ? Math.max(0, m.respawnIn).toFixed(1) : '…';
      el('dead').style.display = 'flex';
      el('deadSub').textContent = `Spectating ${target ? target.n : 'arena'} — back in ${secs}s`;
    } else if (el('dead').style.display !== 'none') {
      el('dead').style.display = 'none';
    }
  }
  const now = performance.now();
  for (const p of s.players) {
    const r = remotes.get(p.id);
    if (!r) remotes.set(p.id, { n: p.n, h: p.h, r: p.r, ax: p.x, ay: p.y, bx: p.x, by: p.y, t: now });
    else { r.ax = renderX(p.id); r.ay = renderY(p.id); r.bx = p.x; r.by = p.y; r.t = now; r.n = p.n; r.h = p.h; r.r = p.r; }
  }
  // prune gone
  const ids = new Set(s.players.map(p => p.id));
  for (const k of [...remotes.keys()]) if (!ids.has(k)) remotes.delete(k);
  // spectate pick: follow the biggest blob while dead
  if (!me.alive && (!spectateId || !remotes.has(spectateId))) {
    let best: string | null = null, bestR = -1;
    for (const [id, r] of remotes) if (r.r > bestR) { bestR = r.r; best = id; }
    spectateId = best;
  }
  pellets = s.pellets;
  el('lleaders').innerHTML = s.leaders.map((l, i) => `<div>${i + 1}. ${escapeHtml(l.n)} — ${l.s}</div>`).join('') || '…';
  el('feed').innerHTML = s.feed.slice(0, 4).map(f => `<span>${escapeHtml(f)}</span>`).join('');
  el('me').textContent = `mass ${me.mass} · kills ${me.kills} · ${me.dashReady ? '⚡ dash ready' : '…charging'}`;
  el('pcount').textContent = `${s.players.length + 1} in room`;
}

function renderX(id: string) { const r = remotes.get(id); if (!r) return 0; const k = Math.min(1, (performance.now() - r.t) / 100); return r.ax + (r.bx - r.ax) * k; }
function renderY(id: string) { const r = remotes.get(id); if (!r) return 0; const k = Math.min(1, (performance.now() - r.t) / 100); return r.ay + (r.by - r.ay) * k; }
function escapeHtml(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
function burst(x: number, y: number, n: number, hue: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 260;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.5, hue: hue + Math.random() * 40 - 20, r: 2 + Math.random() * 3 });
  }
  if (particles.length > 240) particles.splice(0, particles.length - 240);
}

// ---------- render loop ----------
let last = performance.now();
function frame(now: number) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.05, (now - last) / 1000); last = now;
  const dt = hitstop > 0 ? 0 : rawDt; // hit-stop: world freezes, render continues
  if (hitstop > 0) hitstop -= rawDt;
  // camera follows predicted me — or spectate target while dead
  let tx = me.x, ty = me.y;
  if (!me.alive && spectateId) { tx = renderX(spectateId); ty = renderY(spectateId); }
  cam.x += (tx - cam.x) * Math.min(1, rawDt * 6);
  cam.y += (ty - cam.y) * Math.min(1, rawDt * 6);
  trauma = Math.max(0, trauma - dt * 1.6);
  const shx = trauma * trauma * 14 * (Math.random() * 2 - 1);
  const shy = trauma * trauma * 14 * (Math.random() * 2 - 1);

  ctx.fillStyle = '#070714'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2 - cam.x + shx, H / 2 - cam.y + shy);

  // grid
  const gs = 160;
  ctx.strokeStyle = 'rgba(139,92,246,.13)'; ctx.lineWidth = 1;
  const x0 = Math.max(0, Math.floor((cam.x - W / 2) / gs) * gs), x1 = Math.min(WORLD, cam.x + W / 2);
  const y0 = Math.max(0, Math.floor((cam.y - H / 2) / gs) * gs), y1 = Math.min(WORLD, cam.y + H / 2);
  ctx.beginPath();
  for (let x = x0; x <= x1; x += gs) { ctx.moveTo(x, Math.max(0, cam.y - H / 2)); ctx.lineTo(x, Math.min(WORLD, cam.y + H / 2)); }
  for (let y = y0; y <= y1; y += gs) { ctx.moveTo(Math.max(0, cam.x - W / 2), y); ctx.lineTo(Math.min(WORLD, cam.x + W / 2), y); }
  ctx.stroke();
  // arena border
  ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 6; ctx.strokeRect(0, 0, WORLD, WORLD);

  // pellets (cheap circles, viewport-culled already by server)
  for (const p of pellets) {
    ctx.fillStyle = `hsl(${p.hue} 90% 60%)`;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, 7); ctx.fill();
  }

  // remotes (interpolated)
  for (const [id, r] of remotes) {
    const x = renderX(id), y = renderY(id);
    drawBlob(x, y, r.r, r.h, r.n, false);
  }
  // me on top
  if (me.alive) drawBlob(me.x, me.y, me.r, 275, 'YOU', true);
  else { ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('respawning…', cam.x, cam.y); }

  // particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = `hsl(${p.hue} 95% 65%)`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // knockback shockwave rings
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    g.life -= rawDt; if (g.life <= 0) { rings.splice(i, 1); continue; }
    g.r += (g.max - g.r) * Math.min(1, rawDt * 9);
    ctx.globalAlpha = Math.min(1, g.life * 2.5);
    ctx.strokeStyle = `hsl(${g.hue} 95% 65%)`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  // joystick overlay
  if (joy.active) {
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 60, 0, 7); ctx.stroke();
    ctx.fillStyle = '#a855f7';
    ctx.beginPath(); ctx.arc(joy.ox + joy.dx * 60, joy.oy + joy.dy * 60, 24, 0, 7); ctx.fill();
  }
  drawMini();
}

function drawBlob(x: number, y: number, r: number, hue: number, name: string, isMe: boolean) {
  // glow
  const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 1.6);
  g.addColorStop(0, `hsla(${hue} 90% 60% / .9)`);
  g.addColorStop(1, `hsla(${hue} 90% 50% / 0)`);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r * 1.6, 0, 7); ctx.fill();
  // body
  ctx.fillStyle = `hsl(${hue} 85% 58%)`;
  ctx.strokeStyle = isMe ? '#fff' : `hsl(${hue} 90% 75%)`;
  ctx.lineWidth = isMe ? 3 : 2;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.stroke();
  // eyes (juice, cheap)
  const ex = Math.min(r * 0.35, 10);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x - ex, y - r * 0.15, r * 0.22, 0, 7); ctx.arc(x + ex, y - r * 0.15, r * 0.22, 0, 7); ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(x - ex, y - r * 0.1, r * 0.1, 0, 7); ctx.arc(x + ex, y - r * 0.1, r * 0.1, 0, 7); ctx.fill();
  // name
  ctx.fillStyle = '#fff'; ctx.font = `${Math.max(11, Math.min(15, r * 0.42))}px sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(name, x, y + r + 14);
}

function drawMini() {
  mctx.clearRect(0, 0, 120, 120);
  mctx.fillStyle = '#ffffff10'; mctx.fillRect(0, 0, 120, 120);
  const k = 120 / WORLD;
  mctx.fillStyle = '#4ade80';
  for (const p of pellets.slice(0, 120)) mctx.fillRect(p.x * k, p.y * k, 1.5, 1.5);
  mctx.fillStyle = '#f472b6';
  for (const [id] of remotes) mctx.fillRect(renderX(id) * k - 1, renderY(id) * k - 1, 2.5, 2.5);
  mctx.fillStyle = '#fff';
  mctx.beginPath(); mctx.arc(me.x * k, me.y * k, 3, 0, 7); mctx.fill();
}
requestAnimationFrame(frame);

// ---------- menu ----------
el('play').addEventListener('click', () => {
  audio(); sfx('click'); // unlock WebAudio on user gesture
  const n = ((el('name') as HTMLInputElement).value || 'Blob' + Math.floor(Math.random() * 99)).slice(0, 14);
  localStorage.setItem('blob-name', n);
  connect(n);
});
el('newRoom').addEventListener('click', () => {
  roomId = Math.random().toString(36).slice(2, 6).toUpperCase();
  history.replaceState(null, '', `?room=${roomId}`);
  el('roomLabel').textContent = `Room: ${roomId} — share the link to squad up`;
  (el('play') as HTMLButtonElement).click();
});
el('respawn').addEventListener('click', () => { el('dead').style.display = 'none'; });

// preload leaderboard count
fetch((SERVER.replace('ws', 'http')) + '/health').then(r => r.json()).then(h => {
  el('pcount').textContent = `${h.players ?? 0} online`;
}).catch(() => {});
