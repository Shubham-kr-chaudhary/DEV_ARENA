export type ArenaLanguageSlug = 'cpp' | 'javascript';

export interface ArenaLanguageMetadata {
  readonly slug: ArenaLanguageSlug;
  readonly label: string;
  readonly shortLabel: string;
  readonly monacoLanguage: 'cpp' | 'javascript';
  readonly sourceFileName: string;
  readonly compilerOrRuntimeSummary: string;
  readonly defaultTabSize: number;
}

export const ARENA_LANGUAGES: Readonly<Record<ArenaLanguageSlug, ArenaLanguageMetadata>> = {
  cpp: {
    slug: 'cpp',
    label: 'C++20 (GCC 14.2.0)',
    shortLabel: 'C++20',
    monacoLanguage: 'cpp',
    sourceFileName: 'main.cpp',
    compilerOrRuntimeSummary: 'g++ -std=c++20 -O2 -pipe',
    defaultTabSize: 4,
  },
  javascript: {
    slug: 'javascript',
    label: 'JavaScript (Node.js 22 LTS)',
    shortLabel: 'Node.js 22',
    monacoLanguage: 'javascript',
    sourceFileName: 'solution.mjs',
    compilerOrRuntimeSummary: 'node --check / ESM (stdin/stdout)',
    defaultTabSize: 2,
  },
};

export const SUPPORTED_ARENA_LANGUAGE_SLUGS: readonly ArenaLanguageSlug[] = ['cpp', 'javascript'];

export function isSupportedArenaLanguageSlug(value: string): value is ArenaLanguageSlug {
  return value === 'cpp' || value === 'javascript';
}

export function resolveArenaLanguageSlug(
  requestedSlug: string | null | undefined,
  availableSlugs?: readonly string[],
): ArenaLanguageSlug {
  if (requestedSlug && isSupportedArenaLanguageSlug(requestedSlug)) {
    if (!availableSlugs || availableSlugs.length === 0 || availableSlugs.includes(requestedSlug)) {
      return requestedSlug;
    }
  }

  if (availableSlugs && availableSlugs.length > 0) {
    for (const candidate of availableSlugs) {
      if (isSupportedArenaLanguageSlug(candidate)) {
        return candidate;
      }
    }
  }

  return 'cpp';
}

/**
 * Generates deterministic, standard-I/O starter templates matching the DevArena
 * Judge (`docs/judge.md` Section 5: `main.cpp` for C++20 and `solution.mjs` for Node.js 22 ESM).
 */
export function getStarterTemplate(
  problemSlug: string,
  languageSlug: ArenaLanguageSlug,
  problemTitle?: string,
): string {
  const normalizedSlug = problemSlug.trim() || 'problem';
  const headerTitle = problemTitle ? `${problemTitle} (${normalizedSlug})` : normalizedSlug;

  if (languageSlug === 'cpp') {
    return [
      `// DevArena — ${headerTitle}`,
      '// Language: C++20 (GCC 14.2.0) | Target: main.cpp',
      '#include <algorithm>',
      '#include <iostream>',
      '#include <string>',
      '#include <vector>',
      '',
      'using namespace std;',
      '',
      'void solve() {',
      '    // Read input from std::cin and write output to std::cout',
      '}',
      '',
      'int main() {',
      '    ios::sync_with_stdio(false);',
      '    cin.tie(nullptr);',
      '',
      '    solve();',
      '    return 0;',
      '}',
      '',
    ].join('\n');
  }

  return [
    `// DevArena — ${headerTitle}`,
    '// Language: JavaScript (Node.js 22 LTS ESM) | Target: solution.mjs',
    "import { readFileSync } from 'node:fs';",
    '',
    'function solve(rawInput) {',
    '  const lines = rawInput.trim().split(/\\r?\\n/);',
    "  if (lines.length === 0 || lines[0] === '') {",
    '    return;',
    '  }',
    '  // Parse lines from standard input and write output via console.log',
    '}',
    '',
    "const input = readFileSync(0, 'utf8');",
    'solve(input);',
    '',
  ].join('\n');
}
