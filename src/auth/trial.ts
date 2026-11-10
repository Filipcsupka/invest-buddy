import { createHash, createHmac } from "node:crypto";
import type pg from "pg";
import { flags } from "@/config/flags";

export const TRIAL_DAYS = 14;

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

/**
 * Canonical mailbox for trial dedupe and per-email limits: NFKC, lowercase, `+tag` removed,
 * and for Gmail dots removed and googlemail.com folded into gmail.com.
 */
export function canonicalEmail(email: string): string {
  const value = email.normalize("NFKC").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at <= 0) return value;
  let local = value.slice(0, at);
  let domain = value.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (GMAIL_DOMAINS.has(domain)) { local = local.replace(/\./g, ""); domain = "gmail.com"; }
  return `${local}@${domain}`;
}

function claimKey(email: string): string {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) throw new Error("AUTH_SECRET is required");
  const key = createHash("sha256").update(`trial-claim:${process.env.AUTH_SECRET}`).digest();
  return createHmac("sha256", key).update(canonicalEmail(email)).digest("hex");
}

/**
 * Plus trial for a new account, no card. Gated by TRIAL only, so it can run while BILLING is off.
 * The claim row (HMAC of the canonical email, kept after account deletion) and the entitlement are written in one
 * statement, so an alias, a Gmail dot variant or a deleted and re-registered address gets no second trial.
 */
export async function grantFirstTrial(db: Pick<pg.Pool, "query">, userId: string, email: string, now = new Date()): Promise<boolean> {
  if (!flags().TRIAL) return false;
  const end = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
  const result = await db.query(
    `WITH claim AS (
       INSERT INTO trial_claims (email_hmac) VALUES ($4) ON CONFLICT (email_hmac) DO NOTHING RETURNING 1
     )
     INSERT INTO entitlements (user_id, tier, status, source, starts_at, ends_at)
     SELECT $1, 'plus', 'active', 'manual', $2, $3 WHERE EXISTS (SELECT 1 FROM claim)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, now, end, claimKey(email)],
  );
  return result.rowCount === 1;
}
