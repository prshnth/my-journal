import type { ReactNode } from "react";
import type { EntryRow } from "@/lib/stats";

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-zinc-400">{label}</div>
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      {title && <div className="mb-2 text-sm font-medium text-zinc-300">{title}</div>}
      {children}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-12 text-center">
      <div className="text-base font-medium text-zinc-200">{title}</div>
      <p className="mx-auto mt-1 max-w-md text-sm text-zinc-400">{body}</p>
    </div>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">
      {children}
    </span>
  );
}

export function moodLabel(m: number): string {
  if (m <= -1) return "low";
  if (m >= 1) return "good";
  return "ok";
}

export function EntryItem({ entry, timezone }: { entry: EntryRow; timezone: string }) {
  const when = new Date(entry.receivedAt).toLocaleString("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
      <div className="text-sm whitespace-pre-wrap text-zinc-100">{entry.text}</div>
    </li>
  );
}
