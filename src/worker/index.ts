import "dotenv/config";
import cron from "node-cron";
import { createBot } from "../lib/telegram/bot";
import { runTick } from "../lib/scheduler/tick";
import { seedPromptsIfEmpty } from "../lib/repo";

async function main() {
  const seeded = await seedPromptsIfEmpty();
  if (seeded) console.log(`[worker] seeded ${seeded} prompts`);

  const bot = createBot();

  // Evaluate due slots once a minute; the per-day unique index keeps it to one nudge per slot.
  cron.schedule("* * * * *", () => {
    runTick().catch((err) => console.error("[worker] tick error:", err));
  });
  console.log("[worker] scheduler running (evaluates slots every minute)");

  bot
    .start({
      onStart: (info) => console.log(`[worker] bot @${info.username} polling for replies`),
    })
    .catch((err) => console.error("[worker] bot stopped:", err));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
