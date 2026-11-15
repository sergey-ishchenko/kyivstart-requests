import { TICKET_RETENTION_DAYS } from "../config.js";

export async function cleanup(env) {
  const db = env.DB;
  await db.batch([
    db.prepare("DELETE FROM tickets WHERE work_date < date('now', ?)").bind(`-${TICKET_RETENTION_DAYS} days`),
    db.prepare("DELETE FROM user_state WHERE updated_at < datetime('now', '-1 day')"),
  ]);
}
