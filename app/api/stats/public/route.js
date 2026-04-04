import { getDb } from '@/lib/db/client.js';

export async function GET() {
  try {
    const db = await getDb();
    const result = await db.execute({ sql: 'SELECT COUNT(*) as total FROM questions', args: [] });
    const total = Number(result.rows[0].total);
    return Response.json({ total });
  } catch {
    return Response.json({ total: 0 });
  }
}
