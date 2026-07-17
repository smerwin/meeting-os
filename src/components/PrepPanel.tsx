import { useState } from "react";
import type { ContextItem, MeetingPrep } from "../server";

function AddContextForm({
  onAdd
}: {
  onAdd: (input: { label: string; content: string }) => void;
}) {
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");

  return (
    <form
      className="add-context-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!content.trim()) return;
        onAdd({ label, content });
        setLabel("");
        setContent("");
      }}
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="label, e.g. Job Description"
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="paste text here..."
        rows={3}
      />
      <button className="btn btn-sm" type="submit" disabled={!content.trim()}>
        + add
      </button>
    </form>
  );
}

export function PrepPanel({
  context,
  prep,
  connected,
  onAddContext,
  onRemoveContext,
  onGenerate
}: {
  context: ContextItem[];
  prep: MeetingPrep;
  connected: boolean;
  onAddContext: (input: { label: string; content: string }) => void;
  onRemoveContext: (id: string) => void;
  onGenerate: () => void;
}) {
  return (
    <div className="panel prep-panel">
      <div className="panel-head panel-head-row">
        <span>prep</span>
        <button
          className="panel-action"
          disabled={!connected}
          onClick={onGenerate}
          aria-label="Generate talking points and questions"
        >
          ↻ generate
        </button>
      </div>
      <div className="panel-body scroll">
        <div className="prep-subhead">context</div>
        {context.length === 0 && (
          <div className="empty">-- no context added --</div>
        )}
        {context.map((item) => (
          <div key={item.id} className="context-item">
            <div className="context-item-head">
              <span className="context-item-label">{item.label}</span>
              <button
                className="panel-action"
                onClick={() => onRemoveContext(item.id)}
                aria-label={`Remove ${item.label}`}
              >
                ✕
              </button>
            </div>
            <div className="context-item-preview">
              {item.content.slice(0, 120)}
              {item.content.length > 120 ? "…" : ""}
            </div>
          </div>
        ))}
        <AddContextForm onAdd={onAddContext} />

        <div className="hr" />
        <div className="prep-subhead">talking points</div>
        {prep.talkingPoints.length === 0 ? (
          <div className="empty">-- no prep generated yet --</div>
        ) : (
          <ul className="facts">
            {prep.talkingPoints.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        )}

        <div className="prep-subhead">questions</div>
        {prep.questions.length === 0 ? (
          <div className="empty">-- no prep generated yet --</div>
        ) : (
          <ul className="facts">
            {prep.questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
