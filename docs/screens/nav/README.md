# Navigation and sign-in state

Taken on 2026-11-10 from a production build in fixture mode with `AUTH=on WAITLIST=on MARKETS_VIEWS=on EODHD_PRIVATE_USE=on`. Widths 375 and 1440, light and dark.

- `welcome-anon-*`: Welcome page in the presentation shell, no sidebar. Sign in and Create free account in the top bar.
- `welcome-owner-*`: the same static page for a signed-in owner. The top bar shows the Owner badge and Open app.
- `sign-in-*`: full page. The owner sign-in link sits below the customer form.
- `app-free-customer-*`: app shell for a Free customer on the opens-soon page. Vendor-data items and Markets are blurred with a Soon chip. There is no database in fixture mode, so the browser answered `/api/me` with a Free customer; everything else is the real build.
- `app-owner-*`: app shell for the owner, signed in through `/api/owner/login`. Every item is open.

At 375 the app shell screenshots show the menu open.
