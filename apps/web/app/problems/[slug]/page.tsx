'use client';

import type {
  ComparisonModeDto,
  ProblemDifficultyDto,
  PublicProblemDetailContractDto,
} from '@devarena/api-contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ApiClientError, apiClient } from '../../../lib/api-client';

function formatDifficultyLabel(difficulty: ProblemDifficultyDto): string {
  switch (difficulty) {
    case 'EASY':
      return 'Easy';
    case 'MEDIUM':
      return 'Medium';
    case 'HARD':
      return 'Hard';
  }
}

function getDifficultyBadgeClass(difficulty: ProblemDifficultyDto): string {
  switch (difficulty) {
    case 'EASY':
      return 'border-emerald-800 bg-emerald-950/60 text-emerald-300';
    case 'MEDIUM':
      return 'border-amber-800 bg-amber-950/60 text-amber-300';
    case 'HARD':
      return 'border-rose-800 bg-rose-950/60 text-rose-300';
  }
}

function formatComparisonMode(mode: ComparisonModeDto, floatTolerance: number | null): string {
  switch (mode) {
    case 'EXACT':
      return 'Exact byte-for-byte match';
    case 'TRIM_WHITESPACE':
      return 'Trim trailing whitespace & normalize newlines';
    case 'TOKEN_WHITESPACE':
      return 'Whitespace-tokenized match';
    case 'FLOAT_TOLERANCE':
      return `Floating-point tolerance (${floatTolerance ?? 1e-6})`;
    case 'CUSTOM_CHECKER':
      return 'Custom validator';
  }
}

export default function ProblemDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = typeof params?.slug === 'string' ? params.slug.trim() : '';

  const [problem, setProblem] = useState<PublicProblemDetailContractDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      return;
    }

    let cancelled = false;

    apiClient
      .getProblemBySlug(slug)
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setProblem(loaded);
        setNotFound(false);
        setErrorMessage(null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiClientError && error.statusCode === 404) {
          setNotFound(true);
        } else if (error instanceof ApiClientError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Failed to load problem details.');
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug || notFound) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Problem Not Found</h1>
        <p className="mt-3 text-sm text-zinc-400">
          The requested problem does not exist or has not been published.
        </p>
        <div className="mt-6">
          <Link
            href="/problems"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            Back to Problem Catalogue
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
        <p className="text-sm text-zinc-400">Loading problem statement...</p>
      </main>
    );
  }

  if (errorMessage || !problem) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
        <div
          role="alert"
          className="rounded-xl border border-red-800 bg-red-950/60 p-4 text-sm text-red-200"
        >
          {errorMessage ?? 'Unable to display problem.'}
        </div>
        <div className="mt-4">
          <Link href="/problems" className="text-sm text-zinc-300 underline hover:text-white">
            Return to Problem Catalogue
          </Link>
        </div>
      </main>
    );
  }
  const difficultyBadgeClass = getDifficultyBadgeClass(problem.difficulty);
  return (
    <main className="mx-auto min-h-screen max-w-5xl px-6 py-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Link href="/problems" className="text-sm text-zinc-400 hover:text-white">
          &larr; Back to Problem Catalogue
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300">
            Status: {problem.userProgressStatus}
          </span>
          <Link
            href={`/arena/${problem.slug}`}
            className="rounded-lg bg-white px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Open in Coding Arena &rarr;
          </Link>
        </div>
      </div>

      <header className="border-b border-zinc-800 pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${difficultyBadgeClass}`}
          >
            {formatDifficultyLabel(problem.difficulty)}
          </span>
          <span className="font-mono text-xs text-zinc-400">{problem.slug}</span>
        </div>

        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{problem.title}</h1>

        {problem.tags.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {problem.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-0.5 text-xs text-zinc-300"
              >
                {tag.name}
              </span>
            ))}
          </div>
        ) : null}

        <dl className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-xs sm:grid-cols-5">
          <div>
            <dt className="text-zinc-400">Time Limit</dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-zinc-100">
              {problem.timeLimitMs} ms
            </dd>
          </div>
          <div>
            <dt className="text-zinc-400">Memory Limit</dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-zinc-100">
              {problem.memoryLimitMb} MB
            </dd>
          </div>
          <div>
            <dt className="text-zinc-400">Source Limit</dt>
            <dd className="mt-1 font-mono text-sm font-semibold text-zinc-100">
              {Math.round(problem.sourceSizeLimitBytes / 1024)} KB
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-zinc-400">Output Comparison</dt>
            <dd className="mt-1 text-sm font-medium text-zinc-100">
              {formatComparisonMode(problem.comparisonMode, problem.floatTolerance)}
            </dd>
          </div>
        </dl>
      </header>

      <div className="mt-8 space-y-8">
        <section>
          <h2 className="text-lg font-semibold text-zinc-100">Problem Statement</h2>
          <div className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 text-sm leading-relaxed text-zinc-200">
            {problem.statement}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <section>
            <h2 className="text-lg font-semibold text-zinc-100">Input Format</h2>
            <div className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 text-sm leading-relaxed text-zinc-200">
              {problem.inputFormat}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-100">Output Format</h2>
            <div className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 text-sm leading-relaxed text-zinc-200">
              {problem.outputFormat}
            </div>
          </section>
        </div>

        {problem.constraints ? (
          <section>
            <h2 className="text-lg font-semibold text-zinc-100">Constraints</h2>
            <pre className="mt-2 overflow-x-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs leading-relaxed text-zinc-200">
              {problem.constraints}
            </pre>
          </section>
        ) : null}

        {problem.examples.length > 0 ? (
          <section>
            <h2 className="text-lg font-semibold text-zinc-100">Examples</h2>
            <div className="mt-3 space-y-4">
              {problem.examples.map((ex, idx) => (
                <div
                  key={`example-${idx + 1}`}
                  className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
                >
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Example {idx + 1}
                  </h3>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-zinc-400">Input</p>
                      <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
                        {ex.input}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-400">Output</p>
                      <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
                        {ex.output}
                      </pre>
                    </div>
                  </div>
                  {ex.explanation ? (
                    <p className="mt-3 text-xs text-zinc-300">
                      <strong className="text-zinc-200">Explanation:</strong> {ex.explanation}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {problem.explanation ? (
          <section>
            <h2 className="text-lg font-semibold text-zinc-100">Notes</h2>
            <div className="mt-2 whitespace-pre-wrap rounded-xl border border-zinc-800/80 bg-zinc-900/30 p-4 text-sm text-zinc-300">
              {problem.explanation}
            </div>
          </section>
        ) : null}

        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-100">
              Public Sample Test Cases ({problem.publicTestCases.length})
            </h2>
            <span className="text-xs text-zinc-400">
              Hidden judge evaluation test cases are kept strictly confidential on the server.
            </span>
          </div>

          {problem.publicTestCases.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-400">No public sample test cases available.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {problem.publicTestCases.map((tc) => (
                <div key={tc.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span className="font-semibold text-zinc-200">Sample Test #{tc.sequence}</span>
                    {tc.explanation ? <span>{tc.explanation}</span> : null}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium text-zinc-400">Standard Input</p>
                      <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
                        {tc.input}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-400">Expected Output</p>
                      <pre className="mt-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs text-zinc-100">
                        {tc.expectedOutput}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200">Supported Judge Languages</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {problem.supportedLanguages.map((lang) => (
                <span
                  key={lang.id}
                  className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1 font-mono text-xs text-zinc-200"
                >
                  {lang.name} ({lang.slug})
                </span>
              ))}
            </div>
          </div>

          <Link
            href={`/arena/${problem.slug}`}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200"
          >
            Solve in Coding Arena
          </Link>
        </section>
      </div>
    </main>
  );
}
