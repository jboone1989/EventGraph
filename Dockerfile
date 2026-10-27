# One image for every role: setup (migrations and seed), api, worker and web.
# Build arg NPM_REGISTRY switches the npm registry (e.g. https://registry.npmmirror.com in mainland China).
FROM node:24-trixie-slim AS base
WORKDIR /app
# pg_dump for the optional database backups (Debian's client matches the PostgreSQL 17 server in compose).
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client ca-certificates \
 && rm -rf /var/lib/apt/lists/*

FROM base AS build
ARG NPM_REGISTRY=
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/backend/package.json packages/backend/
COPY packages/contracts/package.json packages/contracts/
COPY industry/package.json industry/
COPY site/package.json site/
COPY modules/research/package.json modules/research/
RUN npm ci --no-audit --no-fund ${NPM_REGISTRY:+--registry=$NPM_REGISTRY}
COPY . .
# giscus is optional; Vite inlines this public Discussion category ID into the Web bundle.
ARG VITE_GISCUS_CATEGORY_ID=
ENV VITE_GISCUS_CATEGORY_ID=${VITE_GISCUS_CATEGORY_ID}
# Keep the often-unchanged production dependencies in an independent image layer.
# The application tree is deliberately left without node_modules for the next COPY.
RUN npm run build -w @aihot/web && npm prune --omit=dev --no-audit --no-fund \
 && mv /app/node_modules /runtime-node-modules

FROM base
ENV NODE_ENV=production
# Runtime dependencies can reuse the same GHCR layer across code-only releases.
COPY --from=build --chown=node:node /runtime-node-modules /app/node_modules
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.ts"]
