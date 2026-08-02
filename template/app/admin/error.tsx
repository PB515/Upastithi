'use client';

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex-1 p-6">
      <div className="max-w-sm rounded-[var(--radius)] border border-border p-6 text-center">
        <p className="mb-3">Something went wrong loading this page.</p>
        <button
          type="button"
          onClick={reset}
          className="rounded-[var(--radius)] bg-accent px-3 py-2 text-sm text-accent-foreground"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
