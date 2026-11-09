# syntax=docker/dockerfile:1
#
# One image for the local machine, the browser tests and the droplet. Stages:
#   base  Node and pnpm.
#   deps  All workspace dependencies, installed from the lockfile.
#   dev   `deps` plus the dev server command. The source comes from the host (see compose.yaml).
#   build The web build, the API bundle, and the production files of the API.
#   prod  The last stage and the default target: Node, the API bundle, its production
#         dependencies and the web build. It runs as the user `node`.
#
#   docker build -t harborfront .                 # prod
#   docker build --target dev -t harborfront-dev .
#
# glibc (`-slim`, not Alpine), so the prebuilt `better-sqlite3` binaries load.
ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-slim AS base
WORKDIR /repo
ENV CI=true
# Node 25 and later do not ship Corepack, so pnpm is installed with npm. The version is the one in
# package.json (`devEngines.packageManager`), the same one that the lockfile and the CI use.
RUN --mount=type=bind,source=package.json,target=/tmp/package.json \
    PNPM_VERSION="$(node -p "require('/tmp/package.json').devEngines.packageManager.version")" \
 && npm install --global "pnpm@${PNPM_VERSION}"

FROM base AS deps
# The manifests only, so this layer stays cached until a dependency changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
COPY packages/game-engine/package.json packages/game-engine/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# The source is mounted from the host. `pnpm dev` starts the web server (5173) and the API (8787).
FROM deps AS dev
ENV NODE_ENV=development
EXPOSE 5173 8787
CMD ["pnpm", "dev"]

FROM deps AS build
COPY . .
RUN pnpm build
# The production files of the API: its `dependencies` only, with no workspace packages (they are
# bundled in `dist`), no `pino-pretty` and no test tools.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @monopoly/api deploy --prod --store-dir /pnpm/store /out/api

FROM node:${NODE_VERSION}-slim AS prod
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/monopoly.db \
    WEB_DIST_DIR=/app/web
WORKDIR /app
COPY --from=build /out/api/node_modules ./node_modules
COPY --from=build /out/api/package.json ./package.json
COPY --from=build /out/api/dist ./dist
COPY --from=build /repo/apps/web/dist ./web
# The database folder. A volume that is new gets the owner of this folder.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8787
# The orchestrator reads this. `/api/ready` checks the database and the migrations. The image has
# no curl, so Node makes the request.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/api/ready`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Exec form, so SIGTERM from `docker stop` reaches Node and starts the graceful shutdown.
# `telemetry.ts` is loaded first and does nothing without OTEL_EXPORTER_OTLP_ENDPOINT.
CMD ["node", "--import", "./dist/telemetry.mjs", "dist/index.mjs"]
