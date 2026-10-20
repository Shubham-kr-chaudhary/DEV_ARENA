# Troubleshooting Guide

## 1. Git Shows Many Modified Files With No Visible Diff on Windows (`CRLF` vs. `LF`)

**Symptom**: Running `git status` shows modified files across the repository, but `git diff --ignore-cr-at-eol` is empty.

**Cause**: Files were checked out on Windows with `core.autocrlf=true` before `.gitattributes` was present, causing `CRLF` (`\r\n`) vs. `LF` (`\n`) timestamp/line-ending mismatches in the Git index.

**Resolution**:

```bash
git add --renormalize .
git reset
```

The root `.gitattributes` file enforces `* text=auto eol=lf` so future commits remain consistent across Windows, macOS, and Linux.

## 2. TypeScript Cannot Find `../generated/prisma/client.js` in `apps/api`

**Symptom**: `pnpm typecheck` or `pnpm --filter @devarena/api build` fails with `Cannot find module '../generated/prisma/client.js'`.

**Cause**: The Prisma 7 generated client (`apps/api/src/generated/prisma`) is a build artifact excluded from Git via `.gitignore` and must be generated after installing dependencies or updating `schema.prisma`.

**Resolution**:

```bash
pnpm db:generate
```

## 3. `GET /ready` Returns `503 Service Unavailable`

**Symptom**: `GET http://127.0.0.1:4000/health` returns `200 OK`, but `GET http://127.0.0.1:4000/ready` returns `503` with `{"status":"not_ready","service":"api","checks":{"database":"down"}}`.

**Cause**: `/ready` executes a real `SELECT 1` readiness probe against PostgreSQL (`DATABASE_URL`). A `503` response indicates PostgreSQL is stopped, unreachable, or misconfigured.

**Resolution**:

1. Verify the local PostgreSQL container is running and healthy:
   ```bash
   docker compose -f infra/local/postgres/compose.yml ps
   docker compose -f infra/local/postgres/compose.yml up -d
   ```
2. Confirm `DATABASE_URL` in `.env` matches `postgresql://devarena:devarena@localhost:5432/devarena`.

## 4. `loadServerConfig` Throws on `SESSION_SECRET` in Production Mode

**Symptom**: Starting `apps/api` with `NODE_ENV=production` fails immediately with a Zod validation error on `SESSION_SECRET`.

**Cause**: `@devarena/config` intentionally rejects development default/placeholder secrets (`replace-with-a-local-development-secret`) and secrets shorter than 32 characters when `NODE_ENV=production`.

**Resolution**: Inject a cryptographically random secret of at least 32 characters (e.g., `openssl rand -hex 32`) via environment variables or AWS Secrets Manager.

## 5. `pnpm install --frozen-lockfile` Fails After Editing `package.json`

**Symptom**: CI fails during `pnpm install --frozen-lockfile`.

**Cause**: A dependency in a workspace `package.json` was added or updated without regenerating `pnpm-lock.yaml`.

**Resolution**: Run `pnpm install` locally with `pnpm@10.15.0` (`corepack enable`) and commit the updated `pnpm-lock.yaml`.
