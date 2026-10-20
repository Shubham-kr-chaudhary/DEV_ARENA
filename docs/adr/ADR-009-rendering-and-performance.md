# ADR-009 — Route Rendering Strategy and Frontend Performance

## Status

Accepted — Phase 1.

## Context

DevArena combines content-driven public pages (landing page, problem catalogue, problem descriptions, leaderboards, contest listings, public developer profiles) with a heavyweight interactive Coding Arena powered by Monaco Editor, resizable split panels, per-language draft persistence, and live verdict polling.

Loading Monaco Editor (`~2.5 MB` of JavaScript/workers) or client-side data-fetching wrappers on public pages degrades Largest Contentful Paint (LCP), Time to First Byte (TTFB), and Search Engine Optimization (SEO). Conversely, forcing server round-trips for every keystroke or panel resize inside the Arena harms Interaction to Next Paint (INP).

## Options

1. **Pure Client-Side Rendering (`'use client'` at root)** — uniform mental model, but poor SEO and large initial bundle sizes across all routes.
2. **Route-Specific Hybrid Rendering (Next.js App Router Server Components + Isolated Client Islands)** — static/SSR rendering for public discovery routes and dynamic client-side rendering with code splitting for Arena and Admin interfaces.

## Decision

1. **Server Components by Default**:
   - `/`, `/problems`, `/problems/[slug]`, `/leaderboard`, `/contests`, `/contests/[slug]`, and `/users/[username]` render as Next.js Server Components with semantic HTML and route-level metadata/OpenGraph tags.
2. **Strict Monaco Editor Bundle Isolation**:
   - Monaco Editor is imported exclusively inside Arena client components (`/arena/[problemSlug]` and `/contests/[slug]/arena`) using `next/dynamic` with `ssr: false` and a lightweight skeleton fallback.
   - Public routes and non-Arena bundles must never import `monaco-editor` or `@monaco-editor/react`.
3. **Client-Side State Scope**:
   - Use **TanStack Query** strictly for interactive client mutations (`Run`, `Submit`, admin forms), short-interval submission status polling (`QUEUED` / `RUNNING`), and interactive client-side filter transitions.
   - Persist unsaved Arena editor buffers per `(user, problemSlug, contestContext, languageSlug)` in `localStorage` with debounced writes.
4. **Controlled Caching & Invalidation**:
   - Cache public problem metadata and catalogue responses with short revalidation windows (`30s–60s`), while marking authenticated/private routes (`/me/submissions`, `/arena/*`, `/admin/*`) as `no-store`.

## Consequences

- Landing and problem discovery routes remain fast, crawlable, and lightweight.
- The Arena delivers a responsive desktop IDE experience without penalizing initial page loads elsewhere in the application.
