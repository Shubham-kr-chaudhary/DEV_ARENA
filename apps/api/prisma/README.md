# DevArena Database (`apps/api/prisma`)

This directory contains the Prisma 7 schema (`schema.prisma`), SQL migration history (`migrations/`), and idempotent development seed script (`seed.ts`).

## Local PostgreSQL

Use `infra/local/postgres/compose.yml` to run PostgreSQL 17 locally with Docker:

```bash
docker compose -f infra/local/postgres/compose.yml up -d
```

The default development connection string is:

```text
postgresql://devarena:devarena@localhost:5432/devarena
```

## Prisma & Seed Workflow

From the repository root:

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate
pnpm db:seed
```

- `20260922145432_init`: Baseline database schema migration.
- `20261017000000_phase2_schema_reconciliation`: Non-destructive incremental migration upgrading the baseline schema to match the Master Engineering Specification.
- `seed.ts`: Idempotent development seed script (`NODE_ENV != 'production'`) creating development users (`dev_admin`, `alice_dev`, `bob_dev`), supported languages (`cpp`, `javascript`), 10 canonical tags, and 4 sample problems with public and hidden test cases.
