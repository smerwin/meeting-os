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
  connected
}: {
  onLoad: (input: SetupFormInput) => void;
  onClose?: () => void;
  connected: boolean;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");

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
          <div className="setup-title">load meeting</div>
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
          ▶ load
        </button>
      </form>
    </div>
  );
}
