import { clearState, getState, STATE } from "../../db/state.js";
import { parseTickets } from "../../domain/parser.js";
import { HTML } from "../helpers.js";
import { mainMenu } from "../keyboards.js";
import { BTN, T } from "../texts.js";
import { handleReportText } from "./report.js";
import { handleTemplateText } from "./settings.js";
import { handleUpload } from "./upload.js";

export function registerCommon(bot) {
  bot.command("start", (ctx) => ctx.reply(T.welcome(ctx.from.first_name), { ...HTML, reply_markup: mainMenu() }));
  bot.command("help", (ctx) => ctx.reply(T.help, { ...HTML, reply_markup: mainMenu() }));

  const cancel = async (ctx) => {
    await clearState(ctx.db, ctx.user.id);
    await ctx.reply(T.cancelled, { reply_markup: mainMenu() });
  };
  bot.command("cancel", cancel);
  bot.hears(BTN.back, cancel);
}

/** Останній обробник тексту: очікуваний ввід → список заявок → підказка. */
export function registerText(bot) {
  bot.on(["message:text", "message:caption"], async (ctx) => {
    const text = ctx.msg.text ?? ctx.msg.caption ?? "";
    // список заявок має пріоритет над очікуваним вводом
    if (!parseTickets(text).tickets.length) {
      const state = await getState(ctx.db, ctx.user.id);
      if (state?.action === STATE.reportText) return handleReportText(ctx, state, text);
      if (state?.action === STATE.template) return handleTemplateText(ctx, text);
    }
    if (await handleUpload(ctx, text)) return;
    await ctx.reply(T.notUnderstood, { ...HTML, reply_markup: mainMenu() });
  });
}
