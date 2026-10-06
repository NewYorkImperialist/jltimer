# Cloud backup plan: Turso + Cloudflare Worker + cube-move login

Status: **built and tested locally, not deployed.** Code: [backend/](../backend/) (API) and `src/js/cloud.js` (jlTimer client). Tests: `backend/test/api.test.mjs` (12 API and attack tests) plus a browser end-to-end run (setup, recovery codes, auto backup, gesture sign-out/sign-in, ordinary cancels stay local, restore with before-restore copy, second device).

Changes from the original plan, found while building:
- The browser **gzips snapshots** and the API only checks, hashes and stores the bytes. The Workers free plan's 10 ms CPU limit rules out parsing or compressing multi-megabyte JSON on the server.
- Minimum algorithm length is **16 moves** (several PLLs are 15+), plus at least 4 different layers and no repeated block. There is no built-in list of known algorithms.
- First-time setup needs a one-time **`SETUP_TOKEN`** secret, so nobody else can claim the login between deploy and your setup.
- Changing the algorithm requires doing the **current one first**, so a stolen device token alone can't change the login.
- A Content-Security-Policy was not added: jlTimer's page inlines its language strings, so `unsafe-inline` would be needed and wouldn't stop inline-handler injection. Instead the main injection hole was fixed: csTimer's battle tool inserted other players' names (and ELO) as raw HTML (`src/js/tools/battle.js`). They are now shown as text, verified with hostile room data that ran a script before the fix and not after.

## Goal

Back up all jlTimer data (sessions, solves, move histories, settings) to a database you control, keep several versions, and restore any of them, from any device. Only you can read or change it. Local auto-export to file stays on as a second, offline safety net.

Scope is **one user (you)**. There is no sign-up page and no other accounts.

## Architecture

```
jlTimer (GitHub Pages, static)
   │  HTTPS, Authorization: Bearer <session token>
   ▼
jlTimer API (Cloudflare Worker, free plan)   ← holds the Turso token and signing secret as Worker secrets
   │  libSQL over HTTPS (@libsql/client/web)
   ▼
Turso database (one SQLite database)
```

The browser never sees the Turso token. After logging in it gets a device token that keeps it signed in until you log out or revoke that device.

### Database tables

| Table | Columns | Purpose |
|---|---|---|
| `credential` | `salt`, `verifier`, `updated_at` | The single login (see below). One row. |
| `recovery` | `code_hash`, `used_at` | One-time recovery codes, hashed. |
| `snapshot` | `id`, `created_at`, `solves`, `bytes`, `sha256`, `data` | Full export JSON, compressed. Append-only. |
| `device` | `id`, `token_hash`, `name`, `created_at`, `last_seen`, `revoked_at` | One row per signed-in device. |
| `attempt` | `ip_hash`, `window_start`, `count` | Failed-login counter for rate limiting. |

### API (all JSON, HTTPS only)

| Endpoint | Needs session | Does |
|---|---|---|
| `POST /login` | no | Checks the login, registers this device, returns its device token |
| `POST /logout` | yes | Revokes this device's token |
| `GET /devices`, `POST /devices/:id/revoke` | yes | Lists signed-in devices; signs one out remotely |
| `POST /recover` | no | One-time recovery code → session token, forces a new login to be set |
| `POST /snapshots` | yes | Uploads a new snapshot |
| `GET /snapshots` | yes | Lists versions (date, solve count, size) |
| `GET /snapshots/:id` | yes | Downloads one version |
| `POST /credential` | yes | Changes the login |

There is no "delete everything" endpoint. Old versions are pruned only by a fixed rule (keep the newest 30, plus one per month for a year).

### jlTimer side

- Export dialog: **Back up to my server**, **Restore from my server…** (version list), and **Log in / Log out**.
- Auto backup: after every N solves (default 25), only when logged in. A failure shows a logo hint and never blocks timing.
- Restore always saves an automatic "before restore" snapshot first, then imports.
- The API URL is a jlTimer setting. The device token goes in `localStorage['locData']`, an existing key, so it is never written into export files. (`properties` is exported, so secrets must not go there.)

## Cube-move login

There's no login page. The login is a gesture on the normal virtual cube, and it only works for the single account (you):

1. Press **Space** to start a virtual solve as usual. The cube is visible.
2. Perform your secret algorithm.
3. Press **Esc** to cancel the attempt. With "Record DNF when a solve is cancelled with Esc" off, the attempt is discarded as usual.
4. If the moves of that cancelled attempt are your algorithm, you're **signed in**. If you're already signed in, the same gesture **signs you out**. A logo hint confirms either way.

Details:
- The moves compared are everything turned between the scramble and Esc, in standard notation (`R U R' F2 …`), rotations included.
- Setup (from the Export dialog, once) requires **at least 15 moves**. It rejects well-known algorithms (PLL/OLL/F2L sets, etc.) and obvious repeats.
- **Only matching cancels contact the server.** At setup, jlTimer stores a local fingerprint: the algorithm's length plus a 12-bit salted tag. A cancel is sent for checking only if its move count and tag match. Ordinary cancelled solves never leave the browser and never count as failed logins, and the fingerprint reveals only about 12 bits of a 60+ bit secret. About 1 in 4,000 same-length cancels will be checked and rejected harmlessly.
- If a cancelled attempt is a successful login or logout, nothing is recorded for it, even with "Record DNF on Esc" turned on.
- Signing in needs a network connection; timing never waits for it.

### How the login is checked

The free Worker plan allows 10 ms of CPU per request, too little for a strong password hash. So the slow work runs in the browser:

1. **Browser:** `key = PBKDF2-SHA256(moves, salt, 600 000 iterations)` (WebCrypto), computed only for cancels that match the local fingerprint. The salt comes from `GET /login/salt`.
2. **Worker:** compares `SHA-256(key)` with the stored `verifier` in constant time.

A stolen database still forces 600 000 PBKDF2 rounds per guess. The moves themselves never leave the browser.

## Threat model

| Threat | Mitigation |
|---|---|
| Someone gets the Turso token | It exists only as a Worker secret. It is never in the repo, the page or exports. It is scoped to this one database, and can be rotated in the Turso dashboard. |
| Guessing the login online | Only the API can check a login, and the gesture adds no other way in. 5 failures per 15 min per IP, then a lockout, plus a global cap of 50 failures per hour. A 15+ move non-standard sequence has a very large space. Known algorithms are rejected at setup. |
| Database leak, offline guessing | Salted PBKDF2 (600 000 rounds) per guess. The moves are never stored. |
| Shoulder surfing or screen recording | The cube is visible while you log in (chosen for fun), so anyone watching or any recording sees the sequence. Don't log in while recording or streaming; since you stay signed in, this is rare. If the sequence may have been seen, change it (`POST /credential`) and revoke other devices. |
| Stolen device token | Permanent sign-in means a stolen token works until revoked. Tokens are random 256-bit values stored hashed in `device`, sent as a bearer header (not a cookie). The device list shows last use, so revoke anything unfamiliar; rotating `SESSION_SECRET` or revoking all devices signs everything out. Keep XSS protection strict (below), since a page script is the main way a token could be stolen. |
| Other websites calling the API | CORS allows only the jlTimer origin. No cookies, so CSRF doesn't apply. |
| SQL injection | Parameterized queries only. |
| Malicious script on the jlTimer page (XSS) | The most important one, since such a script could use the session. jlTimer loads no third-party scripts (Baidu analytics is off), and that has to stay true. Add a Content-Security-Policy `<meta>` tag limiting scripts to the site and the API to `connect-src`. Review how solve comments and imported text are rendered. |
| Bad restore or bug wipes data | Snapshots are append-only. Every restore first saves a "before restore" snapshot. Local auto-export to file stays on. |
| Forgetting the move sequence | 8 one-time recovery codes are shown once at setup, stored hashed. Keep them offline. |
| Huge uploads or abuse costs money | Session required. Snapshot size capped (20 MB) and one upload per minute. The free tiers fail closed instead of billing. |
| **Turso, Cloudflare or GitHub account takeover** | **The most likely real attack.** Turn on 2FA on all three accounts. |

## Build and test plan

1. Build the Worker and the tables locally: `wrangler dev` plus a local libSQL file. No accounts needed.
2. Add the jlTimer login screen, backup and restore. Test end to end in the browser: setup, login, wrong-login lockout, upload, list, restore, before-restore snapshot, recovery code, expired session, CORS from a different origin.
3. Security pass: dependency review, CSP check, comment/import XSS review, and an attack checklist against the local Worker (brute force, token reuse, oversized upload, wrong origin, SQL injection strings).
4. You create the Turso database and Cloudflare account (with 2FA) and paste in the secrets. Deploy the Worker. Re-run the end-to-end tests against the deployed API.

## What you will need to provide

- A Turso account: one database, plus a database auth token for the Worker.
- A Cloudflare account: deploy the Worker and set three secrets (`TURSO_URL`, `TURSO_TOKEN`, `SESSION_SECRET`).
- 2FA on Turso, Cloudflare and GitHub.

## Not in scope: accounts for other people

This is a personal database. Other people can use jlTimer without an account, with local data, file export/import and csTimer's battle rooms. If accounts for others are ever wanted, use a service with built-in authentication (e.g. Supabase Auth) for them rather than extending this DIY login. Multi-user storage brings tenant isolation, password resets by email, sign-up abuse and responsibility for other people's data. The algorithm gesture would stay as a shortcut into the owner's account, and the snapshot design would carry over unchanged.
