# DevArena API Architecture & Specification

## 1. Overview

The DevArena HTTP API (`apps/api`) is a standalone Node.js 22 + TypeScript + Hono v4 application. All domain endpoints are versioned under `/api/v1/*`, while operational probes are exposed at `/health` and `/ready`.

- **Thin Controllers**: Route handlers only parse/validate inputs via Zod schemas from `@devarena/api-contracts`, invoke domain services, and serialize typed responses.
- **No Code Execution**: The API never compiles or runs user code; `POST /api/v1/runs` and `POST /api/v1/submissions` persist records and enqueue jobs to Amazon SQS.

## 2. Operational Health & Readiness Probes

| Endpoint  | Method | Success Status | Failure Status            | Behavior                                                                                                                                                                 |
| :-------- | :----- | :------------- | :------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health` | `GET`  | `200 OK`       | N/A                       | Liveness check confirming the Node.js HTTP process is responsive (`{ "status": "ok", "service": "api" }`).                                                               |
| `/ready`  | `GET`  | `200 OK`       | `503 Service Unavailable` | Readiness check executing `SELECT 1` against PostgreSQL via Prisma (`{ "status": "ready" \| "not_ready", "service": "api", "checks": { "database": "up" \| "down" } }`). |

## 3. Versioned API Surface (`/api/v1`)

### Authentication (`/api/v1/auth`)

| Method & Path                | Auth    | Rate Limit        | Description                                                                                                           |
| :--------------------------- | :------ | :---------------- | :-------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/register` | Public  | 5 req / 15m / IP  | Registers a new `USER` account, hashes password with Argon2id, creates `Profile`, and sets `HttpOnly` session cookie. |
| `POST /api/v1/auth/login`    | Public  | 10 req / 15m / IP | Authenticates credentials, records session in PostgreSQL, and sets `HttpOnly` session cookie.                         |
| `POST /api/v1/auth/logout`   | Session | 30 req / 1m       | Revokes active `Session` in PostgreSQL and clears session cookie.                                                     |
| `GET /api/v1/auth/me`        | Session | 120 req / 1m      | Returns authenticated user identity, profile summary, and role.                                                       |

### Problems (`/api/v1/problems`)

| Method & Path                | Auth     | Description                                                                                                                                                                      |
| :--------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/problems`       | Optional | Paginated catalogue of `PUBLISHED` problems supporting `search`, `difficulty`, `tag`, `page`, and `pageSize` filters. Includes `solved` / `attempted` status when authenticated. |
| `GET /api/v1/problems/:slug` | Optional | Returns full problem statement, constraints, input/output formats, supported languages, resource limits, and **public sample test cases only** (`isPublic = true`).              |

### Code Execution: Runs & Submissions (`/api/v1/runs`, `/api/v1/submissions`)

| Method & Path                      | Auth             | Rate Limit          | Description                                                                                                                                                                         |
| :--------------------------------- | :--------------- | :------------------ | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/runs`                | `USER` / `ADMIN` | 15 req / 1m / User  | Enqueues an asynchronous sample-test run (`source = RUN`) against public test cases only. Returns `202 Accepted` with `runId` / `submissionId`.                                     |
| `POST /api/v1/submissions`         | `USER` / `ADMIN` | 10 req / 1m / User  | Validates source size (`<= 64 KB`), enforces `Idempotency-Key`, creates permanent `Submission` (`QUEUED`), enqueues SQS job, and returns `202 Accepted`.                            |
| `GET /api/v1/submissions/:id`      | Owner / `ADMIN`  | 120 req / 1m / User | Polls submission status and verdict. Returns test-level Input/Expected/Actual **only** for public test cases; hidden test cases expose aggregate pass/fail counts and verdict only. |
| `GET /api/v1/users/me/submissions` | `USER` / `ADMIN` | 60 req / 1m / User  | Paginated submission history for the authenticated user, filterable by `problemSlug`, `languageSlug`, and `status`.                                                                 |

### Users, Leaderboard & Contests

| Method & Path                          | Auth             | Description                                                                                                                                    |
| :------------------------------------- | :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/users/:username`          | Public           | Public developer profile (bio, avatar, rating, rank, solved count, recent activity, rating history). Never exposes email or password metadata. |
| `GET /api/v1/users/me/stats`           | `USER` / `ADMIN` | Detailed progress breakdown (attempted, solved by difficulty, best runtime/memory) for the current user.                                       |
| `GET /api/v1/leaderboard`              | Public           | Paginated global leaderboard ordered by `rating DESC, solvedCount DESC`.                                                                       |
| `GET /api/v1/contests`                 | Public           | Paginated list of upcoming, live, and finished contests with server-computed state.                                                            |
| `GET /api/v1/contests/:slug`           | Optional         | Contest details, schedule window, registration status, and problem list (problems revealed only once `now >= startsAt` or for `ADMIN`).        |
| `POST /api/v1/contests/:id/register`   | `USER` / `ADMIN` | Enrolls authenticated user into an `UPCOMING` or `RUNNING` contest.                                                                            |
| `GET /api/v1/contests/:id/leaderboard` | Public           | Paginated contest standings ordered by `finalScore DESC, penaltyMinutes ASC`.                                                                  |

### Administration (`/api/v1/admin`)

All `/api/v1/admin/*` endpoints require an authenticated session with `role === 'ADMIN'` and write an entry to `AuditLog`:

- `POST /api/v1/admin/problems` — Create draft problem
- `PATCH /api/v1/admin/problems/:id` — Edit problem metadata, statement, limits, and tags
- `POST /api/v1/admin/problems/:id/publish` — Validate at least one public and one hidden test case exist, then transition status to `PUBLISHED`
- `POST /api/v1/admin/problems/:id/archive` — Transition status to `ARCHIVED`
- `POST /api/v1/admin/problems/:id/test-cases` — Add or replace public/hidden test cases
- `POST /api/v1/admin/contests` / `PATCH /api/v1/admin/contests/:id` — Create and manage contests

## 4. Validation, Error Handling & Security Policies

- **Zod Validation**: Every route validates `body`, `query`, and `params` using schemas from `@devarena/api-contracts`.
- **Request Size Limits**: HTTP body size is capped at `128 KB` globally (`64 KB` max `sourceCode` length).
- **Standardized Error Envelope**:
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
- **Zero Stack Trace Leakage**: Unhandled exceptions are logged with structured correlation IDs on the server and return a generic `500 INTERNAL_ERROR` payload to clients.
