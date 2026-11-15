// Розбір адреси заявки на вулицю / будинок / квартиру і ключ для кешу геокодингу.

const LETTER = "[а-яіїєґa-z]";

const STREET_TYPES = [
  ["вулиця", /^(?:вулиця|улица)\s+|^(?:вул|ул)(?:\.\s*|\s+)/iu],
  ["провулок", /^(?:провулок|переулок)\s+|^(?:пров|пер)(?:\.\s*|\s+)/iu],
  ["проспект", /^проспект\s+|^(?:просп|пр-т)(?:\.\s*|\s+)/iu],
  ["бульвар", /^бульвар\s+|^(?:бульв|б-р)(?:\.\s*|\s+)/iu],
  ["площа", /^(?:площа|площадь)\s+|^пл(?:\.\s*|\s+)/iu],
  ["мікрорайон", /^(?:мікрорайон|микрорайон)\s+|^(?:мкрн|мкр-н|мкр)(?:\.\s*|\s+)/iu],
  ["проїзд", /^(?:проїзд|проезд)\s+|^пр-д(?:\.\s*|\s+)/iu],
  ["тупик", /^тупик\s+|^туп(?:\.\s*|\s+)/iu],
];

const TRAILING_STREET_TYPE = /\s+(?:вулиця|вул\.?)$/iu;
const HOUSE_PREFIX = String.raw`(?:буд(?:инок)?\.?\s*|д\.\s*|№\s*)?`;
const HOUSE_BODY = String.raw`(\d{1,4})\s*(?:[-/]\s*(\d{1,4}))?\s*-?\s*(${LETTER})?(?:\s*,?\s*корп(?:ус)?\.?\s*(\d{1,3}))?`;
const HOUSE_RE = new RegExp(`^${HOUSE_PREFIX}${HOUSE_BODY}$`, "iu");
// «Свемівська 4а» без коми між вулицею і будинком
const STREET_WITH_HOUSE_RE = new RegExp(`^(.*?\\S)\\s+(${HOUSE_PREFIX}\\d{1,4}(?:\\s*[-/]\\s*\\d{1,4})?(?:\\s*-?\\s*${LETTER})?)$`, "iu");
const FLAT_RE = new RegExp(`(?:^|[\\s,])кв(?:артира)?\\.?\\s*№?\\s*(\\d{1,4}${LETTER}?)(?=$|[\\s,])`, "iu");
const EXTRA_RE = /(?:^|[\s,])(?:під'?їзд|под'?ъ?езд|п-д|поверх|пов\.|этаж|эт\.|офіс|оф\.)\s*№?\s*\d{1,3}/giu;

// латинські літери, схожі на кириличні, у номерах будинків («4a» → «4а»)
const LATIN_TO_CYRILLIC = { a: "а", b: "б", v: "в", g: "г", d: "д", e: "е" };

/** Прибирає невидимі символи, уніфікує пробіли й апострофи. */
export function cleanText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[​-‍⁠﻿️]/g, "")
    .replace(/[   \t]/g, " ")
    .replace(/[’ʼ`´‘]/g, "'")
    .replace(/ {2,}/g, " ")
    .trim();
}

/**
 * @param {string} raw напр. "Свемівська, 4, кв. 67"
 * @returns {{ street: string|null, streetType: string|null, house: string|null, flat: string|null,
 *             extra: string[], key: string|null, label: string|null }}
 */
export function parseAddress(raw) {
  let s = cleanText(raw);
  let flat = null;
  const extra = [];

  s = s.replace(FLAT_RE, (_, f) => {
    flat = f.toLowerCase();
    return ",";
  });
  s = s.replace(EXTRA_RE, (m) => {
    extra.push(m.replace(/^[\s,]+/, ""));
    return ",";
  });

  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { street: null, streetType: null, house: null, flat, extra, key: null, label: null };
  }

  let { street, streetType } = splitStreetType(parts[0]);
  let house = null;
  const rest = parts.slice(1);
  const houseIdx = rest.findIndex((p) => HOUSE_RE.test(p));
  if (houseIdx !== -1) {
    house = normalizeHouse(rest[houseIdx]);
    rest.splice(houseIdx, 1);
  } else {
    const m = STREET_WITH_HOUSE_RE.exec(street);
    if (m && !/^\d+$/.test(m[1])) {
      street = m[1];
      house = normalizeHouse(m[2]);
    }
  }
  extra.push(...rest);

  street = street.replace(/\s+(?:буд(?:инок)?\.?|д\.)$/iu, "").trim() || null;
  if (!street) {
    return { street: null, streetType, house, flat, extra, key: null, label: null };
  }
  const typePrefix = streetType && streetType !== "вулиця" ? `${streetType} ` : "";
  return {
    street,
    streetType,
    house,
    flat,
    extra,
    key: `${typePrefix}${normalizeStreet(street)}|${house ?? ""}`,
    label: house ? `${typePrefix}${street}, ${house}` : `${typePrefix}${street}`,
  };
}

function splitStreetType(part) {
  for (const [name, re] of STREET_TYPES) {
    if (re.test(part)) return { street: part.replace(re, "").trim(), streetType: name };
  }
  if (TRAILING_STREET_TYPE.test(part)) {
    return { street: part.replace(TRAILING_STREET_TYPE, "").trim(), streetType: "вулиця" };
  }
  return { street: part, streetType: null };
}

/** "4-А" → "4а", "4 / 2" → "4/2", "12 корп. 3" → "12к3". */
export function normalizeHouse(value) {
  const m = HOUSE_RE.exec(cleanText(value));
  if (!m) return cleanText(value).toLowerCase();
  const [, num, num2, letter, corp] = m;
  const l = letter ? (LATIN_TO_CYRILLIC[letter.toLowerCase()] ?? letter.toLowerCase()) : "";
  return `${Number(num)}${l}${num2 ? `/${Number(num2)}` : ""}${corp ? `к${Number(corp)}` : ""}`;
}

function normalizeStreet(street) {
  return street
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/['.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
