// Nominatim (OpenStreetMap) — резервний геокодер. Політика: ≤1 запит/с, змістовний User-Agent.

import { CITY } from "../config.js";
import { normalizeHouse } from "../domain/address.js";
import { fetchJson } from "./http.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT = "kyivstar-shostka-bot/0.1 (route planner for field technicians)";
const MIN_INTERVAL_MS = 1100;

let nextAllowedAt = 0;

async function throttle() {
  const wait = nextAllowedAt - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  nextAllowedAt = Date.now() + MIN_INTERVAL_MS;
}

/** @returns {Promise<{lat, lon, precision: 'house'|'street', source: 'nominatim', label}|null>} */
export async function nominatimGeocode(address) {
  const dLat = CITY.radiusKm / 111;
  const dLon = CITY.radiusKm / (111 * Math.cos((CITY.center.lat * Math.PI) / 180));
  const street = [address.house, address.streetType && address.streetType !== "вулиця" ? address.streetType : "", address.street]
    .filter(Boolean)
    .join(" ");

  const url = new URL(NOMINATIM_URL);
  url.search = new URLSearchParams({
    street,
    city: CITY.name,
    state: CITY.region,
    country: CITY.country,
    countrycodes: "ua",
    viewbox: [CITY.center.lon - dLon, CITY.center.lat + dLat, CITY.center.lon + dLon, CITY.center.lat - dLat].join(","),
    bounded: "1",
    format: "jsonv2",
    addressdetails: "1",
    limit: "1",
  }).toString();

  await throttle();
  const data = await fetchJson(url, { headers: { "User-Agent": USER_AGENT, "Accept-Language": "uk" } });
  const r = Array.isArray(data) ? data[0] : null;
  if (!r) return null;
  const houseNumber = r.address?.house_number;
  const exactHouse = address.house && houseNumber && normalizeHouse(houseNumber) === address.house;
  return {
    lat: Number(r.lat),
    lon: Number(r.lon),
    precision: exactHouse ? "house" : "street",
    source: "nominatim",
    label: r.display_name ?? null,
  };
}
