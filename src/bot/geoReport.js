import * as tickets from "../db/tickets.js";
import { HTML } from "./helpers.js";
import { geoReportView } from "./views.js";

/** Підсумок пошуку адрес майстру (коли для нього нічого не чекає геокодингу). */
export async function sendGeoReport(api, db, userId) {
  const open = await tickets.listOpen(db, userId);
  if (!open.length || open.some((t) => t.geo_status === "pending")) return;
  const view = geoReportView(open);
  await api.sendMessage(userId, view.text, { ...HTML, reply_markup: view.reply_markup });
}
