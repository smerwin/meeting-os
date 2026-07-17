import { useEffect, useRef } from "react";
import type { MeetingState } from "../server";
import { StatusDot } from "./StatusDot";

export function CallFrame({
  status,
  videoStream
}: {
  status: MeetingState["status"];
  videoStream: MediaStream | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = videoStream;
  }, [videoStream]);

  return (
    <div className="inset-frame">
      <div className="inset-bezel">
        <div className="rec-indicator">
          <StatusDot status={status} />
          <span>{status}</span>
        </div>
        <div className="call-surface">
          {videoStream ? (
            <video
              ref={videoRef}
              className="call-video"
              autoPlay
              muted
              playsInline
            />
          ) : (
            <span className="call-placeholder">
              {status === "recording"
                ? "[ streaming mic + shared tab audio to whisper ]"
                : "[ click start, then share the meeting tab (with tab audio) ]"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
