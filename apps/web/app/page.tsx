export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">DevArena</p>
      <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl">
        Competitive programming, built around a real judge.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
        Phase 1 establishes the production-oriented application foundation. The deterministic
        asynchronous judge will be introduced in later phases.
      </p>
      <div className="mt-10 flex gap-4">
        <a
          className="rounded-lg bg-white px-5 py-3 font-medium text-zinc-950 transition hover:bg-zinc-200"
          href="/problems"
        >
          Browse problems
        </a>
      </div>
    </main>
  );
}
