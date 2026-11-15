// Що бот чекає від майстра наступним повідомленням. Стан старший за 30 хв ігнорується,
// щоб, наприклад, завтрашній список заявок не потрапив у «свій текст звіту».

export const STATE = {
  routeStart: "route_start",
  home: "home",
  pin: "pin",
  reportText: "report_text",
  template: "template",
  lastLocation: "last_location",
};

export async function getState(db, userId) {
  const row = await db
    .prepare("SELECT action, payload FROM user_state WHERE user_id = ? AND updated_at > datetime('now', '-30 minutes')")
    .bind(userId)
    .first();
  if (!row) return null;
  try {
    return { action: row.action, payload: JSON.parse(row.payload) };
  } catch {
    return { action: row.action, payload: {} };
  }
}

export function setState(db, userId, action, payload = {}) {
  return db
    .prepare(
      `INSERT INTO user_state (user_id, action, payload) VALUES (?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET action = excluded.action, payload = excluded.payload, updated_at = datetime('now')`,
    )
    .bind(userId, action, JSON.stringify(payload))
    .run();
}

export function clearState(db, userId) {
  return db.prepare("DELETE FROM user_state WHERE user_id = ?").bind(userId).run();
}
