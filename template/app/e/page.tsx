import { redeemCode } from './actions';

export default async function ManagementEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <form
        action={redeemCode}
        className="w-full max-w-sm space-y-4 rounded-[var(--radius)] border border-border p-6"
      >
        <h1 className="font-display text-xl">Enter access code</h1>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="code" className="block text-sm text-muted">
            The short code an event admin shared with you
          </label>
          <input
            id="code"
            name="code"
            type="text"
            required
            autoComplete="off"
            autoCapitalize="characters"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2 uppercase tracking-widest"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-[var(--radius)] bg-accent px-3 py-2 text-accent-foreground"
        >
          Continue
        </button>

        <p className="text-xs text-muted">Have a link instead? Just open it directly.</p>
      </form>
    </main>
  );
}
