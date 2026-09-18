// scripts/dom-probe.mts — node-driven dump-dom + saga/caption/seal report.
// Same law as saga-shot.mts: node execFileSync, never PowerShell `&`.
import { execFileSync } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [, , url, profile] = process.argv;

let out = '';
try {
  out = execFileSync(EDGE, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, '--virtual-time-budget=8000',
    '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--dump-dom', url,
  ], { timeout: 90000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) as string;
} catch (e) {
  const ex = e as { stdout?: unknown };
  out = String(ex.stdout ?? '');
}
const sub = /id="sagaSub"[^>]*>([^<]*)/.exec(out)?.[1] ?? '(none)';
const tabs = [...out.matchAll(/<button[^>]*role="tab"[^>]*>([^<]*)</g)].map((m) => m[1]);
const disabled = [...out.matchAll(/<button[^>]*disabled[^>]*>([^<]*)</g)].map((m) => m[1]);
const cap = /aria-live="polite"[^>]*>([^<]*)/.exec(out)?.[1] ?? '(no-3d-cap)';
const seals = (out.match(/seal got/g) ?? []).length;
console.log(`sub:${sub}`);
console.log(`tabs:${tabs.join('|')}`);
console.log(`disabled:${disabled.join('|')}`);
console.log(`cap:${cap}`);
console.log(`seals:${seals}`);
console.log(`bytes:${out.length}`);
