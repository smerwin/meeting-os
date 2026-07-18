import { useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

function safeExternalUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function LinksList({
  links
}: {
  links: { label: string; url: string }[];
}) {
  const [pending, setPending] = useState<{
    label: string;
    url: string;
  } | null>(null);

  const safeLinks = links
    .map((l) => ({ label: l.label, url: safeExternalUrl(l.url) }))
    .filter((l): l is { label: string; url: string } => l.url !== null);

  if (safeLinks.length === 0) return null;

  return (
    <>
      <div className="hr" />
      <div className="links">
        {safeLinks.map((l) => (
          <a
            key={l.url}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.preventDefault();
              setPending(l);
            }}
          >
            {l.label} ↗
          </a>
        ))}
      </div>

      {pending && (
        <ConfirmDialog
          title="open external link"
          message={pending.url}
          confirmLabel="open"
          onConfirm={() => {
            window.open(pending.url, "_blank", "noopener,noreferrer");
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
