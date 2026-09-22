# Phase 2 Validation

## Scope

Phase 2 establishes PostgreSQL/Prisma tooling, the initial domain schema, the API-side Prisma client boundary, and local PostgreSQL development infrastructure.

## Validation performed during generation

The Phase 2 source and configuration were reviewed structurally. The current execution environment does not provide Docker or registry access, so Prisma packages could not be installed/generated and a live PostgreSQL migration could not be executed here.

The repository must therefore complete the runtime database validation locally after dependency installation:

```bash
pnpm install
pnpm --filter @devarena/api prisma:generate
pnpm --filter @devarena/api prisma:migrate
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```

If Docker is available, start PostgreSQL first:

```bash
docker compose -f infra/local/postgres/compose.yml up -d
```

If Docker is unavailable, use a local PostgreSQL installation with the same `DATABASE_URL` shape.

## Important limitation

Do not consider Phase 2 migration validation complete until `prisma migrate` succeeds against PostgreSQL and the generated client passes the repository validation commands above.
