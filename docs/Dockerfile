# syntax = docker/dockerfile:1
#
# cvfile.org on the VPS, built from the repository root (docker build --file
# docs/Dockerfile .). The site needs the root of the pnpm workspace: it bundles
# @cvfile/viewer-web into /embed/1/cv-embed.js and renders spec/cv-1.0.md into
# /spec/. The AI mode's API is bundled into one file with the data of its docs
# tools, indexed from the built pages, the spec and the repository's READMEs.
# The image holds nginx with the static output, and Node with the API: the
# compose file runs one container of each from this image.
#
# The build reads the app's environment from the app_env build secret, which
# the server's deploy passes from the app's .env: it holds
# PUBLIC_TENSORPASS_SITE_KEY, which Astro puts into the pages. None of it is
# written to a layer.
#
# The files of this deploy stay in docs/, so the repository root and the
# published packages carry none of them. BuildKit reads the ignore file
# docs/Dockerfile.dockerignore because it sits beside this Dockerfile.

ARG NODE_VERSION=26.12.1
# Node 25 stopped bundling corepack, so the image installs it from npm. It
# then runs the pnpm release pinned in package.json's packageManager field.
ARG COREPACK_VERSION=0.36.0

FROM node:${NODE_VERSION}-slim AS deps
ARG COREPACK_VERSION
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN npm install --global --no-audit --fund=false corepack@${COREPACK_VERSION} && corepack enable pnpm
# pnpm-workspace.yaml names the workspace packages and carries the install
# script decisions. Only the manifests of the packages the site builds from
# reach this layer, so a source commit reuses it. The store lives in a cache
# mount, so the next lockfile change reuses the packages already downloaded.
COPY --link package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --link docs/package.json docs/
COPY --link packages/sdk-js/package.json packages/sdk-js/
COPY --link packages/viewer-web/package.json packages/viewer-web/
RUN --mount=type=cache,id=cvfile-pnpm-store,target=/pnpm-store \
    pnpm install --filter @cvfile/docs... --filter @cvfile/viewer-web... \
      --frozen-lockfile --ignore-scripts --store-dir /pnpm-store

FROM deps AS build
COPY --link . .
# The docs build copies the viewer's CDN bundle into public/, so the viewer is
# built first, and the viewer's type declarations need the SDK built before it.
# The context also holds the manifests of packages this image does not install
# (the docs tools read their versions), so pnpm is told the filtered install
# above is the one to run with.
ENV pnpm_config_verify_deps_before_run=false
RUN --mount=type=secret,id=app_env,target=/app/docs/.env.production.local,required=true \
    pnpm --filter @cvfile/sdk build \
    && pnpm --filter @cvfile/viewer-web build \
    && pnpm --filter @cvfile/docs build

FROM nginxinc/nginx-unprivileged:alpine
USER root
RUN apk add --no-cache nodejs
USER nginx
COPY --link docs/vps/nginx.conf /etc/nginx/conf.d/default.conf
COPY --link --from=build /app/docs/dist /usr/share/nginx/cvfile
COPY --link --from=build /app/docs/server/dist /srv/api
EXPOSE 8080
