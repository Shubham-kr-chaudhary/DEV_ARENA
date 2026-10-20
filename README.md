# DevArena

DevArena is a production-oriented competitive programming platform built around a strict separation between the web/API layer and asynchronous, sandboxed code execution.

## Current Phase Status

- **Phase 1 — Repository Foundation (Complete)**
- **Phase 2 — Database & Repository Layer (Complete)**
- **Phase 3 — Authentication & Authorization (Complete)**:
  - `POST /api/v1/auth/register`, `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/me`
  - RFC 9106 **Argon2id** password hashing (`$argon2id$v=19$...`) with constant-time verification and automatic upgrade of development seed hashes
  - Database-backed opaque sessions (`Session.tokenHash` stored as SHA-256 hex digest) transmitted exclusively via `HttpOnly; SameSite=Lax` cookies (`Secure` in production)
  - Reusable Hono authentication, RBAC (`USER`, `ADMIN`), and IDOR ownership guards
  - Defense-in-depth CSRF protection (`Origin`/`Referer`, `Sec-Fetch-Site`, and JSON `Content-Type` enforcement)
  - Sliding-window rate limiting on registration and login with spoof-resistant IP resolution (`TRUST_PROXY=false` default)
  - Minimal Next.js typed cookie-based auth client (`apps/web/lib/api-client.ts`) and `/login` + `/register` pages

## Repository Layout

```text
apps/
  web/                 Next.js 16 App Router frontend (/login, /register, /problems)
  api/                 Hono + Node.js 22 HTTP API, Prisma 7, Repositories, Auth & RBAC
  judge-worker/        Asynchronous judge worker service

packages/
  api-contracts/       Browser/server Zod API contracts and DTOs
  config/              Server and worker environment validation
  shared/              Environment-neutral domain primitives

infra/
  local/postgres/      Local PostgreSQL 17 Docker Compose stack

docs/
  architecture.md      System architecture and boundaries
  database.md          Database model, migrations, seed, and repository layer
  api.md               API v1 specification and error handling
  judge.md             Asynchronous judge and language runner design
  security.md          Threat model and hostile code sandboxing
  deployment.md        CI/CD, migrations, rollbacks, and DR
  development.md       Local setup and workflow guide
  testing.md           Multi-layer verification strategy
  rendering.md         Next.js route rendering and performance
  aws.md               AWS production topology and cost model
  troubleshooting.md   Common operational and local dev fixes
  adr/                 Architecture Decision Records (ADR-001 to ADR-010)
```

## Prerequisites

- **Node.js**: `>=22.0.0`
- **pnpm**: `10.15.0` (managed via `corepack`)
- **Docker**: Required for running local PostgreSQL (`infra/local/postgres/compose.yml`)

## Local Setup & Verification

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose -f infra/local/postgres/compose.yml up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Run repository quality checks:

```bash
pnpm validate:foundation
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Start the development applications:

```bash
pnpm dev
```

- **Web**: `http://localhost:3000` (`/login`, `/register`, `/problems`)
- **API**: `http://localhost:4000` (`/health`, `/ready`, `/api/v1/auth/*`)
