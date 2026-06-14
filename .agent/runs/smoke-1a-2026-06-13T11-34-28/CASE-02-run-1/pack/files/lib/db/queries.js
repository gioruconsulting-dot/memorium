// Notes CRUD helpers (Chunk NOTES-3). Notes are documents rows with
// source_type='note'. Belt-and-braces: every UPDATE carries user_id AND
// source_type in WHERE even though routes already checked ownership.

import { db } from '@/lib/db/client';

export async function insertNote(userId) {
  const result = await db.execute({
    sql: `INSERT INTO documents (user_id, source_type, title, content, created_at)
          VALUES (?, 'note', 'Untitled note', '', datetime('now'))
          RETURNING id`,
    args: [userId],
  });
  return { id: result.rows[0].id };
}

export async function listNotes(userId) {
  const result = await db.execute({
    sql: `SELECT d.id, d.title, d.updated_at,
                 (SELECT COUNT(*) FROM questions q
                   WHERE q.document_id = d.id AND q.retired_at IS NULL) AS question_count
          FROM documents d
          WHERE d.user_id = ? AND d.source_type = 'note'
          ORDER BY d.updated_at DESC`,
    args: [userId],
  });
  return result.rows;
}

export async function getNoteById(id, userId) {
  const result = await db.execute({
    sql: `SELECT id, title, content, updated_at
          FROM documents
          WHERE id = ? AND user_id = ? AND source_type = 'note'`,
    args: [id, userId],
  });
  return result.rows[0] ?? null;
}

export async function updateNote(id, userId, updates) {
  const sets = [];
  const args = [];
  if (updates.title !== undefined) {
    sets.push('title = ?');
    args.push(updates.title);
  }
  if (updates.content !== undefined) {
    sets.push('content = ?');
    args.push(updates.content);
  }
  sets.push("updated_at = datetime('now')");
  args.push(id, userId);
  await db.execute({
    sql: `UPDATE documents SET ${sets.join(', ')}
          WHERE id = ? AND user_id = ? AND source_type = 'note'`,
    args,
  });
}
