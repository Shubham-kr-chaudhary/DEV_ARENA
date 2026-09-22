# Development

## Prerequisites

- Node.js 22+
- pnpm 10+

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
```

## Commands

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

## Workspace-specific commands

```bash
pnpm --filter @devarena/web dev
pnpm --filter @devarena/api dev
pnpm --filter @devarena/judge-worker dev
```

## Environment

`.env.example` documents configuration names. Do not commit `.env` files.

Phase 1 validates API server configuration. Database and AWS configuration will become mandatory only when those phases are implemented.

## Git workflow

Use focused feature branches:

```text
feature/auth
feature/problems
feature/arena
feature/submissions
feature/judge
feature/contests
feature/aws
```

Prefer conventional commits such as:

```text
feat: initialize monorepo
feat: add authentication
feat: add submission service
```

## Database development (Phase 2)

Start PostgreSQL locally:

```bash
docker compose -f infra/local/postgres/compose.yml up -d
```

Then generate the Prisma Client and create the initial development migration:

```bash
pnpm db:generate
pnpm db:migrate
```

For schema-only validation:

```bash
pnpm db:validate
```

Never commit `.env` or production database credentials.
