import Link from "next/link";
import { getJournalEntries, type JournalFilter } from "@/lib/stats";
import { EmptyState, EntryItem } from "@/components/ui";

export const dynamic = "force-dynamic";

const FILTERS: { key: JournalFilter; label: string }[] = [
  { key: "all", label: "all" },
  { key: "ran", label: "ran" },
  { key: "good", label: "good mood" },
  { key: "low", label: "low mood" },
  { key: "sleep", label: "slept" },
];

function hrefFor(params: { q?: string; filter?: JournalFilter; limit?: number }): string {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.filter && params.filter !== "all") p.set("filter", params.filter);
  if (params.limit && params.limit !== 50) p.set("limit", String(params.limit));
  const s = p.toString();
  return s ? `/journal?${s}` : "/journal";
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; limit?: string }>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const filter = (FILTERS.find((f) => f.key === sp.filter)?.key ?? "all") as JournalFilter;
  const limit = Math.min(Math.max(parseInt(sp.limit ?? "50", 10) || 50, 50), 1000);

  const data = await getJournalEntries({ search: q, filter, limit });

  if (!data.hasOwner) {
    return (
      <EmptyState
        title="no journal yet"
        body="open Telegram, find your bot, and send /start — then reply to its check-ins and they show up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <form method="GET" action="/journal" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="search your entries…"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none transition focus:border-zinc-600"
        />
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <button
          type="submit"
          className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-sm transition hover:bg-zinc-700"
        >
          search
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Link
              key={f.key}
              href={hrefFor({ q, filter: f.key })}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                active
                  ? "border-zinc-600 bg-zinc-700 text-zinc-100"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <div className="text-xs text-zinc-500">
        {data.total} {data.total === 1 ? "entry" : "entries"}
        {q || filter !== "all" ? " matching" : ""}
      </div>

      {data.entries.length === 0 ? (
        <EmptyState title="nothing here" body="no entries match — try a different search or filter." />
      ) : (
        <ul className="space-y-2">
          {data.entries.map((e) => (
            <EntryItem key={e.id} entry={e} timezone={data.timezone} />
          ))}
        </ul>
      )}

      {data.hasMore && (
        <div className="pt-1 text-center">
          <Link
            href={hrefFor({ q, filter, limit: limit + 50 })}
            className="inline-block rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-800"
          >
            show more
          </Link>
        </div>
      )}
    </div>
  );
}
