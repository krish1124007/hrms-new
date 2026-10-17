# Deploy checklist — phase 1 (security and platform hardening)

For the production server `hrms.ddipl.org` (`31.97.221.226`): Ubuntu, nginx, pm2 (process
`backend`, `node dist/index.js`, cwd `/var/www/hrms-new/backend`), MongoDB and Redis on
localhost. The server deploys with `git pull`, so the built output in `backend/dist` and
`frontend/dist` is committed and nothing is built on the server.

**Prerequisite:** the `production-hardening` branch must be merged into the branch the server
tracks (check with `git -C /var/www/hrms-new branch --show-current`, normally `main`) and pushed;
the server's `git pull` only deploys what that branch contains.

> **Read this before you restart anything.** In production the API now **refuses to start**
> (`No mail transport configured (SMTP_HOST or RESEND_API_KEY)…`, exit code 1) unless `.env`
> contains a mail transport, or the explicit opt-out `ALLOW_NO_MAIL=true`. pm2 would then loop
> restarting a process that never comes up, and the site would show 502s. Do section 3 first.

Suggested order: **3 → 4 → 6 → 1 → 2 → 5 → 7 → 9** (8 only on a fresh install). Section 7 includes
SSH hardening; do its last step only after you have proved a key login works. The new API
hands out signed `/api/v1/files/...` links, so `/uploads/` can be switched off in nginx (section 1)
once the new code is running, not before.

Before you start, note the commit you are on, for rollback (section 10):

```bash
cd /var/www/hrms-new && git rev-parse --short HEAD
```

---

## 1. nginx

File: `/etc/nginx/sites-enabled/hrms`. Take a copy **outside** `sites-enabled` first (a backup
left in that folder is loaded as a second site):

```bash
cp /etc/nginx/sites-enabled/hrms /root/hrms.nginx.$(date +%F).bak
```

1. **Stop serving `/uploads/`.** Find where uploads are served:

   ```bash
   sudo nginx -T | grep -n 'uploads'
   ```

   This lists every line mentioning `uploads` across all nginx config files (`sudo grep -Rn uploads
   /etc/nginx/` also shows the file name). The one to replace is the `location /uploads/` block
   that has an `alias` ending in `backend/uploads/`; it is expected in `/etc/nginx/sites-enabled/hrms`.
   Replace the whole block with:

   ```nginx
   location ^~ /uploads/ { return 404; }
   ```

   `^~` makes this prefix match win over any regex `location` (for example a static-file rule like
   `location ~* \.(png|jpg|pdf)$`), which nginx would otherwise try first and could serve
   `/uploads/...` files through.

   If the file also has a **port-80 server block** that serves `/uploads/` itself (a block that
   only redirects to https needs nothing), make the same change there.

   Uploaded files (payslips, documents) are no longer public. The API serves them through
   short-lived signed links at `/api/v1/files/...`.

2. **Add the three security headers** in the `443` server block (the one with `ssl_certificate`):

   ```nginx
   add_header Strict-Transport-Security "max-age=31536000" always;
   add_header X-Frame-Options DENY always;
   add_header X-Content-Type-Options nosniff always;
   ```

   nginx does not inherit `add_header` into a `location` that has its own `add_header` (for
   example a static-asset caching block). Repeat the three lines inside any such location.
   The API sets the same headers itself on `/api/` responses; to avoid duplicates add
   `proxy_hide_header Strict-Transport-Security; proxy_hide_header X-Frame-Options;
   proxy_hide_header X-Content-Type-Options;` inside `location /api/v1/`.

3. **The API location.** Make it a `^~` prefix match, so no regex `location` (a static-file rule
   such as `location ~* \.(png|jpg|pdf)$`) can capture signed file links like
   `/api/v1/files/documents/…/x.pdf` and answer 404 from disk instead of passing them to the API:

   ```nginx
   location ^~ /api/v1/ {
       proxy_pass http://127.0.0.1:4000;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       # …keep the other proxy_set_header / proxy_* lines you already have
   }
   ```

   **Ensure** the `X-Forwarded-For` line is present in that block:

   ```bash
   sudo nginx -T | grep -n X-Forwarded-For
   ```

   It must print `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` inside the
   `/api/v1/` location (a server-level one counts only if that location sets no
   `proxy_set_header` of its own — nginx does not merge them). Without it every request reaches
   the API from nginx's own address, so all users share **one** IP and therefore one set of
   limits: the sign-in rate limit (100 tries per 15 minutes per IP) runs out for everybody at
   once, anyone can trigger the 15-minute lockout of someone else's account by mistyping its
   password five times, and the metrics guard treats every proxied caller as local. The API
   trusts exactly one proxy hop; do not hard-code the header. Keep `proxy_pass http://127.0.0.1:4000;` as is: with `HOST=127.0.0.1` the API
   listens on IPv4 loopback only, so do not change it to `localhost`, which may resolve to `::1`.

4. **Optional:** refuse source maps. Put it before any other regex `location` (the first matching
   regex wins):

   ```nginx
   location ~* \.map$ { return 404; }
   ```

   The frontend build no longer ships `.map` files, so this is belt and braces.

Then:

```bash
nginx -t && systemctl reload nginx
```

## 2. Firewall (ufw)

`ufw` is currently inactive. Confirm SSH really is on port 22 (`ss -tlnp | grep sshd`), or
you will lock yourself out. Then:

```bash
ufw default deny incoming && ufw allow 22,80,443/tcp && ufw enable
ufw status verbose
```

Port 4000 (the API) is deliberately not opened; with `HOST=127.0.0.1` it is also not reachable
from outside even if ufw is off. MongoDB (27017) and Redis (6379) stay closed.

## 3. `.env` additions (`/var/www/hrms-new/backend/.env`)

Do this **before** section 4's restart. Never commit `.env`.

First confirm the server runs in production mode:

```bash
cd /var/www/hrms-new && grep -E '^NODE_ENV=production' backend/.env
```

It must print the line; if it prints nothing, add `NODE_ENV=production` to `backend/.env`. The mail
boot guard, the "no automatic index creation" setting (section 4) and the other production-only
hardening all key off it, so without it the API quietly runs in development mode.

**Required**

| Variable | Value | Why |
| --- | --- | --- |
| mail transport | `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` + `SMTP_FROM` (+ `SMTP_PORT`), **or** `RESEND_API_KEY` | **The API will not start in production without one** (or `ALLOW_NO_MAIL=true`). The server's `.env` currently lacks `SMTP_PASS`. The API sends credentials only when both `SMTP_USER` and `SMTP_PASS` are set, so it would connect unauthenticated and most providers reject that; send errors are logged, not shown to the user, so invitations and resets would just never arrive. |
| `PUBLIC_BASE_URL` | `https://hrms.ddipl.org` | Origin that invite, activation and reset links in e-mails, and signed file links, are built on. |
| `HOST` | `127.0.0.1` | The API binds to loopback only, reachable solely through nginx. (The default is `0.0.0.0`, all interfaces.) |
| `COMPANY_NAME`, `COMPANY_GSTIN`, `COMPANY_STATE_CODE` | your real values | Printed on payslips and invoices. The defaults are placeholders. |

**Optional or conditional**

| Variable | Value | Notes |
| --- | --- | --- |
| `METRICS_TOKEN` | `openssl rand -hex 32` (at least 16 characters) | Only if something scrapes `/api/metrics`. Loopback callers need no token; others must send `X-Metrics-Token`. nginx proxies only `/api/v1/`, so metrics are not public either way. Leave unset if unused. |
| `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` | e.g. `http://127.0.0.1:7700` and a real key | Meilisearch is not running on this server. Set these only after installing it. The defaults point at `localhost:7700` with the key `masterKey`. |
| `BACKUP_SCRATCH_MONGO_URI` | e.g. `mongodb://localhost:27017/hrms_restore_scratch` | Enables "Restore". Must name a **different** database from `MONGODB_URI`, never production. Unset: restore answers 400 `RESTORE_TARGET_NOT_CONFIGURED`. |
| `ALLOW_NO_MAIL` | `true` | Escape hatch only: boots without e-mail, so nobody can receive an invitation or a reset link. Not for normal use. |

**Leave unset:** `ENABLE_API_DOCS` stays unset (or `false`) in production, since the Swagger page
and OpenAPI JSON would be a complete map of the API surface.

Example block:

```dotenv
HOST=127.0.0.1
PUBLIC_BASE_URL=https://hrms.ddipl.org
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=no-reply@ddipl.org
SMTP_PASS=…
SMTP_FROM=no-reply@ddipl.org
COMPANY_NAME=…
COMPANY_GSTIN=…
COMPANY_STATE_CODE=…
# METRICS_TOKEN=…
# MEILISEARCH_HOST=…
# MEILISEARCH_API_KEY=…
# BACKUP_SCRATCH_MONGO_URI=…
```

## 4. Pull, install, seed, index, restart

```bash
cd /var/www/hrms-new && git checkout -- backend/package-lock.json && git pull && cd backend && npm ci --omit=dev
```

Then, still in `backend/`:

```bash
node dist/scripts/seed.js
mongosh hrms --eval 'db.system_settings.createIndex({key:1},{unique:true})'
pm2 restart all
```

- **Seed.** `seed.js` is idempotent. It refreshes the built-in system roles to match the code
  (so new and changed permissions reach the existing database) and strips retired permission names
  from custom roles and from users' `customPermissions`. No route ever checked those names, so
  removing them changes nobody's access. It never touches credentials or a user's role. It prints
  `Roles: N created, N refreshed; retired permissions stripped from N custom role(s) and N user(s)`.
- **Roles — read before assigning Manager.** The seeded **Manager** role sees and approves
  company-wide expenses, overtime and leave (not only its own team's). Assign it only to HR-level
  staff until the manager-chain scoping phase ships. Nobody can approve their own request.
- **Why `node dist/scripts/seed.js` and not `npm run seed`:** `npm run seed` runs through `tsx`, a
  dev dependency, and `npm ci --omit=dev` does not install it (`tsx: command not found`). The
  compiled script does the same thing. If you ran a plain `npm install` instead, `npm run seed` works too.
- **Index.** MongoDB `autoIndex` is off in production, so the app never builds indexes itself. The
  settings store (`system_settings`, used by the monthly-backup switch) needs its unique `key` index
  created once. It is safe to repeat. Use the database name from `MONGODB_URI` if it is not `hrms`.
- Check the log: `pm2 logs backend --lines 30 --nostream` should show
  `API listening on http://127.0.0.1:4000`. If it shows the "No mail transport" line, go back to section 3.
- **`LOG_LEVEL`.** "API listening…" and the `email sent` lines used in section 9 are **info**-level.
  `grep -E '^LOG_LEVEL' backend/.env` must print nothing (the default is `info`) or `LOG_LEVEL=info`.
  With `warn` or `error` those lines are never written, so their absence proves nothing; errors
  (such as `sendMail failed`) are logged at every level.

> **If something fails**
>
> - **A command errors out part-way** (a network drop during `git pull` or `npm ci`): run that
>   same command again. `npm ci` deletes `node_modules` before it reinstalls, so a failed run
>   leaves it empty or half-filled until a run completes; just repeat it.
> - **`pm2 list` shows `errored` (or the restart count keeps climbing):** read
>   `pm2 logs backend --lines 50`. A "No mail transport configured" line means section 3 was
>   skipped: add the mail settings to `.env`, then `pm2 restart all`.
> - **Cannot fix it quickly:** go to section 10 (Rollback) and restore the previous version, then
>   investigate. A broken site costs more than a delayed deploy.

## 5. Log rotation

```bash
pm2 install pm2-logrotate && pm2 flush
```

`pm2-logrotate` caps log size and age. `pm2 flush` empties the existing logs, which hold the
output of the previous, pre-hardening versions.

## 6. Move old backups out of the web root

Older versions wrote database backup tarballs to `backend/uploads/backups/`, which nginx served
publicly at `/uploads/backups/`. Once section 1 is applied they are no longer reachable, but the
files still sit in the upload folder and they contain raw tokens, so get them out. From
`/var/www/hrms-new/backend`, once, after the `git pull` and `npm ci` of section 4 (this is
`npm run backups:relocate`, run as the compiled script for the same `tsx` reason as in section 4):

```bash
node dist/scripts/relocate-backups.js
```

It moves every file in `uploads/backups/` into `BACKUP_DIR` (default `./backups`, outside the upload
folder and never served), points each backup record at the new file, and prints what it moved.
Re-running is harmless. Afterwards `ls backend/uploads/backups/` should be empty.

Treat any backup that was downloadable before this deploy as exposed. Delete the ones you do not
need, and decide whether the tokens they hold warrant rotating `JWT_SECRET` and `JWT_REFRESH_SECRET`
(rotating signs everyone out).

## 7. fail2ban and SSH hardening

```bash
apt install fail2ban && systemctl enable --now fail2ban
fail2ban-client status sshd
```

On Ubuntu the `sshd` jail is on by default.

**System updates.** Install pending security updates:

```bash
apt update && apt upgrade
ls /var/run/reboot-required 2>/dev/null   # printed → a reboot is needed
```

Before rebooting, make sure pm2 comes back by itself: `pm2 save`, then
`systemctl is-enabled pm2-root` must print `enabled` (if not, run `pm2 startup` and the command it
prints). After the reboot re-run the checks in section 9.

**Disable password logins over SSH — only after a key login is proven.** Doing this first would
lock you out.

1. From your own machine, prove a key login works (it must print `key-ok` without asking for a
   password):

   ```bash
   ssh -o PreferredAuthentications=publickey -o PasswordAuthentication=no root@31.97.221.226 echo key-ok
   ```

   If it asks for a password or fails, set up a key first (`ssh-copy-id root@31.97.221.226`) and
   repeat. Do not continue until it prints `key-ok`.

2. On the server, put the settings in their own file. Ubuntu reads `/etc/ssh/sshd_config.d/*.conf`
   first and the **first** value wins (cloud images ship a `50-cloud-init.conf` with
   `PasswordAuthentication yes`), so the file name starts with `00-`:

   ```bash
   printf 'PermitRootLogin prohibit-password\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n' \
     > /etc/ssh/sshd_config.d/00-hardening.conf
   sshd -t && systemctl reload ssh
   sshd -T | grep -Ei '^(permitrootlogin|passwordauthentication)'
   ```

   Expect `permitrootlogin without-password` (the same as `prohibit-password`) and
   `passwordauthentication no`.

3. **Keep your current session open** and, from a second terminal, log in again with the key. Only
   close the first session once the second one works. To undo:
   `rm /etc/ssh/sshd_config.d/00-hardening.conf && systemctl reload ssh`.

## 8. First admin (fresh install only)

Skip this on the existing server. On a brand-new database only:

```bash
cd /var/www/hrms-new/backend
ADMIN_EMAIL=… ADMIN_PASSWORD=… ADMIN_FIRST_NAME=… ADMIN_LAST_NAME=… node dist/scripts/seed-admin.js
```

(`npm run seed:admin` is equivalent where dev dependencies are installed.) There are no default
credentials. Re-running never changes an existing user's password. Do not leave `ADMIN_PASSWORD`
in `.env` or shell history afterwards.

## 9. Verify

From your own machine (not the server):

```bash
# retired self-signup route is gone → 404
curl -s -o /dev/null -w '%{http_code}\n' https://hrms.ddipl.org/api/v1/auth/register
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://hrms.ddipl.org/api/v1/auth/register

# uploads and old backups are no longer public → 404
curl -I https://hrms.ddipl.org/uploads/backups/
curl -s -o /dev/null -w '%{http_code}\n' https://hrms.ddipl.org/uploads/backups/
curl -s -o /dev/null -w '%{http_code}\n' http://hrms.ddipl.org/uploads/backups/   # 301 (redirect to https) or 404

# the API port is not reachable from outside → "refused" (or a timeout once ufw is on)
curl -s -m 5 http://31.97.221.226:4000/ || echo refused

# security headers
curl -I https://hrms.ddipl.org/ | grep -i strict-transport
curl -sI https://hrms.ddipl.org/ | grep -iE 'strict-transport|x-frame-options|x-content-type-options'

# site and API are up → 200
curl -s -o /dev/null -w '%{http_code}\n' https://hrms.ddipl.org/api/v1/health
```

On the server:

```bash
pm2 status                                   # backend: online, restart count not climbing
ss -tlnp | grep ':4000'                      # must show 127.0.0.1:4000, never 0.0.0.0 or *
ufw status verbose                           # Status: active
ls /var/www/hrms-new/backend/uploads/backups # empty (or missing)
```

**Signed file links** (proves nginx passes `/api/v1/files/…` to the API): sign in, open a document
on the Documents page (or a payslip on My Payslips) and let it open or download. In the browser's
developer tools (Network tab) the request to `https://hrms.ddipl.org/api/v1/files/…` must answer
**200**. A 404 means an nginx regex `location` captured it — apply the `^~ /api/v1/` change in
section 1 item 3. A 401 `INVALID_FILE_SIGNATURE` on a link opened within a few minutes points at the
server clock (`timedatectl` should show `System clock synchronized: yes`). Links are meant to expire
after 10 minutes; an old link answering 401 is correct.

**Invite e-mail round trip** (proves the mail transport and `PUBLIC_BASE_URL`): sign in as an
admin, invite a user whose mailbox you control, and confirm the e-mail arrives with a link that starts
with `https://hrms.ddipl.org/accept-invite?token=`. Open it, set a password, sign in. Optionally
repeat with "Forgot password" and a link starting `https://hrms.ddipl.org/reset-password?token=`. If
no mail arrives: `pm2 logs backend --lines 100 --nostream | grep -i mail`, then re-check
`SMTP_*` (most often `SMTP_PASS`).

Also open the Backups page, create a backup and download it. The browser should save it under its
real filename.

**Account audit** (on the server; use the database name from `MONGODB_URI` if it is not `hrms`).

1. Who can administer the system. List the active users holding the admin role, plus anyone given
   the `*` wildcard another way:

   ```bash
   mongosh hrms --quiet --eval '
     const admin = db.roles.findOne({ slug: "admin" })._id;
     db.users.find(
       { role: admin, status: "active", isDeleted: { $ne: true } },
       { email: 1, firstName: 1, lastName: 1, lastLogin: 1 }
     ).forEach(printjson);
     print("-- custom roles with *:");
     db.roles.find({ permissions: "*", slug: { $ne: "admin" } }, { slug: 1, name: 1 }).forEach(printjson);
     print("-- users with * in customPermissions:");
     db.users.find({ customPermissions: "*", isDeleted: { $ne: true } }, { email: 1 }).forEach(printjson);'
   ```

   Every address must be someone you know should be an administrator. To shut out one you do not
   recognise (takes effect on their next request; their tokens stop working):

   ```bash
   mongosh hrms --quiet --eval 'db.users.updateOne(
     { email: "unknown@example.com" },
     { $set: { status: "inactive" }, $inc: { sessionVersion: 1 } })'
   ```

   Then look up how the account came about (`db.auditlogs.find({ entityId: "<user _id>" })`)
   before deleting anything.

2. Invited users who never activated. Older versions mailed invitation links that did not work,
   so some people may still be stuck as `invited`:

   ```bash
   mongosh hrms --quiet --eval 'db.users.find({ status: "invited", isDeleted: { $ne: true } }, { email: 1 }).forEach(printjson)'
   ```

   Tell each of them to open `https://hrms.ddipl.org/forgot-password`, enter their address and set
   a password from the e-mailed link: completing a password reset now activates an invited account.

3. Payslips from before random file names:

   ```bash
   ls /var/www/hrms-new/backend/uploads/payslips 2>/dev/null
   find /var/www/hrms-new/backend/uploads/payslips -name '*.pdf' ! -name '*-????????????.pdf' 2>/dev/null
   ```

   Expected: nothing (the folder does not exist yet). Payslips generated by the new code also land
   there, but as `<employee id>-<12 random characters>.pdf`; the `find` lists only the old,
   guessable `<employee id>.pdf` files and must print nothing. If it lists files, they are no longer
   publicly served, but regenerate them: generating a cycle's payslips again re-creates every one
   under a random name and deletes the old file. On the Payroll page the **Payslips** button does
   this for a processed cycle that has none yet; for any other cycle, signed in as an admin, run
   this in the browser's developer console with the cycle's id:

   ```js
   await fetch('/api/v1/payroll/cycles/<cycle id>/generate-payslips', {
     method: 'POST',
     headers: { Authorization: 'Bearer ' + localStorage.getItem('opencore.accessToken') },
   }).then((r) => r.json())   // → { success: true, data: { generated: N, total: N } }
   ```

   Find the ids with `mongosh hrms --quiet --eval 'db.payrollcycles.find({}, { month: 1, year: 1, status: 1 }).forEach(printjson)'`.
   Afterwards the files named `<employee id>.pdf` are gone (files named `<employee id>-<random>.pdf` are the new ones).

## 10. Rollback

`dist/` is tracked in git, so rolling back the built output is a checkout of the previous commit's
files (use the SHA you noted at the top):

```bash
cd /var/www/hrms-new
git checkout <previous sha> -- backend/dist frontend/dist
cd backend && npm ci --omit=dev      # only if package-lock.json also changed
pm2 restart all
```

Also restore the nginx backup from section 1 (command at the end of this section). The old frontend links to files as
`/uploads/...`; the new nginx answers 404 for those, so uploaded files and images would not load.

**Warning: the rollback leaves the server in a half-changed state.** The files are now staged
changes in git, and the next `git pull` will refuse ("Your local changes … would be overwritten").
Before you pull again (to deploy a fix), undo the rollback first. Plain `git checkout HEAD -- …` is
not enough, because it leaves the old files that the newer version had deleted (the frontend
source maps among them) on disk. Use all three:

```bash
cd /var/www/hrms-new
git reset -q HEAD -- backend/dist frontend/dist
git checkout -- backend/dist frontend/dist
git clean -fdq backend/dist frontend/dist
git status --short                   # should print nothing
```

What a rollback gives back, and what it does not:

- **Data is not rolled back.** The seed's role refresh and permission clean-up stay (harmless: the
  stripped names were never checked), and relocated backups stay in `BACKUP_DIR`.
- **Source maps are public again.** The old frontend ships its `.map` files, and nginx serves them
  from `frontend/dist`. If you restore the nginx backup, keep or re-add the optional
  `location ~* \.map$ { return 404; }` from section 1 until you roll forward.
- **Port 4000 may be open again.** The old API ignores `HOST` and listens on all interfaces. Keep
  `ufw` active (section 2) so the port stays closed.
- **`.env` can stay as is.** The old code does not need the new entries, and extra ones are ignored.

To restore nginx:

```bash
cp /root/hrms.nginx.<date>.bak /etc/nginx/sites-enabled/hrms && nginx -t && systemctl reload nginx
```
