# syntax=docker/dockerfile:1
# Production image for the Bumera app. Built on the (memory-tight) home server,
# so Node's heap is capped and only one build step runs at a time.
FROM node:24-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=1536
# Next evaluates route modules while building, so env validation needs syntactically valid
# placeholders. They live only in this stage; the runtime image gets the real values from compose.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_URL=http://localhost:3000 \
    BETTER_AUTH_SECRET=build-placeholder-build-placeholder-0000 \
    CPF_ENCRYPTION_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= \
    CPF_HASH_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

# One-shot image that applies pending migrations (needs the Prisma CLI, which the runtime image omits).
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

# Background worker (WhatsApp turns and sending, CTX-DEC-20261025-migration-roadmap). It runs the TypeScript
# sources with tsx, so it reuses the build stage (full node_modules, generated Prisma client).
FROM build AS worker
ENV NODE_ENV=production
USER node
CMD ["npx", "tsx", "worker/main.ts"]

FROM base AS runtime
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
CMD ["node", "server.js"]
