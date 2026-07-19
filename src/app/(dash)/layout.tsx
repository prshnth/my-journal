import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";

export default function DashLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-900 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 sm:px-5">
          <div className="flex items-center justify-between gap-3 py-3">
            <span className="text-sm font-semibold tracking-tight">my journal</span>
            <form method="POST" action="/api/logout">
              <button type="submit" className="text-xs text-zinc-500 transition hover:text-zinc-300">
                log out
              </button>
            </form>
          </div>
          <div className="pb-2">
            <Nav />
          </div>
        </div>
      </header>
      <main className="mx-auto min-w-0 max-w-5xl px-4 py-6 sm:px-5 sm:py-8">{children}</main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-zinc-600 sm:px-5">
        export your data:{" "}
        <a href="/api/export?format=json" className="underline transition hover:text-zinc-400">
          JSON
        </a>{" "}
        ·{" "}
        <a href="/api/export?format=md" className="underline transition hover:text-zinc-400">
          Markdown
        </a>
      </footer>
    </div>
  );
}
