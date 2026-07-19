// 6-month return-to-running plan (Jul 18, 2026 – Jan 17, 2027), one row per day.
// plan.json was extracted from the "DAILY PLAN" sheet of the source spreadsheet
// (6_Month_Return_to_Running_Plan_ChatGPT.xlsx) — swap the JSON to change plans.
import planData from "./plan.json";

export interface TrainingDay {
  date: string; // YYYY-MM-DD
  day: string;
  week: number;
  phase: string;
  sessionType: string;
  main: string;
  strength: string;
  mobility: string;
  rpe: string;
  minutes: number;
  minimum: string;
}

const PLAN: TrainingDay[] = planData as TrainingDay[];
const byDate = new Map(PLAN.map((d) => [d.date, d]));

export const PLAN_START = PLAN[0]?.date ?? "";
export const PLAN_END = PLAN[PLAN.length - 1]?.date ?? "";

/** The plan row for a local date (YYYY-MM-DD), or undefined outside the plan window. */
export function trainingDayFor(localDate: string): TrainingDay | undefined {
  return byDate.get(localDate);
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
  return lines.join("\n");
}
