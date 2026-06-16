import { Api } from "grammy";
import { env } from "../env";

// A standalone Api client for outbound sends (decoupled from the polling Bot instance),
// so the scheduler can message the user without going through update handling.
let api: Api | undefined;

function getApi(): Api {
  if (!api) api = new Api(env.TELEGRAM_BOT_TOKEN);
  return api;
}

export async function sendMessage(chatId: string, text: string): Promise<number | undefined> {
  const message = await getApi().sendMessage(chatId, text);
  return message.message_id;
}
