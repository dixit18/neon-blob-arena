// apps/web/src/games/totem-panic.ts — TP-4: canvas tower + tap-to-place.
// The tower renders bottom-up (base + levels + dashed raise line at 10);
// tap the canvas to drop the queued block there, arrows + Enter work too.
// Spectators get the same view with a "next raise" banner. Lean meter and
// queue preview ride the HUD. Same-tick send, 1.5s reconnect, 360px-fluid.
export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string;
  tower: { w: number; x: number }[];
  queue: number[];
  turn: { name: string; you: boolean; endsInMs: number } | null;
  spectating: boolean;
  lean: number;
  levelsLeft: number;
  outcome: { result: string; at?: number; x?: number; lean?: number; levels?: number } | null;
  leaders: { n: string; placed: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { placed: number; best: number | null };
};

const FW = 480;
const FH = 460;
const S = 2;
const GROUND = FH - 30;
const BH = 26;
const PXU = 1.5; // px per world unit (world ±160 fits)
const RAISE_AT = 10;

const toX = (x: number): number => FW / 2 + x * PXU;

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#tt{font-weight:700}#tt #ttStat{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:6px}'
    + '#tt canvas{width:100%;border-radius:16px;border:2px solid #2A2A2E;background:#0E0E12;touch-action:manipulation;display:block;cursor:pointer}'
    + '#tt .hud{display:flex;gap:8px;margin:8px 0;font-size:13px;flex-wrap:wrap}'
    + '#tt .pill{background:#121214;border:2px solid #2A2A2E;border-radius:999px;padding:6px 12px}'
    + '#tt #ttBoard{font-size:12px;color:#B9B2A4;margin-top:6px;line-height:1.7}'
    + '#tt #ttFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'tt';
  box.innerHTML = '<div id="ttStat">connecting…</div>'
    + `<canvas id="ttCv" width="${FW * S}" height="${FH * S}" aria-label="Totem tower. Tap to place your block where you tap."></canvas>`
    + '<div class="hud"><span class="pill" id="ttTurn">🗼 —</span><span class="pill" id="ttLean">⚖️ —</span>'
    + '<span class="pill" id="ttQueue">📦 —</span></div>'
    + '<div id="ttBoard"></div><div id="ttFeed"></div>';
  el.appendChild(box);

  const cv = box.querySelector('#ttCv') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const stat = box.querySelector('#ttStat') as HTMLElement;
  const turnP = box.querySelector('#ttTurn') as HTMLElement;
  const leanP = box.querySelector('#ttLean') as HTMLElement;
  const queueP = box.querySelector('#ttQueue') as HTMLElement;
  const board = box.querySelector('#ttBoard') as HTMLElement;
  const feed = box.querySelector('#ttFeed') as HTMLElement;
  const say = (m: string): void => { stat.textContent = m; };

  let closed = false;
  let snap: Snap | null = null;
  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;
  let aimX = 0; // world-x aim (pointer hover + arrow keys share it)

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }

  function canPlace(): boolean {
    return !!snap && snap.phase === 'build' && !!snap.turn?.you && !snap.spectating;
  }

  function doPlace(x: number): void {
    if (!canPlace()) return;
    if (!Number.isFinite(x)) return;
    send('input', { dx: x, dy: 0 }); // same-tick: the next snap paints it
    say('placed!');
  }

  function toWorld(e: PointerEvent): number {
    const r = cv.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * FW;
    return (px - FW / 2) / PXU;
  }

  cv.addEventListener('pointermove', (e) => {
    if (!canPlace()) return;
    aimX = Math.max(-90, Math.min(90, toWorld(e)));
    paint();
  });
  cv.addEventListener('pointerdown', (e) => {
    if (!canPlace()) return;
    aimX = Math.max(-90, Math.min(90, toWorld(e)));
    doPlace(aimX);
    e.preventDefault();
  });
  window.addEventListener('keydown', (e) => {
    if (closed || /INPUT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    if (e.key === 'ArrowLeft') { aimX = Math.max(-90, aimX - 10); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { aimX = Math.min(90, aimX + 10); paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { doPlace(aimX); paint(); e.preventDefault(); }
  });

  function blockRect(i: number, w: number, x: number): { rx: number; ry: number; rw: number } {
    const rw = w * PXU;
    return { rx: toX(x) - rw / 2, ry: GROUND - (i + 1) * BH, rw };
  }

  function paint(): void {
    g.setTransform(S, 0, 0, S, 0, 0);
    g.clearRect(0, 0, FW, FH);
    g.fillStyle = '#0E0E12';
    g.fillRect(0, 0, FW, FH);
    // ground
    g.fillStyle = '#1A1A20';
    g.fillRect(0, GROUND, FW, FH - GROUND);
    if (!snap) {
      g.fillStyle = '#B9B2A4';
      g.font = '700 14px system-ui';
      g.textAlign = 'center';
      g.fillText('raising the ground…', FW / 2, FH / 2);
      return;
    }
    // base slab
    g.fillStyle = '#3A3A40';
    const bw = 120 * PXU;
    g.fillRect(FW / 2 - bw / 2, GROUND - 8, bw, 8);
    // raise line at level 10
    const ry = GROUND - RAISE_AT * BH;
    g.strokeStyle = '#C6F135';
    g.lineWidth = 2;
    g.setLineDash([8, 6]);
    g.beginPath();
    g.moveTo(20, ry);
    g.lineTo(FW - 20, ry);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#C6F135';
    g.font = '700 12px system-ui';
    g.textAlign = 'left';
    g.fillText(`RAISE ${RAISE_AT}`, 24, ry - 6);
    // tower (fallen block paints red-tinted)
    const fellAt = snap.outcome && snap.outcome.result !== 'raised' ? (snap.outcome.at ?? -1) : -1;
    snap.tower.forEach((b, i) => {
      const { rx, ry: by, rw } = blockRect(i, b.w, b.x);
      g.fillStyle = i === fellAt ? '#7A2A2E' : i % 2 === 0 ? '#46E0D4' : '#2AA79D';
      g.fillRect(rx, by, rw, BH - 3);
      g.strokeStyle = '#070708';
      g.lineWidth = 2;
      g.strokeRect(rx, by, rw, BH - 3);
    });
    // aim ghost on my turn
    if (canPlace() && snap.queue.length > 0) {
      const w = snap.queue[0]!;
      const { rx, ry: by, rw } = blockRect(snap.tower.length, w, aimX);
      g.strokeStyle = '#C6F135';
      g.lineWidth = 2;
      g.setLineDash([5, 4]);
      g.strokeRect(rx, by, rw, BH - 3);
      g.setLineDash([]);
    }
    // outcome banner
    if (snap.phase === 'final' && snap.outcome) {
      g.fillStyle = snap.outcome.result === 'raised' ? '#C6F135' : '#FF6B6B';
      g.font = '900 26px system-ui';
      g.textAlign = 'center';
      g.fillText(
        snap.outcome.result === 'raised' ? '🎉 RAISED!' : snap.outcome.result === 'slipped' ? '💥 SLIPPED!' : '🗼 TOPPLED!',
        FW / 2, 60,
      );
    }
    if (snap.spectating) {
      g.fillStyle = 'rgba(185,178,164,.95)';
      g.font = '700 13px system-ui';
      g.textAlign = 'center';
      g.fillText('👁️ spectating — next raise takes you in', FW / 2, FH - 10);
    }
    turnP.textContent = snap.turn
      ? `🗼 ${snap.turn.name}${snap.turn.you ? ' (you!)' : ''} · ${Math.ceil(snap.turn.endsInMs / 1000)}s`
      : snap.phase === 'final' ? '🗼 settled' : '🗼 —';
    const leanPct = Math.min(1, Math.abs(snap.lean) / 60);
    leanP.textContent = `⚖️ lean ${snap.lean > 0 ? '→' : '←'} ${'#'.repeat(Math.round(leanPct * 5)).padEnd(5, '·')}`;
    queueP.textContent = snap.queue.length > 0 ? `📦 next ${snap.queue.join(' · ')}` : '📦 —';
    board.textContent = snap.leaders
      .map((l, i) => `${i === 0 ? '🧱' : `${i + 1}.`} ${l.n}${l.you ? ' (you)' : ''} ×${l.placed}`)
      .join('   ');
    feed.textContent = snap.feed.join(' · ');
    if (snap.phase === 'build') {
      if (snap.spectating) say('spectating — watch and learn!');
      else if (snap.turn?.you) say('your block — tap the tower to place!');
      else say(`${snap.turn?.name ?? '…'} is sighting…`);
    } else if (snap.phase === 'hold') say('hold it… ⏳');
    else if (snap.phase === 'final') say('settled — fresh timber soon');
    else say('hands gathering — the raising starts soon…');
  }

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=totem-panic&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('on the crew — timber incoming…');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as Snap;
        if (p && p.t === 'totem') { snap = p; paint(); }
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

  paint();
  connect();
  new MutationObserver(() => { if (!document.contains(el)) { closed = true; try { ws?.close(); } catch { /* gone */ } } })
    .observe(document.body, { childList: true, subtree: true });
}
