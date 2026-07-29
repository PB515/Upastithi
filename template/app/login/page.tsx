import { signIn } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <form
        action={signIn}
        className="w-full max-w-sm space-y-4 border border-border rounded-[var(--radius)] p-6"
      >
        <h1 className="font-display text-xl">Sign in</h1>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm text-muted">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm text-muted">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-[var(--radius)] bg-accent px-3 py-2 text-accent-foreground"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
