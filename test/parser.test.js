import { describe, expect, it } from "vitest";
import { parseTickets } from "../src/domain/parser.js";

const SAMPLE = `1.🟢 2262291418 — 09:01 | Свемівська, 4, кв. 67 (подкл)
2.🟡 2262293012 — 09:44 | Свемівська, 3, кв. 8 (рем)`;

describe("parseTickets", () => {
  it("розбирає приклад із ТЗ", () => {
    const { tickets, rejected } = parseTickets(SAMPLE);
    expect(rejected).toEqual([]);
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toMatchObject({
      number: "2262291418",
      marker: "🟢",
      priority: 1,
      type: "connect",
      typeRaw: "подкл",
      visitTime: "09:01",
      addressRaw: "Свемівська, 4, кв. 67",
      address: { street: "Свемівська", house: "4", flat: "67" },
    });
    expect(tickets[1]).toMatchObject({ number: "2262293012", marker: "🟡", priority: 2, type: "repair", visitTime: "09:44" });
  });

  it("різні тире, без пробілів, з variation selector", () => {
    const { tickets } = parseTickets(
      ["3. 🟢️ 1111111111 – 10:05 | Короленка, 12 (підкл)", "4)🟡2222222222-11:30|Садова 5 (рем)"].join("\n"),
    );
    expect(tickets.map((t) => [t.number, t.visitTime, t.priority, t.address.house])).toEqual([
      ["1111111111", "10:05", 1, "12"],
      ["2222222222", "11:30", 2, "5"],
    ]);
  });

  it("без порядкового номера, емодзі і часу — пріоритет за типом", () => {
    const { tickets } = parseTickets("3333333333 | Шевченка, 7 (подкл)\n4444444444 — Шевченка, 9 (рем)");
    expect(tickets[0]).toMatchObject({ number: "3333333333", marker: null, priority: 1, visitTime: null });
    expect(tickets[1]).toMatchObject({ number: "4444444444", priority: 2, addressRaw: "Шевченка, 9" });
  });

  it("емодзі переважає тип", () => {
    const { tickets } = parseTickets("🟡 5555555555 — 12:00 | Садова, 1 (подкл)");
    expect(tickets[0]).toMatchObject({ priority: 2, type: "connect" });
  });

  it("невідомий тип — нижчий пріоритет, тип зберігається", () => {
    const { tickets } = parseTickets("6666666666 — 12:00 | Садова, 1 (налашт)");
    expect(tickets[0]).toMatchObject({ priority: 2, type: "other", typeRaw: "налашт" });
  });

  it("тип усередині адреси", () => {
    const { tickets } = parseTickets("7777777777 — 13:00 | Садова, 1 (рем), кв. 3");
    expect(tickets[0]).toMatchObject({ type: "repair", address: { street: "Садова", house: "1", flat: "3" } });
  });

  it("під'їзд у дужках у кінці — частина адреси", () => {
    const { tickets } = parseTickets("8888888888 — 13:00 | Садова, 1, кв. 3 (під'їзд 2)");
    expect(tickets[0]).toMatchObject({ type: "other", typeRaw: null });
    expect(tickets[0].addressRaw).toContain("під'їзд 2");
  });

  it("ігнорує заголовки, нерозпізнані рядки з номером повертає", () => {
    const { tickets, rejected } = parseTickets(`Заявки на сьогодні:\n\n${SAMPLE}\nДзвінок клієнту 0671234567\n2262299999 —`);
    expect(tickets).toHaveLength(2);
    expect(rejected).toEqual(["Дзвінок клієнту 0671234567", "2262299999 —"]);
  });

  it("дублікати номера — залишається останній", () => {
    const { tickets } = parseTickets(`${SAMPLE}\n🟡 2262291418 — 15:00 | Свемівська, 4, кв. 67 (рем)`);
    expect(tickets).toHaveLength(2);
    expect(tickets[0]).toMatchObject({ number: "2262291418", visitTime: "15:00", priority: 2 });
  });

  it("номер з довільним текстом без ознак заявки — не заявка", () => {
    const { tickets, rejected } = parseTickets("2262291418 переобжим абон");
    expect(tickets).toEqual([]);
    expect(rejected).toEqual(["2262291418 переобжим абон"]);
  });

  it("час з крапкою і одноцифрова година", () => {
    const { tickets } = parseTickets("🟢 9999999999 — 9.05 | Садова, 2 (подкл)");
    expect(tickets[0].visitTime).toBe("09:05");
  });
});
