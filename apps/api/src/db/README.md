# API database boundary

Prisma is intentionally isolated under `apps/api/src/db`.

- `client.ts` owns Prisma client creation and shutdown.
- `health.ts` contains the minimal database liveness query used by future readiness checks.
- No browser package may import these modules.
- No judge-worker code may import these modules in the initial architecture.
