import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  // IANA timezone used for slot scheduling + daily dedupe, e.g. "Asia/Kolkata".
  USER_TIMEZONE: z.string().default("UTC"),
  // Optional. Usually captured automatically when you message the bot /start.
  OWNER_TELEGRAM_CHAT_ID: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
