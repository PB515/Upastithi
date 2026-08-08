import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyManagementAccess } from '@/lib/management-token';
import { formatEventDate } from '@/lib/format-date';
import { ManagementClient } from './management-client';
import { InstallBanner } from '@/components/install-banner';

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
  const [{ data: event }, { data: attendees }, { data: grant }] = await Promise.all([
    service.from('events').select('name, event_date').eq('id', access.eventId).single(),
    service
      .from('attendees')
      .select('id, name, phone, present, remarks')
      .eq('event_id', access.eventId)
      .order('name', { ascending: true }),
    service.from('event_access_tokens').select('label').eq('id', access.grantId).single(),
  ]);

  return (
    <main className="flex-1 p-6">
      <h1 className="font-display text-xl">{event?.name ?? 'Event'}</h1>
      <div className="mb-6">
        {event?.event_date && (
          <p className="text-sm text-muted">{formatEventDate(event.event_date)}</p>
        )}
        {grant?.label && <p className="text-sm text-muted">Access: {grant.label}</p>}
      </div>

      <InstallBanner />
      <ManagementClient token={token} initialAttendees={attendees ?? []} />
    </main>
  );
}
