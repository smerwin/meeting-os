import type { MeetingState } from "../server";
import { StatusDot } from "./StatusDot";

export function CallFrame({ status }: { status: MeetingState["status"] }) {
  return (
    <div className="inset-frame">
      <div className="inset-bezel">
        <div className="rec-indicator">
          <StatusDot status={status} />
          <span>{status}</span>
        </div>
        <div className="call-surface">
          <span className="call-placeholder">
            {status === "recording"
              ? "[ streaming mic + shared tab audio to whisper ]"
              : "[ click start, then share the meeting tab (with tab audio) ]"}
          </span>
        </div>
      </div>
    </div>
  );
}
