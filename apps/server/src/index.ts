// apps/server boot: loops, GC, crash-proofing. Sims are stepped here;
// Effect stays at ingress/egress (see app.ts), never inside driver.step().
const PORT = Number(process.env.PORT || 7749);

const { createApp } = await import('./app.js');
const app = createApp();

setInterval(() => {
  app.stepAll();
}, 1000 / 20);

setInterval(() => {
  app.snapAll();
}, 1000 / 15);

setInterval(() => {
  const dead = app.registry.tick();
  for (const d of dead) console.log(`[room ${d}] gc`);
}, 5000);

process.on('uncaughtException', (e) => console.error('[fatal] uncaughtException (staying up):', e));
process.on('unhandledRejection', (e) => console.error('[fatal] unhandledRejection (staying up):', e));

// Render's port scanner checks IPv4: bind 0.0.0.0 explicitly (learned 2026-09-14).
app.server.listen(PORT, '0.0.0.0', () => console.log(`[server] playground :${PORT} node=${process.version} tick=20Hz snap=15Hz`));
