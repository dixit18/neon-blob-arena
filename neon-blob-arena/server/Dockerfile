FROM node:20-slim
WORKDIR /app
# package-lock pinned: deploy builds EXACTLY what dev builds (TS version, effect, neon).
# (Floating installs once broke the build: latest-TS narrowed literals dev-TS accepted.)
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json && npm prune --omit=dev
ENV PORT=8080
EXPOSE 8080
CMD ["node","dist/index.js"]
