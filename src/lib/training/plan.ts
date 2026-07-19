// 6-month return-to-running plan (Jul 19, 2026 – Jan 18, 2027), one row per day.
// plan.json was extracted from the "DAILY PLAN" sheet of the source spreadsheet
// and shifted one day so training starts Jul 19 — swap the JSON to change plans.
import planData from "./plan.json";
import { z } from "zod";

const TrainingDaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  day: z.string().min(1),
  week: z.number().int().positive(),
  phase: z.string().min(1),
  sessionType: z.string().min(1),
  main: z.string().min(1),
  strength: z.string(),
  mobility: z.string(),
  rpe: z.string().min(1),
  minutes: z.number().int().nonnegative(),
  minimum: z.string().min(1),
});

export type TrainingDay = z.infer<typeof TrainingDaySchema>;

const PLAN = z.array(TrainingDaySchema).min(1).parse(planData);
const byDate = new Map(PLAN.map((d) => [d.date, d]));
if (byDate.size !== PLAN.length) throw new Error("training plan contains duplicate dates");

export const PLAN_START = PLAN[0]?.date ?? "";
export const PLAN_END = PLAN[PLAN.length - 1]?.date ?? "";

/** The plan row for a local date (YYYY-MM-DD), or undefined outside the plan window. */
export function trainingDayFor(localDate: string): TrainingDay | undefined {
  return byDate.get(localDate);
}

export function trainingPlan(): readonly TrainingDay[] {
  return PLAN;
}

const TYPE_EMOJI: Record<string, string> = {
  "Long Run": "🏃",
  Run: "🏃",
  "Run / Quality": "⚡",
  "Recovery Run": "🐢",
  Strength: "💪",
  "Recovery + Mobility": "🧘",
  Rest: "😴",
};

function titleCasePhase(phase: string): string {
  return phase.toLowerCase();
}

export function isRunningSession(sessionType: string): boolean {
  return ["Long Run", "Run", "Run / Quality", "Recovery Run"].includes(sessionType);
}

/** Friendly Telegram message for a day's session, in the bot's casual voice. */
export function formatTrainingMessage(d: TrainingDay, opts?: { tomorrow?: boolean }): string {
  const emoji = TYPE_EMOJI[d.sessionType] ?? "🏃";
  const when = opts?.tomorrow ? "tomorrow's" : "today's";
  const header = `${emoji} ${when} training — ${d.day.toLowerCase()}, week ${d.week} (${titleCasePhase(d.phase)})`;
  const summary = `${d.sessionType} · ~${d.minutes} min · effort ${d.rpe}/10`;

  const lines = [header, summary, "", d.main];
  if (d.strength) lines.push("", `extras: ${d.strength}`);
  if (d.mobility) lines.push("", `mobility: ${d.mobility}`);
  if (d.minimum) lines.push("", `short on time? ${d.minimum}`);
  if (isRunningSession(d.sessionType)) {
    lines.push("", "afterward, reply with what you did — e.g. “done, 25 min, energy 4/5, pain 0/10.”");
  }
  return lines.join("\n");
}
