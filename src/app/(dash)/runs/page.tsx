import { Heatmap } from "@/components/Heatmap";
import { Card, EmptyState, Stat } from "@/components/ui";
import { getRunsData, type RunWeek } from "@/lib/stats";
import { isRunningSession } from "@/lib/training/plan";

export const dynamic = "force-dynamic";

function displayDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function WeeklyBars({ weeks }: { weeks: RunWeek[] }) {
  const maxRuns = Math.max(1, ...weeks.map((week) => week.runs));
  return (
    <div
      className="grid h-40 grid-cols-12 items-end gap-1 sm:gap-2"
      aria-label="Runs per week for the last 12 weeks"
    >
      {weeks.map((week, index) => {
          const height = week.runs ? Math.max(12, (week.runs / maxRuns) * 112) : 4;
          const showLabel = index % 3 === 0 || index === weeks.length - 1;
          return (
            <div key={week.startDate} className="flex min-w-0 flex-col items-center justify-end gap-2">
              <div className="text-[10px] tabular-nums text-zinc-500">{week.runs || ""}</div>
              <div
                title={`${week.label}: ${week.runs} runs${week.minutes ? ` · ${week.minutes} min` : ""}`}
                className={`w-full max-w-6 rounded-t-md sm:max-w-8 ${week.runs ? "bg-amber-500" : "bg-zinc-800"}`}
                style={{ height }}
              />
              <div className="h-3 whitespace-nowrap text-[9px] text-zinc-600 sm:text-[10px]">
                {showLabel ? week.label : ""}
              </div>
            </div>
          );
        })}
    </div>
  );
}

export default async function RunsPage() {
  const data = await getRunsData();

  if (!data.hasOwner) {
    return (
      <EmptyState
        title="no training log yet"
        body="send your Telegram bot /start, then reply to a running nudge to begin tracking runs here."
      />
    );
  }

  const runningToday = data.today ? isRunningSession(data.today.sessionType) : false;

  return (
    <div className="min-w-0 space-y-5 sm:space-y-6">
      <section>
        <div className="text-xs font-medium uppercase tracking-[0.18em] text-amber-500">training log</div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-50">Runs</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Your completed runs, pulled from Telegram replies and kept beside the original note.
        </p>
      </section>

      {data.today && (
        <section
          className={`overflow-hidden rounded-2xl border p-4 sm:p-5 ${
            runningToday
              ? "border-amber-900/70 bg-gradient-to-br from-amber-950/70 to-zinc-900/60"
              : "border-sky-950 bg-gradient-to-br from-sky-950/50 to-zinc-900/60"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className={`text-xs font-medium uppercase tracking-wide ${runningToday ? "text-amber-400" : "text-sky-400"}`}>
                today · week {data.today.week}
              </div>
              <h2 className="mt-1 text-lg font-semibold text-zinc-50">{data.today.sessionType}</h2>
            </div>
            <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-zinc-300">
              ~{data.today.minutes} min · RPE {data.today.rpe}
            </div>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-200">{data.today.main}</p>
          <p className="mt-3 text-xs text-zinc-400">
            Minimum option: <span className="text-zinc-300">{data.today.minimum}</span>
          </p>
        </section>
      )}

      <section className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        <Stat label="tracked runs" value={String(data.totals.runs)} />
        <Stat label="last 7 days" value={String(data.totals.runs7)} />
        <Stat label="recorded minutes" value={data.totals.minutes.toLocaleString("en-US")} />
        <Stat label="weekly streak" value={`${data.totals.weekStreak} wk`} />
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card title="run consistency · last 18 weeks">
          <div className="mb-3 flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>{data.totals.runs} total</span>
            {data.totals.avgEnergy !== null && <span>avg energy {data.totals.avgEnergy}/5</span>}
          </div>
          <Heatmap days={data.calendar} tone="amber" noun="run" />
        </Card>
        <Card title="weekly volume · last 12 weeks">
          <WeeklyBars weeks={data.weeks} />
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
          <h2 className="text-sm font-medium text-zinc-300">recent runs</h2>
          <span className="text-xs text-zinc-600">reply to the exact training message for the best match</span>
        </div>

        {data.recent.length === 0 ? (
          <EmptyState
            title="your first run will land here"
            body="After a run, reply to the training message with something like “done, 25 min, energy 4/5, pain 0/10.”"
          />
        ) : (
          <ul className="space-y-2">
            {data.recent.map((run) => (
              <li key={run.id} className="min-w-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 sm:p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-zinc-300">{displayDate(run.date)}</span>
                    {run.sessionType && (
                      <span className="rounded-full bg-amber-950 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        {run.sessionType}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] tabular-nums text-zinc-400">
                    {run.minutes !== null && <span className="rounded-md bg-zinc-800 px-2 py-1">{run.minutes} min</span>}
                    {run.energy !== null && <span className="rounded-md bg-zinc-800 px-2 py-1">energy {run.energy}/5</span>}
                    {run.pain !== null && <span className="rounded-md bg-zinc-800 px-2 py-1">pain {run.pain}/10</span>}
                  </div>
                </div>
                <p className="mt-2 break-words whitespace-pre-wrap text-sm leading-6 text-zinc-100">{run.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
