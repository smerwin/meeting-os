# Builds and serves the same artifact `pnpm run deploy` would ship to
# Cloudflare — `vite build`'s Worker bundle + static assets, run in-place by
# `wrangler dev` (no Vite dev-server/HMR). Actual production is Cloudflare's
# edge network via `wrangler deploy`; this is the closest local equivalent.
FROM node:26-bookworm-slim AS deps
WORKDIR /app
RUN npm install -g pnpm@10.30.3
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm exec vite build

FROM node:26-bookworm-slim AS runtime
WORKDIR /app
# workerd (unlike Node) validates outbound fetch()'s TLS certs against the OS
# trust store, which node:*-slim doesn't ship — without it every fetch() a
# Worker makes (e.g. braveSearch's call to api.search.brave.com) fails with
# "unable to get local issuer certificate".
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.30.3
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json pnpm-lock.yaml wrangler.jsonc .env.schema docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 8787

# BRAVE_API_KEY (schema-required) and CLOUDFLARE_API_TOKEN (schema-optional,
# but effectively required here — there's no browser for interactive
# `wrangler login` in a container, and wrangler dev fails fast without one)
# are supplied via `docker run -e` / `--env-file`; varlock validates against
# .env.schema and injects them into the entrypoint's process env, which
# writes BRAVE_API_KEY into .dev.vars before starting wrangler dev — see
# docker-entrypoint.sh for why that step is necessary.
CMD ["pnpm", "exec", "varlock", "run", "--", "./docker-entrypoint.sh"]
