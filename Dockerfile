FROM node:24-bookworm-slim AS deps

WORKDIR /app

# better-sqlite3 a un binaire natif : outils de compilation si le prebuild n'est pas dispo
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3020
ENV DATA_DIR=/app/data

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json server.js ./
COPY src ./src
COPY public ./public

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3020
VOLUME ["/app/data"]

CMD ["node", "server.js"]
