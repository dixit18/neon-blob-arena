// apps/web/src/games/reflex-riot.ts — Reflex Riot client (RR-4).
// Mounts into #mount from the room view. No deps, no world bundle:
// task card + scoreboard + feed over a raw socket. Every tap paints same-tick.
import { Bursts, sfx, LIME, MAG, GOLD } from '../art.js';

export interface MountCtx { server: string; game: string; room: string; name: string }

type RiotTask = { kind: 'tap' | 'hold' | 'avoid' | 'mash' | 'copy'; endsInMs: number; need: number; seq: number[] };
type RiotSnap = {
  t: string; phase: 'lobby' | 'task' | 'reveal' | 'final';
  task: RiotTask | null; round: { n: number; task: number; total: number };
  scores: { n: string; s: number; you: boolean; bot: boolean }[];
  feed: string[]; you: { score: number; streak: number; gain: number };
};

const KIND_COPY: Record<string, { title: string; hint: string }> = {
  tap: { title: '👆 TAP NOW!', hint: 'fastest finger wins — react!' },
  hold: { title: '✊ HOLD IT!', hint: 'press and keep holding till the whistle' },
  avoid: { title: '🚫 DON’T TOUCH!', hint: 'hands off — touching the lava scores zero' },
  mash: { title: '🔨 MASH IT!', hint: 'hammer the button — 8+ hits for the bonus' },
  copy: { title: '🧠 COPY THE PADS!', hint: 'repeat the glowing pads in order' },
};

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = `#rr{font-weight:700}#rr #rrStatus{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:8px}#rr #rrTask{border:2px solid #C6F135;border-radius:16px;padding:18px;text-align:center;margin-bottom:10px;background:#121214}#rr #rrTask h2{font-size:30px;margin-bottom:6px}#rr #rrTask p{font-size:13px;color:#B9B2A4}#rr #rrBtn{cursor:pointer;width:100%;border:none;border-radius:16px;padding:26px;background:#C6F135;color:#070708;font-weight:800;font-size:22px;min-height:88px;touch-action:none;user-select:none;-webkit-user-select:none}#rr #rrBtn.hit{background:#FF3D8A;color:#fff}#rr #rrPads{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}#rr #rrPads button{cursor:pointer;border:2px solid #2A2A2E;border-radius:14px;padding:22px;font-size:26px;background:#1B1B1E;color:#F2EDE3;min-height:72px}#rr #rrPads button.lit{background:#C6F135;border-color:#C6F135}#rr #rrScores{margin:10px 0;font-size:14px}#rr #rrScores .me{color:#C6F135}#rr #rrFeed{font-size:12px;color:#B9B2A4;min-height:18px}`;
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'rr';
  box.innerHTML = `<div id="rrStatus">connecting…</div><canvas id="rrFx" width="600" height="90" style="width:100%;height:76px;"></canvas><div id="rrTask"><h2>…</h2><p>warming up the riot</p></div><div id="rrPad"></div><div id="rrScores"></div><div id="rrFeed"></div>`;
  el.appendChild(box);
  let closed = false;
  const fx = box.querySelector('#rrFx') as HTMLCanvasElement;
  const fctx = fx.getContext('2d')!;
  const bursts = new Bursts(fctx);
  let lastFrame = performance.now();
  let ringFrac = 0; // countdown 1→0, driven locally between snapshots
  let ringBase = 0;
  let ringTotal = 1;
  let ringTick = 0;
  let popScore = 0;
  let popAt = 0;
  (function loop(now: number) {
    if (closed) return;
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    const W = (fx.width = fx.clientWidth * 2 || 600);
    if (fx.height !== 180) fx.height = 180;
    fctx.clearRect(0, 0, W, 180);
    // countdown ring sweeps as the rule runs out
    if (ringTotal > 0 && ringFrac > 0) {
      ringFrac = Math.max(0, 1 - (now - ringBase) / ringTotal);
      const cx = W / 2;
      const cy = 90;
      const r = 62;
      fctx.lineWidth = 10;
      fctx.strokeStyle = 'rgba(242,237,227,.18)';
      fctx.beginPath();
      fctx.arc(cx, cy, r, 0, Math.PI * 2);
      fctx.stroke();
      fctx.strokeStyle = ringFrac < 0.25 ? MAG : LIME;
      fctx.beginPath();
      fctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ringFrac);
      fctx.stroke();
      const left = Math.ceil((ringFrac * ringTotal) / 1000);
      fctx.fillStyle = '#F2EDE3';
      fctx.font = '900 44px system-ui';
      fctx.textAlign = 'center';
      fctx.textBaseline = 'middle';
      fctx.fillText(String(left), cx, cy + 2);
      const last = Math.ceil((ringFrac * ringTotal) / 1000);
      if (last !== ringTick) { ringTick = last; if (last <= 3 && last > 0) sfx.tick(); }
    }
    // score pop
    if (popScore > 0 && now - popAt < 900) {
      const k = (now - popAt) / 900;
      fctx.globalAlpha = 1 - k;
      fctx.fillStyle = GOLD;
      fctx.font = '900 40px system-ui';
      fctx.textAlign = 'center';
      fctx.fillText(`+${popScore}`, W / 2, 170 - k * 60);
      fctx.globalAlpha = 1;
    }
    bursts.tick(dt);
  })(performance.now());
  const status = box.querySelector('#rrStatus') as HTMLElement;
  const taskBox = box.querySelector('#rrTask') as HTMLElement;
  const pad = box.querySelector('#rrPad') as HTMLElement;
  const scores = box.querySelector('#rrScores') as HTMLElement;
  const feed = box.querySelector('#rrFeed') as HTMLElement;

  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;

  const say = (m: string): void => { status.textContent = m; };

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }
  const poke = (fire: boolean): void => send('input', { dx: 0, dy: 0, fire });

  let lastKind = '';
  function paint(s: RiotSnap): void {
    const k = s.task ? KIND_COPY[s.task.kind]! : null;
    // countdown baseline for the local ring
    if (s.phase === 'task' && s.task) {
      const sig = `${s.task.kind}:${s.task.endsInMs}`;
      if (sig !== lastKind || ringFrac <= 0) {
        lastKind = sig;
        ringTotal = Math.max(1, s.task.endsInMs + 400);
        ringBase = performance.now();
        ringFrac = 1;
      }
    } else {
      ringFrac = 0;
      lastKind = s.phase;
    }
    if (s.you.gain > 0 && s.phase === 'reveal' && s.you.gain !== popScore) {
      popScore = s.you.gain;
      popAt = performance.now();
      bursts.fire(fx.clientWidth || 300, 60, s.you.streak >= 2 ? GOLD : LIME, 20 + Math.min(30, s.you.streak * 6));
      if (s.you.streak >= 2) sfx.win();
      else sfx.pop();
    }
    if (s.phase === 'lobby') {
      taskBox.innerHTML = `<h2>🎪 RIOT ${s.round.n}</h2><p>gathering the room… first rule lands in a second</p>`;
    } else if (s.phase === 'final') {
      taskBox.innerHTML = `<h2>🏆 ROUND OVER</h2><p>fresh table in a few seconds — stretch!</p>`;
    } else if (k && s.task) {
      const left = Math.ceil(s.task.endsInMs / 1000);
      const fire = s.you.streak >= 2 ? '🔥'.repeat(Math.min(3, s.you.streak - 1)) + ' ' : '';
      taskBox.innerHTML = `<h2></h2><p></p><p>⏱ ${left}s · round ${s.round.n} · rule ${s.round.task}/${s.round.total} · ${fire}streak x${s.you.streak}</p>`;
      (taskBox.querySelector('h2') as HTMLElement).textContent = k.title;
      (taskBox.querySelectorAll('p')[0] as HTMLElement).textContent = k.hint;
    }
    if (s.task && (s.phase === 'task')) {
      if (s.task.kind === 'copy') {
        pad.innerHTML = `<div id="rrPads">${[0, 1, 2, 3].map((i) => `<button data-i="${i}">◼</button>`).join('')}</div>`;
        const btns = [...pad.querySelectorAll('button')];
        // flash the sequence, then arm the pads
        btns.forEach((b) => { (b as HTMLButtonElement).disabled = true; });
        s.task.seq.forEach((padi, k2) => {
          setTimeout(() => {
            if (closed) return;
            btns.forEach((b) => b.classList.remove('lit'));
            btns[padi]!.classList.add('lit');
            if (k2 === s.task!.seq.length - 1) {
              setTimeout(() => {
                if (closed) return;
                btns.forEach((b) => { b.classList.remove('lit'); (b as HTMLButtonElement).disabled = false; });
              }, 450);
            }
          }, 500 + k2 * 550);
        });
        btns.forEach((b) => b.addEventListener('click', () => {
          b.classList.add('lit');
          setTimeout(() => b.classList.remove('lit'), 150);
          sfx.tap();
          send('answer', { i: Number((b as HTMLElement).dataset.i) });
        }));
      } else {
        pad.innerHTML = `<button id="rrBtn">SMASH</button>`;
        const btn = pad.querySelector('#rrBtn') as HTMLButtonElement;
        const down = (e: Event): void => {
          e.preventDefault();
          btn.classList.add('hit'); // same-tick paint, before the socket
          sfx.tap();
          poke(true);
        };
        const up = (): void => { btn.classList.remove('hit'); poke(false); };
        btn.addEventListener('pointerdown', down);
        btn.addEventListener('pointerup', up);
        btn.addEventListener('pointercancel', up);
        btn.addEventListener('pointerleave', up);
      }
    } else if (s.phase !== 'task') {
      pad.innerHTML = '';
    }
    scores.innerHTML = s.scores.map((l) =>
      `<div class="${l.you ? 'me' : ''}">${l.you ? '▶ ' : ''}${escapeHtml(l.n)} — ${l.s}</div>`).join('');
    feed.textContent = s.feed.join(' · ');
    if (s.you.gain > 0 && s.phase === 'reveal') say(`+${s.you.gain} — nice!`);
    else if (s.phase === 'task') say(`you: ${s.you.score} · streak x${s.you.streak}`);
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  }

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=reflex-riot&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('in the room — first rule lands in a second!');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as RiotSnap;
        if (p && p.t === 'riot') paint(p);
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
  // HMR/dispose safety: the shell wipes #mount on reconnect, stop our loop.
  new MutationObserver(() => { if (!document.contains(el)) { closed = true; try { ws?.close(); } catch { /* gone */ } } })
    .observe(document.body, { childList: true, subtree: true });
}
