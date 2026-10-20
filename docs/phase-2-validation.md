# Phase 2 Validation

## Scope Implemented in Phase 2

Phase 2 completes the PostgreSQL / Prisma 7 database schema reconciliation, incremental SQL migration, idempotent development seed script, and server-only repository layer:

1. **Reconciled Prisma Schema (`apps/api/prisma/schema.prisma`)**:
   - Added `User.passwordHash`, `Session`, and `OAuthAccount` (`OAuthProvider`: `GITHUB`, `GOOGLE`).
   - Added `Profile` rating (`rating`, `maxRating`, `rankTitle`) and statistics (`solvedCount`, `attemptedCount`, `contestCount`) with composite leaderboard indexes.
   - Added `ProblemStatus.REVIEW`, `ComparisonMode`, and `Problem` metadata (`examples`, `editorial`, `authorId`, `sourceSizeLimitBytes`, `comparisonMode`, `floatTolerance`).
   - Added `TestCase` metadata (`explanation`, `weight`, `group`, `updatedAt`).
   - Aligned `SubmissionStatus` to canonical specification verdicts (`COMPILATION_ERROR`, `INTERNAL_ERROR`, etc.) and added `Submission` execution context (`mode`, `contestId`, `idempotencyKey`, `judgeJobId`, `judgeAttempts`, `updatedAt`).
   - Aligned `ContestStatus` (`DRAFT`, `UPCOMING`, `RUNNING`, `ENDED`, `CANCELLED`) and added `ContestParticipant` scoring fields (`penaltyMinutes`, `solvedCount`, `lastAcceptedAt`).
   - Added `bestRuntimeMs`, `bestMemoryKb`, and `bestSubmissionId` to `UserProblemProgress`.
2. **Safe Incremental Migration (`20261017000000_phase2_schema_reconciliation`)**:
   - Preserved `20260922145432_init/migration.sql` unchanged.
   - Upgraded enums, tables, indexes, and foreign keys non-destructively with lossless `CASE` mapping for legacy enum values.
3. **Development Seed Script (`apps/api/prisma/seed.ts`)**:
   - Idempotent `upsert`-based seeding for development users (`dev_admin`, `alice_dev`, `bob_dev`), languages (`cpp`, `javascript`), 10 tags, and 4 sample problems with public and hidden test cases.
4. **Repository Layer (`apps/api/src/repositories/`)**:
   - Implemented `UserRepository`, `ProblemRepository`, `SubmissionRepository`, `ContestRepository`, `LeaderboardRepository`, and `AuditRepository` with unit tests in `apps/api/tests/repositories.test.ts` and `apps/api/tests/seed.test.ts`.

## Local Validation Commands

Start PostgreSQL 17 locally with Docker Compose:

```bash
docker compose -f infra/local/postgres/compose.yml up -d
```

Run the full Phase 2 verification suite:

```bash
pnpm install --frozen-lockfile
pnpm validate:foundation
pnpm db:generate
pnpm db:validate
pnpm db:migrate
pnpm db:seed
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
