# syntax=docker/dockerfile:1
# -----------------------
# Dependency Stage
# -----------------------
FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS deps

WORKDIR /app

# .npmrc carries legacy-peer-deps=true; without it `npm ci` rejects the lockfile
# on peer-dependency conflicts.
COPY package*.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# -----------------------
# Build Stage
# -----------------------
FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js inlines NEXT_PUBLIC_* into the client bundle at build time, so they
# must be present here — setting them on `docker run` cannot change built code
# (#1099). These are public values only: never pass a secret as a build arg.
# ARGs are visible to RUN steps in this stage only and never reach the runtime
# image. Empty ones are unset before building so the app's `??` fallbacks apply.
ARG NEXT_PUBLIC_SOROBAN_RPC_URL
ARG NEXT_PUBLIC_NETWORK_PASSPHRASE
ARG NEXT_PUBLIC_CONTRACT_ID
ARG NEXT_PUBLIC_USDC_CONTRACT_ID
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_APP_URL

# Sentry source-map upload: the token is passed as a BuildKit secret so it
# is never baked into the image layers (#1116).
RUN --mount=type=secret,id=sentry_auth_token \
    --mount=type=cache,target=/app/.next/cache \
    for var in NEXT_PUBLIC_SOROBAN_RPC_URL NEXT_PUBLIC_NETWORK_PASSPHRASE \
               NEXT_PUBLIC_CONTRACT_ID NEXT_PUBLIC_USDC_CONTRACT_ID \
               NEXT_PUBLIC_SENTRY_DSN NEXT_PUBLIC_APP_URL; do \
      eval "[ -n \"\${$var:-}\" ]" || unset "$var"; \
    done \
    && SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token 2>/dev/null || echo "") \
    NEXT_BUILD_TARGET=docker npm run build

# -----------------------
# Runtime Stage
# -----------------------
FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Pick up Alpine security patches (e.g. OpenSSL) newer than the pinned base, and
# drop the bundled npm CLI: the server runs `node server.js` and never needs npm,
# whose vendored dependencies account for most image scan findings.
RUN apk upgrade --no-cache \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

# Create a non-root user
RUN addgroup -S nextjs && adduser -S nextjs -G nextjs

RUN mkdir -p /app/public
COPY --from=builder /app/public/ ./public/
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
