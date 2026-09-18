# ADR-003 — API Architecture

## Context

The API needs explicit HTTP boundaries while keeping business logic independent from route handlers.

## Decision

Use Node.js, TypeScript and Hono with thin routes, Zod validation, services/domain modules and repositories.

## Consequences

HTTP concerns remain separated from business and persistence logic.
