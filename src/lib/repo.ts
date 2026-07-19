import { and, asc, desc, eq, gte } from "drizzle-orm";
import { db } from "./db";
import { users, prompts, checkIns, entries, signals, todos } from "./db/schema";
import type { User, CheckIn, Entry, Todo } from "./db/schema";
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

/** Records the once-a-day braindump nudge (its own slot, so it never collides with journals). */
export async function recordBraindumpCheckIn(opts: {
  userId: number;
  localDate: string;
  text: string;
}): Promise<CheckIn | null> {
  const [row] = await db
    .insert(checkIns)
    .values({
      userId: opts.userId,
      slot: "braindump",
      text: opts.text,
      source: "braindump",
      localDate: opts.localDate,
    })
    .onConflictDoNothing({ target: [checkIns.userId, checkIns.slot, checkIns.localDate] })
    .returning();
  return row ?? null;
}

/** Records the daily morning training nudge (its own slot, one per local day). */
export async function recordTrainingCheckIn(opts: {
  userId: number;
  localDate: string;
  text: string;
}): Promise<CheckIn | null> {
  const [row] = await db
    .insert(checkIns)
    .values({
      userId: opts.userId,
      slot: "training",
      text: opts.text,
      source: "training",
      localDate: opts.localDate,
    })
    .onConflictDoNothing({ target: [checkIns.userId, checkIns.slot, checkIns.localDate] })
    .returning();
  return row ?? null;
}

/**
 * Manual /checkin: upserts the slot's check-in so it becomes the latest, even if that slot
 * already fired today. Without this, a reply could attribute to an earlier/other check-in.
 */
export async function recordManualCheckIn(opts: {
  userId: number;
  slot: Slot;
  prompt: CheckInPrompt;
  localDate: string;
  telegramMessageId?: string | null;
}): Promise<CheckIn> {
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
    .onConflictDoUpdate({
      target: [checkIns.userId, checkIns.slot, checkIns.localDate],
      set: {
        promptId: opts.prompt.promptId ?? null,
        text: opts.prompt.text,
        source: opts.prompt.source,
        sentAt: new Date(),
        telegramMessageId: opts.telegramMessageId ?? null,
      },
    })
    .returning();
  return row;
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

// --- todos ---

export async function addTodo(opts: {
  userId: number;
  text: string;
  source?: string;
  sourceEntryId?: number | null;
}): Promise<Todo> {
  const [row] = await db
    .insert(todos)
    .values({
      userId: opts.userId,
      text: opts.text,
      source: opts.source ?? "command",
      sourceEntryId: opts.sourceEntryId ?? null,
    })
    .returning();
  return row;
}

export async function listOpenTodos(userId: number): Promise<Todo[]> {
  return db
    .select()
    .from(todos)
    .where(and(eq(todos.userId, userId), eq(todos.done, false)))
    .orderBy(asc(todos.createdAt));
}

export async function listTodos(userId: number): Promise<Todo[]> {
  return db
    .select()
    .from(todos)
    .where(eq(todos.userId, userId))
    .orderBy(asc(todos.done), desc(todos.createdAt));
}

export async function setTodoDone(id: number, done: boolean): Promise<void> {
  await db
    .update(todos)
    .set({ done, completedAt: done ? new Date() : null })
    .where(eq(todos.id, id));
}

export async function deleteTodo(id: number): Promise<void> {
  await db.delete(todos).where(eq(todos.id, id));
}

/** Whether any todo was created at/after `since` — used to detect an already-answered braindump. */
export async function hasTodoSince(userId: number, since: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: todos.id })
    .from(todos)
    .where(and(eq(todos.userId, userId), gte(todos.createdAt, since)))
    .limit(1);
  return Boolean(row);
}
