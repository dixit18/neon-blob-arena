// apps/web shell — HTML-first playground (Foundation slice).
// Direct room links (?game=&room=) render room view WITHOUT any world bundle:
// the lazy Three.js playground is a later deliverable and must never gate play.
import { genGuestId, genName } from '../../../packages/identity/src/index.js';
import { startRiftBackdrop, MOOD_TINT, sfx } from './art.js';
import { startDescent } from './descent.js';
import { SAGAS, sagaAt } from './sagas.js';

type Manifest = {
  id: string; verb: string; hook: string; moods: string[];
  minPlayers: number; maxPlayers: number; shareKind: string;
};

const el = (id: string) => document.getElementById(id)!;
const qs = new URLSearchParams(location.search);
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
      el('faceName').textContent = 'that world is still being excavated.';
      status('that world is still being excavated.');
      return;
    }
    picked = g;
    try { localStorage.setItem('pg-game', g.id); } catch { /* private */ }
    el('faceName').textContent = `${g.verb} — ${g.id}: ${g.hook}`;
    if (!enter) return;
    status('diving in — see you inside!');
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
  sagaIdx = SAGAS.indexOf(sagaAt(sagaIdx));
  let stopDive: (() => void) | null = null;
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
          history.replaceState(null, '', u.toString());
        } catch { /* private */ }
        paintSagaTabs();
        bootDive(i);
      });
      tabs.appendChild(b);
    });
  };
  const bootDive = (saga: number): void => {
    const dive = document.getElementById('diveCv') as HTMLCanvasElement | null;
    if (!dive) return;
    try { stopDive?.(); } catch { /* gone */ }
    const flat = startDescent(dive, { onPortal: divePortal, saga });
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
            rift,
            saga,
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
  bootDive(sagaIdx);
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
  try { await navigator.clipboard.writeText(link); } catch { prompt('Share this world:', link); }
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
    status('server is waking up — PLAY retries automatically.');
    return [];
  }
}

// D14: moods are tunnel weather, not filters — no grid left to filter.
// Tapping one tints the rift and names the feeling; Surprise picks a world.
const MOOD_LINE: Record<string, string> = {
  BEAT: 'beat weather — fast rings, faster friends.',
  CHAOS: 'chaos weather — everything sparkles at once.',
  THINK: 'think weather — slow water, deep dive.',
  SURPRISE: 'surprise weather — the rift chooses for you.',
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
      status('server is still waking — wait a few seconds, hit PLAY again.');
      return;
    }
    status(`entering ${picked.id}…`);
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
    el('faceName').textContent = 'steer toward a glowing ring…';
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
      sv.textContent = 'studio failed to load.';
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
  el('roomSub').textContent = `room ${roomParam} · joining as ${myName}…`;
  void (async () => {
    try {
      const mod = await import(`./games/${gameParam}.ts`);
      await mod.mount(el('mount'), { server: SERVER, game: gameParam, room: roomParam, name: myName });
      el('roomSub').textContent = `room ${roomParam} · playing as ${myName}`;
    } catch {
      el('roomSub').textContent = `room ${roomParam} · game client lands in its sprint — server rooms are live now.`;
      el('mount').textContent = 'this game is still being excavated. try another portal.';
    }
  })();
}
