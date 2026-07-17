import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import type { MeetingIndex, MeetingSummary } from "../server";
import { navigate, newMeetingId } from "../lib/router";
import { TopBar } from "./TopBar";

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function Landing() {
  const [connected, setConnected] = useState(false);
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);

  const agent = useAgent<MeetingIndex>({
    agent: "MeetingIndex",
    name: "global",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), [])
  });

  useEffect(() => {
    if (!connected) return;
    agent.stub.list().then(setMeetings);
  }, [connected, agent]);

  const handleNew = () => navigate(`/m/${newMeetingId()}`);

  return (
    <div className="shell">
      <TopBar connected={connected} />
      <div className="landing">
        <div className="landing-head">
          <span className="setup-title">meetings</span>
          <button className="btn" disabled={!connected} onClick={handleNew}>
            + new meeting
          </button>
        </div>

        {meetings.length === 0 && (
          <div className="empty">-- no meetings yet --</div>
        )}

        <div className="meeting-list">
          {meetings.map((m) => (
            <button
              key={m.id}
              className="meeting-row"
              onClick={() => navigate(`/m/${m.id}`)}
            >
              <span className="meeting-row-name">
                {m.personName || "(untitled)"}
              </span>
              <span className="meeting-row-company">{m.company}</span>
              <span className="meeting-row-status">{m.status}</span>
              <span className="meeting-row-date">{fmtDate(m.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
