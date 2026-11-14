'use client';

import type { PublicTestCaseContractDto } from '@devarena/api-contracts';
import {
  computeUtf8ByteLength,
  type ArenaExecutionStageNotice,
  type ArenaTestTab,
} from '../../lib/arena-workspace';
import { IconInfo, IconTerminal } from './ArenaIcons';

export interface ArenaTestbenchPanelProps {
  readonly activeTab: ArenaTestTab;
  readonly onTabChange: (tab: ArenaTestTab) => void;
  readonly sampleTestCases: readonly PublicTestCaseContractDto[];
  readonly selectedSampleSequence: number;
  readonly onSelectSampleSequence: (sequence: number) => void;
  readonly customInput: string;
  readonly onCustomInputChange: (nextInput: string) => void;
  readonly onCopySampleToCustom: (sampleInput: string) => void;
  readonly executionNotice: ArenaExecutionStageNotice | null;
}

export function ArenaTestbenchPanel({
  activeTab,
  onTabChange,
  sampleTestCases,
  selectedSampleSequence,
  onSelectSampleSequence,
  customInput,
  onCustomInputChange,
  onCopySampleToCustom,
  executionNotice,
}: ArenaTestbenchPanelProps) {
  const selectedSample =
    sampleTestCases.find((tc) => tc.sequence === selectedSampleSequence) ?? sampleTestCases[0];

  const customInputBytes = computeUtf8ByteLength(customInput);
  const sampleTabClass =
    activeTab === 'sample'
      ? 'bg-zinc-800 text-zinc-50'
      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200';
  const customTabClass =
    activeTab === 'custom'
      ? 'bg-zinc-800 text-zinc-50'
      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200';
  const outputTabClass =
    activeTab === 'output'
      ? 'bg-zinc-800 text-zinc-50'
      : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200';
  const noticeDotClass =
    executionNotice?.kind === 'validation_error' ? 'bg-rose-400' : 'bg-amber-400';
  const noticeBoxClass =
    executionNotice?.kind === 'validation_error'
      ? 'border-rose-800/90 bg-rose-950/40 text-rose-200'
      : 'border-amber-800/90 bg-amber-950/30 text-amber-100';

  return (
    <section
      aria-label="Test cases and execution console"
      className="flex h-full flex-col border-t border-zinc-800 bg-zinc-950 text-zinc-100"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-1.5">
        <div role="tablist" aria-label="Testbench tabs" className="flex items-center gap-1">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'sample'}
            onClick={() => onTabChange('sample')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${sampleTabClass}`}
          >
            Sample Test Cases ({sampleTestCases.length})
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'custom'}
            onClick={() => onTabChange('custom')}
            className={`rounded px-2.5 py-1 text-xs font-medium transition ${customTabClass}`}
          >
            Custom Input (stdin)
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'output'}
            onClick={() => onTabChange('output')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition ${outputTabClass}`}
          >
            <IconTerminal className="h-3.5 w-3.5" />
            <span>Execution Output</span>
            {executionNotice ? (
              <span className={`h-1.5 w-1.5 rounded-full ${noticeDotClass}`} />
            ) : null}
          </button>
        </div>

        <span className="text-[11px] text-zinc-400">
          {activeTab === 'custom'
            ? `Custom stdin: ${customInputBytes.toLocaleString()} bytes`
            : 'Public sample cases only'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5">
        {activeTab === 'sample' ? (
          sampleTestCases.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-400">
              No public sample test cases are configured for this problem. Use the Custom Input tab
              to prepare standard input.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className="flex flex-wrap gap-1.5"
                  role="group"
                  aria-label="Sample test selector"
                >
                  {sampleTestCases.map((tc) => {
                    const isSelected = tc.sequence === selectedSample?.sequence;
                    const pillClass = isSelected
                      ? 'border-zinc-500 bg-zinc-800 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200';
                    return (
                      <button
                        key={tc.id}
                        type="button"
                        onClick={() => onSelectSampleSequence(tc.sequence)}
                        className={`rounded border px-2.5 py-1 font-mono text-xs font-medium transition ${pillClass}`}
                      >
                        Sample #{tc.sequence}
                      </button>
                    );
                  })}
                </div>

                {selectedSample ? (
                  <button
                    type="button"
                    onClick={() => onCopySampleToCustom(selectedSample.input)}
                    className="rounded border border-zinc-700/80 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                  >
                    Edit in Custom Input
                  </button>
                ) : null}
              </div>

              {selectedSample ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      <span>Standard Input (stdin)</span>
                      <span className="font-mono text-zinc-500">
                        {computeUtf8ByteLength(selectedSample.input)} B
                      </span>
                    </div>
                    <pre className="mt-1 max-h-36 overflow-auto rounded border border-zinc-800 bg-zinc-900/70 p-2.5 font-mono text-xs leading-5 text-zinc-100">
                      {selectedSample.input}
                    </pre>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      <span>Expected Output (stdout)</span>
                      <span className="font-mono text-zinc-500">
                        {computeUtf8ByteLength(selectedSample.expectedOutput)} B
                      </span>
                    </div>
                    <pre className="mt-1 max-h-36 overflow-auto rounded border border-zinc-800 bg-zinc-900/70 p-2.5 font-mono text-xs leading-5 text-zinc-100">
                      {selectedSample.expectedOutput}
                    </pre>
                  </div>

                  {selectedSample.explanation ? (
                    <div className="md:col-span-2">
                      <p className="text-xs text-zinc-300">
                        <strong className="font-semibold text-zinc-200">Note:</strong>{' '}
                        {selectedSample.explanation}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        ) : null}

        {activeTab === 'custom' ? (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-zinc-300">
                  Custom Standard Input (stdin):
                </span>
                {sampleTestCases.map((tc) => (
                  <button
                    key={tc.id}
                    type="button"
                    onClick={() => onCustomInputChange(tc.input)}
                    className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-300 hover:border-zinc-600 hover:text-white"
                  >
                    Load Sample #{tc.sequence}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => onCustomInputChange('')}
                className="text-xs text-zinc-400 underline hover:text-zinc-200"
              >
                Clear stdin
              </button>
            </div>

            <textarea
              aria-label="Custom standard input"
              rows={5}
              spellCheck={false}
              value={customInput}
              onChange={(e) => onCustomInputChange(e.target.value)}
              placeholder="Enter custom standard input (stdin) lines here..."
              className="w-full rounded border border-zinc-800 bg-zinc-900/70 p-2.5 font-mono text-xs leading-5 text-zinc-100 focus:border-zinc-500 focus:outline-none"
            />
          </div>
        ) : null}

        {activeTab === 'output' ? (
          executionNotice ? (
            <div
              role="region"
              aria-label="Execution status notice"
              className={`rounded-lg border p-3.5 text-xs ${noticeBoxClass}`}
            >
              <div className="flex items-start gap-2.5">
                <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold text-zinc-100">{executionNotice.title}</h3>
                    <span className="font-mono text-[11px] text-zinc-400">
                      {executionNotice.sourceFileName} &bull;{' '}
                      {executionNotice.sourceBytes.toLocaleString()} /{' '}
                      {executionNotice.sourceSizeLimitBytes.toLocaleString()} B
                    </span>
                  </div>
                  <p className="leading-relaxed text-zinc-200">{executionNotice.summary}</p>
                  {executionNotice.stdinPreview.trim().length > 0 ? (
                    <div>
                      <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                        Staged Standard Input Preview
                      </span>
                      <pre className="mt-1 max-h-24 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] text-zinc-200">
                        {executionNotice.stdinPreview}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-xs text-zinc-400">
              <p className="font-medium text-zinc-200">
                Execution Console Ready (Phase 5 Workspace Boundary)
              </p>
              <p className="mt-1 leading-relaxed">
                Select a sample test case or edit custom <code className="font-mono">stdin</code>.
                Code execution via <code className="font-mono">POST /api/v1/runs</code>, official
                submission queueing via <code className="font-mono">POST /api/v1/submissions</code>,
                and sandboxed judge evaluation will be connected in Phase 6.
              </p>
            </div>
          )
        ) : null}
      </div>
    </section>
  );
}
