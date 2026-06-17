import { Bot } from "grammy";
import { DateTime } from "luxon";
import { env } from "../env";
import { RuleBasedProcessor } from "../signals/rules";
import type { ExtractedSignals, ResponseProcessor } from "../signals/types";
import {
  addTodo,
  getUserByChatId,
  hasTodoSince,
  latestRecentCheckIn,
  listOpenTodos,
  recordEntry,
  recordManualCheckIn,
  saveSignals,
  setTodoDone,
  upsertUser,
} from "../repo";
import { RotatingPromptProvider } from "../prompts/rotating";
import { SLOTS, type Slot } from "../prompts/types";
import { currentSlot, localDateFor } from "../scheduler/slots";
import type { User } from "../db/schema";

const processor: ResponseProcessor = new RuleBasedProcessor();
const promptProvider = new RotatingPromptProvider();

async function ensureUser(chatId: string, firstName: string | null): Promise<User> {
  return (
    (await getUserByChatId(chatId)) ??
    (await upsertUser({ telegramChatId: chatId, name: firstName, timezone: env.USER_TIMEZONE }))
  );
}

export function createBot(): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

  bot.command("start", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const name = ctx.from?.first_name ?? null;
    await upsertUser({ telegramChatId: chatId, name, timezone: env.USER_TIMEZONE });
    await ctx.reply(
      `hey${name ? " " + name : ""}! i'll check in with you a few times a day. ` +
        `reply however you like — a word or two is plenty.\n\n` +
        `your chat id is ${chatId}`,
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "i nudge you morning, midday, and evening — just reply to log how you're doing.\n\n" +
        "/checkin — a nudge now (or /checkin morning | midday | evening)\n" +
        "/todos — list your todos, or /todos <thing> to add one\n" +
        "/done <number> — check a todo off\n\n" +
        "once a day i'll ask what's on your mind — reply one item per line and i'll save them as todos.",
    );
  });

  // Manual, off-schedule nudge: pick a prompt and send it right now.
  bot.command("checkin", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const user =
      (await getUserByChatId(chatId)) ??
      (await upsertUser({
        telegramChatId: chatId,
        name: ctx.from?.first_name ?? null,
        timezone: env.USER_TIMEZONE,
      }));

    // Optional slot argument ("/checkin evening"); otherwise the slot for the current time.
    const arg = ctx.match.trim().toLowerCase();
    const slot: Slot = (SLOTS as readonly string[]).includes(arg)
      ? (arg as Slot)
      : currentSlot(user.timezone);

    const localDate = localDateFor(user.timezone);
    const prompt = await promptProvider.getNextCheckIn({ userId: user.id, slot, localDate });

    const sent = await ctx.reply(prompt.text);
    // Record it so your reply attributes to this prompt. If this slot already fired today it
    // returns null — the nudge still goes out and the reply maps to that slot's check-in.
    await recordManualCheckIn({
      userId: user.id,
      slot,
      prompt,
      localDate,
      telegramMessageId: String(sent.message_id),
    });
  });

  // Todos: list them, or add one when text follows the command.
  bot.command("todos", async (ctx) => {
    const user = await ensureUser(String(ctx.chat.id), ctx.from?.first_name ?? null);
    const arg = ctx.match.trim();
    if (arg) {
      await addTodo({ userId: user.id, text: arg, source: "command" });
      const open = await listOpenTodos(user.id);
      await ctx.reply(`added. ${open.length} open ${open.length === 1 ? "todo" : "todos"} now.`);
      return;
    }
    const open = await listOpenTodos(user.id);
    if (!open.length) {
      await ctx.reply("no open todos. add one with /todos <thing>, or reply to the daily braindump.");
      return;
    }
    const list = open.map((t, i) => `${i + 1}. ${t.text}`).join("\n");
    await ctx.reply(`your todos:\n${list}\n\nmark one done with /done <number>.`);
  });

  // Complete the Nth open todo (numbering matches /todos).
  bot.command("done", async (ctx) => {
    const user = await ensureUser(String(ctx.chat.id), ctx.from?.first_name ?? null);
    const open = await listOpenTodos(user.id);
    const n = parseInt(ctx.match.trim(), 10);
    if (!Number.isInteger(n) || n < 1 || n > open.length) {
      await ctx.reply(
        open.length ? `which one? send /done <1-${open.length}> — see /todos.` : "no open todos to finish.",
      );
      return;
    }
    const todo = open[n - 1];
    await setTodoDone(todo.id, true);
    await ctx.reply(`done: ${todo.text}`);
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // ignore stray slash commands

    const user = await ensureUser(String(ctx.chat.id), ctx.from?.first_name ?? null);

    // Attribute the reply to a recent check-in (if any) so we can interpret terse answers.
    const since = DateTime.now().minus({ hours: 18 }).toJSDate();
    let checkIn = await latestRecentCheckIn(user.id, since);

    // The daily braindump turns replies into todos — but only the FIRST reply to it. Once it's
    // been answered (a todo exists since it was sent), later replies journal as normal.
    if (checkIn?.slot === "braindump") {
      if (!(await hasTodoSince(user.id, checkIn.sentAt))) {
        if (/^(no|nope|nah|nothing|none|nada|all good|n\/a)\.?$/i.test(text.trim())) {
          await ctx.reply("all good — nothing saved.");
          return;
        }
        const items = text.split("\n").map((l) => l.trim()).filter(Boolean);
        const list = items.length ? items : [text.trim()];
        for (const item of list) await addTodo({ userId: user.id, text: item, source: "braindump" });
        const open = await listOpenTodos(user.id);
        await ctx.reply(`saved ${list.length} to your todos — ${open.length} open now. see them with /todos.`);
        return;
      }
      checkIn = undefined; // already braindumped today → treat this as ordinary journaling
    }

    const entry = await recordEntry({
      userId: user.id,
      text,
      telegramMessageId: String(ctx.message.message_id),
      checkInId: checkIn?.id ?? null,
    });

    const extracted = await processor.process({ text }, { promptText: checkIn?.text });
    await saveSignals(entry.id, extracted, processor.name);

    await ctx.reply(ackFor(extracted));
  });

  bot.catch((err) => console.error("[bot] error handling update:", err));
  return bot;
}

/** A small varied acknowledgement so replies feel heard without any AI in the loop yet. */
function ackFor(s: ExtractedSignals): string {
  if (s.didRun === true) return "nice — logged. proud of you for moving today.";
  if (typeof s.mood === "number" && s.mood <= -1) return "got it, logged. hope it eases up — i'm here.";
  if (typeof s.mood === "number" && s.mood >= 1) return "love that. logged it.";
  return "logged. thanks for checking in.";
}
