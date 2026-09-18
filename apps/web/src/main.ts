// apps/web shell — HTML-first playground (Foundation slice).
// Direct room links (?game=&room=) render room view WITHOUT any world bundle:
// the lazy Three.js playground is a later deliverable and must never gate play.
import { genGuestId, genName } from '../../../packages/identity/src/index.js';
import { startRiftBackdrop, MOOD_TINT, sfx } from './art.js';
import { startDescent } from './descent.js';
import { SAGAS, sagaAt, sagaIndex, buildChapterUrl, chaptersOf } from './sagas.js';
import { t, getLang, setLang } from './strings.js';

type Manifest = {
  id: string; verb: string; hook: string; moods: string[];
  minPlayers: number; maxPlayers: number; shareKind: string;
};

const el = (id: string) => document.getElementById(id)!;
const qs = new URLSearchParams(location.search);
// GB-4: the shell speaks Hindi too. Static chrome paints from the strings
// table on boot (game clients + saga content stay English, openly).
try {
  // ?lang=hi deep-links the Hindi shell (shareable, and the test hook).
  const langParam = qs.get('lang');
  if (langParam === 'hi' || langParam === 'en') setLang(langParam);
  document.documentElement.lang = getLang();
  document.title = t('meta.title');
  el('kickerLive').textContent = t('kicker.live');
  el('heroA').textContent = t('hero.a');
  el('heroB').textContent = t('hero.b');
  el('heroSub').textContent = t('hero.sub');
  el('play').textContent = t('play.label');
  el('faceName').textContent = t('play.diving');
  document.querySelectorAll<HTMLButtonElement>('#moods button').forEach((b) => {
    const m = (b.dataset.mood ?? '').toLowerCase();
    if (m === 'beat' || m === 'chaos' || m === 'think' || m === 'surprise') {
      b.textContent = t(`moods.${m}`);
    }
  });
  el('riftCopy').textContent = t('rift.copy');
  const langBtn = el('langBtn') as HTMLButtonElement;
  langBtn.textContent = t('lang.toggle');
  langBtn.addEventListener('click', () => {
    setLang(getLang() === 'hi' ? 'en' : 'hi');
    location.reload();
  });
  el('roomKicker').textContent = t('room.kicker');
  el('roomTitle').textContent = t('room.entering');
  el('roomSub').textContent = t('room.resolving');
  el('mount').textContent = t('room.mountDefault');
  el('backLink').textContent = t('room.back');
  const tabs0 = document.getElementById('sagaTabs');
  if (tabs0) tabs0.setAttribute('aria-label', t('saga.tabsAria'));
  const dive0 = document.getElementById('diveCv');
  if (dive0) dive0.setAttribute('aria-label', t('dive.aria'));
} catch { /* chrome never blocks play */ }
// The living backdrop. Cheap, procedural, ours.
try {
  const cv = document.getElementById('riftCv') as HTMLCanvasElement | null;
  if (cv) {
    const rift = startRiftBackdrop(cv);
    (window as unknown as { __rift: unknown }).__rift = rift;
  }
} catch { /* art never blocks play */ }
window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
// The dive: endless zoom through the worlds. 2D paints instantly (first
// paint never waits); the 3D dive upgrades lazily on idle when the device
// can stun (WebGL + motion OK + >2GB RAM). Any failure stays 2D, silently.
// D14: no menu — portals ARE the catalog. Facing a world shows it in the
// PLAY bar; tapping or flying into a ring enters it. One resolver serves both.
function resolveGame(game: string, enter: boolean): void {
  sfx.pop();
  void catalog.then((games) => {
    const g = games.find((x) => x.id === game) ?? null;
    if (!g) {
      el('faceName').textContent = t('play.excavated');
      status(t('play.excavated'));
      return;
    }
    picked = g;
    try { localStorage.setItem('pg-game', g.id); } catch { /* private */ }
    el('faceName').textContent = `${g.verb} — ${g.id}: ${g.hook}`;
    if (!enter) return;
    status(t('play.divingIn'));
    location.href = `./?game=${g.id}&room=${rift}`;
  });
}
/** Portal tap / ring fly-through: enter immediately. */
function divePortal(game: string): void {
  resolveGame(game, true);
}
try {
  // SG-1: the dive reads a saga — tabs + ?saga= pick the book, chapters turn.
  let sagaIdx = 0;
  const sagaParam = Number.parseInt(qs.get('saga') ?? '', 10);
  try {
    const saved = Number.parseInt(localStorage.getItem('pg-saga') ?? '', 10);
    sagaIdx = Number.isInteger(sagaParam) ? sagaParam : (Number.isInteger(saved) ? saved : 0);
  } catch { sagaIdx = Number.isInteger(sagaParam) ? sagaParam : 0; }
  sagaIdx = sagaIndex(sagaIdx);
  const chParam = Number.parseInt(qs.get('ch') ?? '', 10);
  const startCh = Number.isInteger(chParam) ? Math.min(5, Math.max(0, chParam)) : 0;
  let stopDive: (() => void) | null = null;
  // LZ-3 cliffhanger card: fires when the reader finishes chapter 6.
  // Bottom-docked + dismissible, PLAY stays in flow and primary, auto-hides on saga switch.
  let finaleEl: HTMLElement | null = null;
  const showFinale = (): void => {
    try {
      const fin = sagaAt(sagaIdx).finale;
      if (!finaleEl) {
        finaleEl = document.createElement('div');
        finaleEl.id = 'finale';
        finaleEl.setAttribute('role', 'dialog');
        finaleEl.setAttribute('aria-label', t('finale.aria'));
        finaleEl.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:30;max-width:min(92vw,480px);background:#121214;border:2px solid #C6F135;border-radius:16px;padding:16px 18px;box-shadow:0 12px 48px rgba(0,0,0,.6)';
        finaleEl.innerHTML = '<div id="finTitle" style="font-weight:900;font-size:17px;margin-bottom:6px"></div>'
          + '<div id="finTeaser" style="font-size:14px;line-height:1.45;color:#F2EDE3;margin-bottom:12px"></div>'
          + '<div style="display:flex;gap:8px"><button id="finShare" style="flex:1;cursor:pointer;border:none;border-radius:12px;padding:12px;font-weight:900;min-height:48px;background:#C6F135;color:#070708">' + t('finale.share') + '</button>'
          + '<button id="finDive" style="cursor:pointer;border:2px solid #2A2A2E;border-radius:12px;padding:12px 16px;font-weight:800;min-height:48px;background:#0E0E12;color:#fff">' + t('finale.dive') + '</button></div>';
        document.body.appendChild(finaleEl);
        (finaleEl.querySelector('#finDive') as HTMLButtonElement).addEventListener('click', () => {
          try { finaleEl!.style.display = 'none'; } catch { /* gone */ }
        });
        (finaleEl.querySelector('#finShare') as HTMLButtonElement).addEventListener('click', async () => {
          const link = buildChapterUrl(location.origin, sagaIdx, 5);
          const text = t('finale.shareText', { title: sagaAt(sagaIdx).finale.title, link });
          try {
            const nav = navigator as unknown as { share?: (d: object) => Promise<void> };
            if (typeof nav.share === 'function') { await nav.share({ title: sagaAt(sagaIdx).name, text, url: link }); return; }
            throw new Error('no native share');
          } catch {
            try { await navigator.clipboard.writeText(text); status(t('finale.copied')); }
            catch { prompt(t('finale.prompt'), text); }
          }
        });
      }
      (finaleEl.querySelector('#finTitle') as HTMLElement).textContent = fin.title;
      (finaleEl.querySelector('#finTeaser') as HTMLElement).textContent = fin.teaser;
      finaleEl.style.display = 'block';
    } catch { /* story never blocks play */ }
  };
  const paintSagaTabs = (): void => {
    const tabs = document.getElementById('sagaTabs');
    const sub = document.getElementById('sagaSub');
    if (sub) sub.textContent = sagaAt(sagaIdx).sub;
    if (!tabs) return;
    tabs.innerHTML = '';
    SAGAS.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.name;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', i === sagaIdx ? 'true' : 'false');
      b.disabled = i === sagaIdx;
      b.addEventListener('click', () => {
        if (i === sagaIdx) return;
        sagaIdx = i;
        try { localStorage.setItem('pg-saga', String(i)); } catch { /* private */ }
        try {
          const u = new URL(location.href);
          u.searchParams.set('saga', String(i));
          u.searchParams.delete('ch');
          history.replaceState(null, '', u.toString());
        } catch { /* private */ }
        paintSagaTabs();
        bootDive(i, 0);
      });
      tabs.appendChild(b);
    });
  };
  const bootDive = (saga: number, ch: number): void => {
    const dive = document.getElementById('diveCv') as HTMLCanvasElement | null;
    if (!dive) return;
    try { stopDive?.(); } catch { /* gone */ }
    try { if (finaleEl) finaleEl.style.display = 'none'; } catch { /* gone */ }
    const flat = startDescent(dive, { onPortal: divePortal, saga, startDepth: ch, onFinale: showFinale });
    stopDive = flat.stop;
    const upgrade = (): void => {
      void (async () => {
        try {
          const mod = await import('./dive3d.js');
          const probe = document.createElement('canvas');
          const webgl = !!(probe.getContext('webgl2') ?? probe.getContext('webgl'));
          const ram = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null;
          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!mod.shouldUse3D({ webgl, ramGB: ram, reducedMotion: reduced })) return;
          try { stopDive?.(); } catch { /* gone */ }
          const d3 = await mod.startDive3D(dive, {
            onPortal: divePortal,
            onFace: (game: string) => resolveGame(game, false),
            onFinale: showFinale,
            rift,
            saga,
            startDepth: ch,
          });
          stopDive = d3.stop;
        } catch { /* 2D stays — art never blocks play */ }
      })();
    };
    if ('requestIdleCallback' in window) {
      (window as unknown as { requestIdleCallback: (cb: () => void, o?: { timeout: number }) => void }).requestIdleCallback(upgrade, { timeout: 2500 });
    } else {
      globalThis.setTimeout(upgrade, 1200);
    }
  };
  paintSagaTabs();
  // LZ-3: a chapter link lands with PLAY already naming that chapter's game
  // (2D has no face-follow; 3D re-affirms on first faced frame).
  try { resolveGame(chaptersOf(sagaIdx)[startCh]!.game, false); } catch { /* play still works via rings */ }
  bootDive(sagaIdx, startCh);
} catch { /* art never blocks play */ }
const SERVER =
  qs.get('server') ||
  (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SERVER ||
  (['localhost', '127.0.0.1'].includes(location.hostname) ? `ws://${location.hostname}:7749` : 'wss://playground-server.onrender.com');
const httpBase = SERVER.replace('ws', 'http');

// Guest boot: opaque ID persists locally; name is auto-guest (D14 killed
// the name field — you are Golden Falcon until you care; rename rides a
// later ticket). PLAY always has a name.
let gid = '';
try {
  gid = localStorage.getItem('pg-gid') || '';
  if (!gid) {
    gid = genGuestId();
    localStorage.setItem('pg-gid', gid);
  }
} catch { gid = genGuestId(); }
let myName = '';
try { myName = localStorage.getItem('pg-name') || ''; } catch { /* private mode */ }
if (!myName) {
  myName = genName();
  try { localStorage.setItem('pg-name', myName); } catch { /* private */ }
}

// Rift seed: deterministic per visitor, shareable as ?rift=. Even non-players
// get a unique "I found this weird world" artefact (report §A).
let rift = qs.get('rift') || '';
if (!rift) {
  const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  rift = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
}
el('riftSeed').textContent = `RIFT-${rift}`;
el('riftCopy').addEventListener('click', async () => {
  const link = `${location.origin}${location.pathname}?rift=${rift}`;
  try { await navigator.clipboard.writeText(link); } catch { prompt(t('rift.sharePrompt'), link); }
});

let picked: Manifest | null = null;

function status(msg: string): void {
  el('status').textContent = msg;
}

async function loadCatalog(): Promise<Manifest[]> {
  try {
    const r = await fetch(`${httpBase}/catalog`);
    if (!r.ok) throw new Error(`http ${r.status}`);
    return (await r.json()) as Manifest[];
  } catch {
    status(t('play.waking'));
    return [];
  }
}

// D14: moods are tunnel weather, not filters — no grid left to filter.
// Tapping one tints the rift and names the feeling; Surprise picks a world.
const MOOD_LINE: Record<string, string> = {
  BEAT: t('moodline.beat'),
  CHAOS: t('moodline.chaos'),
  THINK: t('moodline.think'),
  SURPRISE: t('moodline.surprise'),
};

document.querySelectorAll<HTMLButtonElement>('#moods button').forEach(b => {
  b.addEventListener('click', () => {
    sfx.tap();
    try {
      const riftBg = (window as unknown as { __rift?: { setTint: (c: string) => void } }).__rift;
      const tint = MOOD_TINT[b.dataset.mood ?? ''] ?? '#1E1033';
      riftBg?.setTint(tint);
    } catch { /* art never blocks play */ }
    const mood = b.dataset.mood ?? '';
    if (mood === 'SURPRISE') {
      void catalog.then((games) => {
        const g = games[Math.floor(Math.random() * games.length)] ?? null;
        if (g) resolveGame(g.id, false);
      });
    } else {
      status(MOOD_LINE[mood] ?? '');
    }
  });
});

el('play').addEventListener('click', () => {
  sfx.pop();
  void (async () => {
    if (!picked) {
      // Server was asleep at load: one live retry shared by every path.
      catalog = loadCatalog();
      const games = await catalog;
      const stored = (() => { try { return localStorage.getItem('pg-game'); } catch { return null; } })();
      picked = games.find(g => g.id === (qs.get('game') ?? stored ?? '')) ?? games[0] ?? null;
      if (picked) el('faceName').textContent = `${picked.verb} — ${picked.id}: ${picked.hook}`;
    }
    if (!picked) {
      status(t('play.wakingRetry'));
      return;
    }
    status(t('play.entering', { id: picked.id }));
    location.href = `./?game=${picked.id}&room=${rift}`;
  })();
});

let catalog = loadCatalog();
void catalog.then(games => {
  const stored = (() => { try { return localStorage.getItem('pg-game'); } catch { return null; } })();
  const initial = qs.get('game') ?? stored;
  picked = games.find(g => g.id === initial) ?? null;
  if (picked) {
    el('faceName').textContent = `${picked.verb} — ${picked.id}: ${picked.hook}`;
    status(`${picked.id}: ${picked.hook}`);
  } else {
    el('faceName').textContent = t('play.steer');
  }
});

// Owner studio: hidden observability (OpenMausBot-style threads). This route is
// NEVER linked from the shell, NEVER in the catalog, and the module it loads
// is meta-noindexed. Players must not find it; the owner opens /employees
// (or ?view=employees) to watch every employee think + reply as Boss.
const studioPath = location.pathname.replace(/\/+$/, '').endsWith('/employees');
const studioView = qs.get('view') === 'employees';
if (studioPath || studioView) {
  el('landing').style.display = 'none';
  const shell = document.getElementById('shell')!;
  const sv = document.createElement('div');
  sv.id = 'studioview';
  shell.appendChild(sv);
  void (async () => {
    try {
      const mod = await import('./employees.js');
      await mod.mount(sv, { server: SERVER });
    } catch {
      sv.textContent = t('studio.failed');
    }
  })();
}

// Room view: direct links bypass everything. Game clients mount into #mount
// in their own sprints via dynamic import of /src/games/<id>.ts.
const gameParam = qs.get('game');
const roomParam = qs.get('room');
if (gameParam && roomParam) {
  el('landing').style.display = 'none';
  el('roomview').classList.add('on');
  el('roomTitle').textContent = gameParam;
  el('roomSub').textContent = t('play.roomJoining', { room: roomParam, name: myName });
  void (async () => {
    try {
      const mod = await import(`./games/${gameParam}.ts`);
      await mod.mount(el('mount'), { server: SERVER, game: gameParam, room: roomParam, name: myName });
      el('roomSub').textContent = t('play.roomPlaying', { room: roomParam, name: myName });
    } catch {
      el('roomSub').textContent = t('play.roomFallback', { room: roomParam });
      el('mount').textContent = t('play.mountFallback');
    }
  })();
}
