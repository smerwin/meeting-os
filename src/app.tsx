import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type {
  MeetingAgent,
  MeetingState,
  NoteItem,
  TranscriptLine
} from "./server";

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
    status === "recording"
      ? "#dc322f"
      : status === "ended"
        ? "#93a1a1"
        : "#657b83";
  return <span className="dot" style={{ background: color }} />;
}

function SetupForm({
  onLoad,
  connected
}: {
  onLoad: (input: {
    name: string;
    company: string;
    role: string;
    email: string;
  }) => void;
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
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          role
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Staff Engineer"
          />
        </label>
        <label>
          company
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label>
          email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="for enrichment lookup"
          />
        </label>
        <button
          className="btn"
          type="submit"
          disabled={!connected || !name.trim()}
        >
          ▶ load
        </button>
      </form>
    </div>
  );
}

const CHUNK_MS = 4000;
const ROLE_INTERVIEWER = 0;
const ROLE_CANDIDATE = 1;

async function sendChunk(
  agent: { send: (data: ArrayBuffer) => void },
  roleByte: number,
  blob: Blob
) {
  if (blob.size === 0) return;
  const buf = await blob.arrayBuffer();
  const framed = new Uint8Array(buf.byteLength + 1);
  framed[0] = roleByte;
  framed.set(new Uint8Array(buf), 1);
  agent.send(framed.buffer);
}

export default function App() {
  const [state, setState] = useState<MeetingState>(EMPTY_STATE);
  const [connected, setConnected] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const recordersRef = useRef<MediaRecorder[]>([]);

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

  const stopCapture = useCallback(() => {
    for (const rec of recordersRef.current) {
      if (rec.state !== "inactive") rec.stop();
    }
    recordersRef.current = [];
    for (const stream of streamsRef.current) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamsRef.current = [];
  }, []);

  useEffect(() => stopCapture, [stopCapture]);

  const startCapture = useCallback(async () => {
    setCaptureError(null);

    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tab = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    streamsRef.current = [mic, tab];

    const micRec = new MediaRecorder(new MediaStream(mic.getAudioTracks()), {
      mimeType: "audio/webm;codecs=opus"
    });
    micRec.ondataavailable = (e) => sendChunk(agent, ROLE_INTERVIEWER, e.data);
    micRec.start(CHUNK_MS);
    recordersRef.current.push(micRec);

    const tabAudioTracks = tab.getAudioTracks();
    if (tabAudioTracks.length === 0) {
      setCaptureError(
        'No tab audio captured — when sharing, pick the Google Meet tab and enable "Share tab audio".'
      );
    } else {
      const tabRec = new MediaRecorder(new MediaStream(tabAudioTracks), {
        mimeType: "audio/webm;codecs=opus"
      });
      tabRec.ondataavailable = (e) => sendChunk(agent, ROLE_CANDIDATE, e.data);
      tabRec.start(CHUNK_MS);
      recordersRef.current.push(tabRec);
    }
  }, [agent]);

  const handleLoad = (input: {
    name: string;
    company: string;
    role: string;
    email: string;
  }) => agent.stub.loadPerson(input);

  const handleReset = () => {
    stopCapture();
    agent.stub.reset();
  };

  const handleStart = async () => {
    try {
      await startCapture();
    } catch (err) {
      setCaptureError(
        err instanceof Error ? err.message : "Failed to start audio capture."
      );
      return;
    }
    agent.stub.start();
  };

  const handleStop = () => {
    stopCapture();
    agent.stub.stop();
  };

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
                  {line.role === "candidate"
                    ? state.person.name || "Candidate"
                    : "Interviewer"}
                  :
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
                  {state.status === "recording"
                    ? "[ streaming mic + shared tab audio to whisper ]"
                    : "[ click start, then share the Google Meet tab (with tab audio) ]"}
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
            {captureError && (
              <span className="capture-error">{captureError}</span>
            )}
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
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                    >
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
