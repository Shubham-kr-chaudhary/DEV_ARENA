# DevArena

DevArena is a production-oriented competitive programming platform built around a strict separation between the application layer and hostile code execution.

## Phase 1 status

Phase 1 establishes the repository foundation only:

- pnpm workspace monorepo
- Next.js web application
- Hono API application
- Judge-worker application shell
- Shared packages
- Strict TypeScript
- ESLint
- Prettier
- Environment configuration
- GitHub Actions CI foundation

Database, authentication, problems, Arena, SQS judging, sandbox execution, contests, ratings, and AWS infrastructure are intentionally deferred to later phases.

## Repository layout

```text
apps/
  web/                 Next.js frontend
  api/                 Hono API
  judge-worker/        Judge worker foundation

packages/
  api-contracts/       Browser/server API contracts
  config/              Validated server configuration
  shared/              Environment-neutral shared primitives

docs/
  architecture.md
  development.md
  rendering.md
  testing.md
  adr/

.github/
  workflows/
```

## Requirements

- Node.js 22+
- pnpm 10+

The repository pins the package manager through `packageManager` in the root `package.json`.

## Local setup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Start the development applications:

```bash
pnpm dev
```

Web: http://localhost:3000  
API: http://localhost:4000

## Architecture boundary

The API never executes submitted code.

```text
Browser
  -> Next.js
  -> Hono API
  -> SQS
  -> Judge Worker
  -> isolated execution environment
```

That execution boundary is a core security invariant and will be implemented in the judge phases.

## Phase discipline

Each phase is intentionally isolated. See `docs/architecture.md` and the ADRs for the decisions made during Phase 0 and the repository implications introduced in Phase 1.
