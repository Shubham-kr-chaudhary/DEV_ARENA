# Development Guide

## 1. Prerequisites

- **Node.js**: `>=22.0.0`
- **pnpm**: `10.15.0` (pinned via `packageManager` in root `package.json`)
- **Docker & Docker Compose**: For running local PostgreSQL 17 (`infra/local/postgres/compose.yml`)

## 2. Initial Setup

```bash
corepack enable
pnpm install
cp .env.example .env
```

### Line Ending Normalization (Windows & Linux)

The repository enforces `LF` (`\n`) line endings across all source, configuration, SQL, Prisma, and Markdown files via `.gitattributes`. If you cloned the repository on Windows prior to `.gitattributes` being present, normalize your working tree once:

```bash
git add --renormalize .
git reset
```

## 3. Core Workspace Commands

Run from the repository root:

```bash
pnpm dev                   # Start web, api, and judge-worker in parallel watch mode
pnpm validate:foundation   # Verify required monorepo files, boundaries, and LF line endings
pnpm format                # Format all files with Prettier
pnpm format:check          # Verify Prettier formatting without modifying files
pnpm typecheck             # Run strict TypeScript typechecking across all workspaces
pnpm lint                  # Run ESLint across all workspaces
pnpm test                  # Run Vitest unit tests across all workspaces
pnpm build                 # Build all workspaces and applications
```

## 4. Package-Specific Commands

```bash
pnpm --filter @devarena/web dev
pnpm --filter @devarena/api dev
pnpm --filter @devarena/judge-worker dev
pnpm --filter @devarena/config test
pnpm --filter @devarena/api-contracts test
pnpm --filter @devarena/shared test
```

## 5. Database Development Workflow

Start the local PostgreSQL 17 container:

```bash
docker compose -f infra/local/postgres/compose.yml up -d
```

Generate the Prisma 7 client and validate or apply migrations:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

- When PostgreSQL is running and reachable at `DATABASE_URL`, `GET http://127.0.0.1:4000/ready` returns `200 OK` (`{ "status": "ready", "service": "api", "checks": { "database": "up" } }`).
- When PostgreSQL is stopped, `GET http://127.0.0.1:4000/ready` returns `503 Service Unavailable` (`{ "status": "not_ready", "service": "api", "checks": { "database": "down" } }`), while `GET http://127.0.0.1:4000/health` continues returning `200 OK`.

## 6. Environment Variables

All environment variables are documented in `.env.example` and validated at startup by `@devarena/config`:

- Variable: `NODE_ENV` — Consumer: All — Default (Development): `development` — Required in Production?: Yes (`production`)
- Variable: `API_HOST` — Consumer: `apps/api` — Default (Development): `127.0.0.1` — Required in Production?: Yes (`0.0.0.0` in container)
- Variable: `API_PORT` — Consumer: `apps/api` — Default (Development): `4000` — Required in Production?: Yes
- Variable: `CORS_ORIGIN` — Consumer: `apps/api` — Default (Development): `http://localhost:3000` — Required in Production?: Yes (exact web origin)
- Variable: `DATABASE_URL` — Consumer: `apps/api` — Default (Development): `postgresql://devarena:devarena@localhost:5432/devarena` — Required in Production?: Yes (RDS connection URL)
- Variable: `SESSION_SECRET` — Consumer: `apps/api` — Default (Development): Development fallback secret — Required in Production?: Yes (`>= 32` random chars; placeholder rejected)
- Variable: `AWS_REGION` — Consumer: `apps/api`, `apps/judge-worker` — Default (Development): `ap-south-1` — Required in Production?: Yes
- Variable: `SQS_QUEUE_URL` — Consumer: `apps/api`, `apps/judge-worker` — Default (Development): `undefined` (optional in Phase 1) — Required in Production?: Yes
- Variable: `SQS_DLQ_URL` — Consumer: `apps/api`, `apps/judge-worker` — Default (Development): `undefined` (optional in Phase 1) — Required in Production?: Yes
- Variable: `S3_BUCKET` — Consumer: `apps/api` — Default (Development): `undefined` (optional in Phase 1) — Required in Production?: Optional until S3 uploads enabled
- Variable: `WORKER_CONCURRENCY` — Consumer: `apps/judge-worker` — Default (Development): `2` — Required in Production?: Yes
- Variable: `WORKER_POLL_WAIT_SECONDS` — Consumer: `apps/judge-worker` — Default (Development): `20` — Required in Production?: Yes
- Variable: `WORKER_HEALTH_PORT` — Consumer: `apps/judge-worker` — Default (Development): `4001` — Required in Production?: Yes
- Variable: `NEXT_PUBLIC_API_BASE_URL` — Consumer: `apps/web` — Default (Development): `http://localhost:4000` — Required in Production?: Yes

Never commit `.env`, `apps/api/.env`, or real credentials to Git.

## 7. Git Branching & Commit Conventions

Use focused feature branches off `main`:

- `feature/foundation`
- `feature/database`
- `feature/auth`
- `feature/problems`
- `feature/arena`
- `feature/submissions`
- `feature/judge`
- `feature/contests`
- `feature/aws`

Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).
