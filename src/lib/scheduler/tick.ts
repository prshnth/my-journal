import { DateTime } from "luxon";
import { RotatingPromptProvider } from "../prompts/rotating";
import type { PromptProvider } from "../prompts/types";
import {
  checkInExists,
  listUsers,
  recordBraindumpCheckIn,
  recordCheckIn,
  recordTrainingCheckIn,
  setCheckInMessageId,
} from "../repo";
import { sendMessage } from "../telegram/send";
import { formatTrainingMessage, trainingDayFor } from "../training/plan";
import { braindumpDue, BRAINDUMP_PROMPT, dueSlots, trainingDue } from "./slots";

// Swap this single line for an AI provider later — nothing else in the loop changes.
const provider: PromptProvider = new RotatingPromptProvider();

export async function runTick(now: DateTime = DateTime.now()): Promise<void> {
  const users = await listUsers();

  for (const user of users) {
    for (const due of dueSlots(user.timezone, now)) {
      if (await checkInExists(user.id, due.slot, due.localDate)) continue;

      const prompt = await provider.getNextCheckIn({
        userId: user.id,
        slot: due.slot,
        localDate: due.localDate,
      });

      const checkIn = await recordCheckIn({
        userId: user.id,
        slot: due.slot,
        prompt,
        localDate: due.localDate,
      });
      if (!checkIn) continue; // lost the unique race; another insert already claimed this slot

      try {
        const messageId = await sendMessage(user.telegramChatId, prompt.text);
        if (messageId !== undefined) {
          await setCheckInMessageId(checkIn.id, String(messageId));
        }
      } catch (err) {
        console.error(`[scheduler] failed to send ${due.slot} to ${user.telegramChatId}:`, err);
      }
    }

    // Morning training nudge — that day's session from the 6-month running plan.
    const trDate = trainingDue(user.timezone, now);
    if (trDate && !(await checkInExists(user.id, "training", trDate))) {
      const day = trainingDayFor(trDate);
      if (day) {
        const text = formatTrainingMessage(day);
        const checkIn = await recordTrainingCheckIn({ userId: user.id, localDate: trDate, text });
        if (checkIn) {
          try {
            const messageId = await sendMessage(user.telegramChatId, text);
            if (messageId !== undefined) {
              await setCheckInMessageId(checkIn.id, String(messageId));
            }
          } catch (err) {
            console.error(`[scheduler] failed to send training to ${user.telegramChatId}:`, err);
          }
        }
      }
    }

    // Once-a-day braindump nudge — its replies are turned into todos by the bot.
    const bdDate = braindumpDue(user.timezone, now);
    if (bdDate && !(await checkInExists(user.id, "braindump", bdDate))) {
      const checkIn = await recordBraindumpCheckIn({
        userId: user.id,
        localDate: bdDate,
        text: BRAINDUMP_PROMPT,
      });
      if (checkIn) {
        try {
          const messageId = await sendMessage(user.telegramChatId, BRAINDUMP_PROMPT);
          if (messageId !== undefined) {
            await setCheckInMessageId(checkIn.id, String(messageId));
          }
        } catch (err) {
          console.error(`[scheduler] failed to send braindump to ${user.telegramChatId}:`, err);
        }
      }
    }
  }
}
