# syntax=docker/dockerfile:1
#
# InterviewAI Studio — production image.
#
# Constraints baked into this file:
#   - NFR-5  : runtime is Node.js everywhere (node:sqlite). No Vercel/Netlify.
#   - Node >= 22.13 : `node:sqlite` stopped needing --experimental-sqlite in 22.13.
#                     node:22-alpine resolves to the latest 22.x, so this is satisfied.
#   - Persistent disk : the SQLite file lives on the /data volume, never in an image layer.
#
# Port: 12213 (override at runtime with -e PORT=xxxx, or `-p <host>:<container>`).

###############################################################################
# 1. Base — Node 22 LTS on Alpine
###############################################################################
FROM node:22-alpine AS base
# libc6-compat: some optional transitive deps inside pdf-parse expect glibc symbols.
RUN apk add --no-cache libc6-compat
WORKDIR /app

###############################################################################
# 2. Deps — full tree (dev included), needed to run `next build`
###############################################################################
FROM base AS deps
COPY package.json package-lock.json ./
# `npm ci` wipes node_modules first, so a stray host copy can't leak in.
RUN npm ci

###############################################################################
# 3. Builder — produce the standalone server bundle
###############################################################################
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `next build` warns on a missing public/; this repo has none.
RUN mkdir -p public

# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time,
# so they must be passed as build args, not runtime env.
ARG NEXT_PUBLIC_PROVIDER_ENABLE=""
ARG NEXT_PUBLIC_BASE_URL=""
ARG ALLOW_PRIVATE_BASE_URL=""
ENV NEXT_PUBLIC_PROVIDER_ENABLE=$NEXT_PUBLIC_PROVIDER_ENABLE
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV ALLOW_PRIVATE_BASE_URL=$ALLOW_PRIVATE_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Produces .next/standalone (server.js + only the traced runtime modules),
# .next/static and .next/public. SWC and the rest of the build toolchain
# stay behind in this stage — they are never copied into the final image.
RUN npm run build

###############################################################################
# 4. Runner — the image that actually ships
###############################################################################
FROM base AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Bind on all interfaces, otherwise the published port won't reach it.
ENV HOSTNAME=0.0.0.0
ENV PORT=12213
# NFR-5: persistent volume mount point for the SQLite database.
ENV INTERVIEW_DB_PATH=/data/interview_sessions.db

# NOTE: the two COPYs below are the required standalone layout.
#   .next/standalone -> becomes the app root and brings its own server.js
#                       plus a traced, minimal node_modules.
#   .next/static     -> static assets are NOT traced; they must be re-attached
#                       by hand at .next/static or the UI ships unstyled/broken.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# /data holds the DB + its WAL/SHM sidecars. Owned by `node` so a fresh named
# volume inherits that ownership on first mount.
RUN mkdir -p /data && chown node:node /data
USER node

VOLUME ["/data"]
EXPOSE 12213

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||12213)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server.js is Next's standalone entrypoint. Running it directly (not via npm)
# lets SIGTERM reach the server so SQLite closes cleanly on `docker stop`.
CMD ["node", "server.js"]