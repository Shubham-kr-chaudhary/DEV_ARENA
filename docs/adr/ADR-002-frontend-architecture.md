# ADR-002 — Frontend Architecture

## Context

DevArena needs SEO-friendly public content alongside a highly interactive Monaco-based coding Arena.

## Options

1. Fully client-rendered React application.
2. Next.js App Router with server/client boundaries.

## Decision

Use Next.js App Router with Server Components by default and Client Components for interaction-heavy areas.

## Consequences

Public pages can render efficiently without loading Monaco, while the Arena can remain client-heavy.
