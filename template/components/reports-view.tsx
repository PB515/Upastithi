import { formatEventDate } from '@/lib/format-date';

interface Event {
  id: string;
  name: string;
  event_date: string;
}

interface AttendeeStat {
  event_id: string;
  present: boolean;
}

export function ReportsView({ events, attendees }: { events: Event[]; attendees: AttendeeStat[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted">No events yet. Reports will show up here once events exist.</p>;
  }

  const statsByEvent = new Map<string, { total: number; present: number }>();
  for (const a of attendees) {
    const s = statsByEvent.get(a.event_id) ?? { total: 0, present: 0 };
    s.total += 1;
    if (a.present) s.present += 1;
    statsByEvent.set(a.event_id, s);
  }

  const totalEvents = events.length;
  const totalAttendees = attendees.length;
  const totalPresent = attendees.filter((a) => a.present).length;
  const overallRate = totalAttendees === 0 ? 0 : Math.round((totalPresent / totalAttendees) * 100);

  const sortedEvents = [...events].sort((a, b) => (a.event_date < b.event_date ? 1 : -1));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[var(--radius)] border border-border p-4">
          <div className="font-display text-2xl">{totalEvents}</div>
          <div className="text-sm text-muted">Events</div>
        </div>
        <div className="rounded-[var(--radius)] border border-border p-4">
          <div className="font-display text-2xl">{totalAttendees}</div>
          <div className="text-sm text-muted">Total attendees</div>
        </div>
        <div className="rounded-[var(--radius)] border border-border p-4">
          <div className="font-display text-2xl">{overallRate}%</div>
          <div className="text-sm text-muted">Overall attendance</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius)] border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="p-3 font-medium">Event</th>
              <th className="p-3 font-medium">Date</th>
              <th className="p-3 font-medium">Registered</th>
              <th className="p-3 font-medium">Present</th>
              <th className="p-3 font-medium">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {sortedEvents.map((event) => {
              const stats = statsByEvent.get(event.id) ?? { total: 0, present: 0 };
              const rate = stats.total === 0 ? 0 : Math.round((stats.present / stats.total) * 100);
              return (
                <tr key={event.id} className="border-b border-border last:border-0">
                  <td className="p-3">{event.name}</td>
                  <td className="p-3">{formatEventDate(event.event_date)}</td>
                  <td className="p-3">{stats.total}</td>
                  <td className="p-3">{stats.present}</td>
                  <td className="p-3">{rate}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
