import { CITY } from "../config.js";

// Google Maps на мобільних приймає лише 3 проміжні точки
const ROUTE_CHUNK = 4;

const coords = (p) => `${p.lat},${p.lon}`;

/** Текст адреси для пошуку в навігаторі (без квартири). */
function addressQuery(t) {
  const base = t.street && t.house ? `${t.street} ${t.house}` : String(t.address_raw).replace(/,?\s*кв(?:артира)?\.?\s*\d+\S*/iu, "");
  return `${base}, ${CITY.name}`;
}

/** Посилання для навігації до заявки. Неточні координати — пошук за адресою. */
export function navigationLinks(t) {
  if (t.lat != null && t.geo_status === "found") {
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${coords(t)}&travelmode=driving`,
      waze: `https://waze.com/ul?ll=${coords(t)}&navigate=yes`,
    };
  }
  const q = encodeURIComponent(addressQuery(t));
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}

/**
 * Маршрут Google Maps частинами по ROUTE_CHUNK точок.
 * @param {{lat:number, lon:number}} start
 * @param {{lat:number, lon:number}[]} stops у порядку об'їзду
 * @returns {{ from: number, to: number, url: string }[]} from/to — номери точок (з 1)
 */
export function routeLinks(start, stops) {
  const links = [];
  for (let i = 0; i < stops.length; i += ROUTE_CHUNK) {
    const chunk = stops.slice(i, i + ROUTE_CHUNK);
    const origin = i === 0 ? start : stops[i - 1];
    const params = new URLSearchParams({
      api: "1",
      origin: coords(origin),
      destination: coords(chunk.at(-1)),
      travelmode: "driving",
    });
    if (chunk.length > 1) params.set("waypoints", chunk.slice(0, -1).map(coords).join("|"));
    links.push({ from: i + 1, to: i + chunk.length, url: `https://www.google.com/maps/dir/?${params}` });
  }
  return links;
}
