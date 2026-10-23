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

**Phase 2** (attendance, leave, payroll and approval rules) has its own section at the end of this
file: [Phase 2 — HR logic](#phase-2--hr-logic-attendance-leave-payroll-approvals). On a server that
already runs Phase 1, do only that section.

**Phases 3–6** (web UX, field sales and maps, mobile app, hygiene) follow it:
[Phases 3–6](#phases-36--web-ux-field-sales--maps-mobile-hygiene). On a server that already runs
Phase 2, do only that section.

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
- **Roles — read before assigning Manager.** The seeded **Manager** role approves leave, expenses,
  overtime and attendance regularizations only for the manager's **direct reports**: employees whose
  *Reporting manager* is that manager's own employee record. A manager with no reports set sees an
  empty queue. HR Manager and HR Executive decide everybody's requests (`leaves.approve_all`,
  `expenses.approve_all`, `overtime.approve_all`, `attendance.manage`). A custom role with only a plain
  `*.approve` permission is limited to direct reports as well; for an HR-like custom role tick the
  matching `*.approve_all` in Settings → Roles & Permissions (Phase 2 section, step E.3). Nobody can
  approve their own request.
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

---

## Phase 2 — HR logic (attendance, leave, payroll, approvals)

For deploying the `phase2-hr-logic` work on the same server, once sections 1–10 are in place (in
particular the mail transport of section 3). Paths and the `mongosh hrms` database name are as above;
use the name from `MONGODB_URI` if it is not `hrms`.

What changes: a nightly job closes each business day (no-shows become absent, approved leave is
written, forgotten check-outs are closed, scheduled exits are applied); leave years open with
carry-forward; payroll cycles go draft → processed → locked → paid, with PF, ESI and Professional
Tax by the rules; managers approve only for their direct reports.

**Prerequisite:** `phase2-hr-logic` is merged into the branch the server tracks and pushed. Note the
commit you are on, for rollback (step H):

```bash
cd /var/www/hrms-new && git rev-parse --short HEAD
```

Order: **A → B → C → D → E**, then tell HR what changed (F) and verify (G), today and again the next
working morning.

### A. Before you deploy: data checks

Run these on the server before the `git pull`. They only read, except where a fix is shown.

1. **Active employees whose exit date has passed.** The nightly job now applies an exit once its date
   has come: the employee becomes `resigned` (or the status recorded with the exit) and **their login is
   disabled**. An old record left `active` with a past exit date is therefore exited by the very first
   run. List them:

   ```bash
   mongosh hrms --quiet --eval '
     db.employees.find(
       { status: { $in: ["active", "onNotice"] }, exitDate: { $lte: new Date() }, isDeleted: { $ne: true } },
       { employeeId: 1, firstName: 1, lastName: 1, status: 1, exitDate: 1 }
     ).forEach(printjson)'
   ```

   For each person listed:
   - **has left:** nothing to do; the first nightly run marks them `resigned`. For another status
     (terminated), set it on their employee page after the deploy.
   - **still works here:** clear the date before the deploy (or `$set` it to the real last working day):

     ```bash
     mongosh hrms --quiet --eval 'db.employees.updateOne({ employeeId: "EMP0123" }, { $unset: { exitDate: "" } })'
     ```

2. **Duplicate holidays.** Step D adds a unique index on date + name, which cannot be built while
   duplicates exist:

   ```bash
   mongosh hrms --quiet --eval '
     db.holidays.aggregate([
       { $match: { isDeleted: false } },
       { $group: { _id: { date: "$date", name: "$name" }, n: { $sum: 1 }, ids: { $push: "$_id" } } },
       { $match: { n: { $gt: 1 } } }
     ]).forEach(printjson)'
   ```

   It must print nothing. If it lists groups, delete the extra copies on the Holidays page (keep one of
   each), or by id, then run the check again:

   ```bash
   mongosh hrms --quiet --eval 'db.holidays.updateOne({ _id: ObjectId("…") }, { $set: { isDeleted: true, deletedAt: new Date() } })'
   ```

   Only live holidays (`isDeleted: false`) count, because the index covers only those: a holiday deleted
   by mistake can be added again.

3. **Face check-in.** The `face` method is no longer accepted. See whether it is switched on:

   ```bash
   mongosh hrms --quiet --eval 'printjson(db.attendanceconfigs.findOne({}, { enabledMethods: 1 }))'
   ```

   If `enabledMethods` contains `"face"`, fix it in step E.5.

4. **Payroll cycles.** Note which months are already paid (rule in step E.2) and which are still
   `processed` (step E.4):

   ```bash
   mongosh hrms --quiet --eval 'db.payrollcycles.find({}, { month: 1, year: 1, status: 1 }).sort({ year: -1, month: -1 }).limit(12).forEach(printjson)'
   ```

   Employees now see payslips only for `locked` and `paid` cycles, so a `processed` cycle drops out of
   My Payslips until HR locks it.

5. **Leave types and probation.** Each leave type's *Allowed during probation* setting is now
   enforced (before, it was stored but never checked). Probation lasts until `probationEndDate`, else
   `confirmationDate`, else 6 months after joining. A type without the setting — and every new type —
   **allows** leave during probation; unpaid types (Leave Without Pay and the like) are always open to
   probationers. Existing types may carry a stored `false` that nobody chose (the old default), which
   would now refuse everyone who joined in the last 6 months. List the types:

   ```bash
   mongosh hrms --quiet --eval 'db.leavetypes.find({ isActive: { $ne: false } }, { name: 1, code: 1, paidLeave: 1, probationAllowed: 1 }).forEach(printjson)'
   ```

   So that existing types keep today's behaviour (open to everyone), open them all once:

   ```bash
   mongosh hrms --quiet --eval 'printjson(db.leavetypes.updateMany({ probationAllowed: { $ne: true } }, { $set: { probationAllowed: true } }))'
   ```

   Then ask HR which types must **not** be available during probation; untick them in step E.6.

6. **Reporting managers.** Managers will see only the requests of employees whose *Reporting manager*
   is set to them:

   ```bash
   mongosh hrms --quiet --eval 'print(db.employees.countDocuments({ status: { $in: ["active", "onNotice"] }, reportingManager: { $ne: null } }), "of", db.employees.countDocuments({ status: { $in: ["active", "onNotice"] } }), "active employees have a reporting manager")'
   ```

   Employees without one can still be approved by HR; set the field on the employee page where a
   manager should do it.

### B. `.env` additions (`/var/www/hrms-new/backend/.env`)

| Variable | Value | Why |
| --- | --- | --- |
| `COMPANY_STATE_CODE` | the company's state: `GJ`, `MH`, … | Already printed on invoices (section 3). Now also the Professional Tax state of every employee with no state on file. **Must be set:** unset, it falls back to `MH`, so Maharashtra slabs (₹300 in February) apply. |
| `TIMEZONE` | `Asia/Kolkata` | The business day for attendance, leave and payroll (`backend/src/lib/business-day.ts`) and the clock both nightly jobs run on. It already defaults to this; pin it so nobody changes it by accident. |
| `PF_WAGE_CEILING`, `PF_RATE_PERCENT` | `15000`, `12` | Optional; these are the defaults. PF is the rate on the **earned** basic + DA, up to the ceiling. |
| `ESI_WAGE_CEILING`, `ESI_EMPLOYEE_PERCENT`, `ESI_EMPLOYER_PERCENT` | `21000`, `0.75`, `3.25` | Optional; these are the defaults. ESI applies while the full-month gross is within the ceiling, decided once per April–September / October–March period. |

```dotenv
COMPANY_STATE_CODE=GJ
TIMEZONE=Asia/Kolkata
# only to change the statutory defaults:
# PF_WAGE_CEILING=15000
# PF_RATE_PERCENT=12
# ESI_WAGE_CEILING=21000
# ESI_EMPLOYEE_PERCENT=0.75
# ESI_EMPLOYER_PERCENT=3.25
```

Check: `grep -E '^(COMPANY_STATE_CODE|TIMEZONE)=' backend/.env` must print both lines.

**`TZ=Asia/Kolkata` goes on the pm2 process (step C), not only in `.env`.** It sets the clock of the
whole process, so dates the API formats (e-mails, logs, reports) match the business day. `.env` is read
by the app after it has started; the pm2 environment is there from the first line.

**Professional Tax** tables are in `backend/src/config/professional-tax.ts`: MH, GJ, KA, TN, WB, AP, TS.
An employee pays the tax of the state their work location names, else of their current address's state,
else `COMPANY_STATE_CODE`; a state without a table pays none. Tamil Nadu's half-yearly tax is entered
as monthly ₹208 and ₹171 (exactly 208.33 and 171.25), so a TN employee pays a rupee or two less per
half-year; change that file if exact amounts matter.

### C. Pull, install, seed, restart

As section 4, but the seed matters this time and the restart sets `TZ`:

```bash
cd /var/www/hrms-new && git checkout -- backend/package-lock.json && git pull && cd backend && npm ci --omit=dev
node dist/scripts/seed.js
```

Now do step D (indexes), then restart:

```bash
cd /var/www/hrms-new/backend
TZ=Asia/Kolkata pm2 restart backend --update-env
pm2 save
tr '\0' '\n' < /proc/$(pm2 pid backend)/environ | grep '^TZ='   # TZ=Asia/Kolkata
```

- **Seed.** Refreshes the system roles: HR Manager and HR Executive gain `leaves.approve_all`,
  `expenses.approve_all` and `overtime.approve_all`; Manager gains `attendance.approve`. Expect
  `Roles: 0 created, N refreshed; …`. Custom roles are not touched (see step E.3).
- **Why `--update-env`:** without it pm2 restarts with the environment it saved last time and ignores
  `TZ`. `pm2 save` keeps it across a reboot.
- **Redis is now required.** The two nightly jobs are BullMQ jobs kept in Redis (on localhost, section 2).
  They register themselves at every start; there is nothing to schedule by hand:
  - `attendance-day-close`, every day at 23:59 IST: marks working-day no-shows `absent`, writes the
    days of approved leave, closes forgotten check-outs (night shifts the next day), then applies the
    exits whose date has come;
  - `leave-year-open`, 00:30 IST on 1 January: opens the new leave year with carry-forward.

  Both are safe to run twice. Check the log:

  ```bash
  pm2 logs backend --lines 80 --nostream | grep -E 'API listening|Attendance worker started|schedule registered'
  ```

  Expect `Attendance worker started`, `attendance day-close schedule registered` and
  `leave-year-open schedule registered`. `Could not register the attendance day-close schedule` means
  Redis is unreachable: fix Redis, then `pm2 restart backend`. To list the schedules in Redis:

  ```bash
  cd /var/www/hrms-new/backend && node --env-file=.env -e "import('bullmq').then(async ({ Queue }) => { const q = new Queue('attendance', { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } }); for (const j of await q.getRepeatableJobs()) console.log(j.name, j.pattern, j.tz, new Date(j.next).toISOString()); await q.close(); })"
  ```

  It prints the two jobs; the next run is shown in UTC (18:29 UTC is 23:59 IST).

### D. Indexes

`autoIndex` is off in production, so create these by hand, the first only after check A.2 printed
nothing. All three are safe to repeat.

```bash
mongosh hrms --eval 'db.holidays.createIndex({ date: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } })'
mongosh hrms --eval 'db.attendances.createIndex({ leaveRequestId: 1 }, { sparse: true })'
mongosh hrms --eval 'db.attendances.createIndex({ "regularization.status": 1, date: -1 }, { partialFilterExpression: { "regularization.status": "pending" } })'
```

- **Holidays:** one live holiday per date and name, so the yearly rollover and the calendar import
  cannot add a holiday twice. The options match the model exactly. A `DuplicateKey` error means A.2 was
  not empty.
- **`leaveRequestId`:** cancelling a leave, or an exit, finds that leave's attendance rows by it.
- **Pending regularizations:** speeds up the Attendance → Regularizations queue.

`npm run db:audit-indexes` (`backend/scripts/db-indexes.ts`, read-only) reports duplicate and overlapping
indexes. It runs through `tsx`, so only where dev dependencies are installed:
`MONGODB_URI=… npm run db:audit-indexes`.

### E. Once, after the deploy

1. **Open the leave year.** Leaves → Balances → **Open 2026** (it calls
   `POST /api/v1/leaves/balances/open-year { "year": 2026 }`). Every active employee, and those on
   notice, gets a 2026 balance for each active paid leave type (pro-rated for joiners during the year),
   and unused 2025 days carry forward up to each type's limit. Balances that already exist are left
   exactly as they are, so a second run only fills gaps; still, run it once. From 1 January 2027 the
   `leave-year-open` job does this.

2. **Do not backfill `close-days` over months already paid.** `POST /api/v1/attendance/close-days
   { from, to }` replays the nightly close for past days (at most 62 per call). Over a paid month it
   would write `absent` rows under a paid cycle, and a re-process of that month would deduct them. If you
   replay at all, only days after the last paid cycle, and only once that period's punches and leave are
   complete: every working day without a row becomes `absent`, which is unpaid.

3. **Roles.** In Settings → Roles & Permissions, a **custom** role with a plain `leaves.approve`,
   `expenses.approve` or `overtime.approve` is now limited to the holder's direct reports. For an HR-like
   custom role tick `leaves.approve_all`, `expenses.approve_all` and `overtime.approve_all`; for
   regularizations, `attendance.manage`. Find the custom approver roles:

   ```bash
   mongosh hrms --quiet --eval 'db.roles.find({ isSystem: { $ne: true }, permissions: /\.approve$/ }, { slug: 1, permissions: 1 }).forEach(printjson)'
   ```

   The permissions the seed added are harmless to keep, even after a rollback.

4. **Cycles left at `processed`** (A.4). A month not yet paid: process again if needed, **Lock** (from
   then on employees see the payslip and are notified), then **Mark paid** after the bank transfer. A
   month already paid under the old version: Lock, then Mark paid with the payment reference. Records
   computed before this deploy list no loans or claims to settle, so Mark paid only records the payment.

5. **Face check-in** (A.3). Open Attendance → Settings and save once: saving drops `face`. If `face` is
   the only method ticked, tick another (for example Manual) first. Until then, anyone using face gets
   `400 METHOD_UNAVAILABLE`.

6. **Probation** (A.5). Leave types now allow leave during probation by default. Review
   `probationAllowed` per leave type: in Leaves → Leave Types, **untick** *Allowed during probation* on
   the types that must not be available to employees on probation (unpaid types stay open regardless).

### F. What changes for users (tell HR)

- **Attendance**
  - Check-in by face is gone: apps that still offer it get `400 METHOD_UNAVAILABLE` (the mobile-app
    update comes in Phase 5). A **manual** check-in now obeys the location rule (company-wide *require
    location*, or the employee's own flag). Check-out needs no method.
  - A working day with no punch and no approved leave becomes `absent` at 23:59, and payroll deducts it.
    Forgotten check-outs are closed at the configured auto-checkout time.
  - Night-shift staff check out on the same row until 6 hours after their shift ends.
  - *Expenses before check-out* is a setting (Attendance → Settings): Everyone (default, as before),
    Field staff only, or No one. Field staff are flagged on the employee.
  - A regularization request can carry the corrected check-in and check-out times. Managers (for direct
    reports) and HR approve it under Attendance → Regularizations; an approved request rewrites the day.
- **Leave**
  - A leave running from December into January must be applied as two requests, one per year.
  - The probation rule above (A.5, E.6).
  - HR cancelling someone else's leave must give a reason. Cancelling approved leave refunds its days,
    and its past days become `absent`. Employees cannot withdraw approved leave that has started; HR
    cancels it.
- **Payroll**
  - Cycles go draft → processed → locked → paid. Process (and re-process) only in draft or processed;
    Lock only from processed; Mark paid only from locked. Employees see payslips only for locked and
    paid cycles, and are notified when a cycle is locked.
  - HR changes a record only through its adjustments: arrears, advance, expense, reimbursements, loan
    deduction, TDS. They survive a re-process.
  - Mark paid also settles the month's loan instalments and expense claims. If that fails part-way,
    `POST /api/v1/payroll/cycles/:id/settle` retries it; nothing is ever paid twice.
  - PF is on the earned basic + DA, so it drops with loss-of-pay days. ESI eligibility is fixed for the
    whole April–September / October–March period by the first cycle processed in it. Professional Tax
    follows the employee's state (step B). Compare the first cycle's PF, ESI and PT with the month
    before, then lock it.
- **Employees**
  - Import now creates a login for each imported person and e-mails an invitation; with
    `ALLOW_NO_MAIL=true` nothing is sent (they can use Forgot password once mail works). The import
    answers with a per-row report; read it for rows that were skipped.
  - A future exit date schedules the exit: status and login stay until that day, then the nightly run
    applies it.

### G. Verify

Today, after the restart: the section 9 checks still pass, the log shows both schedules registered
(step C), and as an admin the new pages open: Attendance → Regularizations, Leaves → Balances (the
**Open 2026** button), a payroll cycle's adjustments.

**The next working morning** (the first 23:59 IST run has happened):

```bash
mongosh hrms --quiet --eval 'db.attendances.countDocuments({ source: "auto_absent" })'   # > 0
pm2 logs backend --lines 500 --nostream | grep 'attendance-day-close: complete'
```

The count is above 0 on a working day unless every single employee punched in or was on leave. The log
line carries the counts (`absentCreated`, `leaveStamped`, `autoCheckedOut`, `exitsApplied`). Nothing
there means the job did not run: check Redis and the `schedule registered` lines. A failed run is
tried up to three times, and each failure is logged as `attendance worker job failed`. After 1 January, look for
`leave-year-open: complete` the same way.

### H. Rollback

As section 10: the previous commit's `dist/` (the SHA you noted at the top of this section), then
restart:

```bash
cd /var/www/hrms-new
git checkout <previous sha> -- backend/dist frontend/dist
pm2 restart all
```

Section 10's warning about undoing the rollback before the next `git pull` applies unchanged. What stays:

- **Data is not rolled back.** `absent` rows the nightly job wrote, opened leave balances, exits it
  applied (and the logins it disabled) and cycles locked or settled all stay; the previous version reads
  them like any other row.
- **The seed's permissions and the indexes** stay; both are harmless to the previous version (the
  holiday index only refuses a second live copy of the same holiday).
- **`.env` and `TZ`** can stay: the previous version ignores the new entries and already computes the
  attendance day in IST.

---

## Phases 3–6 — web UX, field sales + maps, mobile, hygiene

For deploying the `phases-3-6` work on the same server, once sections 1–10 and the Phase 2 section are
in place. Paths and the `mongosh hrms` database name are as above; use the name from `MONGODB_URI` if
it is not `hrms`.

What changes: the Field Sales module is back on the web (catalogue-priced orders with GST, payment
receipts, visits, tasks, targets) with a live map, daily trails and a client map; field money follows
fixed rules (orders `pending → confirmed → delivered`, payments `collected → verified → deposited`, no
self-approval, idempotent creates, ledgers recomputed from the rows); managers see only their direct
reports; push notifications to the phone app; Projects/Timesheets and the language switcher are gone.
The database gets three migrations (`migrate-mongo`) and two one-off scripts.

**Prerequisite:** `phases-3-6` is merged into the branch the server tracks and pushed. Note the commit
you are on, for rollback (step G):

```bash
cd /var/www/hrms-new && git rev-parse --short HEAD
```

Order: **A → B → C → D**, then tell people what changed (E) and verify (F). The mobile release (H)
comes after the backend is live: the new app needs this backend. The app installed on phones today was
not tested against it (for example, marking a `collected` payment deposited now answers 409: a manager
verifies first).

### A. Before you deploy: data checks

Run these on the server before the `git pull`. They only read, except where a fix is shown.

1. **Migrations already applied.** `migrate-mongo` (a regular dependency, so already installed) keeps
   its record in the `changelog` collection. Before the pull, call it directly: the old
   `npm run migrate:*` scripts look for `migrate-mongo-config.js` and fail with
   `Cannot find module …/migrate-mongo-config.js` (the file is `.cjs`; this release fixes the scripts):

   ```bash
   cd /var/www/hrms-new/backend && npx migrate-mongo status -f migrate-mongo-config.cjs
   ```

   It lists `20260422000001-baseline.cjs` and `20260729000001-saturday-working-day.cjs` (the three new ones
   arrive with the pull). Because the scripts never worked, most likely both say `PENDING`. The baseline does
   nothing. **`saturday-working-day`** will run in step C unless you stop it: it adds Saturday to every
   shift whose `workDays` are exactly Monday–Friday (the week-off rule, Sunday plus the 4th Saturday, is
   applied in code). Ask HR. If those shifts must stay Monday–Friday, record it as applied without
   running it:

   ```bash
   mongosh hrms --quiet --eval 'db.changelog.insertOne({ fileName: "20260729000001-saturday-working-day.cjs", appliedAt: new Date(), migrationBlock: Date.now() })'
   ```

   The status command then shows its `appliedAt`, and step C skips it.

2. **Duplicates that stop the index migration.** Migration `20261021000003` builds unique indexes on order
   numbers, receipt numbers, live product SKUs and monthly targets. If any duplicate exists it stops
   **before changing anything** and lists them. See them now:

   ```bash
   mongosh hrms --quiet --eval '
     const dup = (c, key, match) => db.getCollection(c).aggregate([
       { $match: match || {} },
       { $group: { _id: key, n: { $sum: 1 }, ids: { $push: "$_id" } } },
       { $match: { n: { $gt: 1 } } }]).toArray();
     printjson({
       orderNumbers: dup("productorders", "$orderNumber"),
       receiptNumbers: dup("paymentcollections", "$receiptNumber"),
       liveSkus: dup("products", "$sku", { isDeleted: false }),
       targets: dup("salestargets", { e: "$employeeId", y: "$period.year", m: "$period.month", t: "$type" }),
     })'
   ```

   All four must be `[]`. Money records are never merged or renamed automatically: give the extra order
   or receipt its own number (for example `db.productorders.updateOne({ _id: ObjectId("…") }, { $set: { orderNumber: "<number>-B" } })`),
   and for targets keep one per employee, month and type. Deleted rows count too (the indexes cover
   them), except for SKUs.

3. **Open visits.** The same migration closes every visit still `in_progress` from an earlier day
   (check-out at the start of the next day, marked `metadata.autoClosed`), and of several open today
   per rep keeps the newest. Nothing to fix; note the count for the field managers:

   ```bash
   mongosh hrms --quiet --eval 'print(db.visits.countDocuments({ status: "in_progress" }), "visits in progress")'
   ```

4. **Client locations.** The migration also builds the `location_2dsphere` index on `clients` (the
   client map and "clients near me" need it). One stored location that is not a valid point (for example
   `{ type: "Point", coordinates: [] }`) makes that build fail with `Can't extract geo keys`; the migration
   then stops half-way (re-running it after the fix is safe). See the indexes and count the bad ones:

   ```bash
   mongosh hrms --quiet --eval '
     const bad = { location: { $exists: true }, $or: [
       { "location.type": { $ne: "Point" } },
       { "location.coordinates.1": { $exists: false } },
       { "location.coordinates.0": { $not: { $gte: -180, $lte: 180 } } },
       { "location.coordinates.1": { $not: { $gte: -90, $lte: 90 } } } ] };
     print(db.clients.getIndexes().map(i => i.name).join(", "));
     print(db.clients.countDocuments(bad), "clients with an unusable location");
     db.clients.find(bad, { name: 1, location: 1 }).forEach(printjson)'
   ```

   If the count is not 0, remove those pins (they could not be shown on a map anyway; re-pin the clients
   on the web later). This writes, so run it only after reading the list:

   ```bash
   mongosh hrms --quiet --eval '
     const bad = { location: { $exists: true }, $or: [
       { "location.type": { $ne: "Point" } },
       { "location.coordinates.1": { $exists: false } },
       { "location.coordinates.0": { $not: { $gte: -180, $lte: 180 } } },
       { "location.coordinates.1": { $not: { $gte: -90, $lte: 90 } } } ] };
     printjson(db.clients.updateMany(bad, { $unset: { location: "" } }).modifiedCount)'
   ```

5. **Legacy draft orders.** Migration `20261021000002` turns every `draft` order into `confirmed` (they
   were counted as sales before; this keeps balances and targets as they are):

   ```bash
   mongosh hrms --quiet --eval 'print(db.productorders.countDocuments({ status: "draft" }), "draft orders")'
   ```

6. **Who is field staff.** Only employees flagged *Field staff* are tracked and shown on the live map,
   and only people holding `field-sales.view` (role or custom permission) see the Field Sales module. No
   seeded role except HR Manager has it (`field-sales.view` + `field-sales.manage`). List both:

   ```bash
   mongosh hrms --quiet --eval '
     db.employees.find({ isFieldStaff: true, isDeleted: { $ne: true } }, { employeeId: 1, firstName: 1, lastName: 1 }).forEach(printjson);
     print("-- roles with field-sales:");
     db.roles.find({ permissions: /^field-sales\./ }, { slug: 1, permissions: 1 }).forEach((r) => printjson({ slug: r.slug, field: r.permissions.filter((p) => p.startsWith("field-sales")) }));
     print("-- users with field-sales in customPermissions:", db.users.countDocuments({ customPermissions: /^field-sales\./ }))'
   ```

   Fix the flags in step D.4.

### B. Configuration

**Backend `.env`** (`/var/www/hrms-new/backend/.env`). These are new since Phase 2 (`backend/src/config/env.ts`):

| Variable | Value | Why |
| --- | --- | --- |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | e.g. `/etc/dhrms/firebase-service-account.json` | Push notifications to the phone app. Unset or blank: push is off and everything else works. The file is the JSON from Firebase console → Project settings → Service accounts → *Generate new private key*, of **the same Firebase project** as the app's `google-services.json` / `GoogleService-Info.plist` (step H). Keep it outside the repository, `chmod 600`, owned by the user pm2 runs as. An unreadable or invalid file is logged once (`push: could not initialise Firebase — push notifications are off`) and the API keeps running. |
| `SUPPORT_EMAIL` | the support address | Contact on the public privacy policy (`/api/v1/privacy-policy`, linked from the store listings); unset, `COMPANY_EMAIL` is shown. It must be a valid address: an invalid value stops the API at start (`SUPPORT_EMAIL must be an e-mail address`). Use the same address as the app's `supportEmail` (step H). |
| `FIELD_VISIT_RADIUS_M` | `300` (the default) | A visit check-in farther than this many metres from the client's pin is flagged "away from client". It is never refused. |

Also check these existing ones:

| Variable | Notes |
| --- | --- |
| `COMPANY_NAME` | Printed on payslips (section 3) and now in the header of every payment receipt PDF. Unset it reads `Company`. (ID cards take the name from the web build, *Dharmesh Deshani Group of Companies*, not from `.env`.) |
| `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY` | Leave unset unless Meilisearch is installed (section 3). Search no longer slows anything down: each call gives up after 500 ms, after 3 failures Meilisearch is skipped for 60 s, and saving a record never waits for it. Without it only `GET /api/v1/search` answers empty results; neither the web app nor the phone app calls it (list searches run in MongoDB). |
| `CORS_ORIGIN` | `https://hrms.ddipl.org`. Also the allowed origin of the live-map socket. |

```dotenv
SUPPORT_EMAIL=…
FIELD_VISIT_RADIUS_M=300
# only once the service-account file is on the server:
# FIREBASE_SERVICE_ACCOUNT_PATH=/etc/dhrms/firebase-service-account.json
```

**Web build settings.** The web app reads its settings when it is built, not on the server, so the
committed `frontend/dist` already contains them. This release was built with `frontend/.env` holding
only `VITE_API_URL=https://hrms.ddipl.org/api/v1`, so everything else has its default:

| Variable | Built with | Effect |
| --- | --- | --- |
| `VITE_MAP_TILE_URL` (+ `VITE_MAP_TILE_ATTRIBUTION`) | default: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` | Browsers load map tiles from openstreetmap.org. Fine for a handful of users; for heavy use point it at a tile provider. |
| `VITE_GEOCODE_URL` | empty | Address search ("find on map") is hidden on geofences and client locations; "Use my current location" and coordinates remain. Nothing is sent to a third-party geocoder. |
| `VITE_SUPPORT_EMAIL` | default `info@dharmeshdeshani.com` | Shown on the Support page. |
| `VITE_SUPPORT_PHONE` | default `+91 92130 17921` | Shown on the Support page. |
| `VITE_SOCKET_URL` | unset → the origin of `VITE_API_URL`, `https://hrms.ddipl.org` | Where the live map's socket connects (path `/socket.io/`, below). |
| `VITE_SENTRY_DSN` | unset | Error reporting off. |

To change one: put it in `frontend/.env.production` on the build machine, run
`cd frontend && npm run clean && npm run build` and commit `frontend/dist`.

**nginx: the live map's socket.** The live map gets positions over socket.io at `/socket.io/` on the
site's own origin. nginx proxies only `/api/v1/` so far, so the socket cannot connect and the map falls
back to polling every 30 seconds (it still works, the badge says "Polling every 30 s"). For real-time
updates, add this to the `443` server block, next to `location ^~ /api/v1/` (`^~` so no regex
`location` can capture it):

```nginx
location ^~ /socket.io/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then `nginx -t && systemctl reload nginx` (take a copy first, as in section 1).

### C. Pull, install, seed, migrate, restart

```bash
cd /var/www/hrms-new && git checkout -- backend/package-lock.json && git pull && cd backend && npm ci --omit=dev
node dist/scripts/seed.js
npm run migrate:up
npm run migrate:status
pm2 restart all
```

- **Seed.** Refreshes the system roles: HR Executive and HR Manager gain `expenses.config` (expense
  categories). On a server that already ran the Phase 2 seed expect
  `Roles: 0 created, 2 refreshed; retired permissions stripped from 0 custom role(s) and 0 user(s)`.
  Custom roles are not touched (step D.6).
- **Migrations.** `npm run migrate:up` runs `migrate-mongo up -f migrate-mongo-config.cjs` (the scripts
  now name the config file). It works on the server: `migrate-mongo` is a regular dependency, so
  `npm ci --omit=dev` installs it (unlike `tsx`). Run it from `backend/`: the config takes `MONGODB_URI`
  from `backend/.env` and runs the files in `backend/migrations/` (committed source; they are not part
  of `dist`). It applies every pending migration in order (including A.1's, unless you marked it) and
  stops at the first failure; applied ones are recorded in `changelog` and never run twice. The new ones:
  - `20261021000001-location-track-received-at`: location history now expires 90 days after the server
    received it (it used to key on the phone's clock). Backfills `receivedAt` and swaps the TTL index.
  - `20261021000002-legacy-draft-orders-confirmed`: prints `legacy draft orders → confirmed: N`; the
    orders are stamped `metadata.migratedFromDraft`.
  - `20261021000003-field-production-indexes`: prints `field indexes: N duplicate push token(s) removed,
    N open visit(s) closed`, then builds the field and push-device indexes (`autoIndex` is off in
    production, so nothing else builds them).

  Each prints `MIGRATED UP: <file>`. If `…field-production-indexes` stops on duplicates (A.2) it says
  `nothing was changed` and lists them; after a bad client location (A.4) it stops at the index build.
  Fix the data and run `npm run migrate:up` again: the earlier migrations stay applied and this one is
  safe to repeat. You can restart the API meanwhile (the code makes the same checks itself; the indexes
  back them up), but finish it the same day. `npm run migrate:status` must then show an `Applied At`
  date for every file, none `PENDING`.
- **Restart.** `pm2 restart all` keeps the environment saved in Phase 2 step C. Check it still has `TZ`:
  `tr '\0' '\n' < /proc/$(pm2 pid backend)/environ | grep '^TZ='` → `TZ=Asia/Kolkata`. Then
  `pm2 logs backend --lines 30 --nostream` shows `API listening on http://127.0.0.1:4000`.

### D. Once, after the deploy

1. **Client ledgers.** Client balances used to be added up on create and never corrected, so existing
   ones are wrong until recomputed from the orders and payments. Run it after `migrate:up`. Dry run first,
   it prints each order and client whose figures change; read it, then apply:

   ```bash
   cd /var/www/hrms-new/backend
   node dist/scripts/recompute-field-ledgers.js
   node dist/scripts/recompute-field-ledgers.js --apply
   ```

   Running it again is harmless (an up-to-date record is not listed).

2. **Salary stash.** Older imports stored statutory figures (PF, ESI, PT, net, CTC) inside
   `salary.otherAllowances`, which inflated `grossSalary`. Dry run, review the list with HR, then apply:

   ```bash
   node dist/scripts/fix-salary-stash.js
   node dist/scripts/fix-salary-stash.js --apply
   ```

   It prints one line per employee (removed keys, `grossSalary before → after`). Payroll does not read
   `grossSalary`, but employee screens and exports do.

3. **Former drafts.** Tell the field managers that old draft orders are now *confirmed* and count as
   sales; they cancel any that were abandoned (Field Sales → Orders). List them:

   ```bash
   mongosh hrms --quiet --eval 'db.productorders.find({ "metadata.migratedFromDraft": true }, { orderNumber: 1, totalAmount: 1, createdAt: 1 }).forEach(printjson)'
   ```

4. **Field staff and live tracking.**
   - Tick *Field staff* on every field rep's employee record (Employees → Edit). Only flagged employees
     are tracked and appear on the live map, trails and the attendance live view; the app tracks a phone
     only when its user is flagged.
   - Reps need `field-sales.view` and field managers `field-sales.manage`, through a custom role (for
     example *Field Sales Rep* = the Employee permissions + `field-sales.view`) or the user's own
     permissions. The Live Map and Products pages need `field-sales.manage`. (A flagged employee
     without `field-sales.view` is still tracked through the app's attendance upload, but sees no field
     screens.)
   - Live tracking is a company switch (off unless someone turned it on): Attendance → Settings →
     *Live location tracking*, with the upload interval. Points are accepted only while the rep is
     clocked in.

5. **Product catalogue.** Orders are priced only from the catalogue (price, GST rate per product), so
   create the products before reps book orders: Field Sales → Products (`field-sales.manage`).

6. **Custom roles.**
   - Expense categories now need `expenses.config` (before: `expenses.approve`). Grant it to any custom
     role that maintains categories. Find the candidates:

     ```bash
     mongosh hrms --quiet --eval 'db.roles.find({ isSystem: { $ne: true }, permissions: "expenses.approve" }, { slug: 1, permissions: 1 }).forEach(printjson)'
     ```

   - The `*.approve_all` rule of Phase 2 step E.3 still applies.
   - Tell whoever administers custom roles: a holder of `employees.view` without `employees.update` or
     `payroll.process` now sees only their own record and their **direct reports'**, and never salary,
     bank details, statutory IDs or documents. Another employee's record answers 403. HR-like custom
     roles need `employees.update` (or `payroll.process`) to see everyone.

### E. What changes for users (tell HR and the field managers)

- **Managers** see only their direct reports: employee records (no salary or bank details), the
  attendance dashboard, records and reports, live locations. Set *Reporting manager* on employees
  (Phase 2 step A.6).
- **Employee directory** (phone app): colleagues' phone numbers are no longer shown (name, e-mail,
  department, designation remain).
- **Field orders:** booked from the product catalogue (create products first, D.5); the server prices
  them (GST per line). New orders start `pending`; a field manager confirms and delivers; **nobody
  confirms or delivers their own order**, not even a manager. A rep cancels only their own pending
  order without payments. New numbers look like `ORD-2026-00001` / `RCPT-2026-00001`; old rows keep
  theirs.
- **Field payments:** `collected` → `verified` (a field manager) → `deposited` (the rep or a manager); a
  manager can mark a payment bounced and take a bounce back. A rep may date a collection at most 7 days
  back. Each payment has a receipt PDF. Bounced payments and cancelled orders no longer count in
  totals, dashboards or revenue. Old drafts are now confirmed (D.3).
- **Visits:** one open visit per rep; a check-in far from the client's pin, or without GPS, is
  flagged, never refused. Check-out notes are kept apart from check-in notes.
- **Targets** are computed from the orders and visits each time (amount targets include GST).
- **Maps:** Live Map (field managers), daily Trails and a Client Map under Field Sales.
- **New on the web:** the Field Sales menu (Dashboard, Clients, Visits, Orders, Collections, Products,
  Tasks, Targets, Live Map, Trails, Client Map); ID cards come from the server (signed QR); employee
  export and an actions menu; restore deleted employees (*Include deleted*); holiday import; notices
  can target departments; "I acknowledge" on HR policies (only HR sees who acknowledged); profile
  photo upload (the photo is also kept in the uploader's Documents, and replacing it leaves the old one
  there); the PF wage setting per salary component (*Auto (by name) / Basic / DA / Excluded*).
- **Gone:** Projects and Timesheets (hidden; their data stays), the language switcher (English only,
  Indian date and number formats, IST).
- **Cookie banner** asks again once (consent version 2).
- **Phone app:** push notifications once step H ships; the new app version requires this backend.

### F. Verify

From your own machine:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://hrms.ddipl.org/api/v1/health                  # 200
curl -s 'https://hrms.ddipl.org/socket.io/?EIO=4&transport=polling' | head -c 40; echo          # 0{"sid":…  (HTML here = the nginx socket block is missing)
curl -s --http1.1 -m 5 -o /dev/null -w '%{http_code}\n' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  'https://hrms.ddipl.org/socket.io/?EIO=4&transport=websocket'                                  # 101, then it waits out the 5 s (exit 28 is fine)
curl -s 'https://hrms.ddipl.org/api/v1/privacy-policy' | grep -o 'mailto:[^"]*' | head -1       # your SUPPORT_EMAIL
```

On the server:

```bash
cd /var/www/hrms-new/backend
npm run migrate:status                                                       # no PENDING
mongosh hrms --quiet --eval 'print(db.productorders.countDocuments({ status: "draft" }))'   # 0
mongosh hrms --quiet --eval 'print(db.visits.getIndexes().map(i => i.name))'                # includes one_open_visit_per_employee
pm2 status                                                                   # backend online, restarts not climbing
```

In the browser, signed in as an admin: the Field Sales menu is there; Products opens; the **Live Map**
badge says *Live* (with *Polling every 30 s* the socket block is missing or wrong). With a field rep:
clock in on the phone with live tracking on; within one upload interval the rep appears on the Live
Map. Book one real order and payment as usual and open its receipt (a PDF).

If `FIREBASE_SERVICE_ACCOUNT_PATH` is set, after the first notification
`pm2 logs backend --lines 200 --nostream | grep 'push:'` shows `push: Firebase Cloud Messaging configured`.

### G. Rollback

As section 10: the previous commit's `dist/` (the SHA you noted at the top of this section), then restart:

```bash
cd /var/www/hrms-new
git checkout <previous sha> -- backend/dist frontend/dist
pm2 restart all
```

Section 10's warning about undoing the rollback before the next `git pull` applies unchanged. The
rollback leaves `backend/migrations/` at the new version, so the `down` steps below can still run
(`npm run migrate:down` reverts the **last** applied migration only; run it once per migration, newest
first). What stays, and what to do:

- **`20261021000003` (indexes):** the one-open-visit index makes the previous version answer 500 when
  a rep checks in to a second visit while one is open (it used to allow that). For more than a short
  rollback, run `npm run migrate:down` once (from `backend/`): it drops `one_open_visit_per_employee`,
  `checkIn.time_-1`, the three product indexes and `paymentcollections.orderId_1`, and reopens the
  visits it closed. The order-number, receipt-number, target, push-device, client-location and
  location-track indexes stay; they are harmless to the previous version. Rolling forward is
  `npm run migrate:up` again.
- **`20261021000002` (drafts):** safe to leave; the previous version reads `confirmed` orders as before.
  Its `down` turns only the stamped orders still `confirmed` back into `draft`. Orders created after
  the deploy are `pending`, a status the previous version does not know.
- **`20261021000001` (location TTL):** safe to leave. Points the previous version writes carry no
  `receivedAt`, so the TTL never expires them, and rolling forward does not re-run this migration.
  After rolling forward, backfill them once:
  `mongosh hrms --eval 'db.locationtracks.updateMany({ receivedAt: { $exists: false } }, [{ $set: { receivedAt: "$timestamp" } }])'`.
- **Data is not rolled back:** recomputed ledgers, the salary clean-up, the seed's `expenses.config`
  and closed visits stay; all harmless to the previous version.
- **`.env` and nginx** can stay: the previous version ignores the new keys, and the socket block only
  serves what is there.
- **Phones:** the new app needs this backend (payment statuses, `checkOut.notes`). Do not roll back
  the backend while the new app is in use, or roll it back only briefly.

### H. Mobile release (`dhrms-iosfinal/`)

The app is a separate git repository (`dhrms-iosfinal/`, ignored by this one); its `ios/` and
`android/` folders and the release keystore are not on this machine. Ship the **backend first**.

1. Restore `ios/` and `android/` and the Android release keystore from the other machine.
2. Firebase, from the project whose service account the backend uses (B):
   - `android/app/google-services.json` (+ the google-services Gradle plugin);
   - `ios/…/GoogleService-Info.plist`, with the push capability and the **APNs key uploaded to
     Firebase**;
   - Android 13+: `<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>` in the
     manifest;
   - iOS `AppDelegate`: call `[FIRApp configure]` only when `GoogleService-Info.plist` exists (native
     code, not guarded from JS; the JS side already runs without Firebase, push simply stays off).
3. Bump the version in `package.json` (`0.1.2` now; the app shows it in Settings), `app.json` and the
   native projects (`versionCode`/`versionName`, `CFBundleShortVersionString`/`CFBundleVersion`). Set the
   device display name to *D-HRMS* if it differs.
4. Confirm the support address: `app.json` `supportEmail` is the placeholder `support@ddipl.org`; set it
   to the real address, the same as `SUPPORT_EMAIL` (B).
5. Store listing text: `dhrms-iosfinal/store/` (`appstore/*`, `playstore/*`, rules in `store/README.md`).
6. Check before building: `npm run type-check` (0 errors) and `npx jest` (all pass), then try it on a
   device: it has only been type-checked and unit-tested, never run on a phone.
7. Not done, native follow-ups: background location (tracking is foreground-only), an in-app map
   (`react-native-maps`; "Clients near me" is a distance list with directions), opening/saving the
   receipt PDF (`react-native-blob-util` or `react-native-fs`; the app shares the receipt as text),
   keeping the MMKV encryption key in Keychain/Keystore (`react-native-keychain`; it sits in a
   separate MMKV file), and the reset-password deep link.

## Field Visits — sites, check-in/out, work reports, travel allowance (replaces Field Sales)

For deploying the `field-visits` work on the same server, after everything above is in place. Paths
and the `mongosh hrms` database name are as above.

What changes: Field Sales is deleted (orders, products, payments/receipts, targets, leaderboard: code,
screens and their empty collections). Clients become **Sites** that anyone in the field can pin from
the phone. Employees check in and out at a site with GPS (and a selfie while the company setting
"selfie required" is on), file a work report (notes, photos, documents, people met, outcome,
follow-up, checklist), and it all works offline and syncs later with the original time and place.
Managers plan visits (one-off and recurring), see the team map (last check-in/out point and status),
day routes, daily/summary/exception/site reports with Excel and PDF, and approve a **travel allowance
by km** that goes through normal expense approval. Location is recorded only at check-in and check-out:
continuous tracking is gone. The database gets three migrations.

**Prerequisite:** `field-visits` is merged into the branch the server tracks and pushed. Note the commit
you are on, for rollback (G):

```bash
cd /var/www/hrms-new && git rev-parse --short HEAD
```

Order: **A → B → C → D**, then tell people (E) and verify (F). Ship the **backend before the new app**
(H): the app installed on phones today talks to Field Sales endpoints that no longer exist.

### A. Before you deploy: data checks

1. **No sales data left.** The first migration stops, changing nothing, if any sales collection still
   holds a document. Check (all must print 0, or the collection must not exist):

   ```bash
   mongosh hrms --quiet --eval 'for (const c of ["products","productorders","paymentcollections","salestargets"]) print(c, db.getCollectionNames().includes(c) ? db[c].countDocuments({}) : "absent")'
   ```

   If something is there, export it (`mongoexport --db hrms --collection <name> --out <name>.json`)
   and delete it before the deploy — the business decision was to delete sales completely.
2. **Open visits.** Production had none; confirm:
   `mongosh hrms --quiet --eval 'db.visits.countDocuments({status:"in_progress"})'` → `0`. (Two open
   visits for one employee on one day stop the second migration with a list.)
3. **Backup** as in section 4 before migrating (`mongodump --db hrms --out ~/backup-field-visits`).

### B. Configuration

1. **Google Cloud key (server).** In the company's Google Cloud project, with billing on, enable
   **Routes API** and **Geocoding API**. Create an API key restricted to those two APIs and to this
   server's IP address. Put it in `/var/www/hrms-new/backend/.env`:

   ```
   GOOGLE_MAPS_API_KEY=<the key>
   ```

   Optional: without it the server makes no Google calls, km fall back to a straight line × 1.3 and
   are marked *estimated*, and pinned sites keep the address the employee typed. Never commit the key.
   Set a budget alert in Google Cloud; a large first summary report asks Google once per uncached
   employee-day (results are cached).
2. **Removed:** `FIELD_VISIT_RADIUS_M` (each site carries its own radius, default 200 m). Delete it from
   `.env` if present; it is ignored.
3. **Google Cloud key (Android app).** A second key for **Maps SDK for Android**, restricted to Android
   apps with the package name and the release keystore's SHA-1. It goes into the app build (H), not the
   server.

### C. Pull, install, seed, migrate, restart

```bash
cd /var/www/hrms-new && git checkout -- backend/package-lock.json && git pull && cd backend && npm ci --omit=dev && npm run build
node dist/scripts/seed.js
npm run migrate:up
npm run migrate:status
pm2 restart all
cd ../frontend && npm ci && npm run build
```

(Use the same build/publish steps for `backend/dist` and `frontend/dist` as in section 4 if the server
builds differently.)

- **Seed** refreshes the system roles and adds **Field Employee** (own visits) and **Field Manager**
  (their team). Expect `Roles: 2 created, … refreshed`.
- **Migrations** (each prints `MIGRATED UP: <file>`):
  - `20261023000001-field-visits-foundation`: prints `field visits: N client(s) copied to sites; dropped …`.
    Clients become sites (same ids, so old visits/tasks still point at them), `field-sales.*`
    permissions are renamed to `field.view` / `field.manage` in roles and users (never stripped), the
    empty sales collections and `counters` are dropped. Stops first, changing nothing, on A.1.
  - `20261023000002-field-visits-indexes`: prints `field visits engine: N legacy visit(s) reshaped, N
    day(s) filled in; indexes built` (offline replay, one open visit per employee per day, schedules).
  - `20261023000005-field-team-travel`: the built-in Field Manager role keeps `field.view` (self + direct
    reports) and loses `field.manage` (everybody + settings), which stays with HR/admin; builds the
    one-travel-claim-per-day index and the route cache index.

  All three are idempotent; after fixing data, run `npm run migrate:up` again. `migrate:status` must
  show no `PENDING`.
- **Restart** and check `pm2 logs backend --lines 30 --nostream` for `API listening` and the `field`
  queue (nightly job 00:15 IST: plans recurring visits 7 days ahead, marks yesterday's unvisited plans
  *missed*, auto-closes visits left open on previous days).

### D. Once, after the deploy

1. **Field settings** (web → Field Visits → Settings, as HR/admin): site types and visit purposes your
   team uses, "selfie required" (on by default), short-visit minutes (5), auto-close time (23:30),
   offline max age (7 days), "first check-in counts as attendance" (on), **vehicle rates in ₹/km**
   (the defaults are ₹0, and the server refuses ₹0 travel claims until a rate is set), checklists.
2. **Roles.** Give field staff the **Field Employee** role and their managers **Field Manager**. Field
   managers see only their direct reports, so set *reporting manager* on the field employees (today only
   4 of 98 employees have one). HR/admin see everyone.
3. **Sites.** Check the site(s) copied from clients; import more from Excel (Sites → Import) or let
   employees pin them from the phone.

### E. What changes for users

- Field employees: Field tab in the app → *My day* (planned visits, pin a new site, check in/out),
  work report at check-out, *Sites near me* with a map, travel allowance for a day in one tap. Works
  without network; the app syncs when it is back and shows what is still waiting.
- Managers: web → Field Visits: team map, routes, visits, planning and recurring visits, reports with
  Excel/PDF; travel claims arrive in normal expense approval showing computed vs claimed km.
- Gone: orders, products, payments/receipts, targets, leaderboard, live tracking.

### F. Verify

1. `curl -s https://<host>/api/v1/health` → 200. `GET /api/v1/field/settings` (signed in) → 200.
2. Old endpoints answer 404: `/api/v1/field/orders`, `/api/v1/field/products`, `/api/v1/field/payments`.
3. `POST /api/v1/field/tracking/batch` → 200 `{ ignored: true }` (old app versions keep working).
4. With a test field employee on a phone: pin a site → check in → check out with a report → see it on the
   web (visit, team map, daily report, Excel/PDF export) → claim travel allowance → approve it in
   Expenses.
5. Next morning: `pm2 logs backend --nostream | grep field-nightly` shows the job ran.

### G. Rollback

`git checkout <noted commit>`, rebuild, `pm2 restart all`. Migrations: `npx migrate-mongo down -f
migrate-mongo-config.cjs` once per Field Visits migration (newest first) restores the field manager's
`field.manage`, the visits' one-open-visit index and `clientId`, and the permission names; dropped sales
collections were empty and are not restored. Visits and sites created after the deploy stay in the
database.

### H. Mobile release (`dhrms-iosfinal/`)

1. Backend first (A–F).
2. Android: put the Maps SDK key (B.3) in `android/local.properties` as `GOOGLE_MAPS_API_KEY=<key>`
   (git-ignored) and set `"mapsEnabled": true` in `app.json`; without the key keep it `false` (lists
   instead of maps). iOS map: later, when the iOS project is on this machine.
3. Bump the version (`package.json`, `app.json`, `versionCode`/`versionName`), check `npm run
   type-check` and `npx jest`, build with the release keystore, try it on a phone (including airplane
   mode: check in and out offline, then reconnect).
