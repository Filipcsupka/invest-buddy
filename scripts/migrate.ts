import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

export async function migrate(connectionString: string, directory = join(process.cwd(), "migrations")) {
  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(516377495)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const files = (await readdir(directory)).filter((name) => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
    for (const name of files) {
      const existing = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
      if (existing.rowCount) continue;
      await client.query(await readFile(join(directory, name), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      process.stdout.write(`Applied ${name}\n`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  migrate(connectionString).catch((error) => { console.error(error); process.exitCode = 1; });
}
