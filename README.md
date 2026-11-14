# DevArena

DevArena is a production-oriented competitive programming platform built around a strict separation between the web/API layer and asynchronous, sandboxed code execution.

## Current Phase Status

- **Phase 1 — Repository Foundation (Complete)**
- **Phase 2 — Database & Repository Layer (Complete)**
- **Phase 3 — Authentication & Authorization (Complete)**
- **Phase 4 — Problem System (Complete)**
- **Phase 5 — Coding Arena Frontend (Complete)**:
  - Split-pane Coding Arena at `/arena/[problemSlug]` (`apps/web/app/arena/[problemSlug]/page.tsx`) with pointer-draggable and keyboard-accessible vertical splitter on desktop and responsive 3-pane switcher (`Problem Statement`, `Code Editor`, `Test Cases`) on tablet/mobile viewports
  - Dynamic client-only Monaco Editor integration (`apps/web/components/arena/CodeEditorLazy.tsx` & `MonacoCodeEditor.tsx`) with custom `devarena-zinc-dark` theme, C++20 (`main.cpp`) and JavaScript Node.js 22 ESM (`solution.mjs`) language switching, standard-I/O starter templates, configurable font size, and a synchronized line-numbered fallback code editor for offline environments
  - Fault-tolerant, SSR-safe `localStorage` draft persistence (`apps/web/lib/arena-storage.ts`) isolated per `(problemSlug, languageSlug)` with `250ms` debounced writes and 2-step template reset confirmation
  - Interactive Testbench Dock (`apps/web/components/arena/ArenaTestbenchPanel.tsx`) with public Sample Test Cases selector, editable Custom Input (`stdin`) buffer, and honest Phase 5 execution-stage validation (ready for Phase 6 `POST /api/v1/runs` and `POST /api/v1/submissions`)

## Repository Layout

```text
apps/
  web/                 Next.js 16 App Router frontend (/login, /register, /problems, /problems/[slug], /arena/[problemSlug], /admin/problems)
  api/                 Hono + Node.js 22 HTTP API, Prisma 7, Repositories, Auth, RBAC & Problem System
  judge-worker/        Asynchronous judge worker service

packages/
  api-contracts/       Browser/server Zod API contracts and DTOs
  config/              Server and worker environment validation
  shared/              Environment-neutral domain primitives

infra/
  local/postgres/      Local PostgreSQL 17 Docker Compose stack

docs/
  architecture.md      System architecture and boundaries
  database.md          Database model, migrations, seed, and repository layer
  api.md               API v1 specification and error handling
  judge.md             Asynchronous judge and language runner design
  security.md          Threat model and hostile code sandboxing
  deployment.md        CI/CD, migrations, rollbacks, and DR
  development.md       Local setup and workflow guide
  testing.md           Multi-layer verification strategy
  rendering.md         Next.js route rendering and performance
  aws.md               AWS production topology and cost model
  troubleshooting.md   Common operational and local dev fixes
  adr/                 Architecture Decision Records (ADR-001 to ADR-010)
```

## Prerequisites

- **Node.js**: `>=22.0.0`
- **pnpm**: `10.15.0` (managed via `corepack`)
- **Docker**: Required for running local PostgreSQL (`infra/local/postgres/compose.yml`)

## Local Setup & Verification

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose -f infra/local/postgres/compose.yml up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Run repository quality checks:

```bash
pnpm validate:foundation
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Start the development applications:

```bash
pnpm dev
```

- **Web**: `http://localhost:3000` (`/login`, `/register`, `/problems`, `/problems/[slug]`, `/arena/[problemSlug]`, `/admin/problems`)
- **API**: `http://localhost:4000` (`/health`, `/ready`, `/api/v1/auth/*`, `/api/v1/problems/*`, `/api/v1/admin/problems/*`)
