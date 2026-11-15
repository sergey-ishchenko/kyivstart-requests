import * as tickets from "../../db/tickets.js";
import { kyivDayStartSqlUtc } from "../../lib/time.js";
import { editView, matchId, replyView } from "../helpers.js";
import { mainMenu } from "../keyboards.js";
import { BTN, T } from "../texts.js";
import { doneListView, openListView, ticketCard } from "../views.js";

export async function sendNext(ctx) {
  const t = await tickets.nextOpen(ctx.db, ctx.user.id);
  if (t) return replyView(ctx, ticketCard(t));
  const doneToday = await tickets.countDoneSince(ctx.db, ctx.user.id, kyivDayStartSqlUtc());
  return ctx.reply(doneToday ? T.allDone(doneToday) : T.noOpen, { reply_markup: mainMenu() });
}

async function showOpenList(ctx) {
  const [open, doneToday] = await Promise.all([
    tickets.listOpen(ctx.db, ctx.user.id),
    tickets.countDoneSince(ctx.db, ctx.user.id, kyivDayStartSqlUtc()),
  ]);
  await replyView(ctx, openListView(open, doneToday));
}

async function showDoneList(ctx) {
  await replyView(ctx, doneListView(await tickets.listDoneSince(ctx.db, ctx.user.id, kyivDayStartSqlUtc())));
}

/** Обгортка для кнопок з id заявки: перевіряє власника. */
const withTicket = (handler) => async (ctx) => {
  const t = await tickets.getTicket(ctx.db, ctx.user.id, matchId(ctx));
  if (!t) return ctx.answerCallbackQuery(T.ticketMissing);
  return handler(ctx, t);
};

export function registerTickets(bot) {
  bot.command("next", sendNext);
  bot.hears(BTN.next, sendNext);
  bot.callbackQuery("next", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendNext(ctx);
  });

  bot.command("list", showOpenList);
  bot.hears(BTN.list, showOpenList);
  bot.callbackQuery("list", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showOpenList(ctx);
  });

  bot.command("done", showDoneList);
  bot.hears(BTN.done, showDoneList);

  bot.callbackQuery(
    /^card:(\d+)$/,
    withTicket(async (ctx, t) => {
      await ctx.answerCallbackQuery();
      await replyView(ctx, ticketCard(t));
    }),
  );

  bot.callbackQuery(
    /^done:(\d+)$/,
    withTicket(async (ctx, t) => {
      await tickets.markDone(ctx.db, ctx.user.id, t.id);
      await ctx.answerCallbackQuery(T.markedDone);
      await editView(ctx, ticketCard(await tickets.getTicket(ctx.db, ctx.user.id, t.id)));
      if (t.status === "open") await sendNext(ctx);
    }),
  );

  bot.callbackQuery(
    /^undo:(\d+)$/,
    withTicket(async (ctx, t) => {
      await tickets.reopen(ctx.db, ctx.user.id, t.id);
      await ctx.answerCallbackQuery(T.reopened);
      await editView(ctx, ticketCard(await tickets.getTicket(ctx.db, ctx.user.id, t.id)));
    }),
  );

  bot.callbackQuery(
    /^skip:(\d+)$/,
    withTicket(async (ctx, t) => {
      if (t.status !== "open") return ctx.answerCallbackQuery();
      await tickets.moveToEnd(ctx.db, ctx.user.id, t.id);
      await ctx.answerCallbackQuery(T.postponed);
      await editView(ctx, ticketCard(t, { note: T.postponedNote }));
      await sendNext(ctx);
    }),
  );
}
