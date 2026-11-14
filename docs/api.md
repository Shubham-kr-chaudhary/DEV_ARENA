# DevArena API Architecture & Specification

## 1. Overview

The DevArena HTTP API (`apps/api`) is a standalone Node.js 22 + TypeScript + Hono v4 application. All domain endpoints are versioned under `/api/v1/*`, while operational probes are exposed at `/health` and `/ready`.

- **Thin Controllers**: Route handlers only parse/validate inputs via Zod schemas from `@devarena/api-contracts`, invoke domain services, and serialize typed responses.
- **No Code Execution**: The API never compiles or runs user code; `POST /api/v1/runs` and `POST /api/v1/submissions` persist records and enqueue jobs to Amazon SQS.

## 2. Operational Health & Readiness Probes

- Endpoint: `/health` — Method: `GET` — Success Status: `200 OK` — Failure Status: N/A — Behavior: Liveness check confirming the Node.js HTTP process is responsive (`{ "status": "ok", "service": "api" }`).
- Endpoint: `/ready` — Method: `GET` — Success Status: `200 OK` — Failure Status: `503 Service Unavailable` — Behavior: Readiness check executing `SELECT 1` against PostgreSQL via Prisma (`{ "status": "ready"

## 3. Versioned API Surface (`/api/v1`)

### Authentication (`/api/v1/auth`)

- Method & Path: `POST /api/v1/auth/register` — Auth: Public — Rate Limit: 5 req / 15m / IP — Description: Registers a new `USER` account, hashes password with Argon2id, creates `Profile`, and sets `HttpOnly` session cookie.
- Method & Path: `POST /api/v1/auth/login` — Auth: Public — Rate Limit: 10 req / 15m / IP — Description: Authenticates credentials, records session in PostgreSQL, and sets `HttpOnly` session cookie.
- Method & Path: `POST /api/v1/auth/logout` — Auth: Session — Rate Limit: 30 req / 1m — Description: Revokes active `Session` in PostgreSQL and clears session cookie.
- Method & Path: `GET /api/v1/auth/me` — Auth: Session — Rate Limit: 120 req / 1m — Description: Returns authenticated user identity, profile summary, and role.

### Problems (`/api/v1/problems`)

- Method & Path: `GET /api/v1/problems` — Auth: Optional — Description: Paginated catalogue of `PUBLISHED` problems supporting `search`, `difficulty`, `tag`, `status` (`SOLVED`, `ATTEMPTED`, `UNSOLVED`), `sortBy` (`newest`, `oldest`, `title`, `difficulty`), `sortOrder` (`asc`, `desc`), `page`, and `pageSize` filters. Includes `availableTags` and per-problem `userProgressStatus`.
- Method & Path: `GET /api/v1/problems/:slug` — Auth: Optional — Description: Returns full problem statement, constraints, input/output formats, public examples, comparison mode, supported languages, resource limits, and **public sample test cases only** (`isPublic = true`). Never exposes hidden test cases, private editorials, or unpublished problems.

### Code Execution: Runs & Submissions (`/api/v1/runs`, `/api/v1/submissions`)

- Method & Path: `POST /api/v1/runs` — Auth: `USER` / `ADMIN` — Rate Limit: 15 req / 1m / User — Description: Enqueues an asynchronous sample-test run (`source = RUN`) against public test cases only. Returns `202 Accepted` with `runId` / `submissionId`.
- Method & Path: `POST /api/v1/submissions` — Auth: `USER` / `ADMIN` — Rate Limit: 10 req / 1m / User — Description: Validates source size (`<= 64 KB`), enforces `Idempotency-Key`, creates permanent `Submission` (`QUEUED`), enqueues SQS job, and returns `202 Accepted`.
- Method & Path: `GET /api/v1/submissions/:id` — Auth: Owner / `ADMIN` — Rate Limit: 120 req / 1m / User — Description: Polls submission status and verdict. Returns test-level Input/Expected/Actual **only** for public test cases; hidden test cases expose aggregate pass/fail counts and verdict only.
- Method & Path: `GET /api/v1/users/me/submissions` — Auth: `USER` / `ADMIN` — Rate Limit: 60 req / 1m / User — Description: Paginated submission history for the authenticated user, filterable by `problemSlug`, `languageSlug`, and `status`.

### Users, Leaderboard & Contests

- Method & Path: `GET /api/v1/users/:username` — Auth: Public — Description: Public developer profile (bio, avatar, rating, rank, solved count, recent activity, rating history). Never exposes email or password metadata.
- Method & Path: `GET /api/v1/users/me/stats` — Auth: `USER` / `ADMIN` — Description: Detailed progress breakdown (attempted, solved by difficulty, best runtime/memory) for the current user.
- Method & Path: `GET /api/v1/leaderboard` — Auth: Public — Description: Paginated global leaderboard ordered by `rating DESC, solvedCount DESC`.
- Method & Path: `GET /api/v1/contests` — Auth: Public — Description: Paginated list of upcoming, live, and finished contests with server-computed state.
- Method & Path: `GET /api/v1/contests/:slug` — Auth: Optional — Description: Contest details, schedule window, registration status, and problem list (problems revealed only once `now >= startsAt` or for `ADMIN`).
- Method & Path: `POST /api/v1/contests/:id/register` — Auth: `USER` / `ADMIN` — Description: Enrolls authenticated user into an `UPCOMING` or `RUNNING` contest.
- Method & Path: `GET /api/v1/contests/:id/leaderboard` — Auth: Public — Description: Paginated contest standings ordered by `finalScore DESC, penaltyMinutes ASC`.

### Administration (`/api/v1/admin`)

All `/api/v1/admin/*` endpoints require an authenticated session with `role === 'ADMIN'` and write an entry to `AuditLog`:

- `GET /api/v1/admin/problems` — Paginated list of all problems (`DRAFT`, `REVIEW`, `PUBLISHED`, `ARCHIVED`) with public and hidden test-case counts
- `GET /api/v1/admin/problems/:id` — Full administrative problem detail including private editorial and all public + hidden test cases
- `POST /api/v1/admin/problems` — Create draft problem
- `PATCH /api/v1/admin/problems/:id` — Edit problem metadata, statement, editorial, limits, comparison mode, and tags
- `PUT /api/v1/admin/problems/:id/test-cases` (`POST /api/v1/admin/problems/:id/test-cases`) — Atomically replace public and hidden test cases (enforces that `PUBLISHED` problems retain at least one public and one hidden test case)
- `POST /api/v1/admin/problems/:id/publish` — Validate at least one public and one hidden test case exist, then transition status to `PUBLISHED`
- `POST /api/v1/admin/problems/:id/unpublish` — Transition status back to `DRAFT`
- `POST /api/v1/admin/problems/:id/archive` — Transition status to `ARCHIVED`
- `POST /api/v1/admin/contests` / `PATCH /api/v1/admin/contests/:id` — Create and manage contests

## 4. Validation, Error Handling & Security Policies

- **Zod Validation**: Every route validates `body`, `query`, and `params` using schemas from `@devarena/api-contracts`.
- **Request Size Limits**: HTTP body size is capped at `128 KB` globally (`64 KB` max `sourceCode` length).
- **Standardized Error Envelope**: All error responses follow a uniform JSON schema (`apiErrorResponseSchema`).
- **Zero Stack Trace Leakage**: Unhandled exceptions are logged with structured correlation IDs on the server and return a generic `500 INTERNAL_ERROR` payload to clients.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Source code exceeds maximum allowed size of 65536 bytes",
    "requestId": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "details": [{ "field": "sourceCode", "message": "Max length is 65536 bytes" }]
  }
}
```
