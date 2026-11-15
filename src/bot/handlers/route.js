import { clearState, setState, STATE } from "../../db/state.js";
import * as tickets from "../../db/tickets.js";
import { planRoute } from "../../domain/optimizer.js";
import { departure, formatHM, kyivNow, parseHM } from "../../lib/time.js";
import { getMatrix } from "../../services/routing.js";
import { HTML, replyView } from "../helpers.js";
import { mainMenu, routeStartMenu } from "../keyboards.js";
import { BTN, T } from "../texts.js";
import { routeView } from "../views.js";

const homeOf = (user) => (user.home_lat != null ? { lat: user.home_lat, lon: user.home_lon } : null);

async function askStart(ctx) {
  if (ctx.callbackQuery) await ctx.answerCallbackQuery();
  const open = await tickets.listOpen(ctx.db, ctx.user.id);
  if (!open.length) return ctx.reply(T.noOpen, { reply_markup: mainMenu() });
  const hasHome = homeOf(ctx.user) != null;
  await setState(ctx.db, ctx.user.id, STATE.routeStart);
  await ctx.reply(T.routeAskStart(hasHome), { ...HTML, reply_markup: routeStartMenu(hasHome) });
}

/** Будує порядок об'їзду відкритих заявок від точки start і зберігає його. */
export async function buildRoute(ctx, start, startLabel) {
  const { db } = ctx;
  const userId = ctx.user.id;
  await clearState(db, userId);

  const open = await tickets.listOpen(db, userId);
  const located = open.filter((t) => t.lat != null);
  const unlocated = open.filter((t) => t.lat == null);
  if (!open.length) return ctx.reply(T.noOpen, { reply_markup: mainMenu() });
  if (!located.length) return ctx.reply(T.routeNoLocated, { reply_markup: mainMenu() });

  await ctx.reply(T.routeBuilding(located.length), { reply_markup: mainMenu() });

  const { matrix, source } = await getMatrix(ctx.env, [start, ...located]);
  const dep = departure(kyivNow().minutes, ctx.settings);
  const plan = planRoute({
    start,
    stops: located.map((t) => ({ id: t.id, priority: t.priority, lat: t.lat, lon: t.lon, visitMin: parseHM(t.visit_time) })),
    departMin: dep.minutes,
    matrix,
    options: {
      serviceMin: ctx.settings.serviceMin,
      nearbyRadiusM: ctx.settings.nearbyRadiusM,
      timeSlackMin: ctx.settings.timeSlackMin,
    },
  });

  await tickets.saveRoute(db, userId, [
    ...plan.legs.map((leg, i) => ({ id: leg.id, pos: i + 1, eta: formatHM(leg.etaMin) })),
    ...unlocated.map((t, i) => ({ id: t.id, pos: plan.legs.length + i + 1, eta: null })),
  ]);

  await replyView(ctx, routeView({ plan, byId: new Map(open.map((t) => [t.id, t])), unlocated, start, startLabel, dep, source }));
}

export function registerRoute(bot) {
  bot.command("route", askStart);
  bot.hears(BTN.route, askStart);
  bot.callbackQuery("route", askStart);

  bot.hears(BTN.fromHome, async (ctx) => {
    const home = homeOf(ctx.user);
    if (!home) return ctx.reply(T.noHome, { reply_markup: mainMenu() });
    await buildRoute(ctx, home, T.startHome);
  });
}
