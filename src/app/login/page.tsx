export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const hasError = sp?.error === "1";
  const next = typeof sp?.next === "string" ? sp.next : "/journal";

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-zinc-100">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight">my journal</h1>
        <p className="mt-1 text-center text-sm text-zinc-400">a gentle nudge to check in</p>

        <form method="POST" action="/api/login" className="mt-8 space-y-3">
          <input type="hidden" name="next" value={next} />
          <input
            type="password"
            name="password"
            autoFocus
            required
            placeholder="password"
            aria-label="password"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm outline-none transition focus:border-zinc-600"
          />
          {hasError && <p className="px-1 text-sm text-red-400">incorrect password</p>}
          <button
            type="submit"
            className="w-full rounded-xl bg-zinc-100 px-4 py-3 text-sm font-medium text-zinc-900 transition hover:bg-white"
          >
            sign in
          </button>
        </form>
      </div>
    </main>
  );
}
