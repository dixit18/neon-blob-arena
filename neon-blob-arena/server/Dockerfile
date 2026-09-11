FROM node:20-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm install typescript --no-save && npx tsc -p tsconfig.json && npm prune --omit=dev
ENV PORT=8080
EXPOSE 8080
CMD ["node","dist/index.js"]
