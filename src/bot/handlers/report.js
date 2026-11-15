import { MAX_REPORT_TEXT } from "../../config.js";
import { clearState, setState, STATE } from "../../db/state.js";
import { getTemplate, listTemplates } from "../../db/templates.js";
import * as tickets from "../../db/tickets.js";
import { HTML, editView, matchId, replyView } from "../helpers.js";
import { mainMenu } from "../keyboards.js";
import { T } from "../texts.js";
import { reportPicker, reportResult, reportText } from "../views.js";
import { sendNext } from "./tickets.js";

/** Текст від майстра, коли бот чекає «свій текст» звіту. */
export async function handleReportText(ctx, state, text) {
  const body = text.trim().replace(/\s+/g, " ").slice(0, MAX_REPORT_TEXT);
  if (!body) return ctx.reply(T.reportEmpty);
  const t = await tickets.getTicket(ctx.db, ctx.user.id, state.payload.ticketId);
  await clearState(ctx.db, ctx.user.id);
  if (!t) return ctx.reply(T.ticketMissing, { reply_markup: mainMenu() });
  const updated = await tickets.setReport(ctx.db, ctx.user.id, t.id, reportText(t.number, body));
  await replyView(ctx, reportResult(updated));
}

export function registerReport(bot) {
  bot.callbackQuery(/^rep:(\d+)$/, async (ctx) => {
    const t = await tickets.getTicket(ctx.db, ctx.user.id, matchId(ctx));
    if (!t) return ctx.answerCallbackQuery(T.ticketMissing);
    await ctx.answerCallbackQuery();
    await replyView(ctx, reportPicker(t, await listTemplates(ctx.db, ctx.user.id)));
  });

  bot.callbackQuery(/^rpt:(\d+):(\d+)$/, async (ctx) => {
    const [t, tpl] = await Promise.all([
      tickets.getTicket(ctx.db, ctx.user.id, matchId(ctx, 1)),
      getTemplate(ctx.db, ctx.user.id, matchId(ctx, 2)),
    ]);
    if (!t) return ctx.answerCallbackQuery(T.ticketMissing);
    if (!tpl) return ctx.answerCallbackQuery(T.templateMissing);
    await ctx.answerCallbackQuery();
    const updated = await tickets.setReport(ctx.db, ctx.user.id, t.id, reportText(t.number, tpl.text));
    await editView(ctx, reportResult(updated));
  });

  bot.callbackQuery(/^rpc:(\d+)$/, async (ctx) => {
    const t = await tickets.getTicket(ctx.db, ctx.user.id, matchId(ctx));
    if (!t) return ctx.answerCallbackQuery(T.ticketMissing);
    await ctx.answerCallbackQuery();
    await setState(ctx.db, ctx.user.id, STATE.reportText, { ticketId: t.id });
    await ctx.reply(T.reportAskText(t.number), HTML);
  });

  // «Виконано» з повідомлення звіту: прибираємо кнопку і даємо наступну заявку
  bot.callbackQuery(/^rdone:(\d+)$/, async (ctx) => {
    const t = await tickets.getTicket(ctx.db, ctx.user.id, matchId(ctx));
    if (!t) return ctx.answerCallbackQuery(T.ticketMissing);
    await tickets.markDone(ctx.db, ctx.user.id, t.id);
    await ctx.answerCallbackQuery(T.markedDone);
    await editView(ctx, reportResult(await tickets.getTicket(ctx.db, ctx.user.id, t.id)));
    if (t.status === "open") await sendNext(ctx);
  });
}
