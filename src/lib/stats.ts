import { asc, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "./db";
import { users, entries, checkIns, todos } from "./db/schema";
import type { User } from "./db/schema";
import { env } from "./env";

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
