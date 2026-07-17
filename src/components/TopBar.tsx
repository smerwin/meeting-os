import type { MeetingState } from "../server";

export interface TopBarSession {
  personName: string;
  status: MeetingState["status"];
  onStart: () => void;
  onStop: () => void;
  onNewMeeting: () => void;
}

export function TopBar({
  connected,
  session
}: {
  connected: boolean;
  session?: TopBarSession;
}) {
  return (
    <header className="topbar">
      <span className="brand">meeting-os</span>
      {session && (
        <>
          <span className="sep">/</span>
          <span className="session">{session.personName}</span>
        </>
      )}
      <div className="spacer" />
      {session && (
        <div className="record-controls">
          <button
            className="btn btn-sm"
            disabled={!connected || session.status === "recording"}
            onClick={session.onStart}
          >
            ▶ start
          </button>
          <button
            className="btn btn-sm"
            disabled={!connected || session.status !== "recording"}
            onClick={session.onStop}
          >
            ■ stop
          </button>
        </div>
      )}
      <span className={`conn ${connected ? "on" : "off"}`}>
        {connected ? "● connected" : "○ disconnected"}
      </span>
      {session && (
        <button className="btn btn-sm" onClick={session.onNewMeeting}>
          ↺ new meeting
        </button>
      )}
    </header>
  );
}
