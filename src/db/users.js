export function getUser(db, id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}

export function upsertUser(db, { id, firstName, username, role, status }) {
  return db
    .prepare(
      `INSERT INTO users (id, first_name, username, role, status) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         first_name = excluded.first_name, username = excluded.username,
         role = excluded.role, status = excluded.status, updated_at = datetime('now')
       RETURNING *`,
    )
    .bind(id, firstName ?? null, username ?? null, role, status)
    .first();
}

export function setUserStatus(db, id, status) {
  return db
    .prepare("UPDATE users SET status = ?, updated_at = datetime('now') WHERE id = ? RETURNING *")
    .bind(status, id)
    .first();
}

export function setHome(db, id, { lat, lon }) {
  return db
    .prepare("UPDATE users SET home_lat = ?, home_lon = ?, updated_at = datetime('now') WHERE id = ? RETURNING *")
    .bind(lat, lon, id)
    .first();
}

export function saveSettings(db, id, settings) {
  return db
    .prepare("UPDATE users SET settings = ?, updated_at = datetime('now') WHERE id = ? RETURNING *")
    .bind(JSON.stringify(settings), id)
    .first();
}

export async function listUsers(db) {
  const { results } = await db
    .prepare("SELECT * FROM users ORDER BY status = 'active' DESC, role, first_name")
    .all();
  return results;
}
