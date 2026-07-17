export function LinksList({
  links
}: {
  links: { label: string; url: string }[];
}) {
  if (links.length === 0) return null;
  return (
    <>
      <div className="hr" />
      <div className="links">
        {links.map((l) => (
          <a key={l.url} href={l.url} target="_blank" rel="noreferrer">
            {l.label} ↗
          </a>
        ))}
      </div>
    </>
  );
}
