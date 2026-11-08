export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading measurements"
      className="animate-pulse"
    >
      <div className="h-5 w-16 bg-ink/10" />
      <div className="mt-6 h-9 w-64 bg-ink/10" />
      <div className="mt-6 h-12 bg-ink/10" />
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="h-20 border-b border-ink/15" />
      ))}
    </div>
  );
}
