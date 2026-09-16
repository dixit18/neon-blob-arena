// apps/web/src/games/read-the-room.ts — RT-4: question card + vote + reveal.
// One-tap vote paints same-tick (button locks, "locked in…" states the room).
// Reveal shows the crown + full tally + standings. Keyboard: 1-9 votes.
export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string;
  round: {
    no: number; of: number; question: string;
    options: { n: string; you: boolean; bot: boolean }[];
    endsInMs: number; voted: boolean; myPick: number | null;
  } | null;
  reveal: {
    question: string; crowns: string[];
    tally: { n: string; v: number; you: boolean; bot: boolean }[];
    youPickedCrown: boolean; youGot: number;
  } | null;
  scores: { n: string; s: number; you: boolean; bot: boolean }[];
  feed: string[];
  you: { score: number };
};

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#rr{font-weight:700;max-width:560px;margin:0 auto}'
    + '#rr #rrStat{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:6px}'
    + '#rr .card{background:#121214;border:2px solid #2A2A2E;border-radius:16px;padding:16px;margin:8px 0}'
    + '#rr .q{font-size:19px;line-height:1.4;margin-bottom:4px}'
    + '#rr .meta{font-size:12px;color:#B9B2A4;margin-bottom:10px}'
    + '#rr .opts{display:flex;flex-direction:column;gap:8px}'
    + '#rr .opt{cursor:pointer;border:2px solid #2A2A2E;background:#0E0E12;color:#fff;border-radius:12px;padding:14px;font-weight:800;font-size:16px;min-height:56px;text-align:left}'
    + '#rr .opt:disabled{cursor:default;opacity:.55}'
    + '#rr .opt.me{border-color:#C6F135}'
    + '#rr .opt.picked{border-color:#C6F135;background:#1A2410}'
    + '#rr .crown{font-size:22px;margin:4px 0}'
    + '#rr .tally{display:flex;flex-direction:column;gap:6px;margin-top:8px}'
    + '#rr .row{display:flex;justify-content:space-between;font-size:15px;padding:8px 12px;background:#0E0E12;border-radius:10px}'
    + '#rr .row.you{outline:2px solid #C6F135}'
    + '#rr .hud{display:flex;gap:8px;margin:8px 0;font-size:13px;flex-wrap:wrap}'
    + '#rr .pill{background:#121214;border:2px solid #2A2A2E;border-radius:999px;padding:6px 12px}'
    + '#rr #rrFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'rr';
  box.innerHTML = '<div id="rrStat">connecting…</div>'
    + '<div class="card"><div class="q" id="rrQ">finding the party…</div>'
    + '<div class="meta" id="rrMeta"></div><div class="opts" id="rrOpts"></div></div>'
    + '<div class="hud"><span class="pill" id="rrRound">🔮 —</span>'
    + '<span class="pill" id="rrYou">you 0</span></div>'
    + '<div class="tally" id="rrTally"></div>'
    + '<div id="rrFeed"></div>';
  el.appendChild(box);

  const stat = box.querySelector('#rrStat') as HTMLElement;
  const qEl = box.querySelector('#rrQ') as HTMLElement;
  const meta = box.querySelector('#rrMeta') as HTMLElement;
  const opts = box.querySelector('#rrOpts') as HTMLElement;
  const roundP = box.querySelector('#rrRound') as HTMLElement;
  const youP = box.querySelector('#rrYou') as HTMLElement;
  const tally = box.querySelector('#rrTally') as HTMLElement;
  const feed = box.querySelector('#rrFeed') as HTMLElement;
  const say = (m: string): void => { stat.textContent = m; };

  let closed = false;
  let snap: Snap | null = null;
  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;
  // Snapshots arrive at ~15Hz but the DOM only changes on vote/reveal
  // transitions — rebuild buttons solely on a render-key change, and just
  // refresh the countdown line every snap. Zero layout churn per tick.
  let lastKey = '';
  let lastHud = '';

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }

  function doVote(i: number): void {
    const r = snap?.round;
    if (!r || r.voted || !snap || snap.phase !== 'vote') return;
    send('answer', { i }); // same-tick: button locks below on next snap
    say('locked in… 🤫');
    for (const b of opts.querySelectorAll('button')) (b as HTMLButtonElement).disabled = true;
  }

  function paint(): void {
    if (!snap) return;
    const hud = `${snap.round ? `🔮 Q${snap.round.no}/${snap.round.of}` : '🔮 —'}|you ${snap.you.score}|${snap.feed.join(' · ')}`;
    if (hud !== lastHud) {
      lastHud = hud;
      roundP.textContent = snap.round ? `🔮 Q${snap.round.no}/${snap.round.of}` : '🔮 —';
      youP.textContent = `you ${snap.you.score}`;
      feed.textContent = snap.feed.join(' · ');
    }
    // countdown ticks every snap without touching the buttons
    if (snap.phase === 'vote' && snap.round && lastKey !== '') {
      const left = Math.ceil(snap.round.endsInMs / 1000);
      meta.textContent = `vote who fits — ${left}s · no voting yourself`;
    }
    const key = [
      snap.phase,
      snap.round ? `${snap.round.no}|${snap.round.question}|${snap.round.voted}|${snap.round.myPick}` : '',
      snap.reveal ? snap.reveal.tally.map((t) => `${t.n}:${t.v}`).join(',') : '',
      snap.scores.map((s) => `${s.n}:${s.s}`).join(','),
    ].join('~');
    if (key === lastKey) return; // same room state — skip the DOM rebuild
    lastKey = key;
    opts.innerHTML = '';
    tally.innerHTML = '';
    if (snap.phase === 'vote' && snap.round) {
      const r = snap.round;
      qEl.textContent = `❓ ${r.question}`;
      meta.textContent = `vote who fits — ${Math.ceil(r.endsInMs / 1000)}s · no voting yourself`;
      r.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.className = 'opt' + (o.you ? ' me' : '') + (r.myPick === i ? ' picked' : '');
        b.textContent = o.you ? `${o.n} (you)` : o.n;
        b.disabled = r.voted || o.you; // you can't pick yourself — disabled, not hidden
        b.addEventListener('click', () => doVote(i));
        opts.appendChild(b);
      });
      say(r.voted ? 'locked in — watching the room… 🤫' : 'tap who fits best!');
    } else if (snap.phase === 'reveal' && snap.reveal) {
      const v = snap.reveal;
      qEl.textContent = `❓ ${v.question}`;
      meta.textContent = v.youPickedCrown ? 'you read the room! +2' : 'the room has spoken';
      const crown = document.createElement('div');
      crown.className = 'crown';
      crown.textContent = `👑 ${v.crowns.join(', ')}`;
      opts.appendChild(crown);
      for (const t of v.tally) {
        const row = document.createElement('div');
        row.className = 'row' + (t.you ? ' you' : '');
        row.textContent = `${t.n}: ${t.v} vote${t.v === 1 ? '' : 's'}`;
        tally.appendChild(row);
      }
      say(`your cut: ${v.youGot} vote${v.youGot === 1 ? '' : 's'}`);
    } else if (snap.phase === 'final') {
      qEl.textContent = '🏆 party results';
      meta.textContent = 'fresh questions in a few seconds';
      const top = [...snap.scores].sort((a, b) => b.s - a.s).slice(0, 5);
      for (const t of top) {
        const row = document.createElement('div');
        row.className = 'row' + (t.you ? ' you' : '');
        row.textContent = `${t.n}: ${t.s}`;
        tally.appendChild(row);
      }
      say(top[0] ? `${top[0].n} read the room best!` : 'game over');
    } else {
      qEl.textContent = 'gathering the party…';
      meta.textContent = '';
      say('waiting for seats…');
    }
  }

  window.addEventListener('keydown', (e) => {
    if (closed || /INPUT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    const n = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(e.key);
    if (n >= 0) doVote(n);
  });

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=read-the-room&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('seated — reading the room…');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as Snap;
        if (p && p.t === 'room') { snap = p; paint(); }
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
