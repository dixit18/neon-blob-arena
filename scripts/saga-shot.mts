// scripts/saga-shot.mts — node-driven Edge screenshots (browser-check.ts
// edgeShot, parameterized). PowerShell `&` mangles Edge args — ALL browser
// proof rides node execFileSync. Usage:
// npx tsx scripts/saga-shot.mts <out.png> <url> <w> <h> <profileDir> [budgetMs]
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [, , out, url, w, h, profile, budget] = process.argv;

const args = [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
];
if (budget) args.push(`--virtual-time-budget=${budget}`);
args.push(`--screenshot=${out}`, url);
try {
  execFileSync(EDGE, args, { timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'] });
} catch { /* nonzero exit OK — screenshots often still land */ }
try {
  console.log(`${out}: ${statSync(out as string).size}B`);
} catch {
  console.log(`${out}: MISSING`);
}
