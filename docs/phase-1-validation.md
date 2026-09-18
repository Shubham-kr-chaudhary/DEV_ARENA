# Phase 1 Validation Note

The repository structure and configuration were generated from the Phase 0 architecture.

Dependency installation/build validation could not be executed in this environment because the npm registry is not reachable and pnpm is not preinstalled. The generated CI workflow will perform the authoritative install and checks in GitHub Actions.

Before merging, run:

```bash
corepack enable
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
```
