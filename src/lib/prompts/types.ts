export type Slot = "morning" | "midday" | "evening";

export const SLOTS: Slot[] = ["morning", "midday", "evening"];

/** A check-in message selected for delivery. */
export interface CheckInPrompt {
  text: string;
  source: "rotating" | "ai";
  /** Present when the text came from the curated catalog (rotating provider). */
  promptId?: number;
}

export interface PromptContext {
  userId: number;
  slot: Slot;
  /** YYYY-MM-DD in the user's timezone. */
  localDate: string;
}

/**
 * Strategy for producing the next check-in message.
 *
 * v1: RotatingPromptProvider (curated catalog).
 * v2: an AI provider implements this same interface — the scheduler calls it
 *     identically, so swapping in Claude requires no changes upstream.
 */
export interface PromptProvider {
  getNextCheckIn(ctx: PromptContext): Promise<CheckInPrompt>;
}
