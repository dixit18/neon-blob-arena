// apps/web/src/games/ricochet-siege.ts — RS-4: canvas arena + drag-aim client.
// The arena renders 1:1 (×2 DPR, CSS-fluid to 360px): bumpers, hulls with
// HP pips, live tracers. Drag from your hull to aim (power from length),
// then COMMIT locks it — sealed aims never paint, yours or anyone's.
// Keyboard: arrows rotate/charge, Enter commits. Same-tick send, 1.5s
// reconnect, 46px+ targets.
export interface MountCtx { server: string; game: string; room: string; name: string }

type Snap = {
  t: string; phase: string;
  round: number; of: number;
  bumpers: { x: number; y: number; w: number; h: number }[];
  tanks: { n: string; x: number; y: number; hp: number; alive: boolean; you: boolean; bot: boolean }[];
  tracers: { x: number; y: number }[];
  committed: number; need: number;
  endsInMs: number;
  leaders: { n: string; wins: number; hits: number; you: boolean; bot: boolean; locked: boolean }[];
  feed: string[];
  you: { hp: number; wins: number; best: number | null };
};

const FW = 480;
const FH = 320;
const S = 2;

export async function mount(el: HTMLElement, ctx: MountCtx): Promise<void> {
  el.innerHTML = '';
  const css = document.createElement('style');
  css.textContent = '#rs{font-weight:700}#rs #rsStat{font-size:13px;color:#46E0D4;min-height:20px;margin-bottom:6px}'
    + '#rs canvas{width:100%;border-radius:16px;border:2px solid #2A2A2E;background:#0E0E12;touch-action:none;display:block;cursor:crosshair}'
    + '#rs .hud{display:flex;gap:8px;margin:8px 0;font-size:13px;flex-wrap:wrap}'
    + '#rs .pill{background:#121214;border:2px solid #2A2A2E;border-radius:999px;padding:6px 12px}'
    + '#rs .row{display:flex;gap:8px;margin-top:8px}'
    + '#rs #rsGo{flex:1;cursor:pointer;border:none;border-radius:12px;padding:14px;font-weight:900;font-size:18px;min-height:56px;background:linear-gradient(135deg,#C6F135,#8FE000);color:#070708}'
    + '#rs #rsGo:disabled{filter:grayscale(1);opacity:.5;cursor:default}'
    + '#rs #rsBoard{font-size:12px;color:#B9B2A4;margin-top:6px;line-height:1.7}'
    + '#rs #rsFeed{font-size:12px;color:#B9B2A4;min-height:18px;margin-top:6px}';
  el.appendChild(css);
  const box = document.createElement('div');
  box.id = 'rs';
  box.innerHTML = '<div id="rsStat">connecting…</div>'
    + `<canvas id="rsCv" width="${FW * S}" height="${FH * S}" aria-label="Siege arena. Drag from your hull to aim, then commit."></canvas>`
    + '<div class="hud"><span class="pill" id="rsRound">💥 —</span><span class="pill" id="rsLock">🔒 —</span>'
    + '<span class="pill" id="rsHp">❤️ —</span></div>'
    + '<div class="row"><button id="rsGo" disabled>COMMIT</button></div>'
    + '<div id="rsBoard"></div><div id="rsFeed"></div>';
  el.appendChild(box);

  const cv = box.querySelector('#rsCv') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const stat = box.querySelector('#rsStat') as HTMLElement;
  const roundP = box.querySelector('#rsRound') as HTMLElement;
  const lockP = box.querySelector('#rsLock') as HTMLElement;
  const hpP = box.querySelector('#rsHp') as HTMLElement;
  const board = box.querySelector('#rsBoard') as HTMLElement;
  const feed = box.querySelector('#rsFeed') as HTMLElement;
  const go = box.querySelector('#rsGo') as HTMLButtonElement;
  const say = (m: string): void => { stat.textContent = m; };

  let closed = false;
  let snap: Snap | null = null;
  let ws: WebSocket | null = null;
  let seq = 0;
  let token = '';
  let roomId = ctx.room;
  let retry = 0;
  let aimA = 0;
  let aimP = 0.7;
  let aiming = false;

  function send(type: string, payload: unknown): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ v: 1, type, room: roomId, seq: ++seq, payload }));
  }

  function me(): { x: number; y: number } | null {
    const t = snap?.tanks.find((x) => x.you);
    return t && t.alive ? { x: t.x, y: t.y } : null;
  }

  function canAim(): boolean {
    return !!snap && snap.phase === 'aim' && me() !== null
      && !(snap.leaders.find((l) => l.you)?.locked ?? true);
  }

  function commit(): void {
    if (!canAim()) return;
    // Aim vector on the wire (RS-2 transport): sealed at the server.
    send('input', { dx: Math.cos(aimA) * aimP, dy: Math.sin(aimA) * aimP });
    aiming = false;
    go.disabled = true; // same-tick lock: the next snap re-arms
    say('locked in!');
  }
  go.addEventListener('click', commit);

  function toArena(e: PointerEvent): { x: number; y: number } {
    const r = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * FW,
      y: ((e.clientY - r.top) / r.height) * FH,
    };
  }

  cv.addEventListener('pointerdown', (e) => {
    if (!canAim()) return;
    aiming = true;
    cv.setPointerCapture(e.pointerId);
    const m = me()!;
    const p = toArena(e);
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    if (Math.hypot(dx, dy) > 8) {
      aimA = Math.atan2(dy, dx);
      aimP = Math.min(1, Math.max(0.15, Math.hypot(dx, dy) / 200));
    }
    paint();
    e.preventDefault();
  });
  cv.addEventListener('pointermove', (e) => {
    if (!aiming || !canAim()) return;
    const m = me()!;
    const p = toArena(e);
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    if (Math.hypot(dx, dy) > 8) {
      aimA = Math.atan2(dy, dx);
      aimP = Math.min(1, Math.max(0.15, Math.hypot(dx, dy) / 200));
    }
    paint();
  });
  cv.addEventListener('pointerup', () => { aiming = false; paint(); });
  cv.addEventListener('pointercancel', () => { aiming = false; paint(); });
  window.addEventListener('keydown', (e) => {
    if (closed || /INPUT/.test((e.target as HTMLElement)?.tagName ?? '')) return;
    if (e.key === 'ArrowLeft') { aimA -= 0.12; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { aimA += 0.12; paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { aimP = Math.min(1, aimP + 0.1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { aimP = Math.max(0.15, aimP - 0.1); paint(); e.preventDefault(); }
    else if (e.key === 'Enter') { commit(); paint(); e.preventDefault(); }
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
      g.fillText('rolling into the arena…', FW / 2, FH / 2);
      return;
    }
    // bumpers
    g.fillStyle = '#2A2A2E';
    for (const b of snap.bumpers) g.fillRect(b.x, b.y, b.w, b.h);
    g.strokeStyle = '#3A3A40';
    g.lineWidth = 1;
    for (const b of snap.bumpers) g.strokeRect(b.x, b.y, b.w, b.h);
    // tracers
    g.fillStyle = '#FFD23F';
    for (const t of snap.tracers) {
      g.beginPath();
      g.arc(t.x, t.y, 3, 0, Math.PI * 2);
      g.fill();
    }
    // hulls: mine lime-ringed, rivals plain, wrecks hollow
    for (const t of snap.tanks) {
      if (!t.alive) {
        g.strokeStyle = 'rgba(185,178,164,.5)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(t.x, t.y, 10, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.moveTo(t.x - 6, t.y - 6);
        g.lineTo(t.x + 6, t.y + 6);
        g.moveTo(t.x + 6, t.y - 6);
        g.lineTo(t.x - 6, t.y + 6);
        g.stroke();
        continue;
      }
      g.fillStyle = t.you ? '#C6F135' : t.bot ? '#8A8578' : '#F0EBDC';
      g.beginPath();
      g.arc(t.x, t.y, 10, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = '#070708';
      g.stroke();
      if (t.you) {
        g.strokeStyle = '#46E0D4';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(t.x, t.y, 14, 0, Math.PI * 2);
        g.stroke();
      }
      // HP pips
      g.fillStyle = t.hp > 1 ? '#FF6B6B' : '#FFD23F';
      g.font = '700 10px system-ui';
      g.textAlign = 'center';
      g.fillText('♥'.repeat(Math.max(0, t.hp)), t.x, t.y - 16);
      // name
      g.fillStyle = '#B9B2A4';
      g.font = '10px system-ui';
      g.fillText(t.you ? 'YOU' : t.n.replace(' 🤖', ''), t.x, t.y + 24);
    }
    // my aim arrow (mine only — sealed aims never paint)
    const m = me();
    if (m && canAim() && (aiming || document.activeElement === document.body)) {
      const L = 20 + aimP * 60;
      g.strokeStyle = '#46E0D4';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(m.x, m.y);
      g.lineTo(m.x + Math.cos(aimA) * L, m.y + Math.sin(aimA) * L);
      g.stroke();
      g.fillStyle = '#46E0D4';
      g.font = '700 11px system-ui';
      g.textAlign = 'left';
      g.fillText(`${Math.round(aimP * 100)}%`, m.x + Math.cos(aimA) * (L + 6), m.y + Math.sin(aimA) * (L + 6));
    }
    if (snap.phase === 'final') {
      const champ = snap.leaders[0];
      g.fillStyle = '#C6F135';
      g.font = '900 24px system-ui';
      g.textAlign = 'center';
      g.fillText(champ ? `👑 ${champ.n} takes it!` : '🤝 drawn siege!', FW / 2, 40);
    }
    roundP.textContent = `💥 round ${snap.round}/${snap.of}`;
    lockP.textContent = `🔒 ${snap.committed}/${snap.need} locked`;
    hpP.textContent = `❤️ ${snap.you.hp} · 🏆 ${snap.you.wins}`;
    board.textContent = snap.leaders
      .map((l, i) => `${i === 0 ? '👑' : `${i + 1}.`} ${l.n}${l.you ? ' (you)' : ''} ${l.wins}W ${l.hits}H${l.locked ? ' 🔒' : ''}`)
      .join('   ');
    feed.textContent = snap.feed.join(' · ');
    go.disabled = !canAim();
    if (snap.phase === 'aim') {
      if (!me()) say('wrecked this round — next one!');
      else if (snap.leaders.find((l) => l.you)?.locked) say('locked — shots fly soon!');
      else say(`aim! ${Math.ceil(snap.endsInMs / 1000)}s — drag, then COMMIT`);
    } else if (snap.phase === 'volley') say('💥 volley away!');
    else if (snap.phase === 'final') say('siege settled — fresh war soon');
    else say('crews mustering — war starts soon…');
  }

  function connect(): void {
    if (closed) return;
    say(retry === 0 ? 'connecting…' : `reconnecting… (try ${retry + 1})`);
    const q = `game=ricochet-siege&room=${encodeURIComponent(roomId)}&name=${encodeURIComponent(ctx.name)}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
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
          say('in the arena — war starts soon…');
        }
      } else if (m.type === 'snapshot') {
        const p = m.payload as Snap;
        if (p && p.t === 'siege') { snap = p; paint(); }
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
