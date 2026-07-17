import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type { MeetingAgent, MeetingState, NoteItem, TranscriptLine } from "./server";

const EMPTY_STATE: MeetingState = {
  status: "setup",
  person: { name: "", role: "", company: "", email: "", bio: "", links: [] },
  transcript: [],
  notes: []
};

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false });
}

function StatusDot({ status }: { status: MeetingState["status"] }) {
  const color =
    status === "recording" ? "#dc322f" : status === "ended" ? "#93a1a1" : "#657b83";
  return <span className="dot" style={{ background: color }} />;
}

function SetupForm({
  onLoad,
  connected
}: {
  onLoad: (input: { name: string; company: string; role: string; email: string }) => void;
  connected: boolean;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");

  return (
    <div className="setup">
      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onLoad({ name, company, role, email });
        }}
      >
        <div className="setup-title">load meeting</div>
        <label>
          name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          role
          <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Staff Engineer" />
        </label>
        <label>
          company
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label>
          email
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="for enrichment lookup" />
        </label>
        <button className="btn" type="submit" disabled={!connected || !name.trim()}>
          ▶ load
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [state, setState] = useState<MeetingState>(EMPTY_STATE);
  const [connected, setConnected] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const agent = useAgent<MeetingAgent>({
    agent: "MeetingAgent",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onMessage: useCallback((event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === "state") {
          setState(msg.state as MeetingState);
        } else if (msg.type === "transcript") {
          const line = msg.line as TranscriptLine;
          setState((s) => ({ ...s, transcript: [...s.transcript, line] }));
        } else if (msg.type === "note") {
          const note = msg.note as NoteItem;
          setState((s) => ({ ...s, notes: [...s.notes, note] }));
        }
      } catch {
        // ignore non-JSON
      }
    }, [])
  });

  useEffect(() => {
    transcriptRef.current?.scrollTo({
      top: transcriptRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [state.transcript.length]);

  const handleLoad = (input: { name: string; company: string; role: string; email: string }) =>
    agent.stub.loadPerson(input);
  const handleReset = () => agent.stub.reset();
  const handleStart = () => agent.stub.start();
  const handleStop = () => agent.stub.stop();

  if (state.status === "setup") {
    return (
      <div className="shell">
        <header className="topbar">
          <span className="brand">meeting-os</span>
          <div className="spacer" />
          <span className={`conn ${connected ? "on" : "off"}`}>
            {connected ? "● connected" : "○ disconnected"}
          </span>
        </header>
        <SetupForm onLoad={handleLoad} connected={connected} />
      </div>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">meeting-os</span>
        <span className="sep">/</span>
        <span className="session">{state.person.name}</span>
        <div className="spacer" />
        <span className={`conn ${connected ? "on" : "off"}`}>
          {connected ? "● connected" : "○ disconnected"}
        </span>
        <button className="btn btn-sm" onClick={handleReset}>
          ↺ new meeting
        </button>
      </header>

      <div className="grid">
        <aside className="panel transcript-panel">
          <div className="panel-head">transcript</div>
          <div className="panel-body scroll" ref={transcriptRef}>
            {state.transcript.length === 0 && (
              <div className="empty">-- waiting for audio --</div>
            )}
            {state.transcript.map((line) => (
              <div key={line.id} className="line">
                <span className="ts">{fmtTime(line.ts)}</span>{" "}
                <span className={`speaker ${line.role}`}>
                  {line.role === "candidate" ? state.person.name || "Candidate" : "Interviewer"}:
                </span>{" "}
                <span className="text">{line.text}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="center">
          <div className="inset-frame">
            <div className="inset-bezel">
              <div className="rec-indicator">
                <StatusDot status={state.status} />
                <span>{state.status}</span>
              </div>
              <div className="call-surface">
                <span className="call-placeholder">
                  [ webrtc call surface — camera/mic feed renders here ]
                </span>
              </div>
            </div>
          </div>

          <div className="controls">
            <button
              className="btn"
              disabled={!connected || state.status === "recording"}
              onClick={handleStart}
            >
              ▶ start
            </button>
            <button
              className="btn"
              disabled={!connected || state.status !== "recording"}
              onClick={handleStop}
            >
              ■ stop
            </button>
          </div>

          <section className="panel notes-panel">
            <div className="panel-head">live notes</div>
            <div className="panel-body scroll">
              {state.notes.length === 0 && (
                <div className="empty">-- no notes yet --</div>
              )}
              {state.notes.map((note) => (
                <div key={note.id} className="note">
                  <span className="bullet">›</span> {note.text}
                </div>
              ))}
            </div>
          </section>
        </main>

        <aside className="panel person-panel">
          <div className="panel-head">candidate</div>
          <div className="panel-body">
            <div className="person-name">{state.person.name || "—"}</div>
            <div className="person-role">{state.person.role}</div>
            <div className="person-company">{state.person.company}</div>
            <div className="hr" />
            <div className="person-bio">
              {state.person.bio || "-- no enrichment data yet --"}
            </div>
            {state.person.links.length > 0 && (
              <>
                <div className="hr" />
                <div className="links">
                  {state.person.links.map((l) => (
                    <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
