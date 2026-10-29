# One image for every role: setup (migrations and seed), api, worker and web.
# Build arg NPM_REGISTRY switches the npm registry (e.g. https://registry.npmmirror.com in mainland China).
# Pin the verified 2026-10-29 amd64/multiarch manifest. Floating node:24-trixie-slim
# changed its base layers between Oct 28 and Oct 29, turning every release into a
# full image transfer to cn-dev instead of reusing content-addressed layers.
FROM node:24-trixie-slim@sha256:54f84b4cf8432b21aaffd5d3ce8d41e12cea0d10d33c09d2f3c9879d49d6b446 AS base
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
