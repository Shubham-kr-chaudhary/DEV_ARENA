import {
  getStarterTemplate,
  isSupportedArenaLanguageSlug,
  type ArenaLanguageSlug,
} from './arena-templates';

export interface KeyValueStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredCodeDraftRecord {
  readonly version: 1;
  readonly problemSlug: string;
  readonly languageSlug: ArenaLanguageSlug;
  readonly sourceCode: string;
  readonly updatedAt: string;
}

export interface LoadedDraftResult {
  readonly sourceCode: string;
  readonly source: 'saved_draft' | 'starter_template';
  readonly updatedAt: string | null;
  readonly storageAvailable: boolean;
}

export interface SaveDraftResult {
  readonly saved: boolean;
  readonly storageAvailable: boolean;
  readonly updatedAt: string;
}

const DRAFT_KEY_PREFIX = 'devarena:code:v1:practice';
const PREF_LANG_KEY_PREFIX = 'devarena:lang:v1:practice';
const CUSTOM_INPUT_KEY_PREFIX = 'devarena:stdin:v1:practice';
const MAX_STORED_DRAFT_BYTES = 256 * 1024; // 256 KB safety ceiling for local drafts

export const DEFAULT_DRAFT_SAVE_DEBOUNCE_MS = 250;

export function buildDraftStorageKey(problemSlug: string, languageSlug: ArenaLanguageSlug): string {
  const normalizedProblem = problemSlug.trim().toLowerCase();
  return `${DRAFT_KEY_PREFIX}:${normalizedProblem}:${languageSlug}`;
}

export function buildPreferredLanguageStorageKey(problemSlug: string): string {
  const normalizedProblem = problemSlug.trim().toLowerCase();
  return `${PREF_LANG_KEY_PREFIX}:${normalizedProblem}`;
}

export function buildCustomInputStorageKey(problemSlug: string): string {
  const normalizedProblem = problemSlug.trim().toLowerCase();
  return `${CUSTOM_INPUT_KEY_PREFIX}:${normalizedProblem}`;
}

export function resolveBrowserLocalStorage(): KeyValueStorageAdapter | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const storage = window.localStorage;
    if (
      !storage ||
      typeof storage.getItem !== 'function' ||
      typeof storage.setItem !== 'function'
    ) {
      return null;
    }
    return storage;
  } catch {
    return null;
  }
}

function isValidStoredDraftRecord(
  candidate: unknown,
  expectedProblemSlug: string,
  expectedLanguageSlug: ArenaLanguageSlug,
): candidate is StoredCodeDraftRecord {
  if (typeof candidate !== 'object' || candidate === null) {
    return false;
  }

  const record = candidate as Record<string, unknown>;
  if (record.version !== 1) {
    return false;
  }
  if (
    typeof record.problemSlug !== 'string' ||
    record.problemSlug.trim().toLowerCase() !== expectedProblemSlug.trim().toLowerCase()
  ) {
    return false;
  }
  if (typeof record.languageSlug !== 'string' || record.languageSlug !== expectedLanguageSlug) {
    return false;
  }
  if (typeof record.sourceCode !== 'string' || record.sourceCode.length > MAX_STORED_DRAFT_BYTES) {
    return false;
  }
  if (typeof record.updatedAt !== 'string' || record.updatedAt.length === 0) {
    return false;
  }

  return true;
}

/**
 * Loads a saved code draft for `(problemSlug, languageSlug)` or returns the language-specific
 * starter template if no valid saved draft exists.
 *
 * Safety invariants:
 * - Never accesses browser storage during SSR (`storage === null`).
 * - Never crashes on corrupted JSON, quota errors, or security exceptions.
 * - Verifies that the stored record's `problemSlug` and `languageSlug` match the requested
 *   keys so a draft from one problem or language can never contaminate another.
 */
export function loadArenaCodeDraft(options: {
  readonly problemSlug: string;
  readonly languageSlug: ArenaLanguageSlug;
  readonly problemTitle?: string | undefined;
  readonly storage?: KeyValueStorageAdapter | null | undefined;
}): LoadedDraftResult {
  const { problemSlug, languageSlug, problemTitle } = options;
  const storage = options.storage !== undefined ? options.storage : resolveBrowserLocalStorage();
  const starterCode = getStarterTemplate(problemSlug, languageSlug, problemTitle);

  if (!storage) {
    return {
      sourceCode: starterCode,
      source: 'starter_template',
      updatedAt: null,
      storageAvailable: false,
    };
  }

  const key = buildDraftStorageKey(problemSlug, languageSlug);

  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return {
        sourceCode: starterCode,
        source: 'starter_template',
        updatedAt: null,
        storageAvailable: true,
      };
    }

    const parsed: unknown = JSON.parse(raw);
    if (!isValidStoredDraftRecord(parsed, problemSlug, languageSlug)) {
      return {
        sourceCode: starterCode,
        source: 'starter_template',
        updatedAt: null,
        storageAvailable: true,
      };
    }

    return {
      sourceCode: parsed.sourceCode,
      source: 'saved_draft',
      updatedAt: parsed.updatedAt,
      storageAvailable: true,
    };
  } catch {
    return {
      sourceCode: starterCode,
      source: 'starter_template',
      updatedAt: null,
      storageAvailable: false,
    };
  }
}

export function saveArenaCodeDraft(options: {
  readonly problemSlug: string;
  readonly languageSlug: ArenaLanguageSlug;
  readonly sourceCode: string;
  readonly storage?: KeyValueStorageAdapter | null | undefined;
  readonly now?: Date | undefined;
}): SaveDraftResult {
  const storage = options.storage !== undefined ? options.storage : resolveBrowserLocalStorage();
  const updatedAt = (options.now ?? new Date()).toISOString();

  if (!storage || options.sourceCode.length > MAX_STORED_DRAFT_BYTES) {
    return {
      saved: false,
      storageAvailable: false,
      updatedAt,
    };
  }

  const key = buildDraftStorageKey(options.problemSlug, options.languageSlug);
  const payload: StoredCodeDraftRecord = {
    version: 1,
    problemSlug: options.problemSlug.trim().toLowerCase(),
    languageSlug: options.languageSlug,
    sourceCode: options.sourceCode,
    updatedAt,
  };

  try {
    storage.setItem(key, JSON.stringify(payload));
    return {
      saved: true,
      storageAvailable: true,
      updatedAt,
    };
  } catch {
    return {
      saved: false,
      storageAvailable: false,
      updatedAt,
    };
  }
}

export function clearArenaCodeDraft(options: {
  readonly problemSlug: string;
  readonly languageSlug: ArenaLanguageSlug;
  readonly storage?: KeyValueStorageAdapter | null | undefined;
}): boolean {
  const storage = options.storage !== undefined ? options.storage : resolveBrowserLocalStorage();
  if (!storage) {
    return false;
  }

  try {
    storage.removeItem(buildDraftStorageKey(options.problemSlug, options.languageSlug));
    return true;
  } catch {
    return false;
  }
}

export function loadPreferredArenaLanguage(
  problemSlug: string,
  storage?: KeyValueStorageAdapter | null,
): ArenaLanguageSlug | null {
  const resolved = storage !== undefined ? storage : resolveBrowserLocalStorage();
  if (!resolved) {
    return null;
  }

  try {
    const raw = resolved.getItem(buildPreferredLanguageStorageKey(problemSlug));
    if (raw && isSupportedArenaLanguageSlug(raw)) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function savePreferredArenaLanguage(
  problemSlug: string,
  languageSlug: ArenaLanguageSlug,
  storage?: KeyValueStorageAdapter | null,
): boolean {
  const resolved = storage !== undefined ? storage : resolveBrowserLocalStorage();
  if (!resolved) {
    return false;
  }

  try {
    resolved.setItem(buildPreferredLanguageStorageKey(problemSlug), languageSlug);
    return true;
  } catch {
    return false;
  }
}

export function loadSavedCustomInput(
  problemSlug: string,
  storage?: KeyValueStorageAdapter | null,
): string | null {
  const resolved = storage !== undefined ? storage : resolveBrowserLocalStorage();
  if (!resolved) {
    return null;
  }

  try {
    const raw = resolved.getItem(buildCustomInputStorageKey(problemSlug));
    if (typeof raw === 'string' && raw.length <= MAX_STORED_DRAFT_BYTES) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveCustomInput(
  problemSlug: string,
  customInput: string,
  storage?: KeyValueStorageAdapter | null,
): boolean {
  const resolved = storage !== undefined ? storage : resolveBrowserLocalStorage();
  if (!resolved || customInput.length > MAX_STORED_DRAFT_BYTES) {
    return false;
  }

  try {
    resolved.setItem(buildCustomInputStorageKey(problemSlug), customInput);
    return true;
  } catch {
    return false;
  }
}
