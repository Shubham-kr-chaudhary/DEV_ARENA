'use client';

import type { AuthenticatedUserDto, PublicProblemDetailContractDto } from '@devarena/api-contracts';
import Link from 'next/link';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { DEFAULT_DRAFT_SAVE_DEBOUNCE_MS, saveArenaCodeDraft } from '../../lib/arena-storage';
import {
  ARENA_LANGUAGES,
  SUPPORTED_ARENA_LANGUAGE_SLUGS,
  type ArenaLanguageSlug,
} from '../../lib/arena-templates';
import {
  buildPhase5ExecutionStageNotice,
  computeUtf8ByteLength,
  initializeArenaWorkspaceState,
  resetArenaLanguageToTemplate,
  resolveAvailableSampleCases,
  switchArenaLanguage,
  updateArenaCustomInput,
  type ArenaExecutionStageNotice,
  type ArenaTestTab,
} from '../../lib/arena-workspace';
import {
  IconCheck,
  IconChevronLeft,
  IconCode,
  IconCopy,
  IconPlay,
  IconRotateCcw,
  IconSend,
} from './ArenaIcons';
import { ArenaTestbenchPanel } from './ArenaTestbenchPanel';
import { CodeEditorLazy } from './CodeEditorLazy';
import type { CursorPosition } from './MonacoCodeEditor';
import { ProblemSpecificationPane } from './ProblemSpecificationPane';

export interface CodingArenaWorkspaceProps {
  readonly problem: PublicProblemDetailContractDto;
  readonly currentUser: AuthenticatedUserDto | null;
}

type MobileWorkspacePane = 'problem' | 'editor' | 'testbench';

const MIN_LEFT_PANE_PERCENT = 32;
const MAX_LEFT_PANE_PERCENT = 68;
const DEFAULT_LEFT_PANE_PERCENT = 46;

export function CodingArenaWorkspace({ problem, currentUser }: CodingArenaWorkspaceProps) {
  const initialWorkspace = useMemo(() => initializeArenaWorkspaceState(problem), [problem]);

  const [selectedLanguage, setSelectedLanguage] = useState<ArenaLanguageSlug>(
    initialWorkspace.selectedLanguage,
  );
  const [buffersByLanguage, setBuffersByLanguage] = useState<
    Readonly<Record<ArenaLanguageSlug, string>>
  >(initialWorkspace.buffersByLanguage);
  const [draftStatusByLanguage, setDraftStatusByLanguage] = useState<
    Readonly<Record<ArenaLanguageSlug, 'saved_draft' | 'starter_template' | 'saving'>>
  >(initialWorkspace.draftStatusByLanguage);
  const [storageAvailable, setStorageAvailable] = useState<boolean>(
    initialWorkspace.storageAvailable,
  );

  const [customInput, setCustomInput] = useState<string>(initialWorkspace.customInput);
  const [selectedSampleSequence, setSelectedSampleSequence] = useState<number>(
    initialWorkspace.selectedSampleSequence,
  );
  const [activeTestTab, setActiveTestTab] = useState<ArenaTestTab>('sample');
  const [executionNotice, setExecutionNotice] = useState<ArenaExecutionStageNotice | null>(null);

  const [fontSize, setFontSize] = useState<number>(14);
  const [cursorPosition, setCursorPosition] = useState<CursorPosition>({
    lineNumber: 1,
    column: 1,
  });
  const [engineMode, setEngineMode] = useState<'loading' | 'monaco' | 'fallback'>('loading');
  const [confirmingReset, setConfirmingReset] = useState<boolean>(false);
  const [copiedSource, setCopiedSource] = useState<boolean>(false);

  const [leftPanePercent, setLeftPanePercent] = useState<number>(DEFAULT_LEFT_PANE_PERCENT);
  const [mobilePane, setMobilePane] = useState<MobileWorkspacePane>('editor');
  const splitContainerRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const sampleTestCases = useMemo(() => resolveAvailableSampleCases(problem), [problem]);
  const currentCode = buffersByLanguage[selectedLanguage];
  const currentLanguageMeta = ARENA_LANGUAGES[selectedLanguage];
  const currentSourceBytes = useMemo(() => computeUtf8ByteLength(currentCode), [currentCode]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleCodeChange = useCallback(
    (nextValue: string) => {
      setConfirmingReset(false);
      setBuffersByLanguage((prev) => ({
        ...prev,
        [selectedLanguage]: nextValue,
      }));
      setDraftStatusByLanguage((prev) => ({
        ...prev,
        [selectedLanguage]: 'saving',
      }));

      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
      }

      const targetProblemSlug = problem.slug;
      const targetLanguage = selectedLanguage;

      debounceTimerRef.current = window.setTimeout(() => {
        const result = saveArenaCodeDraft({
          problemSlug: targetProblemSlug,
          languageSlug: targetLanguage,
          sourceCode: nextValue,
        });
        setStorageAvailable(result.storageAvailable);
        setDraftStatusByLanguage((prev) => ({
          ...prev,
          [targetLanguage]: 'saved_draft',
        }));
      }, DEFAULT_DRAFT_SAVE_DEBOUNCE_MS);
    },
    [problem.slug, selectedLanguage],
  );

  function handleLanguageSelect(nextLang: ArenaLanguageSlug) {
    if (nextLang === selectedLanguage) {
      return;
    }

    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const switched = switchArenaLanguage({
      problemSlug: problem.slug,
      currentLanguage: selectedLanguage,
      currentCode,
      nextLanguage: nextLang,
      buffersByLanguage,
      problemTitle: problem.title,
    });

    setSelectedLanguage(switched.selectedLanguage);
    setBuffersByLanguage(switched.buffersByLanguage);
    setConfirmingReset(false);
    setCursorPosition({ lineNumber: 1, column: 1 });
  }

  function handleConfirmResetToTemplate() {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const templateCode = resetArenaLanguageToTemplate({
      problemSlug: problem.slug,
      languageSlug: selectedLanguage,
      problemTitle: problem.title,
    });

    setBuffersByLanguage((prev) => ({
      ...prev,
      [selectedLanguage]: templateCode,
    }));
    setDraftStatusByLanguage((prev) => ({
      ...prev,
      [selectedLanguage]: 'starter_template',
    }));
    setConfirmingReset(false);
  }

  function handleCopySourceCode() {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(currentCode);
    }
    setCopiedSource(true);
    window.setTimeout(() => {
      setCopiedSource(false);
    }, 1500);
  }

  function handleCustomInputChange(nextInput: string) {
    const updated = updateArenaCustomInput({
      problemSlug: problem.slug,
      customInput: nextInput,
    });
    setCustomInput(updated);
  }

  function handleUseInputAsCustom(inputText: string) {
    handleCustomInputChange(inputText);
    setActiveTestTab('custom');
    setMobilePane('testbench');
  }

  function handleStageExecution(action: 'run_samples' | 'run_custom' | 'submit') {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    saveArenaCodeDraft({
      problemSlug: problem.slug,
      languageSlug: selectedLanguage,
      sourceCode: currentCode,
    });
    setDraftStatusByLanguage((prev) => ({
      ...prev,
      [selectedLanguage]: 'saved_draft',
    }));

    const selectedSample =
      sampleTestCases.find((tc) => tc.sequence === selectedSampleSequence) ?? sampleTestCases[0];
    const stdinPreview =
      action === 'run_custom' ? customInput : (selectedSample?.input ?? customInput);

    const notice = buildPhase5ExecutionStageNotice({
      action,
      problem,
      languageSlug: selectedLanguage,
      sourceCode: currentCode,
      stdinPreview,
    });

    setExecutionNotice(notice);
    setActiveTestTab('output');
    if (mobilePane === 'problem') {
      setMobilePane('testbench');
    }
  }

  function handleSplitterPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const container = splitContainerRef.current;
    if (!container) {
      return;
    }

    const rect = container.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      const relativeX = moveEvent.clientX - rect.left;
      const rawPercent = (relativeX / rect.width) * 100;
      const clamped = Math.max(
        MIN_LEFT_PANE_PERCENT,
        Math.min(MAX_LEFT_PANE_PERCENT, Math.round(rawPercent * 10) / 10),
      );
      setLeftPanePercent(clamped);
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }

  function handleSplitterKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setLeftPanePercent((prev) => Math.max(MIN_LEFT_PANE_PERCENT, prev - 2));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setLeftPanePercent((prev) => Math.min(MAX_LEFT_PANE_PERCENT, prev + 2));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setLeftPanePercent(DEFAULT_LEFT_PANE_PERCENT);
    }
  }

  const currentDraftStatus = draftStatusByLanguage[selectedLanguage];
  let draftBadgeLabel = 'Starter template';
  if (!storageAvailable) {
    draftBadgeLabel = 'In-memory draft';
  } else if (currentDraftStatus === 'saving') {
    draftBadgeLabel = 'Saving draft...';
  } else if (currentDraftStatus === 'saved_draft') {
    draftBadgeLabel = 'Draft saved locally';
  }

  let engineModeLabel = 'Initializing...';
  if (engineMode === 'monaco') {
    engineModeLabel = 'Monaco Editor';
  } else if (engineMode === 'fallback') {
    engineModeLabel = 'Synchronized Code Editor';
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100 lg:h-screen lg:overflow-hidden">
      {/* Top Arena Navigation & Action Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/problems"
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-700 hover:text-white"
          >
            <IconChevronLeft className="h-3.5 w-3.5" />
            <span>Problems</span>
          </Link>

          <div className="flex items-center gap-2">
            <IconCode className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-semibold text-zinc-100">{problem.title}</span>
            <span className="hidden font-mono text-xs text-zinc-500 sm:inline">
              ({problem.slug})
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              handleStageExecution(activeTestTab === 'custom' ? 'run_custom' : 'run_samples')
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            <IconPlay className="h-3.5 w-3.5 text-emerald-400" />
            <span>{activeTestTab === 'custom' ? 'Run Custom Input' : 'Run Sample Tests'}</span>
          </button>

          <button
            type="button"
            onClick={() => handleStageExecution('submit')}
            className="inline-flex items-center gap-1.5 rounded-md bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            <IconSend className="h-3.5 w-3.5" />
            <span>Submit Solution</span>
          </button>

          {currentUser ? (
            <span className="hidden rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 xl:inline-block">
              {currentUser.profile?.username ?? currentUser.email}
            </span>
          ) : (
            <Link
              href="/login"
              className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      {/* Mobile / Tablet Pane Switcher (< lg) */}
      <div
        role="tablist"
        aria-label="Workspace view selector"
        className="flex border-b border-zinc-800 bg-zinc-900/70 px-4 py-1.5 lg:hidden"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'problem'}
          onClick={() => setMobilePane('problem')}
          className={`flex-1 rounded py-1.5 text-xs font-medium ${
            mobilePane === 'problem' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
          }`}
        >
          Problem Statement
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'editor'}
          onClick={() => setMobilePane('editor')}
          className={`flex-1 rounded py-1.5 text-xs font-medium ${
            mobilePane === 'editor' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
          }`}
        >
          Code Editor ({currentLanguageMeta.shortLabel})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === 'testbench'}
          onClick={() => setMobilePane('testbench')}
          className={`flex-1 rounded py-1.5 text-xs font-medium ${
            mobilePane === 'testbench' ? 'bg-zinc-800 text-white' : 'text-zinc-400'
          }`}
        >
          Test Cases ({sampleTestCases.length})
        </button>
      </div>

      {/* Main Split-Pane Workspace */}
      <div ref={splitContainerRef} className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Left Pane: Problem Statement & Examples */}
        <div
          style={{ width: `${leftPanePercent}%` }}
          className={`${
            mobilePane === 'problem' ? 'flex' : 'hidden'
          } h-full w-full flex-col overflow-hidden lg:flex lg:w-[var(--left-pane-width)]`}
        >
          <ProblemSpecificationPane problem={problem} onUseInputAsCustom={handleUseInputAsCustom} />
        </div>

        {/* Interactive Split-Pane Resizer (Desktop lg+) */}
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize problem and code editor panes"
          aria-orientation="vertical"
          aria-valuemin={MIN_LEFT_PANE_PERCENT}
          aria-valuemax={MAX_LEFT_PANE_PERCENT}
          aria-valuenow={Math.round(leftPanePercent)}
          onPointerDown={handleSplitterPointerDown}
          onKeyDown={handleSplitterKeyDown}
          title="Drag or use Left/Right arrow keys to resize panes"
          className="hidden w-1.5 shrink-0 cursor-col-resize items-center justify-center border-x border-zinc-800 bg-zinc-900 transition hover:bg-zinc-700 focus:bg-sky-500 focus:outline-none lg:flex"
        >
          <div className="h-8 w-0.5 rounded bg-zinc-600" />
        </div>

        {/* Right Pane: Editor Toolbar + Code Editor + Testbench */}
        <div
          className={`${
            mobilePane === 'problem' ? 'hidden' : 'flex'
          } h-full min-w-0 flex-1 flex-col overflow-hidden lg:flex`}
        >
          {/* Editor Control Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/50 px-3.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="arena-language-select" className="sr-only">
                Programming Language
              </label>
              <select
                id="arena-language-select"
                aria-label="Programming Language"
                value={selectedLanguage}
                onChange={(e) => handleLanguageSelect(e.target.value as ArenaLanguageSlug)}
                className="rounded border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-100 focus:border-zinc-500 focus:outline-none"
              >
                {SUPPORTED_ARENA_LANGUAGE_SLUGS.map((slug) => (
                  <option key={slug} value={slug}>
                    {ARENA_LANGUAGES[slug].label}
                  </option>
                ))}
              </select>

              <span className="rounded border border-zinc-800 bg-zinc-950 px-2 py-0.5 font-mono text-[11px] text-zinc-400">
                {currentLanguageMeta.sourceFileName}
              </span>

              <span
                aria-live="polite"
                className="rounded border border-zinc-800/80 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400"
              >
                {draftBadgeLabel}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <label htmlFor="arena-font-size" className="sr-only">
                Editor font size
              </label>
              <select
                id="arena-font-size"
                aria-label="Editor font size"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="rounded border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[11px] text-zinc-300 focus:border-zinc-600 focus:outline-none"
              >
                <option value={12}>12px</option>
                <option value={13}>13px</option>
                <option value={14}>14px</option>
                <option value={15}>15px</option>
                <option value={16}>16px</option>
                <option value={18}>18px</option>
              </select>

              <button
                type="button"
                onClick={handleCopySourceCode}
                className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
              >
                {copiedSource ? (
                  <>
                    <IconCheck className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <IconCopy className="h-3.5 w-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              {confirmingReset ? (
                <div className="inline-flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleConfirmResetToTemplate}
                    className="rounded border border-rose-700 bg-rose-950/70 px-2.5 py-1 text-xs font-medium text-rose-200 hover:bg-rose-900/70"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                >
                  <IconRotateCcw className="h-3.5 w-3.5" />
                  <span>Reset Template</span>
                </button>
              )}
            </div>
          </div>

          {/* Code Editor Surface */}
          <div
            className={`${
              mobilePane === 'testbench' ? 'hidden lg:flex' : 'flex'
            } min-h-[320px] flex-1 flex-col overflow-hidden`}
          >
            <CodeEditorLazy
              value={currentCode}
              language={selectedLanguage}
              fontSize={fontSize}
              onChange={handleCodeChange}
              onCursorChange={setCursorPosition}
              onEngineModeChange={setEngineMode}
            />
          </div>

          {/* Bottom Testbench Dock */}
          <div
            className={`${
              mobilePane === 'editor' ? 'hidden lg:flex' : 'flex'
            } h-64 shrink-0 flex-col overflow-hidden`}
          >
            <ArenaTestbenchPanel
              activeTab={activeTestTab}
              onTabChange={setActiveTestTab}
              sampleTestCases={sampleTestCases}
              selectedSampleSequence={selectedSampleSequence}
              onSelectSampleSequence={setSelectedSampleSequence}
              customInput={customInput}
              onCustomInputChange={handleCustomInputChange}
              onCopySampleToCustom={handleUseInputAsCustom}
              executionNotice={executionNotice}
            />
          </div>

          {/* Editor Telemetry Status Bar */}
          <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 bg-zinc-950 px-3.5 py-1 font-mono text-[11px] text-zinc-400">
            <div className="flex items-center gap-3">
              <span>
                Ln {cursorPosition.lineNumber}, Col {cursorPosition.column}
              </span>
              <span>UTF-8</span>
              <span
                className={
                  currentSourceBytes > problem.sourceSizeLimitBytes
                    ? 'font-semibold text-rose-400'
                    : 'text-zinc-400'
                }
              >
                {currentSourceBytes.toLocaleString()} /{' '}
                {Math.round(problem.sourceSizeLimitBytes / 1024)} KB
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="hidden sm:inline">
                {currentLanguageMeta.compilerOrRuntimeSummary}
              </span>
              <span className="text-zinc-500">{engineModeLabel}</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
