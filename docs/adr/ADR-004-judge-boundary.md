# ADR-004 — Judge Boundary

## Context

Submitted code is hostile untrusted input.

## Decision

The API must never execute submitted source. Execution occurs asynchronously through a separate judge worker and isolated execution environment.

## Consequences

The system gains an explicit security and scaling boundary. Local development must preserve this architecture rather than introducing an API-side execution shortcut.
