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
  const safeLinks = links
    .map((l) => ({ label: l.label, url: safeExternalUrl(l.url) }))
    .filter((l): l is { label: string; url: string } => l.url !== null);

  if (safeLinks.length === 0) return null;
  return (
    <>
      <div className="hr" />
      <div className="links">
        {safeLinks.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
            {l.label} ↗
          </a>
        ))}
      </div>
    </>
  );
}
