import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EventsList, type EventWithCount } from '@/components/events-list';
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

  const { data: rawEvents, error } = await supabase
    .from('events')
    .select('*, attendees(count)')
    .order('event_date', { ascending: false });

  const events: EventWithCount[] = (rawEvents ?? []).map((e) => {
    const { attendees, ...rest } = e as typeof e & { attendees: { count: number }[] };
    return { ...rest, attendeeCount: attendees?.[0]?.count ?? 0 };
  });

  return (
    <main className="flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl">Events</h1>
        <div className="flex items-center gap-4">
          <Link href="/viewer/reports" className="text-sm underline">
            Reports
          </Link>
          <form action={signOut}>
            <button type="submit" className="text-sm underline">
              Sign out
            </button>
          </form>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          Couldn&apos;t load events. Try reloading the page.
        </p>
      ) : (
        <EventsList events={events} />
      )}
    </main>
  );
}
