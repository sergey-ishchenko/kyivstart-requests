import { splitMessage } from "../lib/html.js";

export const HTML = { parse_mode: "HTML" };

/** Відправка подання { text, reply_markup }; довгий текст ділиться, клавіатура — в останній частині. */
export async function replyView(ctx, view, extra = {}) {
  const parts = splitMessage(view.text);
  for (let i = 0; i < parts.length; i++) {
    const last = i === parts.length - 1;
    await ctx.reply(parts[i], { ...HTML, ...extra, ...(last && view.reply_markup ? { reply_markup: view.reply_markup } : {}) });
  }
}

/** Редагування повідомлення, з якого натиснули кнопку; «message is not modified» — не помилка. */
export async function editView(ctx, view) {
  try {
    await ctx.editMessageText(view.text, { ...HTML, reply_markup: view.reply_markup });
  } catch (err) {
    if (/message is not modified/i.test(err?.description ?? err?.message ?? "")) return;
    // повідомлення застаре або задовге для редагування — шлемо нове
    await replyView(ctx, view);
  }
}

export const matchId = (ctx, group = 1) => Number(ctx.match[group]);
