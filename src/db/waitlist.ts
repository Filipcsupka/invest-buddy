import type pg from "pg";
import { getPool } from "./pool";

export type WaitlistStatus = "pending" | "confirmed" | "unsubscribed";
export type WaitlistLocale = "en" | "sk";

export interface SignupInput {
  email: string;
  locale: WaitlistLocale;
  source?: string | null;
  priceVariant?: string | null;
  consentLaunch: boolean;
  consentWeekly: boolean;
  consentTextVersion: string;
  tokenHash: string;
}

export interface WaitlistPerson { id: number; email: string; locale: WaitlistLocale; consentWeekly: boolean }
/** `already` means the address was confirmed before; repeating a link is not an error. */
export type ConfirmResult = { status: "confirmed"; person: WaitlistPerson } | { status: "already" | "expired" | "invalid" };
export type UnsubscribeResult = { status: "unsubscribed" | "already"; person: WaitlistPerson } | { status: "invalid" };
export interface CountRow { status: WaitlistStatus; locale: WaitlistLocale; source: string; priceVariant: string; consentWeekly: boolean; count: number }

export const CONFIRM_TOKEN_DAYS = 7;
export const RESEND_AFTER_HOURS = 24;
export const UNCONFIRMED_PURGE_DAYS = 14;

export interface WaitlistRepository {
  /** Creates a pending row. `id` is set only when a confirmation mail should go out; it is absent when a mail went out in the last 24 hours or the address is already confirmed. */
  create(input: SignupInput): Promise<{ id?: number }>;
  /** Lets the next sign-up send again, after a failed send. */
  releaseConfirmation(id: number): Promise<void>;
  /** Reads the state of a confirm token without changing anything, so a link scanner cannot confirm. */
  peekConfirm(tokenHash: string): Promise<"valid" | "already" | "expired" | "invalid">;
  confirm(tokenHash: string): Promise<ConfirmResult>;
  unsubscribe(id: number): Promise<UnsubscribeResult>;
  counts(): Promise<CountRow[]>;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

type PersonRow = { id: string | number; email: string; locale: WaitlistLocale; consent_weekly: boolean };
const person = (row: PersonRow): WaitlistPerson => ({ id: Number(row.id), email: row.email, locale: row.locale, consentWeekly: row.consent_weekly });

export class PostgresWaitlistRepository implements WaitlistRepository {
  constructor(private readonly pool: Pick<pg.Pool, "query">) {}

  async create(input: SignupInput): Promise<{ id?: number }> {
    // A repeat sign-up refreshes the token only when the last mail is over 24 hours old and the row is not confirmed.
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO waitlist_signups (email, locale, source, price_variant, consent_launch, consent_weekly, consent_text_version, token_hash, token_expires_at, confirmation_sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(days => $9), now())
       ON CONFLICT (email) DO UPDATE SET locale = EXCLUDED.locale, source = EXCLUDED.source, price_variant = EXCLUDED.price_variant,
         consent_launch = EXCLUDED.consent_launch, consent_weekly = EXCLUDED.consent_weekly, consent_text_version = EXCLUDED.consent_text_version,
         token_hash = EXCLUDED.token_hash, token_expires_at = EXCLUDED.token_expires_at, confirmation_sent_at = now(),
         status = 'pending', confirmed_at = NULL, unsubscribed_at = NULL
       WHERE waitlist_signups.status <> 'confirmed' AND waitlist_signups.confirmation_sent_at < now() - make_interval(hours => $10)
       RETURNING id`,
      [normalizeEmail(input.email), input.locale, input.source ?? null, input.priceVariant ?? null, input.consentLaunch, input.consentWeekly, input.consentTextVersion, input.tokenHash, CONFIRM_TOKEN_DAYS, RESEND_AFTER_HOURS],
    );
    return result.rows[0] ? { id: Number(result.rows[0].id) } : {};
  }

  async releaseConfirmation(id: number): Promise<void> {
    await this.pool.query("UPDATE waitlist_signups SET confirmation_sent_at = now() - make_interval(hours => $2) WHERE id = $1 AND status = 'pending'", [id, RESEND_AFTER_HOURS + 1]);
  }

  async peekConfirm(tokenHash: string) {
    const { rows } = await this.pool.query<{ status: WaitlistStatus; expired: boolean }>(
      "SELECT status, token_expires_at < now() AS expired FROM waitlist_signups WHERE token_hash = $1", [tokenHash]);
    const row = rows[0];
    if (!row || row.status === "unsubscribed") return "invalid";
    if (row.status === "confirmed") return "already";
    return row.expired ? "expired" : "valid";
  }

  async confirm(tokenHash: string): Promise<ConfirmResult> {
    const done = await this.pool.query<PersonRow>(
      `UPDATE waitlist_signups SET status = 'confirmed', confirmed_at = now()
       WHERE token_hash = $1 AND status = 'pending' AND token_expires_at > now() RETURNING id, email, locale, consent_weekly`, [tokenHash]);
    if (done.rows[0]) return { status: "confirmed", person: person(done.rows[0]) };
    const state = await this.peekConfirm(tokenHash);
    return { status: state === "valid" ? "invalid" : state };
  }

  async unsubscribe(id: number): Promise<UnsubscribeResult> {
    const done = await this.pool.query<PersonRow>(
      `UPDATE waitlist_signups SET status = 'unsubscribed', unsubscribed_at = now(), token_hash = NULL, token_expires_at = NULL
       WHERE id = $1 AND status <> 'unsubscribed' RETURNING id, email, locale, consent_weekly`, [id]);
    if (done.rows[0]) return { status: "unsubscribed", person: person(done.rows[0]) };
    const existing = await this.pool.query<PersonRow>("SELECT id, email, locale, consent_weekly FROM waitlist_signups WHERE id = $1", [id]);
    return existing.rows[0] ? { status: "already", person: person(existing.rows[0]) } : { status: "invalid" };
  }

  async counts(): Promise<CountRow[]> {
    const { rows } = await this.pool.query<{ status: WaitlistStatus; locale: WaitlistLocale; source: string; price_variant: string; consent_weekly: boolean; count: number }>(
      `SELECT status, locale, coalesce(source, '') AS source, coalesce(price_variant, '') AS price_variant, consent_weekly, count(*)::int AS count
       FROM waitlist_signups GROUP BY 1, 2, 3, 4, 5 ORDER BY 1, 2, 3, 4, 5`);
    return rows.map((row) => ({ status: row.status, locale: row.locale, source: row.source, priceVariant: row.price_variant, consentWeekly: row.consent_weekly, count: row.count }));
  }
}

/** The shared web pool, or null without DATABASE_URL. */
export function waitlistRepository(): WaitlistRepository | null {
  const pool = getPool();
  return pool ? new PostgresWaitlistRepository(pool) : null;
}
