// Усі тексти інтерфейсу бота. HTML parse_mode — дані користувача екрануються у викликах.

import { escapeHtml } from "../lib/html.js";

/** Кнопки reply-клавіатури (бот реагує саме на цей текст). */
export const BTN = {
  next: "▶️ Наступна",
  route: "🗺 Маршрут",
  list: "📋 Залишок",
  done: "✅ Виконані",
  settings: "⚙️ Налаштування",
  myLocation: "📍 Моя геолокація",
  fromHome: "🏠 Від дому",
  hereLocation: "📍 Я біля будинку",
  sendHome: "📍 Надіслати мою геолокацію",
  back: "⬅️ Назад",
};

/** Підписи inline-кнопок. */
export const L = {
  google: "🧭 Google Maps",
  waze: "🧭 Waze",
  copyNumber: "📋 Номер",
  report: "📝 Звіт",
  pin: "📍 Вказати точку на карті",
  done: "✅ Виконано",
  later: "⏭ Пізніше",
  reopen: "↩️ Повернути в роботу",
  start: "▶️ Почати",
  copy: "📋 Копіювати",
  changeReport: "✏️ Змінити",
  customText: "✍️ Свій текст",
  templates: "📝 Шаблони звітів",
  templatesShort: "⚙️ Шаблони",
  buildRoute: "🗺 Побудувати маршрут",
  openList: "📋 Залишок",
  routeHere: "🗺 Маршрут звідси",
  saveHome: "🏠 Зберегти як дім",
  setHome: "🏠 Задати точку старту",
  clear: "🧹 Очистити заявки",
  clearDone: "🧹 Видалити виконані",
  clearAll: "🗑 Видалити всі",
  clearAllConfirm: "⚠️ Так, видалити всі",
  cancel: "Скасувати",
  add: "➕ Додати",
  toSettings: "⬅️ Налаштування",
  allow: "✅ Дозволити",
  deny: "⛔ Відхилити",
};

const HELP = `<b>Як користуватися ботом</b>

1. Перешліть або вставте список заявок, наприклад:
<code>1.🟢 2262291418 — 09:01 | Свемівська, 4, кв. 67 (подкл)</code>
2. ${BTN.route} — оптимальний порядок об'їзду: спочатку 🟢, ремонти поруч — одразу по дорозі.
3. ${BTN.next} — картка заявки: навігатор, копіювання номера, звіт, «Виконано».
4. ${BTN.list} і ${BTN.done} — що лишилось і що зроблено сьогодні.
5. ${BTN.settings} — точка старту (дім), шаблони звітів, час на заявку.

/cancel — скасувати поточну дію.`;

const plural = (n, one, few, many) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
export const ticketsWord = (n) => `${n} ${plural(n, "заявка", "заявки", "заявок")}`;

export const userLine = (u) =>
  `${escapeHtml(u.first_name ?? "")}${u.username ? ` @${escapeHtml(u.username)}` : ""} (id <code>${u.id}</code>)`;

export const T = {
  help: HELP,
  welcome: (name) => `Вітаю, ${escapeHtml(name ?? "")}! 👋\n\n${HELP}`,
  cancelled: "Скасовано.",
  error: "😕 Сталася помилка. Спробуйте ще раз.",
  notUnderstood: `Не розумію це повідомлення 🤔\n\nЩоб додати заявки, надішліть їх у форматі:\n<code>1.🟢 2262291418 — 09:01 | Свемівська, 4, кв. 67 (подкл)</code>\n\n/help — довідка`,

  // доступ
  accessRequested: "🔒 Бот доступний лише майстрам. Запит на доступ надіслано адміністратору — зачекайте підтвердження.",
  accessPending: "⏳ Ваш запит на доступ ще розглядається.",
  accessGranted: `✅ Доступ надано!\n\n${HELP}`,
  accessDenied: "⛔ У доступі відмовлено.",
  noAdmins: "⚠️ Адміністратора не налаштовано (ADMIN_IDS) — запит нікому підтвердити.",
  adminRequest: (u) => `🔔 <b>Запит на доступ</b>\n${userLine(u)}`,
  adminGranted: (u) => `✅ Доступ надано: ${userLine(u)}`,
  adminDenied: (u) => `⛔ Відхилено: ${userLine(u)}`,
  adminOnly: "Лише для адміністратора.",
  usersTitle: "👷 <b>Майстри</b>",
  userStatus: { active: "активний", pending: "очікує", blocked: "заблокований" },
  cannotBlockAdmin: "Адміністратора заблокувати не можна.",

  // завантаження
  uploadSummary: ({ total, added, updated, high, low, pending, rejected }) => {
    const lines = [`📥 <b>Прийнято: ${ticketsWord(total)}</b> (нових: ${added}, оновлено: ${updated})`, `🟢 вищий пріоритет: ${high} · 🟡 нижчий: ${low}`];
    if (pending) lines.push(`⏳ Шукаю на карті адрес: ${pending} — повідомлю, коли закінчу.`);
    if (added) lines.push(`🗺 Побудуйте маршрут, щоб урахувати нові заявки.`);
    if (rejected.length) {
      lines.push("", `⚠️ <b>Не розпізнано рядків: ${rejected.length}</b>`, ...rejected.slice(0, 10).map((r) => `<code>${escapeHtml(r)}</code>`));
    }
    return lines.join("\n");
  },
  uploadNothing: (rejected) =>
    [`⚠️ Не вдалося розпізнати жодної заявки. Рядки з номерами:`, ...rejected.slice(0, 10).map((r) => `<code>${escapeHtml(r)}</code>`), "", "Очікуваний формат:", `<code>1.🟢 2262291418 — 09:01 | Свемівська, 4, кв. 67 (подкл)</code>`].join("\n"),

  // геокодинг
  geoAllFound: (n) => `📍 Усі адреси знайдено на карті (${n}).`,
  geoProblems: (found, total) => `📍 На карті: ${found} з ${total}.\n⚠️ Для цих адрес вкажіть точку вручну (достатньо один раз — бот запам'ятає):`,
  geoNote: {
    approx: "📍≈ координати приблизні (лише вулиця) — можна уточнити точку",
    not_found: "⚠️ адресу не знайдено на карті — вкажіть точку",
    pending: "⏳ шукаю адресу на карті…",
  },
  pinAsk: (t) =>
    `📍 Точка для <b>${escapeHtml(t.address_raw)}</b>\n\nНадішліть геолокацію: 📎 → «Локація» → перетягніть мітку на будинок → «Надіслати».\nАбо натисніть «${BTN.hereLocation}», якщо ви зараз поруч.`,
  pinSaved: (t) => `✅ Точку для <b>${escapeHtml(t.address_raw)}</b> збережено. Перебудуйте маршрут, щоб її врахувати.`,
  pinTooFar: (km) => `⚠️ Ця точка за ${km} км від Шостки. Надішліть точку ще раз або натисніть «${BTN.back}».`,

  // заявки
  noOpen: "📭 Відкритих заявок немає. Надішліть список заявок.",
  allDone: (n) => `🎉 Усі заявки виконано! Сьогодні: ${n}.`,
  ticketMissing: "Заявку не знайдено.",
  markedDone: "✅ Виконано",
  reopened: "↩️ Повернуто в роботу",
  postponed: "⏭ Відкладено в кінець",
  postponedNote: "⏭ <i>відкладено в кінець маршруту</i>",
  doneAt: (time) => `✅ <b>Виконано</b> о ${time}`,
  eta: (time) => `🚗 прибуття ≈ ${time}`,
  openTitle: (n, doneToday) => `📋 <b>Залишилось: ${n}</b>${doneToday ? ` · виконано сьогодні: ${doneToday}` : ""}`,
  doneTitle: (n) => `✅ <b>Виконано сьогодні: ${n}</b>`,
  noneDoneToday: "Сьогодні ще нічого не виконано.",
  typeLabel: { connect: "підключення", repair: "ремонт" },
  typeOther: "інше",

  // маршрут
  routeAskStart: (hasHome) =>
    `🗺 <b>Звідки стартуємо?</b>\nНатисніть «${BTN.myLocation}»${hasHome ? ` або «${BTN.fromHome}»` : ""}.${hasHome ? "" : `\n\nПорада: задайте дім у ${BTN.settings}, щоб стартувати звідти однією кнопкою.`}`,
  noHome: `🏠 Точку старту ще не задано. Відкрийте ${BTN.settings} → «${L.setHome}».`,
  startHome: "🏠 дім",
  startHere: "📍 ваша геолокація",
  routeBuilding: (n) => `⏳ Будую маршрут: ${ticketsWord(n)}…`,
  routeNoLocated: "⚠️ Жодна заявка ще не має координат. Дочекайтесь пошуку адрес або вкажіть точки вручну.",
  routeHeader: ({ count, km, driveMin, startLabel, depart, tomorrow, end }) =>
    `🗺 <b>Маршрут</b> · ${ticketsWord(count)} · ${km} км · ≈ ${driveMin} хв за кермом\nСтарт: ${startLabel} · виїзд ${tomorrow ? "завтра " : ""}о ${depart} · завершення ≈ ${end}`,
  routeApprox: "ℹ️ Відстані приблизні — сервіс карт недоступний.",
  routeNearby: " ↪ поруч",
  routeUnlocated: "⚠️ <b>Без координат</b> (в кінці, поза розрахунком):",
  locationWhat: "Що зробити з цією точкою?",
  locationExpired: "Точка застаріла — надішліть геолокацію ще раз.",

  // звіти
  reportPick: (marker, number) => `📝 Звіт для ${marker} <b>${escapeHtml(number)}</b> — оберіть шаблон або напишіть свій текст:`,
  reportAskText: (number) => `✍️ Напишіть, що зроблено по заявці <b>${escapeHtml(number)}</b> (одним повідомленням):`,
  reportReady: (text) => `📋 Звіт готовий — натисніть «${L.copy}»:\n\n<code>${escapeHtml(text)}</code>`,
  reportEmpty: "Текст порожній — напишіть, що зроблено.",
  templateMissing: "Шаблон не знайдено.",

  // налаштування
  settings: ({ hasHome, serviceMin, nearbyRadiusM, workdayStart, templates }) =>
    [
      "⚙️ <b>Налаштування</b>",
      `🏠 Точка старту: ${hasHome ? "задана" : "не задана"}`,
      `⏱ Час на одну заявку: ${serviceMin} хв`,
      `📏 Ремонт «поруч» з підключенням: ${nearbyRadiusM ? `до ${nearbyRadiusM} м` : "вимкнено"}`,
      `🕗 Початок робочого дня: ${workdayStart}`,
      `📝 Шаблонів звітів: ${templates}`,
      "",
      "Натисніть кнопку, щоб змінити.",
    ].join("\n"),
  settingButtons: {
    serviceMin: (v) => `⏱ ${v} хв`,
    nearbyRadiusM: (v) => (v ? `📏 ${v} м` : "📏 вимк."),
    workdayStart: (v) => `🕗 ${v}`,
  },
  homeAsk: `🏠 Надішліть точку старту: натисніть «${BTN.sendHome}», якщо ви зараз там, або 📎 → «Локація» → оберіть місце на карті.`,
  homeSaved: "🏠 Точку старту збережено.",
  clearAsk: "🧹 Що видалити?",
  clearAllAsk: "⚠️ Видалити <b>всі</b> заявки, разом із невиконаними?",
  cleared: (n) => `🧹 Видалено: ${ticketsWord(n)}.`,

  // шаблони
  templatesView: (templates) =>
    [
      "📝 <b>Шаблони звітів</b>",
      "Звіт формується як: <code>заявка #номер текст</code>",
      "",
      ...(templates.length ? templates.map((t, i) => `${i + 1}. ${escapeHtml(t.text)}`) : ["Шаблонів ще немає."]),
      "",
      "❌ — видалити шаблон.",
    ].join("\n"),
  templateAsk: "✍️ Надішліть текст шаблону. Можна кілька — кожен з нового рядка.",
  templatesAdded: (n) => `➕ Додано шаблонів: ${n}.`,
};
