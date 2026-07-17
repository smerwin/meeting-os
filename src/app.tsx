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
  onClose,
  connected
}: {
  onLoad: (input: {
    name: string;
    company: string;
    role: string;
    email: string;
  }) => void;
  onClose?: () => void;
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
        <div className="setup-form-head">
          <div className="setup-title">load meeting</div>
          {onClose && (
            <button
              type="button"
              className="setup-close"
              aria-label="Cancel"
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>
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

const CHUNK_SECONDS = 4;
const ROLE_ME = 0;
const ROLE_THEM = 1;
// Whisper hallucinates ("you", "thank you", repeated garbage tokens) when fed
// near-silent audio. Skip chunks quiet enough that there's nothing to transcribe.
const SILENCE_RMS_THRESHOLD = 0.008;

function rms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// Whisper rejects MediaRecorder's webm/opus container ("Invalid audio input").
// Capture raw PCM via Web Audio instead and encode it as a WAV file per chunk.
function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

interface PcmCapture {
  ctx: AudioContext;
  stop: () => void;
}

function startPcmCapture(
  stream: MediaStream,
  roleByte: number,
  agent: { send: (data: ArrayBuffer) => void }
): PcmCapture {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const silentGain = ctx.createGain();
  silentGain.gain.value = 0;

  const targetSamples = ctx.sampleRate * CHUNK_SECONDS;
  let buffers: Float32Array[] = [];
  let collected = 0;

  processor.onaudioprocess = (e) => {
    buffers.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    collected += e.inputBuffer.length;
    if (collected < targetSamples) return;

    const merged = new Float32Array(collected);
    let pos = 0;
    for (const buf of buffers) {
      merged.set(buf, pos);
      pos += buf.length;
    }
    buffers = [];
    collected = 0;

    if (rms(merged) < SILENCE_RMS_THRESHOLD) return;

    const wav = encodeWav(merged, ctx.sampleRate);
    const framed = new Uint8Array(wav.byteLength + 1);
    framed[0] = roleByte;
    framed.set(new Uint8Array(wav), 1);
    agent.send(framed.buffer);
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(ctx.destination);

  return {
    ctx,
    stop: () => {
      processor.disconnect();
      source.disconnect();
      silentGain.disconnect();
      void ctx.close();
    }
  };
}

export default function App() {
  const [state, setState] = useState<MeetingState>(EMPTY_STATE);
  const [connected, setConnected] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const capturesRef = useRef<PcmCapture[]>([]);

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
    for (const capture of capturesRef.current) capture.stop();
    capturesRef.current = [];
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

    capturesRef.current.push(
      startPcmCapture(new MediaStream(mic.getAudioTracks()), ROLE_ME, agent)
    );

    const tabAudioTracks = tab.getAudioTracks();
    if (tabAudioTracks.length === 0) {
      setCaptureError(
        'No tab audio captured — when sharing, pick the meeting tab and enable "Share tab audio".'
      );
    } else {
      capturesRef.current.push(
        startPcmCapture(new MediaStream(tabAudioTracks), ROLE_THEM, agent)
      );
    }
  }, [agent]);

  const handleLoad = (input: {
    name: string;
    company: string;
    role: string;
    email: string;
  }) => {
    stopCapture();
    agent.stub.loadPerson(input);
    setCreatingNew(false);
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
        <button className="btn btn-sm" onClick={() => setCreatingNew(true)}>
          ↺ new meeting
        </button>
      </header>

      {creatingNew && (
        <div className="overlay">
          <SetupForm
            onLoad={handleLoad}
            onClose={() => setCreatingNew(false)}
            connected={connected}
          />
        </div>
      )}

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
                  {line.role === "them" ? state.person.name || "Them" : "Me"}:
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
          <div className="panel-head">participant</div>
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
