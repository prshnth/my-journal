import { DateTime } from "luxon";
import { RotatingPromptProvider } from "../prompts/rotating";
import type { PromptProvider } from "../prompts/types";
import {
  checkInExists,
  deleteCheckIn,
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

async function deliverRecordedCheckIn(opts: {
  checkInId: number;
  chatId: string;
  text: string;
  label: string;
}): Promise<void> {
  let messageId: number | undefined;
  try {
    messageId = await sendMessage(opts.chatId, opts.text);
  } catch (err) {
    // Release the unique daily claim so the next scheduler tick can retry.
    try {
      await deleteCheckIn(opts.checkInId);
    } catch (cleanupErr) {
      console.error(`[scheduler] failed to release ${opts.label} check-in:`, cleanupErr);
    }
    console.error(`[scheduler] failed to send ${opts.label} to ${opts.chatId}:`, err);
    return;
  }

  if (messageId === undefined) return;
  try {
    await setCheckInMessageId(opts.checkInId, String(messageId));
  } catch (err) {
    // The message was delivered. Keep the claim to avoid sending a duplicate.
    console.error(`[scheduler] sent ${opts.label}, but failed to save its message id:`, err);
  }
}

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

      await deliverRecordedCheckIn({
        checkInId: checkIn.id,
        chatId: user.telegramChatId,
        text: prompt.text,
        label: due.slot,
      });
    }

    // Morning training nudge — that day's session from the 6-month running plan.
    const trDate = trainingDue(user.timezone, now);
    if (trDate && !(await checkInExists(user.id, "training", trDate))) {
      const day = trainingDayFor(trDate);
      if (day) {
        const text = formatTrainingMessage(day);
        const checkIn = await recordTrainingCheckIn({ userId: user.id, localDate: trDate, text });
        if (checkIn) {
          await deliverRecordedCheckIn({
            checkInId: checkIn.id,
            chatId: user.telegramChatId,
            text,
            label: "training",
          });
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
        await deliverRecordedCheckIn({
          checkInId: checkIn.id,
          chatId: user.telegramChatId,
          text: BRAINDUMP_PROMPT,
          label: "braindump",
        });
      }
    }
  }
}
