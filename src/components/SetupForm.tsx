import { useState } from "react";

export interface SetupFormInput {
  name: string;
  company: string;
  role: string;
  email: string;
}

export function SetupForm({
  onLoad,
  onClose,
  connected,
  initial,
  title = "load meeting",
  submitLabel = "▶ load"
}: {
  onLoad: (input: SetupFormInput) => void;
  onClose?: () => void;
  connected: boolean;
  initial?: SetupFormInput;
  title?: string;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");

  return (
    <div className="setup">
      <form
        className="setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onLoad({ name, company, role, email });
        }}
      >
        <div className="setup-form-head">
          <div className="setup-title">{title}</div>
          {onClose && (
            <button
              type="button"
              className="setup-close"
              aria-label="Cancel"
              onClick={onClose}
            >
              ✕
            </button>
          )}
        </div>
        <label>
          name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          role
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Staff Engineer"
          />
        </label>
        <label>
          company
          <input value={company} onChange={(e) => setCompany(e.target.value)} />
        </label>
        <label>
          email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="for enrichment lookup"
          />
        </label>
        <button
          className="btn"
          type="submit"
          disabled={!connected || !name.trim()}
        >
          {submitLabel}
        </button>
      </form>
    </div>
  );
}
