import { useCallback, useRef, useState } from "react";
import { useAgent } from "agents/react";
import type {
  MeetingAgent,
  MeetingState,
  NoteItem,
  TranscriptLine
} from "../server";
import { EMPTY_STATE, normalizeState } from "../lib/meetingState";
import {
  ROLE_ME,
  ROLE_THEM,
  startPcmCapture,
  type PcmCapture
} from "../lib/audioCapture";
import { navigate, newMeetingId } from "../lib/router";
import { TopBar } from "./TopBar";
import { SetupForm, type SetupFormInput } from "./SetupForm";
import { CallFrame } from "./CallFrame";
import { TranscriptPanel } from "./TranscriptPanel";
import { NotesPanel } from "./NotesPanel";
import { PersonPanel } from "./PersonPanel";
import { CompanyPanel } from "./CompanyPanel";
import { PrepPanel } from "./PrepPanel";

export function MeetingView({ meetingId }: { meetingId: string }) {
  const [state, setState] = useState<MeetingState>(EMPTY_STATE);
  const [connected, setConnected] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const streamsRef = useRef<MediaStream[]>([]);
  const capturesRef = useRef<PcmCapture[]>([]);

  const agent = useAgent<MeetingAgent>({
    agent: "MeetingAgent",
    name: meetingId,
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
    setVideoStream(null);
  }, []);

  const startCapture = useCallback(async () => {
    setCaptureError(null);

    const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
    const tab = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true
    });
    streamsRef.current = [mic, tab];

    const tabVideoTrack = tab.getVideoTracks()[0];
    if (tabVideoTrack) {
      setVideoStream(tab);
      // Browser's native "Stop sharing" control ends the track without
      // going through our Stop button — clean up the same way it would.
      tabVideoTrack.addEventListener("ended", () => {
        stopCapture();
        agent.stub.stop();
      });
    }

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
  }, [agent, stopCapture]);

  const handleLoad = (input: SetupFormInput) => {
    stopCapture();
    agent.stub.loadPerson(input);
  };

  const handleEdit = (input: SetupFormInput) => {
    agent.stub.editPerson(input);
    setEditing(false);
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
          onNewMeeting: () => navigate(`/m/${newMeetingId()}`),
          onEdit: () => setEditing(true)
        }}
      />

      {captureError && (
        <div className="capture-error-banner">{captureError}</div>
      )}

      {editing && (
        <div className="overlay">
          <SetupForm
            onLoad={handleEdit}
            onClose={() => setEditing(false)}
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
          <CallFrame status={state.status} videoStream={videoStream} />
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
          <PrepPanel
            context={state.context}
            prep={state.prep}
            connected={connected}
            onAddContext={(input) => agent.stub.addContext(input)}
            onRemoveContext={(id) => agent.stub.removeContext(id)}
            onGenerate={() => agent.stub.generatePrep()}
          />
        </aside>
      </div>
    </div>
  );
}
