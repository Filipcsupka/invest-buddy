import { betterAuth, type BetterAuthOptions } from "better-auth";
import type pg from "pg";
import { magicLink } from "better-auth/plugins";
import { getPool } from "@/db/pool";
import { recordConsent } from "@/db/users";
import { mailerFromEnv } from "@/mail/mailer";
import { magicLinkMail, verifyEmailMail } from "@/mail/templates/magic-link";
import { grantFirstTrial } from "./trial";
import { CUSTOMER_COOKIE_BASE, customerCookieName } from "./cookie";
import { flags, type Flags } from "@/config/flags";
import { createInitialRecoveryCodes } from "./recovery";

export { CUSTOMER_SESSION_COOKIE } from "./cookie";
export const SESSION_DAYS = 30;
/** Cookie cache lifetime. A revoked or deleted session can stay readable from the cache for this long. */
export const SESSION_CACHE_SECONDS = 60;
export const TERMS_VERSION = "2026-11-launch-1";

export function authSiteUrl(): string {
  const raw = process.env.AUTH_URL ?? process.env.SITE_URL;
  if (!raw) throw new Error("AUTH_URL or SITE_URL is required");
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.hostname === "localhost")) throw new Error("AUTH_URL must use HTTPS");
  return url.origin;
}

/**
 * Refuses unsafe flag combinations. MAGIC_LINK creates accounts from an email alone, so it needs EMAIL_VERIFY: password
 * accounts then cannot sign in or get a trial before the address is proven, and duplicate sign-ups get a generic response.
 */
export function assertAuthConfig(current: Flags = flags()): void {
  if (current.MAGIC_LINK && !current.EMAIL_VERIFY) throw new Error("MAGIC_LINK=on requires EMAIL_VERIFY=on");
}

type GoogleOptions = NonNullable<NonNullable<BetterAuthOptions["socialProviders"]>["google"]>;
/** Test seam: replaces the Google provider config, for example to stub id-token verification. */
export interface AuthOverrides { google?: GoogleOptions }

// Better Auth endpoint paths seen in database hook context.
const SIGN_UP_PATH = "/sign-up/email";
const MAGIC_LINK_VERIFY_PATH = "/magic-link/verify";
const VERIFY_EMAIL_PATH = "/verify-email";

export function createAuth(pool?: pg.Pool, overrides: AuthOverrides = {}) {
  const db = pool ?? getPool();
  if (!db) throw new Error("DATABASE_URL is required for customer auth");
  assertAuthConfig();
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be at least 32 characters");
  const baseURL = authSiteUrl();
  const currentFlags = flags();
  const secure = baseURL.startsWith("https:");
  const cookie = (kind: "session" | "session_data" | "dont_remember" | "account_data") => ({
    name: customerCookieName(kind, secure),
    attributes: { secure, sameSite: "lax" as const, path: "/", httpOnly: true },
  });
  return betterAuth({
    baseURL,
    secret,
    database: db,
    trustedOrigins: [baseURL],
    telemetry: { enabled: false },
    socialProviders: overrides.google ? { google: overrides.google } : process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
      google: { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET },
    } : {},
    emailAndPassword: { enabled: true, minPasswordLength: 10, requireEmailVerification: currentFlags.EMAIL_VERIFY },
    emailVerification: { sendVerificationEmail: async ({ user, url }) => {
      await mailerFromEnv().send(verifyEmailMail({ to: user.email, url, locale: "en" }));
    } },
    advanced: {
      database: { generateId: "serial" },
      // useSecureCookies would add a __Secure- prefix in front of our __Host- names (ADR gotcha 1).
      useSecureCookies: false,
      // Better Auth skips the origin check under NODE_ENV=test by default; keep it on everywhere.
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: CUSTOMER_COOKIE_BASE,
      defaultCookieAttributes: { secure, sameSite: "lax", path: "/", httpOnly: true },
      cookies: { session_token: cookie("session"), session_data: cookie("session_data"), dont_remember: cookie("dont_remember"), account_data: cookie("account_data") },
      ipAddress: { ipAddressHeaders: ["x-auth-client-ip"] },
    },
    user: { modelName: "users", fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" } },
    session: {
      modelName: "auth_sessions",
      fields: { userId: "user_id", expiresAt: "expires_at", ipAddress: "ip_address", userAgent: "user_agent", createdAt: "created_at", updatedAt: "updated_at" },
      expiresIn: SESSION_DAYS * 86_400,
      cookieCache: { enabled: true, maxAge: SESSION_CACHE_SECONDS, strategy: "jwe" },
    },
    account: {
      modelName: "auth_accounts",
      fields: { userId: "user_id", accountId: "account_id", providerId: "provider_id", accessToken: "access_token", refreshToken: "refresh_token", idToken: "id_token", accessTokenExpiresAt: "access_token_expires_at", refreshTokenExpiresAt: "refresh_token_expires_at", createdAt: "created_at", updatedAt: "updated_at" },
      // Google links to an existing user only when that user's email is verified locally. Without EMAIL_VERIFY no
      // password account is verified, so a password account registered for someone else's address cannot capture their Google sign-in.
      // Checked in 1.7.18: oauth2/link-account.mjs reads requireLocalEmailVerified (default true); auth-core.test.ts covers it.
      accountLinking: { enabled: true, trustedProviders: ["google"], requireLocalEmailVerified: true },
    },
    verification: { modelName: "auth_verifications", fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" } },
    rateLimit: {
      enabled: true, storage: "database", modelName: "auth_rate_limits", fields: { lastRequest: "last_request" },
      window: 60, max: 100,
      customRules: {
        "/sign-in/magic-link": { window: 3600, max: 5 }, "/sign-in/social": { window: 3600, max: 20 },
        "/sign-in/email": { window: 3600, max: 20 }, "/sign-up/email": { window: 3600, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: { after: async (user, ctx) => {
          const userId = String(user.id);
          // Codes reset a password, so only password sign-ups get them. Google and magic-link users have none to reset.
          if (ctx?.path === SIGN_UP_PATH) await createInitialRecoveryCodes(db, userId);
          // With EMAIL_VERIFY on, an unproven address gets its trial on verification instead (update hook below).
          if (!currentFlags.EMAIL_VERIFY || user.emailVerified) await grantFirstTrial(db, userId, user.email);
        } },
        update: { after: async (user, ctx) => {
          if (!user.emailVerified || (ctx?.path !== MAGIC_LINK_VERIFY_PATH && ctx?.path !== VERIFY_EMAIL_PATH)) return;
          const userId = String(user.id);
          // A magic link that promotes an unverified user proves the mailbox, not the earlier password sign-up. Better Auth
          // (revokeUnprovenAccountAccess) already deletes the credential, OAuth links and sessions; the recovery codes that
          // sign-up created would let whoever registered the address set a new password, so they go too.
          if (ctx.path === MAGIC_LINK_VERIFY_PATH) await db.query("DELETE FROM user_recovery_codes WHERE user_id = $1", [userId]);
          await grantFirstTrial(db, userId, user.email);
        } },
      },
      session: { create: { after: async (session) => {
        const userId = String(session.userId);
        const result = await db.query<{ terms_version: string | null }>("SELECT terms_version FROM users WHERE id = $1", [userId]);
        if (result.rows[0] && !result.rows[0].terms_version) await recordConsent(db, { userId, kind: "terms", version: TERMS_VERSION, granted: true });
      } } },
    },
    plugins: currentFlags.MAGIC_LINK ? [magicLink({
      expiresIn: 15 * 60,
      storeToken: "hashed",
      sendMagicLink: async ({ email, token }) => {
        const locale = "en";
        const url = `${baseURL}/${locale}/account/magic-link?token=${encodeURIComponent(token)}`;
        await mailerFromEnv().send(magicLinkMail({ to: email, url, locale }));
      },
    })] : [],
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;
export function customerAuth() { return authInstance ??= createAuth(); }
