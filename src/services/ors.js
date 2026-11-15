// OpenRouteService: геокодинг (Pelias) і матриця відстаней для авто.
// Free: geocode 1000/добу (100/хв), matrix 500/добу, до 3500 елементів на запит.

import { CITY } from "../config.js";
import { normalizeHouse } from "../domain/address.js";
import { fetchJson } from "./http.js";

const ORS_URL = "https://api.openrouteservice.org";
export const ORS_MATRIX_MAX_POINTS = 59;

/** @returns {Promise<{lat, lon, precision: 'house'|'street', source: 'ors', label}|null>} */
export async function orsGeocode(apiKey, address) {
  const url = new URL(`${ORS_URL}/geocode/search/structured`);
  url.search = new URLSearchParams({
    api_key: apiKey,
    address: [address.streetType && address.streetType !== "вулиця" ? address.streetType : "", address.street, address.house ?? ""]
      .filter(Boolean)
      .join(" "),
    locality: CITY.name,
    region: CITY.region,
    country: "UA",
    "boundary.circle.lat": String(CITY.center.lat),
    "boundary.circle.lon": String(CITY.center.lon),
    "boundary.circle.radius": String(CITY.radiusKm),
    layers: "address,street",
    size: "1",
  }).toString();

  const data = await fetchJson(url, { headers: { Accept: "application/json" } });
  const feature = data.features?.[0];
  if (!feature) return null;
  const [lon, lat] = feature.geometry.coordinates;
  const p = feature.properties ?? {};
  const exactHouse = address.house && p.housenumber && normalizeHouse(p.housenumber) === address.house;
  return { lat, lon, precision: exactHouse ? "house" : "street", source: "ors", label: p.label ?? null };
}

/**
 * @param {{lat:number, lon:number}[]} points
 * @returns {Promise<{dist:(number|null)[][], dur:(number|null)[][]}>} метри / секунди
 */
export async function orsMatrix(apiKey, points) {
  const data = await fetchJson(
    `${ORS_URL}/v2/matrix/driving-car`,
    {
      method: "POST",
      headers: { Authorization: apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        locations: points.map((p) => [p.lon, p.lat]),
        metrics: ["distance", "duration"],
        units: "m",
      }),
    },
    10_000,
  );
  if (!Array.isArray(data.distances) || !Array.isArray(data.durations)) throw new Error("ORS matrix: неочікувана відповідь");
  return { dist: data.distances, dur: data.durations };
}
