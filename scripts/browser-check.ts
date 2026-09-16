// scripts/browser-check.ts — real-browser agent gate (Edge + Firefox headless).
//
// WHY: headless suites prove logic; only real browsers prove boot, rendering,
// and no-crash across engines. Zero new deps: drives the vendors' own
// headless flags via child_process. MUST use an isolated --user-data-dir so
// it never touches the owner's live browser session.
//
// WHAT per browser: load landing + one game room, assert JS-ran DOM markers,
// screenshot both, report sizes. Virtual-time budget lets fetch/WS settle.
// WebGL is best-effort headless (SwiftShader flags): the load-bearing asserts
// are 2D boot + markers + no-blank paint — 3D upgrades are covered by the
// fps-meter + /perf telemetry from real sessions.
//
// Run: boot the stack bound to IPv4 FIRST, then:
//   npx vite preview --port 5380 --strictPort --host 127.0.0.1   (apps/web)
//   npx tsx apps/server/src/index.ts                              (PORT=7749)
//   npx tsx scripts/browser-check.ts --web http://127.0.0.1:5380/ --server ws://127.0.0.1:7749
// (vite preview defaults to `localhost`, which can resolve to ::1 IPv6 while
// this script dials 127.0.0.1 — bind explicitly or every check 404s.)
import { execFileSync, ExecFileSyncException } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, existsSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const FIREFOX = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}
const WEB = arg('--web', 'http://127.0.0.1:5380/');
const SERVER = arg('--server', 'ws://127.0.0.1:7749');
const OUT = arg('--out', 'C:\\Users\\Dell\\AppData\\Local\\Temp\\opencode\\browser');
mkdirSync(OUT, { recursive: true });

interface Check { browser: string; page: string; markers: string[]; missing: string[]; screenshot: string; shotBytes: number; ok: boolean; note: string }
const checks: Check[] = [];
let failures = 0;

function run(bin: string, args: string[], timeoutMs: number): { ok: boolean; out: string } {
  try {
    const out = execFileSync(bin, args, { timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: String(out ?? '') };
  } catch (e) {
    const ex = e as ExecFileSyncException & { stdout?: unknown; status?: number };
    // Headless screenshot runs often exit nonzero while still writing output.
    return { ok: false, out: String(ex.stdout ?? '') };
  }
}

const LANDING_MARKERS = ['riftSeed', 'RIFT-', 'id="games"', 'id="play"', 'diveCv', 'id="status"'];
const ROOM_MARKERS = ['roomview', 'roomTitle', 'id="mount"'];

const EDGE_ARGS = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
];
function edgeDumpDom(url: string, budgetMs: number): string {
  const profile = `${OUT}\\edge-profile`;
  mkdirSync(profile, { recursive: true });
  const { out } = run(EDGE, [
    ...EDGE_ARGS,
    `--user-data-dir=${profile}`, `--virtual-time-budget=${budgetMs}`,
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--dump-dom', url,
  ], 90000);
  return out;
}

function shotPath(name: string): string { return `${OUT}\\${name}`; }

function edgeShot(url: string, file: string, w: number, h: number): number {
  const profile = `${OUT}\\edge-profile`;
  run(EDGE, [
    ...EDGE_ARGS,
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', `--screenshot=${file}`, url,
  ], 90000);
  try { return statSync(file).size; } catch { return 0; }
}

function firefoxShot(url: string, file: string, w: number, h: number): number {
  // Fresh profile: without it a running Firefox session swallows headless
  // flags into the live window and no screenshot is ever written.
  const profile = `${OUT}\\ff-profile`;
  mkdirSync(profile, { recursive: true });
  run(FIREFOX, ['-profile', profile, '--headless', `--window-size=${w},${h}`, '--screenshot', file, url], 90000);
  try { return statSync(file).size; } catch { return 0; }
}

function checkDom(browser: string, page: string, dom: string, markers: string[], screenshot: string, shotBytes: number): void {
  const missing = markers.filter((m) => !dom.includes(m));
  const ok = missing.length === 0 && shotBytes > 15000;
  if (!ok) failures++;
  checks.push({ browser, page, markers, missing, screenshot, shotBytes, ok, note: ok ? 'DOM markers + non-blank paint' : 'SEE missing/shotBytes' });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${browser} ${page} markers=${markers.length - missing.length}/${markers.length} shot=${shotBytes}B`);
  for (const m of missing) console.log(`    missing: ${m}`);
}

const roomUrl = (game: string): string =>
  `${WEB}?game=${game}&room=BROWS&server=${encodeURIComponent(SERVER)}`;

if (!existsSync(EDGE)) {
  console.log('[SKIP] Edge binary not found');
} else {
  const landingDom = edgeDumpDom(WEB, 8000);
  const landingShot = shotPath('edge-landing-1280.png');
  checkDom('edge', 'landing', landingDom, LANDING_MARKERS, landingShot, edgeShot(WEB, landingShot, 1280, 900));
  const roomDom = edgeDumpDom(roomUrl('nitro-rift'), 10000);
  const roomShot = shotPath('edge-nitro-1280.png');
  checkDom('edge', 'nitro-room', roomDom, ROOM_MARKERS, roomShot, edgeShot(roomUrl('nitro-rift'), roomShot, 1280, 900));
  const phoneShot = shotPath('edge-landing-360.png');
  const phoneBytes = edgeShot(WEB, phoneShot, 360, 640);
  const phoneOk = phoneBytes > 8000;
  if (!phoneOk) failures++;
  checks.push({ browser: 'edge', page: 'landing-360', markers: [], missing: [], screenshot: phoneShot, shotBytes: phoneBytes, ok: phoneOk, note: '360px paint check' });
  console.log(`[${phoneOk ? 'PASS' : 'FAIL'}] edge landing-360 shot=${phoneBytes}B`);
}

if (!existsSync(FIREFOX)) {
  console.log('[SKIP] Firefox binary not found');
} else {
  // Firefox headless has no dump-dom: prove paint (non-blank shots) on both
  // pages; DOM-marker proof rides on Edge above + shared code.
  const land = shotPath('firefox-landing-1280.png');
  const landBytes = firefoxShot(WEB, land, 1280, 900);
  const room = shotPath('firefox-nitro-1280.png');
  const roomBytes = firefoxShot(roomUrl('nitro-rift'), room, 1280, 900);
  for (const [page, file, bytes] of [['landing', land, landBytes], ['nitro-room', room, roomBytes]] as const) {
    const ok = bytes > 15000;
    if (!ok) failures++;
    checks.push({ browser: 'firefox', page, markers: [], missing: [], screenshot: file, shotBytes: bytes, ok, note: 'paint check (no dump-dom on FF headless)' });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] firefox ${page} shot=${bytes}B`);
  }
}

console.log(failures === 0 ? 'BROWSER GREEN' : `BROWSER RED (${failures} failing checks)`);
process.exit(failures === 0 ? 0 : 1);
