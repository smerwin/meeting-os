# Contributing

## Setup

```bash
npm install
cp .env.example .env   # add your own Brave Search API key
npm run types
npm run dev
```

## Before opening a PR

```bash
npm run check   # oxfmt --check, oxlint, tsc
```

Run `npm run format` if `check` reports formatting issues.

## Guidelines

- Keep PRs focused — one change per PR is easier to review.
- Match the existing code style (enforced by `oxfmt`/`oxlint`, run `npm run check`).
- Don't commit `.env`, `.dev.vars`, or any real API keys/secrets.
- Describe what changed and why in the PR description.

## Reporting bugs

Open a GitHub issue with steps to reproduce, what you expected, and what happened
instead.
