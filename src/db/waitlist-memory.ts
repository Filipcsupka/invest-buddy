import { CONFIRM_TOKEN_DAYS, RESEND_AFTER_HOURS, normalizeEmail, type ConfirmResult, type CountRow, type SignupInput, type UnsubscribeResult, type WaitlistLocale, type WaitlistRepository, type WaitlistStatus } from "./waitlist";

interface Row extends SignupInput {
  id: number;
  status: WaitlistStatus;
  tokenExpiresAt: number | null;
  sentAt: number;
  consentAt: number;
}

/** In-memory twin of the Postgres repository, for tests of routes and templates. Same rules, no persistence. */
export class MemoryWaitlistRepository implements WaitlistRepository {
  readonly rows: Row[] = [];
  constructor(private readonly clock: () => number = Date.now) {}

  async create(input: SignupInput): Promise<{ id?: number }> {
    const email = normalizeEmail(input.email);
    const now = this.clock();
    const old = this.rows.find((row) => row.email === email);
    const fresh = { ...input, email, tokenExpiresAt: now + CONFIRM_TOKEN_DAYS * 86_400_000, sentAt: now, consentAt: now, status: "pending" as const };
    if (!old) { const id = this.rows.length + 1; this.rows.push({ ...fresh, id }); return { id }; }
    if (old.status !== "pending" || old.sentAt > now - RESEND_AFTER_HOURS * 3_600_000) return {};
    Object.assign(old, fresh);
    return { id: old.id };
  }

  async confirmationsSince(hours: number): Promise<number> {
    const from = this.clock() - hours * 3_600_000;
    return this.rows.filter((row) => row.sentAt > from).length;
  }

  async releaseConfirmation(id: number): Promise<void> {
    const row = this.rows.find((r) => r.id === id);
    if (row?.status === "pending") row.sentAt = this.clock() - (RESEND_AFTER_HOURS + 1) * 3_600_000;
  }

  async peekConfirm(tokenHash: string) {
    const row = this.rows.find((r) => r.tokenHash === tokenHash);
    if (!row || row.status === "unsubscribed") return "invalid" as const;
    if (row.status === "confirmed") return "already" as const;
    return (row.tokenExpiresAt ?? 0) > this.clock() ? "valid" as const : "expired" as const;
  }

  async confirm(tokenHash: string): Promise<ConfirmResult> {
    const state = await this.peekConfirm(tokenHash);
    if (state !== "valid") return { status: state };
    const row = this.rows.find((r) => r.tokenHash === tokenHash)!;
    row.status = "confirmed";
    return { status: "confirmed", person: { id: row.id, email: row.email, locale: row.locale, consentWeekly: row.consentWeekly } };
  }

  async unsubscribe(id: number): Promise<UnsubscribeResult> {
    const row = this.rows.find((r) => r.id === id);
    if (!row) return { status: "invalid" };
    const already = row.status === "unsubscribed";
    row.status = "unsubscribed";
    row.tokenHash = "";
    return { status: already ? "already" : "unsubscribed", person: { id: row.id, email: row.email, locale: row.locale, consentWeekly: row.consentWeekly } };
  }

  async counts(): Promise<CountRow[]> {
    const map = new Map<string, CountRow>();
    for (const row of this.rows) {
      const key = [row.status, row.locale, row.source ?? "", row.priceVariant ?? "", row.consentWeekly].join("|");
      const hit = map.get(key);
      if (hit) hit.count += 1;
      else map.set(key, { status: row.status, locale: row.locale as WaitlistLocale, source: row.source ?? "", priceVariant: row.priceVariant ?? "", consentWeekly: row.consentWeekly, count: 1 });
    }
    return [...map.values()];
  }
}
