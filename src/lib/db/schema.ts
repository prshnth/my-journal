import { sql } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const jsonbStringArray = () =>
  jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`);

/** The owner(s) of this journal. Single-user today, but a table leaves room to grow. */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramChatId: text("telegram_chat_id").notNull().unique(),
  name: text("name"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Curated catalog of check-in prompts the rotating provider draws from. */
export const prompts = pgTable("prompts", {
  id: serial("id").primaryKey(),
  slot: text("slot").notNull(), // e.g. "morning" | "midday" | "evening"
  text: text("text").notNull(),
  tags: jsonbStringArray(),
  active: boolean("active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every proactive nudge we sent. One per slot per local day per user (see unique index). */
export const checkIns = pgTable(
  "check_ins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    slot: text("slot").notNull(),
    promptId: integer("prompt_id").references(() => prompts.id),
    text: text("text").notNull(),
    source: text("source").notNull().default("rotating"), // "rotating" | "ai"
    localDate: text("local_date").notNull(), // YYYY-MM-DD in the user's timezone
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    telegramMessageId: text("telegram_message_id"),
  },
  (t) => [
    uniqueIndex("check_ins_user_slot_date_uniq").on(t.userId, t.slot, t.localDate),
  ],
);

/** Raw, verbatim replies from the user. Never derived from — preserved as the source of truth. */
export const entries = pgTable(
  "entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    // Nullable: the user can journal unprompted, not just in reply to a check-in.
    checkInId: integer("check_in_id").references(() => checkIns.id),
    text: text("text").notNull(),
    telegramMessageId: text("telegram_message_id"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("entries_user_received_idx").on(t.userId, t.receivedAt)],
);

/**
 * Metrics derived from an entry. Kept separate from `entries` on purpose: upgrading
 * extraction (rules -> AI) just writes new signal rows over existing history, with no
 * migration and no risk to the raw text. `extractedBy` records which processor produced it.
 */
export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id")
      .notNull()
      .references(() => entries.id),
    mood: integer("mood"), // -2..2, or null if not inferable
    didRun: boolean("did_run"), // true/false/null
    runMinutes: integer("run_minutes"), // reported duration, or null when omitted
    sleepQuality: integer("sleep_quality"), // 1..5, or null
    energy: integer("energy"), // 1..5, or null
    pain: integer("pain"), // 0..10, or null
    tags: jsonbStringArray(),
    extractedBy: text("extracted_by").notNull().default("rules"), // "rules" | "ai"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("signals_entry_idx").on(t.entryId)],
);

/** Lightweight todo items — captured via /todos, the daily braindump, or the dashboard. */
export const todos = pgTable(
  "todos",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    done: boolean("done").notNull().default(false),
    source: text("source").notNull().default("command"), // "command" | "braindump" | "ui"
    sourceEntryId: integer("source_entry_id").references(() => entries.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("todos_user_done_idx").on(t.userId, t.done, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Prompt = typeof prompts.$inferSelect;
export type CheckIn = typeof checkIns.$inferSelect;
export type Entry = typeof entries.$inferSelect;
export type Signal = typeof signals.$inferSelect;
export type Todo = typeof todos.$inferSelect;
