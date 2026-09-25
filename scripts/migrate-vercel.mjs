import { createClient } from "@libsql/client";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
try {
  process.loadEnvFile(".env.local");
} catch {}
if (!process.env.TURSO_DATABASE_URL)
  throw new Error("Database connection is not configured.");
const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});
await client.execute(
  "CREATE TABLE IF NOT EXISTS forum_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL)",
);
const journal = JSON.parse(
  await readFile("drizzle/meta/_journal.json", "utf8"),
);
for (const entry of journal.entries) {
  const sql = await readFile("drizzle/" + entry.tag + ".sql", "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");
  const existing = await client.execute({
    sql: "SELECT checksum FROM forum_migrations WHERE name=?",
    args: [entry.tag],
  });
  if (existing.rows.length) {
    if (existing.rows[0].checksum !== hash)
      throw new Error("Applied migration changed: " + entry.tag);
    continue;
  }
  await client.batch(
    [
      ...sql.split("--> statement-breakpoint").filter((s) => s.trim()),
      {
        sql: "INSERT INTO forum_migrations (name,checksum) VALUES (?,?)",
        args: [entry.tag, hash],
      },
    ],
    "write",
  );
  console.log("Applied " + entry.tag);
}
client.close();
