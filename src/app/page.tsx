import type { ReactNode } from "react";
import { getDashboardData, type EntryRow } from "@/lib/stats";
import { MoodTrend, RunsBar, SleepTrend } from "@/components/Charts";

export const dynamic = "force-dynamic"; // always read fresh from the DB

export default async function Home() {
  const data = await getDashboardData();

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: data.timezone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">my journal</h1>
          <p className="text-sm text-zinc-400">a gentle nudge to check in · {data.timezone}</p>
        </header>

        {!data.hasOwner ? (
          <EmptyState
            title="no journal yet"
            body="open Telegram, find your bot, and send /start. then just reply to its check-ins — everything shows up here."
          />
        ) : (
          <>
            <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="entries" value={String(data.totals.entries)} />
              <Stat label="day streak" value={String(data.totals.streak)} />
              <Stat label="runs · 7d" value={String(data.totals.runs7)} />
              <Stat
                label="avg mood · 7d"
                value={data.totals.avgMood7 === null ? "—" : data.totals.avgMood7.toFixed(1)}
              />
            </section>

            <section className="mb-8 grid gap-4 lg:grid-cols-3">
              <Card title="mood">
                <MoodTrend data={data.daily} />
              </Card>
              <Card title="sleep">
                <SleepTrend data={data.daily} />
              </Card>
              <Card title="runs">
                <RunsBar data={data.daily} />
              </Card>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-400">recent</h2>
              {data.recent.length === 0 ? (
                <EmptyState
                  title="no entries yet"
                  body="reply to your bot's next check-in and it'll appear here."
                />
              ) : (
                <ul className="space-y-2">
                  {data.recent.map((e) => (
                    <EntryItem key={e.id} entry={e} when={fmt(e.receivedAt)} />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="mb-2 text-sm font-medium text-zinc-300">{title}</div>
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
      <div className="text-base font-medium text-zinc-200">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">{body}</p>
    </div>
  );
}

function EntryItem({ entry, when }: { entry: EntryRow; when: string }) {
  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-500">{when}</span>
        <div className="flex flex-wrap gap-1.5">
          {entry.didRun === true && <Chip>ran</Chip>}
          {typeof entry.sleepQuality === "number" && <Chip>sleep {entry.sleepQuality}/5</Chip>}
          {typeof entry.mood === "number" && <Chip>{moodLabel(entry.mood)}</Chip>}
        </div>
      </div>
      {entry.promptText && <div className="text-xs text-zinc-500">{entry.promptText}</div>}
      <div className="text-sm text-zinc-100">{entry.text}</div>
    </li>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

function moodLabel(m: number): string {
  if (m <= -1) return "low";
  if (m >= 1) return "good";
  return "ok";
}
