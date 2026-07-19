import { DateTime } from "luxon";
import type { Slot } from "../prompts/types";

export interface SlotDef {
  slot: Slot;
  hour: number;
  minute: number;
}

/** Local times each check-in fires. Tweak freely. */
export const SLOT_SCHEDULE: SlotDef[] = [
  { slot: "morning", hour: 8, minute: 30 },
  { slot: "midday", hour: 13, minute: 0 },
  { slot: "evening", hour: 21, minute: 0 },
];

/** A slot only fires within this many minutes after its target — prevents catch-up spam on restart. */
export const GRACE_MINUTES = 90;

export interface DueSlot {
  slot: Slot;
  localDate: string;
}

export function localDateFor(timezone: string, now: DateTime = DateTime.now()): string {
  return now.setZone(timezone).toFormat("yyyy-LL-dd");
}

/** Slots whose target time has passed within the grace window, in the user's timezone. */
export function dueSlots(timezone: string, now: DateTime = DateTime.now()): DueSlot[] {
  const local = now.setZone(timezone);
  const localDate = local.toFormat("yyyy-LL-dd");
  const minutesNow = local.hour * 60 + local.minute;

  const due: DueSlot[] = [];
  for (const def of SLOT_SCHEDULE) {
    const target = def.hour * 60 + def.minute;
    if (minutesNow >= target && minutesNow < target + GRACE_MINUTES) {
      due.push({ slot: def.slot, localDate });
    }
  }
  return due;
}

/**
 * The slot whose scheduled time most recently passed (defaults to the earliest slot when
 * it's before the first one). Used by the manual /checkin command to pick a fitting prompt.
 */
export function currentSlot(timezone: string, now: DateTime = DateTime.now()): Slot {
  const local = now.setZone(timezone);
  const minutesNow = local.hour * 60 + local.minute;
  let chosen: Slot = SLOT_SCHEDULE[0].slot;
  for (const def of SLOT_SCHEDULE) {
    if (minutesNow >= def.hour * 60 + def.minute) chosen = def.slot;
  }
  return chosen;
}

/** The daily morning training nudge — that day's run/strength/recovery from the plan. */
export const TRAINING = { hour: 7, minute: 0 };
export const TRAINING_CUTOFF = { hour: 12, minute: 0 };

/** Today's local date from 7am until noon, allowing a safe catch-up after worker downtime. */
export function trainingDue(timezone: string, now: DateTime = DateTime.now()): string | null {
  const local = now.setZone(timezone);
  const minutesNow = local.hour * 60 + local.minute;
  const target = TRAINING.hour * 60 + TRAINING.minute;
  const cutoff = TRAINING_CUTOFF.hour * 60 + TRAINING_CUTOFF.minute;
  if (minutesNow >= target && minutesNow < cutoff) {
    return local.toFormat("yyyy-LL-dd");
  }
  return null;
}

/** The daily "anything on your mind?" braindump nudge — its replies become todos. */
export const BRAINDUMP = { hour: 18, minute: 0 };

export const BRAINDUMP_PROMPT =
  "anything on your mind? jot down whatever you want to remember or get done — " +
  "one per line — and i'll save them to your todos.";

/** Today's local date if the braindump is due within the grace window, else null. */
export function braindumpDue(timezone: string, now: DateTime = DateTime.now()): string | null {
  const local = now.setZone(timezone);
  const minutesNow = local.hour * 60 + local.minute;
  const target = BRAINDUMP.hour * 60 + BRAINDUMP.minute;
  if (minutesNow >= target && minutesNow < target + GRACE_MINUTES) {
    return local.toFormat("yyyy-LL-dd");
  }
  return null;
}
