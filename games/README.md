# Playground plugin contract (report §D). Games are plugins, not mini-apps.
# Each game implements GamePlugin (see packages/room/src/index.ts):
# join / leave / accept(GameCommand) / step(dt) / snapshot(playerId) /
# createBot(slot) / playerCount / dispose — plus createShareArtifact(result)
# and a client at apps/web/src/games/<id>.ts exporting mount(el, ctx).
# Reflex Riot lands in Sprint 3 as the first plugin.
