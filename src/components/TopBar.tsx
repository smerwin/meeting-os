import type { MeetingState } from "../server";
import { navigate } from "../lib/router";

export interface TopBarSession {
  personName: string;
  status: MeetingState["status"];
  onStart: () => void;
  onStop: () => void;
  onEdit: () => void;
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
      <button className="brand-link" onClick={() => navigate("/")}>
        meeting-os
      </button>
      {session && (
        <>
          <span className="sep">/</span>
          <span className="session">{session.personName}</span>
        </>
      )}
      <span className={`conn ${connected ? "on" : "off"}`}>
        {connected ? "● connected" : "○ disconnected"}
      </span>
      <div className="spacer" />
      {session && (
        <div className="topbar-actions">
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
          <button className="btn btn-sm" onClick={session.onEdit}>
            ✎ edit
          </button>
        </div>
      )}
    </header>
  );
}
