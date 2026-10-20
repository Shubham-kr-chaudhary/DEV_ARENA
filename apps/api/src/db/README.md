# API Database & Repository Boundary

Prisma is strictly isolated under `apps/api/src/db` and accessed through the typed domain repositories in `apps/api/src/repositories`.

- `src/db/client.ts` owns Prisma 7 client creation (`@prisma/adapter-pg`) and graceful shutdown (`disconnectPrisma()`).
- `src/db/health.ts` provides `checkDatabaseHealth()` (`SELECT 1`) used by `GET /ready`.
- `src/repositories/` provides server-only data-access classes (`UserRepository`, `ProblemRepository`, `SubmissionRepository`, `ContestRepository`, `LeaderboardRepository`, `AuditRepository`) enforcing ownership checks, hidden test-case masking, pagination bounds, and transactional invariants.
- Browser packages (`apps/web`, `packages/api-contracts`, `packages/shared`) must never import these modules.
