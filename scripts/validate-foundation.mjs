import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const requiredFiles = [
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  '.gitattributes',
  '.gitignore',
  '.npmrc',
  '.prettierignore',
  'prettier.config.mjs',
  '.env.example',
  'README.md',
  '.github/workflows/ci.yml',
  'apps/web/package.json',
  'apps/web/tsconfig.json',
  'apps/web/app/layout.tsx',
  'apps/web/app/page.tsx',
  'apps/web/app/login/page.tsx',
  'apps/web/app/register/page.tsx',
  'apps/web/app/problems/page.tsx',
  'apps/web/lib/api-client.ts',
  'apps/api/package.json',
  'apps/api/tsconfig.json',
  'apps/api/prisma.config.ts',
  'apps/api/prisma/schema.prisma',
  'apps/api/prisma/seed.ts',
  'apps/api/prisma/migrations/migration_lock.toml',
  'apps/api/prisma/migrations/20260922145432_init/migration.sql',
  'apps/api/prisma/migrations/20261017000000_phase2_schema_reconciliation/migration.sql',
  'apps/api/src/app.ts',
  'apps/api/src/index.ts',
  'apps/api/src/auth/password.ts',
  'apps/api/src/auth/session.ts',
  'apps/api/src/auth/index.ts',
  'apps/api/src/errors/http-error.ts',
  'apps/api/src/middleware/auth.middleware.ts',
  'apps/api/src/middleware/csrf.middleware.ts',
  'apps/api/src/middleware/rate-limit.middleware.ts',
  'apps/api/src/middleware/index.ts',
  'apps/api/src/services/auth.service.ts',
  'apps/api/src/routes/v1/auth.routes.ts',
  'apps/api/src/db/client.ts',
  'apps/api/src/db/health.ts',
  'apps/api/src/db/index.ts',
  'apps/api/src/repositories/types.ts',
  'apps/api/src/repositories/user.repository.ts',
  'apps/api/src/repositories/problem.repository.ts',
  'apps/api/src/repositories/submission.repository.ts',
  'apps/api/src/repositories/contest.repository.ts',
  'apps/api/src/repositories/leaderboard.repository.ts',
  'apps/api/src/repositories/audit.repository.ts',
  'apps/api/src/repositories/index.ts',
  'apps/api/tests/app.test.ts',
  'apps/api/tests/auth.test.ts',
  'apps/api/tests/repositories.test.ts',
  'apps/api/tests/seed.test.ts',
  'apps/judge-worker/package.json',
  'apps/judge-worker/tsconfig.json',
  'apps/judge-worker/src/index.ts',
  'packages/api-contracts/package.json',
  'packages/api-contracts/tsconfig.json',
  'packages/api-contracts/src/index.ts',
  'packages/config/package.json',
  'packages/config/tsconfig.json',
  'packages/config/src/index.ts',
  'packages/shared/package.json',
  'packages/shared/tsconfig.json',
  'packages/shared/src/index.ts',
  'docs/architecture.md',
  'docs/database.md',
  'docs/api.md',
  'docs/judge.md',
  'docs/security.md',
  'docs/deployment.md',
  'docs/development.md',
  'docs/testing.md',
  'docs/rendering.md',
  'docs/aws.md',
  'docs/troubleshooting.md',
  'docs/phase-1-validation.md',
  'docs/phase-2-validation.md',
  'docs/phase-3-validation.md',
  'docs/adr/README.md',
  'docs/adr/ADR-001-monorepo.md',
  'docs/adr/ADR-002-frontend-architecture.md',
  'docs/adr/ADR-003-api-architecture.md',
  'docs/adr/ADR-004-judge-boundary.md',
  'docs/adr/ADR-005-package-dependency-strategy.md',
  'docs/adr/ADR-006-database-prisma.md',
  'docs/adr/ADR-007-queue-and-idempotency.md',
  'docs/adr/ADR-008-authentication-and-authorization.md',
  'docs/adr/ADR-009-rendering-and-performance.md',
  'docs/adr/ADR-010-aws-and-judge-sandboxing.md',
];

const errors = [];

for (const file of requiredFiles) {
  if (!existsSync(file)) {
    errors.push(`Missing required file: ${file}`);
  } else if (statSync(file).size === 0) {
    errors.push(`Empty required file: ${file}`);
  }
}

const ignoredDirs = new Set(['.git', 'node_modules', 'dist', '.next', 'generated']);

function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else {
      results.push(relative('.', fullPath).replace(/\\/g, '/'));
    }
  }
  return results;
}

const allRepoFiles = collectFiles('.');

for (const file of allRepoFiles) {
  if (file.endsWith('.env')) {
    continue;
  }
  const content = readFileSync(file);
  if (content.includes(0x0d)) {
    errors.push(`File contains CRLF line endings: ${file}`);
  }
}

const jsonFiles = allRepoFiles.filter((file) => file.endsWith('.json'));
for (const jsonFile of jsonFiles) {
  try {
    JSON.parse(readFileSync(jsonFile, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${jsonFile}: ${String(error)}`);
  }
}

const baseTsConfig = JSON.parse(readFileSync('tsconfig.base.json', 'utf8'));
if (baseTsConfig.compilerOptions?.strict !== true) {
  errors.push('tsconfig.base.json must enable compilerOptions.strict = true');
}

// Verify baseline migration 20260922145432_init is preserved intact
const initMigrationContent = readFileSync(
  'apps/api/prisma/migrations/20260922145432_init/migration.sql',
  'utf8',
).replace(/\r\n/g, '\n');
const initMigrationHash = createHash('sha256').update(initMigrationContent).digest('hex');
const expectedInitHash = '477f0630e3801959a23961113be7fe35c954c90f0e082f77dcb8e762686c93cd';
if (initMigrationHash !== expectedInitHash) {
  errors.push(
    `Baseline migration 20260922145432_init/migration.sql was altered (hash ${initMigrationHash} !== ${expectedInitHash})`,
  );
}

// Verify Phase 2 & 3 schema models and fields
const schemaText = readFileSync('apps/api/prisma/schema.prisma', 'utf8');
const requiredSchemaTokens = [
  'model Session',
  'model OAuthAccount',
  'passwordHash',
  'COMPILATION_ERROR',
  'INTERNAL_ERROR',
  'REVIEW',
  'ComparisonMode',
  'ExecutionMode',
  'idempotencyKey',
  'penaltyMinutes',
  'bestRuntimeMs',
  'bestMemoryKb',
];
for (const token of requiredSchemaTokens) {
  if (!schemaText.includes(token)) {
    errors.push(`schema.prisma is missing required token: ${token}`);
  }
}

const tsFiles = allRepoFiles.filter(
  (file) =>
    (file.startsWith('apps/') || file.startsWith('packages/')) &&
    (file.endsWith('.ts') || file.endsWith('.tsx')),
);

for (const tsFile of tsFiles) {
  const source = readFileSync(tsFile, 'utf8');

  if (/@ts-ignore|@ts-expect-error|\b:\s*any\b|\bas\s+any\b/.test(source)) {
    errors.push(`Forbidden TypeScript suppression or explicit any in ${tsFile}`);
  }

  if (tsFile.startsWith('apps/api/') && /child_process/.test(source)) {
    errors.push(`Forbidden child_process import in API file ${tsFile}`);
  }

  if (
    (tsFile.startsWith('apps/web/') ||
      tsFile.startsWith('packages/api-contracts/') ||
      tsFile.startsWith('packages/shared/')) &&
    /@devarena\/config|@prisma\/client|from\s+['"]pg['"]|repositories/.test(source)
  ) {
    errors.push(`Forbidden server-only import in browser-safe module ${tsFile}`);
  }

  if (tsFile.startsWith('apps/web/') && /localStorage|sessionStorage/.test(source)) {
    errors.push(`Forbidden browser storage credential usage in ${tsFile}`);
  }
}

if (errors.length > 0) {
  console.error('DevArena foundation & Phase 3 validation failed:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(
  `DevArena Phase 3 validated: ${requiredFiles.length} required files, ${tsFiles.length} TypeScript modules, ${jsonFiles.length} JSON manifests, and intact baseline migration verified with LF line endings.`,
);
