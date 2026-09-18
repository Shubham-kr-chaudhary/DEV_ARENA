import { existsSync } from 'node:fs';

const required = [
  'package.json',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  '.env.example',
  '.github/workflows/ci.yml',
  'apps/web/package.json',
  'apps/web/app/page.tsx',
  'apps/api/package.json',
  'apps/api/src/app.ts',
  'apps/judge-worker/package.json',
  'apps/judge-worker/src/index.ts',
  'packages/api-contracts/package.json',
  'packages/config/package.json',
  'packages/shared/package.json',
];

const missing = required.filter((file) => !existsSync(file));

if (missing.length > 0) {
  console.error('Missing foundation files:', missing);
  process.exit(1);
}

console.log(`DevArena Phase 1 foundation validated: ${required.length} required files present.`);
