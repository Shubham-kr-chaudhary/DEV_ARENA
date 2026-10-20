'use client';

import { useState, type FormEvent } from 'react';
import { ApiClientError, apiClient } from '../../lib/api-client';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setSubmitting(true);

    try {
      await apiClient.register({
        email,
        username,
        password,
        ...(displayName.trim().length > 0 ? { displayName: displayName.trim() } : {}),
      });
      window.location.assign('/problems');
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Unable to register account. Please check your details and try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Create your DevArena account</h1>
      <p className="mt-2 text-sm text-zinc-400">
        Register to solve competitive programming problems and track your progress.
      </p>

      <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {errorMessage ? (
          <div
            role="alert"
            className="rounded-lg border border-red-800 bg-red-950/60 px-4 py-3 text-sm text-red-200"
          >
            {errorMessage}
          </div>
        ) : null}

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-zinc-100 focus:border-zinc-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Username</span>
          <input
            type="text"
            name="username"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-zinc-100 focus:border-zinc-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Display name (optional)</span>
          <input
            type="text"
            name="displayName"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-zinc-100 focus:border-zinc-500 focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Password (min 8 characters)</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 py-2.5 text-zinc-100 focus:border-zinc-500 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 rounded-lg bg-white px-5 py-2.5 font-medium text-zinc-950 transition hover:bg-zinc-200 disabled:opacity-60"
        >
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </main>
  );
}
