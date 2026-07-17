import type { NoteItem } from "../server";

export function NotesPanel({ notes }: { notes: NoteItem[] }) {
  return (
    <section className="panel notes-panel">
      <div className="panel-head">live notes</div>
      <div className="panel-body scroll">
        {notes.length === 0 && <div className="empty">-- no notes yet --</div>}
        {notes.map((note) => (
          <div key={note.id} className="note">
            <span className="bullet">›</span> {note.text}
          </div>
        ))}
      </div>
    </section>
  );
}
