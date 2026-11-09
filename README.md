# Monopoly online

A property-trading board game that you play in the browser.

## Structure

| Path                   | Content                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web`             | Frontend. React, TanStack Query, three.js through React Three Fiber and drei.                |
| `apps/api`             | Backend. Hono on Node, SQLite (better-sqlite3), Kysely queries.                              |
| `packages/shared`      | Zod schemas and the API error format. The API and the web use them.                          |
| `packages/game-engine` | The game rules as a pure module. See its [README](packages/game-engine/README.md).           |
| `artifacts/`           | Standalone copies of the design system and game screen prototype.                            |
| `plan/`                | Specifications, game rules and the [implementation roadmap](plan/implementation-roadmap.md). |
| `GLOSSARY.md`          | [Project terms](GLOSSARY.md): what each term means and where it is used.                     |

The toolchain is [Vite+](https://viteplus.dev) (`vite-plus`). It supplies Vite, Vitest, Oxlint, Oxfmt and tsdown.

## Prerequisites

- Node 24 or later. The project uses Node 26 (`.nvmrc`).
- pnpm 12. Vite+ downloads the correct version if necessary.

Do not set `--use-openssl-ca` and `--use-system-ca` together in `NODE_OPTIONS`. If you set the two flags, Node does not start.

## Install

```bash
pnpm install
```

## Develop

```bash
pnpm dev
```

This command starts the two apps:

- The web app is at http://localhost:5173.
- The API is at http://localhost:8787.

The web dev server sends `/api` requests to the API.

The API keeps its database in `apps/api/data/monopoly.db`. To change the path, set `DB_PATH`. To change the port, set `PORT`. The API applies the migrations when it starts.

## Sign-in

## Docker image

One `Dockerfile` makes the image that runs locally, in the browser tests and on the droplet. The default target is `prod`: Node 26, the API bundle, its production dependencies and the web build, as the user `node`. It listens on port 8787, keeps the database in the `/data` volume and has a health check on `/api/ready`. The `dev` target has all dependencies for `pnpm dev`; its source comes from the host.

```bash
docker build -t harborfront .
```

```bash
docker run --rm -p 8787:8787 -v harborfront-data:/data -e GOOGLE_CLIENT_ID=... -e GOOGLE_CLIENT_SECRET=... -e GOOGLE_REDIRECT_URI=http://localhost:8787/api/auth/google/callback harborfront
```

The production image needs a sign-in method: the Google variables below. `NODE_ENV` is `production` in the image, so guest sign-in is refused. The image has no `pino-pretty`, so do not set `NODE_ENV=development` on it; the compose file and the browser tests (D3, D5) handle this.

The API reads these environment variables:

| Variable                                   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GUEST_SIGN_IN_ENABLED`                    | Set to `true` to turn on guest name sign-in (`POST /api/session`). For test and development only. When it is not set, the route is 404. The API does not start when it is `true` and `NODE_ENV` is `production`. `pnpm dev` and the browser tests set it                                                                                                                                                                                                                                                                                                                                             |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | The Google OAuth client. Required in production                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `LOG_LEVEL`                                | The log level: `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. Default `info`, and `debug` when `NODE_ENV` is `development`. The logs are JSON lines on stdout, and readable text in development                                                                                                                                                                                                                                                                                                                                                                                     |
| `SHUTDOWN_TIMEOUT_MS`                      | The time limit of a shutdown on SIGTERM or SIGINT, in ms. Default 8000. Keep it below the stop timeout of the container (10 s). The log shows each shutdown step; a step that is too slow is named in the timeout line                                                                                                                                                                                                                                                                                                                                                                               |
| `OTEL_EXPORTER_OTLP_ENDPOINT`              | The OTLP address for traces, metrics and logs, for example `http://localhost:4318`. Telemetry is on only when this is set. The other standard `OTEL_*` variables work too: `OTEL_SERVICE_NAME` (default `harborfront-api`), `OTEL_EXPORTER_OTLP_HEADERS`, `OTEL_TRACES_SAMPLER` and `OTEL_SDK_DISABLED`. `pnpm dev` and `pnpm --filter @monopoly/api start` load `telemetry.ts` before the app. With telemetry on, each log line has `trace_id`, `span_id` and `trace_flags`, and the lines also go to the OTLP endpoint. Metrics go out every 60 s; `OTEL_METRIC_EXPORT_INTERVAL` (ms) changes that |
| `WEB_DIST_DIR`                             | The folder of the web build, for example `../web/dist` after `pnpm build`. When it is set, the API also serves the web app on its own port: build files as they are, `index.html` for app routes such as `/games/<id>`, and the JSON `not_found` error for an unknown `/api/*` path. The API does not start when the folder has no `index.html`. When it is not set, the API serves no web files                                                                                                                                                                                                     |
| `GOOGLE_REDIRECT_URI`                      | The callback address of the API, for example `http://localhost:5173/api/auth/google/callback`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

At least one sign-in method must be on, or the API does not start. `GET /api/auth/methods` shows the methods that are on.

To set up Google sign-in on the local machine:

1. In Google Cloud, create an OAuth client of type "Web application".
2. Add `GOOGLE_REDIRECT_URI` as an authorized redirect address.
3. If the consent screen is in "Testing", add your Google account as a test user.
4. Put the three Google values in `apps/api/.env`. The API development and start commands load this file. Do not commit this file.
5. Restart `pnpm dev` after you change the file. Open `/api/auth/methods` on the web server and check that `google` is `true`.

Guest sign-in and Google sign-in make separate users. Local guest users continue to work.

To delete all data and start again, stop the API and run:

```bash
pnpm db:purge
```

This command deletes the database file and its `-shm` and `-wal` files. It uses the same path as the API, so it follows `DB_PATH`. The next start makes a new, empty database. All users, sessions and games are gone, so every browser must sign in again.

## Check, test and build

```bash
pnpm check
```

This command does the format, lint and type checks. To fix format errors, use `pnpm exec vp check --fix`.

```bash
pnpm test
```

```bash
pnpm build
```

```bash
pnpm --filter @monopoly/api start
```

This command starts the built API from `apps/api/dist`.

## Local stack with Docker Compose

`compose.yaml` runs the app and a Grafana stack for its logs, metrics and traces. It needs Docker with Compose v2. The Grafana image is about 3.5 GB and uses much memory: stop it when you do not need it.

```bash
docker compose up
```

- The app (the production image, in development mode) is on http://localhost:8787. It serves the web app and the API on one origin. Sign in with a guest name.
- Grafana is on http://localhost:3000 (user `admin`, password `admin`). The data sources are Prometheus (metrics), Loki (logs) and Tempo (traces). The Harborfront dashboard comes with task D4.
- `docker compose stop` stops the containers and keeps their data. The API stops in about a second, and its log shows each shutdown step. `docker compose down` removes the containers and clears the Grafana data; `down -v` also clears the game database.

The settings of the app are in `ops/local.env`. Put your own values in `.env` (see `.env.example`): they win. For example, set the Google variables and `NODE_ENV=production` to sign in with Google.

```bash
docker compose --profile dev up dev lgtm
```

This starts `pnpm dev` in a container instead of the production image: the web app with hot reload on http://localhost:5173 (it proxies `/api`), and the API with `--watch`. The source is the host folder. `node_modules` is in Docker volumes, because the macOS install does not run on Linux. Name the services, because a plain `--profile dev up` also starts `app`.

```bash
docker compose --profile e2e up --wait e2e
```

This starts the production image with the settings of the browser tests on port 8787, with a new in-memory database. `pnpm e2e:docker` will use it (task D5). The tests flags are refused when `NODE_ENV` is `production`, so this profile does not test the production settings.

If you run the API on the host with `pnpm dev`, send its telemetry to the stack with `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`.

## Artifacts

The `artifacts/` folder has two standalone copies of Claude artifacts. They run with Node only. They have no dependencies, but they need an internet connection: fonts load from Google Fonts and three.js loads from jsDelivr.

```bash
pnpm artifact:game-screen
```

This command starts the game screen prototype at http://localhost:8791. It is a 3D board with scripted turns. Use the Prototype panel to jump to any state.

```bash
pnpm artifact:design-system
```

This command starts the Design System at http://localhost:8792. The sidebar lists all the boards.

Both commands use `artifacts/serve.mjs`, a small static server without dependencies. To use another port, run `node artifacts/serve.mjs <folder> <port>`. Opening the HTML files from disk does not work, because ES modules need a server. The toolchain does not lint or format `artifacts/`.

## Game engine

The game rules are in `packages/game-engine`. The module plays a full game to a winner. It has no I/O, and it is not connected to the API or the web app yet. For the design, the state and the parts that are not built, see the [package README](packages/game-engine/README.md). The task list is in [plan/game-engine-plan.md](plan/game-engine-plan.md).

## Use the Vite+ CLI

Use the package scripts, or use `pnpm exec vp <command>`. The project does not need a global `vp` install.

## Add a database change

1. Add a migration to `apps/api/src/db/migrations.ts`. Use a new key that sorts after the last key.
2. Do not change a migration that ran before.
3. Update the table types in `apps/api/src/db/schema.ts`.

## Add an API route

1. Add the route to the chain in `apps/api/src/app.ts`.
2. The web app gets the route types through `AppType`. Use `client` from `apps/web/src/api.ts`.
3. In a TanStack Query `queryFn`, use `unwrap(await client...$get())`. `unwrap` returns the success body. It throws `ApiError` if the response is not OK.

## Add a schema

1. Add the Zod schema to `packages/shared/src`. Export it from `packages/shared/src/index.ts`.
2. Use the schema in a route: `zValidator("json", schema, validationHook)`.
3. You can use the same schema in the web app, for example to check a form.

`packages/shared` has no build step. Vite and `vp pack` bundle its source. Use only TypeScript syntax that Node can strip, and use `.ts` extensions in imports.

## Error format

All API errors have this format:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Invalid request",
    "issues": [{ "path": ["name"], "message": "..." }]
  }
}
```

The codes are `bad_request`, `validation_error`, `not_found` and `internal_error`. `issues` is only in validation errors.
