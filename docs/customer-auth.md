# Customer accounts

Customer auth uses Better Auth 1.7.18 (exact pin) with Postgres sessions, mounted at `/api/auth/[...all]`.

## Owner

There is no separate owner login. The owner creates a normal account at `/sign-in` with email and password, signs in the same way and signs out with the normal Sign out button. A session is the owner when its user id is in `OWNER_USER_IDS`, a comma separated list of user ids. An email address never makes anyone owner.

The owner gets the admin tier, every sidebar item unlocked and the Owner badge, whatever the tier and the `PAYWALL` and `TRIAL` flags say. Owner-only routes (`/owner/*`, the market views and the EODHD data routes) open for the owner session only. An anonymous browser is sent to `/sign-in?next=`, a signed-in account that is not the owner gets a 404 page, and non-browser clients get a plain 401 with no Basic challenge. The old owner password, Basic auth, owner cookie and owner sign-in page are gone; the app ignores any leftover owner password or session secret variables. The `ib_signed_in` hint cookie is never trusted for any of this.

Why ids and not emails: password accounts have no email verification at launch, so anyone could register the owner's address first. That account gets a different id and is a normal customer. Tests cover this case.

Finding the id: sign up with the owner address, then read the id with a read-only query, `SELECT id FROM users WHERE email = '<owner address>';`, and put it in `OWNER_USER_IDS` in the deployment secret store. Register the owner account before anyone else can use that address, and check that the row you read is the one you created. The ids are never hardcoded in the repository. The owner check needs `AUTH=on`; with `AUTH` off nobody is owner and the owner pages answer 401 or 404.

Google sign-in is not offered in the UI. The Better Auth Google provider code stays dormant and starts only if `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, which production does not need.

Probes, cron jobs and health checks use `/api/health`, which is public. Nothing in the repository or the deploy manifests depends on owner Basic auth.

## Flags

All default to off.

| Flag | Effect |
| --- | --- |
| `AUTH` | Opens `/api/auth/*` and `/{locale}/account`. Off: both return 404 and every non-owner viewer is anonymous. |
| `PAYWALL` | Enforces Free limits for Free customers and anonymous visitors. Off: every non-owner sees the paid view. |
| `TRIAL` | A new account gets one 14-day Plus trial, no card. Works while `BILLING` is off. |
| `BILLING` | Reserved for Stripe. Leave off. |
| `MAGIC_LINK` | Email sign-in links. Needs working mail and `EMAIL_VERIFY=on`; auth refuses to start with `MAGIC_LINK` on and `EMAIL_VERIFY` off. |
| `EMAIL_VERIFY` | Password accounts must confirm their email before they can sign in or get a trial. Needs working mail. |

With `AUTH` off, every visitor is anonymous, the owner included, because the owner is a signed-in account. Production needs `AUTH=on` for the owner to sign in.

## Environment

Required when `AUTH=on`:

- `DATABASE_URL`
- `AUTH_SECRET`: at least 32 random characters. Keep it separate from `WAITLIST_TOKEN_SECRET`. Recovery codes that were never shown are encrypted with it, so changing it makes them unreadable; users can still generate a new set.
- `AUTH_URL` or `SITE_URL`: the public origin, `https://invest.filipcsupka.online`. Only this origin may POST to auth routes.
- `OWNER_USER_IDS`: comma separated user ids of the owner accounts. Without it nobody is owner.

Optional:

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: only for the dormant Google provider; not needed.
- `MAIL_PROVIDER`: `resend` or `console`. Unset means console outside production; production refuses an unset value.
- `RESEND_API_KEY`, `MAIL_FROM`: required for `MAIL_PROVIDER=resend`, for example `MAIL_FROM="InvestBuddy <hello@invest.filipcsupka.online>"`.
- `RATE_LIMIT_TRUSTED_HOPS`: proxies in front of the app that append to `X-Forwarded-For`. Default 1 (Traefik only). Set it per environment: if a CDN is added in front of Traefik, use 2, or every visitor shares the CDN's bucket. The client IP is the entry this many places from the end; entries further left and `X-Real-IP` are ignored because the client can set them. A request with fewer entries than hops counts against one shared `unknown` bucket.
- `RATE_LIMIT_SECRET`: key for hashing emails and IPs in rate-limit rows. Defaults to `AUTH_SECRET`.
- `VENDOR_DISPLAY_LICENSE`: set `on` only after a vendor display licence exists. Until then, and while `EODHD_PRIVATE_USE=on`, `canUseVendorData` is false for everyone except the owner session.

Never commit any of these values.

## Sessions and cookies

- Sessions live 30 days in `auth_sessions`. The cookie is `__Host-ib_session`: HttpOnly, Secure, SameSite=Lax, Path=/, no Domain. Plain-HTTP localhost uses `ib_session` because browsers reject `__Host-` cookies without Secure.
- `ib_signed_in=1` is a readable hint cookie set next to the session cookie and cleared with it, so static pages can show the account entry. It holds no token and the server never trusts it.
- The cookie cache (`__Host-ib_session_data`) is on for 60 seconds. A revoked session or a changed plan can still be read from it for up to a minute on normal pages. Export, delete, recovery-code reveal and regeneration always read the database. A deleted user is treated as signed out at once because the viewer checks the `users` row.
- Better Auth checks the `Origin` header and CSRF on every POST, including in tests. Our routes also require `Origin` to equal the site origin.
- Google is linked to an existing account only when that account's email is verified locally (`accountLinking.requireLocalEmailVerified`, checked in the 1.7.18 source and covered by a test). While `EMAIL_VERIFY` is off no password account is verified, so a person who signed up with a password and later tries Google gets an error. This blocks someone from registering a password account with another person's address and taking over their Google sign-in.

## Limits

Counters live in Postgres (`auth_rate_limits`) and apply across replicas. Keys hold an HMAC of the email or IP, never the raw value.

| Endpoint | Per IP | Per email |
| --- | --- | --- |
| `POST /api/auth/sign-up/email` | 5 per hour | 5 per hour |
| `POST /api/auth/sign-in/email` | 20 per hour | 10 per hour |
| `POST /api/auth/sign-in/magic-link` | 5 per hour | 5 per hour |
| `POST /api/auth/sign-in/social` | 20 per hour | n/a |
| `POST /api/auth/recovery/reset` | 10 per hour | 5 per hour |
| `POST /api/auth/recovery/regenerate` | 10 per hour per user | n/a |

Sign-up and magic link can create an account, so their per-email counters use the canonical mailbox: lowercase, NFKC, `+tag` removed, and for Gmail dots removed. Better Auth adds its own per-IP limit of 100 requests a minute on other auth routes.

Only these Better Auth routes are reachable from outside: `POST` sign-up/email, sign-in/email, sign-in/social, sign-in/magic-link (with `MAGIC_LINK`), sign-out; `GET` get-session, callback/google, error, verify-email (with `EMAIL_VERIFY`). Everything else returns 404, including change-password, revoke-sessions, send-verification-email and `GET /magic-link/verify`. A magic link is spent only through the `POST /api/auth/magic-link/consume` step, so mail scanners that prefetch links cannot use it.

## Trial and plans

With `TRIAL=on`, a new user gets a `manual` Plus entitlement that ends 14 days later. With `EMAIL_VERIFY` on, an unverified password account gets it only when it confirms the address (email link or magic link); magic-link sign-ups, and Google sign-ups whose Google email is verified, count as verified at creation. An ended trial reads as Free.

Each grant also writes a row to `trial_claims` (migration 136): an HMAC of the canonical mailbox, keyed from `AUTH_SECRET`, never the address. The row has no foreign key and stays after the account is deleted, so a `+tag`, a Gmail dot variant, or deleting and re-registering the same address gets no second trial. Rotating `AUTH_SECRET` makes old claims unmatchable. Apply migration 136 before turning `TRIAL` on. `src/entitlements/plan.ts` turns an entitlement into `free`, `trial` or `plus`; the viewer reads it once per request.

A genuinely different address still gets a trial. Watch sign-up counts once the trial is on.

## Consent

The first session records the terms version (`2026-11-launch-1`) in `user_consents` and on the user row. Marketing mail is a separate opt-in on the account page and starts off.

## UI request shapes

All POSTs go to the same origin and send an `Origin` header. Better Auth routes return its usual JSON or redirects.

| Action | Endpoint | Body |
| --- | --- | --- |
| Password sign-up | `POST /api/auth/sign-up/email` | JSON `{ "name": "Name", "email": "name@example.com", "password": "10 to 128 chars", "callbackURL": "/en", "marketing": true }`; `callbackURL` and `marketing` are optional, and `marketing: true` records the marketing opt-in |
| Password sign-in | `POST /api/auth/sign-in/email` | JSON `{ "email": "name@example.com", "password": "..." }` |
| Google sign-in | `POST /api/auth/sign-in/social` | JSON `{ "provider": "google", "callbackURL": "/en/account" }` |
| Magic link (flag) | `POST /api/auth/sign-in/magic-link` | JSON `{ "email": "name@example.com" }` |
| Session | `GET /api/auth/get-session` | none |
| Sign out (JSON) | `POST /api/auth/sign-out` | JSON `{}` |
| Sign out (form) | `POST /api/auth/account/sign-out` | form `locale`; runs Better Auth sign-out and redirects to `/{locale}`; the sidebar footer button uses it for the owner and customers |
| Recovery reset | `POST /api/auth/recovery/reset` | JSON `{ "email": "...", "code": "XXXX-...", "newPassword": "..." }` |
| First recovery codes | `POST /api/auth/recovery/codes` | JSON `{}` returns `{ "codes": [...] }` once for the signed-in user; later calls get 409 `RECOVERY_CODES_ALREADY_SHOWN` |
| Regenerate codes | `POST /api/auth/recovery/regenerate` | JSON `{ "currentPassword": "..." }` returns `{ "codes": [...] }`; the account page form gets an HTML page |
| Marketing consent | `POST /api/auth/account/consent` | form `marketing=on` or absent, `locale` |
| Delete account | `POST /api/auth/account/delete` | form `confirm=DELETE`, `locale` |
| Export data | `GET /api/auth/account/export` | none; JSON download |

Error codes: 400 invalid input or weak password, 403 wrong origin, 404 flag off, 429 limit hit (with `Retry-After`). The reset endpoint returns the same 200 body whether or not the email or code matched. A successful reset revokes every session of that user.

With `EMAIL_VERIFY` off, sign-up with an email that already exists returns Better Auth's "user already exists" error, so sign-up reveals whether an email has an account; the sign-up limits slow down probing. With `EMAIL_VERIFY` on, Better Auth returns the same response for a new and an existing email.

## Recovery codes

Each password sign-up gets ten single-use codes of 128 bits. Magic-link sign-ups get none, since they have no password to reset. They are stored as HMAC digests. The first set is also stored encrypted until the user reveals it once on the account page. Regeneration needs the current password and replaces the whole set. The account page warns when fewer than three remain.

A reset only replaces an existing password; it never creates one. After a successful reset the account address gets a "password was reset" mail. If sending fails, the reset still stands and the failure is logged without the address.

Pre-registration takeover: someone can sign up with a password at another person's address. When the real owner later signs in by magic link, Better Auth 1.7.18 deletes the account's password, OAuth links and sessions before marking the email verified (`revokeUnprovenAccountAccess`), and our hook deletes the recovery codes from that sign-up. Google sign-in does not link to such an unverified account at all.

## Owner steps before turning on AUTH

1. Review migrations 133, 134, 135 and 136. Before 133, check for emails that differ only by case: `SELECT lower(email), count(*) FROM users GROUP BY 1 HAVING count(*) > 1;` must return no rows. The web init container runs `npm run migrate` on every new web pod, so merging and deploying this change applies 135 and 136. Approve that before the deploy.
2. Put `AUTH_SECRET` (for example `openssl rand -base64 48`) and `OWNER_USER_IDS` (after the owner account exists) in the deployment secret store. Set `AUTH_URL=https://invest.filipcsupka.online`.
3. Leave `MAGIC_LINK` and `EMAIL_VERIFY` off until mail works, and turn `MAGIC_LINK` on only together with `EMAIL_VERIFY`. For Resend, verify the sending domain in Resend first, then set `MAIL_PROVIDER=resend`, `RESEND_API_KEY` and `MAIL_FROM`.
4. Decide on `TRIAL`. Keep `BILLING` off.
5. In a non-production environment, test password sign-up, sign-in, sign-out, recovery-code reveal and reset, export and delete. Check that the owner account (id in `OWNER_USER_IDS`) opens owner routes, sees the whole sidebar unlocked and can sign out, and that a second account with the same email does not.
6. Set `AUTH=on` in production.

## Manual operations

Both scripts are dry runs unless `--apply` is given. They need `DATABASE_URL` in the environment and print a user id, never the email or password.

- `npx tsx scripts/grant-entitlement.ts --email name@example.com --tier plus --days 30` grants Plus for 30 days. Without `--days` the grant has no end. `--tier free` removes a manual grant. It refuses to change a Stripe-managed entitlement.
- `CUSTOMER_NEW_PASSWORD=... npx tsx scripts/reset-customer-password.ts --email name@example.com` sets a new password and revokes that user's sessions.

## Caching

Public pages without a customer cookie stay cacheable. A response to a request carrying a customer cookie, every `/api/auth/*` response and every `/{locale}/account` page gets `Cache-Control: private, no-store` and `Vary: Cookie`. The viewer is memoised per request with React `cache` and is never put in Next's shared data cache.

## Known limits

Open items from the 2026-11-10 security review that this change does not fix:

- Sign-up enumeration while `EMAIL_VERIFY` is off (review item 5). Turning `EMAIL_VERIFY` on removes it; until then the sign-up limits slow probing.
- Verification-link pre-hijack with `EMAIL_VERIFY` on. If someone signs up at another person's address and that person clicks the confirmation mail they did not ask for, the stranger's password becomes valid. The mail says to ignore it if you did not create an account. The magic-link path is covered.
- A legitimate user who signed up with a password, never confirmed the address, and then signs in by magic link loses that password and its recovery codes. They keep magic-link and Google sign-in.
- Targeted lockout (item 8). Per-email limits on sign-in (10 an hour) and reset (5 an hour) let anyone exhaust a victim's bucket. A per-(email, IP) key would weaken protection against distributed guessing, so this needs a decision, or a captcha.
- `RATE_LIMIT_TRUSTED_HOPS` must match the proxy chain in each environment (item 7). The code no longer reads `X-Real-IP` and fails closed, but a wrong hop count still mis-buckets.
- Account delete needs no re-authentication, and a non-JSON `magic-link:%` verification row aborts the delete (item 14).
- The `user.create.after` hook is not one transaction, so a failure can leave a user with partial recovery codes or no trial (item 15).
- `auth_rate_limits` rows are never purged (item 16).
- Email case folding uses JavaScript `toLowerCase`, which can differ from Postgres `lower()` for some Unicode (item 17). Trial and limit keys use NFKC.
- scrypt uses Better Auth defaults and the password denylist is small, with no breach check (item 18).
- The 60 s cookie cache (item 12), the nits 19 to 22 are unchanged.
