// apps/web/src/games/ludo-clash.ts — LD-4: canvas board + dice client.
// Stylized parametric board (superellipse 52-loop + 4 home lanes + bases +
// center crown) — readable at 360px, no asset weight. ROLL paints same-tick;
// option tokens pulse and are tappable. Keyboard: Space = roll, 1-4 = pick.
export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string;
  board: {
    seats: { n: string; you: boolean; bot: boolean; color: number; tokens: number[]; finished: number }[];
    turn: { name: string; you: boolean; endsInMs: number; dice: number; options: number[]; canRoll: boolean } | null;
  } | null;
  scores: { n: string; s: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { score: number; finished: number };
};

const STARTS = [0, 13, 26, 39];
const COLORS = ['#FF3D8A', '#46E0D4', '#C6F135', '#B78CFF'];

function loopXY(cell: number, cx: number, cy: number, R: number): { x: number; y: number } {
  // superellipse loop (n=4): squarish ring, 52 cells around
  const a = (cell / 52) * Math.PI * 2 - Math.PI / 2;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const n = 4;
  const x = cx + R * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const y = cy + R * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  return { x, y };
}

function tokenXY(seat: number, rel: number, cx: number, cy: number, R: number): { x: number; y: number } {
  if (rel === -1) {
    // base corners: seat 0 TL, 1 TR, 2 BR, 3 BL
    const bx = cx + (seat === 0 || seat === 3 ? -R * 1.15 : R * 1.15);
    const by = cy + (seat < 2 ? -R * 1.15 : R * 1.15);
    return { x: bx, y: by };
  }
  if (rel === 57) return { x: cx, y: cy };
  if (rel >= 51) {
    const start = loopXY(STARTS[seat]!, cx, cy, R);
    const k = (rel - 50) / 7; // 51→1/7 … 56→6/7 toward center
    return { x: start.x + (cx - start.x) * k, y: start.y + (cy - start.y) * k };
  }
  const cell = (STARTS[seat]! + rel) % 52;
  return loopXY(cell, cx, cy, R);
}

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#ld{font-weight:700}#ld #ldStat{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:6px}'
    + '#ld canvas{width:100%;border-radius:16px;border:2px solid #2A2A2E;background:#0E0E12;touch-action:manipulation;display:block}'
    + '#ld .hud{display:flex;gap:8px;margin:8px 0;font-size:13px;flex-wrap:wrap}'
    + '#ld .pill{background:#121214;border:2px solid #2A2A2E;border-radius:999px;padding:6px 12px}'
    + '#ld .row{display:flex;gap:8px;margin-top:8px}'
    + '#ld #ldRoll{flex:1;cursor:pointer;border:none;border-radius:12px;padding:14px;font-weight:900;font-size:18px;min-height:56px;background:linear-gradient(135deg,#C6F135,#8FE000);color:#070708}'
    + '#ld #ldRoll:disabled{filter:grayscale(1);opacity:.5;cursor:default}'
    + '#ld #ldFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'ld';
  box.innerHTML = '<div id="ldStat">connecting…</div>'
    + '<canvas id="ldCv" width="600" height="600" aria-label="Ludo board"></canvas>'
    + '<div class="hud"><span class="pill" id="ldTurn">🎲 —</span><span class="pill" id="ldDice">⚄ —</span>'
    + '<span class="pill" id="ldYou">you 0/4</span></div>'
    + '<div class="row"><button id="ldRoll" disabled>ROLL</button></div>'
    + '<div id="ldFeed"></div>';
  el.appendChild(box);

  const cv = box.querySelector('#ldCv') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const stat = box.querySelector('#ldStat') as HTMLElement;
  const turnP = box.querySelector('#ldTurn') as HTMLElement;
  const diceP = box.querySelector('#ldDice') as HTMLElement;
  const youP = box.querySelector('#ldYou') as HTMLElement;
  const feed = box.querySelector('#ldFeed') as HTMLElement;
  const rollBtn = box.querySelector('#ldRoll') as HTMLButtonElement;
  const say = (m: string): void => { stat.textContent = m; };

  let closed = false;
  let snap: Snap | null = null;
  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;
  // tappable option dots (canvas coords @2x scale)
  let hot: { x: number; y: number; i: number }[] = [];

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }

  function doRoll(): void {
    if (rollBtn.disabled) return;
    rollBtn.disabled = true; // same-tick paint: no double-roll
    say('rolling…');
    send('input', { dx: 0, dy: 0, fire: true });
  }
  rollBtn.addEventListener('click', doRoll);
  window.addEventListener('keydown', (e) => {
    if (closed || /INPUT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    if (e.key === ' ') { doRoll(); e.preventDefault(); }
    const n = ['1', '2', '3', '4'].indexOf(e.key);
    if (n >= 0 && snap?.board?.turn) {
      const opts = snap.board.turn.options;
      if (snap.board.turn.you && opts.includes(n)) send('answer', { i: n });
    }
  });
  cv.addEventListener('pointerdown', (e) => {
    if (!snap?.board?.turn?.you) return;
    const r = cv.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * cv.width;
    const py = ((e.clientY - r.top) / r.height) * cv.height;
    for (const h of hot) {
      if (Math.hypot(px - h.x, py - h.y) < 34) {
        send('answer', { i: h.i }); // same-tick: tap paints via next snap
        say('moving…');
        break;
      }
    }
  });

  function paint(): void {
    const W = (cv.width = cv.clientWidth * 2 || 600);
    cv.height = W;
    g.clearRect(0, 0, W, W);
    g.fillStyle = '#0E0E12';
    g.fillRect(0, 0, W, W);
    hot = [];
    if (!snap?.board) {
      g.fillStyle = '#B9B2A4';
      g.font = '700 16px system-ui';
      g.textAlign = 'center';
      g.fillText(snap?.phase === 'final' ? '🏆 game over — fresh table soon' : 'waiting for seats…', W / 2, W / 2);
      return;
    }
    const cx = W / 2;
    const cy = W / 2;
    const R = W * 0.32;
    // loop ring
    g.strokeStyle = '#2A2A2E';
    g.lineWidth = Math.max(3, W * 0.012);
    g.beginPath();
    for (let i = 0; i <= 52; i++) {
      const p = loopXY(i % 52, cx, cy, R);
      if (i === 0) g.moveTo(p.x, p.y);
      else g.lineTo(p.x, p.y);
    }
    g.closePath();
    g.stroke();
    // start cells
    for (let seat = 0; seat < 4; seat++) {
      const p = loopXY(STARTS[seat]!, cx, cy, R);
      g.fillStyle = COLORS[seat]!;
      g.beginPath();
      g.arc(p.x, p.y, W * 0.02, 0, Math.PI * 2);
      g.fill();
    }
    // center crown
    g.fillStyle = '#C6F135';
    g.font = `${Math.max(16, W * 0.05)}px system-ui`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('👑', cx, cy);
    const turn = snap.board.turn;
    const mySeat = snap.board.seats.findIndex((s) => s.you);
    snap.board.seats.forEach((seat, si) => {
      seat.tokens.forEach((rel, k) => {
        const p = tokenXY(seat.color, rel, cx, cy, R);
        const isOpt = turn && turn.you && si === mySeat && turn.options.includes(k);
        const rad = W * (isOpt ? 0.032 : 0.024);
        if (isOpt) {
          g.strokeStyle = '#C6F135';
          g.lineWidth = 3;
          g.beginPath();
          g.arc(p.x, p.y, rad + 5, 0, Math.PI * 2);
          g.stroke();
          hot.push({ x: p.x, y: p.y, i: k });
        }
        g.beginPath();
        g.arc(p.x, p.y, rad, 0, Math.PI * 2);
        g.fillStyle = COLORS[seat.color] ?? '#fff';
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = '#070708';
        g.stroke();
      });
    });
    turnP.textContent = turn ? `🎲 ${turn.name}${turn.you ? ' (you)' : ''} · ${Math.ceil(turn.endsInMs / 1000)}s` : '🎲 —';
    diceP.textContent = turn && turn.dice > 0 ? `⚄ ${turn.dice}` : '⚄ —';
    youP.textContent = `you ${snap.you.finished}/4 · ${snap.you.score}`;
    feed.textContent = snap.feed.join(' · ');
    rollBtn.disabled = !(turn && turn.you && turn.canRoll);
    if (snap.phase === 'play' && turn) {
      if (turn.you && turn.canRoll) say('your roll — tap ROLL!');
      else if (turn.you) say('pick a glowing token!');
      else say(`${turn.name} is thinking…`);
    } else if (snap.phase === 'final') say('game over — fresh table in a few seconds');
  }

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=ludo-clash&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('seated — waiting for the table…');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as Snap;
        if (p && p.t === 'ludo') { snap = p; paint(); }
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
