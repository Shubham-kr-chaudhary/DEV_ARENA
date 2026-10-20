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

| Variable                   | Consumer                        | Default (Development)                                    | Required in Production?                          |
| :------------------------- | :------------------------------ | :------------------------------------------------------- | :----------------------------------------------- |
| `NODE_ENV`                 | All                             | `development`                                            | Yes (`production`)                               |
| `API_HOST`                 | `apps/api`                      | `127.0.0.1`                                              | Yes (`0.0.0.0` in container)                     |
| `API_PORT`                 | `apps/api`                      | `4000`                                                   | Yes                                              |
| `CORS_ORIGIN`              | `apps/api`                      | `http://localhost:3000`                                  | Yes (exact web origin)                           |
| `DATABASE_URL`             | `apps/api`                      | `postgresql://devarena:devarena@localhost:5432/devarena` | Yes (RDS connection URL)                         |
| `SESSION_SECRET`           | `apps/api`                      | Development fallback secret                              | Yes (`>= 32` random chars; placeholder rejected) |
| `AWS_REGION`               | `apps/api`, `apps/judge-worker` | `ap-south-1`                                             | Yes                                              |
| `SQS_QUEUE_URL`            | `apps/api`, `apps/judge-worker` | `undefined` (optional in Phase 1)                        | Yes                                              |
| `SQS_DLQ_URL`              | `apps/api`, `apps/judge-worker` | `undefined` (optional in Phase 1)                        | Yes                                              |
| `S3_BUCKET`                | `apps/api`                      | `undefined` (optional in Phase 1)                        | Optional until S3 uploads enabled                |
| `WORKER_CONCURRENCY`       | `apps/judge-worker`             | `2`                                                      | Yes                                              |
| `WORKER_POLL_WAIT_SECONDS` | `apps/judge-worker`             | `20`                                                     | Yes                                              |
| `WORKER_HEALTH_PORT`       | `apps/judge-worker`             | `4001`                                                   | Yes                                              |
| `NEXT_PUBLIC_API_BASE_URL` | `apps/web`                      | `http://localhost:4000`                                  | Yes                                              |

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
