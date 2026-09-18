// apps/web/src/games/ghostline.ts — GH-4: canvas course + drag-flick client.
// The 480×320 seeded course renders 1:1 (×2 for DPR crispness, CSS scales to
// 360px). Drag anywhere: release to flick along the drag vector, power from
// length. Rivals paint as translucent ghosts with client-side fading trails.
// Keyboard: arrows aim, Enter fires. Paints on snapshots only — no rAF loop.
export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string;
  seed: number;
  walls: { x: number; y: number; w: number; h: number }[];
  shotsLeft: number;
  puck: { x: number; y: number };
  atRest: boolean;
  endsInMs: number;
  leaders: { n: string; shots: number; finished: boolean; timeMs: number; you: boolean; bot: boolean }[];
  pucks: { n: string; x: number; y: number; you: boolean; bot: boolean; finished: boolean }[];
  feed: string[];
  you: { shots: number; best: number | null };
};

const FW = 480;
const FH = 320;
const S = 2; // canvas scale (DPR-crisp, CSS-fluid)

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#gl{font-weight:700}#gl #glStat{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:6px}'
    + '#gl canvas{width:100%;border-radius:16px;border:2px solid #2A2A2E;background:#0E0E12;touch-action:none;display:block;cursor:crosshair}'
    + '#gl .hud{display:flex;gap:8px;margin:8px 0;font-size:13px;flex-wrap:wrap}'
    + '#gl .pill{background:#121214;border:2px solid #2A2A2E;border-radius:999px;padding:6px 12px}'
    + '#gl #glBoard{font-size:12px;color:#B9B2A4;margin-top:6px;line-height:1.7}'
    + '#gl #glFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'gl';
  box.innerHTML = '<div id="glStat">connecting…</div>'
    + `<canvas id="glCv" width="${FW * S}" height="${FH * S}" aria-label="Ghostline flick course. Drag to aim and release to flick."></canvas>`
    + '<div class="hud"><span class="pill" id="glShots">🎯 —</span><span class="pill" id="glBest">👻 —</span>'
    + '<span class="pill" id="glSeed">🌱 —</span></div>'
    + '<div id="glBoard"></div><div id="glFeed"></div>';
  el.appendChild(box);

  const cv = box.querySelector('#glCv') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const stat = box.querySelector('#glStat') as HTMLElement;
  const shotsP = box.querySelector('#glShots') as HTMLElement;
  const bestP = box.querySelector('#glBest') as HTMLElement;
  const seedP = box.querySelector('#glSeed') as HTMLElement;
  const board = box.querySelector('#glBoard') as HTMLElement;
  const feed = box.querySelector('#glFeed') as HTMLElement;
  const say = (m: string): void => { stat.textContent = m; };

  let closed = false;
  let snap: Snap | null = null;
  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;
  const trails = new Map<string, { x: number; y: number }[]>();
  // Keyboard aim state (arrows + Enter); drag sets it too so both agree.
  let aimA = 0;
  let aimP = 0.6;

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }

  function canFlick(): boolean {
    return !!snap && snap.phase === 'run' && snap.atRest && snap.shotsLeft > 0;
  }

  function doFlick(angle: number, power: number): void {
    if (!canFlick()) return;
    const pw = Math.min(1, Math.max(0.15, power));
    if (!Number.isFinite(angle) || !Number.isFinite(pw)) return;
    // A flick IS a vector: dx/dy is the wire shape isInput already accepts,
    // so no protocol change — the driver decodes angle/power back out.
    send('input', { dx: Math.cos(angle) * pw, dy: Math.sin(angle) * pw });
    say('flicked!'); // same-tick: the next snap paints it
  }

  function toCourse(e: PointerEvent): { x: number; y: number } {
    const r = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * FW,
      y: ((e.clientY - r.top) / r.height) * FH,
    };
  }

  let drag: { x: number; y: number } | null = null;
  cv.addEventListener('pointerdown', (e) => {
    if (!canFlick()) return;
    cv.setPointerCapture(e.pointerId);
    drag = toCourse(e);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drag || !snap) return;
    const p = toCourse(e);
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    if (Math.hypot(dx, dy) > 8) {
      aimA = Math.atan2(dy, dx);
      aimP = Math.min(1, Math.hypot(dx, dy) / 200);
    }
    paint();
  });
  cv.addEventListener('pointerup', (e) => {
    if (!drag || !snap) { drag = null; return; }
    const p = toCourse(e);
    const dx = p.x - drag.x;
    const dy = p.y - drag.y;
    drag = null;
    if (Math.hypot(dx, dy) < 12) { paint(); return; } // a tap, not a flick
    doFlick(Math.atan2(dy, dx), Math.hypot(dx, dy) / 200);
    paint();
  });
  cv.addEventListener('pointercancel', () => { drag = null; paint(); });
  window.addEventListener('keydown', (e) => {
    if (closed || /INPUT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    if (!snap) return;
    const me = snap.pucks.find((p) => p.you);
    const gx = 440 - (me?.x ?? 40);
    const gy = 160 - (me?.y ?? 160);
    if (e.key === 'ArrowLeft') { aimA = Math.atan2(gy, gx); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { aimA = Math.atan2(gy, gx); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { aimP = Math.min(1, aimP + 0.1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { aimP = Math.max(0.15, aimP - 0.1); paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { aimA = Math.atan2(gy, gx); doFlick(aimA, aimP); paint(); e.preventDefault(); }
  });

  function paint(): void {
    g.setTransform(S, 0, 0, S, 0, 0);
    g.clearRect(0, 0, FW, FH);
    g.fillStyle = '#0E0E12';
    g.fillRect(0, 0, FW, FH);
    if (!snap) {
      g.fillStyle = '#B9B2A4';
      g.font = '700 14px system-ui';
      g.textAlign = 'center';
      g.fillText('reading the line…', FW / 2, FH / 2);
      return;
    }
    // walls
    g.fillStyle = '#2A2A2E';
    for (const w of snap.walls) {
      g.beginPath();
      g.roundRect(w.x, w.y, w.w, w.h, 4);
      g.fill();
    }
    g.strokeStyle = '#3A3A40';
    g.lineWidth = 1;
    for (const w of snap.walls) {
      g.beginPath();
      g.roundRect(w.x, w.y, w.w, w.h, 4);
      g.stroke();
    }
    // start tee
    g.strokeStyle = '#46E0D4';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(40, 160, 10, 0, Math.PI * 2);
    g.stroke();
    // goal ring
    g.strokeStyle = '#C6F135';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(440, 160, 14, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#C6F135';
    g.font = '11px system-ui';
    g.textAlign = 'center';
    g.fillText('HOLE', 440, 162);
    // ghost trails (client-side fading dots per rival)
    const seen = new Set<string>();
    for (const p of snap.pucks) {
      seen.add(p.n);
      let tr = trails.get(p.n);
      if (!tr) { tr = []; trails.set(p.n, tr); }
      const last = tr[tr.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 3) {
        tr.push({ x: p.x, y: p.y });
        if (tr.length > 24) tr.shift();
      }
      if (p.you) continue;
      tr.forEach((t, i) => {
        g.fillStyle = `rgba(185,178,164,${(0.05 + 0.2 * (i / tr.length)).toFixed(3)})`;
        g.beginPath();
        g.arc(t.x, t.y, 3, 0, Math.PI * 2);
        g.fill();
      });
    }
    for (const k of [...trails.keys()]) if (!seen.has(k)) trails.delete(k);
    // pucks: rivals translucent, mine solid + ring
    for (const p of snap.pucks) {
      if (p.you) continue;
      g.fillStyle = p.finished ? 'rgba(198,241,53,.55)' : 'rgba(240,235,220,.55)';
      g.beginPath();
      g.arc(p.x, p.y, 6, 0, Math.PI * 2);
      g.fill();
    }
    const me = snap.pucks.find((p) => p.you);
    if (me) {
      g.fillStyle = '#C6F135';
      g.beginPath();
      g.arc(me.x, me.y, 6, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#070708';
      g.lineWidth = 2;
      g.stroke();
      // aim arrow while draggable (or keyboard aiming)
      if (canFlick() && (drag || document.activeElement === document.body)) {
        const L = 24 + aimP * 60;
        g.strokeStyle = '#46E0D4';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(me.x, me.y);
        g.lineTo(me.x + Math.cos(aimA) * L, me.y + Math.sin(aimA) * L);
        g.stroke();
        g.fillStyle = '#46E0D4';
        g.font = '700 11px system-ui';
        g.textAlign = 'left';
        g.fillText(`${Math.round(aimP * 100)}%`, me.x + Math.cos(aimA) * (L + 6), me.y + Math.sin(aimA) * (L + 6));
      }
    }
    shotsP.textContent = `🎯 ${snap.shotsLeft} left`;
    bestP.textContent = snap.you.best === null ? '👻 no ghost yet' : `👻 best ${snap.you.best}`;
    seedP.textContent = `🌱 seed ${snap.seed}`;
    board.textContent = snap.leaders
      .map((l, i) => `${i === 0 ? '👻' : `${i + 1}.`} ${l.n}${l.you ? ' (you)' : ''} ${l.finished ? `in ${l.shots}` : `· ${l.shots} shots`}`)
      .join('   ');
    feed.textContent = snap.feed.join(' · ');
    if (snap.phase === 'run') {
      say(canFlick() ? 'your flick — drag to aim, release to fire!' : 'rolling…');
    } else if (snap.phase === 'final') {
      say(snap.endsInMs > 0 ? 'run over — fresh course soon' : 'run over!');
    } else say('seats filling — the line forms…');
  }

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=ghostline&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('on the tee — reading the line…');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as Snap;
        if (p && p.t === 'line') {
          snap = p;
          if (snap.phase === 'run' && snap.atRest && snap.shotsLeft > 0) {
            const mine = snap.pucks.find((x) => x.you);
            if (mine) aimA = Math.atan2(160 - mine.y, 440 - mine.x);
          }
          paint();
        }
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
