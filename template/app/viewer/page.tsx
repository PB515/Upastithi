import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EventsList } from '@/components/events-list';
import { signOut } from '../login/actions';

export default async function ViewerPage() {
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

  if (staffRow?.role !== 'viewer') {
    redirect('/login?error=Not authorized for this account');
  }

  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: false });

  return (
    <main className="flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl">Events</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          Couldn&apos;t load events. Try reloading the page.
        </p>
      ) : (
        <EventsList events={events ?? []} />
      )}
    </main>
  );
}
