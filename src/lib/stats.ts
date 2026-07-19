import { and, asc, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "./db";
import { users, entries, checkIns, signals, todos } from "./db/schema";
import type { User } from "./db/schema";
import { env } from "./env";
import { trainingDayFor, type TrainingDay } from "./training/plan";

export interface DailyPoint {
  date: string;
  mood: number | null;
  sleep: number | null;
  runs: number;
  entries: number;
}

export interface EntryRow {
  id: number;
  receivedAt: string; // ISO
  text: string;
  promptText: string | null;
}

export interface CalendarDay {
  date: string;
  count: number;
}

export interface DashboardData {
  hasOwner: boolean;
  timezone: string;
  totals: { entries: number; streak: number; runs7: number; avgMood7: number | null };
  daily: DailyPoint[];
  recent: EntryRow[];
  calendar: CalendarDay[];
}

async function getOwner(): Promise<User | undefined> {
  if (env.OWNER_TELEGRAM_CHAT_ID) {
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.telegramChatId, env.OWNER_TELEGRAM_CHAT_ID))
      .limit(1);
    if (u) return u;
  }
  const [first] = await db.select().from(users).orderBy(asc(users.id)).limit(1);
  return first;
}

export async function getDashboardData(): Promise<DashboardData> {
  const owner = await getOwner();
  const timezone = owner?.timezone || env.USER_TIMEZONE;
  if (!owner) {
    return {
      hasOwner: false,
      timezone,
      totals: { entries: 0, streak: 0, runs7: 0, avgMood7: null },
      daily: [],
      recent: [],
      calendar: [],
    };
  }

  const rows = await db
    .select({
      entryId: entries.id,
      text: entries.text,
      receivedAt: entries.receivedAt,
      checkInText: checkIns.text,
    })
    .from(entries)
    .leftJoin(checkIns, eq(checkIns.id, entries.checkInId))
    .where(eq(entries.userId, owner.id))
    .orderBy(desc(entries.receivedAt));

  // One row per entry.
  const unique: typeof rows = [];
  const seen = new Set<number>();
  for (const r of rows) {
    if (!seen.has(r.entryId)) {
      seen.add(r.entryId);
      unique.push(r);
    }
  }

  // Daily aggregation in the owner's timezone.
  const dayMap = new Map<string, { count: number }>();
  for (const r of unique) {
    const date = DateTime.fromJSDate(r.receivedAt).setZone(timezone).toFormat("yyyy-LL-dd");
    const d = dayMap.get(date) ?? { count: 0 };
    d.count++;
    dayMap.set(date, d);
  }
  const daily: DailyPoint[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      mood: null,
      sleep: null,
      runs: 0,
      entries: d.count,
    }));

  // Streak: consecutive days with an entry, allowing today to still be empty.
  const todayLocal = DateTime.now().setZone(timezone).startOf("day");
  let cursor = todayLocal;
  if (!dayMap.has(cursor.toFormat("yyyy-LL-dd"))) cursor = cursor.minus({ days: 1 });
  let streak = 0;
  while (dayMap.has(cursor.toFormat("yyyy-LL-dd"))) {
    streak++;
    cursor = cursor.minus({ days: 1 });
  }

  const recent: EntryRow[] = unique.slice(0, 50).map((r) => ({
    id: r.entryId,
    receivedAt: r.receivedAt.toISOString(),
    text: r.text,
    promptText: r.checkInText ?? null,
  }));

  // Activity calendar: the last 18 weeks, for the consistency heatmap.
  const CAL_DAYS = 18 * 7;
  const calStart = todayLocal.minus({ days: CAL_DAYS - 1 });
  const calendar: CalendarDay[] = [];
  for (let i = 0; i < CAL_DAYS; i++) {
    const day = calStart.plus({ days: i });
    const key = day.toFormat("yyyy-LL-dd");
    const e = dayMap.get(key);
    calendar.push({ date: key, count: e?.count ?? 0 });
  }

  return {
    hasOwner: true,
    timezone,
    totals: { entries: unique.length, streak, runs7: 0, avgMood7: null },
    daily,
    recent,
    calendar,
  };
}

export interface JournalResult {
  hasOwner: boolean;
  timezone: string;
  entries: EntryRow[];
  total: number;
  hasMore: boolean;
}

/** Full entry history for the Journal tab, with text search, paginated. */
export async function getJournalEntries(opts: {
  search?: string;
  limit?: number;
}): Promise<JournalResult> {
  const owner = await getOwner();
  const timezone = owner?.timezone || env.USER_TIMEZONE;
  const q = (opts.search ?? "").trim().toLowerCase();
  const limit = opts.limit ?? 50;
  if (!owner) {
    return { hasOwner: false, timezone, entries: [], total: 0, hasMore: false };
  }

  const rows = await db
    .select({
      entryId: entries.id,
      text: entries.text,
      receivedAt: entries.receivedAt,
      checkInText: checkIns.text,
    })
    .from(entries)
    .leftJoin(checkIns, eq(checkIns.id, entries.checkInId))
    .where(eq(entries.userId, owner.id))
    .orderBy(desc(entries.receivedAt));

  // One row per entry, then apply search.
  const seen = new Set<number>();
  const matched: EntryRow[] = [];
  for (const r of rows) {
    if (seen.has(r.entryId)) continue;
    seen.add(r.entryId);
    if (q && !r.text.toLowerCase().includes(q)) continue;
    matched.push({
      id: r.entryId,
      receivedAt: r.receivedAt.toISOString(),
      text: r.text,
      promptText: r.checkInText ?? null,
    });
  }

  return {
    hasOwner: true,
    timezone,
    entries: matched.slice(0, limit),
    total: matched.length,
    hasMore: matched.length > limit,
  };
}

export interface TodoRow {
  id: number;
  text: string;
  done: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface TodosData {
  hasOwner: boolean;
  open: TodoRow[];
  done: TodoRow[];
}

export async function getOwnerUserId(): Promise<number | null> {
  const owner = await getOwner();
  return owner?.id ?? null;
}

export async function getOwnerTodos(): Promise<TodosData> {
  const owner = await getOwner();
  if (!owner) return { hasOwner: false, open: [], done: [] };

  const rows = await db
    .select()
    .from(todos)
    .where(eq(todos.userId, owner.id))
    .orderBy(desc(todos.createdAt));

  const open: TodoRow[] = [];
  const done: TodoRow[] = [];
  for (const t of rows) {
    const row: TodoRow = {
      id: t.id,
      text: t.text,
      done: t.done,
      createdAt: t.createdAt.toISOString(),
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    };
    (t.done ? done : open).push(row);
  }
  open.reverse(); // oldest-first, matching the bot's /todos numbering
  return { hasOwner: true, open, done: done.slice(0, 25) };
}

export interface RunRow {
  id: number;
  date: string;
  receivedAt: string;
  text: string;
  sessionType: string | null;
  minutes: number | null;
  energy: number | null;
  pain: number | null;
}

export interface RunWeek {
  startDate: string;
  label: string;
  runs: number;
  minutes: number;
}

export interface RunsData {
  hasOwner: boolean;
  timezone: string;
  totals: {
    runs: number;
    runs7: number;
    minutes: number;
    weekStreak: number;
    avgEnergy: number | null;
  };
  today: TrainingDay | null;
  calendar: CalendarDay[];
  weeks: RunWeek[];
  recent: RunRow[];
}

/** Completed runs, extracted from journal replies and grouped in the owner's timezone. */
export async function getRunsData(limit = 40): Promise<RunsData> {
  const owner = await getOwner();
  const timezone = owner?.timezone || env.USER_TIMEZONE;
  const empty: RunsData = {
    hasOwner: false,
    timezone,
    totals: { runs: 0, runs7: 0, minutes: 0, weekStreak: 0, avgEnergy: null },
    today: null,
    calendar: [],
    weeks: [],
    recent: [],
  };
  if (!owner) return empty;

  const rows = await db
    .select({
      entryId: entries.id,
      text: entries.text,
      receivedAt: entries.receivedAt,
      checkInDate: checkIns.localDate,
      checkInSource: checkIns.source,
      signalCreatedAt: signals.createdAt,
      minutes: signals.runMinutes,
      energy: signals.energy,
      pain: signals.pain,
    })
    .from(entries)
    .innerJoin(signals, and(eq(signals.entryId, entries.id), eq(signals.didRun, true)))
    .leftJoin(checkIns, eq(checkIns.id, entries.checkInId))
    .where(eq(entries.userId, owner.id))
    .orderBy(desc(entries.receivedAt), desc(signals.createdAt));

  // Reprocessing can create a newer signal row for an entry; use only the newest one.
  const seen = new Set<number>();
  const runs: RunRow[] = [];
  for (const row of rows) {
    if (seen.has(row.entryId)) continue;
    seen.add(row.entryId);
    const date =
      row.checkInDate ??
      DateTime.fromJSDate(row.receivedAt).setZone(timezone).toFormat("yyyy-LL-dd");
    const planned = row.checkInSource === "training" ? trainingDayFor(date) : undefined;
    runs.push({
      id: row.entryId,
      date,
      receivedAt: row.receivedAt.toISOString(),
      text: row.text,
      sessionType: planned?.sessionType ?? null,
      minutes: row.minutes,
      energy: row.energy,
      pain: row.pain,
    });
  }

  const todayLocal = DateTime.now().setZone(timezone).startOf("day");
  const todayKey = todayLocal.toFormat("yyyy-LL-dd");
  const sevenDayStart = todayLocal.minus({ days: 6 }).toFormat("yyyy-LL-dd");
  const dateCounts = new Map<string, number>();
  for (const run of runs) dateCounts.set(run.date, (dateCounts.get(run.date) ?? 0) + 1);

  const calendar: CalendarDay[] = [];
  const calendarStart = todayLocal.minus({ days: 18 * 7 - 1 });
  for (let i = 0; i < 18 * 7; i++) {
    const date = calendarStart.plus({ days: i }).toFormat("yyyy-LL-dd");
    calendar.push({ date, count: dateCounts.get(date) ?? 0 });
  }

  const weekCounts = new Map<string, { runs: number; minutes: number }>();
  for (const run of runs) {
    const weekStart = DateTime.fromISO(run.date, { zone: timezone })
      .startOf("week")
      .toFormat("yyyy-LL-dd");
    const week = weekCounts.get(weekStart) ?? { runs: 0, minutes: 0 };
    week.runs++;
    week.minutes += run.minutes ?? 0;
    weekCounts.set(weekStart, week);
  }

  const weeks: RunWeek[] = [];
  const firstWeek = todayLocal.startOf("week").minus({ weeks: 11 });
  for (let i = 0; i < 12; i++) {
    const start = firstWeek.plus({ weeks: i });
    const startDate = start.toFormat("yyyy-LL-dd");
    const values = weekCounts.get(startDate) ?? { runs: 0, minutes: 0 };
    weeks.push({ startDate, label: start.toFormat("LLL d"), ...values });
  }

  let streakCursor = todayLocal.startOf("week");
  if (!weekCounts.has(streakCursor.toFormat("yyyy-LL-dd"))) {
    streakCursor = streakCursor.minus({ weeks: 1 });
  }
  let weekStreak = 0;
  while (weekCounts.has(streakCursor.toFormat("yyyy-LL-dd"))) {
    weekStreak++;
    streakCursor = streakCursor.minus({ weeks: 1 });
  }

  const energies = runs.flatMap((run) => (run.energy === null ? [] : [run.energy]));
  const avgEnergy = energies.length
    ? Math.round((energies.reduce((sum, value) => sum + value, 0) / energies.length) * 10) / 10
    : null;

  return {
    hasOwner: true,
    timezone,
    totals: {
      runs: runs.length,
      runs7: runs.filter((run) => run.date >= sevenDayStart && run.date <= todayKey).length,
      minutes: runs.reduce((sum, run) => sum + (run.minutes ?? 0), 0),
      weekStreak,
      avgEnergy,
    },
    today: trainingDayFor(todayKey) ?? null,
    calendar,
    weeks,
    recent: runs.slice(0, limit),
  };
}
