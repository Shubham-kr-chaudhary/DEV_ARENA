# ADR-006: PostgreSQL with Prisma ORM 7

## Status

Accepted — Phase 2.

## Decision

Use PostgreSQL as the system of record and Prisma ORM 7 as the schema/migration/type-safe data-access layer. The API owns database access; browser code, shared browser-safe packages, and the judge worker do not connect directly to PostgreSQL.

Prisma 7 uses a `prisma.config.ts` file for CLI datasource configuration, an explicit generated-client output, and a PostgreSQL driver adapter (`@prisma/adapter-pg`) for runtime connections.

## Rationale

- PostgreSQL provides relational integrity, transactions, mature indexing, and operational support on AWS RDS.
- Prisma provides a typed schema and migration workflow suitable for a TypeScript monorepo.
- Keeping the database boundary inside `apps/api` prevents credentials and server-only database code from entering browser bundles.
- Driver-adapter based runtime access keeps the connection implementation explicit and compatible with Prisma 7.

## Consequences

- Database schema changes must be reviewed through Prisma migrations.
- Production migration execution is a deployment concern and must not be coupled to API startup.
- The API must manage Prisma connection lifecycle during startup/shutdown.
- The judge worker does not receive PostgreSQL credentials unless a future design explicitly requires database access.
