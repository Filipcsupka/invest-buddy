# InvestBuddy

A public, rule-based growth stock screener. This repository currently uses synthetic fixture data throughout. Scores and alert states are identical for every visitor.

Run `npm ci && npm run dev` for local development. Check the change with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. The standalone container can be built with `docker build -t investbuddy .`.

The scoring rules are in `src/engine`, the fixture provider is in `src/data`, and the public explanation is at `/methodology`. Production data, accounts, billing, email, and live alerts are outside this implementation.
