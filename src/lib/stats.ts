import { asc, desc, eq } from "drizzle-orm";
import { DateTime } from "luxon";
import { db } from "./db";
import { users, entries, signals, checkIns } from "./db/schema";
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
  mood: number | null;
  didRun: boolean | null;
  sleepQuality: number | null;
  energy: number | null;
  tags: string[];
}

export interface DashboardData {
  hasOwner: boolean;
  timezone: string;
  totals: { entries: number; streak: number; runs7: number; avgMood7: number | null };
  daily: DailyPoint[];
  recent: EntryRow[];
}

function avg(xs: number[]): number | null {
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100;
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
    };
  }

  const rows = await db
    .select({
      entryId: entries.id,
      text: entries.text,
      receivedAt: entries.receivedAt,
      checkInText: checkIns.text,
      mood: signals.mood,
      didRun: signals.didRun,
      sleepQuality: signals.sleepQuality,
      energy: signals.energy,
      tags: signals.tags,
    })
    .from(entries)
    .leftJoin(signals, eq(signals.entryId, entries.id))
    .leftJoin(checkIns, eq(checkIns.id, entries.checkInId))
    .where(eq(entries.userId, owner.id))
    .orderBy(desc(entries.receivedAt), desc(signals.createdAt));

  // One row per entry; ordering above puts the latest signal first.
  const unique: typeof rows = [];
  const seen = new Set<number>();
  for (const r of rows) {
    if (!seen.has(r.entryId)) {
      seen.add(r.entryId);
      unique.push(r);
    }
  }

  // Daily aggregation in the owner's timezone.
  const dayMap = new Map<string, { moods: number[]; sleeps: number[]; runs: number; count: number }>();
  for (const r of unique) {
    const date = DateTime.fromJSDate(r.receivedAt).setZone(timezone).toFormat("yyyy-LL-dd");
    const d = dayMap.get(date) ?? { moods: [], sleeps: [], runs: 0, count: 0 };
    d.count++;
    if (typeof r.mood === "number") d.moods.push(r.mood);
    if (typeof r.sleepQuality === "number") d.sleeps.push(r.sleepQuality);
    if (r.didRun === true) d.runs++;
    dayMap.set(date, d);
  }
  const daily: DailyPoint[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({
      date,
      mood: avg(d.moods),
      sleep: avg(d.sleeps),
      runs: d.runs,
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

  // Last 7 days roll-ups.
  const sevenAgo = todayLocal.minus({ days: 6 });
  let runs7 = 0;
  const moods7: number[] = [];
  for (const r of unique) {
    const day = DateTime.fromJSDate(r.receivedAt).setZone(timezone).startOf("day");
    if (day >= sevenAgo) {
      if (r.didRun === true) runs7++;
      if (typeof r.mood === "number") moods7.push(r.mood);
    }
  }

  const recent: EntryRow[] = unique.slice(0, 50).map((r) => ({
    id: r.entryId,
    receivedAt: r.receivedAt.toISOString(),
    text: r.text,
    promptText: r.checkInText ?? null,
    mood: r.mood ?? null,
    didRun: r.didRun ?? null,
    sleepQuality: r.sleepQuality ?? null,
    energy: r.energy ?? null,
    tags: (r.tags as string[] | null) ?? [],
  }));

  return {
    hasOwner: true,
    timezone,
    totals: { entries: unique.length, streak, runs7, avgMood7: avg(moods7) },
    daily,
    recent,
  };
}
