import { Agent, callable, routeAgentRequest, type Connection } from "agents";

export type Role = "candidate" | "interviewer";

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

const FIXTURE_TRANSCRIPT: { role: Role; text: string }[] = [
  { role: "interviewer", text: "Thanks for joining — walk me through the migration project." },
  { role: "candidate", text: "Sure. We had a Rails monolith hitting scaling limits around 2021." },
  { role: "candidate", text: "First step was carving out the payments path into its own service." },
  { role: "interviewer", text: "What was the hardest part of that split?" },
  { role: "candidate", text: "Data consistency during the transition — we ran dual writes for about 3 months." },
  { role: "candidate", text: "Eventually moved to event-sourced ledger to kill the dual-write class of bugs entirely." },
  { role: "interviewer", text: "How did you validate correctness before cutting over?" },
  { role: "candidate", text: "Shadow traffic diffing — replayed prod requests against both paths, diffed outputs nightly." }
];

const FIXTURE_NOTES: Omit<NoteItem, "id" | "ts">[] = [
  { text: "Strong hands-on migration experience (monolith → services)." },
  { text: "Comfortable discussing tradeoffs, not just outcomes — cites dual-write pain directly." },
  { text: "Shadow-traffic diffing for correctness — good signal for rigor." },
  { text: "Follow up: ask about team size and rollback plan if migration failed." }
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

async function synthesizePerson(
  env: Env,
  person: PersonInfo,
  results: SearchResult[]
): Promise<{ bio: string; links: { label: string; url: string }[] }> {
  const context = results
    .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.description}`)
    .join("\n\n");

  const prompt = `You are prepping an interviewer with background on a candidate before a meeting.

Candidate: ${person.name}${person.role ? `, ${person.role}` : ""}${person.company ? ` at ${person.company}` : ""}

Search results:
${context}

Write a short professional background summary (2-4 sentences, factual, no speculation — only use what's in the search results). Then list up to 4 relevant links (LinkedIn, GitHub, company site, articles) from the results above that are clearly about this specific person.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{"bio": "...", "links": [{"label": "...", "url": "..."}]}`;

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 400
  });

  const raw = (result as { response?: string }).response ?? "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(`No JSON in model response: ${raw.slice(0, 200)}`);

  const parsed = JSON.parse(match[0]) as {
    bio?: string;
    links?: { label: string; url: string }[];
  };
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
  async loadPerson(input: { name: string; company: string; role: string; email: string }) {
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
      this.setState({ ...this.state, person: { ...this.state.person, bio, links } });
      this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    } catch (err) {
      console.error("enrichment failed:", err);
    }
  }

  @callable()
  async reset() {
    this.setState({
      status: "setup",
      person: EMPTY_PERSON,
      transcript: [],
      notes: []
    });
    this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    return { ok: true };
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
    this.simulate();
    return { ok: true };
  }

  @callable()
  async stop() {
    this.setState({ ...this.state, status: "ended" });
    this.broadcast(JSON.stringify({ type: "state", state: this.state }));
    return { ok: true };
  }

  private async simulate() {
    for (let i = 0; i < FIXTURE_TRANSCRIPT.length; i++) {
      if (this.state.status !== "recording") return;
      await sleep(1400);
      if ((this.state as MeetingState).status !== "recording") return;

      const line: TranscriptLine = {
        id: crypto.randomUUID(),
        ts: Date.now(),
        ...FIXTURE_TRANSCRIPT[i]
      };
      this.setState({
        ...this.state,
        transcript: [...this.state.transcript, line]
      });
      this.broadcast(JSON.stringify({ type: "transcript", line }));

      if (i % 2 === 1 && FIXTURE_NOTES[(i - 1) / 2]) {
        const note: NoteItem = {
          id: crypto.randomUUID(),
          ts: Date.now(),
          ...FIXTURE_NOTES[(i - 1) / 2]
        };
        this.setState({
          ...this.state,
          notes: [...this.state.notes, note]
        });
        this.broadcast(JSON.stringify({ type: "note", note }));
      }
    }
    if (this.state.status === "recording") {
      this.setState({ ...this.state, status: "ended" });
      this.broadcast(JSON.stringify({ type: "state", state: this.state }));
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
