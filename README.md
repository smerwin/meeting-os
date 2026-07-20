# Meeting OS

A live meeting assistant that runs entirely on Cloudflare Workers. Enter who you're
meeting with, and it enriches them and their company, drafts talking points and
questions, then transcribes and takes notes live as the call happens.

Built on the [Agents SDK](https://developers.cloudflare.com/agents/), with per-meeting
state persisted in Durable Object SQLite.

## What it does

- **Setup** — enter a person's name, role, company, and email (optionally paste a JD,
  CV, or other context) before a meeting starts
- **Enrichment** — looks up the person and company via Brave Search, then summarizes
  bio, facts, and links with Workers AI
- **Prep** — generates talking points and questions from the enrichment + pasted
  context
- **Live transcription** — captures mic + shared-tab audio during the call and
  transcribes it with Whisper (`@cf/openai/whisper`)
- **Live notes** — periodically summarizes the running transcript into notes
- **History** — past meetings are listed on the landing page and reachable at
  `/m/:id`
- **Real-time sync** — all state (transcript, notes, prep, enrichment) syncs to
  connected clients over WebSocket

## Quick start

```bash
pnpm install
echo "BRAVE_API_KEY=your-brave-search-api-key-here" > .env   # see .env.schema for the full list
pnpm run types           # generates env.d.ts from wrangler.jsonc bindings
pnpm run dev
```

Env vars are schema-validated by [varlock](https://varlock.dev) (`.env.schema`, committed) — `pnpm run dev`
runs through `varlock run`, which reads `.env` (gitignored) and fails fast with a clear
error if a required var is missing.

Open [http://localhost:5173](http://localhost:5173).

Workers AI (enrichment summaries, prep generation, transcription) needs no API key —
it runs on the `AI` binding. Enrichment's web lookups use Brave Search, so
`BRAVE_API_KEY` in `.env` is required for that part to work; get a key at
[brave.com/search/api](https://brave.com/search/api/).

## Project structure

```
src/
  server.ts              # MeetingAgent (per-meeting DO) + MeetingIndex (history) + fetch handler
  app.tsx / client.tsx    # React entry
  lib/
    meetingState.ts       # client-side state/connection helpers
    audioCapture.ts        # mic + shared-tab audio capture
    router.ts              # /, /m/:id routing
  components/
    Landing.tsx            # history list + new-meeting entry point
    SetupForm.tsx           # person/company/role/email + pasted context
    MeetingView.tsx          # main call layout
    CallFrame.tsx             # video/shared-tab frame
    TranscriptPanel.tsx        # live transcript
    NotesPanel.tsx               # live notes
    PrepPanel.tsx                 # talking points + questions
    PersonPanel.tsx / CompanyPanel.tsx / FactsList.tsx / LinksList.tsx  # enrichment display
    TopBar.tsx / StatusDot.tsx     # connection status chrome
```

## How it works

- `MeetingAgent` (`src/server.ts`) is a Durable Object per meeting: it holds
  `MeetingState` (person, company, context, prep, transcript, notes), broadcasts
  updates to connected clients, and exposes callable RPCs (`loadPerson`,
  `addContext`, `generatePrep`, `start`/`stop`, etc.) that the client calls directly.
- `MeetingIndex` is a single global Durable Object backed by SQLite that tracks
  meeting summaries for the history list on the landing page.
- Enrichment and prep generation call Workers AI (`@cf/meta/llama-3.1-8b-instruct-fast`)
  grounded with Brave Search results.
- Recording sends audio chunks over the WebSocket connection; the server transcribes
  each chunk with Whisper and appends it to the transcript, periodically summarizing
  into notes.

### Security Model

Meeting OS is currently designed for local, single-user usage.

It does not implement:

- Authentication
- Authorisation
- Multi-user tenancy
- Rate limiting
- Access control
- Production privacy/compliance controls

If deploying publicly, these concerns must be added separately. The included
deployment commands are provided for experimentation and development purposes
only.

See [PRODUCTION.md](./PRODUCTION.md) for what a hosted, multi-user deployment
would additionally need.

## Deploy

```bash
pnpm run deploy
```

Set `BRAVE_API_KEY` as a Worker secret before deploying:

```bash
pnpm exec wrangler secret put BRAVE_API_KEY
```

Do not expose Meeting OS directly to the public internet without adding
authentication and access controls.

## Development

```bash
pnpm run check   # format check + lint + typecheck
pnpm run format  # auto-format
```

## Learn more

- [Agents SDK documentation](https://developers.cloudflare.com/agents/)
- [Workers AI models](https://developers.cloudflare.com/workers-ai/models/)
- [Durable Objects SQLite storage](https://developers.cloudflare.com/durable-objects/api/sql-storage/)

## License

MIT — see [LICENSE](./LICENSE).
