import { and, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { prompts } from "../db/schema";
import type { CheckInPrompt, PromptContext, PromptProvider } from "./types";

/**
 * Picks the least-recently-used active prompt for the slot (random tiebreak),
 * then stamps it as used so the rotation keeps moving and avoids repeats.
 */
export class RotatingPromptProvider implements PromptProvider {
  async getNextCheckIn(ctx: PromptContext): Promise<CheckInPrompt> {
    const [picked] = await db
      .select()
      .from(prompts)
      .where(and(eq(prompts.slot, ctx.slot), eq(prompts.active, true)))
      .orderBy(sql`${prompts.lastUsedAt} asc nulls first`, sql`random()`)
      .limit(1);

    if (!picked) {
      // Never let an empty catalog block a check-in.
      return { text: "hey — what's on your mind right now?", source: "rotating" };
    }

    await db
      .update(prompts)
      .set({ lastUsedAt: new Date() })
      .where(eq(prompts.id, picked.id));

    return { text: picked.text, source: "rotating", promptId: picked.id };
  }
}
