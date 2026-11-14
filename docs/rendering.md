# Frontend Rendering & Performance Strategy

## 1. Guiding Principles

DevArena uses the **Next.js 16 App Router** (`apps/web/app`) with React 19 Server Components and isolated Client Components (`'use client'`) where browser interactivity, local draft persistence, or Monaco Editor integration is required.

- **Never Load Monaco on Public Routes**: `MonacoCodeEditor` is dynamically imported via `next/dynamic(..., { ssr: false })` inside `apps/web/components/arena/CodeEditorLazy.tsx` and mounted exclusively on `/arena/[problemSlug]` (and future `/contests/[slug]/arena`).
- **Server-First Public Content**: Marketing, catalogue, problem statements, leaderboards, and public profiles avoid downloading the code-editor runtime.
- **No Uncached Private Data**: Authenticated user views (`/me/submissions`, `/admin/*`, active contest arenas) use `Cache-Control: no-store`.

## 2. Route-by-Route Rendering Matrix

- Route: `/` — Rendering Mode: Static / Server Component (SSG + ISR) — Data Source: Build-time static content + optional summary stats — Caching Strategy: `revalidate: 300` — Auth Requirement: Public — Why This Strategy Was Chosen: Zero client JS overhead for landing page visitors; instant LCP and SEO indexing.
- Route: `/problems` — Rendering Mode: Client filter controls + typed API catalogue — Data Source: `GET /api/v1/problems` — Caching Strategy: Public list cached (`60s`); personalized solve badges fetched dynamically when session cookie exists — Auth Requirement: Public (optional Auth) — Why This Strategy Was Chosen: Crawlable problem catalogue with fast initial paint, filter controls, and direct "Solve in Arena" links.
- Route: `/problems/[slug]` — Rendering Mode: Problem Statement View — Data Source: `GET /api/v1/problems/:slug` — Caching Strategy: Problem metadata cached (`60s`), invalidated on admin publish/update — Auth Requirement: Public (`PUBLISHED` only) — Why This Strategy Was Chosen: Clean statement reading experience with "Open in Coding Arena" CTA without downloading the Monaco Editor bundle.
- Route: `/arena/[problemSlug]` — Rendering Mode: Split-Pane Coding Arena (`next/dynamic`, `ssr: false` for Monaco) — Data Source: `GET /api/v1/problems/:slug` + `GET /api/v1/auth/me` — Caching Strategy: `no-store` for execution and submission polling — Auth Requirement: Public to view editor & edit local drafts; Auth required to Run/Submit in Phase 6 — Why This Strategy Was Chosen: Isolates heavyweight code editor, split-pane resizer, per-language draft storage, and testbench dock to the Arena route.
- Route: `/users/[username]` — Rendering Mode: Dynamic Server Component (SSR) — Data Source: `GET /api/v1/users/:username` — Caching Strategy: `revalidate: 30` — Auth Requirement: Public — Why This Strategy Was Chosen: Shareable developer portfolio with server-rendered rating history and solve metrics.
- Route: `/me/submissions` — Rendering Mode: Authenticated Dynamic Server Component + Client pagination — Data Source: `GET /api/v1/users/me/submissions` — Caching Strategy: `no-store` — Auth Requirement: Authenticated (`USER` / `ADMIN`) — Why This Strategy Was Chosen: Private user submission history and source code inspection must never be shared in caches.
- Route: `/leaderboard` — Rendering Mode: Server Component (SSR) — Data Source: `GET /api/v1/leaderboard` — Caching Strategy: `revalidate: 30` — Auth Requirement: Public — Why This Strategy Was Chosen: Fast global standings backed by indexed `(rating DESC, solvedCount DESC)` queries.
- Route: `/contests` — Rendering Mode: Server Component (SSR) — Data Source: `GET /api/v1/contests` — Caching Strategy: `revalidate: 30` — Auth Requirement: Public — Why This Strategy Was Chosen: SEO-friendly discovery of upcoming, live, and past contests.
- Route: `/contests/[slug]` — Rendering Mode: Dynamic Server Component (SSR) — Data Source: `GET /api/v1/contests/:slug` — Caching Strategy: `revalidate: 15` — Auth Requirement: Public (Auth to register) — Why This Strategy Was Chosen: Displays authoritative server-computed contest status and countdown.
- Route: `/contests/[slug]/arena` — Rendering Mode: Authenticated Server Gate + Client Contest Arena — Data Source: Server verifies contest registration & active window; Client loads Monaco + live standings — Caching Strategy: `no-store` — Auth Requirement: Registered Contest Participant — Why This Strategy Was Chosen: Prevents pre-contest problem leakage and isolates live contest timer/editor state.
- Route: `/admin`, `/admin/*` — Rendering Mode: Authenticated Admin Gate (`ADMIN`) + Client CRUD forms — Data Source: `/api/v1/admin/*` — Caching Strategy: `no-store` — Auth Requirement: Authenticated (`ADMIN` only) — Why This Strategy Was Chosen: Enforces role check before rendering admin UI while supporting problem and test-case management.

## 3. Coding Arena Architecture (Phase 5)

1. **Monaco Editor Dynamic Client Loading & Synchronized Fallback (`apps/web/components/arena/MonacoCodeEditor.tsx`)**:
   - Loaded via `next/dynamic(() => import('./MonacoCodeEditor'), { ssr: false, loading: () => <EditorLoadingSkeleton /> })` in `CodeEditorLazy.tsx`.
   - Initializes the Monaco AMD runtime (`vs/loader.js` from `NEXT_PUBLIC_MONACO_VS_PATH` or `cdn.jsdelivr.net`) with the custom `devarena-zinc-dark` theme (`#09090b` editor canvas, `#18181b` active line), C++20 (`cpp`) and JavaScript (`javascript`) syntax highlighting, auto-indentation, bracket pair colorization, `ResizeObserver` layout updates, and full listener/model disposal on unmount.
   - If the Monaco script cannot be loaded (e.g., offline air-gapped environment or strict network), automatically falls back to `FallbackSynchronizedCodeEditor` with a synchronized line-number gutter, Tab/Enter indentation handling, and live cursor telemetry (`Ln X, Col Y`).
2. **Standard-I/O Starter Templates (`apps/web/lib/arena-templates.ts`)**:
   - Matches the Judge `LanguageRunner` specification (`docs/judge.md` Section 5):
     - **C++20 (`cpp` — `main.cpp`)**: `#include <iostream>` with `ios::sync_with_stdio(false); cin.tie(nullptr);` reading from `std::cin` and writing to `std::cout`.
     - **JavaScript (`javascript` — `solution.mjs`)**: Node.js 22 ESM template using `import { readFileSync } from 'node:fs'` reading `readFileSync(0, 'utf8')` and writing to `console.log`.
3. **Per-Problem & Per-Language Local Draft Persistence (`apps/web/lib/arena-storage.ts`)**:
   - Editor changes are debounced (`250ms`) and persisted in `localStorage` under `devarena:code:v1:practice:<problemSlug>:<languageSlug>`, with language preference stored under `devarena:lang:v1:practice:<problemSlug>` and custom `stdin` stored under `devarena:stdin:v1:practice:<problemSlug>`.
   - Validates stored JSON payloads (`version: 1`, matching `problemSlug` and `languageSlug`, `<= 256 KB`) so corrupted or mismatched entries never crash the UI or contaminate another problem's buffer.
   - Never accesses `window.localStorage` during SSR and falls back gracefully to in-memory state if browser storage throws `SecurityError` or `QuotaExceededError`.
4. **Phase 5 Execution Boundary (`apps/web/lib/arena-workspace.ts`)**:
   - Phase 5 validates non-empty source code and `sourceSizeLimitBytes` (`64 KB`) client-side and stages execution requests in the Execution Output console without fabricating compiler output or verdicts. Real execution (`POST /api/v1/runs` and `POST /api/v1/submissions`) is connected in Phase 6.
