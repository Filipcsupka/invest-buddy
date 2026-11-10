# App panel screenshots

Taken on 2026-11-10 from a production build in fixture mode, widths 375 and 1440, light and dark. There is no database in fixture mode, so the browser answered `/api/me` with a stubbed identity; the markup and styles are the real build.

- `customer-locked-*`: Free customer on the opens-soon page with `AUTH=on EODHD_PRIVATE_USE=on`. Data pages show a lock and Plus chip with a blurred label, Methodology and Pricing are Open, and one quiet Coming later group has two plain items. No ETF or Markets entry.
- `customer-open-dashboard-*`: Free customer on the dashboard with `EODHD_PRIVATE_USE=off`. Data pages carry a Free chip, and the dashboard shows the new Highest scores strip.
- `owner-*` and `owner-dashboard-*`: the owner with the same two settings. Every entry is a direct link, ETFs and Markets appear with an Owner only tag, and the Coming later group is gone.
- `welcome-preview-*`: the app preview on the Welcome page, now listing only the entries the real panel has.

At 375 the screenshots show the drawer open.
