import { adminIds, userSettings } from "../config.js";
import { seedTemplates } from "../db/templates.js";
import { getUser, upsertUser } from "../db/users.js";
import { notifyAdmins } from "./handlers/admin.js";
import { T } from "./texts.js";

/** Лише приватні чати й лише майстри зі статусом active. Адміни з ADMIN_IDS активуються автоматично. */
export async function access(ctx, next) {
  if (!ctx.from || ctx.chat?.type !== "private") return;
  const { db } = ctx;
  const profile = { id: ctx.from.id, firstName: ctx.from.first_name, username: ctx.from.username };
  let user = await getUser(db, ctx.from.id);

  if (adminIds(ctx.env).includes(ctx.from.id) && (user?.role !== "admin" || user?.status !== "active")) {
    user = await upsertUser(db, { ...profile, role: "admin", status: "active" });
    await seedTemplates(db, user.id);
  }

  if (!user) {
    user = await upsertUser(db, { ...profile, role: "tech", status: "pending" });
    await notifyAdmins(ctx, user);
    return ctx.reply(T.accessRequested);
  }
  if (user.status !== "active") {
    if (ctx.callbackQuery) await ctx.answerCallbackQuery();
    if (user.status === "pending") await ctx.reply(T.accessPending);
    return;
  }

  ctx.user = user;
  ctx.settings = userSettings(user);
  return next();
}
