import type { CalendarDay } from "@/lib/stats";

const EMERALD = [
  "bg-zinc-800/60",
  "bg-emerald-900",
  "bg-emerald-700",
  "bg-emerald-500",
  "bg-emerald-400",
];

const AMBER = [
  "bg-zinc-800/60",
  "bg-amber-950",
  "bg-amber-800",
  "bg-amber-600",
  "bg-amber-400",
];

function level(count: number): number {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count <= 4) return 3;
  return 4;
}

/** GitHub-style consistency grid: one column per week, one cell per day. */
export function Heatmap({
  days,
  tone = "emerald",
  noun = "entry",
}: {
  days: CalendarDay[];
  tone?: "emerald" | "amber";
  noun?: string;
}) {
  if (!days.length) return null;
  const colors = tone === "amber" ? AMBER : EMERALD;

  // Pad leading cells so the first column starts on Sunday.
  const cells: (CalendarDay | null)[] = [...days];
  const firstDow = new Date(days[0].date + "T00:00:00").getDay();
  for (let i = 0; i < firstDow; i++) cells.unshift(null);

  const weeks: (CalendarDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <div className="space-y-2">
      <div className="flex gap-1 overflow-x-auto">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-1">
            {Array.from({ length: 7 }).map((_, di) => {
              const day = week[di] ?? null;
              if (!day) return <div key={di} className="h-3 w-3 rounded-sm" />;
              return (
                <div
                  key={di}
                  title={`${day.date}: ${day.count} ${day.count === 1 ? noun : noun + "s"}`}
                  className={`h-3 w-3 rounded-sm ${colors[level(day.count)]}`}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-500">
        <span>less</span>
        {colors.map((c, i) => (
          <span key={i} className={`h-3 w-3 rounded-sm ${c}`} />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}
