# Harborfront: Nginx update plan

|                |                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Companion docs | [milestone-6-tasks.md](milestone-6-tasks.md) (task E4), [ops/ansible/README.md](../ops/ansible/README.md), [implementation-roadmap.md](implementation-roadmap.md) |
| Status         | Planned. No task is done. Last updated 2026-11-20                                                                                                |

**Goal.** The VPS `monopoly-1` runs a current, supported Nginx. A vulnerability was found in the Nginx of the Ubuntu 26.04 package (1.28.3). The Ubuntu repositories do not have a newer version. The new Nginx comes from the official `nginx.org` repository. Ansible installs it and keeps it updated. The site `play.evgenii-home-lab.xyz` works the same as before.

**Done when** these steps pass:

1. `nginx -v` on the VPS shows a version that is not affected by the vulnerability.
2. `nginx -t` passes. Nginx listens on ports 80 and 443. `curl -I https://play.evgenii-home-lab.xyz` returns the expected status.
3. A game stream stays open for more than 100 seconds through Nginx.
4. `pnpm app:setup` runs twice and the second run changes nothing.
5. If the Nginx version is too old, `pnpm server:verify` fails.
6. A security update of Nginx installs itself, with no manual step.

## What the incident summary shows

The summary describes a manual repair after a package change. This is what we learned from it.

- The cause is correct. The `nginx.org` package loads `/etc/nginx/conf.d/*.conf`. The Ubuntu package loads `/etc/nginx/sites-enabled/*`. After the package change, Nginx no longer read our site file. It showed only `default.conf` on port 80, so port 443 was closed.
- A symbolic link from `conf.d` to `sites-available` repairs the site, but it is a temporary repair. The directories `sites-available` and `sites-enabled` are an Ubuntu habit. With the `nginx.org` package, they have no purpose.
- A manual repair on the server goes around Ansible. The `nginx` role still writes the file to `sites-available` and links it in `sites-enabled`. The next `pnpm app:setup` keeps that unused link and the server differs from the role. The repair must be in the role.
- The summary does not say that Nginx now runs as the user `nginx`, and not `www-data`. The web root files are readable by all, so the site works. The role must still use the correct user.
- The summary does not say how future security updates arrive. Ubuntu `unattended-upgrades` updates only the Ubuntu security repository by default. Without a change, the `nginx.org` package never updates itself.
- The summary says that the exact version after the update is not confirmed. The versions 1.30.7 and 1.31.9 in the summary are not confirmed either. When you do the task, read the current numbers on `nginx.org`.
- The summary does not say whether the vulnerability is already fixed in a newer Ubuntu package (for example 1.28.3-2ubuntu1.15 or later). Ubuntu often backports a fix without a new upstream version. Find this out before you add a new repository.

## What we can remove or improve

| Item in the summary | Decision |
| ------------------- | -------- |
| Symbolic link `conf.d` to `sites-available` | Remove. The role writes the site file directly to `/etc/nginx/conf.d/<domain>.conf`. No link, no `sites-available`, no `sites-enabled`. |
| Rule "do not change `default.conf`" | Change. The role already removes the Ubuntu default site. It must remove `conf.d/default.conf` in the same way, because it is a second server on port 80. |
| Four steps to find out how the site is included | Not necessary. The cause is known. Read `nginx.conf` once and keep the result in the task. |
| Manual `reload` and `curl` steps | Move into the role and into `verify.yml`. The role already runs `nginx -t` before a reload. |
| Rule "make backups before a change" | Keep. Do it one time, by hand, before the package change (see "Rollout"). Do not add it to the role. |
| Mainline version (1.31.x) | Do not use. The proxy needs no new feature. Use the stable line (1.30.x), which also gets security fixes. |
| Docker image for Nginx | Do not use. M7 removes Nginx, and the certbot role depends on the host Nginx. |

## Decisions

| Topic | Decision |
| ----- | -------- |
| Source | The official `nginx.org` apt repository, stable line. The key goes to `/etc/apt/keyrings/` and the source uses `signed-by`. Follow the pattern of the `docker` role. |
| Priority | An apt pin file gives `nginx.org` a higher priority than the Ubuntu repository. A later `apt upgrade` then never goes back to the Ubuntu package. |
| Minimum version | A variable `nginx_min_version` in `group_vars/all`. The role and `verify.yml` use it. A change of the number is a one-line change. |
| Site file | `/etc/nginx/conf.d/{{ domain }}.conf` from the existing `site.conf.j2`. The template does not change, except for variables that depend on the package. |
| Default server | The role removes `conf.d/default.conf`. Optional, see "Open questions": a catch-all server that closes unknown host names. |
| User | A variable `nginx_user` (`nginx` for the `nginx.org` package). The web root and the placeholder page use it. |
| Auto updates | `unattended-upgrades` in the `base` role accepts the `nginx.org` origin. Read the exact origin from `apt-cache policy nginx` on the VPS. |
| Configuration files | The package change keeps the new `nginx.conf` of `nginx.org` (`--force-confnew`). We do not keep local changes in `nginx.conf`. All site configuration is in the template. |
| Certificates | Not touched. `/etc/letsencrypt` stays as it is. The certbot role and its reload hook do not change. |

## Tasks

Mark a task `[x]` in the commit that completes it. Task names: the name comes first, the code follows in parentheses.

- [ ] **Facts and exposure (N1).** Find the vulnerability identifier. Read the Nginx security advisories page and the Ubuntu security notice. Write down which versions are affected. Write down which module is necessary for an attack. Make sure that our configuration does not use it (we use `ssl`, `http2`, `proxy` and `gzip`). Make sure that Ubuntu does not already have a fixed package. If it does, run `apt upgrade` and stop here. If it does not, write the target version (stable line) and the date in this document. Make sure that `nginx.org` has a package for Ubuntu 26.04 (`resolute`) for amd64. If it does not, write the fallback in "Open questions".
- [ ] **Nginx repository in the role (N2).** In `ops/ansible/roles/nginx/tasks/main.yml`: add the key and the source, the pin file, and the install of the pinned stable version. Add `nginx_min_version` and `nginx_user`. Use `--force-confnew` for the first package change. Add the `nginx.org` origin to `unattended-upgrades` in the `base` role. Test on a test server (hourly billing) first. Make sure that apt shows which Ubuntu Nginx packages it removes (for example `nginx-common`), and that `certbot` is not removed.
- [ ] **Site file in conf.d (N3).** In `vhost.yml`, write the file to `conf.d`. Remove the link in `sites-enabled` and the old file in `sites-available`. Remove `conf.d/default.conf`. Make sure that `nginx -t` runs before the reload, as now. Make sure that a second run of `pnpm app:setup` changes nothing.
- [ ] **Version and port tests (N4).** In `ops/ansible/verify.yml`, add four tests. Make sure that the Nginx version is at least `nginx_min_version`. Make sure that Nginx listens on ports 80 and 443. Make sure that port 80 redirects to HTTPS. Make sure that the `Server` header has no version number. Then run `pnpm server:verify`.
- [ ] **Rollout on the VPS (N5).** Do these steps in this sequence:
  1. Copy `/etc/nginx` and the list of installed packages (`dpkg -l | grep nginx`) to a backup folder in the home of `deploy`.
  2. If the site is down, use the link from the incident summary to bring it back. Note this in the task. N3 replaces the link.
  3. Run `pnpm app:setup`.
  4. Run `pnpm server:verify`.
  5. Open the site in a browser. Open a game stream and keep it idle for more than 100 seconds.
  6. Make sure that `certbot renew --dry-run` passes.
  7. Delete the manual link and the backup folder after one week with no problem.
- [ ] **Documents (N6).** Update the "Reverse proxy" and "TLS" rows in [milestone-6-tasks.md](milestone-6-tasks.md). Update the `nginx` row in `ops/ansible/README.md` and the change log in the roadmap. Add a short "Update Nginx" section to the Ansible README. It says how to change `nginx_min_version` and run `pnpm app:setup`. Mark task E4 in the milestone list as done.

## Order and dependencies

- Facts and exposure (N1) first. If Ubuntu already has a fix, the other tasks are not necessary.
- After N1, the sequence is N2, N3, N4, N5 and N6. Each task needs the task before it.
- N2 and N3 change the same role, so do them one after the other, with one commit for each.

## Open questions

- **Catch-all server.** A server block with `listen 80 default_server` and `listen 443 ssl default_server` that uses `return 444` and `ssl_reject_handshake on` closes all requests with an unknown host name. It stops scans of the IP address from reaching the app. It is a small change. Decide in N3.
- **No package for Ubuntu 26.04.** Suppose that `nginx.org` has no package for `resolute`. The choices are the `noble` (24.04) package, a build from source, or the newest Ubuntu package with a backported fix. Decide in N1.
- **Package name conflicts.** Decide in N2 after the test server run: if apt cannot replace `nginx-common` and `nginx-core` cleanly, remove them first in the role.

## Risks

| Risk | Action |
| ---- | ------ |
| The package change drops the site for a short time | Do it at a quiet time. Use the backup from N5. The role runs `nginx -t` before it reloads. |
| `nginx.org` has no package for Ubuntu 26.04 | N1 finds this out first. See "Open questions". |
| The new `nginx.conf` replaces a local change | We keep no local changes in `nginx.conf`. The backup of `/etc/nginx` has the old file. |
| `nginx.org` packages never update themselves | The `unattended-upgrades` origin in N2, and the version check in N4. |
| A key change or a repository problem breaks `apt update` | The key has a fingerprint check in the role. A failed `apt update` stops the play, and Nginx keeps running. |
| M7 removes Nginx, and this work is then lost | Accepted. The vulnerability must be fixed now. The work is small, and M7 removes the whole role. |

## Critical files

- Changed: `ops/ansible/roles/nginx/tasks/main.yml`, `ops/ansible/roles/nginx/tasks/vhost.yml`, `ops/ansible/roles/nginx/templates/site.conf.j2` if a variable is necessary, `ops/ansible/roles/base/` for the `unattended-upgrades` origin, `ops/ansible/group_vars/all/` and `ops/ansible/verify.yml`
- Not changed: `ops/ansible/roles/certbot/` (the deploy hook uses `systemctl reload nginx`, which works with both packages), `/etc/letsencrypt` on the server
- Docs: `plan/milestone-6-tasks.md`, `ops/ansible/README.md`, `plan/implementation-roadmap.md`
