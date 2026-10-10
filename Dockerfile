FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
FROM deps AS build
COPY . .
RUN npm run build
RUN npm run build:jobs \
    && test -f dist/jobs/reconcile.js && test -f dist/jobs/daily.js && test -f dist/jobs/prices.js && test -f dist/jobs/digest.js && test -f dist/jobs/portfolio.js \
    && test -f dist/jobs/collect.js && test -f dist/jobs/detect.js && test -f dist/jobs/retention.js && test -f dist/jobs/discovery.js && test -f dist/jobs/backfill.js && test -f dist/jobs/companyfacts.js && test -f dist/jobs/earnings-calendar.js
RUN ./node_modules/.bin/esbuild scripts/migrate.ts --bundle --platform=node --format=cjs --target=node22 --packages=external --outfile=dist/migrate.js \
    && printf '%s\n' \
      'const { migrate } = require("./migrate.js");' \
      'const url = process.env.DATABASE_URL;' \
      'if (!url) throw new Error("DATABASE_URL is required");' \
      'migrate(url).catch((error) => { console.error(error); process.exitCode = 1; });' \
      > dist/migrate-runner.js
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apk add --no-cache postgresql-client restic openssh-client
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
RUN npm pkg set 'scripts.migrate=node dist/migrate-runner.js'
USER node
EXPOSE 3000
CMD ["node", "server.js"]
