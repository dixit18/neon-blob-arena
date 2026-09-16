// apps/web/src/games/nitro-rift.ts — Nitro Rift client, SLICE 1 (2D only).
// Canvas top-down: 4 lanes, you climb, pads are green chevrons, HUD shows
// place + boost. ◀ ▶ buttons glide lanes, BOOST holds the button down;
// arrows + Space work on desktop. Every tap paints same-tick.
// Slice 2 adds the ✨ 3D toggle (threepipe first, three.js fallback).
export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string; heat: number; endsInMs: number;
  pads: { at: number; lane: number }[];
  you: { prog: number; lane: number; boost: number; place: number };
  racers: { n: string; prog: number; lane: number; you: boolean; bot: boolean; fin: boolean }[];
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
    + '#nr #nrFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'nr';
  box.innerHTML = '<div id="nrStat">connecting…</div>'
    + '<canvas id="nrCv" width="480" height="640" aria-label="Nitro rift track"></canvas>'
    + '<div class="hud"><span class="pill" id="nrPlace">P–</span><span class="pill" id="nrBoostP">⚡ 60</span>'
    + '<span class="pill" id="nrHeat">🏁 heat 1</span></div>'
    + '<div class="row"><button id="nrL">◀</button><button id="nrBoost">BOOST</button><button id="nrR">▶</button></div>'
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
    const W = (cv.width = cv.clientWidth * 2 || 480);
    const H = (cv.height = Math.round(W * 1.33));
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#0E0E12';
    g.fillRect(0, 0, W, H);
    if (!snap) return;
    const laneW = W / LANES;
    g.strokeStyle = '#2A2A2E';
    g.lineWidth = 2;
    for (let i = 1; i < LANES; i++) {
      g.beginPath(); g.moveTo(i * laneW, 0); g.lineTo(i * laneW, H); g.stroke();
    }
    // camera: you stay at 78% height, world scrolls
    const cam = snap.you.prog - TRACK * 0.22;
    const yOf = (prog: number): number => H * 0.9 - ((prog - cam) / (TRACK * 0.55)) * H;
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
    placeP.textContent = `P${snap.you.place || '–'}/${snap.racers.length}`;
    boostP.textContent = `⚡ ${snap.you.boost}`;
    heatP.textContent = `🏁 heat ${snap.heat}`;
    feed.textContent = snap.feed.join(' · ');
    if (snap.phase === 'lobby') say('heat forms… first across takes it');
    else if (snap.phase === 'race') say(`P${snap.you.place} — pads refill boost, bumps cost speed`);
    else say('heat done — fresh grid in a few seconds');
  }

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
