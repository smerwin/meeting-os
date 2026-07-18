import { useCallback, useEffect, useState } from "react";
import { useAgent } from "agents/react";
import type { MeetingIndex, MeetingSummary } from "../server";
import { navigate, newMeetingId } from "../lib/router";
import { TopBar } from "./TopBar";
import { ConfirmDialog } from "./ConfirmDialog";

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
  const [pendingDelete, setPendingDelete] = useState<MeetingSummary | null>(
    null
  );

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

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    setMeetings((prev) => prev.filter((m) => m.id !== id));
    await agent.stub.remove(id);
  };

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
            <div key={m.id} className="meeting-row">
              <button
                type="button"
                className="meeting-row-link"
                onClick={() => navigate(`/m/${m.id}`)}
              >
                <span className="meeting-row-name">
                  {m.personName || "(untitled)"}
                </span>
                <span className="meeting-row-company">{m.company}</span>
                <span className="meeting-row-status">{m.status}</span>
                <span className="meeting-row-date">{fmtDate(m.updatedAt)}</span>
              </button>
              <button
                type="button"
                className="meeting-row-delete"
                aria-label={`Delete meeting with ${m.personName || "this person"}`}
                onClick={() => setPendingDelete(m)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="delete meeting"
          message={`Delete the meeting with ${pendingDelete.personName || "(untitled)"}${pendingDelete.company ? ` at ${pendingDelete.company}` : ""}? This can't be undone.`}
          confirmLabel="delete"
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
