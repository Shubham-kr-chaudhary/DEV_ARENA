import 'dotenv/config';
import { createHash, scryptSync } from 'node:crypto';
import { loadServerConfig } from '@devarena/config';
import { disconnectPrisma, getPrismaClient } from '../src/db/index.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Deterministic development-only password hashing helper.
 *
 * Uses Node.js built-in crypto.scryptSync with a deterministic salt derived
 * from the development account identifier so repeated seed runs are idempotent
 * while never storing plaintext passwords in the database.
 *
 * Production environments are strictly blocked from running this seed script.
 */
export function hashDevelopmentPassword(password: string, accountIdentifier: string): string {
  const salt = createHash('sha256')
    .update(`devarena-dev-seed-salt:${accountIdentifier}`)
    .digest('hex')
    .slice(0, 32);
  const derivedKey = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `$scrypt$n=16384,r=8,p=1$${salt}$${derivedKey}`;
}

export interface SeedConfiguration {
  nodeEnv: 'development' | 'test' | 'production';
  adminPassword: string;
  userPassword: string;
}

export function resolveSeedConfiguration(env: NodeJS.ProcessEnv = process.env): SeedConfiguration {
  const serverConfig = loadServerConfig(env);

  if (serverConfig.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to execute development seed script in production (NODE_ENV=production).',
    );
  }

  const adminPassword =
    env.DEV_SEED_ADMIN_PASSWORD?.trim() || 'devarena-local-dev-admin-password-change-me';
  const userPassword =
    env.DEV_SEED_USER_PASSWORD?.trim() || 'devarena-local-dev-user-password-change-me';

  if (adminPassword.length < 12 || userPassword.length < 12) {
    throw new Error('Development seed passwords must be at least 12 characters.');
  }

  return {
    nodeEnv: serverConfig.NODE_ENV,
    adminPassword,
    userPassword,
  };
}

export interface SeedSummary {
  usersCount: number;
  languagesCount: number;
  tagsCount: number;
  problemsCount: number;
  testCasesCount: number;
}

const SEED_LANGUAGES = [
  {
    slug: 'cpp',
    name: 'C++20 (GCC 14.2.0)',
    version: '14.2.0',
    isActive: true,
  },
  {
    slug: 'javascript',
    name: 'JavaScript (Node.js 22 LTS)',
    version: '22.14.0',
    isActive: true,
  },
] as const;

const SEED_TAGS = [
  { slug: 'arrays', name: 'Arrays' },
  { slug: 'strings', name: 'Strings' },
  { slug: 'hashing', name: 'Hashing' },
  { slug: 'dynamic-programming', name: 'Dynamic Programming' },
  { slug: 'graphs', name: 'Graphs' },
  { slug: 'trees', name: 'Trees' },
  { slug: 'greedy', name: 'Greedy' },
  { slug: 'binary-search', name: 'Binary Search' },
  { slug: 'sorting', name: 'Sorting' },
  { slug: 'math', name: 'Math' },
] as const;

interface SeedProblemDefinition {
  slug: string;
  title: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  status: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string;
  explanation: string;
  editorial: string;
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitBytes: number;
  sourceSizeLimitBytes: number;
  comparisonMode: 'EXACT' | 'TRIM_WHITESPACE' | 'TOKEN_WHITESPACE' | 'FLOAT_TOLERANCE';
  tagSlugs: readonly string[];
  examples: ReadonlyArray<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  testCases: ReadonlyArray<{
    sequence: number;
    input: string;
    expectedOutput: string;
    explanation?: string;
    isPublic: boolean;
    weight: number;
    group: string;
  }>;
}

const SEED_PROBLEMS: readonly SeedProblemDefinition[] = [
  {
    slug: 'two-sum-indices',
    title: 'Two Sum Indices',
    difficulty: 'EASY',
    status: 'PUBLISHED',
    statement:
      'Given an array of `n` integers and a target integer `t`, find the 1-based indices `i` and `j` (`1 <= i < j <= n`) such that `a[i] + a[j] = t`. It is guaranteed that exactly one valid pair exists.',
    inputFormat:
      'The first line contains two space-separated integers `n` and `t`. The second line contains `n` space-separated integers `a[1], a[2], ..., a[n]`.',
    outputFormat:
      'Print two space-separated integers `i` and `j` (`i < j`) representing the 1-based indices of the two elements.',
    constraints: '2 <= n <= 200000\n-10^9 <= a[i], t <= 10^9',
    explanation:
      'In the first example, a[1] + a[2] = 2 + 7 = 9, so the 1-based indices are 1 and 2.',
    editorial:
      'Maintain a hash map from each seen value `x` to its 1-based index. For each element `a[j]`, check whether `t - a[j]` already exists in the map in O(1) average time.',
    timeLimitMs: 1500,
    memoryLimitMb: 256,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    tagSlugs: ['arrays', 'hashing'],
    examples: [
      {
        input: '4 9\n2 7 11 15',
        output: '1 2',
        explanation: 'a[1] + a[2] = 2 + 7 = 9.',
      },
      {
        input: '3 6\n3 2 4',
        output: '2 3',
        explanation: 'a[2] + a[3] = 2 + 4 = 6.',
      },
    ],
    testCases: [
      {
        sequence: 1,
        input: '4 9\n2 7 11 15\n',
        expectedOutput: '1 2\n',
        explanation: 'Sample test 1',
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        sequence: 2,
        input: '3 6\n3 2 4\n',
        expectedOutput: '2 3\n',
        explanation: 'Sample test 2',
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        sequence: 3,
        input: '2 -8\n-3 -5\n',
        expectedOutput: '1 2\n',
        isPublic: false,
        weight: 1,
        group: 'hidden-negative',
      },
      {
        sequence: 4,
        input: '5 0\n-10 4 6 10 -4\n',
        expectedOutput: '1 4\n',
        isPublic: false,
        weight: 1,
        group: 'hidden-zero-sum',
      },
      {
        sequence: 5,
        input: '6 1000000000\n500000000 1 2 3 4 500000000\n',
        expectedOutput: '1 6\n',
        isPublic: false,
        weight: 1,
        group: 'hidden-large-values',
      },
    ],
  },
  {
    slug: 'longest-zero-sum-slice',
    title: 'Longest Zero-Sum Slice',
    difficulty: 'MEDIUM',
    status: 'PUBLISHED',
    statement:
      'Given an integer array `a` of length `n`, compute the length of the longest contiguous subarray whose elements sum to `0`. If no such subarray exists, output `0`.',
    inputFormat:
      'The first line contains a single integer `n`. The second line contains `n` space-separated integers `a[1], a[2], ..., a[n]`.',
    outputFormat: 'Print a single integer: the maximum length of a zero-sum contiguous subarray.',
    constraints: '1 <= n <= 200000\n-10^9 <= a[i] <= 10^9',
    explanation:
      'The subarray [2, -2, 4, -4] has sum 0 and length 4, which is the longest possible.',
    editorial:
      'Track prefix sums `P[i] = a[1] + ... + a[i]` with `P[0] = 0`. If `P[i] == P[j]` for `i < j`, the subarray `a[i+1..j]` sums to 0. Store the earliest index of each prefix sum in a hash map.',
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    tagSlugs: ['arrays', 'hashing'],
    examples: [
      {
        input: '6\n1 2 -2 4 -4 3',
        output: '4',
        explanation: 'Subarray [2, -2, 4, -4] has length 4 and sum 0.',
      },
      {
        input: '3\n1 2 3',
        output: '0',
        explanation: 'No non-empty contiguous subarray sums to 0.',
      },
    ],
    testCases: [
      {
        sequence: 1,
        input: '6\n1 2 -2 4 -4 3\n',
        expectedOutput: '4\n',
        explanation: 'Sample test 1',
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        sequence: 2,
        input: '3\n1 2 3\n',
        expectedOutput: '0\n',
        explanation: 'Sample test 2',
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        sequence: 3,
        input: '5\n0 0 0 0 0\n',
        expectedOutput: '5\n',
        isPublic: false,
        weight: 1,
        group: 'hidden-all-zeros',
      },
      {
        sequence: 4,
        input: '7\n5 -5 5 -5 5 -5 5\n',
        expectedOutput: '6\n',
        isPublic: false,
        weight: 1,
        group: 'hidden-alternating',
      },
    ],
  },
  {
    slug: 'minimum-relay-latency',
    title: 'Minimum Relay Latency',
    difficulty: 'HARD',
    status: 'PUBLISHED',
    statement:
      'You are given a directed weighted network of `n` servers (`1` to `n`) and `m` fiber links. Find the minimum total latency from server `1` to server `n`. If server `n` cannot be reached from server `1`, print `-1`.',
    inputFormat:
      'The first line contains two integers `n` and `m`. Each of the next `m` lines contains three integers `u`, `v`, and `w`, representing a directed link from `u` to `v` with latency `w`.',
    outputFormat:
      'Print a single integer representing the minimum latency from `1` to `n`, or `-1` if unreachable.',
    constraints: '2 <= n <= 100000\n1 <= m <= 200000\n1 <= w <= 10^9',
    explanation: 'Path 1 -> 2 -> 3 -> 4 has total latency 2 + 3 + 1 = 6.',
    editorial:
      'Use Dijkstra’s algorithm with a binary min-heap in O((n + m) log n) using 64-bit integers for distances.',
    timeLimitMs: 2500,
    memoryLimitMb: 256,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    tagSlugs: ['graphs', 'greedy'],
    examples: [
      {
        input: '4 4\n1 2 2\n2 3 3\n3 4 1\n1 4 10',
        output: '6',
        explanation: 'Shortest path is 1 -> 2 -> 3 -> 4 with cost 6.',
      },
    ],
    testCases: [
      {
        sequence: 1,
        input: '4 4\n1 2 2\n2 3 3\n3 4 1\n1 4 10\n',
        expectedOutput: '6\n',
        explanation: 'Sample test 1',
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        sequence: 2,
        input: '3 1\n1 2 5\n',
        expectedOutput: '-1\n',
        explanation: 'Node 3 is unreachable',
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        sequence: 3,
        input: '5 6\n1 2 10\n1 3 3\n3 2 1\n2 4 2\n3 4 8\n4 5 7\n',
        expectedOutput: '13\n',
        isPublic: false,
        weight: 1,
        group: 'hidden-relaxation',
      },
      {
        sequence: 4,
        input: '2 2\n1 2 1000000000\n1 2 999999999\n',
        expectedOutput: '999999999\n',
        isPublic: false,
        weight: 1,
        group: 'hidden-parallel-edges',
      },
    ],
  },
  {
    slug: 'draft-binary-search-preview',
    title: 'Draft: Peak Throughput Threshold',
    difficulty: 'MEDIUM',
    status: 'DRAFT',
    statement:
      'Development draft problem used to verify that DRAFT problems are hidden from public catalogue queries.',
    inputFormat: 'Single integer n.',
    outputFormat: 'Single integer n.',
    constraints: '1 <= n <= 100',
    explanation: 'Draft example.',
    editorial: 'Draft editorial.',
    timeLimitMs: 1000,
    memoryLimitMb: 256,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    tagSlugs: ['binary-search'],
    examples: [{ input: '5', output: '5' }],
    testCases: [
      {
        sequence: 1,
        input: '5\n',
        expectedOutput: '5\n',
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        sequence: 2,
        input: '42\n',
        expectedOutput: '42\n',
        isPublic: false,
        weight: 1,
        group: 'hidden',
      },
    ],
  },
] as const;

export async function runDevelopmentSeed(
  prisma: PrismaClient,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SeedSummary> {
  const seedConfig = resolveSeedConfiguration(env);

  // 1. Upsert development admin and regular developer accounts
  const adminEmail = 'admin@dev.devarena.local';
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash: hashDevelopmentPassword(seedConfig.adminPassword, adminEmail),
    },
    create: {
      email: adminEmail,
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash: hashDevelopmentPassword(seedConfig.adminPassword, adminEmail),
    },
  });

  await prisma.profile.upsert({
    where: { userId: adminUser.id },
    update: {
      username: 'dev_admin',
      displayName: 'DevArena Admin (Dev)',
      bio: 'Development administrator account seeded for local testing.',
      rating: 1800,
      maxRating: 1800,
      rankTitle: 'Expert',
    },
    create: {
      userId: adminUser.id,
      username: 'dev_admin',
      displayName: 'DevArena Admin (Dev)',
      bio: 'Development administrator account seeded for local testing.',
      rating: 1800,
      maxRating: 1800,
      rankTitle: 'Expert',
    },
  });

  const devUsers = [
    {
      email: 'alice@dev.devarena.local',
      username: 'alice_dev',
      displayName: 'Alice (Dev User)',
      bio: 'Competitive programmer practicing C++20 and graphs.',
      rating: 1520,
      maxRating: 1560,
      rankTitle: 'Specialist',
      solvedCount: 2,
      attemptedCount: 2,
    },
    {
      email: 'bob@dev.devarena.local',
      username: 'bob_dev',
      displayName: 'Bob (Dev User)',
      bio: 'Full-stack developer solving problems in Node.js.',
      rating: 1340,
      maxRating: 1340,
      rankTitle: 'Pupil',
      solvedCount: 1,
      attemptedCount: 2,
    },
  ] as const;

  for (const devUser of devUsers) {
    const userRecord = await prisma.user.upsert({
      where: { email: devUser.email },
      update: {
        role: 'USER',
        status: 'ACTIVE',
        passwordHash: hashDevelopmentPassword(seedConfig.userPassword, devUser.email),
      },
      create: {
        email: devUser.email,
        role: 'USER',
        status: 'ACTIVE',
        passwordHash: hashDevelopmentPassword(seedConfig.userPassword, devUser.email),
      },
    });

    await prisma.profile.upsert({
      where: { userId: userRecord.id },
      update: {
        username: devUser.username,
        displayName: devUser.displayName,
        bio: devUser.bio,
        rating: devUser.rating,
        maxRating: devUser.maxRating,
        rankTitle: devUser.rankTitle,
        solvedCount: devUser.solvedCount,
        attemptedCount: devUser.attemptedCount,
      },
      create: {
        userId: userRecord.id,
        username: devUser.username,
        displayName: devUser.displayName,
        bio: devUser.bio,
        rating: devUser.rating,
        maxRating: devUser.maxRating,
        rankTitle: devUser.rankTitle,
        solvedCount: devUser.solvedCount,
        attemptedCount: devUser.attemptedCount,
      },
    });
  }

  // 2. Upsert supported languages (cpp, javascript)
  for (const lang of SEED_LANGUAGES) {
    await prisma.language.upsert({
      where: { slug: lang.slug },
      update: {
        name: lang.name,
        version: lang.version,
        isActive: lang.isActive,
      },
      create: {
        slug: lang.slug,
        name: lang.name,
        version: lang.version,
        isActive: lang.isActive,
      },
    });
  }

  // 3. Upsert canonical problem tags
  const tagIdBySlug = new Map<string, string>();
  for (const tag of SEED_TAGS) {
    const record = await prisma.tag.upsert({
      where: { slug: tag.slug },
      update: { name: tag.name },
      create: { slug: tag.slug, name: tag.name },
    });
    tagIdBySlug.set(tag.slug, record.id);
  }

  // 4. Upsert sample problems, tag associations, and public/hidden test cases
  let totalTestCasesSeeded = 0;
  const publishedTimestamp = new Date('2026-09-22T12:00:00.000Z');

  for (const problemDef of SEED_PROBLEMS) {
    const publishedAt = problemDef.status === 'PUBLISHED' ? publishedTimestamp : null;

    const problemRecord = await prisma.problem.upsert({
      where: { slug: problemDef.slug },
      update: {
        title: problemDef.title,
        difficulty: problemDef.difficulty,
        status: problemDef.status,
        statement: problemDef.statement,
        inputFormat: problemDef.inputFormat,
        outputFormat: problemDef.outputFormat,
        constraints: problemDef.constraints,
        examples: problemDef.examples,
        explanation: problemDef.explanation,
        editorial: problemDef.editorial,
        authorId: adminUser.id,
        timeLimitMs: problemDef.timeLimitMs,
        memoryLimitMb: problemDef.memoryLimitMb,
        outputLimitBytes: problemDef.outputLimitBytes,
        sourceSizeLimitBytes: problemDef.sourceSizeLimitBytes,
        comparisonMode: problemDef.comparisonMode,
        publishedAt,
      },
      create: {
        slug: problemDef.slug,
        title: problemDef.title,
        difficulty: problemDef.difficulty,
        status: problemDef.status,
        statement: problemDef.statement,
        inputFormat: problemDef.inputFormat,
        outputFormat: problemDef.outputFormat,
        constraints: problemDef.constraints,
        examples: problemDef.examples,
        explanation: problemDef.explanation,
        editorial: problemDef.editorial,
        authorId: adminUser.id,
        timeLimitMs: problemDef.timeLimitMs,
        memoryLimitMb: problemDef.memoryLimitMb,
        outputLimitBytes: problemDef.outputLimitBytes,
        sourceSizeLimitBytes: problemDef.sourceSizeLimitBytes,
        comparisonMode: problemDef.comparisonMode,
        publishedAt,
      },
    });

    for (const tagSlug of problemDef.tagSlugs) {
      const tagId = tagIdBySlug.get(tagSlug);
      if (!tagId) {
        continue;
      }

      await prisma.problemTag.upsert({
        where: {
          problemId_tagId: {
            problemId: problemRecord.id,
            tagId,
          },
        },
        update: {},
        create: {
          problemId: problemRecord.id,
          tagId,
        },
      });
    }

    for (const tc of problemDef.testCases) {
      const explanationValue = tc.explanation ?? null;
      await prisma.testCase.upsert({
        where: {
          problemId_sequence: {
            problemId: problemRecord.id,
            sequence: tc.sequence,
          },
        },
        update: {
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          explanation: explanationValue,
          isPublic: tc.isPublic,
          weight: tc.weight,
          group: tc.group,
        },
        create: {
          problemId: problemRecord.id,
          sequence: tc.sequence,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          explanation: explanationValue,
          isPublic: tc.isPublic,
          weight: tc.weight,
          group: tc.group,
        },
      });
      totalTestCasesSeeded += 1;
    }
  }

  return {
    usersCount: 1 + devUsers.length,
    languagesCount: SEED_LANGUAGES.length,
    tagsCount: SEED_TAGS.length,
    problemsCount: SEED_PROBLEMS.length,
    testCasesCount: totalTestCasesSeeded,
  };
}

const isMainModule =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js'));

if (isMainModule) {
  const prisma = getPrismaClient();
  runDevelopmentSeed(prisma)
    .then(async (summary) => {
      console.log(
        `DevArena development seed complete: ${summary.usersCount} users, ${summary.languagesCount} languages, ${summary.tagsCount} tags, ${summary.problemsCount} problems, ${summary.testCasesCount} test cases.`,
      );
      await disconnectPrisma();
    })
    .catch(async (error: unknown) => {
      console.error('DevArena development seed failed:', error);
      await disconnectPrisma();
      process.exit(1);
    });
}
