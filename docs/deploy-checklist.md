# Deploy checklist — phase 1 (security and platform hardening)

For the production server `hrms.ddipl.org` (`31.97.221.226`): Ubuntu, nginx, pm2 (process
`backend`, `node dist/index.js`, cwd `/var/www/hrms-new/backend`), MongoDB and Redis on
localhost. The server deploys with `git pull`, so the built output in `backend/dist` and
`frontend/dist` is committed and nothing is built on the server.

> **Read this before you restart anything.** In production the API now **refuses to start**
> (`No mail transport configured (SMTP_HOST or RESEND_API_KEY)…`, exit code 1) unless `.env`
> contains a mail transport, or the explicit opt-out `ALLOW_NO_MAIL=true`. pm2 would then loop
> restarting a process that never comes up, and the site would show 502s. Do section 3 first.

Suggested order: **3 → 4 → 6 → 1 → 2 → 5 → 7 → 9** (8 only on a fresh install). The new API
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

1. **Stop serving `/uploads/`.** Delete the existing block

   ```nginx
   location /uploads/ { alias /var/www/hrms-new/backend/uploads/; }
   ```

   and put this in its place:

   ```nginx
   location /uploads/ { return 404; }
   ```

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

3. **Keep** `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` in `location /api/v1/`.
   The login rate limits, account lockout and the metrics guard all identify the caller from it
   (the API trusts exactly one proxy hop). Do not remove or hard-code it. Keep
   `proxy_pass http://127.0.0.1:4000;` as is: with `HOST=127.0.0.1` the API listens on IPv4
   loopback only, so do not change it to `localhost`, which may resolve to `::1`.

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
- **Why `node dist/scripts/seed.js` and not `npm run seed`:** `npm run seed` runs through `tsx`, a
  dev dependency, and `npm ci --omit=dev` does not install it (`tsx: command not found`). The
  compiled script does the same thing. If you ran a plain `npm install` instead, `npm run seed` works too.
- **Index.** MongoDB `autoIndex` is off in production, so the app never builds indexes itself. The
  settings store (`system_settings`, used by the monthly-backup switch) needs its unique `key` index
  created once. It is safe to repeat. Use the database name from `MONGODB_URI` if it is not `hrms`.
- Check the log: `pm2 logs backend --lines 30 --nostream` should show
  `API listening on http://127.0.0.1:4000`. If it shows the "No mail transport" line, go back to section 3.

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

## 7. fail2ban

```bash
apt install fail2ban && systemctl enable --now fail2ban
fail2ban-client status sshd
```

On Ubuntu the `sshd` jail is on by default.

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

**Invite e-mail round trip** (proves the mail transport and `PUBLIC_BASE_URL`): sign in as an
admin, invite a user whose mailbox you control, and confirm the e-mail arrives with a link that starts
with `https://hrms.ddipl.org/accept-invite?token=`. Open it, set a password, sign in. Optionally
repeat with "Forgot password" and a link starting `https://hrms.ddipl.org/reset-password?token=`. If
no mail arrives: `pm2 logs backend --lines 100 --nostream | grep -i mail`, then re-check
`SMTP_*` (most often `SMTP_PASS`).

Also open the Backups page, create a backup and download it. The browser should save it under its
real filename.

## 10. Rollback

`dist/` is tracked in git, so rolling back the built output is a checkout of the previous commit's
files (use the SHA you noted at the top):

```bash
cd /var/www/hrms-new
git checkout <previous sha> -- backend/dist frontend/dist
cd backend && npm ci --omit=dev      # only if package-lock.json also changed
pm2 restart all
```

This restores the code, not the data. The seed's role refresh and permission clean-up are not
undone (harmless: the stripped names were never checked), and relocated backups stay in `BACKUP_DIR`.
To undo nginx: `cp /root/hrms.nginx.<date>.bak /etc/nginx/sites-enabled/hrms && nginx -t && systemctl reload nginx`.
The old code does not need the new `.env` entries, and extra ones are ignored, so `.env` can stay as is.
