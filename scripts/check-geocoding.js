// Перевірка покриття геокодингу на реальних заявках (без БД і Telegram).
//   node --env-file=.dev.vars scripts/check-geocoding.js samples/list.txt
// Файл — текст списку заявок у тому ж форматі, що надсилається боту.

import { readFile } from "node:fs/promises";
import { parseTickets } from "../src/domain/parser.js";
import { geocodeAddress } from "../src/services/geocoding.js";

const file = process.argv[2];
if (!file) {
  console.error("Використання: node --env-file=.dev.vars scripts/check-geocoding.js <файл зі списком заявок>");
  process.exit(1);
}

const { tickets, rejected } = parseTickets(await readFile(file, "utf8"));
const addresses = new Map();
for (const t of tickets) if (t.address.key) addresses.set(t.address.key, t.address);

console.log(`Заявок: ${tickets.length}, унікальних адрес: ${addresses.size}, нерозпізнаних рядків: ${rejected.length}`);
console.log(process.env.ORS_API_KEY ? "Провайдери: ORS → Nominatim\n" : "ORS_API_KEY не задано — лише Nominatim\n");

const stats = { house: 0, street: 0, none: 0, error: 0 };
for (const address of addresses.values()) {
  try {
    const r = await geocodeAddress(process.env, address);
    stats[r.precision]++;
    const where = r.lat != null ? `${r.lat.toFixed(5)},${r.lon.toFixed(5)}` : "—";
    console.log(`${{ house: "✅", street: "≈ ", none: "❌" }[r.precision]} ${address.label.padEnd(36)} ${r.source.padEnd(10)} ${where}  ${r.label ?? ""}`);
  } catch (err) {
    stats.error++;
    console.log(`⚠️ ${address.label.padEnd(36)} ${err.message}`);
  }
}

const total = addresses.size || 1;
const pct = (n) => `${Math.round((n / total) * 100)}%`;
console.log(`\nТочно (будинок): ${stats.house} (${pct(stats.house)}) · приблизно (вулиця): ${stats.street} (${pct(stats.street)}) · не знайдено: ${stats.none} · помилки: ${stats.error}`);
for (const r of rejected) console.log(`Не розпізнано: ${r}`);
