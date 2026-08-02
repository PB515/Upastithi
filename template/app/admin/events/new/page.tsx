import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createEvent } from './actions';

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: staffRow } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (staffRow?.role !== 'admin') {
    redirect('/login?error=Not authorized for this account');
  }

  const { error } = await searchParams;

  return (
    <main className="flex-1 p-6">
      <div className="mb-4">
        <Link href="/admin" className="text-sm underline">
          &larr; Back to events
        </Link>
      </div>

      <form
        action={createEvent}
        className="w-full max-w-sm space-y-4 rounded-[var(--radius)] border border-border p-6"
      >
        <h1 className="font-display text-xl">Create event</h1>

        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="name" className="block text-sm text-muted">
            Event name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="event_date" className="block text-sm text-muted">
            Date
          </label>
          <input
            id="event_date"
            name="event_date"
            type="date"
            required
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="location" className="block text-sm text-muted">
            Location <span className="text-muted">(optional)</span>
          </label>
          <input
            id="location"
            name="location"
            type="text"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-[var(--radius)] bg-accent px-3 py-2 text-accent-foreground"
        >
          Create event
        </button>
      </form>
    </main>
  );
}
