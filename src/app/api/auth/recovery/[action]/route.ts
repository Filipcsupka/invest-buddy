import { customerAuth, authSiteUrl } from "@/auth/server";
import { authClientIp, takeAuthLimit, validAuthOrigin } from "@/auth/rate-limit";
import { hashPassword, validPassword, verifyPassword } from "@/auth/password";
import { consumeRecoveryCode, regenerateRecoveryCodes, revealInitialRecoveryCodes } from "@/auth/recovery";
import { recoveryCodesPage } from "@/auth/recovery-page";
import { getPool } from "@/db/pool";
import { flags } from "@/config/flags";
import { mailerFromEnv } from "@/mail/mailer";
import { passwordResetNoticeMail } from "@/mail/templates/magic-link";

export const runtime = "nodejs";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };
const tooMany = () => Response.json({ error: "Too many requests" }, { status: 429, headers: { ...privateHeaders, "Retry-After": "3600" } });
const RESET_DONE = "If the details match, the password was reset.";

type Body = Record<string, unknown>;

/** Accepts the JSON body the sign-in UI sends and the form body the account page sends. */
async function readBody(request: Request): Promise<{ body: Body; form: boolean }> {
  const type = request.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return { body: await request.json().catch(() => ({})) as Body, form: false };
  const data = await request.formData().catch(() => new FormData());
  return { body: Object.fromEntries([...data.entries()].filter(([, value]) => typeof value === "string")), form: true };
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { ...privateHeaders, "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await params;
  if (!flags().AUTH) return new Response("Not found", { status: 404, headers: privateHeaders });
  if (!validAuthOrigin(request, authSiteUrl())) return new Response("Forbidden", { status: 403, headers: privateHeaders });
  const db = getPool();
  if (!db) return new Response("Unavailable", { status: 503, headers: privateHeaders });
  const { body, form } = await readBody(request);
  const locale = body.locale === "sk" ? "sk" : "en";

  if (action === "reveal" || action === "codes" || action === "regenerate") {
    const session = await customerAuth().api.getSession({ headers: request.headers, query: { disableCookieCache: true } });
    if (!session?.user?.id) return new Response("Sign in required", { status: 401, headers: privateHeaders });
    const userId = String(session.user.id);
    if (action === "reveal") return htmlResponse(recoveryCodesPage(await revealInitialRecoveryCodes(db, userId), locale));
    // JSON form of reveal for the sign-up screen. It shows the first set once and never makes a new set without the password.
    if (action === "codes") {
      const codes = await revealInitialRecoveryCodes(db, userId);
      return codes.length > 0
        ? Response.json({ codes }, { headers: privateHeaders })
        : Response.json({ code: "RECOVERY_CODES_ALREADY_SHOWN", error: "Recovery codes were already shown; generate a new set on the account page" }, { status: 409, headers: privateHeaders });
    }
    if (!await takeAuthLimit(db, "user", `regenerate:${userId}`, 10, 3600)) return tooMany();
    const result = await db.query<{ password: string | null }>("SELECT password FROM auth_accounts WHERE user_id = $1 AND provider_id = 'credential' LIMIT 1", [userId]);
    const hash = result.rows[0]?.password;
    const valid = typeof hash === "string" && typeof body.currentPassword === "string" && await verifyPassword({ hash, password: body.currentPassword });
    if (!valid) return form ? htmlResponse(recoveryCodesPage(null, locale), 403) : Response.json({ error: "Current password is incorrect" }, { status: 403, headers: privateHeaders });
    const codes = await regenerateRecoveryCodes(db, userId);
    return form ? htmlResponse(recoveryCodesPage(codes, locale)) : Response.json({ codes }, { headers: privateHeaders });
  }

  if (action !== "reset") return new Response("Not found", { status: 404, headers: privateHeaders });
  if (!await takeAuthLimit(db, "ip", `reset:${authClientIp(request.headers)}`, 10, 3600)) return tooMany();
  if (typeof body.email !== "string" || typeof body.code !== "string" || body.code.length > 64 || !validPassword(body.newPassword)) {
    return Response.json({ error: "Invalid request" }, { status: 400, headers: privateHeaders });
  }
  const email = body.email.trim().toLowerCase();
  if (!await takeAuthLimit(db, "email", `reset:${email}`, 5, 3600)) return tooMany();
  // Hash before the lookup so a known and an unknown email cost the same time.
  const hash = await hashPassword(body.newPassword);
  let notify: string | null = null;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string; email: string }>("SELECT id::text, email FROM users WHERE lower(email) = $1 AND deleted_at IS NULL FOR UPDATE", [email]);
    const userId = user.rows[0]?.id;
    // Only an existing password is replaced, never created: an account whose credential Better Auth removed on
    // magic-link proof (pre-hijack cleanup) must not get one back from a code issued before that proof.
    if (userId && await consumeRecoveryCode(client, userId, body.code)) {
      const updated = await client.query("UPDATE auth_accounts SET password = $2, updated_at = now() WHERE user_id = $1 AND provider_id = 'credential'", [userId, hash]);
      if (updated.rowCount === 1) {
        await client.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
        notify = user.rows[0].email;
      } else {
        await client.query("ROLLBACK");
        return Response.json({ status: RESET_DONE }, { headers: privateHeaders });
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  if (notify) {
    try { await mailerFromEnv().send(passwordResetNoticeMail({ to: notify, locale })); }
    catch (error) { console.error(JSON.stringify({ event: "auth_reset_notice_failed", message: error instanceof Error ? error.message : "send failed" })); }
  }
  return Response.json({ status: RESET_DONE }, { headers: privateHeaders });
}
