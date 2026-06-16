import { DateTime } from "luxon";
import { RotatingPromptProvider } from "../prompts/rotating";
import type { PromptProvider } from "../prompts/types";
import { checkInExists, listUsers, recordCheckIn, setCheckInMessageId } from "../repo";
import { sendMessage } from "../telegram/send";
import { dueSlots } from "./slots";

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
  }
}
