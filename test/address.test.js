import { describe, expect, it } from "vitest";
import { normalizeHouse, parseAddress } from "../src/domain/address.js";

describe("parseAddress", () => {
  it("вулиця, будинок, квартира через коми", () => {
    expect(parseAddress("Свемівська, 4, кв. 67")).toMatchObject({
      street: "Свемівська",
      house: "4",
      flat: "67",
      key: "свемівська|4",
      label: "Свемівська, 4",
    });
  });

  it("без ком і з префіксом вул.", () => {
    expect(parseAddress("вул. Свемівська 4 кв 67")).toMatchObject({
      street: "Свемівська",
      streetType: "вулиця",
      house: "4",
      flat: "67",
      key: "свемівська|4",
    });
  });

  it("квартира не впливає на ключ, тип «вулиця» теж", () => {
    expect(parseAddress("Свемівська, 4, кв. 12").key).toBe(parseAddress("вулиця Свемівська, 4").key);
  });

  it("провулок і вулиця з однаковою назвою — різні ключі", () => {
    expect(parseAddress("пров. Шевченка, 5").key).toBe("провулок шевченка|5");
    expect(parseAddress("Шевченка, 5").key).toBe("шевченка|5");
  });

  it("будинки з літерою, дробом і корпусом", () => {
    expect(parseAddress("Короленка 12-А").house).toBe("12а");
    expect(parseAddress("Короленка, 4/2, кв. 5").house).toBe("4/2");
    expect(parseAddress("Короленка, буд. 7б").house).toBe("7б");
    expect(normalizeHouse("12 корп. 3")).toBe("12к3");
    expect(normalizeHouse("4a")).toBe("4а");
  });

  it("назва вулиці з числом", () => {
    expect(parseAddress("8 Березня, 12")).toMatchObject({ street: "8 Березня", house: "12" });
    expect(parseAddress("40 років Перемоги 3, кв. 1")).toMatchObject({ street: "40 років Перемоги", house: "3" });
  });

  it("приватний будинок без квартири", () => {
    expect(parseAddress("Садова, 15")).toMatchObject({ street: "Садова", house: "15", flat: null });
  });

  it("слово, що починається на «кв», не плутає з квартирою", () => {
    expect(parseAddress("Квіткова, 3")).toMatchObject({ street: "Квіткова", house: "3", flat: null });
  });

  it("під'їзд і поверх ідуть у extra", () => {
    const a = parseAddress("Свемівська, 4, під'їзд 2, кв. 67");
    expect(a).toMatchObject({ street: "Свемівська", house: "4", flat: "67" });
    expect(a.extra).toContain("під'їзд 2");
  });

  it("апострофи уніфікуються", () => {
    expect(parseAddress("Пам’ятна, 1").key).toBe(parseAddress("Пам'ятна, 1").key);
  });

  it("вулиця без номера будинку", () => {
    expect(parseAddress("Садова")).toMatchObject({ street: "Садова", house: null, key: "садова|" });
  });
});
