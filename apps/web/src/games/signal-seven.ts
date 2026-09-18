// apps/web/src/games/signal-seven.ts — SI-4: clue tablet + rune keyboard.
// DOM client (no canvas — deduction is reading, not aiming): the day's
// clues, your pip grid, a 7-rune keyboard (tap 3 unique runes, SUBMIT),
// leaders and feed. Keyboard: 1-7 toggle, Backspace clears, Enter submits.
// Same-tick submit lock; 1.5s reconnect; 46px+ targets, 360px-first.
import { RUNES, CODE_LEN, MAX_GUESSES } from '../../../../games/signal-seven/sim.js';

export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string;
  day: string;
  clues: string[];
  attempts: { guess: number[]; inCode: number; inPos: number; won: boolean }[];
  attemptsLeft: number;
  won: boolean;
  leaders: { n: string; guesses: number; won: boolean; you: boolean; bot: boolean }[];
  feed: string[];
  you: { guesses: number; best: number | null };
};

const glyph = (i: number): string => RUNES[i]?.glyph ?? '?';
const rname = (i: number): string => RUNES[i]?.name ?? '?';

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#sg{font-weight:700}#sg #sgStat{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:6px}'
    + '#sg .card{background:#121214;border:2px solid #2A2A2E;border-radius:16px;padding:12px 14px;margin-bottom:8px}'
    + '#sg .day{font-size:12px;color:#B9B2A4;letter-spacing:.12em}'
    + '#sg #sgClues{margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.8}'
    + '#sg #sgGrid{font-size:15px;line-height:2}'
    + '#sg #sgKeys{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}'
    + '#sg .key{cursor:pointer;border:2px solid #2A2A2E;border-radius:12px;background:#0E0E12;color:#fff;min-width:56px;min-height:56px;font-size:22px;font-weight:900}'
    + '#sg .key.on{border-color:#C6F135;background:#1A2410}'
    + '#sg .key:disabled{opacity:.4;cursor:default}'
    + '#sg .row{display:flex;gap:8px;margin-top:8px}'
    + '#sg #sgGo{flex:1;cursor:pointer;border:none;border-radius:12px;padding:14px;font-weight:900;font-size:17px;min-height:56px;background:linear-gradient(135deg,#C6F135,#8FE000);color:#070708}'
    + '#sg #sgGo:disabled{filter:grayscale(1);opacity:.5;cursor:default}'
    + '#sg #sgClr{cursor:pointer;border:2px solid #2A2A2E;border-radius:12px;background:#0E0E12;color:#fff;padding:14px 18px;font-weight:800;min-height:56px}'
    + '#sg .hud{display:flex;gap:8px;margin:8px 0;font-size:13px;flex-wrap:wrap}'
    + '#sg .pill{background:#121214;border:2px solid #2A2A2E;border-radius:999px;padding:6px 12px}'
    + '#sg #sgBoard{font-size:12px;color:#B9B2A4;margin-top:6px;line-height:1.7}'
    + '#sg #sgFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'sg';
  box.innerHTML = '<div id="sgStat">connecting…</div>'
    + '<div class="card"><div class="day" id="sgDay">—</div><ol id="sgClues"></ol></div>'
    + '<div class="card"><div class="day">YOUR TABLET</div><div id="sgGrid">—</div>'
    + '<div id="sgKeys"></div>'
    + '<div class="row"><button id="sgGo" disabled>READ THE SIGNS</button><button id="sgClr">⌫</button></div></div>'
    + '<div class="hud"><span class="pill" id="sgLeft">🔮 —</span><span class="pill" id="sgBest">🏆 —</span></div>'
    + '<div id="sgBoard"></div><div id="sgFeed"></div>';
  el.appendChild(box);

  const stat = box.querySelector('#sgStat') as HTMLElement;
  const dayEl = box.querySelector('#sgDay') as HTMLElement;
  const cluesEl = box.querySelector('#sgClues') as HTMLElement;
  const grid = box.querySelector('#sgGrid') as HTMLElement;
  const keys = box.querySelector('#sgKeys') as HTMLElement;
  const go = box.querySelector('#sgGo') as HTMLButtonElement;
  const clr = box.querySelector('#sgClr') as HTMLButtonElement;
  const leftP = box.querySelector('#sgLeft') as HTMLElement;
  const bestP = box.querySelector('#sgBest') as HTMLElement;
  const board = box.querySelector('#sgBoard') as HTMLElement;
  const feed = box.querySelector('#sgFeed') as HTMLElement;
  const say = (m: string): void => { stat.textContent = m; };

  let closed = false;
  let snap: Snap | null = null;
  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;
  let pick: number[] = [];

  const keyBtns: HTMLButtonElement[] = [];
  for (let i = 0; i < RUNES.length; i++) {
    const b = document.createElement('button');
    b.className = 'key';
    b.textContent = glyph(i);
    b.setAttribute('aria-label', `rune ${rname(i)}`);
    b.addEventListener('click', () => toggle(i));
    keys.appendChild(b);
    keyBtns.push(b);
  }

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }

  function canGuess(): boolean {
    return !!snap && snap.phase === 'puzzle' && !snap.won && snap.attemptsLeft > 0;
  }

  function toggle(i: number): void {
    if (!canGuess()) return;
    if (pick.includes(i)) pick = pick.filter((x) => x !== i);
    else if (pick.length < CODE_LEN) pick = [...pick, i];
    paint();
  }

  function submit(): void {
    if (!canGuess() || pick.length !== CODE_LEN) return;
    // Triple rides the input vector (SI-2 transport): one rune per axis.
    send('input', { dx: pick[0], dy: pick[1], aim: pick[2] });
    pick = [];
    go.disabled = true; // same-tick lock: the next snap re-arms
    say('reading…');
  }
  go.addEventListener('click', submit);
  clr.addEventListener('click', () => { pick = []; paint(); });
  window.addEventListener('keydown', (e) => {
    if (closed || /INPUT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    const n = ['1', '2', '3', '4', '5', '6', '7'].indexOf(e.key);
    if (n >= 0) { toggle(n); e.preventDefault(); }
    else if (e.key === 'Backspace') { pick = []; paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { submit(); paint(); e.preventDefault(); }
  });

  function pips(a: { inCode: number; inPos: number }): string {
    return '🟢'.repeat(a.inPos) + '🟡'.repeat(Math.max(0, a.inCode - a.inPos))
      + '⬛'.repeat(Math.max(0, CODE_LEN - a.inCode));
  }

  function paint(): void {
    keyBtns.forEach((b, i) => {
      b.classList.toggle('on', pick.includes(i));
      b.disabled = !canGuess();
    });
    if (!snap) {
      grid.textContent = '—';
      go.disabled = true;
      return;
    }
    dayEl.textContent = `🔮 ${snap.day} · READ THE SIGNS`;
    cluesEl.innerHTML = '';
    for (const c of snap.clues) {
      const li = document.createElement('li');
      li.textContent = c;
      cluesEl.appendChild(li);
    }
    grid.innerHTML = '';
    if (snap.attempts.length === 0) {
      grid.textContent = snap.phase === 'puzzle'
        ? 'no readings yet — tap 3 runes, then READ THE SIGNS.'
        : 'the tablet warms up…';
    }
    for (const a of snap.attempts) {
      const div = document.createElement('div');
      div.textContent = `${a.guess.map(glyph).join(' ')}  ${pips(a)}${a.won ? '  ✨' : ''}`;
      grid.appendChild(div);
    }
    if (pick.length > 0 && canGuess()) {
      const div = document.createElement('div');
      div.style.color = '#46E0D4';
      div.textContent = `${pick.map(glyph).join(' ')}  …`;
      grid.appendChild(div);
    }
    leftP.textContent = `🔮 ${snap.attemptsLeft}/${MAX_GUESSES} left`;
    bestP.textContent = snap.you.best === null ? '🏆 unsolved' : `🏆 best ${snap.you.best}`;
    board.textContent = snap.leaders
      .map((l, i) => `${i === 0 ? '🏆' : `${i + 1}.`} ${l.n}${l.you ? ' (you)' : ''} ${l.won ? `in ${l.guesses}` : `· ${l.guesses}`}`)
      .join('   ');
    feed.textContent = snap.feed.join(' · ');
    go.disabled = !(canGuess() && pick.length === CODE_LEN);
    go.textContent = snap.won ? 'READ ✓' : 'READ THE SIGNS';
    if (snap.phase === 'puzzle') {
      say(snap.won ? 'the signs spoke! ✨' : canGuess() ? 'tap 3 runes, then read!' : 'out of readings — the tablets decide…');
    } else if (snap.phase === 'final') say('the day is read — fresh signs soon');
    else say('tablets gathering — today\'s signs incoming…');
  }

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=signal-seven&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('seated — today\'s signs incoming…');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as Snap;
        if (p && p.t === 'signal') {
          const changed = snap?.phase !== p.phase || (snap?.attempts.length ?? -1) !== p.attempts.length;
          snap = p;
          if (changed) pick = [];
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

  paint();
  connect();
  new MutationObserver(() => { if (!document.contains(el)) { closed = true; try { ws?.close(); } catch { /* gone */ } } })
    .observe(document.body, { childList: true, subtree: true });
}
