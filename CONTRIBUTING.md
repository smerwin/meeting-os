# Contributing

## Setup

```bash
pnpm install
echo "BRAVE_API_KEY=your-brave-search-api-key-here" > .env   # see .env.schema for the full list
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
