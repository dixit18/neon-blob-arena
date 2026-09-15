// apps/web shell — HTML-first playground (Foundation slice).
// Direct room links (?game=&room=) render room view WITHOUT any world bundle:
// the lazy Three.js playground is a later deliverable and must never gate play.
import { genGuestId, genName } from '../../../packages/identity/src/index.js';

type Manifest = {
  id: string; verb: string; hook: string; moods: string[];
  minPlayers: number; maxPlayers: number; shareKind: string;
};

const el = (id: string) => document.getElementById(id)!;
const qs = new URLSearchParams(location.search);
const SERVER =
  qs.get('server') ||
  (import.meta as unknown as { env: Record<string, string> }).env?.VITE_SERVER ||
  (['localhost', '127.0.0.1'].includes(location.hostname) ? `ws://${location.hostname}:7749` : 'wss://playground.example.com');
const httpBase = SERVER.replace('ws', 'http');

// Guest boot: opaque ID persists locally, name defaults generated, one-tap edit.
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
if (!myName) myName = genName();
(el('name') as HTMLInputElement).value = myName;

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
    status('catalog unreachable — tap PLAY to retry once the server wakes.');
    return [];
  }
}

function renderGames(games: Manifest[], mood: string | null): void {
  const box = el('games');
  box.innerHTML = '';
  const list = mood && mood !== 'SURPRISE'
    ? games.filter(g => g.moods.includes(mood))
    : [...games].sort(() => Math.random() - 0.5);
  if (list.length === 0) {
    box.innerHTML = '<div class="excavate"><span>nothing excavated for this mood yet.</span></div>';
    return;
  }
  for (const g of list) {
    const b = document.createElement('button');
    b.className = 'excavate';
    b.dataset.game = g.id;
    b.innerHTML = `<b></b><span></span><br /><span class="tag"></span>`;
    (b.querySelector('b') as HTMLElement).textContent = `${g.verb} — ${g.id}`;
    (b.querySelectorAll('span')[0] as HTMLElement).textContent = g.hook;
    (b.querySelector('.tag') as HTMLElement).textContent = `${g.minPlayers}–${g.maxPlayers} PLAYERS · ${g.shareKind}`;
    b.addEventListener('click', () => {
      picked = g;
      try { localStorage.setItem('pg-game', g.id); } catch { /* private */ }
      document.querySelectorAll('.excavate').forEach(x => (x as HTMLElement).style.borderColor = '');
      b.style.borderColor = '#C6F135';
      status(`${g.id}: ${g.hook}`);
    });
    box.appendChild(b);
  }
  if (!picked || !list.includes(picked)) picked = list[0] ?? null;
}

document.querySelectorAll<HTMLButtonElement>('#moods button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#moods button').forEach(x => x.classList.remove('on'));
    b.classList.add('on');
    void catalog.then(games => renderGames(games, b.dataset.mood ?? null));
  });
});

el('play').addEventListener('click', () => {
  const n = ((el('name') as HTMLInputElement).value || myName).slice(0, 14);
  try { localStorage.setItem('pg-name', n); } catch { /* private */ }
  myName = n || myName;
  if (!picked) {
    status('pick a game first — poke a mood above.');
    return;
  }
  status(`entering ${picked.id}…`);
  location.href = `./?game=${picked.id}&room=${rift}`;
});

const catalog = loadCatalog();
void catalog.then(games => {
  const stored = (() => { try { return localStorage.getItem('pg-game'); } catch { return null; } })();
  const initial = qs.get('game') ?? stored;
  if (initial) picked = games.find(g => g.id === initial) ?? null;
  renderGames(games, null);
  if (picked) status(`${picked.id}: ${picked.hook}`);
});

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
