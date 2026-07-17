import { Agent, callable, routeAgentRequest, type Connection } from "agents";

export interface TranscriptLine {
  id: string;
  speaker: string;
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
  bio: string;
  links: { label: string; url: string }[];
}

export interface MeetingState {
  status: "idle" | "recording" | "ended";
  person: PersonInfo;
  transcript: TranscriptLine[];
  notes: NoteItem[];
}

const FIXTURE_PERSON: PersonInfo = {
  name: "Jordan Reyes",
  role: "Staff Engineer, Platform",
  company: "Northwind Systems",
  bio: "9y backend/infra. Led migration off monolith to services at Northwind. Previously at Stripe (payments infra). Open source: maintainer of a mid-size Go queue library.",
  links: [
    { label: "LinkedIn", url: "https://linkedin.com/in/example" },
    { label: "GitHub", url: "https://github.com/example" },
    { label: "Company", url: "https://northwind.example.com" }
  ]
};

const FIXTURE_TRANSCRIPT: Omit<TranscriptLine, "id" | "ts">[] = [
  { speaker: "Interviewer", text: "Thanks for joining — walk me through the migration project." },
  { speaker: "Jordan", text: "Sure. We had a Rails monolith hitting scaling limits around 2021." },
  { speaker: "Jordan", text: "First step was carving out the payments path into its own service." },
  { speaker: "Interviewer", text: "What was the hardest part of that split?" },
  { speaker: "Jordan", text: "Data consistency during the transition — we ran dual writes for about 3 months." },
  { speaker: "Jordan", text: "Eventually moved to event-sourced ledger to kill the dual-write class of bugs entirely." },
  { speaker: "Interviewer", text: "How did you validate correctness before cutting over?" },
  { speaker: "Jordan", text: "Shadow traffic diffing — replayed prod requests against both paths, diffed outputs nightly." }
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

export class MeetingAgent extends Agent<Env, MeetingState> {
  initialState: MeetingState = {
    status: "idle",
    person: FIXTURE_PERSON,
    transcript: [],
    notes: []
  };

  async onConnect(conn: Connection) {
    conn.send(JSON.stringify({ type: "state", state: this.state }));
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
