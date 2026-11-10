import { getPool, closePool } from "../src/db/pool";
import { findUserByEmail } from "../src/db/users";
import { hashPassword, validPassword } from "../src/auth/password";

async function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf("--email");
  const email = index < 0 ? undefined : args[index + 1];
  const password = process.env.CUSTOMER_NEW_PASSWORD;
  if (!email || !validPassword(password)) throw new Error("--email and a strong CUSTOMER_NEW_PASSWORD are required");
  const db = getPool();
  if (!db) throw new Error("DATABASE_URL is required");
  const user = await findUserByEmail(db, email);
  if (!user) throw new Error("User not found");
  if (!args.includes("--apply")) { process.stdout.write(`Dry run: reset password for user ${user.id}\n`); return; }
  const hash = await hashPassword(password);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [user.id]);
    const result = await client.query("UPDATE auth_accounts SET password = $2, updated_at = now() WHERE user_id = $1 AND provider_id = 'credential'", [user.id, hash]);
    if (result.rowCount !== 1) await client.query("INSERT INTO auth_accounts (user_id, account_id, provider_id, password) VALUES ($1, $1::text, 'credential', $2)", [user.id, hash]);
    await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [user.id]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
  process.stdout.write(`Password reset for user ${user.id}; sessions revoked\n`);
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : "Failed"}\n`); process.exitCode = 1; }).finally(() => closePool());
