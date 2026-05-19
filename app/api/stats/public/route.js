import { getDb } from '@/lib/db/client.js';

export async function GET() {
  try {
    const db = await getDb();
    // Public counter is always the non-flagged view: never count note-questions.
    const result = await db.execute({
      sql: `SELECT COUNT(*) as total FROM questions q
            JOIN documents d ON d.id = q.document_id
            WHERE d.source_type = 'uploaded'`,
      args: [],
    });
    const total = Number(result.rows[0].total);
    return Response.json({ total });
  } catch {
    return Response.json({ total: 0 });
  }
}
