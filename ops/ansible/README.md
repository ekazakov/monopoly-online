# Harborfront server setup and deploy (Ansible)

This folder sets up the production VPS, deploys the prod image and checks the production settings. It is section B of the [milestone 6 tasks](../../plan/milestone-6-tasks.md). Ansible runs on your Mac and connects to the server over SSH. Nothing is installed on the server for Ansible except Python, which Ubuntu has.

| File                          | Purpose                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `site.yml`                    | Server setup: packages, user, swap, firewall, Docker, app folder, nginx and certbot (only with a domain), SSH hardening |
| `deploy.yml`                  | Build the image on the Mac, send it, make a backup, start it, and roll back                                             |
| `verify.yml`                  | Check the production settings of the running app. It changes nothing                                                    |
| `group_vars/all/defaults.yml` | Public default values                                                                                                   |
| `group_vars/all/local.yml`    | Your private values: IP, Google client secret, Grafana token. Not in git                                                |
| `inventory.ini`               | The server alias. Not in git                                                                                            |

## Roles

| Role       | What it does                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`     | apt upgrade, unattended-upgrades, the `deploy` user with sudo and your SSH key, `sqlite3`, `rsync`, UTC time zone, journald limit, swap file |
| `firewall` | ufw: allow 22, 80 and 443, deny other incoming traffic                                                                                       |
| `docker`   | Docker Engine and the compose plugin, container log limits, `deploy` in the `docker` group                                                   |
| `app`      | `/srv/harborfront` with `compose.yaml`, `app.env` (mode 0600), `data/`, `backups/` and `images/`                                             |
| `nginx`    | The reverse proxy to `127.0.0.1:8787`, with the SSE settings. It runs only with a `domain` value                                             |
| `certbot`  | The Let's Encrypt certificate and its renewal. It runs only with a `domain` value                                                            |
| `ssh`      | Closes root sign-in and password sign-in, after it makes sure that `deploy` can sign in                                                      |

## Setup on the Mac

1. Install the tools: `brew install ansible ansible-lint`.
2. Install the collections from this folder: `ansible-galaxy collection install -r requirements.yml -p ~/.ansible/collections`.
3. Copy `inventory.ini.example` to `inventory.ini`, and `group_vars/all/local.yml.example` to `group_vars/all/local.yml`. Fill in your values.
4. Add an alias to `~/.ssh/config`:

   ```
   Host harborfront
     HostName 203.0.113.10
     User deploy
     IdentityFile ~/.ssh/id_ed25519
   ```

5. Make a Google OAuth client (type "Web application"). Add the redirect address `http://localhost:8787/api/auth/google/callback`. The API does not start in production without the Google values. After you buy the domain, add `https://<domain>/api/auth/google/callback` (task E3).

## First run

Create the Kamatera server with your SSH key for root. Then run from the repository root:

```bash
ssh root@203.0.113.10 true
```

```bash
pnpm server:setup -u root
```

The first command adds the host key to `~/.ssh/known_hosts`. The second command runs as root, because the `deploy` user does not exist yet. The last role closes root sign-in. Run all later commands without `-u root`:

```bash
pnpm server:setup
```

After the first run, you can see the changes of a run before you make them: `pnpm server:setup --check --diff`. Do not use `--check` for the first run. Check mode cannot install Docker from a repository that it did not add yet.

If you cannot sign in after a run, use the server console in the Kamatera panel. Sign in as root with the password, and delete `/etc/ssh/sshd_config.d/10-harborfront.conf`.

## Deploy

Commit your changes first. Then run:

```bash
pnpm deploy:prod
```

The playbook does these steps:

1. If the git tree has changes that are not committed, it stops.
2. It runs `pnpm ready` on the Mac.
3. It builds the image for the CPU of the server. The tag is the short commit id. The Mac is arm64 and the server is amd64, so the first build is slow.
4. It sends the image to the server and loads it. If the server already has the tag, it skips this step.
5. It makes a backup of the database to `backups/pre-deploy-*.db` and checks it.
6. It starts the new image and waits for `/api/ready`.
7. If the start fails, it starts the old image again. If the new image changed the database schema, it first puts the backup back.
8. It keeps the current and the previous image and removes older images. It keeps the last 3 pre-deploy backups.

Options: `-e skip_checks=true` skips `pnpm ready`. `-e allow_dirty=true` deploys changes that are not committed, with a `-dirty-<time>` tag.

A deploy restarts the container. Open games lose the stream for a few seconds, and the browsers connect again. Do a deploy at a time with no games.

## Rollback

```bash
pnpm deploy:rollback
```

This starts the previous image again. If the database has newer migrations than the previous image knows, the rollback stops. Then restore the pre-deploy backup (see "Restore"), or add `-e rollback_force=true`.

## Settings check

```bash
pnpm server:verify
```

It makes sure of these results:

- Only Google sign-in is on, and guest sign-in is refused.
- The cookies are `Secure` and `HttpOnly`.
- The start log shows the production settings and no secrets.
- The image refuses to start with debug mode on.

## Real certificate

With `certbot_staging: true` in `local.yml`, the certificate is a test certificate, and browsers do not trust it. Use it to test the setup, because the staging server has no rate limits. To get a real certificate, run:

```bash
pnpm server:cert
```

The command sets `certbot_staging=false` and `certbot_force=true` for this run only. Then set `certbot_staging: false` in `local.yml`, so that later runs of `pnpm server:setup` keep the real certificate.

## Open the app before the domain exists

The app listens only on `127.0.0.1:8787` of the server. Open an SSH tunnel:

```bash
ssh -N -L 8787:127.0.0.1:8787 harborfront
```

Then open `http://localhost:8787` in Chrome or Firefox. These browsers keep a `Secure` cookie on `localhost`. Safari does not.

## Restore

To put a pre-deploy backup back, run these commands on the server as `deploy`:

```bash
cd /srv/harborfront && docker compose stop app
```

```bash
sudo cp data/monopoly.db data/monopoly.db.before-restore && sudo rm -f data/monopoly.db-wal data/monopoly.db-shm
```

```bash
sudo cp backups/pre-deploy-<time>-<tag>.db data/monopoly.db && sudo chown 1000:1000 data/monopoly.db
```

```bash
docker compose up -d --wait
```

Delete the `-wal` and `-shm` files before the copy. They belong to the old file, and SQLite applies them to the restored file. If the backup came from an older image, write its tag to `.env` (`HARBORFRONT_TAG=<tag>`) before the start.

## Checks of this folder

Run these commands in this folder:

```bash
ansible-playbook site.yml deploy.yml verify.yml --syntax-check
```

```bash
ansible-lint site.yml deploy.yml verify.yml
```

If the linter prints `couldn't resolve module/action`, a collection is missing. Run the `ansible-galaxy` command again.
