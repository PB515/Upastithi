import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { EmptyState } from '@/lib/patterns/empty-state';
import { EventDetailForm } from './event-detail-form';
import { GrantsPanel } from './grants-panel';
import { listGrants } from './actions';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: event } = await supabase.from('events').select('*').eq('id', id).single();
  if (!event) notFound();

  const grants = await listGrants(event.id);

  return (
    <main className="flex-1 p-6">
      <div className="mb-4">
        <Link href="/admin" className="text-sm underline">
          &larr; Back to events
        </Link>
      </div>

      <div className="max-w-sm rounded-[var(--radius)] border border-border p-6">
        <EventDetailForm
          eventId={event.id}
          initial={{
            name: event.name,
            event_date: event.event_date,
            location: event.location ?? '',
          }}
        />
      </div>

      <div className="mt-6 max-w-sm">
        <h2 className="mb-2 font-display text-lg">Management access</h2>
        <GrantsPanel eventId={event.id} initialGrants={grants} />
      </div>

      <div className="mt-6 max-w-sm">
        <h2 className="mb-2 font-display text-lg">Attendees</h2>
        <EmptyState
          title="No attendees yet"
          message="Share a Management access link above, then attendance marked through it will show up here."
        />
      </div>
    </main>
  );
}
