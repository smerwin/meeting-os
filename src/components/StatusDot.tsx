import type { MeetingState } from "../server";

export function StatusDot({ status }: { status: MeetingState["status"] }) {
  const color =
    status === "recording"
      ? "#dc322f"
      : status === "ended"
        ? "#93a1a1"
        : "#657b83";
  return <span className="dot" style={{ background: color }} />;
}
