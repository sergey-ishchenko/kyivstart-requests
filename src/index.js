import { Api } from "grammy";
import { createBot } from "./bot/createBot.js";
import { CLEANUP_CRON } from "./config.js";
import { cleanup } from "./jobs/cleanup.js";
import { processGeocodeQueue } from "./jobs/geocodeQueue.js";

// getMe один раз на ізолят, а не на кожен апдейт
let botInfoCache = null;
async function getBotInfo(env) {
  if (env.BOT_INFO) return JSON.parse(env.BOT_INFO);
  botInfoCache ??= await new Api(env.BOT_TOKEN).getMe();
  return botInfoCache;
}

function secretMatches(given, expected) {
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === "/telegram" && request.method === "POST") {
      if (!secretMatches(request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "", env.WEBHOOK_SECRET ?? "")) {
        return new Response("Forbidden", { status: 403 });
      }
      const update = await request.json();
      const bot = createBot(env, { botInfo: await getBotInfo(env), waitUntil: (p) => ctx.waitUntil(p) });
      try {
        await bot.handleUpdate(update);
      } catch (err) {
        // 200 навіть при помилці, інакше Telegram повторюватиме апдейт
        console.error("update failed", err);
      }
      return new Response("ok");
    }

    if (pathname === "/" && request.method === "GET") return new Response("kyivstar-bot ok");
    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    if (event.cron === CLEANUP_CRON) {
      ctx.waitUntil(cleanup(env));
      return;
    }
    ctx.waitUntil(processGeocodeQueue(env, { api: new Api(env.BOT_TOKEN) }));
  },
};
