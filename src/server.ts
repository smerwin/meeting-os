import {
  Agent,
  callable,
  routeAgentRequest,
  type Connection,
  type WSMessage
} from "agents";

export type Role = "me" | "them";

export interface TranscriptLine {
  id: string;
  role: Role;
  text: string;
  ts: number;
}

export interface NoteItem {
  id: string;
  text: string;
  ts: number;
}

export interface PersonInfo {
  name: string;
  role: string;
  company: string;
  email: string;
  bio: string;
  facts: string[];
  links: { label: string; url: string }[];
}

export interface CompanyInfo {
  name: string;
  summary: string;
  culture: string[];
  links: { label: string; url: string }[];
}

export interface MeetingState {
  status: "setup" | "idle" | "recording" | "ended";
  person: PersonInfo;
  company: CompanyInfo;
  transcript: TranscriptLine[];
  notes: NoteItem[];
}

const EMPTY_PERSON: PersonInfo = {
  name: "",
  role: "",
  company: "",
  email: "",
  bio: "",
  facts: [],
  links: []
};

const EMPTY_COMPANY: CompanyInfo = {
  name: "",
  summary: "",
  culture: [],
  links: []
};

interface SearchResult {
  title: string;
  url: string;
  description: string;
}

async function braveSearch(env: Env, query: string): Promise<SearchResult[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": env.BRAVE_API_KEY
    }
  });
  if (!res.ok) {
    throw new Error(`Brave search failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as {
    web?: { results?: { title: string; url: string; description: string }[] };
  };
  return (data.web?.results ?? []).slice(0, 5).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description
  }));
}

// One generic query misses a lot — LinkedIn/GitHub/Glassdoor rarely surface
// high enough in a plain search. Run several targeted queries in parallel and
// merge/dedupe by URL, so a thin generic result set doesn't sink the whole
// enrichment (Promise.allSettled — one bad/rate-limited query shouldn't cost
// us the others).
async function braveSearchMerged(
  env: Env,
  queries: string[]
): Promise<SearchResult[]> {
  const settled = await Promise.allSettled(
    queries.map((q) => braveSearch(env, q))
  );

  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    for (const item of outcome.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      merged.push(item);
    }
  }
  return merged.slice(0, 16);
}

function personQueries(name: string, company: string): string[] {
  const base = [name, company].filter(Boolean).join(" ");
  return [
    base,
    `${name} linkedin`,
    `${name} github`,
    `${name} news OR interview OR podcast`
  ];
}

function companyQueries(company: string): string[] {
  return [
    `${company}`,
    `${company} glassdoor reviews`,
    `${company} culture`,
    `${company} news`
  ];
}

// Workers AI text-gen models don't have a consistent output shape across
// variants: some return `response` as a plain string, the "-fast" variant
// returns `response` already parsed into an object when it looks like JSON,
// and some fall back to an OpenAI-style `choices[0].message.content` string.
type AiTextResult = {
  response?: unknown;
  choices?: { message?: { content?: string } }[];
};

function extractModelText(result: unknown): string {
  const r = result as AiTextResult;
  if (typeof r.response === "string") return r.response;
  const content = r.choices?.[0]?.message?.content;
  return typeof content === "string" ? content : "";
}

// The model sometimes repeats the same URL under different labels — dedupe
// so the client never has to render two links with the same React key.
function dedupeLinks(
  links: { label: string; url: string }[]
): { label: string; url: string }[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.url)) return false;
    seen.add(l.url);
    return true;
  });
}

async function synthesizePerson(
  env: Env,
  person: PersonInfo,
  results: SearchResult[]
): Promise<{
  bio: string;
  facts: string[];
  links: { label: string; url: string }[];
}> {
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`)
    .join("\n\n");

  const prompt = `You are prepping someone with background on a person before a meeting.

Person: ${person.name}${person.role ? `, ${person.role}` : ""}${person.company ? ` at ${person.company}` : ""}

Search results (from multiple queries — general, LinkedIn, GitHub, news/interviews):
${context}

Write a short professional background summary (2-4 sentences, factual, no speculation — only use what's in the search results).

Then list up to 5 short "facts" — scannable talking points someone could reference in a live conversation. Prioritize: notable projects/repos, career moves, recent news or publications, anything conversation-worthy. Each fact should be one line, specific, and sourced from the results (not generic).

Then list up to 5 relevant links (LinkedIn, GitHub, personal site, articles) from the results above that are clearly about this specific person.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"bio": "...", "facts": ["...", "..."], "links": [{"label": "...", "url": "..."}]}`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 700
  });

  const response = (result as AiTextResult).response;

  let parsed: {
    bio?: string;
    facts?: string[];
    links?: { label: string; url: string }[];
  };
  if (response && typeof response === "object") {
    // "-fast" variant already parsed the JSON for us.
    parsed = response as typeof parsed;
  } else {
    const raw = extractModelText(result);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match)
      throw new Error(`No JSON in model response: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  return {
    bio: parsed.bio ?? "",
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    links: dedupeLinks(Array.isArray(parsed.links) ? parsed.links : [])
  };
}

async function synthesizeCompany(
  env: Env,
  company: string,
  results: SearchResult[]
): Promise<{
  summary: string;
  culture: string[];
  links: { label: string; url: string }[];
}> {
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`)
    .join("\n\n");

  const prompt = `You are prepping someone with background on a company before a meeting with one of its people.

Company: ${company}

Search results (from multiple queries — general/about, Glassdoor reviews, culture, news):
${context}

Write a short factual summary of the company (2-4 sentences: what they do, size/stage if known, notable recent developments). No speculation — only use what's in the search results.

Then list up to 5 short "culture" points — specific, sourced observations about what it's like to work there or engage with them. Prioritize anything from Glassdoor-style reviews or employee sentiment (e.g. "reviewers frequently mention long hours", "praised for strong mentorship") over generic marketing copy. If the results don't contain real sentiment/review data, say so explicitly in one of the points rather than inventing filler.

Then list up to 5 relevant links (Glassdoor page, official site, news articles) from the results above.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"summary": "...", "culture": ["...", "..."], "links": [{"label": "...", "url": "..."}]}`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 700
  });

  const response = (result as AiTextResult).response;

  let parsed: {
    summary?: string;
    culture?: string[];
    links?: { label: string; url: string }[];
  };
  if (response && typeof response === "object") {
    parsed = response as typeof parsed;
  } else {
    const raw = extractModelText(result);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match)
      throw new Error(`No JSON in model response: ${raw.slice(0, 200)}`);
    parsed = JSON.parse(match[0]);
  }

  return {
    summary: parsed.summary ?? "",
    culture: Array.isArray(parsed.culture) ? parsed.culture : [],
    links: dedupeLinks(Array.isArray(parsed.links) ? parsed.links : [])
  };
}

export class MeetingAgent extends Agent<Env, MeetingState> {
  initialState: MeetingState = {
    status: "setup",
    person: EMPTY_PERSON,
    company: EMPTY_COMPANY,
    transcript: [],
    notes: []
  };

  async onConnect(conn: Connection) {
    conn.send(JSON.stringify({ type: "state", state: this.state }));
  }

  @callable()
  async loadPerson(input: {
    name: string;
    company: string;
    role: string;
    email: string;
  }) {
    const person: PersonInfo = {
      name: input.name.trim(),
      role: input.role.trim(),
      company: input.company.trim(),
      email: input.email.trim(),
      bio: "",
      facts: [],
      links: []
    };
    const company: CompanyInfo = { ...EMPTY_COMPANY, name: person.company };
    this.setState({
      status: "idle",
      person,
      company,
      transcript: [],
      notes: []
    });
    this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    void this.enrich(person.name);
    if (company.name) void this.enrichCompany(company.name);
    return { ok: true };
  }

  @callable()
  async refreshEnrichment() {
    const name = this.state.person.name;
    if (!name) return { ok: false };
    void this.enrich(name);
    return { ok: true };
  }

  @callable()
  async refreshCompanyEnrichment() {
    const name = this.state.company.name;
    if (!name) return { ok: false };
    void this.enrichCompany(name);
    return { ok: true };
  }

  private async enrich(forName: string) {
    const person = this.state.person;
    if (person.name !== forName || !person.name) return;

    try {
      const results = await braveSearchMerged(
        this.env,
        personQueries(person.name, person.company)
      );
      if (results.length === 0) return;

      const { bio, facts, links } = await synthesizePerson(
        this.env,
        person,
        results
      );

      // person may have changed (reset / new meeting) while we were fetching
      if (this.state.person.name !== forName) return;
      this.setState({
        ...this.state,
        person: { ...this.state.person, bio, facts, links }
      });
      this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    } catch (err) {
      console.error("enrichment failed:", err);
    }
  }

  private async enrichCompany(forCompanyName: string) {
    const company = this.state.company;
    if (company.name !== forCompanyName || !company.name) return;

    try {
      const results = await braveSearchMerged(
        this.env,
        companyQueries(company.name)
      );
      if (results.length === 0) return;

      const { summary, culture, links } = await synthesizeCompany(
        this.env,
        company.name,
        results
      );

      // company may have changed (reset / new meeting) while we were fetching
      if (this.state.company.name !== forCompanyName) return;
      this.setState({
        ...this.state,
        company: { ...this.state.company, summary, culture, links }
      });
      this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    } catch (err) {
      console.error("company enrichment failed:", err);
    }
  }

  @callable()
  async start() {
    this.setState({
      ...this.state,
      status: "recording",
      transcript: [],
      notes: []
    });
    this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    return { ok: true };
  }

  @callable()
  async stop() {
    this.setState({ ...this.state, status: "ended" });
    this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    return { ok: true };
  }

  // Client frames audio chunks as: [roleByte, ...audioBytes]. roleByte 0 = me
  // (local mic), 1 = them (shared tab audio from the call).
  async onMessage(conn: Connection, message: WSMessage) {
    if (typeof message === "string" || !(message instanceof ArrayBuffer))
      return;
    if (this.state.status !== "recording") return;
    if (message.byteLength < 2) return;

    const bytes = new Uint8Array(message);
    const role: Role = bytes[0] === 1 ? "them" : "me";
    const audio = bytes.subarray(1);
    await this.transcribeChunk(role, audio);
  }

  private async transcribeChunk(role: Role, audio: Uint8Array) {
    try {
      const result = await this.env.AI.run("@cf/openai/whisper", {
        audio: [...audio]
      });
      const text = (result as { text?: string }).text?.trim();
      if (!text) return;

      const line: TranscriptLine = {
        id: crypto.randomUUID(),
        role,
        text,
        ts: Date.now()
      };
      this.setState({
        ...this.state,
        transcript: [...this.state.transcript, line]
      });
      this.broadcast(JSON.stringify({ type: "transcript", line }));

      await this.maybeGenerateNote();
    } catch (err) {
      console.error("transcription failed:", err);
    }
  }

  private async maybeGenerateNote() {
    const t = this.state.transcript;
    if (t.length === 0 || t.length % 4 !== 0) return;

    const recent = t
      .slice(-6)
      .map((l) => `${l.role}: ${l.text}`)
      .join("\n");

    try {
      const result = await this.env.AI.run(
        "@cf/meta/llama-3.1-8b-instruct-fast",
        {
          messages: [
            {
              role: "user",
              content: `You're assisting someone live during a call. Based on this recent exchange, write ONE short note (max 20 words) capturing a key signal, a follow-up question, or a red/green flag. Respond with just the note text, nothing else.\n\n${recent}`
            }
          ],
          temperature: 0.4,
          max_tokens: 60
        }
      );
      const text = extractModelText(result).trim();
      if (!text) return;

      const note: NoteItem = { id: crypto.randomUUID(), text, ts: Date.now() };
      this.setState({ ...this.state, notes: [...this.state.notes, note] });
      this.broadcast(JSON.stringify({ type: "note", note }));
    } catch (err) {
      console.error("note generation failed:", err);
    }
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
