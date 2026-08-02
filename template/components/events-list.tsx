import Link from 'next/link';
import type { Database } from '@/lib/supabase/database.types';
import { EmptyState } from '@/lib/patterns/empty-state';
import { Plus } from '@/lib/icons';

type Event = Database['public']['Tables']['events']['Row'];

export interface EventsListProps {
  events: Event[];
  /** Row link target prefix, e.g. "/admin/events". Omit to render plain,
   * unlinked rows — used by Viewer, which doesn't have a detail page yet. */
  basePath?: string;
  /** Shows the "Create event" empty-state action. Admin only. */
  canCreate?: boolean;
}

export function EventsList({ events, basePath, canCreate }: EventsListProps) {
  if (events.length === 0) {
    return (
      <EmptyState
        title="No events yet"
        message={
          canCreate
            ? 'Create the first event to get started.'
            : 'No events have been created yet.'
        }
        action={
          canCreate ? (
            <Link
              href="/admin/events/new"
              className="inline-flex items-center gap-1 rounded-[var(--radius)] bg-accent px-3 py-2 text-sm text-accent-foreground"
            >
              <Plus className="size-4" aria-hidden /> Create event
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
      {events.map((event) => {
        const row = (
          <div className="flex flex-col gap-1 p-4">
            <span className="font-medium">{event.name}</span>
            <span className="text-sm text-muted">
              {formatEventDate(event.event_date)}
              {event.location ? ` · ${event.location}` : ''}
            </span>
          </div>
        );
        return (
          <li key={event.id}>
            {basePath ? (
              <Link href={`${basePath}/${event.id}`} className="block hover:bg-black/5">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function formatEventDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
