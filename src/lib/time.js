import { TIME_ZONE } from "../config.js";

const kyivParts = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Дата й час у Києві: { date: "YYYY-MM-DD", minutes: хвилини від півночі }. */
export function kyivNow(now = new Date()) {
  const p = Object.fromEntries(kyivParts.formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

/** "09:01" → 541; некоректне значення → null. */
export function parseHM(value) {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function formatHM(minutes) {
  const total = (((Math.round(minutes) % 1440) + 1440) % 1440);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Початок поточної доби в Києві у форматі datetime('now') SQLite (UTC). */
export function kyivDayStartSqlUtc(now = new Date()) {
  const { minutes } = kyivNow(now);
  const ms = now.getTime() - (minutes * 60 + now.getUTCSeconds()) * 1000 - now.getUTCMilliseconds();
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

/** Значення datetime('now') з SQLite (UTC) → Date. */
export function fromSqlUtc(value) {
  return new Date(`${String(value).replace(" ", "T")}Z`);
}

/** Час виїзду: зараз, але не раніше початку дня; після кінця дня — початок наступного. */
export function departure(nowMinutes, settings) {
  const start = parseHM(settings.workdayStart) ?? 8 * 60 + 30;
  const end = parseHM(settings.workdayEnd) ?? 19 * 60;
  if (nowMinutes >= end) return { minutes: start, tomorrow: true };
  return { minutes: Math.max(nowMinutes, start), tomorrow: false };
}
