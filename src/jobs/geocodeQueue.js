import { GEOCODE_BATCH } from "../config.js";
import * as geocache from "../db/geocache.js";
import * as tickets from "../db/tickets.js";
import { parseAddress } from "../domain/address.js";
import { geocodeAddress } from "../services/geocoding.js";
import { sendGeoReport } from "../bot/geoReport.js";

/**
 * Обробляє партію адрес, що чекають координат (спільно для всіх майстрів).
 * Викликається одразу після завантаження (waitUntil) і щохвилини з Cron.
 * @param {{ api?: import("grammy").Api, limit?: number }} [opts] api — щоб повідомити майстрів про результат
 */
export async function processGeocodeQueue(env, { api, limit = GEOCODE_BATCH } = {}) {
  const db = env.DB;
  const pending = await tickets.pendingAddresses(db, limit);
  if (!pending.length) return { processed: 0 };

  const statements = [];
  const keys = [];
  for (const row of pending) {
    let geo;
    try {
      geo = await geocodeAddress(env, parseAddress(row.address_raw));
    } catch (err) {
      // геокодери недоступні — решту партії спробуємо з наступним Cron
      console.warn(`geocode queue: ${err.message}`);
      break;
    }
    statements.push(
      geocache.saveAutoStatement(db, row.address_key, geo),
      tickets.applyGeoStatement(db, row.address_key, { lat: geo.lat, lon: geo.lon, status: geocache.geoStatusOf(geo.precision) }),
    );
    keys.push(row.address_key);
  }
  if (statements.length) await db.batch(statements);

  if (api && keys.length) {
    for (const userId of await tickets.usersWithFinishedGeocoding(db, keys)) {
      await sendGeoReport(api, db, userId).catch((err) => console.warn(`geo report to ${userId}: ${err.message}`));
    }
  }
  return { processed: keys.length };
}
