# Harborfront: Milestone 6 tasks (deployment)

|                |                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Companion docs | [implementation-roadmap.md](implementation-roadmap.md) (sections 8, 9 and 11), [milestone-5-tasks.md](milestone-5-tasks.md), [e2e-test-plan.md](e2e-test-plan.md) |
| Status         | Planned. Last updated 2026-11-12 |

**Goal.** The prod image from M5 runs on one Kamatera VPS behind nginx with HTTPS. Friends sign in with Google and play. The API sends telemetry to Grafana Cloud, and alerts go to an email address. A daily backup of the database exists, and one restore was tested.

**Done when** these steps pass:

1. `pnpm deploy:prod` builds, sends and starts a new image. `/api/ready` passes on the VPS. `pnpm deploy:prod --rollback` starts the previous image.
2. `https://play.<domain>` opens the web app. Google sign-in works. A game streams through nginx, also after more than 100 seconds with no action.
3. After a reboot of the VPS, the app starts again with no manual step.
4. The daily backup runs. One backup was restored on the VPS. The pull script copied the backups to the local machine.
5. Grafana Cloud shows the Harborfront dashboard, the logs and the traces. One test alert arrived by email.
6. `pnpm check`, `pnpm test` and `pnpm e2e` stay green.

## Scope rules

- In M6:
  - The VPS setup, the production compose file and settings, and the deploy and rollback script.
  - The daily backup and the restore.
  - The telemetry export to Grafana Cloud, the dashboard import and the alerts.
  - The domain, nginx with Let's Encrypt, and Google sign-in in production.
- Not in M6:
  - The Cloudflare proxy, Cloudflare Tunnel, Cloudflare Access and the Access JWT check (M7). M7 removes nginx and certbot and closes ports 80 and 443.
  - Offsite backup storage (Cloudflare R2 or Backblaze B2 with rclone). It is in "Later".
  - CI. It is in "Later" in the roadmap.
  - A second instance, a container registry, or a hosted database.
  - Host metrics from node_exporter or Grafana Alloy (see "Decisions").
- No engine change. The only API code change is the disk free metric (D2).
- The VPS runs the same prod image as `pnpm e2e:docker`. Only the environment variables are different.
- Never commit `.env` files, the production settings file, SSH keys, Grafana tokens, SQLite databases, backups or test reports.
- Each task: small, own commit (Conventional Commits), `pnpm check` and `pnpm test` green.
- Read the current docs (context7 or the vendor site) before you write a setting. This applies to the Docker install, nginx, certbot and the Grafana Cloud OTLP settings.
- Task names: the name comes first, the task code follows in parentheses.

## Decisions

| Topic | Decision |
| --- | --- |
| Host | One Kamatera VPS: 1 vCPU, 1 GB RAM, 10 GB disk, Ubuntu 26.04. One API process |
| Provisioning | One idempotent shell script, `ops/prod/provision.sh`. You run it as root over SSH once, and again after a change. No Ansible and no cloud-init |
| Server base | The user `deploy` in the `docker` group. SSH with keys only: no root sign-in and no passwords. ufw allows only 22, 80 and 443. unattended-upgrades on. A 2 GB swap file with swappiness 10. A journald limit of 200 MB |
| Docker | Docker Engine and the compose plugin from the Docker apt repository. If that repository does not support Ubuntu 26.04, use the Ubuntu packages `docker.io` and `docker-compose-v2` |
| Reverse proxy | nginx and certbot from the Ubuntu packages, on the host and not in a container. The site file is in the repository: `ops/prod/nginx/harborfront.conf`. M7 removes both |
| App port | The container publishes `127.0.0.1:8787` only. Docker-published ports go around ufw. The origin check in `apps/api/src/auth/middleware.ts` trusts `X-Forwarded-Host` and `X-Forwarded-Proto`, so nginx must be the only path to the app. nginx sets these headers itself and does not pass the client values |
| SSE through nginx | `proxy_http_version 1.1`, `proxy_buffering off`, `proxy_read_timeout 1h` and an empty `Connection` header. The API already sends `X-Accel-Buffering: no` |
| Prod compose | `ops/prod/compose.yaml`: `image: harborfront:${TAG}`, no `build` and no `otel-lgtm`. `restart: unless-stopped`, the health check of the image, `stop_grace_period: 10s`, the `json-file` log limits from `compose.yaml`, and `mem_limit: 600m`. The database is in the host folder `/srv/harborfront/data`, mounted at `/data` |
| Prod settings | `/srv/harborfront/app.env`, mode 600, owner `deploy`. The template is `ops/prod/app.env.example`. `NODE_ENV=production`, `GUEST_SIGN_IN_ENABLED=false`, `DEBUG_MODE_ENABLED=false`, and `NODE_OPTIONS=--max-old-space-size=384`. `GAME_SEED` and `PRESENCE_GRACE_MS` are not set |
| Deploy | `scripts/deploy.sh`, started by `pnpm deploy:prod`. The host is `DEPLOY_HOST`, an SSH alias. The git tree must be clean. The script reads the platform with `ssh … uname -m`. It builds with `docker buildx build --load`, and the tag is the short git SHA. It sends the image with `docker save | gzip | ssh … docker load` and copies `ops/prod/` to `/srv/harborfront`. Then it makes a backup, runs `docker compose up -d` and waits for `/api/ready` on `127.0.0.1:8787`. Keep the current and the previous image and remove older images. `--rollback` starts the previous tag |
| Before a deploy | Run `pnpm ready` and `pnpm e2e` on the local machine. There is no CI |
| Backup | `ops/prod/backup.sh` on the host uses the `sqlite3` CLI: `.backup` (safe with WAL), then `PRAGMA integrity_check`, then gzip. It keeps 7 daily copies in `/srv/harborfront/backups`. A systemd timer runs it at 04:00. The deploy also runs it |
| Backup copy | `scripts/pull-backups.sh` copies the backups with `rsync` to `backups/` on the local machine. `backups/` is in `.gitignore`. Offsite storage is in "Later" |
| Telemetry | The Node SDK sends OTLP directly to the Grafana Cloud OTLP gateway. No collector and no Alloy on the VPS, because of the RAM. The endpoint and `OTEL_EXPORTER_OTLP_HEADERS` come from the current Grafana Cloud docs. `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production`. Trace sampling is 1.0 at the start. If the use comes near the free tier limit, make it lower |
| Host metrics | No node_exporter, because of the RAM. The API adds a disk free gauge for the database folder (`fs.statfs`). The process memory metric already exists. The host memory is not monitored |
| Dashboard | The M5 dashboard gets a datasource variable. The same file then works on the local stack and on Grafana Cloud |
| Alerts | Grafana Cloud alert rules with an email contact point. Rule 1: no API metrics for 5 minutes ("no data" is an alert). Rule 2: a 5xx rate. Rule 3: the event loop delay p99. Rule 4: process memory over 450 MB. Rule 5: disk free under 1.5 GB |
| Domain | Bought at a registrar that is not Cloudflare. Move the name servers to the Cloudflare free plan at once, with "DNS only" records, so M7 needs no DNS move. An `A` record for `play.<domain>` |
| TLS | certbot with the nginx plugin. HTTP redirects to HTTPS. The certbot timer renews the certificate, and a deploy hook reloads nginx |
| Before the domain | The domain tasks are last. Open the app through an SSH tunnel (`ssh -L 8787:127.0.0.1:8787`) on `http://localhost:8787`. Browsers accept a `Secure` cookie on `localhost`, and Google accepts a `localhost` redirect address. So you can check Google sign-in before the domain exists |

## Tasks

Mark a task `[x]` in the commit that completes it.

### A. Docs

- [x] **Milestone 6 docs (A1).** This list. The roadmap: the status line, the M6 row, sections 8, 9 and 11, and the change log. The glossary, the README and AGENTS.md. When B1 creates `ops/prod`, add it to the AGENTS.md project map.

### B. Server

- [ ] **Provision script (B1).** `ops/prod/provision.sh`, idempotent, run as root. It makes the `deploy` user with your public key and turns off root and password sign-in. It sets ufw (22, 80, 443), unattended-upgrades, the swap file, the journald limit and the UTC time zone. It installs Docker, the compose plugin, `sqlite3`, `rsync`, nginx and certbot. It makes `/srv/harborfront/{data,backups}` with the owner `deploy` and UID 1000 on `data` (the `node` user of the image). Document the Kamatera server creation and the SSH alias in `plan/runbook-production.md`.
- [ ] **Production compose and settings (B2).** `ops/prod/compose.yaml` and `ops/prod/app.env.example`, as in "Decisions". If `app.env` is missing, the app does not start. Start it once by hand with a tag that you loaded by hand.
- [ ] **Deploy script (B3).** `scripts/deploy.sh` and `pnpm deploy:prod`, as in "Decisions". The script stops at the first error and shows the step that failed. `--rollback` starts the previous tag and checks `/api/ready`. Write the deploy and rollback steps in the runbook.
- [ ] **Production settings check (B4).** On the VPS, through the SSH tunnel, make sure of these results. Guest sign-in and the debug routes are refused. The session cookie is `Secure` and `HttpOnly`. The start log shows the production settings and no secrets. A start with `DEBUG_MODE_ENABLED=true` fails. This closes the M5 risk "M6 checks the production settings on the droplet".

### C. Backups

- [ ] **Backup script and timer (C1).** `ops/prod/backup.sh`, `ops/prod/harborfront-backup.service` and `ops/prod/harborfront-backup.timer`. The provision script installs the units. A failed integrity check keeps the old copies and exits with an error.
- [ ] **Pull script (C2).** `scripts/pull-backups.sh` and `pnpm backups:pull`. It copies the backups to `backups/` on the local machine and shows the date of the newest copy.
- [ ] **Restore drill (C3).** The restore steps in the runbook: stop the app, keep the current file, unpack a backup into `data`, start, and check `/api/ready`. Do one restore on the VPS and play one turn of a restored game.

### D. Telemetry

- [ ] **Grafana Cloud export (D1).** Make a Grafana Cloud stack and an access token with write access for metrics, logs and traces. Put the OTLP settings in `app.env`, and the names without values in `app.env.example`. Make sure that the metrics, the logs and the traces arrive.
- [ ] **Disk free metric (D2).** An observable gauge for the free bytes of the database folder, from `fs.statfs`, in `apps/api/src/metrics.ts`. Read it with the in-memory metric reader in the test.
- [ ] **Dashboard import (D3).** A datasource variable in `ops/grafana/dashboards/harborfront.json`. Make sure that the local stack still loads it. Import it into Grafana Cloud. Add a disk free panel.
- [ ] **Alerts (D4).** The alert rules in "Decisions" and the email contact point. Write the rules and their limits in the runbook. Send one test alert, and stop the app once to see the "no data" alert.

### E. Domain and HTTPS

After you buy the domain, do these tasks.

- [ ] **Domain and DNS (E1).** Buy the domain. Move the name servers to the Cloudflare free plan. Add the `A` record for `play.<domain>` with "DNS only". Write the domain in the runbook.
- [ ] **nginx site and certbot (E2).** `ops/prod/nginx/harborfront.conf` with the proxy and SSE settings in "Decisions". The deploy script copies it and reloads nginx after `nginx -t`. Get the certificate with certbot and make sure that `certbot renew --dry-run` passes.
- [ ] **Google sign-in in production (E3).** Add `https://play.<domain>/api/auth/google/callback` to the Google OAuth client and set `GOOGLE_REDIRECT_URI` in `app.env`. Add the players as test users on the consent screen. Sign in on two devices.

### F. Close

- [ ] **Manual run (F1).** Play a short game with two remote players and one hot-seat seat. Keep a stream idle for more than 100 seconds. Reboot the VPS during a game, and make sure that the game continues. Do one deploy and one rollback. Look at the dashboard, the logs, the traces and the alerts. Fix the defects that you find.
- [ ] **Milestone 6 close (F2).** Roadmap status and change log. "As built" notes in the roadmap section 9. Write the M7 task list.

## Setup

- A Kamatera account and the VPS. An SSH key on the local machine, and an SSH alias for the VPS (`DEPLOY_HOST`).
- Docker with `buildx` on the local machine. The local machine is arm64 and the VPS is probably amd64, so the image build uses emulation and is slow.
- A Grafana Cloud account (free tier).
- For E: the domain, a Cloudflare account (free plan), and the Google OAuth client from M4.

## Order and dependencies

- Docs (A1) → Provision script (B1) → Production compose and settings (B2) → Deploy script (B3) → Production settings check (B4).
- Backup script and timer (C1) after B2. Pull script (C2) and Restore drill (C3) after C1.
- Grafana Cloud export (D1) after B2. Disk free metric (D2) at any time. Dashboard import (D3) after D1. Alerts (D4) after D2 and D3.
- After the purchase of the domain: Domain and DNS (E1). nginx site and certbot (E2) after E1 and B3. Google sign-in in production (E3) after E2.
- Close (F) is last.

## Open questions

- **CPU architecture of the VPS.** The deploy script reads it, so no decision is necessary now.
- **Kamatera snapshots.** A paid snapshot before a large change is possible. Decide in B1, after you read the Kamatera prices.
- **Trace sampling.** 1.0 at the start. Decide the final ratio in F1 from the Grafana Cloud use page.

## Risks

| Risk | Action |
| --- | --- |
| 1 GB RAM: `docker load` and Node at the same time can start the OOM killer | Swap file, `mem_limit`, the Node heap limit, and no collector on the VPS |
| 10 GB disk: images, logs and backups fill it | Keep 2 images, log limits, the journald limit, 7 backups, and the disk free alert |
| A rollback after a migration: the old code meets a new schema | The deploy makes a backup first. The runbook restores that backup with the old image |
| The `docker` group is equal to root | Accepted: one `deploy` user with a key, and no password sign-in |
| Before M7 the HTTPS port is open to all, and Access does not protect it | Short M6 period. Google sign-in and the test users on the consent screen limit who plays |
| Ubuntu 26.04 is new, and a package can be missing (for example the Docker apt repository) | The fallback packages in B1 |
| The local copies are only as new as the last pull | Pull after each play evening. Offsite storage is in "Later" |
| A client can send its own `X-Forwarded-Host` and go around the origin check | nginx sets the forwarded headers itself, and the app port is on `127.0.0.1` only |
| The image build for amd64 on an arm64 machine is slow | Accepted. The build cache of `buildx` makes the next builds shorter |

## Critical files

- New: `ops/prod/provision.sh`, `ops/prod/compose.yaml`, `ops/prod/app.env.example`, `ops/prod/nginx/harborfront.conf`, `ops/prod/backup.sh`, `ops/prod/harborfront-backup.service`, `ops/prod/harborfront-backup.timer`, `scripts/deploy.sh`, `scripts/pull-backups.sh`, `plan/runbook-production.md`
- Changed: root `package.json`, `.gitignore`, `apps/api/src/metrics.ts` and its test, `ops/grafana/dashboards/harborfront.json`
- Reused: `Dockerfile` (the `prod` target and the health check), `compose.yaml` (the `x-logging` limits), `apps/api/src/otel.ts` (the telemetry switch), `apps/api/src/shutdown.ts`
