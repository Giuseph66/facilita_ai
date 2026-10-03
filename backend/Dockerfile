FROM postgres:17-bookworm AS database-tools
RUN mkdir /tools && cp /usr/lib/postgresql/17/bin/pg_dump /usr/lib/postgresql/17/bin/pg_restore /tools/ \
    && cp -L /usr/lib/*/libpq.so.5 /tools/libpq.so.5

FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
RUN ONNXRUNTIME_NODE_INSTALL=skip pnpm install --frozen-lockfile --filter @facilita/backend... --network-concurrency=4
COPY backend backend
RUN pnpm --filter @facilita/backend build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /workspace/backend
# Chromium is isolated to rendering application-owned HTML, never user-supplied URLs.
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates fonts-dejavu-core postgresql-client \
    && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
RUN apt-get update && apt-get install -y --no-install-recommends chromium-sandbox \
    && rm -rf /var/lib/apt/lists/*
COPY --from=database-tools /tools/pg_dump /tools/pg_restore /usr/local/bin/
COPY --from=database-tools /tools/libpq.so.5 /usr/local/lib/
RUN ldconfig
COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/backend/node_modules ./node_modules
COPY --from=build /workspace/backend/dist ./dist
COPY backend/package.json ./package.json
COPY backend/scripts ./scripts
COPY backend/migrations ./migrations
RUN mkdir -p /data/storage /data/models && chown -R node:node /data /workspace
ENV STORAGE_PATH=/data/storage EMBEDDING_CACHE_PATH=/data/models API_PORT=3001
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
