import type {
  PublicProblemDetailContractDto,
  PublicTestCaseContractDto,
} from '@devarena/api-contracts';
import {
  clearArenaCodeDraft,
  loadArenaCodeDraft,
  loadPreferredArenaLanguage,
  loadSavedCustomInput,
  saveArenaCodeDraft,
  saveCustomInput,
  savePreferredArenaLanguage,
  type KeyValueStorageAdapter,
} from './arena-storage';
import {
  ARENA_LANGUAGES,
  getStarterTemplate,
  resolveArenaLanguageSlug,
  type ArenaLanguageSlug,
} from './arena-templates';

export type ArenaTestTab = 'sample' | 'custom' | 'output';

export interface ArenaExecutionStageNotice {
  readonly kind: 'phase5_execution_pending' | 'validation_error';
  readonly action: 'run_samples' | 'run_custom' | 'submit';
  readonly title: string;
  readonly summary: string;
  readonly problemSlug: string;
  readonly languageSlug: ArenaLanguageSlug;
  readonly sourceFileName: string;
  readonly sourceBytes: number;
  readonly sourceSizeLimitBytes: number;
  readonly stdinPreview: string;
  readonly timestampIso: string;
}

export interface InitializedArenaBuffers {
  readonly selectedLanguage: ArenaLanguageSlug;
  readonly buffersByLanguage: Readonly<Record<ArenaLanguageSlug, string>>;
  readonly draftStatusByLanguage: Readonly<
    Record<ArenaLanguageSlug, 'saved_draft' | 'starter_template'>
  >;
  readonly lastSavedAtByLanguage: Readonly<Record<ArenaLanguageSlug, string | null>>;
  readonly customInput: string;
  readonly selectedSampleSequence: number;
  readonly storageAvailable: boolean;
}

export function computeUtf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).byteLength;
  }
  return Buffer.byteLength(text, 'utf8');
}

export function resolveAvailableSampleCases(
  problem: PublicProblemDetailContractDto,
): readonly PublicTestCaseContractDto[] {
  if (problem.publicTestCases.length > 0) {
    return problem.publicTestCases;
  }

  return problem.examples.map((ex, index) => ({
    id: `example-fallback-${index + 1}`,
    sequence: index + 1,
    input: ex.input,
    expectedOutput: ex.output,
    explanation: ex.explanation ?? null,
    isPublic: true as const,
  }));
}

export function initializeArenaWorkspaceState(
  problem: PublicProblemDetailContractDto,
  storage?: KeyValueStorageAdapter | null,
): InitializedArenaBuffers {
  const availableSlugs = problem.supportedLanguages.filter((l) => l.isActive).map((l) => l.slug);

  const preferredLang = loadPreferredArenaLanguage(problem.slug, storage);
  const selectedLanguage = resolveArenaLanguageSlug(preferredLang, availableSlugs);

  const cppLoaded = loadArenaCodeDraft({
    problemSlug: problem.slug,
    languageSlug: 'cpp',
    problemTitle: problem.title,
    storage,
  });

  const jsLoaded = loadArenaCodeDraft({
    problemSlug: problem.slug,
    languageSlug: 'javascript',
    problemTitle: problem.title,
    storage,
  });

  const sampleCases = resolveAvailableSampleCases(problem);
  const firstSampleInput = sampleCases[0]?.input ?? '';
  const savedCustom = loadSavedCustomInput(problem.slug, storage);

  return {
    selectedLanguage,
    buffersByLanguage: {
      cpp: cppLoaded.sourceCode,
      javascript: jsLoaded.sourceCode,
    },
    draftStatusByLanguage: {
      cpp: cppLoaded.source,
      javascript: jsLoaded.source,
    },
    lastSavedAtByLanguage: {
      cpp: cppLoaded.updatedAt,
      javascript: jsLoaded.updatedAt,
    },
    customInput: savedCustom !== null ? savedCustom : firstSampleInput,
    selectedSampleSequence: sampleCases[0]?.sequence ?? 1,
    storageAvailable: cppLoaded.storageAvailable && jsLoaded.storageAvailable,
  };
}

export function switchArenaLanguage(options: {
  readonly problemSlug: string;
  readonly currentLanguage: ArenaLanguageSlug;
  readonly currentCode: string;
  readonly nextLanguage: ArenaLanguageSlug;
  readonly buffersByLanguage: Readonly<Record<ArenaLanguageSlug, string>>;
  readonly problemTitle?: string | undefined;
  readonly storage?: KeyValueStorageAdapter | null | undefined;
}): {
  readonly selectedLanguage: ArenaLanguageSlug;
  readonly buffersByLanguage: Readonly<Record<ArenaLanguageSlug, string>>;
  readonly nextCode: string;
} {
  const {
    problemSlug,
    currentLanguage,
    currentCode,
    nextLanguage,
    buffersByLanguage,
    problemTitle,
    storage,
  } = options;

  saveArenaCodeDraft({
    problemSlug,
    languageSlug: currentLanguage,
    sourceCode: currentCode,
    storage,
  });

  savePreferredArenaLanguage(problemSlug, nextLanguage, storage);

  const existingMemoryBuffer = buffersByLanguage[nextLanguage];
  const nextCode =
    typeof existingMemoryBuffer === 'string' && existingMemoryBuffer.length > 0
      ? existingMemoryBuffer
      : loadArenaCodeDraft({
          problemSlug,
          languageSlug: nextLanguage,
          problemTitle,
          storage,
        }).sourceCode;

  return {
    selectedLanguage: nextLanguage,
    buffersByLanguage: {
      ...buffersByLanguage,
      [currentLanguage]: currentCode,
      [nextLanguage]: nextCode,
    },
    nextCode,
  };
}

export function resetArenaLanguageToTemplate(options: {
  readonly problemSlug: string;
  readonly languageSlug: ArenaLanguageSlug;
  readonly problemTitle?: string | undefined;
  readonly storage?: KeyValueStorageAdapter | null | undefined;
}): string {
  clearArenaCodeDraft({
    problemSlug: options.problemSlug,
    languageSlug: options.languageSlug,
    storage: options.storage,
  });

  return getStarterTemplate(options.problemSlug, options.languageSlug, options.problemTitle);
}

export function updateArenaCustomInput(options: {
  readonly problemSlug: string;
  readonly customInput: string;
  readonly storage?: KeyValueStorageAdapter | null | undefined;
}): string {
  saveCustomInput(options.problemSlug, options.customInput, options.storage);
  return options.customInput;
}

/**
 * Evaluates a user-initiated Run or Submit action in Phase 5.
 *
 * Architectural boundary: Phase 5 strictly does not execute code or fabricate compiler/runtime
 * verdicts. It validates source size boundaries client-side and returns an explicit, honest
 * execution-stage notice describing the staged request ready for Phase 6 (`POST /api/v1/runs`
 * and `POST /api/v1/submissions`).
 */
export function buildPhase5ExecutionStageNotice(options: {
  readonly action: 'run_samples' | 'run_custom' | 'submit';
  readonly problem: PublicProblemDetailContractDto;
  readonly languageSlug: ArenaLanguageSlug;
  readonly sourceCode: string;
  readonly stdinPreview: string;
  readonly now?: Date | undefined;
}): ArenaExecutionStageNotice {
  const { action, problem, languageSlug, sourceCode, stdinPreview } = options;
  const languageMeta = ARENA_LANGUAGES[languageSlug];
  const shortLabel = languageMeta.shortLabel;
  const fullLabel = languageMeta.label;
  const fileName = languageMeta.sourceFileName;
  const limitBytes = problem.sourceSizeLimitBytes;
  const sourceBytes = computeUtf8ByteLength(sourceCode);
  const timestampIso = (options.now ?? new Date()).toISOString();

  if (sourceCode.trim().length === 0) {
    return {
      kind: 'validation_error',
      action,
      title: 'Source code is empty',
      summary: `Write a ${shortLabel} solution in ${fileName} before triggering execution.`,
      problemSlug: problem.slug,
      languageSlug,
      sourceFileName: fileName,
      sourceBytes,
      sourceSizeLimitBytes: limitBytes,
      stdinPreview,
      timestampIso,
    };
  }

  if (sourceBytes > limitBytes) {
    const limitKb = Math.round(limitBytes / 1024);
    return {
      kind: 'validation_error',
      action,
      title: 'Source size limit exceeded',
      summary: `Source code is ${sourceBytes} bytes, exceeding the problem limit of ${limitBytes} bytes (${limitKb} KB).`,
      problemSlug: problem.slug,
      languageSlug,
      sourceFileName: fileName,
      sourceBytes,
      sourceSizeLimitBytes: limitBytes,
      stdinPreview,
      timestampIso,
    };
  }

  const endpointLabel = action === 'submit' ? 'POST /api/v1/submissions' : 'POST /api/v1/runs';
  const sampleCount = resolveAvailableSampleCases(problem).length;
  let modeLabel = `Public Sample Test Suite (${sampleCount} sample case(s))`;
  if (action === 'submit') {
    modeLabel = 'Full Judge Evaluation (Public + Hidden Test Cases)';
  } else if (action === 'run_custom') {
    modeLabel = 'Custom Standard Input Run';
  }

  return {
    kind: 'phase5_execution_pending',
    action,
    title: 'Execution Backend Scheduled for Phase 6',
    summary: `Your ${fullLabel} buffer (${sourceBytes} bytes in ${fileName}) is saved locally and validated for ${modeLabel}. Remote execution via ${endpointLabel} and the isolated judge worker will be enabled in Phase 6.`,
    problemSlug: problem.slug,
    languageSlug,
    sourceFileName: fileName,
    sourceBytes,
    sourceSizeLimitBytes: limitBytes,
    stdinPreview,
    timestampIso,
  };
}
