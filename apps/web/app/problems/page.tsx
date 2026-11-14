'use client';

import type {
  AuthenticatedUserDto,
  ProblemCatalogueItemContractDto,
  ProblemDifficultyDto,
  ProblemSortFieldDto,
  ProblemTagDto,
  SortOrderDto,
  UserSolveProgressStatusDto,
} from '@devarena/api-contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiClient } from '../../lib/api-client';

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

function formatProgressLabel(status: UserSolveProgressStatusDto): string {
  switch (status) {
    case 'SOLVED':
      return 'Solved';
    case 'ATTEMPTED':
      return 'Attempted';
    case 'UNSOLVED':
      return 'Unsolved';
  }
}

function getProgressBadgeClass(status: UserSolveProgressStatusDto): string {
  switch (status) {
    case 'SOLVED':
      return 'border-emerald-700/80 bg-emerald-950/40 text-emerald-200';
    case 'ATTEMPTED':
      return 'border-sky-800/80 bg-sky-950/40 text-sky-200';
    case 'UNSOLVED':
      return 'border-zinc-800 bg-zinc-900 text-zinc-400';
  }
}

export default function ProblemsPage() {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUserDto | null>(null);
  const [items, setItems] = useState<readonly ProblemCatalogueItemContractDto[]>([]);
  const [availableTags, setAvailableTags] = useState<readonly ProblemTagDto[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [difficulty, setDifficulty] = useState<ProblemDifficultyDto | ''>('');
  const [tag, setTag] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserSolveProgressStatusDto | ''>('');
  const [sortBy, setSortBy] = useState<ProblemSortFieldDto>('newest');
  const [sortOrder, setSortOrder] = useState<SortOrderDto>('desc');
  const [reloadVersion, setReloadVersion] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .listProblems({
        page,
        pageSize,
        ...(appliedSearch.length > 0 ? { search: appliedSearch } : {}),
        ...(difficulty !== '' ? { difficulty } : {}),
        ...(tag.length > 0 ? { tag } : {}),
        ...(statusFilter !== '' ? { status: statusFilter } : {}),
        sortBy,
        sortOrder,
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setItems(response.items);
        setAvailableTags(response.availableTags);
        setTotalItems(response.meta.totalItems);
        setTotalPages(response.meta.totalPages);
        setErrorMessage(null);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiClientError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage('Failed to load problem catalogue. Please try again.');
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    page,
    pageSize,
    appliedSearch,
    difficulty,
    tag,
    statusFilter,
    sortBy,
    sortOrder,
    reloadVersion,
  ]);

  function beginNewQuery() {
    setLoading(true);
    setErrorMessage(null);
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    beginNewQuery();
    setPage(1);
    setAppliedSearch(searchInput.trim());
  }

  function handleResetFilters() {
    beginNewQuery();
    setSearchInput('');
    setAppliedSearch('');
    setDifficulty('');
    setTag('');
    setStatusFilter('');
    setSortBy('newest');
    setSortOrder('desc');
    setPage(1);
  }

  function handleRetryCatalogue() {
    beginNewQuery();
    setReloadVersion((prev) => prev + 1);
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
            DevArena Practice
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Problem Catalogue</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Browse verified algorithmic problems, filter by topic or difficulty, and open any
            problem directly in the Coding Arena.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {currentUser?.role === 'ADMIN' ? (
            <Link
              href="/admin/problems"
              className="rounded-lg border border-amber-700 bg-amber-950/50 px-4 py-2 text-sm font-medium text-amber-200 transition hover:bg-amber-900/50"
            >
              Manage Problems (Admin)
            </Link>
          ) : null}

          {currentUser ? (
            <span className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2 text-sm text-zinc-300">
              Signed in as{' '}
              <strong className="font-semibold text-white">
                {currentUser.profile?.username ?? currentUser.email}
              </strong>
            </span>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
            >
              Sign in to track progress
            </Link>
          )}
        </div>
      </div>

      <section
        aria-label="Problem filters"
        className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/60 p-4"
      >
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-zinc-400" htmlFor="problem-search">
              Search title or slug
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="problem-search"
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="e.g. two-sum-indices"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-zinc-950 transition hover:bg-zinc-200"
              >
                Search
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="filter-difficulty">
              Difficulty
            </label>
            <select
              id="filter-difficulty"
              value={difficulty}
              onChange={(e) => {
                beginNewQuery();
                setDifficulty(e.target.value as ProblemDifficultyDto | '');
                setPage(1);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            >
              <option value="">All difficulties</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="filter-tag">
              Topic tag
            </label>
            <select
              id="filter-tag"
              value={tag}
              onChange={(e) => {
                beginNewQuery();
                setTag(e.target.value);
                setPage(1);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            >
              <option value="">All tags</option>
              {availableTags.map((t) => (
                <option key={t.id} value={t.slug}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="filter-status">
              Solve status
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => {
                beginNewQuery();
                setStatusFilter(e.target.value as UserSolveProgressStatusDto | '');
                setPage(1);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
            >
              <option value="">All statuses</option>
              <option value="SOLVED">Solved</option>
              <option value="ATTEMPTED">Attempted</option>
              <option value="UNSOLVED">Unsolved</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400" htmlFor="filter-sort">
              Sort order
            </label>
            <div className="mt-1 flex gap-1.5">
              <select
                id="filter-sort"
                value={sortBy}
                onChange={(e) => {
                  beginNewQuery();
                  setSortBy(e.target.value as ProblemSortFieldDto);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title</option>
                <option value="difficulty">Difficulty</option>
              </select>
              <button
                type="button"
                onClick={() => {
                  beginNewQuery();
                  setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                  setPage(1);
                }}
                className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-600"
                title="Toggle sort direction"
              >
                {sortOrder === 'asc' ? 'ASC' : 'DESC'}
              </button>
            </div>
          </div>
        </form>

        <div className="mt-3 flex items-center justify-between text-xs text-zinc-400">
          <span>
            Showing {items.length} of {totalItems} published problem{totalItems === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-zinc-300 underline hover:text-white"
          >
            Reset filters
          </button>
        </div>
      </section>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-6 flex items-center justify-between rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-200"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={handleRetryCatalogue}
            className="rounded-lg border border-red-700 px-3 py-1 text-xs font-medium text-red-100 hover:bg-red-900/50"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-400">
          Loading published problems...
        </div>
      ) : items.length === 0 ? (
        <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center">
          <p className="text-base font-medium text-zinc-200">
            No published problems match your current filters.
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Try clearing your search query or adjusting the difficulty and topic filters.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Problem</th>
                <th className="px-4 py-3.5">Difficulty</th>
                <th className="px-4 py-3.5">Topics</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/80 bg-zinc-950">
              {items.map((problem) => {
                const progressClass = getProgressBadgeClass(problem.userProgressStatus);
                const difficultyClass = getDifficultyBadgeClass(problem.difficulty);
                return (
                  <tr key={problem.id} className="transition hover:bg-zinc-900/50">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${progressClass}`}
                      >
                        {formatProgressLabel(problem.userProgressStatus)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <Link
                        href={`/problems/${problem.slug}`}
                        className="font-semibold text-zinc-100 hover:text-white hover:underline"
                      >
                        {problem.title}
                      </Link>
                      <p className="font-mono text-xs text-zinc-500">{problem.slug}</p>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${difficultyClass}`}
                      >
                        {formatDifficultyLabel(problem.difficulty)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1.5">
                        {problem.tags.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              beginNewQuery();
                              setTag(t.slug);
                              setPage(1);
                            }}
                            className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 hover:border-zinc-600 hover:text-white"
                          >
                            {t.name}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        <Link
                          href={`/problems/${problem.slug}`}
                          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
                        >
                          Statement
                        </Link>
                        <Link
                          href={`/arena/${problem.slug}`}
                          className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-zinc-200"
                        >
                          Solve in Arena
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav
          aria-label="Catalogue pagination"
          className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-4 text-sm text-zinc-400"
        >
          <span>
            Page <strong className="text-zinc-200">{page}</strong> of{' '}
            <strong className="text-zinc-200">{totalPages}</strong>
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => {
                beginNewQuery();
                setPage((p) => Math.max(1, p - 1));
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => {
                beginNewQuery();
                setPage((p) => p + 1);
              }}
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-zinc-200 transition hover:border-zinc-600 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </main>
  );
}
