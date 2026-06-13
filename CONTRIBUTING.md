# Contributing

This is a practical checklist for anyone making changes to VTH-app. The full
system map lives in [`README.md`](README.md); deployment lives in
[`docs/`](docs/). Read those first if you're new.

## Local setup

- Use the Node version pinned in `.nvmrc` (`engines` in `package.json` is
  enforced via `engine-strict`). `nvm use` (or fnm/volta/asdf equivalent).
- `npm install`
- `npm run dev` → open `http://localhost:5001/#/`
- First boot with an empty DB prints a one-time bootstrap admin password in the
  log (`[BOOTSTRAP]`) unless you set `DEFAULT_ADMIN_PASSWORD`.

## Before every PR

Run the same gates CI runs:

```bash
npm run verify   # vitest + tsc + build
```

CI also runs `npm run knip:files` (orphan-file check). Align locally before
pushing.

## Change checklist

- **Touch all layers.** A form field or capability usually spans UI + API +
  schema + migration + permission gate. See README §8 (built-in field sync),
  §19 (capabilities), and the §21 change recipes.
- **Permissions:** the single source of truth is `shared/capabilities.ts`. The
  server enforces; client gates are cosmetic and always re-checked server-side.
- **Database schema:** edit `shared/schema.ts` **and** add a new, forward-only
  migration under both `migrations/` (SQLite) and `migrations-pg/` (Postgres).
  Bump the numeric prefix; never edit an already-shipped migration.
- **Auth/fetch:** the session is an `httpOnly` cookie with CSRF (README §9). Any
  hand-written mutating `fetch` must spread `...csrfHeaders()`
  (`client/src/lib/csrf.ts`) and set `credentials: "same-origin"`. Prefer the
  shared helpers in `client/src/lib/queryClient.ts`.
- **Secrets:** never commit `.env*` or real credentials. Read secrets from env
  vars only (README §16, `SECURITY_NOTES.md`).
- **Sensitive admin actions:** write an audit row to `admin_action_logs`.
- **Tests:** add/adjust `*.test.ts` coverage for behavior changes.

## Commit / PR conventions

- Small, focused commits; describe the **why**, not just the what.
- Note any new env var, migration, or manual deploy step in the PR description.
- Don't change deployment instructions in `README.md` - those live in `docs/`.

## Who approves production config

Production environment values (env vars, secrets, database choice, backup
destinations) are an **operations** decision, not a code-review one. Flag any PR
that requires a new production secret or infra change so the deploy owner can
act before release.
