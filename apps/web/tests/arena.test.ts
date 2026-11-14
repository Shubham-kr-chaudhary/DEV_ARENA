import type { PublicProblemDetailContractDto } from '@devarena/api-contracts';
import { describe, expect, it } from 'vitest';
import { ApiClientError, createApiClient } from '../lib/api-client.js';
import {
  buildDraftStorageKey,
  loadArenaCodeDraft,
  saveArenaCodeDraft,
  type KeyValueStorageAdapter,
} from '../lib/arena-storage.js';
import {
  ARENA_LANGUAGES,
  getStarterTemplate,
  resolveArenaLanguageSlug,
} from '../lib/arena-templates.js';
import {
  buildPhase5ExecutionStageNotice,
  initializeArenaWorkspaceState,
  resetArenaLanguageToTemplate,
  resolveAvailableSampleCases,
  switchArenaLanguage,
  updateArenaCustomInput,
} from '../lib/arena-workspace.js';

function createMemoryStorage(): KeyValueStorageAdapter & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
    removeItem(key: string) {
      map.delete(key);
    },
  };
}

function createSampleProblem(
  overrides: Partial<PublicProblemDetailContractDto> = {},
): PublicProblemDetailContractDto {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    slug: 'two-sum-indices',
    title: 'Two Sum Indices',
    statement: 'Given an array of n integers and target t, find 1-based indices i and j.',
    inputFormat: 'First line n and t. Second line n integers.',
    outputFormat: 'Two space-separated 1-based indices.',
    constraints: '2 <= n <= 200000',
    examples: [
      {
        input: '4 9\n2 7 11 15',
        output: '1 2',
        explanation: 'a[1] + a[2] = 9',
      },
    ],
    explanation: 'Use a hash table.',
    difficulty: 'EASY',
    timeLimitMs: 1500,
    memoryLimitMb: 256,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    floatTolerance: null,
    publishedAt: '2026-10-15T10:00:00.000Z',
    tags: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        slug: 'arrays',
        name: 'Arrays',
      },
    ],
    supportedLanguages: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        slug: 'cpp',
        name: 'C++20 (GCC 14.2.0)',
        version: '14.2.0',
        isActive: true,
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        slug: 'javascript',
        name: 'JavaScript (Node.js 22 LTS)',
        version: '22.14.0',
        isActive: true,
      },
    ],
    publicTestCases: [
      {
        id: '20000000-0000-4000-8000-000000000001',
        sequence: 1,
        input: '4 9\n2 7 11 15\n',
        expectedOutput: '1 2\n',
        explanation: 'Sample test 1',
        isPublic: true,
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        sequence: 2,
        input: '3 6\n3 2 4\n',
        expectedOutput: '2 3\n',
        explanation: 'Sample test 2',
        isPublic: true,
      },
    ],
    userProgressStatus: 'UNSOLVED',
    ...overrides,
  };
}

describe('Phase 5 Coding Arena — Starter Templates & Language Selection', () => {
  it('provides standard-I/O starter templates for C++20 and Node.js 22 ESM', () => {
    const cppTemplate = getStarterTemplate('two-sum-indices', 'cpp', 'Two Sum Indices');
    expect(cppTemplate).toContain('#include <iostream>');
    expect(cppTemplate).toContain('int main()');
    expect(cppTemplate).toContain('Two Sum Indices (two-sum-indices)');
    expect(ARENA_LANGUAGES.cpp.sourceFileName).toBe('main.cpp');

    const jsTemplate = getStarterTemplate('two-sum-indices', 'javascript', 'Two Sum Indices');
    expect(jsTemplate).toContain("import { readFileSync } from 'node:fs';");
    expect(jsTemplate).toContain("readFileSync(0, 'utf8')");
    expect(ARENA_LANGUAGES.javascript.sourceFileName).toBe('solution.mjs');

    expect(resolveArenaLanguageSlug('javascript', ['cpp', 'javascript'])).toBe('javascript');
    expect(resolveArenaLanguageSlug('unknown-lang', ['cpp', 'javascript'])).toBe('cpp');
  });
});

describe('Phase 5 Coding Arena — Local Draft Persistence & Isolation', () => {
  it('keeps separate C++ and JS drafts per problem without cross-problem leakage', () => {
    const storage = createMemoryStorage();
    const twoSum = createSampleProblem({ slug: 'two-sum-indices', title: 'Two Sum Indices' });
    const zeroSum = createSampleProblem({
      id: '10000000-0000-4000-8000-000000000002',
      slug: 'longest-zero-sum-slice',
      title: 'Longest Zero-Sum Slice',
    });

    const initial = initializeArenaWorkspaceState(twoSum, storage);
    expect(initial.selectedLanguage).toBe('cpp');
    expect(initial.draftStatusByLanguage.cpp).toBe('starter_template');

    const customCppCode = '// Custom C++ solution for two-sum-indices\nint main() { return 0; }\n';
    const customJsCode = '// Custom JS solution for two-sum-indices\nconsole.log("1 2");\n';

    // Switch from C++ to JavaScript while saving the C++ draft
    const afterToJs = switchArenaLanguage({
      problemSlug: twoSum.slug,
      currentLanguage: 'cpp',
      currentCode: customCppCode,
      nextLanguage: 'javascript',
      buffersByLanguage: initial.buffersByLanguage,
      problemTitle: twoSum.title,
      storage,
    });

    expect(afterToJs.selectedLanguage).toBe('javascript');
    expect(afterToJs.nextCode).toContain("readFileSync(0, 'utf8')");

    // Save custom JS draft and switch back to C++
    const afterBackToCpp = switchArenaLanguage({
      problemSlug: twoSum.slug,
      currentLanguage: 'javascript',
      currentCode: customJsCode,
      nextLanguage: 'cpp',
      buffersByLanguage: afterToJs.buffersByLanguage,
      problemTitle: twoSum.title,
      storage,
    });

    expect(afterBackToCpp.selectedLanguage).toBe('cpp');
    expect(afterBackToCpp.nextCode).toBe(customCppCode);

    // Reopen two-sum-indices from storage -> both C++ and JS drafts are restored intact
    const reopenedTwoSum = initializeArenaWorkspaceState(twoSum, storage);
    expect(reopenedTwoSum.buffersByLanguage.cpp).toBe(customCppCode);
    expect(reopenedTwoSum.buffersByLanguage.javascript).toBe(customJsCode);
    expect(reopenedTwoSum.draftStatusByLanguage.cpp).toBe('saved_draft');
    expect(reopenedTwoSum.draftStatusByLanguage.javascript).toBe('saved_draft');

    // Open a different problem (longest-zero-sum-slice) -> receives its own starter templates
    const openedZeroSum = initializeArenaWorkspaceState(zeroSum, storage);
    expect(openedZeroSum.buffersByLanguage.cpp).not.toBe(customCppCode);
    expect(openedZeroSum.buffersByLanguage.cpp).toContain('longest-zero-sum-slice');
    expect(openedZeroSum.draftStatusByLanguage.cpp).toBe('starter_template');

    // Reset C++ draft on two-sum-indices -> restores C++ starter template without erasing JS draft
    const resetCpp = resetArenaLanguageToTemplate({
      problemSlug: twoSum.slug,
      languageSlug: 'cpp',
      problemTitle: twoSum.title,
      storage,
    });
    expect(resetCpp).toContain('int main()');
    const afterReset = initializeArenaWorkspaceState(twoSum, storage);
    expect(afterReset.draftStatusByLanguage.cpp).toBe('starter_template');
    expect(afterReset.buffersByLanguage.javascript).toBe(customJsCode);
  });

  it('handles missing, malformed, or throwing storage safely without crashing', () => {
    const storage = createMemoryStorage();
    const key = buildDraftStorageKey('two-sum-indices', 'cpp');

    // 1. Corrupted JSON in localStorage
    storage.setItem(key, '{not-valid-json');
    const corruptedResult = loadArenaCodeDraft({
      problemSlug: 'two-sum-indices',
      languageSlug: 'cpp',
      storage,
    });
    expect(corruptedResult.source).toBe('starter_template');
    expect(corruptedResult.sourceCode).toContain('#include <iostream>');

    // 2. Mismatched problemSlug in stored record (prevents cross-problem draft contamination)
    storage.setItem(
      key,
      JSON.stringify({
        version: 1,
        problemSlug: 'other-problem',
        languageSlug: 'cpp',
        sourceCode: 'hacked()',
        updatedAt: '2026-10-20T00:00:00.000Z',
      }),
    );
    const mismatchedResult = loadArenaCodeDraft({
      problemSlug: 'two-sum-indices',
      languageSlug: 'cpp',
      storage,
    });
    expect(mismatchedResult.source).toBe('starter_template');
    expect(mismatchedResult.sourceCode).not.toContain('hacked()');

    // 3. Throwing storage (e.g. Safari private mode / SecurityError / QuotaExceededError)
    const throwingStorage: KeyValueStorageAdapter = {
      getItem() {
        throw new Error('SecurityError: storage disabled');
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
      removeItem() {
        throw new Error('SecurityError');
      },
    };

    const fallbackLoad = loadArenaCodeDraft({
      problemSlug: 'two-sum-indices',
      languageSlug: 'javascript',
      storage: throwingStorage,
    });
    expect(fallbackLoad.storageAvailable).toBe(false);
    expect(fallbackLoad.source).toBe('starter_template');

    const fallbackSave = saveArenaCodeDraft({
      problemSlug: 'two-sum-indices',
      languageSlug: 'javascript',
      sourceCode: 'console.log(1);',
      storage: throwingStorage,
    });
    expect(fallbackSave.saved).toBe(false);
    expect(fallbackSave.storageAvailable).toBe(false);

    // 4. Null storage (SSR environment)
    const ssrLoad = loadArenaCodeDraft({
      problemSlug: 'two-sum-indices',
      languageSlug: 'cpp',
      storage: null,
    });
    expect(ssrLoad.storageAvailable).toBe(false);
    expect(ssrLoad.source).toBe('starter_template');
  });
});

describe('Phase 5 Coding Arena — Sample Tests, Custom Input & Phase Boundary', () => {
  it('resolves public sample tests, persists custom stdin, and stages Phase 5 notices', () => {
    const storage = createMemoryStorage();
    const problem = createSampleProblem();

    const samples = resolveAvailableSampleCases(problem);
    expect(samples).toHaveLength(2);
    expect(samples[0]?.input).toBe('4 9\n2 7 11 15\n');
    expect(samples[1]?.expectedOutput).toBe('2 3\n');

    // Edit custom input and verify persistence
    updateArenaCustomInput({
      problemSlug: problem.slug,
      customInput: '5 10\n1 2 3 4 6\n',
      storage,
    });
    const reinitialized = initializeArenaWorkspaceState(problem, storage);
    expect(reinitialized.customInput).toBe('5 10\n1 2 3 4 6\n');

    // Empty source code produces validation_error
    const emptyNotice = buildPhase5ExecutionStageNotice({
      action: 'run_samples',
      problem,
      languageSlug: 'cpp',
      sourceCode: '   \n  ',
      stdinPreview: samples[0]!.input,
    });
    expect(emptyNotice.kind).toBe('validation_error');
    expect(emptyNotice.title).toContain('empty');

    // Oversized source code (> 64 KB) produces validation_error
    const oversizedNotice = buildPhase5ExecutionStageNotice({
      action: 'submit',
      problem,
      languageSlug: 'cpp',
      sourceCode: 'a'.repeat(problem.sourceSizeLimitBytes + 100),
      stdinPreview: samples[0]!.input,
    });
    expect(oversizedNotice.kind).toBe('validation_error');
    expect(oversizedNotice.title).toContain('limit exceeded');

    // Valid source code produces honest Phase 5 execution pending notice (no fabricated verdict)
    const validNotice = buildPhase5ExecutionStageNotice({
      action: 'submit',
      problem,
      languageSlug: 'cpp',
      sourceCode: getStarterTemplate(problem.slug, 'cpp', problem.title),
      stdinPreview: samples[0]!.input,
    });
    expect(validNotice.kind).toBe('phase5_execution_pending');
    expect(validNotice.summary).toContain('Phase 6');
    expect(validNotice.summary).toContain('POST /api/v1/submissions');
  });

  it('handles 404/500 API errors and rejects hidden test cases in API client', async () => {
    const notFoundClient = createApiClient({
      baseUrl: 'http://localhost:4000',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'NOT_FOUND',
              message: "Problem 'draft-problem' was not found.",
            },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    await expect(notFoundClient.getProblemBySlug('draft-problem')).rejects.toMatchObject({
      name: 'ApiClientError',
      statusCode: 404,
      code: 'NOT_FOUND',
    });

    const serverErrorClient = createApiClient({
      baseUrl: 'http://localhost:4000',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'An unexpected internal server error occurred.',
            },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    await expect(serverErrorClient.getProblemBySlug('two-sum-indices')).rejects.toBeInstanceOf(
      ApiClientError,
    );

    // If a compromised response ever attempted to include a hidden test case (isPublic: false),
    // the client Zod contract validation rejects it immediately.
    const leakedHiddenTestClient = createApiClient({
      baseUrl: 'http://localhost:4000',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            problem: {
              ...createSampleProblem(),
              publicTestCases: [
                {
                  id: '20000000-0000-4000-8000-000000000099',
                  sequence: 1,
                  input: 'hidden',
                  expectedOutput: 'hidden',
                  explanation: null,
                  isPublic: false,
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    await expect(leakedHiddenTestClient.getProblemBySlug('two-sum-indices')).rejects.toThrow();
  });
});
