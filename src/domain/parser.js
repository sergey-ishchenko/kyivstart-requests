// Розбір списку заявок з повідомлення диспетчера.
// Приклад рядка: «1.🟢 2262291418 — 09:01 | Свемівська, 4, кв. 67 (подкл)»

import { cleanText, parseAddress } from "./address.js";
import { parseHM, formatHM } from "../lib/time.js";

/** Емодзі — джерело істини для пріоритету: 1 — вищий, 2 — нижчий. */
const MARKER_PRIORITY = new Map([
  ["🟢", 1],
  ["🟩", 1],
  ["🟡", 2],
  ["🟨", 2],
  ["🟠", 2],
  ["🟧", 2],
]);

const LINE_RE =
  /^(?:\d{1,3}\s*[.)]\s*)?(?<marker>\p{Extended_Pictographic})?\s*[#№]?(?<number>\d{6,12})(?!\d)\s*(?:[—–-]+\s*)?(?:(?<time>\d{1,2}[:.]\d{2})(?!\d)\s*)?(?:(?<pipe>\|)\s*)?(?<rest>.*)$/u;

const TRAILING_TYPE_RE = /\(([^()]{1,30})\)\s*$/u;
const INNER_TYPE_RE = /\(\s*((?:под|під)к[^()]*|рем[^()]*)\)/iu;
const EDGE_SEPARATORS_RE = /^[\s|—–,-]+|[\s|—–,-]+$/gu;

/** @returns {'connect'|'repair'|'other'} */
export function classifyType(raw) {
  const s = String(raw ?? "").toLowerCase();
  if (/(?:под|під)к/u.test(s)) return "connect";
  if (/рем/u.test(s)) return "repair";
  return "other";
}

/**
 * @param {string} text текст повідомлення (може містити багато заявок і сторонні рядки)
 * @returns {{ tickets: ParsedTicket[], rejected: string[] }}
 *   rejected — рядки з номером заявки, які не вдалося розібрати
 *
 * @typedef {{ number: string, marker: string|null, priority: number, type: string, typeRaw: string|null,
 *             visitTime: string|null, addressRaw: string, address: ReturnType<typeof parseAddress> }} ParsedTicket
 */
export function parseTickets(text) {
  const byNumber = new Map();
  const rejected = [];

  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = cleanText(rawLine);
    if (!line) continue;
    const ticket = parseLine(line);
    if (ticket) byNumber.set(ticket.number, ticket);
    else if (/\d{6,}/.test(line)) rejected.push(line);
  }

  return { tickets: [...byNumber.values()], rejected };
}

function parseLine(line) {
  const m = LINE_RE.exec(line);
  if (!m) return null;
  const { marker = null, number, time, pipe, rest } = m.groups;

  const { typeRaw, address } = extractType(rest);
  const addressRaw = address.replace(EDGE_SEPARATORS_RE, "");
  if (!/\p{L}/u.test(addressRaw)) return null;
  // «2262291418 переобжим абон» — не заявка: немає ні часу, ні «|», ні типу
  if (!time && !pipe && !typeRaw) return null;

  const type = classifyType(typeRaw);
  const visitMin = parseHM(time);
  return {
    number,
    marker,
    priority: MARKER_PRIORITY.get(marker) ?? (type === "connect" ? 1 : 2),
    type,
    typeRaw,
    visitTime: visitMin == null ? null : formatHM(visitMin),
    addressRaw,
    address: parseAddress(addressRaw),
  };
}

function extractType(rest) {
  const trailing = TRAILING_TYPE_RE.exec(rest);
  // «(під'їзд 2)» у кінці — частина адреси, а не тип
  if (trailing && !(classifyType(trailing[1]) === "other" && /\d/.test(trailing[1]))) {
    return { typeRaw: trailing[1].trim(), address: rest.slice(0, trailing.index) };
  }
  const inner = INNER_TYPE_RE.exec(rest);
  if (inner) {
    return {
      typeRaw: inner[1].trim(),
      address: `${rest.slice(0, inner.index)} ${rest.slice(inner.index + inner[0].length)}`.replace(/\s+,/g, ","),
    };
  }
  return { typeRaw: null, address: rest };
}
