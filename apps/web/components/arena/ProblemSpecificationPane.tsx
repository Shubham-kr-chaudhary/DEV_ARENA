'use client';

import type {
  ComparisonModeDto,
  ProblemDifficultyDto,
  PublicProblemDetailContractDto,
  UserSolveProgressStatusDto,
} from '@devarena/api-contracts';
import Link from 'next/link';
import { useState } from 'react';
import { IconCheck, IconClock, IconCopy, IconCpu } from './ArenaIcons';

export interface ProblemSpecificationPaneProps {
  readonly problem: PublicProblemDetailContractDto;
  readonly onUseInputAsCustom: (inputText: string) => void;
}

export function formatDifficultyLabel(difficulty: ProblemDifficultyDto): string {
  switch (difficulty) {
    case 'EASY':
      return 'Easy';
    case 'MEDIUM':
      return 'Medium';
    case 'HARD':
      return 'Hard';
  }
}

export function getDifficultyBadgeClass(difficulty: ProblemDifficultyDto): string {
  switch (difficulty) {
    case 'EASY':
      return 'border-emerald-800/90 bg-emerald-950/60 text-emerald-300';
    case 'MEDIUM':
      return 'border-amber-800/90 bg-amber-950/60 text-amber-300';
    case 'HARD':
      return 'border-rose-800/90 bg-rose-950/60 text-rose-300';
  }
}

export function formatProgressLabel(status: UserSolveProgressStatusDto): string {
  switch (status) {
    case 'SOLVED':
      return 'Solved';
    case 'ATTEMPTED':
      return 'Attempted';
    case 'UNSOLVED':
      return 'Unsolved';
  }
}

export function getProgressBadgeClass(status: UserSolveProgressStatusDto): string {
  switch (status) {
    case 'SOLVED':
      return 'border-emerald-700/80 bg-emerald-950/40 text-emerald-200';
    case 'ATTEMPTED':
      return 'border-sky-800/80 bg-sky-950/40 text-sky-200';
    case 'UNSOLVED':
      return 'border-zinc-800 bg-zinc-900 text-zinc-400';
  }
}

export function formatComparisonModeLabel(
  mode: ComparisonModeDto,
  floatTolerance: number | null,
): string {
  switch (mode) {
    case 'EXACT':
      return 'Exact byte-for-byte';
    case 'TRIM_WHITESPACE':
      return 'Whitespace-trimmed lines';
    case 'TOKEN_WHITESPACE':
      return 'Tokenized whitespace';
    case 'FLOAT_TOLERANCE':
      return `Float tolerance (${floatTolerance ?? 1e-6})`;
    case 'CUSTOM_CHECKER':
      return 'Custom validator';
  }
}

export function ProblemSpecificationPane({
  problem,
  onUseInputAsCustom,
}: ProblemSpecificationPaneProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  function handleCopyText(key: string, text: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1500);
  }

  const difficultyBadgeClass = getDifficultyBadgeClass(problem.difficulty);
  const progressBadgeClass = getProgressBadgeClass(problem.userProgressStatus);

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/50 px-5 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold ${difficultyBadgeClass}`}
          >
            {formatDifficultyLabel(problem.difficulty)}
          </span>
          <span
            className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${progressBadgeClass}`}
          >
            {formatProgressLabel(problem.userProgressStatus)}
          </span>
          <span className="font-mono text-xs text-zinc-500">{problem.slug}</span>
        </div>

        <Link
          href={`/problems/${problem.slug}`}
          className="text-xs font-medium text-zinc-400 transition hover:text-zinc-100"
        >
          Full page view &rarr;
        </Link>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-50">{problem.title}</h1>

          {problem.tags.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {problem.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-zinc-300"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          ) : null}

          <dl className="mt-4 grid grid-cols-2 gap-2.5 rounded-lg border border-zinc-800/90 bg-zinc-900/40 p-3 text-xs sm:grid-cols-4">
            <div>
              <dt className="flex items-center gap-1 text-zinc-400">
                <IconClock className="h-3.5 w-3.5 text-zinc-500" />
                <span>Time Limit</span>
              </dt>
              <dd className="mt-1 font-mono font-semibold text-zinc-100">
                {problem.timeLimitMs} ms
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-1 text-zinc-400">
                <IconCpu className="h-3.5 w-3.5 text-zinc-500" />
                <span>Memory Limit</span>
              </dt>
              <dd className="mt-1 font-mono font-semibold text-zinc-100">
                {problem.memoryLimitMb} MB
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400">Source Limit</dt>
              <dd className="mt-1 font-mono font-semibold text-zinc-100">
                {Math.round(problem.sourceSizeLimitBytes / 1024)} KB
              </dd>
            </div>
            <div>
              <dt className="text-zinc-400">Comparison</dt>
              <dd className="mt-1 font-medium text-zinc-200">
                {formatComparisonModeLabel(problem.comparisonMode, problem.floatTolerance)}
              </dd>
            </div>
          </dl>
        </div>

        <section aria-labelledby="arena-statement-heading">
          <h2
            id="arena-statement-heading"
            className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
          >
            Problem Statement
          </h2>
          <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-200">
            {problem.statement}
          </div>
        </section>

        <section aria-labelledby="arena-input-heading">
          <h2
            id="arena-input-heading"
            className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
          >
            Input Specification
          </h2>
          <div className="mt-2 whitespace-pre-wrap rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3.5 text-sm leading-relaxed text-zinc-200">
            {problem.inputFormat}
          </div>
        </section>

        <section aria-labelledby="arena-output-heading">
          <h2
            id="arena-output-heading"
            className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
          >
            Output Specification
          </h2>
          <div className="mt-2 whitespace-pre-wrap rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3.5 text-sm leading-relaxed text-zinc-200">
            {problem.outputFormat}
          </div>
        </section>

        {problem.constraints ? (
          <section aria-labelledby="arena-constraints-heading">
            <h2
              id="arena-constraints-heading"
              className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
            >
              Constraints
            </h2>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5 font-mono text-xs leading-6 text-zinc-200">
              {problem.constraints}
            </pre>
          </section>
        ) : null}

        {problem.examples.length > 0 ? (
          <section aria-labelledby="arena-examples-heading">
            <h2
              id="arena-examples-heading"
              className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
            >
              Public Examples ({problem.examples.length})
            </h2>
            <div className="mt-2.5 space-y-3.5">
              {problem.examples.map((example, index) => {
                const copyKey = `example-${index + 1}`;
                return (
                  <div
                    key={copyKey}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
                      <span className="font-mono text-xs font-semibold text-zinc-200">
                        Example #{index + 1}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyText(copyKey, example.input)}
                          className="inline-flex items-center gap-1 rounded border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                        >
                          {copiedKey === copyKey ? (
                            <>
                              <IconCheck className="h-3 w-3 text-emerald-400" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <IconCopy className="h-3 w-3" />
                              <span>Copy Input</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onUseInputAsCustom(example.input)}
                          className="rounded border border-zinc-700/80 bg-zinc-900 px-2 py-1 text-[11px] font-medium text-zinc-300 transition hover:border-zinc-500 hover:text-white"
                        >
                          Use as Custom Input
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                          Standard Input
                        </span>
                        <pre className="mt-1 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-xs leading-5 text-zinc-100">
                          {example.input}
                        </pre>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                          Expected Output
                        </span>
                        <pre className="mt-1 overflow-x-auto rounded border border-zinc-800 bg-zinc-950 p-2.5 font-mono text-xs leading-5 text-zinc-100">
                          {example.output}
                        </pre>
                      </div>
                    </div>

                    {example.explanation ? (
                      <p className="mt-2.5 text-xs leading-relaxed text-zinc-300">
                        <strong className="font-semibold text-zinc-200">Explanation:</strong>{' '}
                        {example.explanation}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {problem.explanation ? (
          <section aria-labelledby="arena-notes-heading">
            <h2
              id="arena-notes-heading"
              className="text-xs font-semibold uppercase tracking-wider text-zinc-400"
            >
              Additional Notes
            </h2>
            <div className="mt-2 whitespace-pre-wrap rounded-lg border border-zinc-800/80 bg-zinc-900/30 p-3.5 text-xs leading-relaxed text-zinc-300">
              {problem.explanation}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
