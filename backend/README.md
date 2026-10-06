# jlTimer backup API

Personal cloud backup for jlTimer: a Cloudflare Worker in front of a Turso (libSQL) database. One user. Login is a gesture on jlTimer's virtual cube. Design and threat model: [../docs/BACKUP_PLAN.md](../docs/BACKUP_PLAN.md).

```
src/app.js         the API (platform-neutral)
src/worker.js      Cloudflare Worker entry (Turso over HTTPS)
src/dev-server.mjs local server (SQLite file instead of Turso)
src/schema.js      tables, created automatically
test/api.test.mjs  API tests, including an attack checklist
```

## Local development

```sh
cd backend
npm install
npm test                         # API + attack tests
npm run dev                      # http://localhost:8787, setup token "dev-setup", data in dev.db
```

In jlTimer (served at http://localhost:8081), open **Export → jlTimer cloud backup → Server...**, enter `http://localhost:8787`, then **Set up login...** with the setup token. `ALLOWED_ORIGINS`, `SESSION_SECRET`, `SETUP_TOKEN`, `PORT` and `DB_FILE` can be overridden with environment variables.

## Deploy (when ready)

1. Turn on 2FA for your Turso, Cloudflare and GitHub accounts.
2. Turso: create a database (`turso db create jltimer`) and a token for it (`turso db tokens create jltimer`). Note its `libsql://...` URL.
3. Cloudflare:
   ```sh
   npx wrangler login
   npx wrangler secret put TURSO_URL        # libsql://...
   npx wrangler secret put TURSO_TOKEN
   npx wrangler secret put SESSION_SECRET   # e.g. `openssl rand -base64 48`
   npx wrangler secret put SETUP_TOKEN      # one-time, e.g. `openssl rand -base64 24`
   npx wrangler deploy
   ```
   Set `ALLOWED_ORIGINS` in `wrangler.toml` to your jlTimer address first.
4. In jlTimer: **Server...** → the `https://jltimer-api.<you>.workers.dev` address → **Set up login...**. Save the recovery codes.
5. Remove the setup token: `npx wrangler secret delete SETUP_TOKEN`. Setup is refused anyway once a login exists.

Never commit secrets. `.dev.vars` and `*.db` are git-ignored.
