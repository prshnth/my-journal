import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "./db";
import { users, prompts, checkIns, entries, signals } from "./db/schema";
import type { User, CheckIn, Entry } from "./db/schema";
import type { ExtractedSignals } from "./signals/types";
import type { CheckInPrompt, Slot } from "./prompts/types";
import { PROMPT_CATALOG } from "./prompts/catalog";

// --- users ---

export async function upsertUser(opts: {
  telegramChatId: string;
  name?: string | null;
  timezone: string;
}): Promise<User> {
  const [row] = await db
    .insert(users)
    .values({
      telegramChatId: opts.telegramChatId,
      name: opts.name ?? null,
      timezone: opts.timezone,
    })
    .onConflictDoUpdate({
      target: users.telegramChatId,
      // Keep an existing name if this update didn't carry one.
      set: opts.name != null ? { timezone: opts.timezone, name: opts.name } : { timezone: opts.timezone },
    })
    .returning();
  return row;
}

export async function getUserByChatId(telegramChatId: string): Promise<User | undefined> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.telegramChatId, telegramChatId))
    .limit(1);
  return row;
}

export async function listUsers(): Promise<User[]> {
  return db.select().from(users);
}

// --- check-ins ---

export async function checkInExists(
  userId: number,
  slot: string,
  localDate: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: checkIns.id })
    .from(checkIns)
    .where(
      and(eq(checkIns.userId, userId), eq(checkIns.slot, slot), eq(checkIns.localDate, localDate)),
    )
    .limit(1);
  return Boolean(row);
}

/** Inserts a check-in; returns null if one already exists for this user/slot/day. */
export async function recordCheckIn(opts: {
  userId: number;
  slot: Slot;
  prompt: CheckInPrompt;
  localDate: string;
  telegramMessageId?: string | null;
}): Promise<CheckIn | null> {
  const [row] = await db
    .insert(checkIns)
    .values({
      userId: opts.userId,
      slot: opts.slot,
      promptId: opts.prompt.promptId ?? null,
      text: opts.prompt.text,
      source: opts.prompt.source,
      localDate: opts.localDate,
      telegramMessageId: opts.telegramMessageId ?? null,
    })
    .onConflictDoNothing({ target: [checkIns.userId, checkIns.slot, checkIns.localDate] })
    .returning();
  return row ?? null;
}

export async function setCheckInMessageId(
  checkInId: number,
  telegramMessageId: string,
): Promise<void> {
  await db.update(checkIns).set({ telegramMessageId }).where(eq(checkIns.id, checkInId));
}

/** Most recent check-in for a user since `since` — used to attribute a reply to a prompt. */
export async function latestRecentCheckIn(
  userId: number,
  since: Date,
): Promise<CheckIn | undefined> {
  const [row] = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.userId, userId), gte(checkIns.sentAt, since)))
    .orderBy(desc(checkIns.sentAt))
    .limit(1);
  return row;
}

// --- entries + signals ---

export async function recordEntry(opts: {
  userId: number;
  text: string;
  telegramMessageId?: string | null;
  checkInId?: number | null;
}): Promise<Entry> {
  const [row] = await db
    .insert(entries)
    .values({
      userId: opts.userId,
      text: opts.text,
      telegramMessageId: opts.telegramMessageId ?? null,
      checkInId: opts.checkInId ?? null,
    })
    .returning();
  return row;
}

export async function saveSignals(
  entryId: number,
  s: ExtractedSignals,
  extractedBy: string,
): Promise<void> {
  await db.insert(signals).values({
    entryId,
    mood: s.mood ?? null,
    didRun: s.didRun ?? null,
    sleepQuality: s.sleepQuality ?? null,
    energy: s.energy ?? null,
    tags: s.tags ?? [],
    extractedBy,
  });
}

// --- seeding ---

/** Populates the prompt catalog on first run. Returns the number of rows inserted. */
export async function seedPromptsIfEmpty(): Promise<number> {
  const [existing] = await db.select({ id: prompts.id }).from(prompts).limit(1);
  if (existing) return 0;
  await db
    .insert(prompts)
    .values(PROMPT_CATALOG.map((p) => ({ slot: p.slot, text: p.text, tags: p.tags })));
  return PROMPT_CATALOG.length;
}
