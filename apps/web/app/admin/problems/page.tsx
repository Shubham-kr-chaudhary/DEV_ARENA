'use client';

import type {
  AdminProblemDetailDto,
  AdminProblemSummaryDto,
  AdminTestCaseInput,
  AuthenticatedUserDto,
  ComparisonModeDto,
  ProblemDifficultyDto,
  ProblemStatusDto,
  ProblemTagDto,
} from '@devarena/api-contracts';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { ApiClientError, apiClient } from '../../../lib/api-client';

export default function AdminProblemsPage() {
  const [currentUser, setCurrentUser] = useState<AuthenticatedUserDto | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [problems, setProblems] = useState<readonly AdminProblemSummaryDto[]>([]);
  const [availableTags, setAvailableTags] = useState<readonly ProblemTagDto[]>([]);
  const [statusFilter, setStatusFilter] = useState<ProblemStatusDto | ''>('');
  const [difficultyFilter, setDifficultyFilter] = useState<ProblemDifficultyDto | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedProblem, setSelectedProblem] = useState<AdminProblemDetailDto | null>(null);
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [difficulty, setDifficulty] = useState<ProblemDifficultyDto>('EASY');
  const [statement, setStatement] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [constraints, setConstraints] = useState('');
  const [explanation, setExplanation] = useState('');
  const [editorial, setEditorial] = useState('');
  const [timeLimitMs, setTimeLimitMs] = useState(2000);
  const [memoryLimitMb, setMemoryLimitMb] = useState(256);
  const [comparisonMode, setComparisonMode] = useState<ComparisonModeDto>('TRIM_WHITESPACE');
  const [tagSlugsInput, setTagSlugsInput] = useState('arrays');

  const [testCasesDraft, setTestCasesDraft] = useState<AdminTestCaseInput[]>([
    {
      sequence: 1,
      input: '4 9\n2 7 11 15\n',
      expectedOutput: '1 2\n',
      explanation: 'Sample test case',
      isPublic: true,
      weight: 1,
      group: 'sample',
    },
    {
      sequence: 2,
      input: '3 6\n3 2 4\n',
      expectedOutput: '2 3\n',
      explanation: null,
      isPublic: false,
      weight: 1,
      group: 'hidden',
    },
  ]);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
          setAuthChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(null);
          setAuthChecked(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (currentUser?.role !== 'ADMIN') {
      return;
    }

    let cancelled = false;

    apiClient
      .listAdminProblems({
        page: 1,
        pageSize: 50,
        ...(statusFilter !== '' ? { status: statusFilter } : {}),
        ...(difficultyFilter !== '' ? { difficulty: difficultyFilter } : {}),
        ...(searchQuery.trim().length > 0 ? { search: searchQuery.trim() } : {}),
      })
      .then((response) => {
        if (cancelled) {
          return;
        }
        setProblems(response.items);
        setAvailableTags(response.availableTags);
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
          setErrorMessage('Failed to load administrative problem list.');
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser, statusFilter, difficultyFilter, searchQuery, reloadVersion]);

  function triggerAdminListReload() {
    setLoading(true);
    setReloadVersion((prev) => prev + 1);
  }

  function populateEditorFromDetail(detail: AdminProblemDetailDto) {
    setSelectedProblem(detail);
    setSlug(detail.slug);
    setTitle(detail.title);
    setDifficulty(detail.difficulty);
    setStatement(detail.statement);
    setInputFormat(detail.inputFormat);
    setOutputFormat(detail.outputFormat);
    setConstraints(detail.constraints ?? '');
    setExplanation(detail.explanation ?? '');
    setEditorial(detail.editorial ?? '');
    setTimeLimitMs(detail.timeLimitMs);
    setMemoryLimitMb(detail.memoryLimitMb);
    setComparisonMode(detail.comparisonMode);
    setTagSlugsInput(detail.tags.map((t) => t.slug).join(', '));
    if (detail.testCases.length > 0) {
      setTestCasesDraft(
        detail.testCases.map((tc) => ({
          sequence: tc.sequence,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          explanation: tc.explanation,
          isPublic: tc.isPublic,
          weight: tc.weight,
          group: tc.group,
        })),
      );
    }
  }

  function resetEditorToNewDraft() {
    setSelectedProblem(null);
    setSlug('');
    setTitle('');
    setDifficulty('EASY');
    setStatement('');
    setInputFormat('');
    setOutputFormat('');
    setConstraints('');
    setExplanation('');
    setEditorial('');
    setTimeLimitMs(2000);
    setMemoryLimitMb(256);
    setComparisonMode('TRIM_WHITESPACE');
    setTagSlugsInput('arrays');
  }

  async function handleSelectProblem(problemId: string) {
    setErrorMessage(null);
    setFeedbackMessage(null);
    try {
      const detail = await apiClient.getAdminProblemById(problemId);
      populateEditorFromDetail(detail);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to load problem details.');
      }
    }
  }

  async function handleSaveProblem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);

    const parsedTagSlugs = tagSlugsInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);

    try {
      if (selectedProblem) {
        const updated = await apiClient.updateAdminProblem(selectedProblem.id, {
          slug,
          title,
          difficulty,
          statement,
          inputFormat,
          outputFormat,
          constraints: constraints.trim().length > 0 ? constraints.trim() : null,
          explanation: explanation.trim().length > 0 ? explanation.trim() : null,
          editorial: editorial.trim().length > 0 ? editorial.trim() : null,
          timeLimitMs,
          memoryLimitMb,
          comparisonMode,
          tagSlugs: parsedTagSlugs,
        });
        populateEditorFromDetail(updated);
        setFeedbackMessage(`Updated problem '${updated.slug}'.`);
      } else {
        const created = await apiClient.createAdminProblem({
          slug,
          title,
          difficulty,
          statement,
          inputFormat,
          outputFormat,
          constraints: constraints.trim().length > 0 ? constraints.trim() : null,
          examples: [],
          explanation: explanation.trim().length > 0 ? explanation.trim() : null,
          editorial: editorial.trim().length > 0 ? editorial.trim() : null,
          timeLimitMs,
          memoryLimitMb,
          outputLimitBytes: 1048576,
          sourceSizeLimitBytes: 65536,
          comparisonMode,
          tagSlugs: parsedTagSlugs,
        });
        populateEditorFromDetail(created);
        setFeedbackMessage(`Created draft problem '${created.slug}'.`);
      }
      triggerAdminListReload();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to save problem.');
      }
    }
  }

  async function handleSaveTestCases() {
    if (!selectedProblem) {
      return;
    }
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      const result = await apiClient.replaceAdminProblemTestCases(selectedProblem.id, {
        testCases: testCasesDraft,
      });
      const totalCount = result.totalTestCases;
      const pubCount = result.publicTestCaseCount;
      const hidCount = result.hiddenTestCaseCount;
      setFeedbackMessage(
        `Saved ${totalCount} test cases (${pubCount} public, ${hidCount} hidden).`,
      );
      await handleSelectProblem(selectedProblem.id);
      triggerAdminListReload();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Failed to update test cases.');
      }
    }
  }

  async function handleLifecycleAction(
    problemId: string,
    action: 'publish' | 'unpublish' | 'archive',
  ) {
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      let updated: Awaited<ReturnType<typeof apiClient.publishAdminProblem>>;
      if (action === 'publish') {
        updated = await apiClient.publishAdminProblem(problemId);
      } else if (action === 'unpublish') {
        updated = await apiClient.unpublishAdminProblem(problemId);
      } else {
        updated = await apiClient.archiveAdminProblem(problemId);
      }

      setFeedbackMessage(`Problem '${updated.slug}' transitioned to ${updated.status}.`);
      if (selectedProblem?.id === problemId) {
        await handleSelectProblem(problemId);
      }
      triggerAdminListReload();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(`Failed to ${action} problem.`);
      }
    }
  }

  if (!authChecked) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
        <p className="text-sm text-zinc-400">Verifying administrator session...</p>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">Authentication Required</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Please sign in with an administrator account to manage DevArena problems.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-zinc-950"
          >
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  if (currentUser.role !== 'ADMIN') {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-red-300">Access Denied (403 Forbidden)</h1>
        <p className="mt-2 text-sm text-zinc-400">
          Administrator privileges are required to create, modify, or publish problems.
        </p>
        <div className="mt-6">
          <Link
            href="/problems"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200"
          >
            Return to Problem Catalogue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-400">
            DevArena Administration
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Problem Management</h1>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={resetEditorToNewDraft}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            + New Draft Problem
          </button>
          <Link
            href="/problems"
            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
          >
            Public Catalogue
          </Link>
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-200"
        >
          {errorMessage}
        </div>
      ) : null}

      {feedbackMessage ? (
        <div className="mt-6 rounded-xl border border-emerald-800 bg-emerald-950/60 px-4 py-3 text-sm text-emerald-200">
          {feedbackMessage}
        </div>
      ) : null}

      <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              setLoading(true);
              setSearchQuery(e.target.value);
            }}
            placeholder="Filter by title or slug..."
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setLoading(true);
              setStatusFilter(e.target.value as ProblemStatusDto | '');
            }}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">All statuses</option>
            <option value="DRAFT">DRAFT</option>
            <option value="REVIEW">REVIEW</option>
            <option value="PUBLISHED">PUBLISHED</option>
            <option value="ARCHIVED">ARCHIVED</option>
          </select>
          <select
            value={difficultyFilter}
            onChange={(e) => {
              setLoading(true);
              setDifficultyFilter(e.target.value as ProblemDifficultyDto | '');
            }}
            className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">All difficulties</option>
            <option value="EASY">EASY</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HARD">HARD</option>
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-zinc-800 text-xs uppercase text-zinc-400">
              <tr>
                <th className="px-3 py-2.5">Problem</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Difficulty</th>
                <th className="px-3 py-2.5">Test Cases (Public / Hidden)</th>
                <th className="px-3 py-2.5 text-right">Lifecycle &amp; Edit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/70">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                    Loading problems...
                  </td>
                </tr>
              ) : problems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-zinc-400">
                    No problems found.
                  </td>
                </tr>
              ) : (
                problems.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-900/50">
                    <td className="px-3 py-3">
                      <p className="font-semibold text-zinc-100">{p.title}</p>
                      <p className="font-mono text-xs text-zinc-400">{p.slug}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{p.status}</td>
                    <td className="px-3 py-3 text-xs">{p.difficulty}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className="text-emerald-300">{p.publicTestCaseCount} public</span>
                      {' / '}
                      <span className="text-amber-300">{p.hiddenTestCaseCount} hidden</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSelectProblem(p.id)}
                          className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
                        >
                          Edit
                        </button>
                        {p.status !== 'PUBLISHED' ? (
                          <button
                            type="button"
                            onClick={() => void handleLifecycleAction(p.id, 'publish')}
                            className="rounded border border-emerald-700 bg-emerald-950/50 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-900/50"
                          >
                            Publish
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleLifecycleAction(p.id, 'unpublish')}
                            className="rounded border border-amber-700 bg-amber-950/50 px-2.5 py-1 text-xs text-amber-200 hover:bg-amber-900/50"
                          >
                            Unpublish
                          </button>
                        )}
                        {p.status !== 'ARCHIVED' ? (
                          <button
                            type="button"
                            onClick={() => void handleLifecycleAction(p.id, 'archive')}
                            className="rounded border border-rose-800 bg-rose-950/40 px-2.5 py-1 text-xs text-rose-200 hover:bg-rose-900/40"
                          >
                            Archive
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <form
          onSubmit={handleSaveProblem}
          className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6"
        >
          <h2 className="text-lg font-semibold">
            {selectedProblem ? `Edit Problem: ${selectedProblem.slug}` : 'Create Draft Problem'}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-300">
              <span>Canonical Slug (kebab-case)</span>
              <input
                type="text"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="two-sum-indices"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-300">
              <span>Title</span>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Two Sum Indices"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <label className="block text-xs font-medium text-zinc-300">
              <span>Difficulty</span>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as ProblemDifficultyDto)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="EASY">EASY</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HARD">HARD</option>
              </select>
            </label>

            <label className="block text-xs font-medium text-zinc-300">
              <span>Time Limit (ms)</span>
              <input
                type="number"
                min={100}
                max={15000}
                value={timeLimitMs}
                onChange={(e) => setTimeLimitMs(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-300">
              <span>Memory Limit (MB)</span>
              <input
                type="number"
                min={16}
                max={1024}
                value={memoryLimitMb}
                onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-300">
              <span>Comparison Mode</span>
              <select
                value={comparisonMode}
                onChange={(e) => setComparisonMode(e.target.value as ComparisonModeDto)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="TRIM_WHITESPACE">TRIM_WHITESPACE</option>
                <option value="EXACT">EXACT</option>
                <option value="TOKEN_WHITESPACE">TOKEN_WHITESPACE</option>
                <option value="FLOAT_TOLERANCE">FLOAT_TOLERANCE</option>
              </select>
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-300">
            <span>
              Tag Slugs (comma-separated; available: {availableTags.map((t) => t.slug).join(', ')})
            </span>
            <input
              type="text"
              value={tagSlugsInput}
              onChange={(e) => setTagSlugsInput(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <label className="block text-xs font-medium text-zinc-300">
            <span>Statement</span>
            <textarea
              required
              rows={4}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block text-xs font-medium text-zinc-300">
              <span>Input Format</span>
              <textarea
                required
                rows={2}
                value={inputFormat}
                onChange={(e) => setInputFormat(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>

            <label className="block text-xs font-medium text-zinc-300">
              <span>Output Format</span>
              <textarea
                required
                rows={2}
                value={outputFormat}
                onChange={(e) => setOutputFormat(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
          </div>

          <label className="block text-xs font-medium text-zinc-300">
            <span>Constraints (optional)</span>
            <textarea
              rows={2}
              value={constraints}
              onChange={(e) => setConstraints(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-100"
            />
          </label>

          <label className="block text-xs font-medium text-zinc-300">
            <span>Explanation / Notes (optional)</span>
            <textarea
              rows={2}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <label className="block text-xs font-medium text-zinc-300">
            <span>Admin / Solution Editorial (kept private from public endpoint)</span>
            <textarea
              rows={2}
              value={editorial}
              onChange={(e) => setEditorial(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <button
            type="submit"
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
          >
            {selectedProblem ? 'Save Problem Changes' : 'Create Draft Problem'}
          </button>
        </form>

        <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              Test Cases {selectedProblem ? `for ${selectedProblem.slug}` : '(Select a problem)'}
            </h2>
            {selectedProblem ? (
              <button
                type="button"
                onClick={() =>
                  setTestCasesDraft((prev) => [
                    ...prev,
                    {
                      sequence: prev.length + 1,
                      input: '',
                      expectedOutput: '',
                      explanation: null,
                      isPublic: false,
                      weight: 1,
                      group: 'hidden',
                    },
                  ])
                }
                className="rounded border border-zinc-700 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                + Add Test Case
              </button>
            ) : null}
          </div>

          <p className="text-xs text-zinc-400">
            Publishing requires at least 1 public sample test case and 1 hidden evaluation test
            case.
          </p>

          {!selectedProblem ? (
            <p className="text-sm text-zinc-500">
              Select an existing problem from the table above or create a draft problem first to
              manage its public and hidden test cases.
            </p>
          ) : (
            <div className="space-y-4">
              {testCasesDraft.map((tc, idx) => (
                <div
                  key={`tc-draft-${tc.sequence}-${idx}`}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Sequence #{tc.sequence}</span>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tc.isPublic}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setTestCasesDraft((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, isPublic: checked } : item,
                            ),
                          );
                        }}
                      />
                      <span>{tc.isPublic ? 'Public Sample' : 'Hidden Evaluation'}</span>
                    </label>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <textarea
                      rows={2}
                      placeholder="Input"
                      value={tc.input}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTestCasesDraft((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, input: val } : item)),
                        );
                      }}
                      className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-100"
                    />
                    <textarea
                      rows={2}
                      placeholder="Expected Output"
                      value={tc.expectedOutput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTestCasesDraft((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, expectedOutput: val } : item,
                          ),
                        );
                      }}
                      className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-100"
                    />
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => void handleSaveTestCases()}
                className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-zinc-200"
              >
                Replace Problem Test Cases
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
