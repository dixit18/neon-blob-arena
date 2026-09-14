// Neon Blob Arena client — FULL 3D (Three.js) presentation, authoritative 2D sim.
// UI animation (menu/banner/overlays) loads GSAP lazily; render loop stays hand-rolled.
import { uiMenuIn, uiCrownPop, uiDeathIn, uiPressify } from './ui-anim';
import type { World3D, DrawPlayer } from './three-render';
// Three.js loads lazily on PLAY (menu paints in ~22KB); canvas loop stays hand-rolled.
let world: World3D | null = null;
let worldFailed = false;
async function ensureWorld(): Promise<World3D | null> {
  if (world) return world;
  if (worldFailed) return null;
  try {
    const m = await import('./three-render');
    world = new m.World3D(canvas);
    world.resize(W, H);
    return world;
  } catch (e) {
    console.error('[3d] failed to load three.js chunk', e);
    worldFailed = true;
    return null;
  }
}

type Snap = {
  t: string; tick: number; you: string;
  me?: { x: number; y: number; r: number; mass: number; dashReady: boolean; score: number; kills: number; alive: boolean; streak: number; sh: number; respawnIn?: number };
  players: { id: string; n: string; x: number; y: number; r: number; h: number; k: number; s: number; b: number; ht: number }[];
  pellets: { id: number; x: number; y: number; hue: number }[];
  orbs: { i: number; x: number; y: number; h: number }[];
  leaders: { n: string; s: number }[];
  feed: string[];
  taunts: { id: string; e: number }[];
  round: number; // seconds left in the 3-min round
};

const canvas = document.getElementById('game3d') as HTMLCanvasElement;
const fxCanvas = document.getElementById('fx2d') as HTMLCanvasElement;
const octx = fxCanvas.getContext('2d')!; // 2D overlay: joystick + emote floaters only
const mini = document.getElementById('minimap') as HTMLCanvasElement;
const mctx = mini.getContext('2d')!;
const el = (id: string) => document.getElementById(id)!;

// Adaptive quality: DPR ladder capped by device; governor (below) steps down on slow p95
const DPR_LADDER = [1.5, 1.25, 1.0].filter(d => d <= Math.min(window.devicePixelRatio || 1, 1.5));

const WORLD = 4000;
let W = 0, H = 0, DPR = DPR_LADDER[0] ?? 1;
function applySize() {
  W = window.innerWidth; H = window.innerHeight;
  fxCanvas.width = Math.floor(W * DPR); fxCanvas.height = Math.floor(H * DPR);
  fxCanvas.style.width = W + 'px'; fxCanvas.style.height = H + 'px';
  octx.setTransform(DPR, 0, 0, DPR, 0, 0);
  world?.resize(W, H);
}
function resize() { applySize(); }
function applyQuality() {
  DPR = DPR_LADDER[Math.min(qTier, DPR_LADDER.length - 1)] ?? 1;
  applySize();
  world?.setPixelRatio(DPR);
}
function governQuality(now: number) {
  if (!world || now - lastQAt < 2000) return; // decide at most every 2s, never pre-boot
  lastQAt = now;
  if (ftP95() > 22 && qTier < DPR_LADDER.length - 1) { qTier++; qGood = 0; applyQuality(); }
  else if (ftP95() < 12 && qTier > 0) { if (++qGood >= 3) { qTier--; qGood = 0; applyQuality(); } }
  else qGood = 0;
}
window.addEventListener('resize', resize); resize();

// ---------- state ----------
let ws: WebSocket | null = null;
let myId = '';
let roomId = new URLSearchParams(location.search).get('room') || '';
let myName = localStorage.getItem('blob-name') || '';
if (myName) (el('name') as HTMLInputElement).value = myName;
if (roomId) el('roomLabel').textContent = `Room: ${roomId} — friends joining this link land here`;

let me = { x: WORLD / 2, y: WORLD / 2, r: 20, mass: 12, dashReady: true, alive: true, score: 0, kills: 0, streak: 0, sh: 0, pvx: 0, pvy: 0 };
// remote interpolation: id -> {a, b, t0} snapshots
const remotes = new Map<string, { n: string; h: number; r: number; ax: number; ay: number; bx: number; by: number; t: number; gone?: number; ht: number }>();
const snapIds = new Set<string>(); // hoisted: per-snap membership without alloc
type Orb2D = { i: number; x: number; y: number; hue: number };
const orbs: Orb2D[] = []; // slots reused across snaps (array only grows to max)
// draw-list pool: one DrawPlayer object per slot, reused every frame (no per-frame garbage)
const plist: DrawPlayer[] = [];
function plistSlot(pi: number): DrawPlayer {
  let d = plist[pi];
  if (!d) { d = { id: '', x: 0, y: 0, r: 0, hue: 0, name: '', isMe: false, hunter: false, shielded: false }; plist[pi] = d; }
  return d;
}
const projOut = { x: 0, y: 0, behind: false }; // hoisted toScreen target
let pellets: { x: number; y: number; hue: number }[] = [];
let cam = { x: me.x, y: me.y };
let trauma = 0;
type Particle = { x: number; y: number; vx: number; vy: number; life: number; hue: number; r: number };
const particles: Particle[] = [];
const particleFree: Particle[] = []; // freelist: bursts reuse objects, never churn GC
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
  if (!soundOn) return;
  switch (kind) {
    case 'dash': tone(300, 900, 0.18, 'sawtooth', 0.08); break;
    case 'eat': tone(400 + Math.random() * 200, 900, 0.09, 'sine', 0.10); break;
    case 'kill': tone(500, 1000, 0.12, 'square', 0.07); tone(750, 1500, 0.14, 'square', 0.05, 0.07); break;
    case 'die': tone(400, 60, 0.4, 'sawtooth', 0.12); break;
    case 'click': tone(600, 800, 0.06, 'sine', 0.06); break;
  }
}
type Ring2D = { x: number; y: number; r: number; max: number; life: number; hue: number };
const rings: Ring2D[] = [];
const ringFree: Ring2D[] = []; // freelist: shockwaves reuse objects
const EMOTES = ['😂', '😈', '💪', '😱', '👋'];
let liveTaunts: { id: string; e: number }[] = [];
let lastTauntAt = 0;
let best = Number(localStorage.getItem('blob-best') || 0); // personal best (motivation loop)
let lastBanner = '';
// QA-mandated throttles: DOM writes were the #1 local jank source (15Hz innerHTML)
let lastDomAt = 0, lastLeadHtml = '', lastFeedHtml = '';
let lastMeHtml = '', lastPcount = '', lastPillTxt = '', lastPillDanger = false;
let lastNudgeTxt = '', lastNudgeHot = false, nudgeShown = false;
let frameNo = 0, fpsEma = 60;
// Phase-0 probe: frame-time ring + longtask counter (measure-first, both devices)
const FT_N = 120;
const ftRing = new Float32Array(FT_N);
let ftIdx = 0, ftFilled = 0, longTasks = 0;
try {
  const po = new PerformanceObserver((list) => { longTasks += list.getEntries().length; });
  po.observe({ entryTypes: ['longtask'] });
} catch { /* Firefox/Safari lack longtask: p95 still works */ }
function ftPush(ms: number) { ftRing[ftIdx] = ms; ftIdx = (ftIdx + 1) % FT_N; if (ftFilled < FT_N) ftFilled++; }
function ftP95(): number {
  if (ftFilled === 0) return 0;
  const a = Array.from(ftRing.subarray(0, ftFilled));
  a.sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * 0.95))];
}
let qTier = 0, qGood = 0, lastQAt = 0;
const LEVELS: [string, number][] = [['Minnow', 0], ['Nibbler', 25], ['Chonk', 50], ['Brute', 90], ['Titan', 140], ['BLOB GOD', 200]];
let myLevel = 0;
function levelFor(mass: number): number { let li = 0; for (let i = 0; i < LEVELS.length; i++) if (mass >= LEVELS[i][1]) li = i; return li; }
// coach toast: concept tutorial for first-timers (concept-clarity fix)
let coachTO: ReturnType<typeof setTimeout> | null = null;
function coach(msg: string, ms = 2800) {
  const c = el('coach');
  c.textContent = msg;
  c.style.display = 'block';
  if (coachTO) clearTimeout(coachTO);
  coachTO = setTimeout(() => { c.style.display = 'none'; }, ms);
}
function ring(x: number, y: number, max: number, hue: number) {
  const g = ringFree.pop() ?? { x: 0, y: 0, r: 0, max: 0, life: 0, hue: 0 };
  g.x = x; g.y = y; g.r = 8; g.max = max; g.life = 0.45; g.hue = hue;
  rings.push(g);
  if (rings.length > 24) { const old = rings.shift(); if (old) ringFree.push(old); }
}
let hitstop = 0;
let spectateId: string | null = null;
let prevMass = 12, prevKills = 0;
let soundOn = localStorage.getItem('blob-sound') !== 'off';
function buzz(p: number | number[]) { try { navigator.vibrate?.(p); } catch { /* unsupported */ } }

// input
const keys = new Set<string>();
let mouse = { x: W / 2, y: H / 2, active: false };
let joy = { active: false, dx: 0, dy: 0, id: -1, ox: 0, oy: 0 };
let dashQueued = false;
let seq = 0;
let fireQueued = false; // tap FIRE / click to shoot toward facing (server-authoritative orbs)
let inputTimer: ReturnType<typeof setInterval> | null = null; // single input loop (reconnects must not stack)

window.addEventListener('keydown', e => {
  keys.add(e.key.toLowerCase());
  if (e.code === 'Space') { dashQueued = true; e.preventDefault(); }
  if (e.code === 'KeyF' || e.code === 'Enter') { fireQueued = true; }
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
canvas.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return; // BUGFIX: touch drags poisoned mouse steering (drift after lift)
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
});
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') { joy.active = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.dx = 0; joy.dy = 0; }
  else { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; fireQueued = true; } // click = shoot
});
el('fireBtn').addEventListener('click', () => { fireQueued = true; buzz(15); });
window.addEventListener('pointermove', e => {
  if (joy.active && e.pointerId === joy.id) {
    // R&D tune: 75px base, 10px dead-zone, remapped — no drift, no jump
    const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const l = Math.hypot(dx, dy);
    if (l < 1) { joy.dx = joy.dy = 0; return; }
    const c = l <= 10 ? 0 : Math.min(1, (l - 10) / (75 - 10));
    joy.dx = (dx / l) * c; joy.dy = (dy / l) * c;
  }
});
window.addEventListener('pointerup', e => { if (e.pointerId === joy.id) { joy.active = false; joy.dx = joy.dy = 0; } });
el('dashBtn').addEventListener('click', () => { dashQueued = true; });
el('soundBtn').addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('blob-sound', soundOn ? 'on' : 'off');
  el('soundBtn').textContent = soundOn ? '🔊' : '🔇';
  if (soundOn) sfx('click');
});
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
  // BUGFIX: reconnects used to stack duplicate sockets + input loops (speed-up/jitter).
  try { ws?.close(); } catch { /* already dead */ }
  if (inputTimer) { clearInterval(inputTimer); inputTimer = null; }
  remotes.clear(); pellets = []; liveTaunts = []; spectateId = null;
  const q = new URLSearchParams({ name });
  if (roomId) q.set('room', roomId);
  ws = new WebSocket(`${SERVER}?${q.toString()}`);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'hello') {
      myId = m.you; roomId = m.room;
      history.replaceState(null, '', `?room=${roomId}`);
      el('roomLabel').textContent = `Room: ${roomId} — friends with this link land straight in`;
      el('roomPill').textContent = `🎲 room ${roomId}`;
      el('menu').style.display = 'none';
      if (!localStorage.getItem('blob-seen')) { // first-timer concept tutorial
        localStorage.setItem('blob-seen', '1');
        const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        setTimeout(() => coach(touch ? '👆 Drag anywhere to move & grow' : '🍩 Eat the glowing dots to grow big'), 600);
        setTimeout(() => coach(touch ? '⚡ Tap DASH to burst through rivals' : '⚡ Press SPACE to dash through rivals'), 4200);
        setTimeout(() => coach('👑 Biggest blob when ⏱ hits 0 wins the round!'), 7800);
      }
      return;
    }
    if (m.t === 'died') {
      trauma = Math.min(1, trauma + 0.7);
      burst(me.x, me.y, 26, 280);
      ring(me.x, me.y, me.r + 90, 280);
      sfx('die');
      buzz([40, 40, 80]);
      spectateId = null;
      el('deadTitle').textContent = '💥 Eaten!';
      void uiDeathIn();
      el('deadSub').textContent = `Eaten by ${m.by}. Spectating…`;
      if (me.score > best && me.score > 0) {
        best = Math.floor(me.score);
        localStorage.setItem('blob-best', String(best));
        el('bestLine').textContent = `🏅 best: ${best}`;
        el('deadSub').textContent += ` 🎉 New best!`;
      }
      el('dead').style.display = 'flex';
      return;
    }
    if (m.t === 'snap') onSnap(m as Snap);
  };
  ws.onclose = () => {
    setTimeout(() => { if (el('menu').style.display === 'none') connect(name); }, 1500);
  };
  // input @30Hz with redundant feel, server rate-limits anyway
  if (inputTimer) clearInterval(inputTimer);
  inputTimer = setInterval(() => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const d = inputDir();
    // local prediction MIRRORS the server steering model (same accel constant),
    // so reconcile stops fighting us — this was the rubber-band "lag" feel.
    const spd = 330 * Math.pow(12 / Math.max(12, me.mass), 0.22);
    const k = 1 - Math.exp(-8 * (1 / 30));
    me.pvx += (d.dx * spd - me.pvx) * k;
    me.pvy += (d.dy * spd - me.pvy) * k;
    me.x += me.pvx * (1 / 30); me.y += me.pvy * (1 / 30);
    me.x = Math.max(me.r, Math.min(WORLD - me.r, me.x));
    me.y = Math.max(me.r, Math.min(WORLD - me.r, me.y));
    ws.send(JSON.stringify({ t: 'input', seq: ++seq, dx: +d.dx.toFixed(3), dy: +d.dy.toFixed(3), dash: dashQueued, fire: fireQueued }));
    if (dashQueued && me.dashReady) { trauma = Math.min(1, trauma + 0.25); burst(me.x, me.y, 10, 200); ring(me.x, me.y, me.r + 70, 190); sfx('dash'); buzz(25); world?.kick(true, false); }
    if (fireQueued) burst(me.x, me.y, 3, 45);
    dashQueued = false; fireQueued = false;
  }, 1000 / 30);
}

function onSnap(s: Snap) {
  lastSnapAt = performance.now();
  if (s.me) {
    // reconcile: server wins, but gently — the old 0.45 yank fought 30Hz
    // prediction every snapshot and read as constant micro-jitter on your own blob
    const m = s.me;
    const err = Math.hypot(m.x - me.x, m.y - me.y);
    if (err > 220) { me.x = m.x; me.y = m.y; me.pvx = 0; me.pvy = 0; } // big desync: hard snap, prediction restarts
    else {
      const pull = 1 - Math.exp(-6 / 15); // critically-damped-ish follow per snap
      me.x += (m.x - me.x) * pull; me.y += (m.y - me.y) * pull;
    }
    me.r = m.r; me.mass = m.mass; me.dashReady = m.dashReady;
    me.alive = m.alive; me.score = m.score; me.kills = m.kills; me.streak = m.streak; me.sh = m.sh;
    // eat detect: sudden mass gain = chomp (juice only — server owns truth)
    if (m.mass - prevMass > 3 && me.alive) { ring(me.x, me.y, me.r + 60, 150); sfx('eat'); hitstop = Math.max(hitstop, 0.045); }
    if (m.kills > prevKills) { sfx('kill'); hitstop = Math.max(hitstop, 0.06); trauma = Math.min(1, trauma + 0.35); world?.kick(false, true); }
    prevMass = m.mass; prevKills = m.kills;
    const li = levelFor(m.mass); // progression beyond leaderboard: titles per size
    if (li > myLevel) {
      myLevel = li;
      coach(`🎖 LEVEL UP — you are now ${LEVELS[li][0]}!`);
      sfx('kill');
      ring(me.x, me.y, me.r + 80, 55);
    }
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
    if (!r) remotes.set(p.id, { n: p.n, h: p.h, r: p.r, ax: p.x, ay: p.y, bx: p.x, by: p.y, t: now, ht: p.ht });
    else { r.ax = renderX(p.id); r.ay = renderY(p.id); r.bx = p.x; r.by = p.y; r.t = now; r.n = p.n; r.h = p.h; r.r = p.r; r.gone = undefined; r.ht = p.ht; }
  }
  // fade-out, not pop-out: AOI edge used to blink blobs in/out every frame
  snapIds.clear();
  for (const p of s.players) snapIds.add(p.id);
  for (const [k, r] of remotes) {
    if (snapIds.has(k)) continue;
    if (r.gone === undefined) r.gone = now;
    else if (now - r.gone > 800) remotes.delete(k);
  }
  // spectate pick: follow the biggest blob while dead
  if (!me.alive && (!spectateId || !remotes.has(spectateId))) {
    let best: string | null = null, bestR = -1;
    for (const [id, r] of remotes) if (r.r > bestR) { bestR = r.r; best = id; }
    spectateId = best;
  }
  pellets = s.pellets;
  // orbs: in-place slot reuse (no per-snap .map garbage; array only grows to max)
  const mapped = s.orbs || [];
  for (let i = 0; i < mapped.length; i++) {
    const o = mapped[i];
    const d = orbs[i];
    if (d) { d.i = o.i; d.x = o.x; d.y = o.y; d.hue = o.h; }
    else orbs.push({ i: o.i, x: o.x, y: o.y, hue: o.h });
  }
  orbs.length = mapped.length;
  liveTaunts = s.taunts || [];
  // throttled DOM (2Hz max, only on change) — EVERYTHING lives here now.
  // These used to write per-snapshot (~15Hz): layout thrash was a top jank source.
  if (now - lastDomAt > 500) {
    lastDomAt = now;
    const lh = s.leaders.map((l, i) => `<div>${i + 1}. ${escapeHtml(l.n)} — ${l.s}</div>`).join('') || '…';
    if (lh !== lastLeadHtml) { lastLeadHtml = lh; el('lleaders').innerHTML = lh; }
    const fh = s.feed.slice(0, 4).map(f => `<span>${escapeHtml(f)}</span>`).join('');
    if (fh !== lastFeedHtml) { lastFeedHtml = fh; el('feed').innerHTML = fh; }
    const meHtml = `🟣${me.mass} ${LEVELS[myLevel][0]} · ⚔️${me.kills}${me.streak >= 2 ? ` · 🔥x${me.streak}` : ''} · 🏅${best} · ${Math.round(fpsEma)}fps/${ftP95().toFixed(0)}ms · ${me.dashReady ? '⚡' : '…'}`;
    if (meHtml !== lastMeHtml) { lastMeHtml = meHtml; el('me').textContent = meHtml; }
    const pcTxt = `${s.players.length + 1} online`;
    if (pcTxt !== lastPcount) { lastPcount = pcTxt; el('pcount').textContent = pcTxt; }
    // round urgency pill
    const mm = Math.floor(s.round / 60), ss = String(s.round % 60).padStart(2, '0');
    const pill = el('roundPill');
    const pillTxt = `⏱ ${mm}:${ss} to crown`;
    if (pillTxt !== lastPillTxt) { lastPillTxt = pillTxt; pill.textContent = pillTxt; }
    const danger = s.round <= 30;
    if (danger !== lastPillDanger) { lastPillDanger = danger; pill.classList.toggle('danger', danger); }
    // invite nudge (urgency to squad up while the room is quiet)
    const count = s.players.length + 1;
    const nudge = el('nudge');
    if (!nudgeShown) { nudgeShown = true; nudge.style.display = 'block'; }
    const nudgeTxt = count < 8 ? `👥 ${count}/25 — quiet! 🔗 invite friends` : `👥 ${count}/25 in this arena`;
    if (nudgeTxt !== lastNudgeTxt) { lastNudgeTxt = nudgeTxt; nudge.textContent = nudgeTxt; }
    const hot = count < 8;
    if (hot !== lastNudgeHot) { lastNudgeHot = hot; nudge.classList.toggle('hot', hot); }
  }
  // winner banner (once per crown)
  const top = s.feed[0] || '';
  if (top.startsWith('🏆') && top !== lastBanner) {
    lastBanner = top;
    // daily crown (comeback loop): my wins persist per-day in this browser
    if (myName && top.includes(myName)) {
      const today = new Date().toISOString().slice(0, 10);
      const crowns = Number(localStorage.getItem('blob-crowns') || 0) + 1;
      localStorage.setItem('blob-crowns', String(crowns));
      localStorage.setItem('blob-crown-day', today);
      el('crownLine').textContent = `👑 crowns: ${crowns}`;
      el('bannerSub').textContent = `👑 DAILY CROWN #${crowns} — defend it tomorrow! Next round running, invite friends 🔗`;
    }
    el('bannerTitle').textContent = top;
    if (!(myName && top.includes(myName))) el('bannerSub').textContent = 'Next round is already running — invite friends now 🔗';
    void uiCrownPop();
    sfx('kill');
  }
}

function renderX(id: string, now = performance.now()) { const r = remotes.get(id); if (!r) return 0; const k = Math.min(1, (now - r.t) / 100); return r.ax + (r.bx - r.ax) * k; }
function renderY(id: string, now = performance.now()) { const r = remotes.get(id); if (!r) return 0; const k = Math.min(1, (now - r.t) / 100); return r.ay + (r.by - r.ay) * k; }
function escapeHtml(s: string) { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
function burst(x: number, y: number, n: number, hue: number) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 260;
    const p = particleFree.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, life: 0, hue: 0, r: 0 };
    p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
    p.life = 0.5 + Math.random() * 0.5; p.hue = hue + Math.random() * 40 - 20; p.r = 2 + Math.random() * 3;
    particles.push(p);
  }
  if (particles.length > 240) {
    const extra = particles.length - 240;
    for (let i = 0; i < extra; i++) particleFree.push(particles[i]);
    particles.splice(0, extra);
  }
}

// ---------- render loop (single instance, guarded — the "render twice" fix) ----------
let last = performance.now();
let loopLive = false;
function kickLoop() { if (!loopLive) { loopLive = true; requestAnimationFrame(frame); } }
function frame(now: number) {
  if (!loopLive) return; // paused (hidden tab) or superseded (HMR/dev double-mount)
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.05, (now - last) / 1000); last = now;
  ftPush(rawDt * 1000); // Phase-0 probe feeds the quality governor + HUD p95
  if (rawDt > 0) fpsEma += ((1 / rawDt) - fpsEma) * 0.05; // QA fps meter (see HUD)
  const dt = hitstop > 0 ? 0 : rawDt; // hit-stop: world freezes, render continues
  if (hitstop > 0) hitstop -= rawDt;
  // camera follows predicted me — or spectate target while dead
  let tx = me.x, ty = me.y;
  if (!me.alive && spectateId) { tx = renderX(spectateId); ty = renderY(spectateId); }
  cam.x += (tx - cam.x) * Math.min(1, rawDt * 6);
  cam.y += (ty - cam.y) * Math.min(1, rawDt * 6);
  trauma = Math.max(0, trauma - dt * 1.6);
  const mobile = Math.min(W, H) < 640;
  governQuality(now); // cheap timestamp gate inside; steps DPR down/up on p95

  // particle + shockwave SIM (positions only — three.js draws them)
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt; if (p.life <= 0) { particleFree.push(p); particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const g = rings[i];
    g.life -= rawDt; if (g.life <= 0) { ringFree.push(g); rings.splice(i, 1); continue; }
    g.r += (g.max - g.r) * Math.min(1, rawDt * 9);
  }

  // draw lists for three (interp stays here; WebGL draws) — pooled, zero alloc
  const fnow = performance.now();
  let pi = 0;
  for (const [id, r] of remotes) {
    if (r.gone !== undefined && fnow - r.gone > 800) continue;
    const d = plistSlot(pi++);
    d.id = id; d.x = renderX(id, fnow); d.y = renderY(id, fnow);
    d.r = r.r; d.hue = r.h; d.name = r.n; d.isMe = false; d.hunter = r.ht === 1; d.shielded = false;
  }
  if (me.alive) {
    const d = plistSlot(pi++);
    d.id = myId; d.x = me.x; d.y = me.y; d.r = me.r; d.hue = 275;
    d.name = myName || 'YOU'; d.isMe = true; d.hunter = false; d.shielded = me.sh === 1;
  }
  plist.length = pi;
  if (world) {
    world.frame({
      camX: cam.x, camY: cam.y, trauma, mobile, time: now,
      players: plist, pellets, orbs, particles, rings, meR: me.r,
    });
  }

  // 2D overlay: emote floaters + joystick ghost
  octx.clearRect(0, 0, W, H);
  const bobT = performance.now() / 240;
  octx.textAlign = 'center';
  for (let i = 0; i < liveTaunts.length; i++) {
    const t = liveTaunts[i];
    const emo = EMOTES[t.e] || '';
    if (!emo) continue;
    let tx2: number | null = null, ty2: number | null = null, tr = 20;
    if (t.id === myId && me.alive) { tx2 = me.x; ty2 = me.y; tr = me.r; }
    else { const r = remotes.get(t.id); if (r) { tx2 = renderX(t.id, fnow); ty2 = renderY(t.id, fnow); tr = r.r; } }
    if (tx2 === null || ty2 === null) continue;
    // perspective-correct projection (fixed-yaw chase cam); fallback to ortho pre-boot
    let sx = tx2 - cam.x + W / 2, sy = ty2 - cam.y + H / 2;
    if (world) {
      world.toScreenInto(tx2, ty2, tr * 1.4 + 26, projOut);
      if (!projOut.behind) { sx = projOut.x; sy = projOut.y; }
    }
    octx.font = '26px sans-serif';
    octx.fillText(emo, sx, sy + Math.sin(bobT + i * 1.7) * 5);
  }

  // joystick overlay: ghost anchor + 75px base + 32px knob (R&D spec)
  if (joy.active) {
    octx.globalAlpha = 0.25;
    octx.fillStyle = '#ffffff';
    octx.beginPath(); octx.arc(joy.ox, joy.oy, 110, 0, 7); octx.fill();
    octx.globalAlpha = 1;
    octx.strokeStyle = '#ffffff88'; octx.lineWidth = 3;
    octx.beginPath(); octx.arc(joy.ox, joy.oy, 75, 0, 7); octx.stroke();
    octx.fillStyle = '#FFE93C';
    octx.beginPath(); octx.arc(joy.ox + joy.dx * 75, joy.oy + joy.dy * 75, 32, 0, 7); octx.fill();
  }
  if ((frameNo++ % 3) === 0) drawMini(); // minimap 20Hz is plenty (was every frame)
}

// (2D sticker bake retired in the full-3D pass — art now lives in three-render.ts)

// (2D painters retired in the full-3D pass — see three-render.ts)

function drawMini() {
  mctx.clearRect(0, 0, 120, 120);
  mctx.fillStyle = '#ffffff10'; mctx.fillRect(0, 0, 120, 120);
  const k = 120 / WORLD;
  mctx.fillStyle = '#4ade80';
  const pn = Math.min(120, pellets.length);
  for (let i = 0; i < pn; i++) { const p = pellets[i]; mctx.fillRect(p.x * k, p.y * k, 1.5, 1.5); }
  mctx.fillStyle = '#f472b6';
  for (const [id] of remotes) mctx.fillRect(renderX(id) * k - 1, renderY(id) * k - 1, 2.5, 2.5);
  mctx.fillStyle = '#fff';
  mctx.beginPath(); mctx.arc(me.x * k, me.y * k, 3, 0, 7); mctx.fill();
}
// single loop instance: hidden tabs pause (GPU idles), HMR kills the stale loop
kickLoop();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) loopLive = false;
  else { last = performance.now(); kickLoop(); }
});
const viteHot = (import.meta as unknown as { hot?: { dispose(fn: () => void): void } }).hot;
viteHot?.dispose(() => { loopLive = false; });

// share-result card (invite loop): 1-tap PNG score flex with room link baked in
function shareCard() {
  const c = document.createElement('canvas'); c.width = 600; c.height = 380;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1E1033'; g.fillRect(0, 0, 600, 380);
  g.strokeStyle = '#FFE93C'; g.lineWidth = 10; g.strokeRect(8, 8, 584, 364);
  g.textAlign = 'center';
  g.fillStyle = '#FFFDF5'; g.font = '900 44px sans-serif';
  g.fillText('BLOB ARENA', 300, 80);
  g.fillStyle = '#F0ABFC'; g.font = '800 30px sans-serif';
  g.fillText(`${myName || 'Blob'} — mass ${me.score} · ⚔️${me.kills} · 🔥x${me.streak}`, 300, 150);
  g.fillStyle = '#CBBFE0'; g.font = '700 26px sans-serif';
  g.fillText(`best ${best} · ${LEVELS[myLevel][0]}`, 300, 195);
  g.fillStyle = '#22D3EE'; g.font = '800 30px sans-serif';
  g.fillText('revenge me 👇', 300, 250);
  g.fillStyle = '#FFFDF5'; g.font = '700 24px sans-serif';
  const link = location.origin + location.pathname + '?room=' + (roomId || 'lobby');
  g.fillText(link.length > 42 ? link.slice(0, 42) + '…' : link, 300, 290);
  g.fillStyle = '#8b8cf6'; g.font = '700 22px sans-serif';
  g.fillText('no signup · 3-min rounds · bots never sleep', 300, 335);
  c.toBlob((blob) => {
    if (!blob) return;
    const b = blob;
    const file = new File([b], 'blob-arena.png', { type: 'image/png' });
    const nav = navigator as Navigator & { share?: (d: { files?: File[]; title?: string; text?: string }) => Promise<void>; canShare?: (d: { files?: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      nav.share({ files: [file], title: 'Blob Arena', text: `I dropped ${me.score} mass — revenge? ${link}` }).catch(() => download());
    } else download();
    function download() {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = 'blob-arena-score.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }
  }, 'image/png');
}

// ---------- menu ----------
let connecting = false; // double-click guard: one PLAY = one socket, one world
el('play').addEventListener('click', async () => {
  if (connecting) return;
  connecting = true;
  try {
    audio(); sfx('click'); // unlock WebAudio on user gesture
    const btn = el('play') as HTMLButtonElement;
    const n = ((el('name') as HTMLInputElement).value || 'Blob' + Math.floor(Math.random() * 99)).slice(0, 14);
    localStorage.setItem('blob-name', n);
    myName = n;
    // lazy 3D: menu stays instant, three.js chunk loads on first PLAY
    if (!world && !worldFailed) {
      const old = btn.textContent;
      btn.textContent = '⏳ LOADING 3D…';
      btn.disabled = true;
      await ensureWorld();
      btn.disabled = false;
      btn.textContent = old;
      if (!world) {
        coach('⚠️ 3D failed to load — check connection & retry');
        return;
      }
    }
    if (!world) {
      coach('⚠️ 3D failed to load — check connection & retry');
      return;
    }
    connect(n);
  } finally {
    connecting = false;
  }
});
el('newRoom').addEventListener('click', () => {
  roomId = Math.random().toString(36).slice(2, 6).toUpperCase();
  history.replaceState(null, '', `?room=${roomId}`);
  el('roomLabel').textContent = `Room: ${roomId} — share the link to squad up`;
  (el('play') as HTMLButtonElement).click();
});
el('respawn').addEventListener('click', () => { el('dead').style.display = 'none'; });
el('soundBtn').textContent = soundOn ? '🔊' : '🔇';
// emote taunt buttons (built from shared fixed set — no free text)
EMOTES.forEach((e, i) => {
  const b = document.createElement('button');
  b.textContent = e; b.title = 'Taunt (3s cooldown)';
  b.addEventListener('click', () => {
    const n = Date.now();
    if (n - lastTauntAt < 1000) return;
    lastTauntAt = n;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'taunt', i }));
    el('emotes').classList.remove('open'); // drawer auto-closes on mobile
  });
  el('emotes').appendChild(b);
});
el('inviteCta').addEventListener('click', () => el('copyLink').click());
el('emotesToggle').addEventListener('click', () => { el('emotes').classList.toggle('open'); sfx('click'); });
el('nudge').addEventListener('click', () => el('copyLink').click());
el('bestLine').textContent = `🏅 best: ${best > 0 ? best : '—'}`;
el('crownLine').textContent = `👑 crowns: ${Number(localStorage.getItem('blob-crowns') || 0) || '—'}`;
el('shareBtn').addEventListener('click', () => { sfx('click'); shareCard(); });
void uiMenuIn();
uiPressify('#play');
uiPressify('#dashBtn');
uiPressify('#fireBtn');

// preload leaderboard count
fetch((SERVER.replace('ws', 'http')) + '/health').then(r => r.json()).then(h => {
  el('pcount').textContent = `${h.players ?? 0} online`;
}).catch(() => {});
