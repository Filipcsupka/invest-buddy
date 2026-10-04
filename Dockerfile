FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM deps AS build
COPY . .
RUN npm run build
RUN npm run build:jobs \
    && test -f dist/jobs/daily.js && test -f dist/jobs/digest.js && test -f dist/jobs/portfolio.js
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apk add --no-cache postgresql-client restic openssh-client
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "server.js"]
