import { DEFAULT_TEMPLATES } from "../config.js";

export async function listTemplates(db, userId) {
  const { results } = await db
    .prepare("SELECT id, text FROM templates WHERE user_id = ? ORDER BY sort, id")
    .bind(userId)
    .all();
  return results;
}

export function getTemplate(db, userId, id) {
  return db.prepare("SELECT id, text FROM templates WHERE id = ? AND user_id = ?").bind(id, userId).first();
}

export async function addTemplates(db, userId, texts) {
  if (!texts.length) return;
  const stmt = db.prepare(
    "INSERT INTO templates (user_id, text, sort) VALUES (?1, ?2, (SELECT COALESCE(MAX(sort), 0) + 1 FROM templates WHERE user_id = ?1))",
  );
  await db.batch(texts.map((t) => stmt.bind(userId, t)));
}

export function deleteTemplate(db, userId, id) {
  return db.prepare("DELETE FROM templates WHERE id = ? AND user_id = ?").bind(id, userId).run();
}

/** Стартовий набір шаблонів для нового майстра. */
export async function seedTemplates(db, userId) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM templates WHERE user_id = ?").bind(userId).first();
  if (!row?.n) await addTemplates(db, userId, DEFAULT_TEMPLATES);
}
