# DevArena Database

## Phase 2 scope

DevArena uses PostgreSQL as its primary relational datastore and Prisma ORM 7 for schema management, migrations, and typed database access.

The database is owned by `apps/api`. Frontend code never imports Prisma, and the judge worker does not connect to PostgreSQL in the initial architecture.

## Core entities

- `User` and `Profile`: identity and public profile data.
- `Problem`, `Tag`, `ProblemTag`, `TestCase`: programming problem definitions and deterministic test inputs/outputs.
- `Language`: enabled programming-language metadata. Runner commands remain server-owned rather than stored as executable database configuration.
- `Submission` and `SubmissionTestResult`: immutable submitted source plus per-test execution results.
- `Contest`, `ContestProblem`, `ContestParticipant`: contest composition and participation.
- `RatingHistory`: append-only rating changes associated with users and optionally contests.
- `UserProblemProgress`: per-user problem attempt/solve state.
- `AuditLog`: security/administrative audit events.

## Data-integrity rules

- Primary keys use UUIDs.
- User email, profile username, problem slug, tag slug/name, language slug, and contest slug are unique.
- Problem/test-case ordering is unique within its parent.
- Many-to-many relationships use explicit join models where additional constraints or future metadata are useful.
- Foreign-key deletion behavior is explicit.
- Submission source code is retained with the submission record so judging can be reproduced/audited. It must never be rendered as executable HTML or executed by the API.
- Test-case expected output is server-controlled and must never be exposed through public problem APIs when `isPublic=false`.

## Indexing

Indexes are intentionally aligned with expected access paths: user submission history, problem submission history, queued/running submissions, contest standings, active problems, progress lookups, and audit history.

Avoid adding speculative indexes without query evidence because every index increases write cost and storage usage.

## Local development

1. Start PostgreSQL with Docker Compose or use a local PostgreSQL installation.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Install dependencies.
4. Generate Prisma Client.
5. Create/apply the development migration.

Commands:

```bash
pnpm install
pnpm --filter @devarena/api prisma:generate
pnpm --filter @devarena/api prisma:migrate
```

Do not run destructive reset commands against a database that contains data you care about.

## Production

Production uses PostgreSQL on AWS RDS. Connection secrets are injected through the deployment environment/Secrets Manager rather than committed files. Production migration execution should be a controlled deployment step and should complete before application code requiring the new schema is promoted.
