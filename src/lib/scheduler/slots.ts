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
