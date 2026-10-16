FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY db/index.ts ./db/index.ts
COPY db/schema ./db/schema
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000 \
    MOVIES_DB_PATH=/data/movies.db \
    AUTH_DB_PATH=/data/auth.db
WORKDIR /app
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY db/movies.db ./seed/movies.db
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["sh", "-c", "[ -f \"$MOVIES_DB_PATH\" ] || cp /app/seed/movies.db \"$MOVIES_DB_PATH\"; exec node dist/src/server.js"]
