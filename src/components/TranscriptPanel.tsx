import { useEffect, useRef } from "react";
import type { TranscriptLine } from "../server";

function fmtTime(ts: number) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour12: false });
}

export function TranscriptPanel({
  transcript,
  personName
}: {
  transcript: TranscriptLine[];
  personName: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth"
    });
  }, [transcript.length]);

  return (
    <aside className="panel transcript-panel">
      <div className="panel-head">transcript</div>
      <div className="panel-body scroll" ref={scrollRef}>
        {transcript.length === 0 && (
          <div className="empty">-- waiting for audio --</div>
        )}
        {transcript.map((line) => (
          <div key={line.id} className="line">
            <span className="ts">{fmtTime(line.ts)}</span>{" "}
            <span className={`speaker ${line.role}`}>
              {line.role === "them" ? personName || "Them" : "Me"}:
            </span>{" "}
            <span className="text">{line.text}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
