import { Bot } from "grammy";
import { DateTime } from "luxon";
import { env } from "../env";
import { RuleBasedProcessor } from "../signals/rules";
import type { ExtractedSignals, ResponseProcessor } from "../signals/types";
import {
  getUserByChatId,
  latestRecentCheckIn,
  recordEntry,
  saveSignals,
  upsertUser,
} from "../repo";

const processor: ResponseProcessor = new RuleBasedProcessor();

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
      "i nudge you morning, midday, and evening. just reply to log how you're doing — that's the whole thing.",
    );
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith("/")) return; // ignore stray slash commands

    const chatId = String(ctx.chat.id);
    const user =
      (await getUserByChatId(chatId)) ??
      (await upsertUser({
        telegramChatId: chatId,
        name: ctx.from?.first_name ?? null,
        timezone: env.USER_TIMEZONE,
      }));

    // Attribute the reply to a recent check-in (if any) so we can interpret terse answers.
    const since = DateTime.now().minus({ hours: 18 }).toJSDate();
    const checkIn = await latestRecentCheckIn(user.id, since);

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
