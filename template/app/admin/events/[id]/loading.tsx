export default function EventDetailLoading() {
  return (
    <main className="flex-1 p-6">
      <div className="mb-4 h-5 w-28 animate-pulse rounded-[var(--radius)] bg-black/10" />
      <div className="h-48 max-w-sm animate-pulse rounded-[var(--radius)] border border-border bg-black/5" />
    </main>
  );
}
