# syntax=docker/dockerfile:1

# Base
FROM node:24.20.0-trixie-slim AS base

ENV PORT=8080

RUN corepack enable

WORKDIR /usr/src/app

# .npmrc maps the @fsarch scope to GitHub Packages - every mounted service
# package (and @fsarch/server) is resolved from there, which needs a token
# with read:packages. It's passed in as a BuildKit secret
# (`--secret id=node_auth_token,env=NODE_AUTH_TOKEN`) and exposed only to the
# install RUN steps below as NODE_AUTH_TOKEN, so it never ends up in a layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./

# Puppeteer (pulled in by @fsarch/image-editor-server) would otherwise
# download its own Chrome build on install - the runtime image uses Debian's
# chromium package instead (see CHROMIUM_EXECUTABLE_PATH below).
ENV PUPPETEER_SKIP_DOWNLOAD=true


# Production Deps
FROM base AS deps

ENV NODE_ENV=production

RUN apt-get update && \
    apt-get install -y --no-install-recommends node-gyp build-essential python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=node_auth_token,env=NODE_AUTH_TOKEN \
    pnpm install --frozen-lockfile --prod


# Build
FROM base AS builder

RUN apt-get update && \
    apt-get install -y --no-install-recommends node-gyp build-essential python3 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
RUN --mount=type=secret,id=node_auth_token,env=NODE_AUTH_TOKEN \
    pnpm install --frozen-lockfile

COPY . ./
RUN pnpm run build


# Main
FROM base

ENV NODE_ENV=production
# Preloads OpenTelemetry auto-instrumentation before the app's own module
# graph loads - no-op unless the root `tracing.enabled: true` is set in
# config.yml.
ENV NODE_OPTIONS="--import @fsarch/server/register"
# Used by @fsarch/image-editor-server's html-layer renderer (Puppeteer).
ENV CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

EXPOSE 8080

# Chromium for @fsarch/image-editor-server's Puppeteer-based html-layer
# rendering - same packages as that service's own image.
RUN apt-get update && \
    apt-get install -y --no-install-recommends chromium fonts-recommended && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=node:node /usr/src/app/dist ./dist
COPY --from=deps --chown=node:node /usr/src/app/node_modules ./node_modules

USER node

# --experimental-vm-modules: @fsarch/function-node-worker executes functions
# via vm.SourceTextModule, which only exists behind this flag (same as that
# service's own image).
CMD ["node", "--experimental-vm-modules", "./dist/main.js"]
