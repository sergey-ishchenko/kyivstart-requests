import { InlineKeyboard } from "grammy";
import { MAX_REPORT_TEXT, SETTING_CHOICES } from "../../config.js";
import { clearState, setState, STATE } from "../../db/state.js";
import { addTemplates, deleteTemplate, listTemplates } from "../../db/templates.js";
import { deleteTickets } from "../../db/tickets.js";
import { saveSettings } from "../../db/users.js";
import { editView, replyView } from "../helpers.js";
import { locationMenu } from "../keyboards.js";
import { BTN, L, T } from "../texts.js";
import { settingsView, templatesView } from "../views.js";

async function currentSettingsView(ctx) {
  const templates = await listTemplates(ctx.db, ctx.user.id);
  return settingsView(ctx.user, ctx.settings, templates.length);
}

/** Текст від майстра, коли бот чекає нові шаблони (кожен рядок — окремий шаблон). */
export async function handleTemplateText(ctx, text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/\s+/g, " ").slice(0, MAX_REPORT_TEXT))
    .filter(Boolean);
  await addTemplates(ctx.db, ctx.user.id, lines);
  await clearState(ctx.db, ctx.user.id);
  await ctx.reply(T.templatesAdded(lines.length));
  await replyView(ctx, templatesView(await listTemplates(ctx.db, ctx.user.id)));
}

export function registerSettings(bot) {
  const show = async (ctx) => replyView(ctx, await currentSettingsView(ctx));
  bot.command("settings", show);
  bot.hears(BTN.settings, show);
  bot.callbackQuery("set:show", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editView(ctx, await currentSettingsView(ctx));
  });

  bot.callbackQuery(new RegExp(`^set:(${Object.keys(SETTING_CHOICES).join("|")})$`), async (ctx) => {
    const field = ctx.match[1];
    const choices = SETTING_CHOICES[field];
    const next = choices[(choices.indexOf(ctx.settings[field]) + 1) % choices.length];
    ctx.user = await saveSettings(ctx.db, ctx.user.id, { ...ctx.settings, [field]: next });
    ctx.settings = { ...ctx.settings, [field]: next };
    await ctx.answerCallbackQuery();
    await editView(ctx, await currentSettingsView(ctx));
  });

  bot.callbackQuery("set:home", async (ctx) => {
    await ctx.answerCallbackQuery();
    await setState(ctx.db, ctx.user.id, STATE.home);
    await ctx.reply(T.homeAsk, { reply_markup: locationMenu(BTN.sendHome) });
  });

  // шаблони звітів
  bot.callbackQuery("tpl:list", async (ctx) => {
    await ctx.answerCallbackQuery();
    await replyView(ctx, templatesView(await listTemplates(ctx.db, ctx.user.id)));
  });
  bot.callbackQuery("tpl:add", async (ctx) => {
    await ctx.answerCallbackQuery();
    await setState(ctx.db, ctx.user.id, STATE.template);
    await ctx.reply(T.templateAsk);
  });
  bot.callbackQuery(/^tpl:del:(\d+)$/, async (ctx) => {
    await deleteTemplate(ctx.db, ctx.user.id, Number(ctx.match[1]));
    await ctx.answerCallbackQuery();
    await editView(ctx, templatesView(await listTemplates(ctx.db, ctx.user.id)));
  });

  // очищення заявок
  bot.callbackQuery("clr:ask", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editView(ctx, {
      text: T.clearAsk,
      reply_markup: new InlineKeyboard().text(L.clearDone, "clr:done").text(L.clearAll, "clr:all").row().text(L.cancel, "set:show"),
    });
  });
  bot.callbackQuery("clr:all", async (ctx) => {
    await ctx.answerCallbackQuery();
    await editView(ctx, {
      text: T.clearAllAsk,
      reply_markup: new InlineKeyboard().text(L.clearAllConfirm, "clr:all!").text(L.cancel, "set:show"),
    });
  });
  bot.callbackQuery(/^clr:(done|all!)$/, async (ctx) => {
    const n = await deleteTickets(ctx.db, ctx.user.id, { onlyDone: ctx.match[1] === "done" });
    await ctx.answerCallbackQuery();
    await editView(ctx, { text: T.cleared(n) });
  });
}
