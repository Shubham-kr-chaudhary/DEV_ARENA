# ADR-001 — Monorepo

## Context

DevArena contains a web application, API, judge worker, shared API contracts and configuration.

## Options

1. Separate repositories.
2. Monorepo with workspace packages.

## Decision

Use a pnpm workspace monorepo.

## Consequences

Shared contracts can be versioned with the applications while web, API and worker remain independently deployable.
