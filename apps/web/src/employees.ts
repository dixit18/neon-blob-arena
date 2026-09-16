// apps/web/src/employees.ts — hidden owner studio (OpenMausBot-style).
// INVARIANT: this module is NEVER imported by the player shell. main.ts loads
// it only on the /employees path (or ?view=employees), which is never linked,
// never in the catalog, and meta-noindexed. Players must not find it.
// What the Boss gets: roster sidebar (every ORG.md employee), per-employee
// threads, 4 channels (#build/#redteam/#growth/#studio), live feed polling
// (menu-only, 3s, pauses when hidden), and a Boss composer. Employees talk by
// posting to /studio/thought while they work — same as AGENT_CHAT.md, live.
export interface StudioCtx { server: string }

type Employee = { id: string; name: string; role: string; channel: string; color: string; lastSeen: number };
type Thought = { id: number; by: string; channel: string; kind: string; text: string; at: number };

const CH: { id: string; label: string }[] = [
  { id: 'build', label: '#build' },
  { id: 'redteam', label: '#redteam' },
  { id: 'growth', label: '#growth' },
  { id: 'studio', label: '#studio' },
];

function ago(at: number, now: number): string {
  if (!at) return 'quiet';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'thinking now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export async function mount(el: HTMLElement, ctx: StudioCtx): Promise<void> {
  el.innerHTML = '';
  try {
    const m = document.createElement('meta');
    m.name = 'robots';
    m.content = 'noindex, nofollow';
    document.head.appendChild(m);
  } catch { /* headless */ }
  document.title = 'Studio — owner only';

  const css = document.createElement('style');
  css.textContent = [
    '#st{font:600 14px/1.45 system-ui,"Segoe UI",Roboto,sans-serif;color:#F2EDE3;max-width:1060px;margin:0 auto}',
    '#st header{display:flex;align-items:baseline;gap:10px;margin:6px 0 12px}',
    '#st h2{font-size:22px;letter-spacing:-.01em}',
    '#st .own{font-size:11px;font-weight:800;letter-spacing:.1em;color:#070708;background:#FF5D5D;border-radius:999px;padding:3px 10px}',
    '#st .chrow{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}',
    '#st .chrow button{cursor:pointer;border:2px solid #2A2A2E;background:#121214;color:#F2EDE3;border-radius:999px;padding:8px 14px;font-weight:800;font-size:13px}',
    '#st .chrow button.on{border-color:#C6F135;color:#C6F135}',
    '#st .cols{display:grid;grid-template-columns:250px 1fr;gap:12px}',
    '@media (max-width:700px){#st .cols{grid-template-columns:1fr}}',
    '#st aside,#st main{background:rgba(18,18,22,.86);border:2px solid #2A2A2E;border-radius:16px;padding:10px}',
    '#st .emp{cursor:pointer;display:flex;gap:9px;align-items:center;width:100%;text-align:left;background:none;border:none;border-radius:12px;padding:9px;color:#F2EDE3}',
    '#st .emp:hover{background:#1B1B1E}#st .emp.on{background:#1E2A12;outline:2px solid #C6F135}',
    '#st .dot{width:11px;height:11px;border-radius:50%;flex:none}',
    '#st .dot.live{box-shadow:0 0 0 0 rgba(198,241,53,.7);animation:pl 1.6s infinite}',
    '@keyframes pl{70%{box-shadow:0 0 0 9px rgba(198,241,53,0)}100%{box-shadow:0 0 0 0 rgba(198,241,53,0)}}',
    '#st .who{min-width:0}#st .who b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#st .who span{font-size:11px;color:#B9B2A4;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#st .feed{display:flex;flex-direction:column;gap:8px;max-height:56vh;overflow-y:auto;margin-bottom:10px}',
    '#st .msg{border-left:3px solid #2A2A2E;padding:6px 10px;background:#101012;border-radius:0 10px 10px 0}',
    '#st .msg .hd{font-size:11px;color:#B9B2A4;display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
    '#st .msg .hd b{color:#F2EDE3}#st .msg p{font-size:13.5px;margin-top:3px;white-space:pre-wrap;word-break:break-word}',
    '#st .kind{font-size:10px;font-weight:800;letter-spacing:.06em;border-radius:999px;padding:1px 8px;background:#2A2A2E;color:#F2EDE3}',
    '#st .kind.receipt{background:#C6F135;color:#070708}#st .kind.blocker{background:#FF5D5D;color:#070708}',
    '#st .composer{display:flex;gap:8px}#st input{flex:1;min-width:0;background:#0B0B0D;border:2px solid #2A2A2E;border-radius:12px;color:#F2EDE3;padding:11px 12px;font-size:14px;font-weight:600}',
    '#st input:focus{outline:none;border-color:#C6F135}',
    '#st .composer button{cursor:pointer;border:none;border-radius:12px;background:#C6F135;color:#070708;font-weight:900;padding:11px 18px}',
    '#st .stat{font-size:12px;color:#46E0D4;min-height:18px;margin-top:8px}',
    '#st a.back{color:#C6F135;font-weight:800;font-size:13px}',
  ].join('');
  el.appendChild(css);

  const box = document.createElement('div');
  box.id = 'st';
  box.innerHTML = [
    '<header><h2>STUDIO</h2><span class="own">OWNER ONLY</span>',
    '<span style="font-size:12px;color:#B9B2A4">never linked · never indexed · players can\u2019t see this</span></header>',
    '<div class="chrow" id="stCh"></div>',
    '<div class="cols"><aside id="stSide"></aside>',
    '<main><div class="feed" id="stFeed"></div>',
    '<div class="composer"><input id="stIn" maxlength="500" placeholder="write as Boss — Enter sends…" aria-label="Message as Boss" />',
    '<button id="stSend">SEND</button></div><div class="stat" id="stStat"></div>',
    '<p style="margin-top:8px"><a class="back" href="./">← back to the playground</a></p></main></div>',
  ].join('');
  el.appendChild(box);

  let closed = false;
  let channel = 'build';
  let thread: string | null = null; // employee id or null = whole channel
  let employees: Employee[] = [];
  let feed: Thought[] = [];
  let lastCount = 0;

  const side = box.querySelector('#stSide') as HTMLElement;
  const feedBox = box.querySelector('#stFeed') as HTMLElement;
  const stat = box.querySelector('#stStat') as HTMLElement;
  const input = box.querySelector('#stIn') as HTMLInputElement;
  const chRow = box.querySelector('#stCh') as HTMLElement;

  for (const c of CH) {
    const b = document.createElement('button');
    b.textContent = c.label;
    b.dataset.ch = c.id;
    if (c.id === channel) b.classList.add('on');
    b.addEventListener('click', () => {
      channel = c.id;
      chRow.querySelectorAll('button').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.ch === channel));
      void refresh();
    });
    chRow.appendChild(b);
  }

  function paint(): void {
    const now = Date.now();
    side.innerHTML = '';
    const all = document.createElement('button');
    all.className = 'emp' + (thread === null ? ' on' : '');
    all.innerHTML = '<span class="dot" style="background:#C6F135"></span><span class="who"><b>Whole channel</b><span>every thread mixed</span></span>';
    all.addEventListener('click', () => { thread = null; paint(); });
    side.appendChild(all);
    for (const e of employees) {
      const b = document.createElement('button');
      b.className = 'emp' + (thread === e.id ? ' on' : '');
      const live = now - e.lastSeen < 60_000;
      b.innerHTML = `<span class="dot${live ? ' live' : ''}" style="background:${e.color}"></span><span class="who"><b></b><span></span></span>`;
      (b.querySelector('b') as HTMLElement).textContent = e.name;
      (b.querySelectorAll('span')[1] as HTMLElement).textContent = `${e.role} · ${ago(e.lastSeen, now)}`;
      b.addEventListener('click', () => { thread = thread === e.id ? null : e.id; paint(); });
      side.appendChild(b);
    }
    feedBox.innerHTML = '';
    const list = feed.filter((t) => t.channel === channel && (!thread || t.by === thread || (t.text.includes(threadName(thread)) && thread !== null)));
    if (list.length === 0) {
      feedBox.innerHTML = '<div class="msg"><div class="hd"><b>quiet</b></div><p>no thoughts here yet — the crew posts while they work.</p></div>';
    }
    for (const t of list.slice(-40)) {
      const d = document.createElement('div');
      d.className = 'msg';
      const who = t.by === 'boss' ? '👑 Boss (you)' : (employees.find((e) => e.id === t.by)?.name ?? t.by);
      const em = employees.find((e) => e.id === t.by);
      if (em) d.style.borderLeftColor = em.color;
      d.innerHTML = '<div class="hd"><b></b><span class="kind"></span><span></span></div><p></p>';
      (d.querySelector('b') as HTMLElement).textContent = who;
      (d.querySelector('.kind') as HTMLElement).textContent = t.kind;
      (d.querySelector('.kind') as HTMLElement).classList.add(t.kind);
      (d.querySelectorAll('.hd span')[1] as HTMLElement).textContent = new Date(t.at).toLocaleTimeString();
      (d.querySelector('p') as HTMLElement).textContent = t.text;
      feedBox.appendChild(d);
    }
    feedBox.scrollTop = feedBox.scrollHeight;
    stat.textContent = `${employees.length} employees · ${feed.length} thoughts in view · live`;
  }

  function threadName(id: string | null): string {
    return employees.find((e) => e.id === id)?.name.split(' ')[0] ?? '???';
  }

  async function refresh(): Promise<void> {
    if (closed || document.hidden) return;
    try {
      const base = ctx.server.replace(/^ws/, 'http');
      const r = await fetch(`${base}/studio/employees`);
      if (!r.ok) { stat.textContent = 'studio unreachable — is the server awake?'; return; }
      const j = (await r.json()) as { employees: Employee[]; feed: Thought[]; count: number };
      employees = j.employees ?? [];
      feed = j.feed ?? [];
      // pull the full channel view when a thread is open elsewhere
      if (j.count !== lastCount) lastCount = j.count;
      paint();
    } catch { stat.textContent = 'studio unreachable — retrying…'; }
  }

  async function send(): Promise<void> {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    stat.textContent = 'sending…';
    try {
      const base = ctx.server.replace(/^ws/, 'http');
      const r = await fetch(`${base}/studio/thought`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ by: 'boss', channel, kind: 'reply', text }),
      });
      if (!r.ok) stat.textContent = 'send failed — retry';
      else { await refresh(); stat.textContent = 'sent — the crew sees it on their next pull'; }
    } catch { stat.textContent = 'send failed — server asleep?'; }
  }

  (box.querySelector('#stSend') as HTMLElement).addEventListener('click', () => { void send(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') void send(); });

  await refresh();
  const timer = window.setInterval(() => { void refresh(); }, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  new MutationObserver(() => {
    if (!document.contains(el)) { closed = true; window.clearInterval(timer); }
  }).observe(document.body, { childList: true, subtree: true });
}
