# Playground server image — Node 24 LTS (report: Node 20 is EOL, CI + Docker pin 24).
FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.server.json ./
COPY packages ./packages
COPY games ./games
COPY apps/server ./apps/server
RUN npm install && npx tsc -p tsconfig.server.json && npm prune --omit=dev
ENV PORT=10000 REGION=iad
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:$PORT/health || exit 1
CMD ["node", "dist/apps/server/src/index.js"]
