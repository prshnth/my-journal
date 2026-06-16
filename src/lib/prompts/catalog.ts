import type { Slot } from "./types";

export interface SeedPrompt {
  slot: Slot;
  text: string;
  tags: string[];
}

/**
 * The starting set of check-in messages, in a casual "friend texting you" tone.
 * Seeded into the `prompts` table; edit freely there or here + re-seed.
 */
export const PROMPT_CATALOG: SeedPrompt[] = [
  // --- morning: sleep, rest, intention ---
  { slot: "morning", text: "morning! how'd you sleep?", tags: ["sleep"] },
  { slot: "morning", text: "hey, you up — how rested are you feeling?", tags: ["sleep", "energy"] },
  { slot: "morning", text: "good morning. what's the first thing on your mind today?", tags: ["mood"] },
  { slot: "morning", text: "morning! anything you're looking forward to today?", tags: ["mood"] },
  { slot: "morning", text: "hey. how's the energy this morning, honestly?", tags: ["energy"] },
  { slot: "morning", text: "did you get a good night's sleep?", tags: ["sleep"] },

  // --- midday: movement, activity, a quick pulse check ---
  { slot: "midday", text: "hey — did you move at all today? run, walk, gym, anything?", tags: ["run"] },
  { slot: "midday", text: "quick check-in: how's the day going so far?", tags: ["mood"] },
  { slot: "midday", text: "did you run today?", tags: ["run"] },
  { slot: "midday", text: "what've you been up to this afternoon?", tags: [] },
  { slot: "midday", text: "how are you feeling right now — meh, fine, or great?", tags: ["mood"] },
  { slot: "midday", text: "taken any breaks today? how's the head?", tags: ["mood"] },

  // --- evening: recap, mood, gratitude ---
  { slot: "evening", text: "how was your day?", tags: ["mood"] },
  { slot: "evening", text: "hey, what was the best part of today?", tags: ["mood"] },
  { slot: "evening", text: "anything weighing on you tonight?", tags: ["mood"] },
  { slot: "evening", text: "did today go the way you wanted?", tags: ["mood"] },
  { slot: "evening", text: "one word for how today felt?", tags: ["mood"] },
  { slot: "evening", text: "what are you grateful for today, if anything?", tags: ["mood"] },
];
