import { createClient } from "@libsql/client";

let db;

export function getDb() {
  if (db) return db;

  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "TURSO_DATABASE_URL is not set. Add it to your .env.local file."
    );
  }

  db = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  // Enable foreign key enforcement
  db.execute("PRAGMA foreign_keys = ON");

  return db;
}
