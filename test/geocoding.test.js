import { afterEach, describe, expect, it, vi } from "vitest";
import { parseAddress } from "../src/domain/address.js";
import { geocodeAddress } from "../src/services/geocoding.js";

const ADDRESS = parseAddress("Свемівська, 4, кв. 67");

const orsFeature = (lat, lon, housenumber) => ({
  features: [{ geometry: { coordinates: [lon, lat] }, properties: { housenumber, label: "Свемівська 4, Шостка" } }],
});
const nominatimHit = (lat, lon, house_number) => [{ lat: String(lat), lon: String(lon), display_name: "4, Свемівська", address: { house_number } }];

/** fetch-заглушка: відповіді за хостом; записує URL запитів. */
function stubFetch(responses) {
  const urls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url) => {
      const u = new URL(url);
      urls.push(u);
      const r = responses[u.hostname];
      if (r instanceof Error) throw r;
      return new Response(JSON.stringify(r ?? []), { status: 200, headers: { "Content-Type": "application/json" } });
    }),
  );
  return urls;
}

describe("geocodeAddress", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ORS з точним будинком — без звернення до Nominatim", async () => {
    const urls = stubFetch({ "api.openrouteservice.org": orsFeature(51.87, 33.47, "4") });
    const r = await geocodeAddress({ ORS_API_KEY: "k" }, ADDRESS);
    expect(r).toMatchObject({ lat: 51.87, lon: 33.47, precision: "house", source: "ors" });
    expect(urls).toHaveLength(1);
    expect(urls[0].pathname).toBe("/geocode/search/structured");
    expect(urls[0].searchParams.get("address")).toBe("Свемівська 4");
    expect(urls[0].searchParams.get("locality")).toBe("Шостка");
  });

  it("ORS дав лише вулицю → Nominatim з точним будинком перемагає", async () => {
    const urls = stubFetch({
      "api.openrouteservice.org": orsFeature(51.871, 33.471, "10"),
      "nominatim.openstreetmap.org": nominatimHit(51.8701, 33.4702, "4"),
    });
    const r = await geocodeAddress({ ORS_API_KEY: "k" }, ADDRESS);
    expect(r).toMatchObject({ lat: 51.8701, precision: "house", source: "nominatim" });
    expect(urls[1].searchParams.get("street")).toBe("4 Свемівська");
    expect(urls[1].searchParams.get("bounded")).toBe("1");
  });

  it("лише рівень вулиці — повертається як приблизний", async () => {
    stubFetch({ "nominatim.openstreetmap.org": nominatimHit(51.8701, 33.4702, undefined) });
    expect(await geocodeAddress({}, ADDRESS)).toMatchObject({ precision: "street", source: "nominatim" });
  });

  it("результат далеко від Шостки відкидається", async () => {
    stubFetch({ "nominatim.openstreetmap.org": nominatimHit(50.45, 30.52, "4") });
    expect(await geocodeAddress({}, ADDRESS)).toMatchObject({ precision: "none", lat: null });
  });

  it("усі провайдери недоступні — помилка (щоб не закешувати «не знайдено»)", async () => {
    stubFetch({ "api.openrouteservice.org": new Error("network"), "nominatim.openstreetmap.org": new Error("network") });
    await expect(geocodeAddress({ ORS_API_KEY: "k" }, ADDRESS)).rejects.toThrow(/недоступні/);
  });
});
