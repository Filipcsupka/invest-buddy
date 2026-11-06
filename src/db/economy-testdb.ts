import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type pg from "pg";
import { PGlite } from "@electric-sql/pglite";

export interface TestDb { db: PGlite; pool: pg.Pool }

let migrated: Promise<File | Blob> | null = null;

/** Applies every migration once per test file and returns a fresh copy of that database for each caller. */
export async function migratedTestDb(): Promise<TestDb> {
  migrated ??= (async () => {
    const seed = new PGlite();
    const dir = join(process.cwd(), "migrations");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql")).sort()) await seed.exec(readFileSync(join(dir, file), "utf8"));
    const dump = await seed.dumpDataDir();
    await seed.close();
    return dump;
  })();
  const db = new PGlite({ loadDataDir: await migrated });
  const query = async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? 0 };
  };
  return { db, pool: { query, connect: async () => ({ query, release() {} }) } as unknown as pg.Pool };
}
