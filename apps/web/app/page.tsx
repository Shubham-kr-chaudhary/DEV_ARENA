export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">DevArena</p>
      <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">
        Competitive programming, built around a real judge.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
        Practice algorithmic problems, test solutions in an isolated execution environment, and
        track your competitive rating.
      </p>
      <div className="mt-10 flex flex-wrap gap-4">
        <a
          className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 transition hover:bg-zinc-200"
          href="/problems"
        >
          Browse problems
        </a>
        <a
          className="rounded-lg border border-zinc-700 px-5 py-3 font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900"
          href="/login"
        >
          Sign in
        </a>
        <a
          className="rounded-lg border border-zinc-700 px-5 py-3 font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900"
          href="/register"
        >
          Create account
        </a>
      </div>
    </main>
  );
}
