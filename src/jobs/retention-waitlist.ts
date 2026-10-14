type Client = { query: (sql: string) => Promise<{ rows: { count: number }[]; rowCount: number | null }> };

/** Unconfirmed sign-ups whose last activity (sign-up or last confirmation mail, whichever is later) is over 14 days old. Confirmed and unsubscribed rows stay (an unsubscribe must keep the address so it is not mailed again). */
export const unconfirmedSignups = "FROM waitlist_signups WHERE status = 'pending' AND greatest(created_at, confirmation_sent_at) < now() - interval '14 days'";

/** Runs inside the caller's transaction; a dry run only counts. */
export async function purgeUnconfirmedWaitlist(client: Client, dryRun: boolean): Promise<number> {
  if (dryRun) return (await client.query(`SELECT count(*)::int AS count ${unconfirmedSignups}`)).rows[0].count;
  return (await client.query(`DELETE ${unconfirmedSignups}`)).rowCount ?? 0;
}
