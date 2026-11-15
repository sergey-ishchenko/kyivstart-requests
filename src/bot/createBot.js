import { Bot } from "grammy";
import { access } from "./access.js";
import { registerAdmin } from "./handlers/admin.js";
import { registerCommon, registerText } from "./handlers/common.js";
import { registerLocation } from "./handlers/location.js";
import { registerReport } from "./handlers/report.js";
import { registerRoute } from "./handlers/route.js";
import { registerSettings } from "./handlers/settings.js";
import { registerTickets } from "./handlers/tickets.js";
import { T } from "./texts.js";

/**
 * @param {object} env bindings воркера (DB, BOT_TOKEN, ADMIN_IDS, ORS_API_KEY…)
 * @param {{ botInfo?: object, waitUntil?: (p: Promise<unknown>) => void }} [opts]
 */
export function createBot(env, { botInfo, waitUntil = () => {} } = {}) {
  const bot = new Bot(env.BOT_TOKEN, botInfo ? { botInfo } : undefined);

  bot.use((ctx, next) => {
    ctx.env = env;
    ctx.db = env.DB;
    ctx.waitUntil = waitUntil;
    return next();
  });
  bot.use(access);

  // порядок важливий: команди й кнопки меню — до загального обробника тексту
  registerCommon(bot);
  registerAdmin(bot);
  registerTickets(bot);
  registerRoute(bot);
  registerReport(bot);
  registerSettings(bot);
  registerLocation(bot);
  registerText(bot);
  bot.on("callback_query:data", (ctx) => ctx.answerCallbackQuery());

  bot.catch(async (err) => {
    console.error(`update ${err.ctx.update.update_id} failed:`, err.error);
    await err.ctx.reply(T.error).catch(() => {});
  });
  return bot;
}
