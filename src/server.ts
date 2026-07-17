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
  links: { label: string; url: string }[];
}

export interface MeetingState {
  status: "setup" | "idle" | "recording" | "ended";
  person: PersonInfo;
  transcript: TranscriptLine[];
  notes: NoteItem[];
}

const EMPTY_PERSON: PersonInfo = {
  name: "",
  role: "",
  company: "",
  email: "",
  bio: "",
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
  return (data.web?.results ?? []).slice(0, 6).map((r) => ({
    title: r.title,
    url: r.url,
    description: r.description
  }));
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

async function synthesizePerson(
  env: Env,
  person: PersonInfo,
  results: SearchResult[]
): Promise<{ bio: string; links: { label: string; url: string }[] }> {
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`)
    .join("\n\n");

  const prompt = `You are prepping someone with background on a person before a meeting.

Person: ${person.name}${person.role ? `, ${person.role}` : ""}${person.company ? ` at ${person.company}` : ""}

Search results:
${context}

Write a short professional background summary (2-4 sentences, factual, no speculation — only use what's in the search results). Then list up to 4 relevant links (LinkedIn, GitHub, company site, articles) from the results above that are clearly about this specific person.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"bio": "...", "links": [{"label": "...", "url": "..."}]}`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fast", {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 400
  });

  const response = (result as AiTextResult).response;

  let parsed: { bio?: string; links?: { label: string; url: string }[] };
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
    links: Array.isArray(parsed.links) ? parsed.links : []
  };
}

export class MeetingAgent extends Agent<Env, MeetingState> {
  initialState: MeetingState = {
    status: "setup",
    person: EMPTY_PERSON,
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
      links: []
    };
    this.setState({
      status: "idle",
      person,
      transcript: [],
      notes: []
    });
    this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    void this.enrich(person.name);
    return { ok: true };
  }

  @callable()
  async refreshEnrichment() {
    const name = this.state.person.name;
    if (!name) return { ok: false };
    void this.enrich(name);
    return { ok: true };
  }

  private async enrich(forName: string) {
    const person = this.state.person;
    if (person.name !== forName || !person.name) return;

    try {
      const query = [person.name, person.company].filter(Boolean).join(" ");
      const results = await braveSearch(this.env, query);
      if (results.length === 0) return;

      const { bio, links } = await synthesizePerson(this.env, person, results);

      // person may have changed (reset / new meeting) while we were fetching
      if (this.state.person.name !== forName) return;
      this.setState({
        ...this.state,
        person: { ...this.state.person, bio, links }
      });
      this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    } catch (err) {
      console.error("enrichment failed:", err);
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
