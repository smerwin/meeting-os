import { useCallback, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type {
  MeetingAgent,
  MeetingState,
  NoteItem,
  TranscriptLine
} from "./server";
import { EMPTY_STATE, normalizeState } from "./lib/meetingState";
import {
  ROLE_ME,
  ROLE_THEM,
  startPcmCapture,
  type PcmCapture
} from "./lib/audioCapture";
import { TopBar } from "./components/TopBar";
import { SetupForm, type SetupFormInput } from "./components/SetupForm";
import { CallFrame } from "./components/CallFrame";
import { TranscriptPanel } from "./components/TranscriptPanel";
import { NotesPanel } from "./components/NotesPanel";
import { PersonPanel } from "./components/PersonPanel";
import { CompanyPanel } from "./components/CompanyPanel";

export default function App() {
  const [state, setState] = useState<MeetingState>(EMPTY_STATE);
  const [connected, setConnected] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<"new" | "edit" | null>(null);
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
          setState(normalizeState(msg.state as Partial<MeetingState>));
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

  const stopCapture = useCallback(() => {
    for (const capture of capturesRef.current) capture.stop();
    capturesRef.current = [];
    for (const stream of streamsRef.current) {
      for (const track of stream.getTracks()) track.stop();
    }
    streamsRef.current = [];
  }, []);

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

  const handleLoad = (input: SetupFormInput) => {
    stopCapture();
    agent.stub.loadPerson(input);
    setOverlay(null);
  };

  const handleEdit = (input: SetupFormInput) => {
    agent.stub.editPerson(input);
    setOverlay(null);
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
        <TopBar connected={connected} />
        <SetupForm onLoad={handleLoad} connected={connected} />
      </div>
    );
  }

  return (
    <div className="shell">
      <TopBar
        connected={connected}
        session={{
          personName: state.person.name,
          status: state.status,
          onStart: handleStart,
          onStop: handleStop,
          onNewMeeting: () => setOverlay("new"),
          onEdit: () => setOverlay("edit")
        }}
      />

      {captureError && (
        <div className="capture-error-banner">{captureError}</div>
      )}

      {overlay === "new" && (
        <div className="overlay">
          <SetupForm
            onLoad={handleLoad}
            onClose={() => setOverlay(null)}
            connected={connected}
          />
        </div>
      )}

      {overlay === "edit" && (
        <div className="overlay">
          <SetupForm
            onLoad={handleEdit}
            onClose={() => setOverlay(null)}
            connected={connected}
            initial={{
              name: state.person.name,
              company: state.person.company,
              role: state.person.role,
              email: state.person.email
            }}
            title="edit meeting"
            submitLabel="✓ save"
          />
        </div>
      )}

      <div className="grid">
        <TranscriptPanel
          transcript={state.transcript}
          personName={state.person.name}
        />

        <main className="center">
          <CallFrame status={state.status} />
          <NotesPanel notes={state.notes} />
        </main>

        <aside className="side-col">
          <PersonPanel
            person={state.person}
            connected={connected}
            onRefresh={() => agent.stub.refreshEnrichment()}
          />
          <CompanyPanel
            company={state.company}
            connected={connected}
            onRefresh={() => agent.stub.refreshCompanyEnrichment()}
          />
        </aside>
      </div>
    </div>
  );
}
