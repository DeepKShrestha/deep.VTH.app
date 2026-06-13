# syntax=docker/dockerfile:1
#
# Container image for VTH-app. Produces a small runtime image that runs the
# bundled Node server (`dist/index.cjs`), which also serves the built client
# from `dist/public`. Works with SQLite or Postgres (set DB_* at runtime).
#
# Build:  docker build -t vth-app .
# Run:    docker run -p 5000:5000 --env-file .env vth-app
#
# Required env at runtime (see .env.example): NODE_ENV=production,
# ATTACHMENT_SIGNING_SECRET, and the database vars (DB_PROVIDER + DB_FILE or
# DATABASE_URL). For persistence, mount volumes for the storage paths
# (CASE_ATTACHMENTS_DIR, BACKUP_LOCAL_DIR, and the SQLite file if used).

# ---- Build stage: install deps, compile client + server bundle ----
FROM node:22-bookworm AS build
WORKDIR /app

# Install all deps first (better caching). Native modules such as
# better-sqlite3 are compiled here, where build tools are available.
COPY package.json package-lock.json ./
RUN npm ci

# Build the client (dist/public) and the server bundle (dist/index.cjs).
COPY . .
RUN npm run build

# Drop dev-only dependencies so the runtime image ships prod deps only.
RUN npm prune --omit=dev

# ---- Runtime stage: minimal image that just runs the server ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# Default listen port; override with -e PORT=... if your proxy expects another.
ENV PORT=5000
WORKDIR /app

# Copy only what the server needs at runtime. The two migrations directories
# are read from disk on boot by the migration runner, so they must be present.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/migrations-pg ./migrations-pg
COPY --from=build --chown=node:node /app/package.json ./package.json

# Run as the unprivileged user that ships with the node image.
USER node
EXPOSE 5000

CMD ["node", "dist/index.cjs"]
