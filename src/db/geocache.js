import { GEOCODE_NEGATIVE_TTL_DAYS } from "../config.js";

const MAX_PARAMS = 90; // D1: ≤100 параметрів на запит

const GEO_STATUS = { house: "found", street: "approx", none: "not_found" };

/** precision кешу → geo_status заявки */
export function geoStatusOf(precision) {
  return GEO_STATUS[precision] ?? "not_found";
}

/** @returns {Promise<Map<string, {lat, lon, precision, source}>>} «не знайдено» старше TTL вважається відсутнім */
export async function getCached(db, keys) {
  const map = new Map();
  for (let i = 0; i < keys.length; i += MAX_PARAMS) {
    const part = keys.slice(i, i + MAX_PARAMS);
    const { results } = await db
      .prepare(
        `SELECT * FROM geocache WHERE address_key IN (${part.map(() => "?").join(",")})
         AND (precision != 'none' OR updated_at > datetime('now', ?))`,
      )
      .bind(...part, `-${GEOCODE_NEGATIVE_TTL_DAYS} days`)
      .all();
    for (const row of results) map.set(row.address_key, row);
  }
  return map;
}

/** Результат геокодера; ручну точку майстра автоматичний результат не перезаписує. */
export function saveAutoStatement(db, key, geo) {
  return db
    .prepare(
      `INSERT INTO geocache (address_key, lat, lon, precision, source, label) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (address_key) DO UPDATE SET
         lat = excluded.lat, lon = excluded.lon, precision = excluded.precision,
         source = excluded.source, label = excluded.label, updated_at = datetime('now')
       WHERE geocache.source != 'manual'`,
    )
    .bind(key, geo.lat, geo.lon, geo.precision, geo.source, geo.label ?? null);
}

export function saveManualStatement(db, key, { lat, lon }) {
  return db
    .prepare(
      `INSERT INTO geocache (address_key, lat, lon, precision, source) VALUES (?, ?, ?, 'house', 'manual')
       ON CONFLICT (address_key) DO UPDATE SET
         lat = excluded.lat, lon = excluded.lon, precision = 'house', source = 'manual', label = NULL,
         updated_at = datetime('now')`,
    )
    .bind(key, lat, lon);
}
