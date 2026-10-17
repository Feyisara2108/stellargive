# syntax=docker/dockerfile:1
# -----------------------
# Dependency Stage
# -----------------------
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS deps

WORKDIR /app

COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# -----------------------
# Build Stage
# -----------------------
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Sentry source-map upload: the token is passed as a BuildKit secret so it
# is never baked into the image layers (#1116).
RUN --mount=type=secret,id=sentry_auth_token \
    --mount=type=cache,target=/app/.next/cache \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_auth_token 2>/dev/null || echo "") \
    NEXT_BUILD_TARGET=docker npm run build

# -----------------------
# Runtime Stage
# -----------------------
FROM node:20-alpine@sha256:fb4cd12c85ee03686f6af5362a0b0d56d50c58a04632e6c0fb8363f609372293 AS runner

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
