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
  const { data: attendees } = await supabase
    .from('attendees')
    .select('*')
    .eq('event_id', event.id)
    .order('name', { ascending: true });

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

      <div className="mt-6 max-w-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-display text-lg">
            Attendees{attendees && attendees.length > 0 ? ` (${attendees.length})` : ''}
          </h2>
          {attendees && attendees.length > 0 && (
            <a
              href={`/admin/events/${event.id}/export`}
              className="rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm"
            >
              Export CSV
            </a>
          )}
        </div>

        {!attendees || attendees.length === 0 ? (
          <EmptyState
            title="No attendees yet"
            message="Share a Management access link above, then attendance marked through it will show up here."
          />
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Phone</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {attendees.map((a) => (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="p-3">{a.name}</td>
                    <td className="p-3">{a.phone || 'Not set'}</td>
                    <td className="p-3">
                      {a.present ? (
                        <span className="text-green-700">Present</span>
                      ) : (
                        <span className="text-muted">Absent</span>
                      )}
                    </td>
                    <td className="p-3">{a.remarks || 'Not set'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
