import { InlineKeyboard } from "grammy";
import { adminIds } from "../../config.js";
import { seedTemplates } from "../../db/templates.js";
import { getUser, listUsers, setUserStatus } from "../../db/users.js";
import { HTML, editView, matchId, replyView } from "../helpers.js";
import { mainMenu } from "../keyboards.js";
import { L, T, userLine } from "../texts.js";

export async function notifyAdmins(ctx, user) {
  const ids = adminIds(ctx.env);
  if (!ids.length) console.warn(T.noAdmins);
  const kb = new InlineKeyboard().text(L.allow, `adm:ok:${user.id}`).text(L.deny, `adm:no:${user.id}`);
  for (const id of ids) {
    await ctx.api
      .sendMessage(id, T.adminRequest(user), { ...HTML, reply_markup: kb })
      .catch((err) => console.warn(`admin ${id} notify failed: ${err.message}`));
  }
}

const isAdmin = (ctx) => ctx.user.role === "admin";

function usersView(users, selfId) {
  const kb = new InlineKeyboard();
  const lines = [T.usersTitle, ""];
  for (const u of users) {
    lines.push(`• ${userLine(u)} — ${u.role === "admin" ? "адмін" : T.userStatus[u.status]}`);
    if (u.id === selfId || u.role === "admin") continue;
    if (u.status === "active") kb.text(`⛔ ${u.first_name ?? u.id}`, `usr:off:${u.id}`).row();
    else kb.text(`✅ ${u.first_name ?? u.id}`, `usr:on:${u.id}`).row();
  }
  return { text: lines.join("\n"), reply_markup: kb };
}

export function registerAdmin(bot) {
  bot.callbackQuery(/^adm:(ok|no):(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery(T.adminOnly);
    await ctx.answerCallbackQuery();
    const allow = ctx.match[1] === "ok";
    const target = await setUserStatus(ctx.db, matchId(ctx, 2), allow ? "active" : "blocked");
    if (!target) return;
    if (allow) await seedTemplates(ctx.db, target.id);
    await ctx.api
      .sendMessage(target.id, allow ? T.accessGranted : T.accessDenied, { ...HTML, reply_markup: allow ? mainMenu() : undefined })
      .catch((err) => console.warn(`user ${target.id} notify failed: ${err.message}`));
    await editView(ctx, { text: allow ? T.adminGranted(target) : T.adminDenied(target) });
  });

  bot.command("users", async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply(T.adminOnly);
    await replyView(ctx, usersView(await listUsers(ctx.db), ctx.user.id));
  });

  bot.callbackQuery(/^usr:(on|off):(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return ctx.answerCallbackQuery(T.adminOnly);
    const target = await getUser(ctx.db, matchId(ctx, 2));
    if (!target) return ctx.answerCallbackQuery();
    if (target.role === "admin") return ctx.answerCallbackQuery(T.cannotBlockAdmin);
    await setUserStatus(ctx.db, target.id, ctx.match[1] === "on" ? "active" : "blocked");
    if (ctx.match[1] === "on") await seedTemplates(ctx.db, target.id);
    await ctx.answerCallbackQuery();
    await editView(ctx, usersView(await listUsers(ctx.db), ctx.user.id));
  });
}
