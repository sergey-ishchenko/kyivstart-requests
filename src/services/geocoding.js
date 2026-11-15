import { CITY } from "../config.js";
import { haversineM } from "../domain/geo.js";
import { nominatimGeocode } from "./nominatim.js";
import { orsGeocode } from "./ors.js";

export function isInCity(point) {
  return haversineM(point, CITY.center) <= CITY.radiusKm * 1000;
}

/**
 * Ланцюжок геокодерів: ORS → Nominatim. Точний збіг будинку повертається одразу,
 * інакше — перший результат рівня вулиці.
 * Кидає помилку, якщо жоден провайдер не відповів (щоб спробувати пізніше, а не кешувати «не знайдено»).
 *
 * @param {{ ORS_API_KEY?: string }} env
 * @param {ReturnType<import("../domain/address.js").parseAddress>} address
 * @returns {Promise<{lat:number|null, lon:number|null, precision:'house'|'street'|'none', source:string, label:string|null}>}
 */
export async function geocodeAddress(env, address) {
  const providers = [];
  if (env.ORS_API_KEY) providers.push(["ors", () => orsGeocode(env.ORS_API_KEY, address)]);
  providers.push(["nominatim", () => nominatimGeocode(address)]);

  let fallback = null;
  let answered = 0;
  for (const [name, run] of providers) {
    try {
      const r = await run();
      answered++;
      if (!r || !isInCity(r)) continue;
      if (r.precision === "house") return r;
      fallback ??= r;
    } catch (err) {
      console.warn(`geocoder ${name} failed for "${address.key}": ${err.message}`);
    }
  }
  if (fallback) return fallback;
  if (answered === 0) throw new Error(`усі геокодери недоступні для "${address.key}"`);
  return { lat: null, lon: null, precision: "none", source: "none", label: null };
}
