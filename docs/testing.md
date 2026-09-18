# Testing Strategy

Phase 1 establishes the testing entry points and CI pipeline.

## Later test layers

1. Unit tests — pure domain logic.
2. Integration tests — API/database and infrastructure boundaries.
3. Judge tests — language execution and resource-limit behavior.
4. Component tests — critical UI interactions.
5. End-to-end tests — complete user and contest flows.

## Phase 1

The applications include minimal executable smoke tests. CI runs typecheck, lint, tests and builds.

Later phases must add meaningful tests before their features are considered complete.
