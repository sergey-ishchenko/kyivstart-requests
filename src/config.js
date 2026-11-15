export const CITY = {
  name: "Шостка",
  region: "Сумська область",
  country: "Україна",
  center: { lat: 51.8667, lon: 33.4833 },
  radiusKm: 15,
};

export const TIME_ZONE = "Europe/Kyiv";

/** Налаштування майстра за замовчуванням (змінюються в боті). */
export const DEFAULT_SETTINGS = {
  serviceMin: 40,
  nearbyRadiusM: 300,
  workdayStart: "08:30",
  workdayEnd: "19:00",
  timeSlackMin: 60,
};

/** Значення, між якими перемикаються кнопки в налаштуваннях. */
export const SETTING_CHOICES = {
  serviceMin: [20, 30, 40, 50, 60, 90],
  nearbyRadiusM: [0, 100, 200, 300, 500, 800],
  workdayStart: ["07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00"],
};

export const DEFAULT_TEMPLATES = [
  "переобжим абон",
  "заміна роутера",
  "налаштування роутера",
  "підключено, працює",
  "заміна кабелю",
  "абонента немає вдома",
];

// Free plan: ≈50 subrequest на виклик, на адресу — до 2 запитів до геокодерів.
export const GEOCODE_BATCH = 10;
export const GEOCODE_NEGATIVE_TTL_DAYS = 7;
export const CLEANUP_CRON = "0 1 * * *";
export const TICKET_RETENTION_DAYS = 30;

/** Довжина «заявка #NNNNNNNNNN » + текст має влізти в copy_text (256 символів). */
export const MAX_REPORT_TEXT = 220;

export function userSettings(user) {
  let saved = {};
  try {
    saved = JSON.parse(user?.settings || "{}");
  } catch {
    // зіпсований JSON — працюємо на значеннях за замовчуванням
  }
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function adminIds(env) {
  return String(env.ADMIN_IDS ?? "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isSafeInteger);
}
