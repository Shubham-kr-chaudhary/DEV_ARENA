# ADR-007 — Asynchronous Queueing and Submission Idempotency

## Status

Accepted — Phase 1.

## Context

DevArena's code judge evaluates untrusted C++ and JavaScript submissions asynchronously outside the HTTP API cycle (per ADR-004). Distributed message queues guarantee at-least-once delivery rather than exactly-once execution: workers can crash mid-run, visibility timeouts can expire during heavy contest bursts, and clients can retry submission HTTP requests on flaky connections.

Without explicit queueing and idempotency rules, duplicate deliveries could:

- Create duplicate permanent `Submission` records
- Execute or overwrite finalized verdicts out of order
- Increment user solved counts or attempt counters multiple times
- Apply contest penalties or rating deltas twice

## Options

1. **In-memory queue inside the API process** — zero external infrastructure, but loses all queued jobs on API restart and violates horizontal scaling.
2. **Redis / BullMQ** — fast job processing, but requires an always-on Redis cluster in AWS with persistent memory cost even when traffic is idle.
3. **Amazon SQS Standard Queues + Dead-Letter Queue (DLQ) + PostgreSQL transactional idempotency** — pay-per-request managed queueing with explicit visibility timeouts, bounded retries, DLQ isolation for poison jobs, and database-enforced state transitions.

## Decision

Use **Amazon SQS** (`@aws-sdk/client-sqs`) with a Dead-Letter Queue (`SQS_DLQ_URL`) and enforce end-to-end idempotency in PostgreSQL:

1. **Separate Execution Modes (`RUN` vs. `SUBMIT`)**:
   - Both `RUN` (public sample tests) and `SUBMIT` (public + hidden tests) travel through SQS to `apps/judge-worker` so the API never executes code.
2. **Submission Idempotency Key**:
   - `POST /api/v1/submissions` accepts an optional client `Idempotency-Key` header (or body field) scoped to `(userId, idempotencyKey)` so network retries return the existing `Submission` rather than enqueueing duplicates.
3. **Compare-And-Swap (CAS) Worker Claim**:
   - When `apps/judge-worker` receives an SQS message, it claims the job via a guarded state check (`status IN ('QUEUED', 'RUNNING')` and not already in a terminal verdict). If the submission is already in a terminal state (`ACCEPTED`, `WRONG_ANSWER`, `COMPILATION_ERROR`, `RUNTIME_ERROR`, `TIME_LIMIT_EXCEEDED`, `MEMORY_LIMIT_EXCEEDED`, `OUTPUT_LIMIT_EXCEEDED`, `INTERNAL_ERROR`, `CANCELLED`), the worker logs a duplicate-delivery notice and deletes the SQS message immediately without re-running code.
4. **Idempotent Per-Test Persistence**:
   - `SubmissionTestResult` enforces a composite unique constraint on `(submissionId, testCaseId)` and uses `upsert` so retried worker runs overwrite partial test records deterministically.
5. **Transactional Verdict Finalization**:
   - Finalizing a submission verdict, updating `UserProblemProgress`, and updating `ContestParticipant` standings occur inside a single PostgreSQL transaction guarded by `WHERE id = $submissionId AND status = 'RUNNING'`.
6. **Bounded Retries and Poison Message Isolation**:
   - SQS redrive policy routes messages exceeding `maxReceiveCount = 3` to the Dead-Letter Queue (`SQS_DLQ_URL`), where they are flagged for administrative inspection (`INTERNAL_ERROR`) rather than retrying indefinitely.

## Consequences

- Duplicate SQS deliveries and worker restarts are safe and cannot corrupt user progress, contest scores, or rating history.
- Local development uses an SQS-compatible local endpoint (ElasticMQ or LocalStack) via the same `@aws-sdk/client-sqs` boundary.
- Pay-per-request SQS with 20-second long polling keeps idle queue costs near zero.
