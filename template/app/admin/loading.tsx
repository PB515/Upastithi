export default function AdminLoading() {
  return (
    <main className="flex-1 p-6">
      <div className="mb-4 h-7 w-32 animate-pulse rounded-[var(--radius)] bg-black/10" />
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[var(--radius)] border border-border bg-black/5" />
        ))}
      </div>
    </main>
  );
}
