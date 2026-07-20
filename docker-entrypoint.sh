#!/bin/sh
set -eu

# wrangler dev only exposes a var to the Worker's `env` if it's declared
# somewhere it looks (wrangler.jsonc's `vars`, or a .dev.vars file) — it does
# NOT forward arbitrary process env vars into env.*, unlike CLOUDFLARE_API_TOKEN
# which wrangler's own CLI reads directly from process env for its own auth,
# not as a Worker binding. So BRAVE_API_KEY has to be written into .dev.vars
# here, after varlock has resolved the real value into this process's env.
echo "BRAVE_API_KEY=${BRAVE_API_KEY}" > dist/meeting_os/.dev.vars

exec pnpm exec wrangler dev -c dist/meeting_os/wrangler.json --ip 0.0.0.0 --port 8787
