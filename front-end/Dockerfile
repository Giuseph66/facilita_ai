FROM node:24-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY front-end/package.json front-end/package.json
RUN pnpm install --frozen-lockfile --filter @facilita/front-end...
COPY front-end front-end
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @facilita/front-end build

FROM node:24-bookworm-slim AS runtime
WORKDIR /workspace
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /workspace/front-end/.next/standalone ./
COPY --from=build --chown=node:node /workspace/front-end/.next/static ./front-end/.next/static
USER node
EXPOSE 3000
CMD ["node", "front-end/server.js"]
