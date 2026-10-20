# DevArena Deployment, Rollback & Disaster Recovery

## 1. Environments

DevArena strictly isolates three execution environments (`NODE_ENV`):

1. `development`: Local developer workstation using Docker Compose PostgreSQL (`infra/local/postgres/compose.yml`) and local SQS emulation. Never connects to production AWS resources.
2. `test`: Automated CI and local Vitest/Playwright test runs using isolated test databases and deterministic fixtures.
3. `production`: AWS cloud deployment managed via Terraform (`infra/terraform/`) with secrets injected from AWS Secrets Manager / Systems Manager Parameter Store.

## 2. CI/CD Pipeline (`.github/workflows/ci.yml`)

Every push to `main` and every pull request runs the automated GitHub Actions pipeline:

1. `pnpm install --frozen-lockfile` — Verifies deterministic dependency resolution.
2. `pnpm db:generate` — Generates the typed Prisma 7 client in `apps/api/src/generated/prisma`.
3. `pnpm typecheck` — Runs `tsc --noEmit` across all apps and shared packages under strict mode.
4. `pnpm lint` — Runs ESLint v9 flat configs across all workspaces.
5. `pnpm test` — Executes Vitest test suites across all packages and applications.
6. `pnpm build` — Verifies production builds for `apps/web`, `apps/api`, and `apps/judge-worker`.

### Controlled Production Promotion (Phase 9)

Production deployments are triggered only after CI passes on `main`:

1. Build multi-stage non-root Docker images for `apps/web`, `apps/api`, and `apps/judge-worker` tagged with the immutable Git commit SHA.
2. Push images to Amazon ECR with image scanning enabled.
3. Execute a one-off ECS migration task (`prisma migrate deploy`) against RDS PostgreSQL.
4. Roll out new ECS service task definitions (`devarena-api`, `devarena-web`, `devarena-judge-worker`) with ECS deployment circuit breaker enabled.
5. Verify `/health` and `/ready` (`200 OK`) before draining old tasks.

## 3. Rollback Strategy

- **Application Rollback**: ECS deployment circuit breaker automatically rolls back to the previous working task definition revision if new tasks fail `/health` or `/ready` checks. Manual rollback re-deploys the prior immutable commit-SHA ECR tag within `< 2 minutes`.
- **Database Migration Compatibility**: All production Prisma migrations must follow the **Expand-and-Contract** pattern:
  - Phase A (Expand): Add nullable columns, new tables, or additive enum values so both revision $N-1$ and revision $N$ of `apps/api` can run concurrently.
  - Phase B (Migrate/Backfill): Backfill data and switch application reads/writes.
  - Phase C (Contract): Drop deprecated columns in a subsequent release only after revision $N$ is stable.

## 4. Backups & Disaster Recovery

### Authoritative vs. Regenerable State

| Data Store               | Authority Level                                                                                            | Backup Mechanism                                                                                                    | Recovery Procedure                                                                                                       |
| :----------------------- | :--------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------- |
| **RDS PostgreSQL 17**    | **Authoritative System of Record** (Users, Problems, TestCases, Submissions, Contests, Ratings, AuditLogs) | Automated daily snapshots + continuous WAL archiving to S3 (14-day PITR retention) + pre-migration manual snapshots | Restore RDS instance to target timestamp via PITR (`RPO <= 5 minutes`, `RTO <= 30 minutes`) and update database endpoint |
| **Amazon S3**            | **Authoritative Object Store** (User avatars, large problem assets)                                        | S3 Versioning + server-side encryption (`SSE-S3` / `SSE-KMS`)                                                       | Restore previous object versions via S3 version history                                                                  |
| **Amazon SQS / DLQ**     | **Transient In-Flight Queue** (recoverable from PostgreSQL `Submission` table)                             | 14-day message retention on `SQS_DLQ_URL`                                                                           | Re-enqueue any `Submission` stuck in `QUEUED` or `RUNNING` beyond visibility threshold directly from PostgreSQL          |
| **ECS Containers & ECR** | **Stateless / Regenerable**                                                                                | Immutable ECR images + Git repository                                                                               | Redeploy from Terraform and ECR                                                                                          |

### Failure Recovery Runbooks

- **Database Outage**: `GET /ready` on `apps/api` immediately returns `503 Service Unavailable`, preventing the ALB from routing traffic to unhealthy tasks while `apps/judge-worker` pauses job acknowledgement (allowing SQS visibility timeouts to preserve in-flight jobs until RDS recovers).
- **Worker Crash Mid-Submission**: The worker does not delete the SQS message until results are committed. When `VisibilityTimeout` expires, SQS redelivers the job to a healthy worker, which safely re-runs the job idempotently (or routes to DLQ after `maxReceiveCount = 3`).
- **Poison Submission Causing Repeated Worker Crash**: Isolated in `SQS_DLQ_URL` after 3 attempts; admin inspects failure and marks submission `INTERNAL_ERROR`.
