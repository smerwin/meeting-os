# Contributing

## Setup

```bash
pnpm install
```

`pnpm run dev` runs through [varlock](https://varlock.dev), which validates env vars against
`.env.schema` and fails fast if `BRAVE_API_KEY` is missing. Provide it either way:

```bash
# plaintext, quickest to get started
echo "BRAVE_API_KEY=your-brave-search-api-key-here" > .env

# macOS: stores the value in Keychain instead, .env only gets a keychain() reference
npx varlock keychain set BRAVE_API_KEY --write-to .env
```

```bash
pnpm run types
pnpm run dev
```

## Before opening a PR

```bash
pnpm run check   # oxfmt --check, oxlint, tsc
```

Run `pnpm run format` if `check` reports formatting issues.

## Guidelines

- Keep PRs focused — one change per PR is easier to review.
- Match the existing code style (enforced by `oxfmt`/`oxlint`, run `pnpm run check`).
- Don't commit `.env`, `.dev.vars`, or any real API keys/secrets.
- Describe what changed and why in the PR description.

## Reporting bugs

Open a GitHub issue with steps to reproduce, what you expected, and what happened
instead.
