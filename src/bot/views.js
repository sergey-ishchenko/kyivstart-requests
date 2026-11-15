// Форматування повідомлень і inline-клавіатур. Повертає { text, reply_markup }.

import { InlineKeyboard } from "grammy";
import { escapeHtml, truncate } from "../lib/html.js";
import { formatHM, fromSqlUtc, kyivNow } from "../lib/time.js";
import { navigationLinks, routeLinks } from "../services/mapLinks.js";
import { L, T } from "./texts.js";

export const markerOf = (t) => t.marker ?? (t.priority === 1 ? "🟢" : "🟡");
export const typeLabel = (t) => T.typeLabel[t.type] ?? (t.type_raw || T.typeOther);
const doneTime = (t) => (t.done_at ? formatHM(kyivNow(fromSqlUtc(t.done_at)).minutes) : "");
const geoMark = (t) => ({ approx: " 📍≈", not_found: " ⚠️", pending: " ⏳" })[t.geo_status] ?? "";
const km = (m) => (m / 1000).toFixed(1).replace(".", ",");

/** Текст звіту для копіювання (copy_text — до 256 символів). */
export const reportText = (number, text) => `заявка #${number} ${text}`.slice(0, 256);

export function ticketCard(t, { note } = {}) {
  const lines = [
    `${markerOf(t)} <b>${escapeHtml(t.number)}</b> · ${escapeHtml(typeLabel(t))}${t.visit_time ? ` · 🕒 ${t.visit_time}` : ""}`,
    `📍 ${escapeHtml(t.address_raw)}`,
  ];
  if (t.status === "open" && t.eta) lines.push(T.eta(t.eta));
  if (t.status === "open" && T.geoNote[t.geo_status]) lines.push(T.geoNote[t.geo_status]);
  if (t.report_text) lines.push(`📝 <code>${escapeHtml(t.report_text)}</code>`);
  if (t.status === "done") lines.push(T.doneAt(doneTime(t)));
  if (note) lines.push(note);
  if (note) return { text: lines.join("\n"), reply_markup: new InlineKeyboard() };

  const kb = new InlineKeyboard();
  if (t.status === "open") {
    const nav = navigationLinks(t);
    kb.url(L.google, nav.google).url(L.waze, nav.waze).row();
  }
  kb.copyText(L.copyNumber, t.number).text(L.report, `rep:${t.id}`).row();
  if (t.status === "open") {
    if (t.geo_status !== "found") kb.text(L.pin, `pin:${t.id}`).row();
    kb.text(L.done, `done:${t.id}`).text(L.later, `skip:${t.id}`);
  } else {
    kb.text(L.reopen, `undo:${t.id}`);
  }
  return { text: lines.join("\n"), reply_markup: kb };
}

export function openListView(open, doneToday) {
  if (!open.length) return { text: doneToday ? T.allDone(doneToday) : T.noOpen };
  const lines = [T.openTitle(open.length, doneToday), ""];
  const kb = new InlineKeyboard();
  open.forEach((t, i) => {
    lines.push(
      `${i + 1}. ${markerOf(t)} <code>${escapeHtml(t.number)}</code>${t.visit_time ? ` · 🕒${t.visit_time}` : ""}${t.eta ? ` · ≈${t.eta}` : ""}`,
      `     ${escapeHtml(t.address_raw)}${geoMark(t)}`,
    );
    if (i < 60) {
      kb.text(`${i + 1} · ${t.number}`, `card:${t.id}`);
      if (i % 2 === 1) kb.row();
    }
  });
  return { text: lines.join("\n"), reply_markup: kb };
}

export function doneListView(done) {
  if (!done.length) return { text: T.noneDoneToday };
  const lines = [T.doneTitle(done.length), ""];
  const kb = new InlineKeyboard();
  done.forEach((t, i) => {
    lines.push(`• ${markerOf(t)} <code>${escapeHtml(t.number)}</code> · ${doneTime(t)} · ${escapeHtml(t.address_raw)}`);
    if (t.report_text) lines.push(`   📝 <code>${escapeHtml(t.report_text)}</code>`);
    if (i < 60) {
      kb.text(t.number, `card:${t.id}`);
      if (i % 2 === 1) kb.row();
    }
  });
  return { text: lines.join("\n"), reply_markup: kb };
}

/**
 * @param {object} p
 * @param {ReturnType<import("../domain/optimizer.js").planRoute>} p.plan
 * @param {Map<number, object>} p.byId заявки за id
 */
export function routeView({ plan, byId, unlocated, start, startLabel, dep, source }) {
  const lines = [
    T.routeHeader({
      count: plan.legs.length,
      km: km(plan.totalDistM),
      driveMin: Math.round(plan.totalDriveS / 60),
      startLabel,
      depart: formatHM(dep.minutes),
      tomorrow: dep.tomorrow,
      end: formatHM(plan.endMin),
    }),
  ];
  if (source === "approx") lines.push(T.routeApprox);
  lines.push("");
  plan.legs.forEach((leg, i) => {
    const t = byId.get(leg.id);
    lines.push(
      `${i + 1}. ${markerOf(t)} <code>${escapeHtml(t.number)}</code> · ≈${formatHM(leg.etaMin)}${t.visit_time ? ` (🕒${t.visit_time})` : ""}${leg.nearby ? T.routeNearby : ""}`,
      `     ${escapeHtml(t.address_raw)}${geoMark(t)}`,
    );
  });
  if (unlocated.length) {
    lines.push("", T.routeUnlocated);
    for (const t of unlocated) lines.push(`• ${markerOf(t)} <code>${escapeHtml(t.number)}</code> · ${escapeHtml(t.address_raw)}`);
  }

  const kb = new InlineKeyboard().text(L.start, "next").row();
  routeLinks(start, plan.legs.map((l) => byId.get(l.id))).forEach((link, i) => {
    kb.url(`🧭 ${link.from}–${link.to}`, link.url);
    if (i % 3 === 2) kb.row();
  });
  return { text: lines.join("\n"), reply_markup: kb };
}

export function geoReportView(open) {
  const problems = open.filter((t) => t.geo_status === "approx" || t.geo_status === "not_found");
  const kb = new InlineKeyboard();
  if (!problems.length) return { text: T.geoAllFound(open.length), reply_markup: kb.text(L.buildRoute, "route") };
  const lines = [T.geoProblems(open.length - problems.length, open.length), ""];
  for (const t of problems.slice(0, 20)) {
    lines.push(`• ${markerOf(t)} <code>${escapeHtml(t.number)}</code> · ${escapeHtml(t.address_raw)}${geoMark(t)}`);
    kb.text(`📍 ${truncate(t.address_raw, 32)}`, `pin:${t.id}`).row();
  }
  kb.text(L.buildRoute, "route");
  return { text: lines.join("\n"), reply_markup: kb };
}

export function reportPicker(t, templates) {
  const kb = new InlineKeyboard();
  for (const tpl of templates) kb.text(truncate(tpl.text, 40), `rpt:${t.id}:${tpl.id}`).row();
  kb.text(L.customText, `rpc:${t.id}`).text(L.templatesShort, "tpl:list");
  return { text: T.reportPick(markerOf(t), t.number), reply_markup: kb };
}

export function reportResult(t) {
  const kb = new InlineKeyboard().copyText(L.copy, t.report_text).row();
  if (t.status === "open") kb.text(L.done, `rdone:${t.id}`);
  kb.text(L.changeReport, `rep:${t.id}`);
  return { text: T.reportReady(t.report_text), reply_markup: kb };
}

export function settingsView(user, settings, templatesCount) {
  const kb = new InlineKeyboard()
    .text(L.setHome, "set:home")
    .row()
    .text(T.settingButtons.serviceMin(settings.serviceMin), "set:serviceMin")
    .text(T.settingButtons.nearbyRadiusM(settings.nearbyRadiusM), "set:nearbyRadiusM")
    .text(T.settingButtons.workdayStart(settings.workdayStart), "set:workdayStart")
    .row()
    .text(L.templates, "tpl:list")
    .row()
    .text(L.clear, "clr:ask");
  return {
    text: T.settings({ ...settings, hasHome: user.home_lat != null, templates: templatesCount }),
    reply_markup: kb,
  };
}

export function templatesView(templates) {
  const kb = new InlineKeyboard();
  for (const tpl of templates) kb.text(`❌ ${truncate(tpl.text, 35)}`, `tpl:del:${tpl.id}`).row();
  kb.text(L.add, "tpl:add").text(L.toSettings, "set:show");
  return { text: T.templatesView(templates), reply_markup: kb };
}
