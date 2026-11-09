import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import type pg from "pg";

export const RECOVERY_COUNT = 10;

function secret(): Buffer {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET is required");
  return createHash("sha256").update(`recovery:${process.env.AUTH_SECRET}`).digest();
}

function codeHash(code: string): string {
  return createHmac("sha256", secret()).update(code.replace(/-/g, "").toUpperCase()).digest("hex");
}

function seal(code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function open(value: string): string {
  const bytes = Buffer.from(value, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", secret(), bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8");
}

function newCodes(): string[] {
  return Array.from({ length: RECOVERY_COUNT }, () => randomBytes(16).toString("hex").toUpperCase().match(/.{1,4}/g)!.join("-"));
}

/** Called once after a user row is created. Ciphertext is removed on first account display. */
export async function createInitialRecoveryCodes(db: Pick<pg.Pool, "query">, userId: string): Promise<void> {
  const codes = newCodes();
  for (const code of codes) await db.query(
    "INSERT INTO user_recovery_codes (user_id, code_hash, reveal_ciphertext) VALUES ($1, $2, $3)",
    [userId, codeHash(code), seal(code)],
  );
}

/** Atomic reveal; no second page view can recover plaintext. */
export async function revealInitialRecoveryCodes(db: Pick<pg.Pool, "query">, userId: string): Promise<string[]> {
  const result = await db.query<{ reveal_ciphertext: string }>(
    `WITH codes AS (SELECT id, reveal_ciphertext FROM user_recovery_codes WHERE user_id = $1 AND reveal_ciphertext IS NOT NULL FOR UPDATE),
     cleared AS (UPDATE user_recovery_codes SET reveal_ciphertext = NULL WHERE id IN (SELECT id FROM codes) RETURNING id)
     SELECT codes.reveal_ciphertext FROM codes JOIN cleared USING (id)`,
    [userId],
  );
  return result.rows.map((row) => open(row.reveal_ciphertext));
}

export async function remainingRecoveryCodes(db: Pick<pg.Pool, "query">, userId: string): Promise<number> {
  const result = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM user_recovery_codes WHERE user_id = $1 AND used_at IS NULL", [userId],
  );
  return result.rows[0]?.count ?? 0;
}

export async function regenerateRecoveryCodes(db: Pick<pg.Pool, "connect">, userId: string): Promise<string[]> {
  const codes = newCodes();
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM user_recovery_codes WHERE user_id = $1", [userId]);
    for (const code of codes) await client.query("INSERT INTO user_recovery_codes (user_id, code_hash) VALUES ($1, $2)", [userId, codeHash(code)]);
    await client.query("COMMIT");
    return codes;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}

export async function consumeRecoveryCode(client: Pick<pg.PoolClient, "query">, userId: string, code: string): Promise<boolean> {
  // The lookup is by keyed digest, so response time does not depend on how much of a code matches.
  const digest = codeHash(code);
  const result = await client.query(
    "UPDATE user_recovery_codes SET used_at = now(), reveal_ciphertext = NULL WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL",
    [userId, digest],
  );
  return result.rowCount === 1;
}

/** True while the first set has not been shown yet. */
export async function hasUnrevealedRecoveryCodes(db: Pick<pg.Pool, "query">, userId: string): Promise<boolean> {
  const result = await db.query("SELECT 1 FROM user_recovery_codes WHERE user_id = $1 AND reveal_ciphertext IS NOT NULL LIMIT 1", [userId]);
  return result.rows.length > 0;
}
