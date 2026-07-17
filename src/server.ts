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
    return { ok: true };
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
