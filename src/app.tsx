import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type { MeetingAgent, MeetingState, NoteItem, TranscriptLine } from "./server";

const EMPTY_STATE: MeetingState = {
  status: "idle",
  person: { name: "", role: "", company: "", bio: "", links: [] },
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

  const handleStart = () => agent.stub.start();
  const handleStop = () => agent.stub.stop();

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">meeting-os</span>
        <span className="sep">/</span>
        <span className="session">session_0001</span>
        <div className="spacer" />
        <span className={`conn ${connected ? "on" : "off"}`}>
          {connected ? "● connected" : "○ disconnected"}
        </span>
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
                <span
                  className={`speaker ${line.speaker === "Jordan" ? "them" : "you"}`}
                >
                  {line.speaker}:
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
            <div className="person-bio">{state.person.bio}</div>
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
