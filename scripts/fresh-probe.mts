// scripts/fresh-probe.mts — confirm the SERVED bundle (not stale preview)
// contains a hex. Usage: npx tsx scripts/fresh-probe.mts [baseUrl]
const base = process.argv[2] ?? 'http://127.0.0.1:5396/';
const html = await (await fetch(base)).text();
const m = /\/assets\/index-[^"']+\.js/.exec(html);
console.log('chunk:', m?.[0] ?? '(none)');
if (m) {
  const js = await (await fetch(base + m[0].slice(1))).text();
  for (const hex of ['0E3A46', '8FB4C8', '08333C', '7AD4DE']) {
    console.log(`${hex}: ${js.includes(hex)}`);
  }
}
