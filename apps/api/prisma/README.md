# DevArena database

This directory contains the Prisma schema and migrations for the API database.

## Local PostgreSQL

Use `infra/local/postgres/compose.yml` to run PostgreSQL locally with Docker:

```bash
docker compose -f infra/local/postgres/compose.yml up -d
```

The default development connection string is:

```text
postgresql://devarena:devarena@localhost:5432/devarena
```

## Prisma workflow

From the repository root:

```bash
pnpm --filter @devarena/api prisma:generate
pnpm --filter @devarena/api prisma:validate
pnpm --filter @devarena/api prisma:migrate
```

`prisma:migrate` creates and applies a named development migration. Do not use a database reset command against a database containing data unless the reset is explicitly intended.
