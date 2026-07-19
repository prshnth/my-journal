import { Bot } from "grammy";
import { DateTime } from "luxon";
import { env } from "../env";
import {
  addTodo,
  getCheckInByTelegramMessageId,
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
import { RuleBasedProcessor } from "../signals/rules";
import { formatTrainingMessage, trainingDayFor, PLAN_END, PLAN_START } from "../training/plan";
import type { User } from "../db/schema";

const promptProvider = new RotatingPromptProvider();
const responseProcessor = new RuleBasedProcessor();

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
        "/plan — today's training from your running plan (or /plan tomorrow)\n" +
        "/todos — list your todos, or /todos <thing> to add one\n" +
        "/done <number> — check a todo off\n\n" +
        "every morning i'll send that day's run, strength, or recovery session. " +
        "reply to that message with minutes, energy, and pain to track a run.\n" +
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

  // Today's (or tomorrow's) session from the 6-month running plan.
  bot.command("plan", async (ctx) => {
    const user = await ensureUser(String(ctx.chat.id), ctx.from?.first_name ?? null);
    const tomorrow = ctx.match.trim().toLowerCase() === "tomorrow";
    const date = tomorrow
      ? DateTime.now().setZone(user.timezone).plus({ days: 1 }).toFormat("yyyy-LL-dd")
      : localDateFor(user.timezone);
    const day = trainingDayFor(date);
    if (!day) {
      await ctx.reply(`no plan for that day — the running plan covers ${PLAN_START} to ${PLAN_END}.`);
      return;
    }
    await ctx.reply(formatTrainingMessage(day, { tomorrow }));
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

    // Prefer the exact Telegram message being answered; fall back for ordinary chat replies.
    const since = DateTime.now().minus({ hours: 18 }).toJSDate();
    const repliedToMessageId = ctx.message.reply_to_message?.message_id;
    let checkIn = repliedToMessageId
      ? await getCheckInByTelegramMessageId(user.id, String(repliedToMessageId))
      : undefined;
    checkIn ??= await latestRecentCheckIn(user.id, since);

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

    const extracted = await responseProcessor.process(entry, { promptText: checkIn?.text });
    try {
      await saveSignals(entry.id, extracted, responseProcessor.name);
    } catch (err) {
      // The raw journal entry is still safely stored even if derived metrics fail.
      console.error(`[bot] failed to save signals for entry ${entry.id}:`, err);
    }

    await ctx.reply(extracted.didRun === true ? "run logged. nice work." : "logged. thanks for checking in.");
  });

  bot.catch((err) => console.error("[bot] error handling update:", err));
  return bot;
}
