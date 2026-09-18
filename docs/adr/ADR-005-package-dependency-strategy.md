# ADR-005 — Package Dependency Strategy

## Context

The monorepo needs shared contracts without leaking server dependencies into browser bundles.

## Decision

Keep shared packages environment-neutral. Server-only dependencies stay inside server applications/packages. Browser-facing packages may consume only environment-neutral contracts.

## Consequences

Dependency ownership is explicit and accidental server-to-browser imports are easier to detect during review.
