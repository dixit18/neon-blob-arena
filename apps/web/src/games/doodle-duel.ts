// apps/web/src/games/doodle-duel.ts — Doodle Duel client (DD-4).
// Drawer draws on canvas (strokeBatch, same-tick paint); guessers watch the
// live drawing + pick 1-of-4 titles. No deps; lazy chunk like riot.
import { unpackStrokes } from '../../../../games/doodle-duel/sim.js';
import { sfx } from '../art.js';

const INKS = ['#070708', '#5B2D8E', '#0E6E6E', '#B0235A', '#8A5A00'];

export interface MountCtx { server: string; game: string; room: string; name: string }

type Packed = { id: number; d: string; done: boolean };
type DoodleSnap = {
  t: string; phase: 'lobby' | 'draw' | 'reveal' | 'final';
  drawing: {
    n: number; total: number; drawer: string; drawerYou: boolean;
    endsInMs: number; prompt: string | null; options: string[];
    picked: number; strokes: Packed[]; gotIt: number;
  } | null;
  scores: { n: string; s: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { score: number; streak: number; gain: number };
};

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = `#dd{font-weight:700}#dd #ddStatus{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:8px}#dd #ddPrompt{font-size:26px;text-align:center;margin-bottom:8px}#dd canvas{width:100%;border:2px solid #2A2A2E;border-radius:16px;background:#F2EDE3;touch-action:none}#dd #ddPads{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}#dd #ddPads button{cursor:pointer;border:2px solid #2A2A2E;border-radius:14px;padding:16px;font-size:16px;font-weight:800;background:#1B1B1E;color:#F2EDE3;min-height:56px}#dd #ddPads button.picked{border-color:#C6F135;background:#C6F135;color:#070708}#dd #ddScores{margin:10px 0;font-size:14px}#dd #ddScores .me{color:#C6F135}#dd #ddFeed{font-size:12px;color:#B9B2A4;min-height:18px}`;
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'dd';
  box.innerHTML = `<div id="ddStatus">connecting…</div><div id="ddPrompt">…</div><canvas id="ddCv" width="300" height="300"></canvas><div id="ddPads"></div><div id="ddScores"></div><div id="ddFeed"></div>`;
  el.appendChild(box);
  const status = box.querySelector('#ddStatus') as HTMLElement;
  const promptEl = box.querySelector('#ddPrompt') as HTMLElement;
  const cv = box.querySelector('#ddCv') as HTMLCanvasElement;
  const pads = box.querySelector('#ddPads') as HTMLElement;
  const scores = box.querySelector('#ddScores') as HTMLElement;
  const feed = box.querySelector('#ddFeed') as HTMLElement;
  const gx = cv.getContext('2d')!;

  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let closed = false;
  let retry = 0;
  let drawing = false;
  let strokeId = 0;
  let pending: { x: number; y: number }[] = [];
  let lastFlush = 0;
  let amDrawer = false;

  const say = (m: string): void => { status.textContent = m; };
  const esc = (s: string): string =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }

  function toGrid(e: PointerEvent): { x: number; y: number } {
    const r = cv.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, Math.round(((e.clientX - r.left) / r.width) * 100))),
      y: Math.max(0, Math.min(100, Math.round(((e.clientY - r.top) / r.height) * 100))),
    };
  }
  function toPx(p: { x: number; y: number }): [number, number] {
    return [(p.x / 100) * 300, (p.y / 100) * 300];
  }

  function paintLocal(a: { x: number; y: number }, b: { x: number; y: number }, color = '#070708'): void {
    gx.strokeStyle = color;
    gx.lineWidth = 5;
    gx.lineCap = 'round';
    gx.beginPath();
    const [ax, ay] = toPx(a);
    const [bx, by] = toPx(b);
    gx.moveTo(ax, ay);
    gx.lineTo(bx, by);
    gx.stroke();
  }

  function flush(done: boolean): void {
    if (pending.length === 0) return;
    send('strokeBatch', { strokeId, pts: pending, done });
    pending = [];
    lastFlush = Date.now();
    if (done) strokeId++;
  }

  cv.addEventListener('pointerdown', (e) => {
    if (!amDrawer) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch { /* mouse */ }
    drawing = true;
    const p = toGrid(e);
    pending.push(p);
    paintLocal(p, p); // same-tick dot
  });
  cv.addEventListener('pointermove', (e) => {
    if (!drawing || !amDrawer) return;
    e.preventDefault();
    const p = toGrid(e);
    const prev = pending[pending.length - 1] ?? p;
    pending.push(p);
    paintLocal(prev, p);
    if (Date.now() - lastFlush > 150) flush(false);
  });
  const up = (): void => {
    if (!drawing) return;
    drawing = false;
    flush(true);
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);

  function renderStrokes(packed: Packed[]): void {
    gx.clearRect(0, 0, 300, 300);
    // faint paper grid, printed once per render
    gx.strokeStyle = 'rgba(7,7,8,.07)';
    gx.lineWidth = 1;
    for (let gLine = 30; gLine < 300; gLine += 30) {
      gx.beginPath(); gx.moveTo(gLine, 0); gx.lineTo(gLine, 300); gx.stroke();
      gx.beginPath(); gx.moveTo(0, gLine); gx.lineTo(300, gLine); gx.stroke();
    }
    for (const s of unpackStrokes(packed)) {
      const ink = INKS[s.id % INKS.length]!;
      for (let k = 1; k < s.pts.length; k++) paintLocal(s.pts[k - 1]!, s.pts[k]!, ink);
      if (s.pts.length === 1) paintLocal(s.pts[0]!, s.pts[0]!, ink);
    }
  }

  let lastPhase = '';
  let lastGain = 0;

  function paint(s: DoodleSnap): void {
    const d = s.drawing;
    amDrawer = !!d?.drawerYou;
    if (s.phase !== lastPhase) {
      if (s.phase === 'reveal') sfx.reveal();
      if (s.phase === 'draw') sfx.pop();
      lastPhase = s.phase;
    }
    if (s.you.gain > lastGain) { sfx.guess(); lastGain = s.you.gain; }
    if (s.phase === 'draw') lastGain = 0;
    if (!d) {
      promptEl.textContent = s.phase === 'final' ? '🏆 duel over — fresh canvas soon!' : '🎨 gathering the table…';
      pads.innerHTML = '';
    } else if (s.phase === 'reveal' || s.phase === 'final') {
      promptEl.textContent = `🎨 it was “${d.prompt}” — ${d.gotIt} got it!`;
      pads.innerHTML = '';
      renderStrokes(d.strokes);
    } else if (d.drawerYou) {
      promptEl.textContent = `✏️ draw: ${d.prompt} (${Math.ceil(d.endsInMs / 1000)}s)`;
      pads.innerHTML = '';
      // drawer keeps their own canvas: only paint remote strokes if any
      if (d.strokes.length === 0) gx.clearRect(0, 0, 300, 300);
    } else {
      promptEl.textContent = `👀 ${d.drawer} is drawing… (${Math.ceil(d.endsInMs / 1000)}s)`;
      renderStrokes(d.strokes);
      pads.innerHTML = d.options.map((o, i) =>
        `<button data-i="${i}" class="${s.you && d.picked === i ? 'picked' : ''}">${esc(o)}</button>`).join('');
      pads.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
        pads.querySelectorAll('button').forEach((x) => x.classList.remove('picked'));
        b.classList.add('picked');
        sfx.tap();
        send('answer', { i: Number((b as HTMLElement).dataset.i) });
      }));
    }
    scores.innerHTML = s.scores.map((l) =>
      `<div class="${l.you ? 'me' : ''}">${l.you ? '▶ ' : ''}${esc(l.n)} — ${l.s}</div>`).join('');
    feed.textContent = s.feed.join(' · ');
    if (s.you.gain > 0) say(`+${s.you.gain} — nice!`);
    else if (d) say(`drawing ${d.n}/${d.total} · you: ${s.you.score} · streak x${s.you.streak}`);
  }

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=doodle-duel&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('at the table — canvas is live!');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as DoodleSnap;
        if (p && p.t === 'doodle') paint(p);
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
