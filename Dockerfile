# Küchenplaner – 3D-Küchenplanung mit Konten und gespeicherten Planungen
# Stufe 1: Frontend bauen (Vite)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

# Stufe 2: schlanker Laufzeit-Container (Express + eingebautes node:sqlite)
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    TZ=Europe/Berlin

RUN apk add --no-cache tzdata \
 && mkdir -p /data \
 && chown node:node /data

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server ./server
COPY --from=build --chown=node:node /app/dist ./dist

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

# direkt node starten (nicht npm), damit SIGTERM ankommt
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.ts"]
