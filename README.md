# Kyivstar-bot

Telegram-бот для майстрів Київстар у Шостці. Приймає список заявок, будує маршрут об'їзду і допомагає відмічати виконання та копіювати звіти.

Стек: Cloudflare Workers + D1 (SQLite) + grammY. Деталі для розробки — у [CLAUDE.md](CLAUDE.md), план і статус — у [PLAN.md](PLAN.md).

## Що потрібно

- Node.js 22+
- Два боти від [@BotFather](https://t.me/BotFather): робочий і тестовий
- Безкоштовний акаунт [Cloudflare](https://dash.cloudflare.com/sign-up)
- Безкоштовний ключ [OpenRouteService](https://openrouteservice.org/dev/#/signup). Без ключа бот працює на Nominatim, а відстані рахує приблизно
- Ваш Telegram ID (наприклад, через [@userinfobot](https://t.me/userinfobot))

```powershell
npm install
```

## Локальний запуск (тестовий бот)

```powershell
copy .dev.vars.example .dev.vars   # заповнити: токен ТЕСТОВОГО бота, ORS_API_KEY, ADMIN_IDS
npm run db:migrate:local
npm run dev:poll                   # бот працює, поки відкрите вікно; Ctrl+C — зупинити
npm test                           # тести
```

Перевірка того, як знаходяться ваші адреси на карті:

```powershell
mkdir samples                      # папка не комітиться
# вставте список заявок у samples\list.txt
node --env-file=.dev.vars scripts/check-geocoding.js samples/list.txt
```

## Деплой на Cloudflare

1. Увійти: `npx wrangler login`.
2. Створити базу: `npx wrangler d1 create kyivstar-bot`. Отриманий `database_id` вписати в [wrangler.jsonc](wrangler.jsonc).
3. У `wrangler.jsonc` → `vars.ADMIN_IDS` вписати свій Telegram ID.
4. Створити таблиці: `npm run db:migrate:remote`.
5. Задати секрети (кожна команда попросить значення):
   ```powershell
   npx wrangler secret put BOT_TOKEN        # токен РОБОЧОГО бота
   npx wrangler secret put WEBHOOK_SECRET   # довільний рядок: A-Z, a-z, 0-9, _ і -
   npx wrangler secret put ORS_API_KEY
   ```
6. Опублікувати: `npm run deploy`. Wrangler покаже адресу виду `https://kyivstar-bot.<субдомен>.workers.dev`.
7. Підключити Telegram:
   1. `copy .env.production.example .env.production`;
   2. заповнити `BOT_TOKEN`, `WEBHOOK_SECRET` (той самий, що в кроці 5) і `WORKER_URL`;
   3. виконати `npm run webhook:set`.
8. Написати робочому боту `/start`.

## Щоденна робота

- **Новий майстер.** Майстер пише боту `/start`, адміну приходить запит із кнопками «Дозволити» і «Відхилити». Список майстрів — команда `/users`.
- **Логи продакшну:** `npx wrangler tail`.
- **Оновлення бота:**
  1. `npm test`;
  2. `npm run deploy`;
  3. якщо додано нові файли в `migrations/`, спершу `npm run db:migrate:remote`.
