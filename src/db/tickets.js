const MAX_PARAMS = 90; // D1: ≤100 параметрів на запит

const OPEN_ORDER = "ORDER BY route_pos IS NULL, route_pos, priority, visit_time IS NULL, visit_time, id";

// Статус «виконано» і порядок маршруту при повторному завантаженні не змінюються.
const UPSERT_SQL = `
  INSERT INTO tickets (user_id, number, priority, marker, type, type_raw, visit_time, work_date,
                       address_raw, street, house, flat, address_key, lat, lon, geo_status)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
  ON CONFLICT (user_id, number) DO UPDATE SET
    priority = excluded.priority, marker = excluded.marker, type = excluded.type, type_raw = excluded.type_raw,
    visit_time = excluded.visit_time, work_date = excluded.work_date, address_raw = excluded.address_raw,
    street = excluded.street, house = excluded.house, flat = excluded.flat, address_key = excluded.address_key,
    lat = excluded.lat, lon = excluded.lon, geo_status = excluded.geo_status, updated_at = datetime('now')`;

export async function existingNumbers(db, userId, numbers) {
  const found = new Set();
  for (let i = 0; i < numbers.length; i += MAX_PARAMS) {
    const part = numbers.slice(i, i + MAX_PARAMS);
    const { results } = await db
      .prepare(`SELECT number FROM tickets WHERE user_id = ? AND number IN (${part.map(() => "?").join(",")})`)
      .bind(userId, ...part)
      .all();
    for (const r of results) found.add(r.number);
  }
  return found;
}

/**
 * @param {Array<import("../domain/parser.js").ParsedTicket & { geo: { lat, lon, status } }>} rows
 */
export async function upsertTickets(db, userId, rows, workDate) {
  const stmt = db.prepare(UPSERT_SQL);
  await db.batch(
    rows.map((t) =>
      stmt.bind(
        userId,
        t.number,
        t.priority,
        t.marker,
        t.type,
        t.typeRaw,
        t.visitTime,
        workDate,
        t.addressRaw,
        t.address.street,
        t.address.house,
        t.address.flat,
        t.address.key,
        t.geo.lat,
        t.geo.lon,
        t.geo.status,
      ),
    ),
  );
}

export function getTicket(db, userId, id) {
  return db.prepare("SELECT * FROM tickets WHERE id = ? AND user_id = ?").bind(id, userId).first();
}

export async function listOpen(db, userId) {
  const { results } = await db
    .prepare(`SELECT * FROM tickets WHERE user_id = ? AND status = 'open' ${OPEN_ORDER}`)
    .bind(userId)
    .all();
  return results;
}

export function nextOpen(db, userId) {
  return db
    .prepare(`SELECT * FROM tickets WHERE user_id = ? AND status = 'open' ${OPEN_ORDER} LIMIT 1`)
    .bind(userId)
    .first();
}

export async function listDoneSince(db, userId, sinceSqlUtc) {
  const { results } = await db
    .prepare("SELECT * FROM tickets WHERE user_id = ? AND status = 'done' AND done_at >= ? ORDER BY done_at DESC")
    .bind(userId, sinceSqlUtc)
    .all();
  return results;
}

export async function countDoneSince(db, userId, sinceSqlUtc) {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM tickets WHERE user_id = ? AND status = 'done' AND done_at >= ?")
    .bind(userId, sinceSqlUtc)
    .first();
  return row?.n ?? 0;
}

export function markDone(db, userId, id) {
  return db
    .prepare(
      `UPDATE tickets SET status = 'done', done_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND status = 'open'`,
    )
    .bind(id, userId)
    .run();
}

export function reopen(db, userId, id) {
  return db
    .prepare(
      `UPDATE tickets SET status = 'open', done_at = NULL, updated_at = datetime('now')
       WHERE id = ? AND user_id = ? AND status = 'done'`,
    )
    .bind(id, userId)
    .run();
}

export function setReport(db, userId, id, text) {
  return db
    .prepare("UPDATE tickets SET report_text = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ? RETURNING *")
    .bind(text, id, userId)
    .first();
}

/** @param {{ id: number, pos: number, eta: string|null }[]} positions */
export async function saveRoute(db, userId, positions) {
  if (!positions.length) return;
  const stmt = db.prepare("UPDATE tickets SET route_pos = ?, eta = ? WHERE id = ? AND user_id = ?");
  await db.batch(positions.map((p) => stmt.bind(p.pos, p.eta, p.id, userId)));
}

export function resetRoute(db, userId) {
  return db
    .prepare("UPDATE tickets SET route_pos = NULL, eta = NULL WHERE user_id = ? AND status = 'open'")
    .bind(userId)
    .run();
}

/** «Пізніше»: заявка йде в кінець поточного порядку. */
export async function moveToEnd(db, userId, id) {
  const open = await listOpen(db, userId);
  const order = [...open.filter((t) => t.id !== id), ...open.filter((t) => t.id === id)];
  await saveRoute(db, userId, order.map((t, i) => ({ id: t.id, pos: i + 1, eta: t.eta })));
}

export async function deleteTickets(db, userId, { onlyDone }) {
  const res = await db
    .prepare(`DELETE FROM tickets WHERE user_id = ?${onlyDone ? " AND status = 'done'" : ""}`)
    .bind(userId)
    .run();
  return res.meta?.changes ?? 0;
}

// ── геокодинг ──────────────────────────────────────────────────────────

export async function pendingAddresses(db, limit) {
  const { results } = await db
    .prepare(
      `SELECT address_key, MIN(address_raw) AS address_raw FROM tickets
       WHERE geo_status = 'pending' AND address_key IS NOT NULL
       GROUP BY address_key ORDER BY MIN(id) LIMIT ?`,
    )
    .bind(limit)
    .all();
  return results;
}

export function applyGeoStatement(db, key, { lat, lon, status }) {
  return db
    .prepare(
      `UPDATE tickets SET lat = ?, lon = ?, geo_status = ?, updated_at = datetime('now')
       WHERE address_key = ? AND geo_status = 'pending'`,
    )
    .bind(lat, lon, status, key);
}

/** Ручна точка: для всіх заявок з цією адресою (у всіх майстрів). */
export function applyManualPointStatement(db, ticket, { lat, lon }) {
  if (ticket.address_key) {
    return db
      .prepare("UPDATE tickets SET lat = ?, lon = ?, geo_status = 'found', updated_at = datetime('now') WHERE address_key = ?")
      .bind(lat, lon, ticket.address_key);
  }
  return db
    .prepare("UPDATE tickets SET lat = ?, lon = ?, geo_status = 'found', updated_at = datetime('now') WHERE id = ?")
    .bind(lat, lon, ticket.id);
}

/** Майстри, у яких серед цих адрес були заявки і більше нічого не чекає геокодингу. */
export async function usersWithFinishedGeocoding(db, keys) {
  if (!keys.length) return [];
  const { results } = await db
    .prepare(
      `SELECT user_id FROM tickets
       WHERE status = 'open' AND user_id IN (
         SELECT DISTINCT user_id FROM tickets WHERE address_key IN (${keys.map(() => "?").join(",")}))
       GROUP BY user_id HAVING SUM(geo_status = 'pending') = 0`,
    )
    .bind(...keys)
    .all();
  return results.map((r) => r.user_id);
}
