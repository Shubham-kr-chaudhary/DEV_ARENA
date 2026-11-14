# Testing Strategy

## 1. Testing Philosophy

Testing is a mandatory engineering gate in every phase. No feature is considered complete until automated tests verify both its expected behavior and its security/failure boundaries.

## 2. Test Layers

- Layer: **1. Foundation & Structural Validation** — Runner & Location: `node scripts/validate-foundation.mjs` — Scope: Verifies required workspace manifests, documentation completeness, LF line-ending consistency, absence of `.env` leaks, and server/client import boundaries.
- Layer: **2. Unit Tests** — Runner & Location: Vitest (`packages/*/tests`, `apps/*/tests`) — Scope: Pure domain logic: configuration validation (`@devarena/config`), API contract schemas (`@devarena/api-contracts`), output comparison modes, submission state transitions, contest scoring, and rating calculations.
- Layer: **3. API & Database Integration Tests** — Runner & Location: Vitest + PostgreSQL (`apps/api/tests`) — Scope: HTTP route validation, `/health` and `/ready` probes, Argon2id auth + session cookies, RBAC (`USER` vs `ADMIN`), IDOR protection, hidden test-case stripping, pagination, and idempotency keys.
- Layer: **4. Judge Execution & Security Corpus** — Runner & Location: Vitest (`apps/judge-worker/tests`) — Scope: C++20 and Node.js 22 fixture programs covering `ACCEPTED`, `WRONG_ANSWER`, `COMPILATION_ERROR`, `RUNTIME_ERROR`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `OUTPUT_LIMIT_EXCEEDED`, fork bombs, network denial, and filesystem isolation.
- Layer: **5. Frontend Component Tests** — Runner & Location: Vitest + Testing Library (`apps/web/tests`) — Scope: Catalogue filter/search state, Arena per-language draft persistence (`cpp` <-> `javascript`), console result tabs, and accessible form validation.
- Layer: **6. End-to-End (E2E) Tests** — Runner & Location: Playwright (`e2e/` in Phase 13) — Scope: Complete user journeys: Registration -> Login -> Problem Discovery -> Arena Sample Run -> Official Submission -> Verdict Polling -> Profile & Contest Leaderboard Updates.

## 3. Phase 1 Test Coverage

In Phase 1, executable Vitest suites verify:

- `packages/shared/tests/index.test.ts`: Canonical roles, problem difficulties/statuses, submission verdicts, execution modes, and initial language slugs.
- `packages/config/tests/index.test.ts`: Server and worker configuration defaults, empty-string optional URL normalization, and production fail-fast guards on `SESSION_SECRET` and `SQS_QUEUE_URL`.
- `packages/api-contracts/tests/index.test.ts`: Health, readiness (`ready` / `not_ready`), error envelope, and pagination schemas.
- `apps/api/tests/app.test.ts`: `GET /health` (`200 OK`) and `GET /ready` (`200 OK` when database check passes; `503 Service Unavailable` when database check returns `false` or throws).
- `apps/judge-worker/tests/index.test.ts`: Worker runtime initialization, queue configuration detection, and graceful shutdown readiness transitions.
- `apps/web/tests/page.test.ts`: Web workspace test runner entry point.
