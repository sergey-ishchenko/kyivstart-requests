import { InlineKeyboard } from "grammy";
import { CITY } from "../../config.js";
import { saveManualStatement } from "../../db/geocache.js";
import { clearState, getState, setState, STATE } from "../../db/state.js";
import * as tickets from "../../db/tickets.js";
import { setHome } from "../../db/users.js";
import { haversineM } from "../../domain/geo.js";
import { isInCity } from "../../services/geocoding.js";
import { HTML, matchId } from "../helpers.js";
import { locationMenu, mainMenu } from "../keyboards.js";
import { BTN, L, T } from "../texts.js";
import { buildRoute } from "./route.js";

export async function saveHome(ctx, point) {
  await setHome(ctx.db, ctx.user.id, point);
  await clearState(ctx.db, ctx.user.id);
  await ctx.reply(T.homeSaved, { reply_markup: mainMenu() });
}

async function savePin(ctx, ticketId, point) {
  const t = await tickets.getTicket(ctx.db, ctx.user.id, ticketId);
  if (!t) {
    await clearState(ctx.db, ctx.user.id);
    return ctx.reply(T.ticketMissing, { reply_markup: mainMenu() });
  }
  if (!isInCity(point)) {
    return ctx.reply(T.pinTooFar(Math.round(haversineM(point, CITY.center) / 1000)), HTML);
  }
  const statements = [tickets.applyManualPointStatement(ctx.db, t, point)];
  if (t.address_key) statements.unshift(saveManualStatement(ctx.db, t.address_key, point));
  await ctx.db.batch(statements);
  await clearState(ctx.db, ctx.user.id);
  await ctx.reply(T.pinSaved(t), { ...HTML, reply_markup: mainMenu() });
}

export function registerLocation(bot) {
  bot.callbackQuery(/^pin:(\d+)$/, async (ctx) => {
    const t = await tickets.getTicket(ctx.db, ctx.user.id, matchId(ctx));
    if (!t) return ctx.answerCallbackQuery(T.ticketMissing);
    await ctx.answerCallbackQuery();
    await setState(ctx.db, ctx.user.id, STATE.pin, { ticketId: t.id });
    await ctx.reply(T.pinAsk(t), { ...HTML, reply_markup: locationMenu(BTN.hereLocation) });
  });

  bot.on("message:location", async (ctx) => {
    const point = { lat: ctx.msg.location.latitude, lon: ctx.msg.location.longitude };
    const state = await getState(ctx.db, ctx.user.id);
    switch (state?.action) {
      case STATE.routeStart:
        return buildRoute(ctx, point, T.startHere);
      case STATE.home:
        return saveHome(ctx, point);
      case STATE.pin:
        return savePin(ctx, state.payload.ticketId, point);
      default:
        await setState(ctx.db, ctx.user.id, STATE.lastLocation, point);
        return ctx.reply(T.locationWhat, {
          reply_markup: new InlineKeyboard().text(L.routeHere, "loc:route").text(L.saveHome, "loc:home"),
        });
    }
  });

  bot.callbackQuery(/^loc:(route|home)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = await getState(ctx.db, ctx.user.id);
    if (state?.action !== STATE.lastLocation) return ctx.reply(T.locationExpired);
    const point = { lat: state.payload.lat, lon: state.payload.lon };
    if (ctx.match[1] === "route") return buildRoute(ctx, point, T.startHere);
    return saveHome(ctx, point);
  });
}
