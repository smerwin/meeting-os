export function FactsList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <div className="hr" />
      <ul className="facts">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
