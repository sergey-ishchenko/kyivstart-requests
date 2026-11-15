// Бот + локальна D1 (Miniflare) + підмінений Telegram API: прогін апдейтів без мережі.

import { readdirSync, readFileSync } from "node:fs";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createBot } from "../../src/bot/createBot.js";

const BOT_INFO = {
  id: 999,
  is_bot: true,
  first_name: "TestBot",
  username: "test_bot",
  can_join_groups: false,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
};

async function applyMigrations(db) {
  for (const file of readdirSync("migrations").sort()) {
    const sql = readFileSync(`migrations/${file}`, "utf8").replace(/--.*$/gm, "");
    for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(stmt).run();
  }
}

export async function createHarness(extraEnv = {}) {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('') } }",
      d1Databases: ["DB"],
    }),
  );
  const db = await mf.getD1Database("DB");
  await applyMigrations(db);

  const env = { DB: db, BOT_TOKEN: "999:test", ADMIN_IDS: "1", ...extraEnv };
  const background = [];
  const bot = createBot(env, { botInfo: BOT_INFO, waitUntil: (p) => background.push(p) });

  const calls = [];
  let messageId = 1000;
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload });
    if (method === "sendMessage") {
      return { ok: true, result: { message_id: ++messageId, date: 0, chat: { id: payload.chat_id, type: "private" }, text: payload.text } };
    }
    return { ok: true, result: true };
  });

  let updateId = 1;
  const from = (id) => ({ id, is_bot: false, first_name: `User${id}`, username: `u${id}` });
  const chat = (id) => ({ id, type: "private" });

  const flush = async () => {
    while (background.length) await background.shift();
  };
  const handle = async (update) => {
    await bot.handleUpdate({ update_id: updateId++, ...update });
    await flush();
  };

  return {
    db,
    env,
    calls,
    /** Текстове повідомлення від користувача (команди отримують entity bot_command). */
    send: (userId, text) =>
      handle({
        message: {
          message_id: updateId,
          date: 0,
          chat: chat(userId),
          from: from(userId),
          text,
          ...(text.startsWith("/") ? { entities: [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }] } : {}),
        },
      }),
    location: (userId, lat, lon) =>
      handle({ message: { message_id: updateId, date: 0, chat: chat(userId), from: from(userId), location: { latitude: lat, longitude: lon } } }),
    press: (userId, data) =>
      handle({
        callback_query: {
          id: String(updateId),
          from: from(userId),
          chat_instance: "test",
          data,
          message: { message_id: 1, date: 0, chat: chat(userId), from: BOT_INFO, text: "…" },
        },
      }),
    /** Повідомлення, надіслані ботом (sendMessage + editMessageText). */
    outgoing: (chatId) =>
      calls.filter((c) => ["sendMessage", "editMessageText"].includes(c.method) && (chatId == null || c.payload.chat_id === chatId)),
    last: (chatId) =>
      calls.filter((c) => ["sendMessage", "editMessageText"].includes(c.method) && (chatId == null || c.payload.chat_id === chatId)).at(-1),
    reset: () => {
      calls.length = 0;
    },
    dispose: () => mf.dispose(),
  };
}

/** Усі кнопки inline-клавіатури повідомлення одним масивом. */
export const buttons = (call) => call?.payload?.reply_markup?.inline_keyboard?.flat() ?? [];
