import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buttons, createHarness } from "./helpers/harness.js";

// Мережі в тестах немає: геокодер повертає координати з таблиці або «не знайдено».
const KNOWN = {
  "свемівська|4": { lat: 51.87, lon: 33.47 },
  "свемівська|3": { lat: 51.8702, lon: 33.4703 },
  "короленка|12": { lat: 51.86, lon: 33.5 },
};
vi.mock("../src/services/geocoding.js", async (importOriginal) => ({
  ...(await importOriginal()),
  geocodeAddress: vi.fn(async (_env, address) => {
    const hit = KNOWN[address.key];
    return hit
      ? { ...hit, precision: "house", source: "test", label: address.label }
      : { lat: null, lon: null, precision: "none", source: "none", label: null };
  }),
}));

const ADMIN = 1;
const TECH = 2;

const LIST = `1.🟢 2262291418 — 09:01 | Свемівська, 4, кв. 67 (подкл)
2.🟡 2262293012 — 09:44 | Свемівська, 3, кв. 8 (рем)
3.🟢 2262295555 — 10:30 | Короленка, 12 (подкл)
4.🟡 2262297777 — 11:00 | Невідома, 99 (рем)`;

const ticketsOf = async (h, userId) =>
  (await h.db.prepare("SELECT * FROM tickets WHERE user_id = ? ORDER BY id").bind(userId).all()).results;
const byNumber = async (h, userId, number) =>
  h.db.prepare("SELECT * FROM tickets WHERE user_id = ? AND number = ?").bind(userId, number).first();

describe("бот", () => {
  let h;
  beforeEach(async () => {
    h = await createHarness();
  });
  afterEach(async () => {
    await h.dispose();
  });

  it("адмін із ADMIN_IDS активується на /start і отримує стартові шаблони", async () => {
    await h.send(ADMIN, "/start");
    const user = await h.db.prepare("SELECT * FROM users WHERE id = ?").bind(ADMIN).first();
    expect(user).toMatchObject({ role: "admin", status: "active" });
    const tpl = await h.db.prepare("SELECT COUNT(*) AS n FROM templates WHERE user_id = ?").bind(ADMIN).first();
    expect(tpl.n).toBeGreaterThan(0);
    expect(h.last(ADMIN).payload.text).toContain("Як користуватися");
  });

  it("невідомий користувач → запит адміну → дозвіл", async () => {
    await h.send(TECH, "/start");
    expect(h.last(TECH).payload.text).toContain("Запит на доступ надіслано");
    const request = h.last(ADMIN);
    expect(request.payload.text).toContain("Запит на доступ");
    expect(buttons(request).map((b) => b.callback_data)).toEqual([`adm:ok:${TECH}`, `adm:no:${TECH}`]);

    await h.send(TECH, LIST);
    expect(await ticketsOf(h, TECH)).toHaveLength(0);

    await h.press(ADMIN, `adm:ok:${TECH}`);
    expect(h.last(TECH).payload.text).toContain("Доступ надано");
    await h.send(TECH, LIST);
    expect(await ticketsOf(h, TECH)).toHaveLength(4);
  });

  it("завантаження → геокодинг → маршрут → картка → звіт → виконано", async () => {
    await h.send(ADMIN, LIST);
    const summary = h.outgoing(ADMIN).find((c) => c.payload.text.includes("Прийнято"));
    expect(summary.payload.text).toContain("нових: 4");
    expect(summary.payload.text).toContain("🟢 вищий пріоритет: 2 · 🟡 нижчий: 2");

    // фоновий геокодинг уже відпрацював (harness чекає waitUntil)
    const rows = await ticketsOf(h, ADMIN);
    expect(rows.map((t) => t.geo_status)).toEqual(["found", "found", "found", "not_found"]);
    const geoReport = h.last(ADMIN);
    expect(geoReport.payload.text).toContain("На карті: 3 з 4");
    const unknown = await byNumber(h, ADMIN, "2262297777");
    expect(buttons(geoReport).map((b) => b.callback_data)).toContain(`pin:${unknown.id}`);

    // маршрут від геолокації
    await h.send(ADMIN, "🗺 Маршрут");
    expect(h.last(ADMIN).payload.reply_markup.keyboard[0][0]).toMatchObject({ request_location: true });
    await h.location(ADMIN, 51.8667, 33.4833);
    const route = h.last(ADMIN).payload.text;
    expect(route).toContain("Маршрут");
    expect(route).toContain("↪ поруч");
    expect(route).toContain("Без координат");

    // гібрид: підключення Свемівська 4 → ремонт поруч Свемівська 3 → підключення Короленка 12 → без координат
    const ordered = (await ticketsOf(h, ADMIN)).sort((a, b) => a.route_pos - b.route_pos).map((t) => t.number);
    expect(ordered).toEqual(["2262291418", "2262293012", "2262295555", "2262297777"]);

    // наступна заявка
    h.reset();
    await h.send(ADMIN, "▶️ Наступна");
    const card = h.last(ADMIN);
    expect(card.payload.text).toContain("2262291418");
    const cardButtons = buttons(card);
    expect(cardButtons.find((b) => b.copy_text)?.copy_text.text).toBe("2262291418");
    expect(cardButtons.find((b) => b.url?.includes("google.com/maps"))).toBeTruthy();

    // звіт за шаблоном
    const first = await byNumber(h, ADMIN, "2262291418");
    await h.press(ADMIN, `rep:${first.id}`);
    const picker = h.last(ADMIN);
    const tplButton = buttons(picker).find((b) => b.text === "переобжим абон");
    await h.press(ADMIN, tplButton.callback_data);
    const report = h.last(ADMIN);
    expect(report.method).toBe("editMessageText");
    expect(buttons(report).find((b) => b.copy_text)?.copy_text.text).toBe("заявка #2262291418 переобжим абон");
    expect((await byNumber(h, ADMIN, "2262291418")).report_text).toBe("заявка #2262291418 переобжим абон");

    // виконано з повідомлення звіту → наступна картка
    await h.press(ADMIN, `rdone:${first.id}`);
    expect((await byNumber(h, ADMIN, "2262291418")).status).toBe("done");
    expect(h.last(ADMIN).payload.text).toContain("2262293012");

    // залишок і виконані
    await h.send(ADMIN, "📋 Залишок");
    expect(h.last(ADMIN).payload.text).toContain("Залишилось: 3");
    await h.send(ADMIN, "✅ Виконані");
    expect(h.last(ADMIN).payload.text).toContain("заявка #2262291418 переобжим абон");
  });

  it("свій текст звіту", async () => {
    await h.send(ADMIN, LIST);
    const t = await byNumber(h, ADMIN, "2262293012");
    await h.press(ADMIN, `rpc:${t.id}`);
    await h.send(ADMIN, "заміна конектора   на щитку");
    expect(buttons(h.last(ADMIN)).find((b) => b.copy_text)?.copy_text.text).toBe("заявка #2262293012 заміна конектора на щитку");
  });

  it("ручна геоточка зберігається в кеш для всіх", async () => {
    await h.send(ADMIN, LIST);
    const t = await byNumber(h, ADMIN, "2262297777");
    await h.press(ADMIN, `pin:${t.id}`);
    await h.location(ADMIN, 51.8655, 33.481);
    expect(await byNumber(h, ADMIN, "2262297777")).toMatchObject({ geo_status: "found", lat: 51.8655 });
    expect(await h.db.prepare("SELECT * FROM geocache WHERE address_key = 'невідома|99'").first()).toMatchObject({ source: "manual" });

    // точка далеко від Шостки не приймається
    const t2 = await byNumber(h, ADMIN, "2262295555");
    await h.press(ADMIN, `pin:${t2.id}`);
    await h.location(ADMIN, 50.45, 30.52);
    expect(h.last(ADMIN).payload.text).toContain("від Шостки");
  });

  it("майстер не бачить і не змінює чужі заявки", async () => {
    await h.send(TECH, "/start");
    await h.press(ADMIN, `adm:ok:${TECH}`);
    await h.send(ADMIN, LIST);
    const adminTicket = await byNumber(h, ADMIN, "2262291418");

    h.reset();
    await h.press(TECH, `done:${adminTicket.id}`);
    expect(h.calls.find((c) => c.method === "answerCallbackQuery").payload.text).toBe("Заявку не знайдено.");
    expect((await byNumber(h, ADMIN, "2262291418")).status).toBe("open");

    await h.send(TECH, "📋 Залишок");
    expect(h.last(TECH).payload.text).toContain("Відкритих заявок немає");
  });

  it("налаштування: перемикання часу на заявку і додавання шаблонів", async () => {
    await h.send(ADMIN, "/start");
    await h.press(ADMIN, "set:serviceMin");
    const settings = JSON.parse((await h.db.prepare("SELECT settings FROM users WHERE id = ?").bind(ADMIN).first()).settings);
    expect(settings.serviceMin).toBe(50);

    await h.press(ADMIN, "tpl:add");
    await h.send(ADMIN, "перевірка сигналу\nзаміна БЖ");
    const { results } = await h.db.prepare("SELECT text FROM templates WHERE user_id = ? ORDER BY sort DESC LIMIT 2").bind(ADMIN).all();
    expect(results.map((r) => r.text)).toEqual(["заміна БЖ", "перевірка сигналу"]);
  });

  it("повторне завантаження не скидає «виконано»", async () => {
    await h.send(ADMIN, LIST);
    const t = await byNumber(h, ADMIN, "2262291418");
    await h.press(ADMIN, `done:${t.id}`);
    await h.send(ADMIN, LIST);
    expect((await byNumber(h, ADMIN, "2262291418")).status).toBe("done");
    expect(h.outgoing(ADMIN).at(-2).payload.text).toContain("оновлено: 4");
  });

  it("незрозумілий текст — підказка", async () => {
    await h.send(ADMIN, "привіт");
    expect(h.last(ADMIN).payload.text).toContain("Не розумію");
  });
});
