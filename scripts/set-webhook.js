// Реєструє webhook воркера в Telegram і меню команд.
//   npm run webhook:set   (бере BOT_TOKEN, WEBHOOK_SECRET, WORKER_URL з .env.production)

import { COMMANDS } from "../src/bot/commands.js";

const { BOT_TOKEN, WEBHOOK_SECRET, WORKER_URL } = process.env;
if (!BOT_TOKEN || !WEBHOOK_SECRET || !WORKER_URL) {
  console.error("Потрібні BOT_TOKEN, WEBHOOK_SECRET і WORKER_URL (див. .env.production.example)");
  process.exit(1);
}

async function call(method, body = {}) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method}: ${data.description}`);
  return data.result;
}

const url = new URL("/telegram", WORKER_URL).href;
await call("setWebhook", {
  url,
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ["message", "callback_query"],
  drop_pending_updates: true,
});
await call("setMyCommands", { commands: COMMANDS });

const info = await call("getWebhookInfo");
console.log(`Webhook: ${info.url}`);
console.log(`Очікує апдейтів: ${info.pending_update_count}${info.last_error_message ? ` · остання помилка: ${info.last_error_message}` : ""}`);
