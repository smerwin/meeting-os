# Production notes

Meeting OS is built as a local-first, single-user tool (see the Security Model
section in [README.md](./README.md)). This document is informational only — it
describes what a hosted, multi-user deployment would need on top of the current
codebase. None of it is implemented here, and adding it is out of scope for
this project as it stands.

## Authentication

Every `/agents/*` route is currently open — anyone who can reach the deployed
Worker can create and read meetings. A hosted version would need to
authenticate requests before routing them to a `MeetingAgent`.

## Authorisation

Beyond authentication, a hosted version would need to check that the
requesting user actually owns the meeting they're accessing — right now a
meeting's Durable Object name (`this.name`) is the only thing gating access to
its transcript, notes, and enrichment data.

## Multi-user ownership model

`MeetingIndex` is a single global Durable Object listing every meeting ever
created, with no concept of "whose" meeting it is. A hosted version would need
either a per-user index or an ownership column plus filtering.

## Rate limiting

Nothing currently limits how often a client can call `loadPerson`,
`generatePrep`, or stream audio — each of those triggers paid Brave Search
and/or Workers AI calls. A hosted version would need per-user or per-IP rate
limits to bound cost and abuse.

## AI usage quotas

Related to rate limiting: Workers AI and Brave Search usage currently has no
per-user cap. A hosted version serving multiple users would need quotas to
prevent one user's usage from exhausting shared budget.

## Data retention policies

Transcripts, notes, and enrichment data persist indefinitely in Durable Object
SQLite with no expiry. A hosted version handling other people's meeting data
would need an explicit retention/deletion policy.

## Privacy and consent considerations

This tool transcribes live audio of both meeting participants. A hosted,
multi-user version needs to handle consent (recording laws vary by
jurisdiction), and needs a clear policy on what's done with a third party's
enrichment data (name/company lookups against public web search).

## Monitoring and audit logs

Errors are currently only `console.error`'d to the Worker's logs. A hosted
version would need structured logging, alerting, and an audit trail of who
accessed which meeting's data.
