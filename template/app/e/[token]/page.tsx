import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyManagementAccess } from '@/lib/management-token';
import { formatEventDate } from '@/components/events-list';
import { setPresent, registerWalkIn } from './actions';

export default async function ManagementPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await verifyManagementAccess(token);

  if (!access) {
    return (
      <main className="flex-1 flex items-center justify-center p-6">
        <p className="max-w-sm text-center text-muted">
          This link is no longer active. Ask an event admin for a new one.
        </p>
      </main>
    );
  }

  const service = createServiceRoleClient();
  const [{ data: event }, { data: attendees }] = await Promise.all([
    service.from('events').select('name, event_date').eq('id', access.eventId).single(),
    service
      .from('attendees')
      .select('*')
      .eq('event_id', access.eventId)
      .order('name', { ascending: true }),
  ]);

  return (
    <main className="flex-1 p-6">
      <h1 className="font-display text-xl">{event?.name ?? 'Event'}</h1>
      {event?.event_date && (
        <p className="mb-6 text-sm text-muted">{formatEventDate(event.event_date)}</p>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-muted">Attendees</h2>
        {(attendees ?? []).length === 0 ? (
          <p className="text-sm text-muted">No one registered yet. Add a walk-in below.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
            {(attendees ?? []).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 p-3">
                <div>
                  <div className="font-medium">{a.name}</div>
                  {a.phone && <div className="text-sm text-muted">{a.phone}</div>}
                </div>
                {a.present ? (
                  <form action={setPresent.bind(null, token, a.id, false)} className="flex items-center gap-2">
                    <span className="text-sm text-green-700">Present</span>
                    <button type="submit" className="text-sm underline">
                      Undo
                    </button>
                  </form>
                ) : (
                  <form action={setPresent.bind(null, token, a.id, true)}>
                    <button
                      type="submit"
                      className="rounded-[var(--radius)] bg-accent px-3 py-1.5 text-sm text-accent-foreground"
                    >
                      Mark present
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Register a walk-in</h2>
        <form action={registerWalkIn.bind(null, token)} className="max-w-sm space-y-3">
          <input
            name="name"
            placeholder="Name"
            required
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
          <input
            name="phone"
            placeholder="Phone (optional)"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
          <input
            name="remarks"
            placeholder="Remarks (optional)"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
          <button
            type="submit"
            className="rounded-[var(--radius)] bg-accent px-3 py-2 text-sm text-accent-foreground"
          >
            Register and mark present
          </button>
        </form>
      </section>
    </main>
  );
}
