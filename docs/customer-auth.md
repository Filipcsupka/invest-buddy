# Customer accounts

Customer auth uses Better Auth 1.7.18 (exact pin) with Postgres sessions, mounted at `/api/auth/[...all]`. Owner Basic auth and the owner session stay separate. A customer session never makes a viewer the owner and never opens owner or private vendor routes.

## Flags

All default to off.

| Flag | Effect |
| --- | --- |
| `AUTH` | Opens `/api/auth/*` and `/{locale}/account`. Off: both return 404 and every non-owner viewer is anonymous. |
| `PAYWALL` | Enforces Free limits for Free customers and anonymous visitors. Off: every non-owner sees the paid view. |
| `TRIAL` | A new account gets one 14-day Plus trial, no card. Works while `BILLING` is off. |
| `BILLING` | Reserved for Stripe. Leave off. |
| `MAGIC_LINK` | Email sign-in links. Needs working mail. |
| `EMAIL_VERIFY` | Password accounts must confirm their email. Needs working mail. |

With `AUTH` off, a visitor without owner credentials is no longer treated as admin. Owner Basic auth and the owner session still give the admin view.

## Environment

Required when `AUTH=on`:

- `DATABASE_URL`
- `AUTH_SECRET`: at least 32 random characters. Keep it separate from `OWNER_SESSION_SECRET` and `WAITLIST_TOKEN_SECRET`. Recovery codes that were never shown are encrypted with it, so changing it makes them unreadable; users can still generate a new set.
- `AUTH_URL` or `SITE_URL`: the public origin, `https://invest.filipcsupka.online`. Only this origin may POST to auth routes.

Optional:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: turn on Google sign-in.
- `MAIL_PROVIDER`: `resend` or `console`. Unset means console outside production; production refuses an unset value.
- `RESEND_API_KEY`, `MAIL_FROM`: required for `MAIL_PROVIDER=resend`, for example `MAIL_FROM="InvestBuddy <hello@invest.filipcsupka.online>"`.
- `RATE_LIMIT_TRUSTED_HOPS`: proxies in front of the app that append to `X-Forwarded-For`. Default 1 (Traefik).
- `RATE_LIMIT_SECRET`: key for hashing emails and IPs in rate-limit rows. Defaults to `AUTH_SECRET`.
- `VENDOR_DISPLAY_LICENSE`: set `on` only after a vendor display licence exists. Until then, and while `EODHD_PRIVATE_USE=on`, `canUseVendorData` is false for everyone except the owner.

Never commit any of these values.

## Sessions and cookies

- Sessions live 30 days in `auth_sessions`. The cookie is `__Host-ib_session`: HttpOnly, Secure, SameSite=Lax, Path=/, no Domain. Plain-HTTP localhost uses `ib_session` because browsers reject `__Host-` cookies without Secure.
- The cookie cache (`__Host-ib_session_data`) is on for 60 seconds. A revoked session or a changed plan can still be read from it for up to a minute on normal pages. Export, delete, recovery-code reveal and regeneration always read the database. A deleted user is treated as signed out at once because the viewer checks the `users` row.
- Better Auth checks the `Origin` header and CSRF on every POST, including in tests. Our routes also require `Origin` to equal the site origin.
- Google is linked to an existing account only when that account's email is verified locally. While `EMAIL_VERIFY` is off no password account is verified, so a person who signed up with a password and later tries Google gets an error. This blocks someone from registering a password account with another person's address and taking over their Google sign-in.

## Limits

Counters live in Postgres (`auth_rate_limits`) and apply across replicas. Keys hold an HMAC of the email or IP, never the raw value.

| Endpoint | Per IP | Per email |
| --- | --- | --- |
| `POST /api/auth/sign-up/email` | 5 per hour | 5 per hour |
| `POST /api/auth/sign-in/email` | 20 per hour | 10 per hour |
| `POST /api/auth/sign-in/magic-link` | 20 per hour | 5 per hour |
| `POST /api/auth/sign-in/social` | 20 per hour | n/a |
| `POST /api/auth/recovery/reset` | 10 per hour | 5 per hour |
| `POST /api/auth/recovery/regenerate` | 10 per hour per user | n/a |

Better Auth adds its own per-IP limit of 100 requests a minute on other auth routes.

## Trial and plans

With `TRIAL=on`, the first time a user row is created it gets a `manual` Plus entitlement that ends 14 days later. The grant is one row per user, so it never repeats, not even after it ends. An ended trial reads as Free. `src/entitlements/plan.ts` turns an entitlement into `free`, `trial` or `plus`; the viewer reads it once per request.

A new email can get another trial. Watch sign-up counts once the trial is on.

## Consent

The first session records the terms version (`2026-11-launch-1`) in `user_consents` and on the user row. Marketing mail is a separate opt-in on the account page and starts off.

## UI request shapes

All POSTs go to the same origin and send an `Origin` header. Better Auth routes return its usual JSON or redirects.

| Action | Endpoint | Body |
| --- | --- | --- |
| Password sign-up | `POST /api/auth/sign-up/email` | JSON `{ "name": "Name", "email": "name@example.com", "password": "10 to 128 chars" }` |
| Password sign-in | `POST /api/auth/sign-in/email` | JSON `{ "email": "name@example.com", "password": "..." }` |
| Google sign-in | `POST /api/auth/sign-in/social` | JSON `{ "provider": "google", "callbackURL": "/en/account" }` |
| Magic link (flag) | `POST /api/auth/sign-in/magic-link` | JSON `{ "email": "name@example.com" }` |
| Session | `GET /api/auth/get-session` | none |
| Sign out (JSON) | `POST /api/auth/sign-out` | JSON `{}` |
| Sign out (form) | `POST /api/auth/account/sign-out` | form `locale`; redirects to `/{locale}` |
| Recovery reset | `POST /api/auth/recovery/reset` | JSON `{ "email": "...", "code": "XXXX-...", "newPassword": "..." }` |
| Regenerate codes | `POST /api/auth/recovery/regenerate` | JSON `{ "currentPassword": "..." }` returns `{ "codes": [...] }`; the account page form gets an HTML page |
| Marketing consent | `POST /api/auth/account/consent` | form `marketing=on` or absent, `locale` |
| Delete account | `POST /api/auth/account/delete` | form `confirm=DELETE`, `locale` |
| Export data | `GET /api/auth/account/export` | none; JSON download |

Error codes: 400 invalid input or weak password, 403 wrong origin, 404 flag off, 429 limit hit (with `Retry-After`). The reset endpoint returns the same 200 body whether or not the email or code matched. A successful reset revokes every session of that user.

Sign-up with an email that already exists returns Better Auth's "user already exists" error, so sign-up does reveal whether an email has an account. The sign-up limits slow down probing.

## Recovery codes

Each new account gets ten single-use codes of 128 bits. They are stored as HMAC digests. The first set is also stored encrypted until the user reveals it once on the account page. Regeneration needs the current password and replaces the whole set. The account page warns when fewer than three remain.

## Owner steps before turning on AUTH

1. Review migrations 133, 134 and 135. Before 133, check for emails that differ only by case: `SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;` must return no rows. The web init container runs `npm run migrate` on every new web pod, so merging and deploying this change applies 135. Approve that before the deploy.
2. In Google Cloud Console, create an OAuth client of type Web application. Authorized JavaScript origin: `https://invest.filipcsupka.online`. Authorized redirect URI: `https://invest.filipcsupka.online/api/auth/callback/google`.
3. Put `AUTH_SECRET` (for example `openssl rand -base64 48`), `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the deployment secret store. Set `AUTH_URL=https://invest.filipcsupka.online`.
4. Leave `MAGIC_LINK` and `EMAIL_VERIFY` off until mail works. For Resend, verify the sending domain in Resend first, then set `MAIL_PROVIDER=resend`, `RESEND_API_KEY` and `MAIL_FROM`.
5. Decide on `TRIAL`. Keep `BILLING` off.
6. In a non-production environment, test password sign-up, Google sign-in, sign-out, recovery-code reveal and reset, export and delete. Check that owner Basic auth and the owner session still open owner routes and a customer cookie does not.
7. Set `AUTH=on` in production.

## Manual operations

Both scripts are dry runs unless `--apply` is given. They need `DATABASE_URL` and `OWNER_RESEARCH_PASSWORD` in the environment and print a user id, never the email or password.

- `npx tsx scripts/grant-entitlement.ts --email name@example.com --tier plus --days 30` grants Plus for 30 days. Without `--days` the grant has no end. `--tier free` removes a manual grant. It refuses to change a Stripe-managed entitlement.
- `CUSTOMER_NEW_PASSWORD=... npx tsx scripts/reset-customer-password.ts --email name@example.com` sets a new password and revokes that user's sessions.

## Caching

Public pages without a customer or owner cookie stay cacheable. A response to a request carrying a customer or owner cookie, every `/api/auth/*` response and every `/{locale}/account` page gets `Cache-Control: private, no-store` and `Vary: Cookie`. The viewer is memoised per request with React `cache` and is never put in Next's shared data cache.
