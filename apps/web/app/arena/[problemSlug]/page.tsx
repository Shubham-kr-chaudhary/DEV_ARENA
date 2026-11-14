'use client';

import type { AuthenticatedUserDto, PublicProblemDetailContractDto } from '@devarena/api-contracts';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CodingArenaWorkspace } from '../../../components/arena/CodingArenaWorkspace';
import { ApiClientError, apiClient } from '../../../lib/api-client';

export default function ArenaProblemPage() {
  const params = useParams<{ problemSlug: string }>();
  const problemSlug = typeof params?.problemSlug === 'string' ? params.problemSlug.trim() : '';

  const [problem, setProblem] = useState<PublicProblemDetailContractDto | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthenticatedUserDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [notFound, setNotFound] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState<number>(0);

  useEffect(() => {
    if (!problemSlug) {
      return;
    }

    let cancelled = false;

    Promise.all([
      apiClient.getProblemBySlug(problemSlug),
      apiClient.getCurrentUser().catch(() => null),
    ])
      .then(([loadedProblem, loadedUser]) => {
        if (cancelled) {
          return;
        }
        setProblem(loadedProblem);
        setCurrentUser(loadedUser);
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
          setErrorMessage(
            'Failed to load problem workspace. Please check your connection and retry.',
          );
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [problemSlug, reloadVersion]);

  function handleRetryLoad() {
    setLoading(true);
    setNotFound(false);
    setErrorMessage(null);
    setReloadVersion((prev) => prev + 1);
  }

  if (!problemSlug || notFound) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-16 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">404 Not Found</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-100">
          Problem Unavailable in Arena
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          The problem <code className="font-mono text-zinc-200">{problemSlug || '(empty)'}</code>{' '}
          does not exist or has not been published yet. Only published problems can be opened in the
          Coding Arena.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/problems"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
          >
            Browse Published Problems
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main aria-busy="true" className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="h-5 w-48 animate-pulse rounded bg-zinc-900" />
          <div className="flex gap-2">
            <div className="h-7 w-28 animate-pulse rounded bg-zinc-900" />
            <div className="h-7 w-28 animate-pulse rounded bg-zinc-900" />
          </div>
        </div>
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-2">
          <div className="space-y-4 border-b border-zinc-800 p-6 lg:border-b-0 lg:border-r">
            <div className="h-7 w-64 animate-pulse rounded bg-zinc-900" />
            <div className="h-24 w-full animate-pulse rounded bg-zinc-900/60" />
            <div className="h-32 w-full animate-pulse rounded bg-zinc-900/60" />
          </div>
          <div className="p-6">
            <p className="font-mono text-xs text-zinc-400">
              Loading Coding Arena for {problemSlug}...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (errorMessage || !problem) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
        <div
          role="alert"
          className="rounded-xl border border-red-800 bg-red-950/50 p-5 text-sm text-red-200"
        >
          <h1 className="text-base font-semibold text-red-100">Unable to Load Coding Arena</h1>
          <p className="mt-1.5 leading-relaxed">
            {errorMessage ?? 'An unexpected error occurred while loading the problem.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleRetryLoad}
              className="rounded-lg border border-red-700 bg-red-900/40 px-3.5 py-1.5 text-xs font-medium text-red-100 hover:bg-red-900/70"
            >
              Retry Loading
            </button>
            <Link
              href="/problems"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
            >
              Return to Problem Catalogue
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return <CodingArenaWorkspace key={problem.slug} problem={problem} currentUser={currentUser} />;
}
