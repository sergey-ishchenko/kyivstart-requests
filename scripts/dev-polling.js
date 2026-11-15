// Локальний запуск бота через long polling: локальна D1 і змінні з .dev.vars, без тунелів і webhook.
// Використовуйте ТЕСТОВОГО бота: polling видаляє webhook у бота, з яким працює.
//   npm run db:migrate:local && npm run dev:poll

import { getPlatformProxy } from "wrangler";
import { createBot } from "../src/bot/createBot.js";
import { COMMANDS } from "../src/bot/commands.js";
import { processGeocodeQueue } from "../src/jobs/geocodeQueue.js";

const { env, dispose } = await getPlatformProxy();
if (!env.BOT_TOKEN || env.BOT_TOKEN.startsWith("123456:")) {
  console.error("Заповніть BOT_TOKEN у .dev.vars (див. .dev.vars.example)");
  process.exit(1);
}

const bot = createBot(env, { waitUntil: (p) => p.catch((err) => console.error("background task failed", err)) });
await bot.api.setMyCommands(COMMANDS);

// замість Cron: черга геокодингу щохвилини
const timer = setInterval(() => {
  processGeocodeQueue(env, { api: bot.api }).catch((err) => console.error("geocode queue failed", err));
}, 60_000);

const stop = async () => {
  clearInterval(timer);
  await bot.stop();
  await dispose();
  process.exit(0);
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await bot.start({
  drop_pending_updates: true,
  onStart: (me) => console.log(`@${me.username} запущено (long polling). Ctrl+C — зупинити.`),
});
