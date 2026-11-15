import { InlineKeyboard } from "grammy";
import { getCached, geoStatusOf } from "../../db/geocache.js";
import * as tickets from "../../db/tickets.js";
import { parseTickets } from "../../domain/parser.js";
import { processGeocodeQueue } from "../../jobs/geocodeQueue.js";
import { kyivNow } from "../../lib/time.js";
import { sendGeoReport } from "../geoReport.js";
import { HTML } from "../helpers.js";
import { L, T } from "../texts.js";

function geoForUpload(ticket, cache) {
  if (!ticket.address.key) return { lat: null, lon: null, status: "not_found" };
  const hit = cache.get(ticket.address.key);
  if (!hit) return { lat: null, lon: null, status: "pending" };
  return { lat: hit.lat, lon: hit.lon, status: geoStatusOf(hit.precision) };
}

/**
 * Список заявок із повідомлення → БД. Координати з кешу, решта — у фоновий геокодинг.
 * @returns {Promise<boolean>} false — у тексті немає нічого схожого на заявки
 */
export async function handleUpload(ctx, text) {
  const { tickets: parsed, rejected } = parseTickets(text);
  if (!parsed.length) {
    if (!rejected.length) return false;
    await ctx.reply(T.uploadNothing(rejected), HTML);
    return true;
  }

  const { db } = ctx;
  const userId = ctx.user.id;
  const keys = [...new Set(parsed.map((t) => t.address.key).filter(Boolean))];
  const [cache, existing] = await Promise.all([
    getCached(db, keys),
    tickets.existingNumbers(db, userId, parsed.map((t) => t.number)),
  ]);
  const rows = parsed.map((t) => ({ ...t, geo: geoForUpload(t, cache) }));
  await tickets.upsertTickets(db, userId, rows, kyivNow().date);

  const added = parsed.filter((t) => !existing.has(t.number)).length;
  if (added) await tickets.resetRoute(db, userId);
  const pending = rows.filter((r) => r.geo.status === "pending").length;

  await ctx.reply(
    T.uploadSummary({
      total: parsed.length,
      added,
      updated: parsed.length - added,
      high: parsed.filter((t) => t.priority === 1).length,
      low: parsed.filter((t) => t.priority !== 1).length,
      pending,
      rejected,
    }),
    { ...HTML, reply_markup: new InlineKeyboard().text(L.buildRoute, "route").text(L.openList, "list") },
  );

  if (pending) {
    ctx.waitUntil(processGeocodeQueue(ctx.env, { api: ctx.api }).catch((err) => console.error("geocode queue failed", err)));
  } else if (rows.some((r) => r.geo.status !== "found")) {
    await sendGeoReport(ctx.api, db, userId);
  }
  return true;
}
