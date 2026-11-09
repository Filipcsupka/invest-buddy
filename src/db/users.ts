import type pg from "pg";

export type UserId = string;
export interface CustomerUser {
  id: UserId;
  email: string;
  name: string;
  locale: "en" | "sk";
  emailVerified: boolean;
  createdAt: Date;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  locale: "en" | "sk";
  email_verified: boolean;
  created_at: Date;
}

const columns = "id::text, email, name, locale, email_verified, created_at";
const toUser = (row: UserRow): CustomerUser => ({
  id: row.id, email: row.email, name: row.name, locale: row.locale,
  emailVerified: row.email_verified, createdAt: row.created_at,
});

export async function findUserByEmail(db: Pick<pg.Pool, "query">, email: string): Promise<CustomerUser | null> {
  const result = await db.query<UserRow>(`SELECT ${columns} FROM users WHERE lower(email) = $1 LIMIT 1`, [email.trim().toLowerCase()]);
  return result.rows[0] ? toUser(result.rows[0]) : null;
}

/** Inserts a customer, or adopts the existing account with the same email. */
export async function createUser(db: Pick<pg.Pool, "query">, input: { email: string; name?: string; locale?: "en" | "sk" }): Promise<CustomerUser> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("email is required");
  const result = await db.query<UserRow>(
    `INSERT INTO users (email, name, locale) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING RETURNING ${columns}`,
    [email, input.name ?? "", input.locale ?? "en"],
  );
  if (result.rows[0]) return toUser(result.rows[0]);
  const existing = await findUserByEmail(db, email);
  if (!existing) throw new Error("user insert conflicted without an email match");
  return existing;
}

export async function linkAccount(db: Pick<pg.Pool, "query">, input: { userId: UserId; providerId: string; accountId: string }): Promise<boolean> {
  const result = await db.query(
    `INSERT INTO auth_accounts (user_id, provider_id, account_id) VALUES ($1, $2, $3)
     ON CONFLICT (provider_id, account_id) DO NOTHING`,
    [input.userId, input.providerId, input.accountId],
  );
  return (result.rowCount ?? 0) === 1;
}

export async function recordConsent(db: Pick<pg.Pool, "query">, input: { userId: UserId; kind: "terms" | "marketing"; version: string; granted: boolean }): Promise<void> {
  await db.query(
    `WITH consent AS (
       INSERT INTO user_consents (user_id, kind, version, granted)
       VALUES ($1, $2, $3, $4) RETURNING user_id
     )
     UPDATE users SET
       terms_accepted_at = CASE WHEN $2 = 'terms' AND $4 THEN now() ELSE terms_accepted_at END,
       terms_version = CASE WHEN $2 = 'terms' AND $4 THEN $3 ELSE terms_version END,
       marketing_consent_at = CASE WHEN $2 = 'marketing' THEN CASE WHEN $4 THEN now() ELSE NULL END ELSE marketing_consent_at END,
       marketing_consent_version = CASE WHEN $2 = 'marketing' THEN $3 ELSE marketing_consent_version END
     WHERE id = (SELECT user_id FROM consent)`,
    [input.userId, input.kind, input.version, input.granted],
  );
}

/** Hard delete removes auth, entitlement, billing and consent rows by cascade. */
export async function deleteUser(db: Pick<pg.Pool, "connect">, userId: UserId): Promise<boolean> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ email: string }>("SELECT email FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (user.rows[0]) {
      // Better Auth 1.7.18 stores magic-link records as JSON with the email in value.
      await client.query(
        `DELETE FROM auth_verifications
         WHERE identifier LIKE 'magic-link:%' AND lower(value::jsonb ->> 'email') = lower($1)`,
        [user.rows[0].email],
      );
    }
    // The legacy subscriptions FK from migration 001 does not cascade.
    await client.query("DELETE FROM subscriptions WHERE user_id = $1", [userId]);
    const result = await client.query("DELETE FROM users WHERE id = $1", [userId]);
    await client.query("COMMIT");
    return (result.rowCount ?? 0) === 1;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
